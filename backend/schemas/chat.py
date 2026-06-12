"""Pydantic request/response schemas for the chat surface (CLAUDE.md §3, §7).

The API contract for the conversation layer — the shapes that cross the HTTP
boundary, kept separate from the SQLAlchemy models (models/chat.py). The response
models are read-only views built from ORM objects via `from_attributes=True`, so
routers can call `.model_validate(orm_obj)` instead of hand-mapping every field.

One subtlety worth knowing: `MessageSource` mirrors exactly the dict shape we store
in `ChatMessage.sources` (a JSONB column). Because the stored dict keys
(`filename`, `page`, `citation_number`) match this model's fields, Pydantic coerces
the stored `list[dict]` straight into `list[MessageSource]` on read — no manual
parsing of the JSON column.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MessageSource(BaseModel):
    """One citation backing an assistant answer — the [Source: N] target.

    This is also the exact dict shape persisted in ChatMessage.sources (JSONB), so
    it round-trips: we build these dicts in the service, store them, and read them
    back as MessageSource objects.
    """

    model_config = ConfigDict(from_attributes=True)

    filename: str = Field(description="Source document filename the answer cited.")
    # page is None for DOCX files — python-docx exposes no reliable page API, so a
    # DOCX-sourced citation shows the filename only, with no page number.
    page: int | None = Field(default=None, description="1-based page number; null for DOCX sources.")
    citation_number: int = Field(description="The N in [Source: N] — which context block this was.")


class ChatRequest(BaseModel):
    """Body of POST /chat/query — the user's question plus optional session."""

    # 1..2000 chars: reject an empty question outright, and cap length so a huge
    # paste can't blow up the prompt / embedding cost.
    query: str = Field(min_length=1, max_length=2000, description="The user's natural-language question.")
    # None means "start a brand-new conversation"; a UUID continues an existing one
    # (after the router verifies the session belongs to the caller).
    session_id: uuid.UUID | None = Field(
        default=None, description="Existing session to continue; null starts a new session."
    )
    # When set, retrieval is scoped to this document only. When null, searches all
    # dept docs (existing behavior). The scope is still ANDed with the visibility
    # filter, so passing an inaccessible document_id simply yields no chunks.
    document_id: uuid.UUID | None = Field(
        default=None, description="Scope retrieval to a single document; null searches all accessible docs."
    )


class ChatMessageResponse(BaseModel):
    """One turn in a conversation — returned by the messages endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="The message's UUID primary key.")
    role: str = Field(description="Who sent it: 'user' or 'assistant'.")
    content: str = Field(description="The message text.")
    # Null on user messages; populated on assistant messages with the citations
    # that grounded the answer.
    sources: list[MessageSource] | None = Field(
        default=None, description="Citations backing an assistant answer; null for user messages."
    )
    created_at: datetime = Field(description="When the message was created (UTC).")


class ChatSessionResponse(BaseModel):
    """A conversation summary — returned by the sessions list endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="The session's UUID primary key.")
    # Null until the first message is sent and a title is auto-generated from it.
    title: str | None = Field(default=None, description="Auto-generated 4-word title; null until first message.")
    created_at: datetime = Field(description="When the session was created (UTC).")
    updated_at: datetime = Field(description="Last activity timestamp (UTC).")
    # Defaults to 0 so a freshly created, empty session serializes cleanly; the
    # sessions endpoint fills this in with a COUNT per session.
    message_count: int = Field(default=0, description="Number of messages in the session.")
    # First 100 chars of the first user message — for the conversations list card.
    preview: str | None = Field(default=None, description="Snippet of the first user message.")
