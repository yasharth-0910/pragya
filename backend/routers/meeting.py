"""Meeting assistant routes — POST /meeting/process and POST /meeting/upload.

Both accept a transcript and call the SAME service (a single Gemini call) that
returns structured JSON. /process takes pasted text; /upload takes a .txt or .pdf
file and extracts its text first. No DB storage — the result is ephemeral and the
caller is responsible for saving or displaying it.
"""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from middleware.rbac import get_current_user
from models.user import User
from schemas.meeting import MeetingRequest, MeetingResponse
from services.ingestion_service import parse_pdf
from services.meeting_service import process_transcript

logger = logging.getLogger(__name__)

router = APIRouter()

# Only plain text and PDF are accepted as transcript sources.
ALLOWED_TRANSCRIPT_EXTENSIONS = {"txt", "pdf"}


@router.post("/process", response_model=MeetingResponse)
async def process_meeting(
    request: MeetingRequest,
    current_user: User = Depends(get_current_user),
) -> MeetingResponse:
    """Analyze a meeting transcript and return summary, decisions, and action items."""
    logger.info(
        "Meeting process: user=%s title=%r words=%d",
        current_user.id,
        request.title,
        len(request.transcript.split()),
    )
    return await process_transcript(request.transcript, request.title)


@router.post("/upload", response_model=MeetingResponse)
async def upload_meeting(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> MeetingResponse:
    """Extract text from an uploaded .txt/.pdf transcript, then analyze it.

    The router owns FILE EXTRACTION; the service owns INTELLIGENCE extraction —
    so this reuses process_transcript() (and parse_pdf() from ingestion) with no
    duplication of either concern.
    """
    original_filename = file.filename or "transcript"
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""
    if ext not in ALLOWED_TRANSCRIPT_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type. Allowed: txt, pdf",
        )

    file_bytes = await file.read()
    if ext == "txt":
        # Decode as UTF-8, tolerating stray bytes rather than 500-ing on them.
        transcript = file_bytes.decode("utf-8", errors="replace")
    else:
        # PDF: reuse the ingestion parser (keeps page order); join pages with
        # newlines so the transcript reads top-to-bottom.
        pages = parse_pdf(file_bytes)
        transcript = "\n".join(page["text"] for page in pages)

    if not transcript.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No extractable text found in the file.",
        )

    # Use the filename (without extension) as the meeting title for context.
    title = original_filename.rsplit(".", 1)[0]
    logger.info(
        "Meeting upload: user=%s file=%s words=%d",
        current_user.id,
        original_filename,
        len(transcript.split()),
    )
    return await process_transcript(transcript, title)
