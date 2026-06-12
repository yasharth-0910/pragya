"""Meeting transcript analysis service.

Single Gemini call that returns a structured JSON object. The prompt is
deliberately strict about JSON format to reduce parse failures; the safe_parse
helper strips markdown fences and falls back to a minimal valid response so the
router always has something to return to the caller.
"""

import json
import logging
import re

import google.generativeai as genai

from config import get_settings
from schemas.meeting import MeetingActionItem, MeetingResponse

logger = logging.getLogger(__name__)

# Transcripts longer than this word count are truncated before sending to Gemini.
# ~6000 words ≈ 8000 tokens, well within the flash context window and the free
# tier's per-request limit while leaving room for the structured output.
_MAX_WORDS = 6_000

_PROMPT_TEMPLATE = """Analyze the following meeting transcript and return a JSON object.

The JSON MUST have exactly these keys:
- "summary": string — 2-4 sentence overview of what was discussed and decided
- "decisions": array of strings — concrete decisions made (empty array if none)
- "action_items": array of objects, each with:
    "text": string (what needs to be done),
    "owner": string or null (who is responsible),
    "deadline": string or null (when, e.g. "Friday" or "2026-06-20"),
    "priority": one of "high", "medium", "low"
- "participants": array of strings — names or roles mentioned as present
- "duration_estimate": string or null — estimated meeting length if inferable
- "follow_up_questions": array of strings — open questions that still need answers

Return ONLY the JSON object. No markdown fences, no extra text.

{title_line}Transcript:
{transcript}"""


def _configure_gemini():
    settings = get_settings()
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return settings


def _safe_parse(raw: str, title: str | None) -> MeetingResponse:
    """Strip markdown fences, parse JSON, validate with Pydantic.

    Falls back to a minimal MeetingResponse rather than raising, so the endpoint
    never 500s purely because of a JSON formatting slip from the model.
    """
    # Strip ```json ... ``` or ``` ... ``` fences if the model added them anyway.
    text = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        action_items = [
            MeetingActionItem(**item) if isinstance(item, dict) else MeetingActionItem(text=str(item))
            for item in data.get("action_items", [])
        ]
        return MeetingResponse(
            summary=str(data.get("summary", "Summary not available.")),
            decisions=[str(d) for d in data.get("decisions", [])],
            action_items=action_items,
            participants=[str(p) for p in data.get("participants", [])],
            duration_estimate=data.get("duration_estimate") or None,
            follow_up_questions=[str(q) for q in data.get("follow_up_questions", [])],
        )
    except Exception:
        logger.exception("Failed to parse meeting response JSON; returning fallback")
        return MeetingResponse(
            summary="Could not parse the model response. Please try again.",
            decisions=[],
            action_items=[],
            participants=[],
            duration_estimate=None,
            follow_up_questions=[],
        )


async def process_transcript(transcript: str, title: str | None) -> MeetingResponse:
    """Send the transcript to Gemini and return structured meeting data."""
    settings = _configure_gemini()

    # Truncate if the transcript is very long to stay within free-tier limits.
    words = transcript.split()
    truncated = False
    if len(words) > _MAX_WORDS:
        transcript = " ".join(words[:_MAX_WORDS])
        truncated = True

    title_line = f'Meeting title: "{title}"\n\n' if title else ""
    prompt = _PROMPT_TEMPLATE.format(title_line=title_line, transcript=transcript)

    model = genai.GenerativeModel(settings.GEMINI_CHAT_MODEL)
    # Non-streaming: we need the complete JSON before we can parse it.
    response = await model.generate_content_async(prompt)
    raw = (response.text or "").strip()

    result = _safe_parse(raw, title)

    # Append a note to the summary when we truncated the input so the user knows.
    if truncated:
        result.summary += (
            f" (Note: transcript was truncated to {_MAX_WORDS} words for processing.)"
        )

    return result
