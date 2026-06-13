"""RAGAS evaluation harness — the paper's main result table (CLAUDE.md §10).

Compares the three retrieval pipelines on one corpus + 30 fixed questions:

    A  "dense"          dense semantic retrieval only
    B  "hybrid"         dense + sparse → RRF fusion
    C  "hybrid_rerank"  dense + sparse → RRF → cross-encoder rerank

Design — generation and scoring are DECOUPLED on purpose:

  PHASE 1 (generation)  For each question we retrieve with the given method and
                        ask Gemini for a citation-grounded answer, then persist
                        {question, answer, contexts, reference} to
                        results_<method>.json. This is the expensive, rate-limited
                        half (Gemini free tier). Results are written after every
                        question and the phase RESUMES — a 429 or crash never
                        re-burns answers already obtained (CLAUDE.md: cache results,
                        never a casual re-run loop).

  PHASE 2 (scoring)     We load the JSON and score it with RAGAS, using GROQ
                        (llama-3.1-8b-instant) as an INDEPENDENT judge so the
                        generator (Gemini) never grades its own output —
                        self-evaluation bias would weaken the paper. Scoring reads
                        from disk, so it can be re-run without re-generating.

  PHASE 3 (table)       Aggregate the three scored files into the comparison table.

Why ONLY context_precision (not faithfulness or answer_relevancy):
  • answer_relevancy needs a real embedding model. We judge with Groq (no embedding
    endpoint) and would have to fake embeddings, making the score meaningless. It
    also mostly reflects GENERATION, which is held constant across the three
    experiments (same LLM, same prompt), so it cannot separate the methods anyway.
  • faithfulness packs ALL retrieved contexts into one NLI call (~6–12k tokens). The
    Groq free tier caps a request at 6000 tokens-per-minute, so that call is rejected
    with HTTP 413; and llama-3.1-8b is too weak to emit parseable JSON for its
    statement-extraction step. Both were confirmed empirically. A paid Groq tier (or
    an OpenAI judge) would restore it — see the run notes.
  • context_precision sends ONE context per judge call, so it fits the free-tier
    budget, and it is the metric that most directly measures RETRIEVAL quality —
    exactly the axis the three experiments vary. It is the right metric to keep.

To fit the free-tier token budget AND make the comparison fair, scoring caps the
contexts to the top-SCORING_TOP_K (3) per question. Dense returns ~8 deduped
parents, hybrid ~12, rerank 5 — scoring all of them would be both a precision@k
apples-to-oranges comparison and a token blowout (each parent is ~1.5–2.4k tokens,
and the Groq free tier allows only 6000 tokens/minute). Top-3 keeps it a clean
precision@3 across all three methods while halving the per-question token cost so
the judge throttles less and drops fewer cells to NaN. The cited block is always
[Source: 1] (the top context), so the relevant context is never capped out.
"""

import asyncio
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

# The eval lives in backend/evaluation/ but imports the app's top-level modules
# (config, services, …) exactly as the rest of the backend does. Put backend/ on
# the path so `from config import …` and `from evaluation.test_questions import …`
# both resolve no matter how the script is launched.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import google.generativeai as genai  # noqa: E402
from datasets import Dataset  # noqa: E402
from langchain_groq import ChatGroq  # noqa: E402
from langchain_ollama import ChatOllama  # noqa: E402
from ragas import evaluate  # noqa: E402
from ragas.dataset_schema import SingleTurnSample  # noqa: E402
from ragas.llms import LangchainLLMWrapper  # noqa: E402
from ragas.metrics import context_precision, faithfulness  # noqa: E402
from ragas.run_config import RunConfig  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from config import get_settings  # noqa: E402
from database import get_session  # noqa: E402
from models import Document  # noqa: E402
# We reuse the generation service's OWN parent-dedupe so the contexts we score are
# byte-for-byte the context blocks the LLM was actually shown (build_citation_prompt
# dedupes internally). Scoring a different context set than the model saw would make
# faithfulness/context_precision measure the wrong thing.
from services.generation_service import _dedupe_by_parent, build_citation_prompt  # noqa: E402
from services.retrieval_service import retrieve  # noqa: E402

from evaluation.test_questions import QUESTIONS  # noqa: E402

# ── Configuration ───────────────────────────────────────────────────────────
GROQ_MODEL = "llama-3.1-8b-instant"   # independent judge — not the generator

GENERATION_SLEEP = 4   # seconds between Gemini generation calls (free-tier spacing)
BATCH_SIZE = 10        # after this many questions, take a longer breath
BATCH_PAUSE = 15       # seconds paused between batches (lets the RPM window relax)
EXPERIMENT_PAUSE = 30  # seconds between experiments A→B→C (rate-limit window reset)

# Contexts per question to score. Caps the judge's token use (the Groq free tier is
# 6000 tokens/min) AND makes the three methods comparable as precision@K.
SCORING_TOP_K = 3

# ── Faithfulness judge: a LOCAL Ollama model (no rate limits at all) ──────────
# faithfulness couldn't run on Groq free (its all-contexts call blows the 6000 TPM
# request cap, and llama-3.1-8b can't parse its JSON). A local qwen2.5:7b has no
# token limit and emits clean JSON. Independent of the Gemini generator, so still no
# self-evaluation bias — context_precision (Groq) and faithfulness (Ollama) are both
# judged by models other than the one that wrote the answers.
OLLAMA_MODEL = "qwen2.5:7b"
FAITHFULNESS_TOP_K = 2        # contexts per question — keeps the prompt small for a local 7B
FAITHFULNESS_TIMEOUT = 300    # HARD per-question wall (asyncio.wait_for); abandon → NaN, continue
# qwen2.5:7b supports a 32k window, but Ollama defaults to ~4k — a top-2 prompt of two
# ~2k-token parents overflows it, truncating the input and sending the model into a
# runaway generation that never returns. Set the window wide enough for the whole prompt,
# and cap the OUTPUT so even a degenerate generation terminates instead of spinning at 100% CPU.
OLLAMA_NUM_CTX = 8192
OLLAMA_NUM_PREDICT = 2048

# RAGAS drives its judge calls itself (we cannot sleep between them). On the Groq free
# tier the binding limit is 6000 tokens/MINUTE, so we run the judge strictly
# sequentially (one worker) — back-to-back calls then self-throttle near the limit —
# and lean on RAGAS's tenacity retry/backoff to absorb any 429 that still slips
# through. This is slow but reliable; scoring reads from disk, so it is re-runnable.
#
# JUDGE_TIMEOUT is the per-job ceiling. It MUST be larger than a 429's back-off wait,
# or a job that's legitimately waiting out a rate limit gets killed as a TimeoutError
# (the failure mode we saw on the exhausted key). With a FRESH per-method key the only
# limit hit is the per-MINUTE one (waits of seconds), so 300s leaves ample headroom.
JUDGE_WORKERS = 1
JUDGE_TIMEOUT = 300
JUDGE_MAX_RETRIES = 12
JUDGE_MAX_WAIT = 90

GENERATION_RETRY_WAIT = 65  # seconds to wait once on a Gemini 429 before retrying

METHODS = ["dense", "hybrid", "hybrid_rerank"]
METHOD_LABELS = {
    "dense": "Dense (A)",
    "hybrid": "Hybrid (B)",
    "hybrid_rerank": "Hybrid+Rerank(C)",
}

RESULTS_DIR = Path(__file__).resolve().parent


# ──────────────────────────────────────────────────────────────────────────────
# Small JSON helpers — the result files are the durable record of every run.
# ──────────────────────────────────────────────────────────────────────────────
def _results_path(method: str) -> Path:
    return RESULTS_DIR / f"results_{method}.json"


def _load_rows(path: Path) -> list[dict]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


def _save_rows(path: Path, rows_by_id: dict[int, dict]) -> None:
    # Always write the whole list (sorted by question id) — appending into a JSON
    # array isn't atomic/safe, and rewriting 30 small rows is trivial. Writing after
    # every question is what makes the phase resumable.
    ordered = [rows_by_id[i] for i in sorted(rows_by_id)]
    path.write_text(json.dumps(ordered, indent=2, ensure_ascii=False), encoding="utf-8")


def _is_rate_limit(exc: Exception) -> bool:
    text = str(exc).lower()
    return "429" in text or "resource_exhausted" in text or "rate" in text and "limit" in text


def _safe_response_text(response) -> str:
    # response.text RAISES if the candidate carries no text part (safety block /
    # finish-reason-only). Guard it so one odd response doesn't crash the phase.
    try:
        if response.candidates and response.candidates[0].content.parts:
            return response.text
    except (ValueError, AttributeError, IndexError):
        pass
    return ""


# ──────────────────────────────────────────────────────────────────────────────
# Find the test department — the one the Infovance corpus was uploaded under.
# ──────────────────────────────────────────────────────────────────────────────
async def _find_test_department():
    """Return the department_id that owns the most documents (= the test corpus).

    The eval doesn't hard-code a department: it picks whichever one has the most
    documents, which is where the Infovance corpus lives. We then build a mock
    'current_user' in that department with role='admin' so the retrieval visibility
    filter (CLAUDE.md §6) admits the corpus exactly as a real query would.
    """
    async with get_session() as session:
        rows = (
            await session.execute(
                select(Document.department_id, func.count(Document.id)).group_by(
                    Document.department_id
                )
            )
        ).all()
    if not rows:
        raise RuntimeError("No documents found in any department — nothing to evaluate.")
    top_department_id, doc_count = max(rows, key=lambda r: r[1])
    print(f"Test department: {top_department_id} ({doc_count} documents)")
    return top_department_id


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 1 — generation (Gemini), one method over all 30 questions, resumable.
# ──────────────────────────────────────────────────────────────────────────────
async def run_generation(method: str) -> None:
    if method not in METHODS:
        raise ValueError(f"Unknown method {method!r}; expected one of {METHODS}.")

    settings = get_settings()
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(settings.GEMINI_CHAT_MODEL)

    path = _results_path(method)
    rows_by_id: dict[int, dict] = {r["id"]: r for r in _load_rows(path)}
    # 'done' = already answered, or skipped because retrieval genuinely found nothing.
    # rate_limited rows are intentionally NOT done, so a re-run retries them.
    done = {
        r["id"]
        for r in rows_by_id.values()
        if r.get("answered") is True or r.get("skipped_reason") == "no_chunks"
    }

    department_id = await _find_test_department()
    # Mock user: department drives RBAC; a random id satisfies the personal-tier
    # filter (it will match no personal docs, which is correct — there are none here);
    # role='admin' mirrors how the eval is meant to be run.
    mock_user = SimpleNamespace(department_id=department_id, id=uuid4(), role="admin")

    print(f"\n=== PHASE 1 — generation [{method}] — {len(done)}/30 already done ===")
    processed = 0
    for q in QUESTIONS:
        qid = q["id"]
        if qid in done:
            continue

        start = time.perf_counter()
        chunks = await retrieve(q["question"], mock_user, method=method)

        if not chunks:
            # Retrieval found nothing → no generation, no RAGAS row. Log honestly.
            rows_by_id[qid] = {
                **_base_row(q),
                "answer": "",
                "contexts": [],
                "answered": False,
                "skipped_reason": "no_chunks",
                "response_time_ms": round((time.perf_counter() - start) * 1000, 1),
            }
            _save_rows(path, rows_by_id)
            print(f"Q{qid}/30 [{method}] ✗ no chunks retrieved — {q['source_doc']}")
            processed += 1
            continue

        # Contexts = exactly the parent blocks build_citation_prompt will number, so
        # what we score is what the model saw. Dedupe collapses overlapping children
        # that share a parent (also keeps the judge-call count bounded).
        deduped = _dedupe_by_parent(chunks)
        contexts = [c.get("payload", {}).get("parent_text", "") for c in deduped]
        prompt = build_citation_prompt(q["question"], chunks, [])

        answer, skipped_reason = await _generate_with_retry(model, prompt)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

        if skipped_reason:
            rows_by_id[qid] = {
                **_base_row(q),
                "answer": "",
                "contexts": contexts,
                "answered": False,
                "skipped_reason": skipped_reason,
                "response_time_ms": elapsed_ms,
            }
            _save_rows(path, rows_by_id)
            print(f"Q{qid}/30 [{method}] ✗ {skipped_reason} — {q['source_doc']}")
        else:
            rows_by_id[qid] = {
                **_base_row(q),
                "answer": answer,
                "contexts": contexts,
                "answered": True,
                "response_time_ms": elapsed_ms,
            }
            _save_rows(path, rows_by_id)
            print(f"Q{qid}/30 [{method}] ✓ {q['source_doc']} — {elapsed_ms:.0f}ms, {len(contexts)} ctx")

        processed += 1
        # Free-tier spacing between calls, plus a longer pause every BATCH_SIZE.
        await asyncio.sleep(GENERATION_SLEEP)
        if processed % BATCH_SIZE == 0:
            print(f"--- Batch complete, pausing {BATCH_PAUSE}s ---")
            await asyncio.sleep(BATCH_PAUSE)

    answered = sum(1 for r in rows_by_id.values() if r.get("answered"))
    print(f"=== [{method}] generation done — {answered}/{len(rows_by_id)} answered ===")


def _base_row(q: dict) -> dict:
    # The question-identity fields every result row carries, scored or not.
    return {
        "id": q["id"],
        "question": q["question"],
        "ground_truth": q["ground_truth"],
        "source_doc": q["source_doc"],
        "category": q["category"],
    }


async def _generate_with_retry(model, prompt: str) -> tuple[str, str | None]:
    """Call Gemini once, retry once on 429, then give up.

    Returns (answer, skipped_reason). skipped_reason is None on success, or
    'rate_limited' if a 429 survived the single retry. One rate limit must never
    crash the whole experiment — we record it and move on.
    """
    for attempt in range(2):
        try:
            # generate_content is a blocking HTTP call; keep it off the event loop.
            response = await asyncio.to_thread(model.generate_content, prompt)
            return _safe_response_text(response), None
        except Exception as exc:  # noqa: BLE001 - we classify below
            if _is_rate_limit(exc) and attempt == 0:
                print(f"   429 — waiting {GENERATION_RETRY_WAIT}s then retrying once…")
                await asyncio.sleep(GENERATION_RETRY_WAIT)
                continue
            if _is_rate_limit(exc):
                return "", "rate_limited"
            # A non-rate-limit error is a real bug — surface it.
            raise
    return "", "rate_limited"


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 2 — scoring (Groq judge), reads results_<method>.json, writes scores back.
# ──────────────────────────────────────────────────────────────────────────────
def _judge_keys() -> list[str]:
    """Return the Groq judge keys to use, preferring the FRESH extra accounts.

    Each key is a separate Groq account with its own 500k tokens/day budget. If the
    extra keys (GROQ_API_KEY_2 / _3) are set we use ONLY those — the original
    GROQ_API_KEY was spent on an earlier scoring pass today and is depleted, so
    round-robining onto it would just stall a method. Round-robin over these per
    method (dense→#1, hybrid→#2, rerank→#1) keeps the heavy experiments on distinct
    un-exhausted accounts. Falls back to the original key only if no extras are set.
    """
    s = get_settings()
    extras = [k for k in (s.GROQ_API_KEY_2, s.GROQ_API_KEY_3) if k]
    if extras:
        return extras
    if s.GROQ_API_KEY:
        return [s.GROQ_API_KEY]
    raise RuntimeError("No GROQ_API_KEY* set in .env — cannot score.")


def score_method(method: str, api_key: str | None = None) -> None:
    settings = get_settings()
    api_key = api_key or settings.GROQ_API_KEY
    if not api_key:
        raise RuntimeError("No Groq API key provided — set GROQ_API_KEY in .env.")

    path = _results_path(method)
    rows = _load_rows(path)
    if not rows:
        raise RuntimeError(f"No results to score for {method!r}; run generation first.")

    # RESUME: score only rows that are answerable AND not already scored. The Groq
    # free tier's 500k tokens/DAY cap means a full pass can run out of daily budget
    # mid-way (or across the 3 experiments); re-running --score the next day must
    # pick up exactly where it left off and never re-burn cells already scored.
    already = sum(1 for r in rows if r.get("context_precision_score") is not None)
    scorable = [
        r
        for r in rows
        if r.get("answered")
        and r.get("answer")
        and r.get("contexts")
        and r.get("context_precision_score") is None
    ]
    print(
        f"\n=== PHASE 2 — scoring [{method}] — {len(scorable)} to score, "
        f"{already} already scored (resume) ==="
    )
    if not scorable:
        print(f"All scorable rows for {method!r} already scored; skipping.")
        return

    # RAGAS 0.2.0 column names (verified): user_input / response /
    # retrieved_contexts / reference — NOT question/answer/contexts/ground_truth.
    # Contexts capped to top-K: bounds judge token use and makes this precision@K.
    dataset = Dataset.from_dict(
        {
            "user_input": [r["question"] for r in scorable],
            "response": [r["answer"] for r in scorable],
            "retrieved_contexts": [r["contexts"][:SCORING_TOP_K] for r in scorable],
            "reference": [r["ground_truth"] for r in scorable],
        }
    )

    judge_llm = ChatGroq(model=GROQ_MODEL, api_key=api_key, temperature=0)
    run_config = RunConfig(
        timeout=JUDGE_TIMEOUT,
        max_workers=JUDGE_WORKERS,
        max_retries=JUDGE_MAX_RETRIES,
        max_wait=JUDGE_MAX_WAIT,
    )

    # context_precision (LLMContextPrecisionWithReference) is LLM-only — no embeddings.
    result = evaluate(
        dataset,
        metrics=[context_precision],
        llm=judge_llm,
        run_config=run_config,
        raise_exceptions=False,  # a single judge failure → NaN for that cell, not a crash
    )

    # to_pandas() gives one row per sample with a column per metric. We join scores
    # back to questions by user_input (the question text), NOT by row position — if
    # RAGAS's worker pool ever returned results in completion order, a positional zip
    # would silently attach every score to the wrong question with no error. All 30
    # questions are unique, so the text is a safe key.
    df = result.to_pandas()
    score_by_question = {row["user_input"]: row for _, row in df.iterrows()}
    rows_by_id = {r["id"]: r for r in rows}
    for scored_row in scorable:
        metrics_row = score_by_question.get(scored_row["question"])
        if metrics_row is None:
            continue  # defensive: a question that didn't come back from RAGAS
        rid = scored_row["id"]
        rows_by_id[rid]["context_precision_score"] = _nan_to_none(metrics_row.get("context_precision"))

    _save_rows(path, rows_by_id)

    p_mean = _mean([r.get("context_precision_score") for r in rows_by_id.values()])
    scored_n = sum(1 for r in rows_by_id.values() if r.get("context_precision_score") is not None)
    print(f"=== [{method}] scored — context_precision {_fmt(p_mean)} ({scored_n}/{len(rows_by_id)} cells total) ===")


def _nan_to_none(value) -> float | None:
    # pandas yields NaN for a metric that errored out; JSON can't hold NaN cleanly,
    # and averaging must skip it, so normalise to None.
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 2b — faithfulness scoring via a LOCAL Ollama model (no rate limits).
# ──────────────────────────────────────────────────────────────────────────────
class _RagasChatOllama(ChatOllama):
    """ChatOllama patched for ragas + langchain-ollama 0.2.3 compatibility.

    langchain-ollama 0.2.3's `_chat_params` spreads any leftover kwargs FLAT into the
    ollama client's chat() call, but that client only accepts sampling params inside
    its `options` dict. ragas passes `temperature` and `n` as runtime kwargs, so they
    leak through and the async chat() raises `TypeError: ... unexpected keyword
    argument 'temperature'` — every faithfulness cell silently becomes NaN. We strip
    those two kwargs here; the constructor's temperature=0 already lives in `options`,
    so determinism is preserved.
    """

    def _chat_params(self, messages, stop=None, **kwargs):
        kwargs.pop("temperature", None)
        kwargs.pop("n", None)
        return super()._chat_params(messages, stop, **kwargs)


def _faithfulness_judge() -> LangchainLLMWrapper:
    # Local Ollama judge, wrapped for ragas. num_ctx must hold the whole prompt (two
    # ~2k-token parents + the NLI template) or Ollama truncates and the model runs away;
    # num_predict bounds the output so a degenerate generation still terminates.
    rc = RunConfig(timeout=FAITHFULNESS_TIMEOUT, max_workers=1, max_retries=1, max_wait=5)
    return LangchainLLMWrapper(
        _RagasChatOllama(
            model=OLLAMA_MODEL,
            temperature=0,
            num_ctx=OLLAMA_NUM_CTX,
            num_predict=OLLAMA_NUM_PREDICT,
        ),
        run_config=rc,
    )


async def _score_faithfulness_async(method: str) -> None:
    path = _results_path(method)
    rows = _load_rows(path)
    if not rows:
        raise RuntimeError(f"No results for {method!r}; run generation first.")

    rows_by_id = {r["id"]: r for r in rows}
    # RESUME: skip questions already scored; crash-safe writes after each one. A local
    # 7B at ~2 min/question means ~3h for 90 — being resumable lets it be stopped and
    # restarted freely.
    todo = [
        r
        for r in rows
        if r.get("answered")
        and r.get("answer")
        and r.get("contexts")
        and r.get("faithfulness_score") is None
    ]
    done = sum(1 for r in rows if r.get("faithfulness_score") is not None)
    print(f"\n=== faithfulness [{method}] — {len(todo)} to score, {done} already done (resume) ===")
    if not todo:
        print(f"All faithfulness cells for {method!r} already scored; skipping.")
        return

    # One shared judge for the whole method. faithfulness.llm is set per call below
    # (it's a module-level singleton, so we set it once here).
    faithfulness.llm = _faithfulness_judge()

    for r in todo:
        sample = SingleTurnSample(
            user_input=r["question"],
            response=r["answer"],
            # Cap contexts: faithfulness packs them all into one NLI prompt, and a
            # local 7B handles a small prompt far more reliably.
            retrieved_contexts=r["contexts"][:FAITHFULNESS_TOP_K],
        )
        start = time.perf_counter()
        try:
            # HARD timeout: single_turn_ascore bypasses ragas's Executor, so the
            # RunConfig timeout does NOT apply to it. Without this wait_for, a runaway
            # local generation hangs the whole run forever (it did, on a big-context
            # question). On timeout we abandon the cell as NaN and move on.
            score = await asyncio.wait_for(
                faithfulness.single_turn_ascore(sample), timeout=FAITHFULNESS_TIMEOUT
            )
        except (Exception, asyncio.TimeoutError) as exc:  # noqa: BLE001 - one bad cell must not kill the run
            score = float("nan")
            print(f"Q{r['id']}/30 [{method}] faithfulness=ERROR {type(exc).__name__}: {str(exc)[:80]}")
        rows_by_id[r["id"]]["faithfulness_score"] = _nan_to_none(score)
        _save_rows(path, rows_by_id)  # write after EVERY question (crash-safe)
        elapsed = time.perf_counter() - start
        val = rows_by_id[r["id"]]["faithfulness_score"]
        print(f"Q{r['id']}/30 [{method}] faithfulness={_fmt(val) if val is not None else 'NaN'} ({elapsed:.0f}s)")

    scored = sum(1 for r in rows_by_id.values() if r.get("faithfulness_score") is not None)
    mean = _mean([r.get("faithfulness_score") for r in rows_by_id.values()])
    print(f"=== faithfulness [{method}] done — mean {_fmt(mean)} ({scored}/{len(rows_by_id)} cells) ===")


def score_faithfulness(method: str) -> None:
    asyncio.run(_score_faithfulness_async(method))


def score_faithfulness_all() -> None:
    for method in METHODS:
        score_faithfulness(method)


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 3 — the comparison table (and final_results.json).
# ──────────────────────────────────────────────────────────────────────────────
def _mean(values: list) -> float | None:
    nums = [v for v in values if isinstance(v, (int, float))]
    return sum(nums) / len(nums) if nums else None


def _fmt(value: float | None) -> str:
    return f"{value:.2f}" if value is not None else " n/a"


def print_table() -> None:
    summary: dict[str, dict] = {}
    for method in METHODS:
        rows = _load_rows(_results_path(method))
        faith = _mean([r.get("faithfulness_score") for r in rows])
        prec = _mean([r.get("context_precision_score") for r in rows])
        # Average across the metrics that are present (so the table is meaningful
        # even before faithfulness has been scored).
        avg = _mean([v for v in (faith, prec) if v is not None])
        summary[method] = {
            "faithfulness": faith,
            "context_precision": prec,
            "average": avg,
            "answered": sum(1 for r in rows if r.get("answered")),
            "faithfulness_scored": sum(1 for r in rows if r.get("faithfulness_score") is not None),
            "context_precision_scored": sum(1 for r in rows if r.get("context_precision_score") is not None),
            "total": len(rows),
        }

    print()
    print(f"  Faithfulness: RAGAS / local Ollama {OLLAMA_MODEL} (top-{FAITHFULNESS_TOP_K})")
    print(f"  Ctx Precision: RAGAS / Groq {GROQ_MODEL} (top-{SCORING_TOP_K})")
    print("╔══════════════════╦═════════════╦═══════════════╦══════════╗")
    print("║ Method           ║ Faithfulness║ Ctx Precision ║   Avg    ║")
    print("╠══════════════════╬═════════════╬═══════════════╬══════════╣")
    for method in METHODS:
        s = summary[method]
        print(
            f"║ {METHOD_LABELS[method]:<16} ║    {_fmt(s['faithfulness'])}     "
            f"║     {_fmt(s['context_precision'])}      ║   {_fmt(s['average'])}   ║"
        )
    print("╚══════════════════╩═════════════╩═══════════════╩══════════╝")

    # Best method = highest average across the available metrics.
    ranked = [m for m in METHODS if summary[m]["average"] is not None]
    if ranked:
        best = max(ranked, key=lambda m: summary[m]["average"])
        print(f"\nBest method (by avg): {METHOD_LABELS[best]} (avg {_fmt(summary[best]['average'])})")

    # Improvement A → C, per metric (only where both ends are present).
    a, c = summary["dense"], summary["hybrid_rerank"]
    for metric, name in (("faithfulness", "Faithfulness"), ("context_precision", "Ctx Precision")):
        if a[metric] is not None and c[metric] is not None:
            print(f"Improvement A→C ({name}): {c[metric] - a[metric]:+.2f}")

    print("\nScored per experiment (faithfulness / context_precision):")
    for method in METHODS:
        s = summary[method]
        print(
            f"  {METHOD_LABELS[method]:<16}: answered {s['answered']}/{s['total']}, "
            f"faith {s['faithfulness_scored']}/{s['answered']}, "
            f"ctx_prec {s['context_precision_scored']}/{s['answered']}"
        )

    print(f"\nGenerator:    Gemini {get_settings().GEMINI_CHAT_MODEL}")
    print(f"Faithfulness: local Ollama {OLLAMA_MODEL}  (independent of generator)")
    print(f"Ctx Precision: Groq {GROQ_MODEL}  (independent of generator)")
    print("Both judges differ from the generator → no self-evaluation bias.")

    final_path = RESULTS_DIR / "final_results.json"
    final_path.write_text(
        json.dumps(
            {
                "generator_model": get_settings().GEMINI_CHAT_MODEL,
                "faithfulness_judge": f"ollama:{OLLAMA_MODEL}",
                "context_precision_judge": f"groq:{GROQ_MODEL}",
                "metrics": [f"faithfulness@{FAITHFULNESS_TOP_K}", f"context_precision@{SCORING_TOP_K}"],
                "results": summary,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(f"\nSaved → {final_path}")


# ──────────────────────────────────────────────────────────────────────────────
# Orchestration — A → B → C generation, then score all, then the table.
# ──────────────────────────────────────────────────────────────────────────────
def run_all() -> None:
    """Full pipeline: generate A,B,C (async, paused between), score all, print table.

    Each generation phase gets its OWN event loop via asyncio.run, and scoring runs
    in plain sync code afterwards — RAGAS's evaluate() drives its own event loop
    internally and must not be called from inside a running loop.
    """
    for i, method in enumerate(METHODS):
        asyncio.run(run_generation(method))
        if i < len(METHODS) - 1:
            print(f"\n--- Experiment complete, pausing {EXPERIMENT_PAUSE}s before next ---")
            time.sleep(EXPERIMENT_PAUSE)

    for method in METHODS:
        score_method(method)

    print_table()


def score_all() -> None:
    # Assign each experiment its own Groq key (round-robin over the available keys),
    # so one account's 500k/day cap can't stall the whole comparison. With 2–3 keys
    # the heavy experiments (dense, hybrid) land on distinct fresh accounts.
    keys = _judge_keys()
    print(f"Scoring with {len(keys)} Groq key(s), one per experiment (round-robin).")
    for i, method in enumerate(METHODS):
        key = keys[i % len(keys)]
        print(f"  → {METHOD_LABELS[method]} uses key #{(i % len(keys)) + 1}")
        score_method(method, api_key=key)
