"""Pydantic request/response schemas for the document-intelligence surface.

The API contract for Session 6 (CLAUDE.md §9, step 5): the shapes that cross the
HTTP boundary when a client asks for a document's summary / key points / action
items. Kept separate from the SQLAlchemy `Document` model — the ORM model is how a
document is *stored*; these are what we *return*. All three carry
`from_attributes=True` so a router can build them from an ORM object instead of
hand-mapping every field (CLAUDE.md §3).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ActionItem(BaseModel):
    """One extracted to-do — the unit inside IntelligenceResponse.action_items.

    Mirrors the dict shape the LLM emits and that we persist in
    Document.action_items (a JSONB list). Owner/deadline are best-effort: the model
    fills them only when the source text actually names them.
    """

    model_config = ConfigDict(from_attributes=True)

    text: str = Field(description="The action / task itself, in the document's own words.")
    # Extracted from the transcript/document only if a responsible person is named;
    # null otherwise — we never invent an owner.
    owner: str | None = Field(
        default=None, description="Who owns the task; null if the document doesn't say."
    )
    # Kept as a plain string, NOT a date — the LLM extracts it verbatim ("next Friday",
    # "Q3", "by EOD"), and forcing a date type would reject the many non-date phrasings.
    deadline: str | None = Field(
        default=None, description="Deadline as written (free-text); null if not mentioned."
    )


class IntelligenceResponse(BaseModel):
    """The full intelligence payload returned by GET /intelligence/{document_id}.

    Built from the Document row after run_intelligence has populated its five
    intelligence columns. Every field below is nullable because the document may not
    have been processed yet, or a given facet (e.g. action_items) may legitimately
    be empty for that document.
    """

    model_config = ConfigDict(from_attributes=True)

    document_id: uuid.UUID = Field(description="UUID of the document this intelligence is for.")
    summary: str | None = Field(
        default=None, description="3–5 sentence overview; null until generated."
    )
    key_points: list[str] | None = Field(
        default=None, description="Key points as a list of strings; null until generated."
    )
    action_items: list[ActionItem] | None = Field(
        default=None, description="Extracted action items; null until generated, [] if none found."
    )
    # Coarse class the LLM infers — one of policy / meeting_notes / technical / other.
    document_type: str | None = Field(
        default=None, description="Inferred document type; null until generated."
    )
    word_count: int | None = Field(
        default=None, description="Word count of the reconstructed text; null until generated."
    )
    created_at: datetime | None = Field(
        default=None, description="When the document row was created (UTC)."
    )


class IntelligenceRequest(BaseModel):
    """Request body for triggering intelligence generation.

    Minimal — the document is the only input the caller supplies; everything else
    (its text, department, etc.) is loaded server-side from the document_id.
    """

    model_config = ConfigDict(from_attributes=True)

    document_id: uuid.UUID = Field(description="UUID of the document to analyze.")
