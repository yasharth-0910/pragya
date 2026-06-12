"""Document-intelligence routes: trigger generation and fetch the result.

HTTP-only layer (CLAUDE.md §3): each handler validates input, enforces the
department RBAC boundary, and either returns the cached result or schedules the
heavy LLM work as a background task. No chunking / prompting / Gemini logic lives
here — that's all in services/intelligence_service.py.

POST is fire-and-(maybe)-wait: if intelligence already exists it returns it
immediately (200); otherwise it schedules generation and returns 202, and the
client polls GET until the summary appears.
"""

import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import get_current_user
from models.document import Document
from models.user import User
from routers.documents import can_access_document
from schemas.intelligence import IntelligenceResponse
from services.intelligence_service import run_intelligence

logger = logging.getLogger(__name__)

# No prefix here — main.py mounts this router under "/intelligence" (mirrors the
# other routers), so routes are declared relative to avoid double-prefixing.
router = APIRouter()


def _build_response(document: Document) -> IntelligenceResponse:
    # Map the Document row onto the response schema. Done explicitly (not
    # model_validate) because the field names differ: the schema exposes
    # `document_id`, the ORM column is `id`. Pydantic coerces the stored
    # action_items list[dict] into list[ActionItem] during construction.
    return IntelligenceResponse(
        document_id=document.id,
        summary=document.summary,
        key_points=document.key_points,
        action_items=document.action_items,
        document_type=document.document_type,
        word_count=document.word_count,
        created_at=document.created_at,
    )


async def _load_authorized_document(
    document_id: uuid.UUID, current_user: User, db: AsyncSession
) -> Document:
    # Shared load + RBAC check for both endpoints: 404 if missing, 403 if the doc
    # belongs to another department. This is the access boundary — a user may only
    # touch intelligence for documents in their own department.
    document = await db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    # Visibility-aware access (company / department / personal) — personal docs are
    # never visible to anyone but their uploader, including via intelligence.
    if not can_access_document(document, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this document",
        )
    return document


@router.post("/{document_id}", status_code=status.HTTP_202_ACCEPTED)
async def generate_intelligence(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger (or return cached) intelligence for a document.

    Returns one of two shapes by design:
      • 200 + IntelligenceResponse — intelligence already exists (idempotent: safe
        to call repeatedly, never re-spends Gemini quota).
      • 202 + {"message": ...}     — generation scheduled as a background task; poll
        GET until the summary appears.
    """
    document = await _load_authorized_document(document_id, current_user, db)

    # Can't summarize a document that hasn't finished ingestion.
    if document.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document is still processing",
        )

    # Cached path: intelligence already generated → return it now at 200, not 202.
    if document.summary is not None:
        response.status_code = status.HTTP_200_OK
        return _build_response(document)

    # Schedule the LLM work to run AFTER this 202 response is sent. run_intelligence
    # takes only the id — it opens its own DB session (the request session is closed
    # by the time the task runs).
    background_tasks.add_task(run_intelligence, document_id)
    logger.info("Intelligence generation scheduled for document %s", document_id)
    return {"message": "Intelligence generation started"}


@router.get("/{document_id}", response_model=IntelligenceResponse)
async def get_intelligence(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IntelligenceResponse:
    """Fetch a document's generated intelligence, or 404 if not generated yet."""
    document = await _load_authorized_document(document_id, current_user, db)

    # summary is the sentinel for "has intelligence been generated?" — it's set
    # together with the other four fields in run_intelligence's single commit.
    if document.summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Intelligence not yet generated",
        )
    return _build_response(document)
