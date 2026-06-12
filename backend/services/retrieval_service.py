"""Retrieval service — the RAG research core (CLAUDE.md §4, §10).

This module is the heart of the paper. It implements three retrieval pipelines
that we compare on a fixed corpus + 50 questions:

    Experiment A  "dense"          embed → dense_retrieve
    Experiment B  "hybrid"         embed → dense + sparse → RRF fusion
    Experiment C  "hybrid_rerank"  embed → dense + sparse → RRF → cross-encoder

Everything funnels through one public entry point, `retrieve(query, dept, method)`,
so the rest of the app (and the eval harness) flips between experiments with a
single string argument and never has to know the internals.

Two hard rules run through every function here:
  • Asymmetric embedding — the QUERY is embedded with task_type="retrieval_query",
    while documents were embedded (in ingestion) with "retrieval_document". Mixing
    these silently degrades retrieval; it is a classic, invisible RAG bug.
  • Department RBAC — EVERY Qdrant search is wrapped in build_department_filter().
    An HR user must never retrieve an IT document. The boundary is enforced at the
    vector-DB layer, not in application logic (CLAUDE.md §6).
"""

import asyncio
import logging
import time
import uuid

import google.generativeai as genai
# NOTE on the Qdrant API: qdrant-client 1.18 REMOVED the old `client.search(...)`
# method (and with it the NamedVector / NamedSparseVector / SearchRequest request
# objects). Searches now go through `client.query_points(query=..., using=<vector
# name>)`, which returns a QueryResponse whose `.points` are ScoredPoints. We name
# the target vector with the `using=` argument ("dense" / "sparse") instead of
# wrapping the vector in a NamedVector. SparseVector is still the way to express a
# sparse query.
from qdrant_client.models import FieldCondition, Filter, MatchValue, SparseVector
from sentence_transformers import CrossEncoder

from config import get_settings
from qdrant import build_visibility_filter, get_qdrant_client

logger = logging.getLogger(__name__)

# Task type for embedding the QUERY (not the document). This is the other half of
# the asymmetric pair whose document side lives in ingestion_service. They are kept
# separate on purpose so the two task types can never be accidentally shared.
EMBED_TASK_QUERY = "retrieval_query"

# Size of the sparse index space. Every query word is hashed into [0, 30000). Big
# enough that hash collisions between distinct words are rare; small enough to keep
# the sparse vector cheap. This must stay stable across ingestion and query, or the
# same word would land on different indices and never match.
SPARSE_INDEX_SPACE = 30000


# ──────────────────────────────────────────────────────────────────────────────
# Module-level reranker — load once, cache for the whole process lifetime.
# ──────────────────────────────────────────────────────────────────────────────
_reranker: CrossEncoder | None = None


def get_reranker() -> CrossEncoder:
    """Return the shared cross-encoder, loading it on first use only.

    The FIRST call downloads ~85MB of model weights to the HuggingFace cache and
    is slow. EVERY call after that is instant — the model stays resident in this
    module-level global. Never construct a CrossEncoder per request; the load cost
    would dominate every query and waste memory.
    """
    global _reranker
    if _reranker is None:
        _reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        logger.info("Reranker model loaded")
    return _reranker


# ──────────────────────────────────────────────────────────────────────────────
# Function 1: embed the query (Gemini, 768-d, QUERY task type)
# ──────────────────────────────────────────────────────────────────────────────
def embed_query(query: str) -> list[float]:
    """Embed a single query string into a 768-d vector for dense retrieval.

    ASYMMETRIC EMBEDDING — the critical detail: we pass task_type="retrieval_query".
    Documents were embedded with task_type="retrieval_document" during ingestion.
    gemini-embedding-001 places queries and documents into a shared space ONLY when
    each side declares its correct role. Use "retrieval_document" here and retrieval
    quality quietly drops with no error to tip you off — one of the most common
    silent RAG mistakes.

    output_dimensionality=768 must match the collection's dense vector size (the
    Matryoshka truncation used at ingestion), or Qdrant rejects the search.

    SYNCHRONOUS by design: genai.embed_content is a blocking HTTP call. `retrieve`
    wraps this in asyncio.to_thread so it doesn't stall the event loop — keeping the
    blocking call isolated in one place rather than scattering to_thread everywhere.
    """
    settings = get_settings()
    genai.configure(api_key=settings.GEMINI_API_KEY)
    # The SDK wants a fully-qualified "models/<name>" id; settings holds the bare
    # name, so prefix it if needed (same convention as ingestion_service).
    model_name = settings.GEMINI_EMBEDDING_MODEL
    if not model_name.startswith("models/"):
        model_name = f"models/{model_name}"

    result = genai.embed_content(
        model=model_name,
        content=query,
        task_type=EMBED_TASK_QUERY,
        output_dimensionality=settings.GEMINI_EMBEDDING_DIMENSIONS,
    )
    # With a SINGLE string `content`, the SDK returns {"embedding": [floats...]} —
    # already a flat list. (With a list it returns list-of-lists; we don't here.)
    return result["embedding"]


# ──────────────────────────────────────────────────────────────────────────────
# Function 2: dense retrieval — Experiment A (semantic baseline)
# ──────────────────────────────────────────────────────────────────────────────
def dense_retrieve(
    query_vector: list[float],
    query_filter,
    client,
    top_k: int = 20,
) -> list[dict]:
    """Search the "dense" named vector by cosine similarity. Experiment A baseline.

    The query_filter is NOT optional. It is the RBAC boundary (the 3-tier visibility
    filter from build_visibility_filter): a user must never see documents they lack
    access to, and that is enforced HERE, before any result is scored (CLAUDE.md §6).
    The caller passes the prebuilt Filter so the exact same access rule is shared by
    every retrieval path (chat + search).

    top_k=20 is deliberately generous: dense + sparse each contribute 20 candidates
    so RRF fusion downstream has a real pool to work with rather than a thin list.
    """
    response = client.query_points(
        collection_name=get_settings().QDRANT_COLLECTION,
        query=query_vector,
        # `using` selects WHICH named vector to search — the collection has named
        # "dense" and "sparse" vectors, so this disambiguates.
        using="dense",
        query_filter=query_filter,
        limit=top_k,
        with_payload=True,
    )
    return [
        {
            "qdrant_id": point.id,
            "score": point.score,
            "payload": point.payload,
        }
        for point in response.points
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Function 3: sparse retrieval — BM25-style keyword matching (Experiment B input)
# ──────────────────────────────────────────────────────────────────────────────
def sparse_retrieve(
    query: str,
    query_filter,
    client,
    top_k: int = 20,
) -> list[dict]:
    """Search the "sparse" named vector with a BM25-style query vector.

    WHY SPARSE AT ALL: BM25 catches EXACT keyword matches that semantic search
    misses. Abbreviations like "CL" (casual leave) or "EL" (earned leave) have no
    meaningful embedding neighbourhood — dense retrieval can't relate them to
    anything — but a keyword match finds the exact token instantly.

    SIMPLIFIED SPARSE VECTOR (see CLAUDE.md note): a production system would use
    SPLADE or FastEmbed BM25 to build learned sparse vectors. We approximate:
      • tokenize the query into lowercase words,
      • hash each unique word to a stable index in [0, SPARSE_INDEX_SPACE),
      • use term frequency (count in the query) as the value.
    This is correct enough for the research comparison and avoids pulling in another
    heavy dependency. The hashing must match whatever ingestion uses for the sparse
    side, or the indices won't line up.

    NOTE: indices in a SparseVector MUST be unique — Qdrant rejects duplicates. We
    accumulate term frequencies into a dict keyed by index FIRST, then split into
    parallel indices/values lists, so a repeated word (or a hash collision) merges
    into one entry instead of producing a duplicate index.
    """
    # Build {index: term_frequency}. Lowercase so "Leave" and "leave" collapse to
    # one term — matching is case-insensitive.
    tf_by_index: dict[int, float] = {}
    for word in query.lower().split():
        index = abs(hash(word)) % SPARSE_INDEX_SPACE
        tf_by_index[index] = tf_by_index.get(index, 0.0) + 1.0

    # Empty query (or all-whitespace) → no sparse signal. Return nothing rather than
    # sending an empty SparseVector that Qdrant would reject.
    if not tf_by_index:
        return []

    indices = list(tf_by_index.keys())
    values = list(tf_by_index.values())

    response = client.query_points(
        collection_name=get_settings().QDRANT_COLLECTION,
        # A SparseVector (indices + values) IS the query; `using="sparse"` names the
        # sparse vector as the search target.
        query=SparseVector(indices=indices, values=values),
        using="sparse",
        query_filter=query_filter,
        limit=top_k,
        with_payload=True,
    )
    return [
        {
            "qdrant_id": point.id,
            "score": point.score,
            "payload": point.payload,
        }
        for point in response.points
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Function 4: Reciprocal Rank Fusion — the fusion step of Experiment B
# ──────────────────────────────────────────────────────────────────────────────
def rrf_fusion(
    dense_results: list[dict],
    sparse_results: list[dict],
    k: int = 60,
) -> list[dict]:
    """Fuse two ranked lists into one using Reciprocal Rank Fusion.

    RRF ignores the raw scores (which aren't comparable between cosine similarity
    and BM25) and uses only RANK. Each result contributes 1 / (k + rank), where
    rank starts at 1 for the top of each list. A result's final score is the SUM of
    its contributions across both lists.

    THE KEY INSIGHT: a chunk that ranks well in BOTH dense AND sparse gets two
    contributions summed, so it floats to the top. Agreement between two different
    retrieval systems is a strong signal of relevance — that is exactly what RRF
    rewards, with no weights to tune.

    WHY k=60: the constant dampens the influence of very high ranks. With k=60, the
    gap between rank 1 (1/61) and rank 2 (1/62) is small, so no single list can
    dominate purely because one of its items happened to rank first. k=60 is the
    standard default from the original RRF paper (Cormack et al., 2009); RRF is
    parameter-free beyond this one constant.
    """
    # Accumulate fused scores keyed by qdrant_id, keeping one copy of each result.
    fused: dict = {}

    for result_list in (dense_results, sparse_results):
        # enumerate from 1 — RRF rank is 1-based (the top result is rank 1).
        for rank, result in enumerate(result_list, start=1):
            qid = result["qdrant_id"]
            contribution = 1.0 / (k + rank)
            if qid in fused:
                # Seen in the other list too — SUM the contributions (the boost).
                fused[qid]["rrf_score"] += contribution
            else:
                # First time: copy the dict so we don't mutate the caller's, and
                # seed its rrf_score.
                entry = dict(result)
                entry["rrf_score"] = contribution
                fused[qid] = entry

    # Sort by fused score, highest first. Dedup is automatic — `fused` is keyed by
    # qdrant_id, so each chunk appears once with its summed score.
    ranked = sorted(fused.values(), key=lambda r: r["rrf_score"], reverse=True)

    # Cap the pool at 40 — enough candidates for the reranker to choose from without
    # paying to cross-encode an unboundedly long list.
    return ranked[:40]


# ──────────────────────────────────────────────────────────────────────────────
# Function 5: cross-encoder rerank — the full pipeline, Experiment C
# ──────────────────────────────────────────────────────────────────────────────
def rerank(query: str, candidates: list[dict], top_n: int = 5) -> list[dict]:
    """Re-score candidates with a cross-encoder and keep the top_n.

    WHY THIS BEATS THE RETRIEVERS: dense and sparse are BI-encoders — query and
    document are embedded INDEPENDENTLY and compared by a cheap vector distance, so
    the model never sees them together. A CROSS-encoder feeds the full
    (query, document) PAIR through the transformer at once, letting attention relate
    every query token to every document token. That joint view is far more accurate
    — at a higher cost, which is why we only run it on the ~40 fused candidates, not
    the whole corpus.

    WE RERANK ON parent_text, NOT child_text: parent_text is what the LLM will
    ultimately read when generating the answer. Scoring relevance against child_text
    would optimize for a different (shorter) text than the one that actually feeds
    generation — the wrong target.
    """
    if not candidates:
        return []

    reranker = get_reranker()

    # Build (query, parent_text) pairs in the SAME order as `candidates` so the
    # i-th score maps back to the i-th candidate.
    pairs = [(query, c["payload"]["parent_text"]) for c in candidates]
    # predict() returns one relevance score per pair (higher = more relevant).
    scores = reranker.predict(pairs)

    # Attach each score to its candidate. float() because predict returns numpy
    # floats, which don't serialize cleanly to JSON later.
    for candidate, score in zip(candidates, scores):
        candidate["rerank_score"] = float(score)

    # Highest reranker score first; keep only the top_n parents for generation.
    ranked = sorted(candidates, key=lambda c: c["rerank_score"], reverse=True)
    return ranked[:top_n]


# ──────────────────────────────────────────────────────────────────────────────
# Function 6: retrieve — the single public entry point (all three experiments)
# ──────────────────────────────────────────────────────────────────────────────
async def retrieve(
    query: str,
    current_user,
    method: str = "hybrid_rerank",
    document_id: uuid.UUID | None = None,
) -> list[dict]:
    """Run one of the three retrieval pipelines and return ranked result dicts.

    method:
      • "dense"          — embed → dense_retrieve only.        (Experiment A)
      • "hybrid"         — embed → dense + sparse → RRF.       (Experiment B)
      • "hybrid_rerank"  — embed → dense + sparse → RRF →      (Experiment C,
                            cross-encoder rerank.               the default)

    current_user (a User) drives the RBAC boundary: we build the 3-tier visibility
    filter ONCE here from current_user.department_id + current_user.id and share it
    across both dense and sparse retrieval, so company/department/personal access is
    enforced identically in every branch. Both ids are stringified for the filter —
    Qdrant stored them as strings and MatchValue compares by exact type, so a
    uuid.UUID would match zero points with no error.

    document_id (optional) scopes retrieval to a single document: we AND the chunk's
    payload.document_id against the (already ANDed-then-ORed) visibility filter. This
    is AND logic — a chunk must satisfy the visibility rules AND belong to this
    document. Because the visibility filter is preserved, a user cannot reach a
    document they lack access to by passing its id; the scope only ever narrows.

    Logs the method, result count, and elapsed milliseconds for every call — this
    timing feeds the latency column of the research comparison.
    """
    start = time.perf_counter()
    client = get_qdrant_client()

    # The single RBAC filter, built once and reused by both retrievers below.
    query_filter = build_visibility_filter(
        str(current_user.department_id), str(current_user.id)
    )

    # Optional doc scoping: wrap the visibility filter in a `must` alongside a
    # document_id match. Nesting the visibility Filter inside `must` keeps its
    # OR-of-tiers intact while requiring the document_id match on top (AND).
    if document_id is not None:
        query_filter = Filter(
            must=[
                query_filter,
                FieldCondition(key="document_id", match=MatchValue(value=str(document_id))),
            ]
        )

    # embed_query is a blocking HTTP call; run it off the event loop so concurrent
    # requests aren't stalled while Gemini responds.
    query_vector = await asyncio.to_thread(embed_query, query)

    if method == "dense":
        # Experiment A — semantic baseline, no fusion, no rerank.
        results = dense_retrieve(query_vector, query_filter, client)

    elif method == "hybrid":
        # Experiment B — fuse dense + sparse with RRF.
        dense_results = dense_retrieve(query_vector, query_filter, client)
        sparse_results = sparse_retrieve(query, query_filter, client)
        results = rrf_fusion(dense_results, sparse_results)

    elif method == "hybrid_rerank":
        # Experiment C — full pipeline: fuse, then cross-encoder rerank to top 5.
        dense_results = dense_retrieve(query_vector, query_filter, client)
        sparse_results = sparse_retrieve(query, query_filter, client)
        fused = rrf_fusion(dense_results, sparse_results)
        results = rerank(query, fused)

    else:
        raise ValueError(
            f"Unknown retrieval method: {method!r}. "
            f"Expected 'dense', 'hybrid', or 'hybrid_rerank'."
        )

    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "retrieve(method=%s) → %d result(s) in %.1f ms",
        method, len(results), elapsed_ms,
    )
    return results
