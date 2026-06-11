"""Admin-only routes: user and department management.

All endpoints require role == "admin" (enforced via require_admin dependency).
These are NOT part of the public API surface — they exist only for the admin
dashboard in the frontend.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import get_current_user, require_admin
from models.user import Department, User
from schemas.department import DepartmentWithCountResponse, RoleUpdateRequest, UserAdminResponse

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_ROLES = {"admin", "user", "viewer"}


@router.get("/users", response_model=list[UserAdminResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[UserAdminResponse]:
    """Return every user with their department name (for the admin dashboard)."""
    # A single join is cheaper than N separate dept lookups.
    result = await db.execute(
        select(User, Department.name)
        .outerjoin(Department, User.department_id == Department.id)
        .order_by(User.created_at)
    )
    rows = result.all()

    out: list[UserAdminResponse] = []
    for user, dept_name in rows:
        resp = UserAdminResponse.model_validate(user)
        resp.department_name = dept_name  # not on the ORM model; set manually
        out.append(resp)
    return out


@router.get("/departments", response_model=list[DepartmentWithCountResponse])
async def list_departments_with_counts(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[DepartmentWithCountResponse]:
    """Return every department with a count of how many users belong to it."""
    dept_result = await db.execute(select(Department).order_by(Department.name))
    depts = dept_result.scalars().all()

    # Count users per department in one query rather than N+1 queries.
    count_result = await db.execute(
        select(User.department_id, func.count(User.id).label("cnt"))
        .group_by(User.department_id)
    )
    count_map: dict = {str(row.department_id): row.cnt for row in count_result if row.department_id}

    out: list[DepartmentWithCountResponse] = []
    for dept in depts:
        resp = DepartmentWithCountResponse.model_validate(dept)
        resp.user_count = count_map.get(str(dept.id), 0)
        out.append(resp)
    return out


@router.patch("/users/{user_id}/role", response_model=UserAdminResponse)
async def update_user_role(
    user_id: str,
    payload: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> UserAdminResponse:
    """Promote or demote a user's role. Admin-only."""
    if payload.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"role must be one of: {', '.join(sorted(VALID_ROLES))}",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent an admin from stripping their own admin role, which would lock
    # them out of the admin dashboard.
    if target.id == current_user.id and payload.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own admin role",
        )

    target.role = payload.role
    await db.commit()
    await db.refresh(target)
    logger.info(
        "Admin %s updated user %s role to %s", current_user.email, target.email, target.role
    )

    # Resolve department name for the response.
    dept_name: str | None = None
    if target.department_id:
        dept_result = await db.execute(
            select(Department.name).where(Department.id == target.department_id)
        )
        dept_name = dept_result.scalar_one_or_none()

    resp = UserAdminResponse.model_validate(target)
    resp.department_name = dept_name
    return resp
