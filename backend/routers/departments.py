"""Department routes: create, list.

Bootstrap rule: POST / is allowed when the departments table is empty so the
very first user can create their org without needing admin rights yet.  After
that, only admins may create new departments.

PATCH /auth/me (self-update) lives in auth.py because it is about the
authenticated user, not the department resource.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import get_current_user
from models.user import Department, User
from schemas.department import DepartmentCreate, DepartmentResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    payload: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DepartmentResponse:
    # Bootstrap: if no departments exist yet, any authenticated user may create
    # the first one (chicken-and-egg: can't be admin without a dept).
    count_result = await db.execute(select(func.count(Department.id)))
    dept_count = count_result.scalar_one()

    if dept_count > 0 and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create departments",
        )

    # Enforce name uniqueness at the application layer for a readable error.
    existing = await db.execute(
        select(Department).where(Department.name == payload.name)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A department named '{payload.name}' already exists",
        )

    dept = Department(name=payload.name, description=payload.description)
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    logger.info("Department created: %s (id=%s)", dept.name, dept.id)
    return DepartmentResponse.model_validate(dept)


@router.get("/", response_model=list[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),  # any authenticated user
) -> list[DepartmentResponse]:
    result = await db.execute(select(Department).order_by(Department.name))
    depts = result.scalars().all()
    return [DepartmentResponse.model_validate(d) for d in depts]
