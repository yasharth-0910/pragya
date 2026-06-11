"""Pydantic schemas for department creation and responses.

Kept separate from user.py even though Department is in models/user.py —
these are the API-contract shapes and the file organisation should reflect the
HTTP surface (departments are their own resource), not the ORM layout.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    """Body for POST /departments."""

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class DepartmentResponse(BaseModel):
    """Public view of a department — returned by POST and GET /departments."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime


class UpdateMeRequest(BaseModel):
    """Body for PATCH /auth/me — lets a user set their own department.

    role is admin-only: present in the schema so the endpoint can accept and
    validate it, but the router enforces that only admins may actually change it.
    """

    department_id: uuid.UUID
    role: str | None = Field(default=None)


class DepartmentWithCountResponse(BaseModel):
    """Department row augmented with member count — used by the admin dashboard."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    # User count is computed via a subquery; not on the ORM model, so it can't
    # be populated by from_attributes alone — callers set it explicitly.
    user_count: int = 0


class UserAdminResponse(BaseModel):
    """User row as seen by an admin — includes department name for display."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    department_id: uuid.UUID | None
    # Department name is resolved in the router (a simple join/lookup); absent
    # for a global admin with no department.
    department_name: str | None = None
    role: str
    is_active: bool
    created_at: datetime


class RoleUpdateRequest(BaseModel):
    """Body for PATCH /admin/users/{user_id}/role."""

    role: str = Field(description="New role: admin, user, or viewer.")
