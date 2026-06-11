"""Document and DocumentChunk models — the ingestion + retrieval tables.

A Document is one uploaded file; DocumentChunks are its hierarchical pieces.
Retrieval matches on the small child_text (precision) but the large parent_text
is what's sent to the LLM (context) — see CLAUDE.md §5.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from models import Base


def _utcnow() -> datetime:
    # Timezone-aware UTC timestamp. Replaces datetime.utcnow (deprecated in 3.12+),
    # which returned a *naive* datetime. Passed as a callable so it's evaluated at
    # each insert/update, not once at import time.
    return datetime.now(timezone.utc)


class Document(Base):
    __tablename__ = "documents"

    # Surrogate UUID PK, app-generated (uuid4).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Sanitized filename used internally (safe for storage paths / Qdrant payload).
    filename = Column(String(500), nullable=False)
    # The name the user actually uploaded — preserved verbatim for display in the UI.
    original_filename = Column(String(500), nullable=False)
    # Owning department; drives RBAC (only this dept can retrieve the doc). Required.
    department_id = Column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False
    )
    # The user who uploaded it (audit / "uploaded by" in UI). Required.
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    # Ingestion lifecycle: processing / ready / failed. Plain string (not enum) so
    # states can evolve without a migration.
    status = Column(String(20), nullable=False, default="processing")
    # Size of the original file in bytes; nullable until known.
    file_size = Column(Integer, nullable=True)
    # Number of pages (PDF/PPTX); nullable for formats without pages (DOCX).
    page_count = Column(Integer, nullable=True)
    # How many chunks the doc produced — populated once ingestion completes.
    chunk_count = Column(Integer, nullable=True)
    # LLM-generated summary; populated later by the intelligence service.
    summary = Column(Text, nullable=True)
    # Key points as a JSON list of strings; populated by the intelligence service.
    key_points = Column(JSONB, nullable=True)
    # Action items as a JSON list of {text, owner, deadline} dicts.
    action_items = Column(JSONB, nullable=True)
    # Failure detail — populated only when status becomes "failed".
    error_message = Column(Text, nullable=True)
    # Row creation timestamp.
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    # Last-modified timestamp; refreshed on every update via onupdate.
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    # Surrogate UUID PK, app-generated (uuid4).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Parent document. ondelete=CASCADE so chunks are removed at the DB level when
    # their document is deleted (no orphaned chunks).
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Position of this chunk within the document (0-based ordering).
    chunk_index = Column(Integer, nullable=False)
    # The 256-token child chunk — this is what gets embedded and retrieved
    # (retrieval precision).
    child_text = Column(Text, nullable=False)
    # The 1024-token parent chunk — this is what's sent to the LLM for generation
    # (broader context). Two sizes: child = precision, parent = context.
    parent_text = Column(Text, nullable=False)
    # Source page number; None for DOCX (Word has no reliable page API).
    page_number = Column(Integer, nullable=True)
    # UUID string of the matching Qdrant vector point, so we can update/delete the
    # vector when the document changes. 36 = canonical UUID string length.
    qdrant_point_id = Column(String(36), nullable=True)
    # Row creation timestamp.
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
