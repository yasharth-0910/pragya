"""Qdrant vector-DB client and collection setup.

Owns the shared Qdrant client, the one-time collection bootstrap (named dense +
sparse vectors for hybrid search), and the department filter that enforces RBAC
at the vector-DB layer. All Qdrant access in the project goes through here.
"""

import logging

from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    SparseIndexParams,
    SparseVector,
    SparseVectorParams,
    VectorParams,
)

from config import get_settings

# Use a logger (not print) so log level / formatting / sinks are controllable
# centrally rather than spraying stdout.
logger = logging.getLogger(__name__)

# Module-level singleton. QdrantClient is thread- and async-safe, so one shared
# instance is correct — no pool or per-request clients needed.
_client: QdrantClient | None = None


def get_qdrant_client() -> QdrantClient:
    # Lazily create the client on first use, then reuse it for the process life.
    global _client
    if _client is None:
        settings = get_settings()
        _client = QdrantClient(url=settings.QDRANT_URL)
        logger.info("Initialized Qdrant client at %s", settings.QDRANT_URL)
    return _client


async def create_collection() -> None:
    """Create the `pragya_docs` collection with named dense + sparse vectors.

    Two things MUST be correct or hybrid search silently breaks later:
      1. `vectors_config` is a dict keyed by the string "dense" → VectorParams
         (a NAMED vector), not a bare VectorParams.
      2. `sparse_vectors_config` is a SEPARATE argument (not merged into
         vectors_config), using SparseVectorParams/SparseIndexParams.
    """
    settings = get_settings()
    client = get_qdrant_client()

    # NOTE: create_collection is async def, but the QdrantClient calls below are
    # synchronous and called directly (no asyncio.to_thread). Acceptable at this
    # scale — switch to AsyncQdrantClient if Qdrant calls become a bottleneck.
    try:
        client.create_collection(
            collection_name=settings.QDRANT_COLLECTION,
            vectors_config={
                # Named dense vector. 768 dims = Matryoshka truncation of
                # gemini-embedding-001's default 3072 (keeps quality, smaller index).
                "dense": VectorParams(
                    size=settings.GEMINI_EMBEDDING_DIMENSIONS,
                    distance=Distance.COSINE,
                    on_disk=False,
                ),
            },
            sparse_vectors_config={
                # Named sparse vector for BM25 keyword matching (hybrid search).
                # Kept in RAM (on_disk=False) for retrieval speed.
                "sparse": SparseVectorParams(
                    index=SparseIndexParams(on_disk=False),
                ),
            },
        )

        # Index the fields the RBAC filters match on so each query is an O(1)
        # lookup, not an O(n) scan of every point. department_id (legacy) plus the
        # two 3-tier fields (visibility, uploaded_by) used by build_visibility_filter.
        for field in ("department_id", "visibility", "uploaded_by"):
            client.create_payload_index(
                collection_name=settings.QDRANT_COLLECTION,
                field_name=field,
                field_schema=PayloadSchemaType.KEYWORD,
            )

        logger.info(
            "Created Qdrant collection '%s' (dense %dd cosine + sparse BM25)",
            settings.QDRANT_COLLECTION,
            settings.GEMINI_EMBEDDING_DIMENSIONS,
        )
    except Exception as exc:
        # Collection already exists → expected on every restart. Log info (not
        # error) and return silently.
        if _is_already_exists(exc):
            logger.info(
                "Qdrant collection '%s' already exists; skipping creation",
                settings.QDRANT_COLLECTION,
            )
            return
        # Anything else is a real failure — log and re-raise.
        logger.error(
            "Failed to create Qdrant collection '%s': %s",
            settings.QDRANT_COLLECTION,
            exc,
        )
        raise


def _is_already_exists(exc: Exception) -> bool:
    # Qdrant signals an existing collection differently across versions/transports
    # (HTTP 409 vs a ValueError message); match both so restarts stay quiet.
    if isinstance(exc, UnexpectedResponse) and exc.status_code == 409:
        return True
    return "already exists" in str(exc).lower()


def build_department_filter(department_id: str) -> Filter:
    # Legacy single-level RBAC filter (department only). Superseded by
    # build_visibility_filter for the 3-tier model; kept for reference / any
    # department-scoped admin tooling.
    return Filter(
        must=[
            FieldCondition(
                key="department_id",
                match=MatchValue(value=department_id),
            )
        ]
    )


def build_visibility_filter(department_id: str, user_id: str) -> Filter:
    """THE RBAC boundary for the 3-tier visibility model (CLAUDE.md §6).

    A chunk is retrievable if ANY of three tiers grants access, expressed as a
    Qdrant `should` (OR) of three nested `must` (AND) sub-filters:

      • company    — visibility == "company"            (any department)
      • department — visibility == "department" AND department_id == caller's dept
      • personal   — visibility == "personal"  AND uploaded_by  == caller's id

    Every retrieval query (chat + search) goes through this, so access control is
    enforced at the vector-DB layer, not in application logic. department_id and
    user_id MUST be str — payloads stored them stringified and MatchValue compares
    by exact type, so a uuid.UUID would match zero points with no error.

    NOTE: this intentionally has no admin branch — an admin is scoped to their own
    department for *retrieval* (the literal 3-tier spec). Admin's broader reach over
    department docs is a listing/intelligence concern (can_access_document), not a
    retrieval one.
    """
    return Filter(
        should=[
            Filter(
                must=[
                    FieldCondition(key="visibility", match=MatchValue(value="company")),
                ]
            ),
            Filter(
                must=[
                    FieldCondition(key="visibility", match=MatchValue(value="department")),
                    FieldCondition(key="department_id", match=MatchValue(value=department_id)),
                ]
            ),
            Filter(
                must=[
                    FieldCondition(key="visibility", match=MatchValue(value="personal")),
                    FieldCondition(key="uploaded_by", match=MatchValue(value=user_id)),
                ]
            ),
        ]
    )
