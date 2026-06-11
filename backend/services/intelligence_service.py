"""Document-intelligence service — Session 6 (CLAUDE.md §9, step 5).

The "wow moment" feature: turn an already-ingested document into a structured
summary — overview, key points, action items, a coarse type, and a word count.

    get_document_text        document_id → full text, rebuilt from stored chunks
    chunk_for_summarization  long text → ~4000-word sections (map-reduce safety net)
    extract_intelligence     text → the structured dict (the core LLM step)
    run_intelligence         orchestrator run as a background task (idempotent)

Design notes that matter:
  • We rebuild the text from DocumentChunk rows already in the DB rather than
    re-parsing the uploaded file — the chunks are clean text, so it's free (no
    Gemini call, no PyMuPDF re-run).
  • word_count is computed in Python from the actual text, NOT taken from the LLM:
    models hallucinate counts. The LLM's reported number is used only as a
    last-resort fallback if the text itself is somehow empty.
  • run_intelligence owns its own DB session (get_session), because it runs as a
    FastAPI background task — the request's session is already closed by then.
    Same reason process_document opens its own session.
"""

import json
import logging

import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from database import get_session
from models.document import Document, DocumentChunk

logger = logging.getLogger(__name__)

# Above this many words we switch from one direct call to map-reduce. ~4000 words
# is roughly one typical policy-document section and fits comfortably in Gemini's
# context window with headroom for the prompt and the JSON response.
SUMMARIZATION_WORD_THRESHOLD = 4000


def _configure_gemini() -> Settings:
    # Set the SDK's global API key and hand back settings. Called at the top of
    # every Gemini-touching function — we don't assume some earlier call configured
    # the global first (mirrors generation_service._configure_gemini).
    settings = get_settings()
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return settings


# ──────────────────────────────────────────────────────────────────────────────
# Function 1: reconstruct the document text from its stored chunks
# ──────────────────────────────────────────────────────────────────────────────
async def get_document_text(document_id, db: AsyncSession) -> str:
    """Rebuild the full document text by concatenating its child chunks in order.

    We pull DocumentChunk.child_text for this document, ordered by chunk_index, and
    join with newlines. Why chunks and not the original file: ingestion already
    parsed + cleaned the document into these chunks, so reconstructing here is free
    — no file on disk to re-open, no PyMuPDF/docx call, no Gemini call.

    NOTE: child chunks carry ~20% overlap (CLAUDE.md §5), so a few sentences repeat
    across adjacent chunks. That's acceptable for summarization input; it only
    slightly inflates the raw text — and word_count is computed from this same text,
    so it stays internally consistent.
    """
    result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
    )
    chunks = result.scalars().all()
    # Join with newlines so section boundaries survive into the summarizer prompt.
    return "\n".join(chunk.child_text for chunk in chunks)


# ──────────────────────────────────────────────────────────────────────────────
# Function 2: split very long text into word-bounded sections (map-reduce input)
# ──────────────────────────────────────────────────────────────────────────────
def chunk_for_summarization(
    text: str, chunk_size_words: int = SUMMARIZATION_WORD_THRESHOLD
) -> list[str]:
    """Split text into sections of roughly `chunk_size_words` words each.

    We split on WORD boundaries (text.split()) not character boundaries, so we never
    cut a word in half. Used only as a safety net for very long documents — Gemini's
    context window is large, but a 40-page policy PDF can still overflow it, so we
    summarize section-by-section first (the "map" step) and combine after.
    """
    words = text.split()
    sections: list[str] = []
    # Walk the word list in fixed-size strides, re-joining each stride into a string.
    for start in range(0, len(words), chunk_size_words):
        section_words = words[start : start + chunk_size_words]
        sections.append(" ".join(section_words))
    return sections


# ──────────────────────────────────────────────────────────────────────────────
# Internal: one async Gemini text call (non-streaming)
# ──────────────────────────────────────────────────────────────────────────────
async def _generate(prompt: str) -> str:
    # One non-streaming Gemini call → the full text at once. Async (generate_content_async)
    # because run_intelligence is async and we must not block the event loop.
    settings = _configure_gemini()
    model = genai.GenerativeModel(settings.GEMINI_CHAT_MODEL)
    response = await model.generate_content_async(prompt)
    # response.text RAISES if the candidate has no text part (safety block, etc.).
    # Guard it so a part-less response degrades to "" instead of a 500.
    try:
        return (response.text or "").strip()
    except (ValueError, AttributeError, IndexError):
        return ""


# The extraction prompt. We ask for ONLY valid JSON (double-quoted, no markdown
# fences) so json.loads() succeeds on the first try; _parse_intelligence_json still
# defends against the model ignoring that.
_EXTRACTION_PROMPT = """Analyze this document and respond with ONLY valid JSON, no markdown fences, no explanation:
{{
  "summary": "3-5 sentence overview",
  "key_points": ["point 1", "point 2"],
  "action_items": [
    {{"text": "...", "owner": "...", "deadline": "..."}}
  ],
  "document_type": "policy|meeting_notes|technical|other",
  "word_count": 0
}}
Key points: 5-7 items maximum.
Action items: only include if genuinely present.
Owner and deadline: null if not mentioned.

Document filename: {filename}

Document text:
{text}"""

# The per-section "map" prompt — collapses each section to a few sentences before
# the final extraction reads the combined summaries.
_MAP_PROMPT = (
    "Summarize this section in 2-3 sentences capturing key facts and decisions.\n\n{section}"
)


def _strip_code_fences(raw: str) -> str:
    # Models often wrap JSON in ```json ... ``` despite being told not to. Strip a
    # leading fence (with optional language tag) and a trailing fence so json.loads
    # sees clean JSON. Conservative: only touches the outer fences.
    text = raw.strip()
    if text.startswith("```"):
        # Drop the first line (``` or ```json) and a trailing ``` if present.
        text = text.split("\n", 1)[-1] if "\n" in text else ""
        if text.rstrip().endswith("```"):
            text = text.rstrip()[: -3]
    return text.strip()


def _parse_intelligence_json(raw: str, text: str) -> dict:
    """Parse the LLM's JSON response into a normalized intelligence dict.

    Defensive by design: a parse failure must NEVER raise (run_intelligence must not
    crash the server). On JSONDecodeError we return a graceful, degraded dict — the
    raw text becomes the summary so the user still sees *something*, and the rest
    falls back to safe empties. Either way word_count is overwritten with the real
    Python count below, so we never surface the LLM's hallucinated number.
    """
    cleaned = _strip_code_fences(raw)
    try:
        data = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        # Degraded output — endpoint still responds, just with less structure.
        logger.warning("Intelligence JSON parse failed; returning degraded result")
        return {
            "summary": raw,
            "key_points": [],
            "action_items": [],
            "document_type": "other",
            "word_count": len(text.split()),
        }

    # Normalize: coerce each field to its expected type with a safe default, so the
    # DB write and the response schema get exactly the shapes they expect even if the
    # model omitted a key.
    return {
        "summary": data.get("summary") or None,
        "key_points": data.get("key_points") or [],
        "action_items": data.get("action_items") or [],
        "document_type": data.get("document_type") or "other",
        "word_count": data.get("word_count"),  # provisional — overwritten in caller
    }


# ──────────────────────────────────────────────────────────────────────────────
# Function 3: the core extraction (single call, or map-reduce for long docs)
# ──────────────────────────────────────────────────────────────────────────────
async def extract_intelligence(text: str, filename: str) -> dict:
    """Turn document text into the structured intelligence dict.

    Two paths, chosen by length:
      • < 4000 words  → one Gemini call on the full text (the common case; a typical
        policy doc or meeting note fits easily).
      • ≥ 4000 words  → MAP-REDUCE. Map: summarize each ~4000-word section to 2-3
        sentences (one call per section). Reduce: concatenate those summaries and run
        the final extraction on the combined text. This prevents context overflow on
        large documents like a 40-page policy PDF.

    word_count in the returned dict is ALWAYS computed from `text` in Python
    (len(text.split())). The LLM's own count is ignored — models hallucinate numbers
    — and is only used as a fallback if `text` is empty (nothing to count).
    """
    words = text.split()

    if len(words) < SUMMARIZATION_WORD_THRESHOLD:
        # Short document: analyze the full text directly.
        analysis_input = text
    else:
        # Long document: map each section to a short summary, then reduce.
        sections = chunk_for_summarization(text)
        logger.info(
            "Map-reduce: %d words → %d section(s) for %s", len(words), len(sections), filename
        )
        section_summaries: list[str] = []
        for section in sections:
            # Sequential, NOT gathered: the free tier caps generate_content at a few
            # RPM, so firing all sections at once would burst past the limit. Slower
            # but safe on big docs. (See gemini-free-tier-limits.)
            summary = await _generate(_MAP_PROMPT.format(section=section))
            section_summaries.append(summary)
        # Reduce: the combined section summaries become the input to final extraction.
        analysis_input = "\n\n".join(section_summaries)

    raw = await _generate(_EXTRACTION_PROMPT.format(filename=filename, text=analysis_input))
    result = _parse_intelligence_json(raw, text)

    # Overwrite with the real count from the actual text. Fall back to whatever the
    # LLM reported only if there's no text to count (e.g. empty document).
    result["word_count"] = len(text.split()) if text else result.get("word_count")
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Function 4: background-task orchestrator
# ──────────────────────────────────────────────────────────────────────────────
async def run_intelligence(document_id) -> None:
    """Generate and persist intelligence for one document, in the background.

    Opens its OWN session via get_session() — it runs as a FastAPI background task,
    so the request-scoped session from the router is already closed by the time this
    executes (the dependency's exit code runs before background tasks). This differs
    from the spec's "pass db in" on purpose; it matches process_document's precedent.

    Idempotent: if the document already has a summary, we skip and return — safe to
    call repeatedly without re-spending Gemini quota.

    On ANY exception we log the full traceback and swallow it. A background task must
    never re-raise — that would crash the worker / server.
    """
    try:
        async with get_session() as session:
            # 1. Load the document and verify it finished ingestion.
            document = await session.get(Document, document_id)
            if document is None:
                logger.warning("run_intelligence: document %s not found", document_id)
                return
            if document.status != "ready":
                logger.warning(
                    "run_intelligence: document %s not ready (status=%s); skipping",
                    document_id, document.status,
                )
                return
            # Idempotency guard: intelligence already generated → nothing to do.
            if document.summary is not None:
                logger.info(
                    "run_intelligence: document %s already has intelligence; skipping",
                    document_id,
                )
                return

            # 2. Rebuild the text from stored chunks (no re-parse, no Gemini call).
            text = await get_document_text(document_id, session)

            # 3. Extract the structured intelligence (LLM step; may map-reduce).
            result = await extract_intelligence(text, document.filename)

            # 4. Persist all five intelligence fields onto the Document row.
            document.summary = result["summary"]
            document.key_points = result["key_points"]
            document.action_items = result["action_items"]
            document.document_type = result["document_type"]
            document.word_count = result["word_count"]

            # 5. Commit — handled by get_session's context manager on clean exit.
            logger.info(
                "run_intelligence: document %s done (type=%s, %d key points, %d action items)",
                document_id,
                result["document_type"],
                len(result["key_points"]),
                len(result["action_items"]),
            )
    except Exception:  # noqa: BLE001 - background task must not crash the server
        logger.exception("run_intelligence failed for document %s", document_id)
