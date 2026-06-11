"""Chat routes: ask a question (SSE stream), list sessions, list messages.

HTTP-only layer (CLAUDE.md §3): retrieval lives in retrieval_service, answer
generation in generation_service. This router orchestrates them and owns the
conversation persistence (sessions, messages, query logs).

THE STREAMING + PERSISTENCE ORDERING is the subtle part. A StreamingResponse sends
its headers (200 OK) the instant we return it, then the body streams from an async
generator. So:
  • Session creation + the USER message are committed in the request handler,
    BEFORE we return the response — they must exist regardless of how streaming goes.
  • The ASSISTANT message, the query log, and the auto-title are written INSIDE the
    generator, AFTER the final [DONE] frame — at that point we have the full answer
    text. They use a FRESH db session (get_session()), not the request-scoped `db`,
    because the request's session lifecycle and the streaming generator's lifecycle
    interleave; a self-owned session (the same pattern as ingestion's background
    task) avoids using a session that may already be committed/closed.
"""

import logging
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, get_session
from middleware.rbac import get_current_user
from models.chat import ChatMessage, ChatSession, QueryLog
from models.user import User
from schemas.chat import ChatMessageResponse, ChatRequest, ChatSessionResponse
from services.generation_service import (
    NO_INFO_RESPONSE,
    extract_sources,
    generate_session_title,
    generate_stream,
    response_indicates_no_info,
)
from services.retrieval_service import retrieve

logger = logging.getLogger(__name__)

# No prefix here — main.py mounts this router under "/chat" (mirrors the other
# routers), so routes are declared relative.
router = APIRouter()

# The retrieval pipeline chat uses: the full Experiment-C stack (CLAUDE.md §4).
CHAT_RETRIEVAL_METHOD = "hybrid_rerank"
# How many recent messages to replay as conversational context.
HISTORY_LIMIT = 4


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _fallback_title(query: str) -> str:
    # Used when LLM title generation fails (e.g. a 429). First few words of the
    # question, capped — good enough to label the conversation in a sidebar.
    words = query.split()
    title = " ".join(words[:6])
    return title[:500] if title else "New conversation"


def _sse(text: str) -> str:
    # Format one Server-Sent Events data frame. Centralized so the no-chunks guard
    # and the token stream frame messages identically.
    return f"data: {text}\n\n"


async def _persist_turn(
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    department_id: uuid.UUID,
    query_text: str,
    answer_text: str,
    sources: list[dict],
    answered: bool,
    response_time_ms: int,
    new_title: str | None,
    persist_message: bool = True,
) -> None:
    """Write the assistant message + query log (+ optional title) after streaming.

    Runs inside the StreamingResponse generator, so it owns a fresh session and
    swallows its own errors — a persistence failure here must never turn into an
    unhandled exception mid-stream (the response is already sent). The whole turn
    (assistant message, analytics log, title/updated_at touch) commits atomically.

    persist_message=False is used on the error path (generation threw, e.g. a 429):
    we still log the QueryLog row for analytics (answered=False), but we do NOT save
    a blank assistant ChatMessage — an empty bubble would just render as a broken
    answer in the UI.
    """
    try:
        async with get_session() as s:
            # Assistant answer + its citations. Store None (not []) when there are
            # no sources so the column reads cleanly as "no citations". Skipped
            # entirely when generation failed (persist_message=False).
            if persist_message:
                s.add(
                    ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=answer_text,
                        sources=sources or None,
                    )
                )
            # Analytics / research row (CLAUDE.md §7, §10). department_id is
            # denormalized here so the dashboard can group by it without a join.
            s.add(
                QueryLog(
                    session_id=session_id,
                    user_id=user_id,
                    department_id=department_id,
                    query_text=query_text,
                    retrieval_method=CHAT_RETRIEVAL_METHOD,
                    answered=answered,
                    response_time_ms=response_time_ms,
                )
            )
            # Touch the session: set the auto-title on its first message, and bump
            # updated_at so the sessions list sorts by recent activity.
            sess = await s.get(ChatSession, session_id)
            if sess is not None:
                if new_title is not None:
                    sess.title = new_title
                sess.updated_at = _utcnow()
    except Exception:
        logger.exception("Failed to persist assistant turn for session=%s", session_id)


@router.post("/query")
async def chat_query(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    # Wall-clock start — feeds QueryLog.response_time_ms, measured end-to-end
    # through the stream.
    start = time.perf_counter()

    # The department is the RBAC boundary for retrieval. A user with no department
    # can't be scoped to any documents, so they can't chat.
    department_id = current_user.department_id
    if department_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to a department and cannot query documents.",
        )

    # ── 1. Resolve the session (continue an existing one, or start fresh) ──
    if payload.session_id is not None:
        session = await db.get(ChatSession, payload.session_id)
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        # RBAC: you may only post into your own conversation.
        if session.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this session",
            )
        is_new_session = False
        # Load recent history BEFORE saving the new user message, so the current
        # question doesn't appear in its own context. Newest-first then reversed
        # back to chronological for the prompt.
        history_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(HISTORY_LIMIT)
        )
        recent = list(reversed(history_result.scalars().all()))
        chat_history = [{"role": m.role, "content": m.content} for m in recent]
    else:
        session = ChatSession(user_id=current_user.id)
        db.add(session)
        # Commit now so the session row exists before we attach messages / stream.
        await db.commit()
        await db.refresh(session)
        is_new_session = True
        chat_history = []

    # ── 2. Save the USER message immediately (committed before streaming) ──
    db.add(ChatMessage(session_id=session.id, role="user", content=payload.query))
    await db.commit()
    logger.info(
        "chat query: session=%s user=%s new=%s q=%r",
        session.id, current_user.id, is_new_session, payload.query[:80],
    )

    # ── 3. Retrieve grounding chunks (full hybrid + rerank pipeline) ──
    # retrieve() needs department_id as a str (Qdrant stored it stringified).
    chunks = await retrieve(payload.query, str(department_id), method=CHAT_RETRIEVAL_METHOD)

    # Capture plain values for the generator closure — avoid touching the ORM
    # `current_user`/`session` objects inside the post-response generator.
    session_id = session.id
    user_id = current_user.id
    query_text = payload.query

    # ── 4. No-chunks guard: empty department / no matches → fixed refusal ──
    if not chunks:
        logger.info("No chunks retrieved for session=%s — returning no-info", session_id)

        async def empty_stream():
            # Stream the exact refusal sentinel, then close the stream.
            yield _sse(NO_INFO_RESPONSE)
            yield _sse("[DONE]")
            # Persist for analytics: answered=False, no sources. Title still set on
            # a new session so the sidebar isn't blank.
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            new_title = _fallback_title(query_text) if is_new_session else None
            await _persist_turn(
                session_id=session_id,
                user_id=user_id,
                department_id=department_id,
                query_text=query_text,
                answer_text=NO_INFO_RESPONSE,
                sources=[],
                answered=False,
                response_time_ms=elapsed_ms,
                new_title=new_title,
            )

        return StreamingResponse(
            empty_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )

    # ── 5. Stream the generated answer, then persist the turn after [DONE] ──
    async def answer_stream():
        answer_parts: list[str] = []
        errored = False
        # Forward every SSE frame from the service to the client, while
        # accumulating the raw answer text (excluding the [DONE]/[ERROR] sentinels)
        # so we can extract citations and persist the message afterward.
        async for frame in generate_stream(query_text, chunks, chat_history):
            yield frame
            token = frame[len("data: "):-2]  # strip "data: " prefix and trailing "\n\n"
            if token == "[DONE]":
                continue
            if token.startswith("[ERROR]"):
                # Generation failed mid-stream (e.g. a 429). generate_stream emits
                # [ERROR] instead of [DONE]; record that so we don't log a blank
                # answer as a successful one.
                errored = True
                continue
            answer_parts.append(token)

        answer_text = "".join(answer_parts)
        elapsed_ms = int((time.perf_counter() - start) * 1000)

        # ── Error path: generation threw, or produced no text ──
        # Without this, answer_text="" → response_indicates_no_info("")=False →
        # answered=True, and we'd persist a blank assistant bubble logged as a
        # successful answer. QueryLog.answered feeds the research table, so this
        # must be correct. Log the failed query (answered=False) but save no message.
        if errored or not answer_text.strip():
            new_title = _fallback_title(query_text) if is_new_session else None
            await _persist_turn(
                session_id=session_id,
                user_id=user_id,
                department_id=department_id,
                query_text=query_text,
                answer_text="",
                sources=[],
                answered=False,
                response_time_ms=elapsed_ms,
                new_title=new_title,
                persist_message=False,
            )
            return

        sources = extract_sources(answer_text, chunks)
        # answered=False only when the model returned the fixed "no info" refusal.
        answered = not response_indicates_no_info(answer_text)

        # Auto-title on the first message. Generated BEFORE opening the DB session
        # (so we don't hold a connection during a possibly slow / rate-limited
        # Gemini call) and fully best-effort: a failure falls back to the query,
        # never costing the user the answer they just streamed.
        new_title: str | None = None
        if is_new_session:
            try:
                generated = await generate_session_title(query_text)
                new_title = generated or _fallback_title(query_text)
            except Exception:
                logger.exception("Title generation failed for session=%s; using fallback", session_id)
                new_title = _fallback_title(query_text)

        await _persist_turn(
            session_id=session_id,
            user_id=user_id,
            department_id=department_id,
            query_text=query_text,
            answer_text=answer_text,
            sources=sources,
            answered=answered,
            response_time_ms=elapsed_ms,
            new_title=new_title,
        )

    return StreamingResponse(
        answer_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/sessions", response_model=list[ChatSessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ChatSessionResponse]:
    # Per-session message count via a grouped subquery, LEFT-joined so a brand-new
    # session with zero messages still appears (with count 0).
    counts = (
        select(
            ChatMessage.session_id.label("sid"),
            func.count(ChatMessage.id).label("cnt"),
        )
        .group_by(ChatMessage.session_id)
        .subquery()
    )
    # Correlated subquery: first user message content per session (for list card preview).
    preview_subq = (
        select(ChatMessage.content)
        .where(ChatMessage.session_id == ChatSession.id)
        .where(ChatMessage.role == "user")
        .order_by(ChatMessage.created_at.asc())
        .limit(1)
        .scalar_subquery()
    )
    result = await db.execute(
        select(ChatSession, counts.c.cnt, preview_subq.label("preview"))
        .outerjoin(counts, ChatSession.id == counts.c.sid)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    return [
        ChatSessionResponse(
            id=sess.id,
            title=sess.title,
            created_at=sess.created_at,
            updated_at=sess.updated_at,
            message_count=cnt or 0,
            preview=preview[:100] if preview else None,
        )
        for sess, cnt, preview in result.all()
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a session and all its messages. QueryLogs are preserved (SET NULL)."""
    session = await db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this session")
    # Use direct SQL deletes to avoid async lazy-load issues; DB-level FK cascade
    # handles anything we miss (ChatMessage CASCADE, QueryLog SET NULL).
    await db.execute(sa_delete(ChatMessage).where(ChatMessage.session_id == session_id))
    await db.execute(sa_delete(ChatSession).where(ChatSession.id == session_id))
    await db.commit()


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
async def list_messages(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ChatMessageResponse]:
    session = await db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    # RBAC: only the owner may read a conversation's messages.
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this session",
        )
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())  # oldest first — reading order
    )
    messages = result.scalars().all()
    return [ChatMessageResponse.model_validate(m) for m in messages]
