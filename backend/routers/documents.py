"""Document routes: upload, list, and status-poll.

HTTP-only layer (CLAUDE.md §3): each handler validates input, talks to the DB
session, and schedules the heavy lifting — it contains no parsing, chunking,
embedding, or Qdrant logic. All of that lives in services/ingestion_service.py
and merely runs here as a background task.

Upload returns 202 immediately and the real work happens out-of-band, so the
client polls GET /documents/{id}/status until the document is "ready".
"""

import asyncio
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
    Query,
    UploadFile,
    status,
)
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from middleware.rbac import get_current_user, require_admin
from models.document import Document
from models.user import User
from qdrant import build_visibility_filter, get_qdrant_client
from schemas.document import (
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUploadResponse,
)
from services.ingestion_service import process_document, reindex_document
from services.retrieval_service import dense_retrieve, embed_query

# The three valid document visibility tiers (CLAUDE.md: 3-tier access model).
VALID_VISIBILITIES = {"company", "department", "personal"}


def can_access_document(document: Document, current_user: User) -> bool:
    """Whether `current_user` may see / query `document` under the 3-tier model.

    This is the single source of truth for per-document access; every read path
    (list, status, search, intelligence, reindex) funnels through it so the rules
    can never drift between endpoints.

      • "company"    — everyone (any department) can access.
      • "personal"   — ONLY the uploader. Not admins, not HR — a hard privacy
                       guarantee for private reference docs.
      • "department" — admins can access any department's dept-docs; everyone else
                       only their own department's.
    """
    if document.visibility == "company":
        return True
    if document.visibility == "personal":
        return document.uploaded_by == current_user.id
    # "department" (and any unexpected value falls through to dept rules).
    if current_user.role == "admin":
        return True
    return document.department_id == current_user.department_id

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
    # The 3-tier visibility for this upload. Defaults to "department" (the original
    # single-level behavior). Validated below against VALID_VISIBILITIES.
    visibility: str = Form(default="department"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentUploadResponse:
    settings = get_settings()

    # 0. Validate the visibility tier and enforce its business rules.
    if visibility not in VALID_VISIBILITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid visibility. Allowed: {', '.join(sorted(VALID_VISIBILITIES))}",
        )
    # Company-wide docs are organisation-level content — only admins may publish them.
    if visibility == "company" and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can upload company-wide documents",
        )

    # Resolve the owning department: explicit form value wins, else the uploader's.
    # A personal doc is never filtered by department (only by uploaded_by), but the
    # column is NOT NULL for integrity, so we still pin it to the uploader's dept.
    if visibility == "personal":
        dept_id = current_user.department_id
    else:
        dept_id = department_id or current_user.department_id
    # If neither exists we cannot set the RBAC boundary, so refuse the upload (a
    # NULL department_id would also violate the NOT NULL column).
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
        visibility=visibility,
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
        # visibility + uploaded_by are written into every Qdrant point's payload so
        # the visibility filter can enforce access at query time (CLAUDE.md §6).
        document.visibility,
        document.uploaded_by,
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
    # Visibility-aware listing — the SQL equivalent of can_access_document(), pushed
    # into the WHERE clause so we never load (and then discard) docs the caller can't
    # see. The three OR-branches mirror the three tiers exactly:
    #   • company    → everyone
    #   • personal   → only the uploader
    #   • department → admins see all dept-docs; others only their own department's
    access_clauses = [
        Document.visibility == "company",
        and_(Document.visibility == "personal", Document.uploaded_by == current_user.id),
    ]
    if current_user.role == "admin":
        access_clauses.append(Document.visibility == "department")
    else:
        access_clauses.append(
            and_(
                Document.visibility == "department",
                Document.department_id == current_user.department_id,
            )
        )
    query = select(Document).where(or_(*access_clauses))
    # Optional ?status= filter (e.g. only "ready" docs).
    if status_filter is not None:
        query = query.where(Document.status == status_filter)
    # Newest first.
    query = query.order_by(Document.created_at.desc())

    result = await db.execute(query)
    documents = result.scalars().all()
    return [DocumentResponse.model_validate(doc) for doc in documents]


@router.get("/search")
async def search_documents(
    q: str = Query(..., min_length=2, max_length=500),
    limit: int = Query(default=10, ge=1, le=30),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Semantic search over the documents the caller is allowed to see.

    Embeds the query, runs dense Qdrant search filtered by the 3-tier visibility
    rules (company / department / personal), then caps at 2 chunks per document
    before returning top N. parent_text is used for the preview — child_text is
    not stored in the Qdrant payload (see CLAUDE.md §6).
    """
    if current_user.department_id is None:
        return []

    # The visibility filter is the RBAC boundary — same compound filter chat uses,
    # so search honours company/department/personal access identically.
    query_filter = build_visibility_filter(
        str(current_user.department_id), str(current_user.id)
    )

    # embed_query and dense_retrieve are synchronous — run in a thread to
    # avoid blocking the async event loop during CPU + network work.
    client = get_qdrant_client()
    query_vector = await asyncio.to_thread(embed_query, q)
    # Retrieve a wider pool (30) before per-doc capping so the top-N result
    # after grouping is drawn from a meaningful candidate set.
    raw = await asyncio.to_thread(
        dense_retrieve, query_vector, query_filter, client, 30
    )

    # Group: at most 2 chunks per document, stop once we have `limit` results.
    seen: dict[str, int] = {}
    results: list[dict] = []
    for hit in raw:
        payload = hit.get("payload", {})
        doc_id = payload.get("document_id")
        if doc_id is None:
            continue
        if seen.get(doc_id, 0) >= 2:
            continue
        seen[doc_id] = seen.get(doc_id, 0) + 1
        preview = (payload.get("parent_text") or "")[:200]
        results.append({
            "document_id": doc_id,
            "source_filename": payload.get("source_filename", ""),
            "page_number": payload.get("page_number"),
            "chunk_preview": preview,
            "score": round(hit.get("score", 0.0), 4),
        })
        if len(results) >= limit:
            break

    return results


@router.post("/reindex-all", status_code=status.HTTP_202_ACCEPTED)
async def reindex_all_documents(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-index every ready document with dense+sparse vectors. Admin only; async."""
    result = await db.execute(select(Document).where(Document.status == "ready"))
    documents = result.scalars().all()
    for doc in documents:
        background_tasks.add_task(
            reindex_document,
            doc.id,
            doc.department_id,
            doc.filename,
            doc.visibility,
            doc.uploaded_by,
        )
    logger.info("Reindex-all: scheduling %d documents", len(documents))
    return {"message": f"Reindexing {len(documents)} documents in background"}


@router.post("/{document_id}/reindex")
async def reindex_one_document(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-index a single document with dense+sparse vectors."""
    document = await db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if not can_access_document(document, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if document.status != "ready":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document is not ready for reindexing")
    # Re-upsert carries the current visibility + uploaded_by into the payload so the
    # visibility filter stays correct after a reindex.
    chunk_count = await reindex_document(
        document_id,
        document.department_id,
        document.filename,
        document.visibility,
        document.uploaded_by,
    )
    logger.info("Reindexed doc=%s chunks=%d", document_id, chunk_count)
    return {"chunk_count": chunk_count}


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
    # RBAC: visibility-aware access (company / department / personal).
    if not can_access_document(document, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this document",
        )
    return DocumentStatusResponse.model_validate(document)
