"""ChatSession, ChatMessage, and QueryLog models — conversation + analytics.

ChatSession groups a conversation; ChatMessage is one turn within it. QueryLog is
a separate analytics/research record of each question asked, denormalized so the
analytics dashboard and RAGAS evaluation can query it without joins (CLAUDE.md §7).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
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


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    # Surrogate UUID PK, app-generated (uuid4).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Owner of the conversation. Required.
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    # Short title, auto-generated from the first message via the LLM. Null until
    # the first message is sent.
    title = Column(String(500), nullable=True)
    # Row creation timestamp.
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    # Last-activity timestamp; refreshed on every update via onupdate.
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    # Surrogate UUID PK, app-generated (uuid4).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Parent conversation. ondelete=CASCADE — messages are meaningless without
    # their session, so they're removed with it.
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Who sent the turn: user / assistant. Plain string (not enum) for flexibility.
    role = Column(String(20), nullable=False)
    # The message text.
    content = Column(Text, nullable=False)
    # Citations backing an assistant answer: a JSON list of {filename, page, score}
    # dicts. Null on user messages. JSONB so we can query/index inside it later.
    sources = Column(JSONB, nullable=True)
    # Row creation timestamp.
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class QueryLog(Base):
    __tablename__ = "query_logs"

    # Surrogate UUID PK, app-generated (uuid4).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Originating session. Nullable — some queries run outside a chat session
    # (e.g. evaluation harness, API calls). ondelete=SET NULL — if the session is
    # deleted the analytics log row SURVIVES but loses its session reference.
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    # User who asked. Required.
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    # Department, denormalized here so analytics can group by department without
    # joining through users. Required.
    department_id = Column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False
    )
    # The raw question text.
    query_text = Column(Text, nullable=False)
    # Which retrieval pipeline served it: dense / hybrid / hybrid_rerank — the
    # independent variable for the research comparison (CLAUDE.md §10).
    retrieval_method = Column(String(20), nullable=True)
    # RAGAS metrics — populated by the evaluation harness, not at query time.
    faithfulness_score = Column(Float, nullable=True)
    answer_relevancy_score = Column(Float, nullable=True)
    context_precision_score = Column(Float, nullable=True)
    # False when the LLM reports it has no grounding for an answer. Drives the
    # "unanswered queries" view in the analytics dashboard.
    answered = Column(Boolean, nullable=False, default=True)
    # End-to-end latency in milliseconds; nullable until measured.
    response_time_ms = Column(Integer, nullable=True)
    # Row creation timestamp.
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
