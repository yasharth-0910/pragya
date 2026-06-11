"""Document routes: upload, list, and status-poll.

HTTP-only layer (CLAUDE.md §3): each handler validates input, talks to the DB
session, and schedules the heavy lifting — it contains no parsing, chunking,
embedding, or Qdrant logic. All of that lives in services/ingestion_service.py
and merely runs here as a background task.

Upload returns 202 immediately and the real work happens out-of-band, so the
client polls GET /documents/{id}/status until the document is "ready".
"""

import logging
import re
import uuid

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from middleware.rbac import get_current_user
from models.document import Document
from models.user import User
from schemas.document import (
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUploadResponse,
)
from services.ingestion_service import process_document

logger = logging.getLogger(__name__)

# No prefix here — main.py mounts this router under "/documents", so routes are
# declared relative to avoid double-prefixing (mirrors routers/auth.py).
router = APIRouter()

# Only these three formats have parsers in the ingestion service.
ALLOWED_EXTENSIONS = {"pdf", "docx", "pptx"}


def _extension(filename: str) -> str:
    # Lower-cased extension without the dot, or "" if the name has none.
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _sanitize_filename(filename: str) -> str:
    # Keep only safe characters (alphanumerics, dot, dash, underscore); everything
    # else becomes "_". This is the name we store/use internally — the user's
    # original name is preserved separately in original_filename. Prevents path
    # traversal / odd characters from a user-supplied filename reaching storage.
    return re.sub(r"[^A-Za-z0-9._-]", "_", filename)


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    # Optional: which department this doc belongs to. Omitted → the uploader's own
    # department. A UUID is parsed/validated by FastAPI straight from the form.
    department_id: uuid.UUID | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentUploadResponse:
    settings = get_settings()

    # Resolve the owning department: explicit form value wins, else the uploader's.
    # If neither exists we cannot set the RBAC boundary, so refuse the upload (a
    # NULL department_id would also violate the NOT NULL column).
    dept_id = department_id or current_user.department_id
    if dept_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No department to attach the document to. Specify department_id.",
        )

    # 1. Validate the extension BEFORE reading bytes — cheapest rejection first.
    original_filename = file.filename or "upload"
    ext = _extension(original_filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type. Allowed: pdf, docx, pptx",
        )

    # 2. Read the bytes, then validate size against the ACTUAL length (more
    #    reliable than trusting a client-sent Content-Length header).
    file_bytes = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    # 3. Create the document row in "processing" state. filename is sanitized for
    #    safe internal use; original_filename keeps exactly what the user uploaded.
    document = Document(
        filename=_sanitize_filename(original_filename),
        original_filename=original_filename,
        department_id=dept_id,
        uploaded_by=current_user.id,
        status="processing",
        file_size=len(file_bytes),
    )
    db.add(document)
    # Commit + refresh NOW (not relying on get_db's end-of-request commit): the
    # background task opens its OWN session and will load this row by id, so the
    # row must be persisted and visible before the task is scheduled. refresh()
    # pulls back server/default columns (id, created_at) for the response.
    await db.commit()
    await db.refresh(document)
    logger.info(
        "Document accepted: id=%s file=%s dept=%s by=%s",
        document.id, original_filename, dept_id, current_user.id,
    )

    # 4. Schedule ingestion to run AFTER the 202 response is sent. We pass plain
    #    values (not the request-scoped db session) — the task manages its own.
    background_tasks.add_task(
        process_document,
        file_bytes,
        document.filename,
        document.original_filename,
        document.id,
        document.department_id,
    )

    # 202 Accepted = "received and processing", NOT "done". The frontend must poll
    # the status endpoint until status becomes "ready".
    return DocumentUploadResponse.model_validate(document)


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    status_filter: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentResponse]:
    # Only documents in the caller's department — the RBAC boundary applies to the
    # listing too, not just retrieval. A user with no department sees nothing.
    query = select(Document).where(Document.department_id == current_user.department_id)
    # Optional ?status= filter (e.g. only "ready" docs).
    if status_filter is not None:
        query = query.where(Document.status == status_filter)
    # Newest first.
    query = query.order_by(Document.created_at.desc())

    result = await db.execute(query)
    documents = result.scalars().all()
    return [DocumentResponse.model_validate(doc) for doc in documents]


@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentStatusResponse:
    document = await db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    # RBAC: a user may only see the status of documents in their own department.
    if document.department_id != current_user.department_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this document",
        )
    return DocumentStatusResponse.model_validate(document)
