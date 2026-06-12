"""Analytics routes — admin-only dashboard endpoints.

HTTP-only layer (CLAUDE.md §3): no SQL lives here, only scalar aggregations
via SQLAlchemy's func helpers and Python-side stitching. All six endpoints
require require_admin so non-admin requests are rejected at the dependency.
"""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import cast, func, select
from sqlalchemy.dialects.postgresql import DATE
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import require_admin
from models.chat import QueryLog
from models.document import Document
from models.user import Department, User

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/overview")
async def get_overview(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Aggregate headline numbers for the dashboard summary cards."""
    total_q = await db.scalar(select(func.count()).select_from(QueryLog))
    answered_q = await db.scalar(
        select(func.count()).select_from(QueryLog).where(QueryLog.answered == True)  # noqa: E712
    )
    unanswered_q = await db.scalar(
        select(func.count()).select_from(QueryLog).where(QueryLog.answered == False)  # noqa: E712
    )
    total_docs = await db.scalar(
        select(func.count()).select_from(Document).where(Document.status == "ready")
    )
    total_users = await db.scalar(
        select(func.count()).select_from(User).where(User.is_active == True)  # noqa: E712
    )
    total_depts = await db.scalar(select(func.count()).select_from(Department))
    avg_rt = await db.scalar(
        select(func.avg(QueryLog.response_time_ms)).where(
            QueryLog.response_time_ms.isnot(None)
        )
    )
    avg_faith = await db.scalar(
        select(func.avg(QueryLog.faithfulness_score)).where(
            QueryLog.faithfulness_score.isnot(None)
        )
    )
    return {
        "total_queries": total_q or 0,
        "answered_queries": answered_q or 0,
        "unanswered_queries": unanswered_q or 0,
        "total_documents": total_docs or 0,
        "total_users": total_users or 0,
        "total_departments": total_depts or 0,
        "avg_response_time_ms": round(float(avg_rt), 1) if avg_rt is not None else None,
        "avg_faithfulness": round(float(avg_faith), 3) if avg_faith is not None else None,
    }


@router.get("/top-queries")
async def get_top_queries(
    limit: int = Query(default=10, ge=1, le=50),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Most-repeated query topics, by first 60 characters of query text."""
    preview_col = func.left(QueryLog.query_text, 60).label("query_preview")
    result = await db.execute(
        select(
            preview_col,
            func.count().label("count"),
            func.max(QueryLog.created_at).label("last_asked"),
        )
        .group_by(preview_col)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return [
        {"query_preview": row.query_preview, "count": row.count, "last_asked": row.last_asked}
        for row in result.all()
    ]


@router.get("/unanswered")
async def get_unanswered(
    limit: int = Query(default=20, ge=1, le=100),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Recent unanswered queries — the model returned a no-info response."""
    result = await db.execute(
        select(
            QueryLog.query_text,
            QueryLog.department_id,
            Department.name.label("department_name"),
            QueryLog.created_at,
        )
        .join(Department, Department.id == QueryLog.department_id)
        .where(QueryLog.answered == False)  # noqa: E712
        .order_by(QueryLog.created_at.desc())
        .limit(limit)
    )
    return [
        {
            "query_text": row.query_text,
            "department_id": str(row.department_id),
            "department_name": row.department_name,
            "created_at": row.created_at,
        }
        for row in result.all()
    ]


@router.get("/document-usage")
async def get_document_usage(
    limit: int = Query(default=10, ge=1, le=50),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Documents sorted by chunk_count as a proxy for size/complexity.

    chunk_count is the number of 256-token child chunks produced at ingestion —
    a larger chunk_count indicates a longer, denser document. True retrieval-hit
    counts would require parsing ChatMessage.sources JSONB at query time; the
    chunk_count proxy is free and good enough for the admin overview.
    """
    result = await db.execute(
        select(
            Document.id,
            Document.original_filename,
            Document.chunk_count,
            Document.department_id,
            Document.created_at,
        )
        .where(Document.status == "ready")
        .where(Document.chunk_count.isnot(None))
        .order_by(Document.chunk_count.desc())
        .limit(limit)
    )
    return [
        {
            "document_id": str(row.id),
            "filename": row.original_filename,
            "chunk_count": row.chunk_count,
            "department_id": str(row.department_id),
            "created_at": row.created_at,
        }
        for row in result.all()
    ]


@router.get("/queries-over-time")
async def get_queries_over_time(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Daily query counts for the last 30 days, with zeros for quiet days."""
    cutoff = date.today() - timedelta(days=29)
    result = await db.execute(
        select(
            cast(QueryLog.created_at, DATE).label("day"),
            func.count().label("count"),
        )
        .where(QueryLog.created_at >= cutoff)
        .group_by(cast(QueryLog.created_at, DATE))
        .order_by(cast(QueryLog.created_at, DATE))
    )
    # Build a lookup then zero-fill the full 30-day window so the chart has no gaps.
    counts: dict[date, int] = {row.day: row.count for row in result.all()}
    return [
        {
            "date": (cutoff + timedelta(days=i)).isoformat(),
            "count": counts.get(cutoff + timedelta(days=i), 0),
        }
        for i in range(30)
    ]


@router.get("/department-activity")
async def get_department_activity(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Per-department query, document, and user counts.

    Three separate GROUP BY aggregates are stitched in Python rather than joined
    in one query — a three-way join of one-to-many tables would multiply row counts
    and produce inflated numbers.
    """
    # 1. All departments
    dept_result = await db.execute(select(Department.id, Department.name))
    departments = {row.id: row.name for row in dept_result.all()}

    # 2. Query counts per department
    q_result = await db.execute(
        select(QueryLog.department_id, func.count().label("query_count"))
        .group_by(QueryLog.department_id)
    )
    query_counts: dict = {row.department_id: row.query_count for row in q_result.all()}

    # 3. Ready document counts per department
    d_result = await db.execute(
        select(Document.department_id, func.count().label("doc_count"))
        .where(Document.status == "ready")
        .group_by(Document.department_id)
    )
    doc_counts: dict = {row.department_id: row.doc_count for row in d_result.all()}

    # 4. Active user counts per department
    u_result = await db.execute(
        select(User.department_id, func.count().label("user_count"))
        .where(User.is_active == True)  # noqa: E712
        .where(User.department_id.isnot(None))
        .group_by(User.department_id)
    )
    user_counts: dict = {row.department_id: row.user_count for row in u_result.all()}

    return [
        {
            "department_id": str(dept_id),
            "department_name": name,
            "query_count": query_counts.get(dept_id, 0),
            "document_count": doc_counts.get(dept_id, 0),
            "user_count": user_counts.get(dept_id, 0),
        }
        for dept_id, name in departments.items()
    ]
