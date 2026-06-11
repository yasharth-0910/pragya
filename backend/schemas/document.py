"""Pydantic request/response schemas for the document surface.

The API contract for ingestion — the shapes that cross the HTTP boundary. Kept
separate from the SQLAlchemy `Document` model (models/document.py): the ORM model
is how a document is *stored*, these schemas are what we *return*. All three are
read-only views built from ORM objects via `from_attributes=True`, so routers can
do `DocumentResponse.model_validate(doc)` instead of hand-mapping every field
(CLAUDE.md §3).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DocumentUploadResponse(BaseModel):
    """Returned immediately on POST /documents/upload (HTTP 202).

    This is the response *before* processing finishes — `status` will be
    "processing". The actual parse/embed/upsert work runs in a background task,
    so the client must poll DocumentStatusResponse to learn when it's "ready".
    """

    # from_attributes=True lets `model_validate(doc_orm_object)` read fields
    # straight off the SQLAlchemy model (Pydantic v2's successor to v1 orm_mode).
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="The document's UUID primary key; poll status with this.")
    filename: str = Field(description="Sanitized filename stored internally.")
    original_filename: str = Field(description="The exact filename the user uploaded.")
    status: str = Field(description="Ingestion state — 'processing' at this point.")
    created_at: datetime = Field(description="When the upload record was created (UTC).")


class DocumentStatusResponse(BaseModel):
    """Returned by GET /documents/{id}/status — the polling target.

    The frontend hits this every ~2s after an upload until `status` becomes
    "ready" (or "failed", in which case `error_message` explains why). Kept small
    so the poll is cheap.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="The document's UUID primary key.")
    status: str = Field(description="Ingestion state: processing / ready / failed.")
    # Nullable until ingestion completes — populated only once chunking finishes.
    chunk_count: int | None = Field(
        default=None, description="Number of chunks produced; null until ready."
    )
    # Nullable until known, and stays null for formats without pages (DOCX).
    page_count: int | None = Field(
        default=None, description="Number of source pages; null until ready or N/A for DOCX."
    )
    # Populated only when status is "failed" — the reason ingestion gave up.
    error_message: str | None = Field(
        default=None, description="Failure detail; null unless status is 'failed'."
    )


class DocumentResponse(BaseModel):
    """Full document object for the document-list view (GET /documents).

    Every stored field except the chunk rows themselves — enough for the UI to
    render a document card with its status, size, page/chunk counts, and (once
    the intelligence service runs) its summary / key points / action items.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="The document's UUID primary key.")
    filename: str = Field(description="Sanitized filename stored internally.")
    original_filename: str = Field(description="The exact filename the user uploaded.")
    department_id: uuid.UUID = Field(description="Owning department — the RBAC boundary.")
    uploaded_by: uuid.UUID = Field(description="UUID of the user who uploaded it.")
    status: str = Field(description="Ingestion state: processing / ready / failed.")
    # Nullable until known.
    file_size: int | None = Field(default=None, description="Original file size in bytes.")
    page_count: int | None = Field(default=None, description="Source page count; null for DOCX.")
    chunk_count: int | None = Field(default=None, description="Number of chunks produced.")
    # The three intelligence fields below stay null until the doc-intelligence
    # service (a later session) runs over the document.
    summary: str | None = Field(default=None, description="LLM-generated summary; null until generated.")
    key_points: list[str] | None = Field(
        default=None, description="Key points as a list of strings; null until generated."
    )
    action_items: list[dict] | None = Field(
        default=None, description="Action items as {text, owner, deadline} dicts; null until generated."
    )
    error_message: str | None = Field(
        default=None, description="Failure detail; null unless status is 'failed'."
    )
    created_at: datetime = Field(description="When the document was created (UTC).")
    updated_at: datetime = Field(description="When the document was last modified (UTC).")
