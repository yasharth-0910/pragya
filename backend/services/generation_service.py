"""Generation service — the citation-grounded answer layer (CLAUDE.md §4, §10).

This is the second half of the RAG pipeline: retrieval (retrieval_service) found
the relevant parent chunks; here we turn them into a grounded, cited answer.

    build_citation_prompt   query + chunks + history → the full LLM prompt
    generate_stream         prompt → Gemini → SSE token stream (async)
    extract_sources         answer text → the [Source: N] citations it used

THE HALLUCINATION GUARD is the whole point: the prompt forbids the model from
using any knowledge outside the provided context blocks, and forces a fixed
"I don't have information…" reply when the answer isn't there. That is exactly
what makes citations enforceable and faithfulness measurable with RAGAS — an
answer can only cite a block we actually retrieved.
"""

import logging
import re
from collections.abc import AsyncGenerator

import google.generativeai as genai

from config import Settings, get_settings

logger = logging.getLogger(__name__)

# The EXACT refusal string. Defined ONCE and reused in three places that must never
# drift apart: (1) the system prompt instructs the model to emit it verbatim,
# (2) the router's no-chunks guard streams it when retrieval returns nothing, and
# (3) answered-detection matches against it to set QueryLog.answered=False. A
# one-character drift would silently break exact-match tests and mislabel analytics.
NO_INFO_RESPONSE = (
    "I don't have information on this in your department's documents."
)

# How many prior turns of conversation to replay into the prompt. 4 keeps the
# context window (and free-tier token cost) bounded while preserving enough flow
# for follow-up questions like "and what about for managers?".
MAX_HISTORY_TURNS = 4


def _configure_gemini() -> Settings:
    # Configure the SDK's global API key and return settings. Called at the top of
    # every function that talks to Gemini — we do NOT rely on some earlier call
    # (e.g. embed_query) having configured the global first; ordering is fragile.
    settings = get_settings()
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return settings


# ──────────────────────────────────────────────────────────────────────────────
# Function 1: assemble the citation-enforced prompt
# ──────────────────────────────────────────────────────────────────────────────
def _dedupe_by_parent(chunks: list[dict]) -> list[dict]:
    """Drop chunks whose parent_text we've already seen, preserving order.

    Overlapping hierarchical children frequently map to the SAME parent, so the
    retrieved top-k can contain several near-identical parent blocks. Sending them
    all wastes tokens and makes the model over-cite ([Source: 1,2,3,4,5] for a
    single fact). We key on the first 200 chars of parent_text — a reliable proxy
    for a near-duplicate parent without an expensive full-string compare — and keep
    the first occurrence so block order (and thus numbering) stays stable.

    Used by BOTH build_citation_prompt (to number the blocks) and extract_sources
    (to resolve [Source: N] back to a block). They MUST dedupe identically or the
    citation numbers won't line up with the sources.
    """
    seen: set[str] = set()
    unique: list[dict] = []
    for chunk in chunks:
        key = chunk.get("payload", {}).get("parent_text", "")[:200]
        if key in seen:
            continue
        seen.add(key)
        unique.append(chunk)
    return unique


def build_citation_prompt(
    query: str,
    chunks: list[dict],
    chat_history: list[dict] | None = None,
) -> str:
    """Build the full prompt string sent to Gemini.

    Layout: system rules → (optional) recent conversation → numbered context
    blocks → the question. The block NUMBERS are load-bearing: the model is told
    to cite [Source: N], and extract_sources() later maps N back to chunks[N-1] to
    recover the real filename + page. So the numbering here and the indexing there
    must stay in lockstep (both 1-based).

    chat_history is a list of {"role", "content"} dicts in chronological order; we
    replay only the last MAX_HISTORY_TURNS so the window stays small. It must NOT
    include the current question — the caller loads history before saving the new
    user message.
    """
    # ── System instructions (these five lines are the contract; keep verbatim) ──
    # "Answer ONLY from context" is the hallucination guard — it is what makes the
    # answer faithful to retrieved sources and the citations meaningful.
    system = (
        "You are Pragya, a precise knowledge assistant.\n"
        "Answer ONLY using the provided context blocks.\n"
        "Cite every factual claim using [Source: N] where N is the context block number.\n"
        "If the answer is not in the context respond with exactly: "
        f"{NO_INFO_RESPONSE}\n"
        "Do not infer, extrapolate, or use outside knowledge."
    )

    parts: list[str] = [system]

    # ── Recent conversation (optional) ──
    if chat_history:
        # Keep only the last N turns, in order. Map our stored roles to the
        # Human/Assistant labels the model reads naturally.
        recent = chat_history[-MAX_HISTORY_TURNS:]
        history_lines = []
        for turn in recent:
            speaker = "Human" if turn.get("role") == "user" else "Assistant"
            history_lines.append(f"{speaker}: {turn.get('content', '')}")
        parts.append("Conversation so far:\n" + "\n".join(history_lines))

    # ── Numbered context blocks ──
    # Distinct parents only (overlapping children share parents). Numbering is over
    # the DEDUPED list and restarts at 1 with no gaps; extract_sources dedupes the
    # same way so [Source: N] still resolves to the right block.
    # Each block: a 1-based number, a Source line (filename + optional page), then
    # the PARENT text (the larger context chunk the LLM should reason over).
    block_texts: list[str] = []
    for i, chunk in enumerate(_dedupe_by_parent(chunks), start=1):
        payload = chunk.get("payload", {})
        filename = payload.get("source_filename", "unknown")
        page = payload.get("page_number")
        parent_text = payload.get("parent_text", "")
        # Page is None for DOCX — omit "Page X" entirely rather than print "None".
        source_line = (
            f"Source: {filename}, Page {page}" if page is not None
            else f"Source: {filename}"
        )
        block_texts.append(f"[{i}] {source_line}\n{parent_text}")
    parts.append("Context blocks:\n" + "\n\n".join(block_texts))

    # ── The question last, so the model answers it with everything above in view ──
    parts.append(f"Question: {query}\n\nAnswer:")

    return "\n\n".join(parts)


# ──────────────────────────────────────────────────────────────────────────────
# Function 2: stream the answer as Server-Sent Events
# ──────────────────────────────────────────────────────────────────────────────
async def generate_stream(
    query: str,
    chunks: list[dict],
    chat_history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream Gemini's answer token-by-token in SSE format.

    SSE ("data: …\\n\\n" frames) lets the frontend paint tokens as they arrive,
    which is what makes the product feel alive instead of hanging on a spinner.
    Two sentinels frame the stream for the client:
      • "data: [DONE]\\n\\n"  — generation finished cleanly; stop listening and
        parse the sources.
      • "data: [ERROR] …\\n\\n" — something failed mid-stream; the response is
        already sent (200 + headers) so we can't change the status code, we can
        only signal the error in-band, then stop.

    NOTE on framing: a token containing a newline technically breaks strict SSE
    (everything after the first '\\n' in the token is dropped by a spec-compliant
    parser). We keep the simple one-frame-per-token format the spec calls for; the
    [DONE] sentinel still arrives and the stream stays readable. A fully lossless
    version would emit one `data:` line per line of the token — future work.
    """
    settings = _configure_gemini()
    prompt = build_citation_prompt(query, chunks, chat_history)

    try:
        model = genai.GenerativeModel(settings.GEMINI_CHAT_MODEL)
        # Async streaming: returns an async iterator of partial responses. Run
        # natively async (not via to_thread) — the SDK has a first-class async path.
        response = await model.generate_content_async(prompt, stream=True)
        async for chunk in response:
            token = _safe_chunk_text(chunk)
            if token:
                yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as exc:  # noqa: BLE001 - in-band error signalling, see docstring
        # Includes 429 RESOURCE_EXHAUSTED on the free tier — surface it to the
        # client in-band rather than crashing the generator.
        logger.exception("Generation stream failed for query=%r", query[:80])
        yield f"data: [ERROR] {str(exc)}\n\n"
        return


def _safe_chunk_text(chunk) -> str:
    # Accessing chunk.text RAISES if the chunk carries no text part (e.g. a chunk
    # that only carries a finish reason or a safety block). Guard it so one
    # part-less chunk doesn't blow up the whole stream into an [ERROR].
    try:
        if chunk.candidates and chunk.candidates[0].content.parts:
            return chunk.text
    except (ValueError, AttributeError, IndexError):
        pass
    return ""


# ──────────────────────────────────────────────────────────────────────────────
# Function 3: recover the citations the answer actually used
# ──────────────────────────────────────────────────────────────────────────────
def extract_sources(response_text: str, chunks: list[dict]) -> list[dict]:
    """Parse [Source: N] markers from the answer into a deduplicated source list.

    Called AFTER streaming completes, on the full accumulated answer text. For each
    cited number N we look up chunks[N-1] (numbering is 1-based, matching the prompt)
    and pull the real filename + page from its payload. The result is what we persist
    in ChatMessage.sources and return to the UI.

    Deduplicated by (filename, page): if the model cites two different blocks that
    happen to be from the same page of the same file, the user should see that
    source once. A citation number outside the block range (model hallucinated an N)
    is skipped rather than crashing.

    NOTE: takes `chunks` in addition to `response_text` — it cannot resolve N → a
    real source without the block list it was numbered against.
    """
    # Dedupe identically to build_citation_prompt so N indexes the SAME block list
    # the model was shown (numbering is 1-based over the deduped parents).
    chunks = _dedupe_by_parent(chunks)

    # Find every [Source: N] (tolerating optional spaces, e.g. "[Source:3]").
    cited_numbers = [int(n) for n in re.findall(r"\[Source:\s*(\d+)\]", response_text)]

    sources: list[dict] = []
    seen: set[tuple] = set()
    for n in cited_numbers:
        idx = n - 1
        if idx < 0 or idx >= len(chunks):
            # Model cited a block number that doesn't exist — ignore it.
            continue
        payload = chunks[idx].get("payload", {})
        filename = payload.get("source_filename", "unknown")
        page = payload.get("page_number")
        key = (filename, page)
        if key in seen:
            continue
        seen.add(key)
        # Keys MUST match schemas.chat.MessageSource so the stored dict deserializes
        # straight back into that model on read.
        sources.append({"filename": filename, "page": page, "citation_number": n})

    return sources


async def generate_session_title(query: str) -> str:
    """Ask Gemini for a short title summarizing a conversation's first question.

    Best-effort by nature — the CALLER must wrap this in try/except and fall back
    to (e.g.) a truncated query, because this is a SECOND Gemini call per first
    message and is the most likely to hit the free-tier rate limit (429). A failed
    title must never cost the user the answer they already received.

    Lives in the service (not the router) so the router stays HTTP-only: no Gemini
    calls or prompt strings leak into the routing layer (CLAUDE.md §3).
    """
    settings = _configure_gemini()
    prompt = (
        f"Generate a 4-word title for a conversation starting with: {query}. "
        "Return only the title."
    )
    model = genai.GenerativeModel(settings.GEMINI_CHAT_MODEL)
    # Non-streaming: we want the whole short title at once, not token-by-token.
    response = await model.generate_content_async(prompt)
    # .strip() to drop any leading/trailing whitespace/newlines the model adds.
    return (response.text or "").strip()


def response_indicates_no_info(response_text: str) -> bool:
    # True when the model returned the fixed refusal — used to set
    # QueryLog.answered=False. Substring + case-insensitive so trailing whitespace
    # or minor casing from the model doesn't defeat the match.
    return NO_INFO_RESPONSE.lower() in (response_text or "").lower()
