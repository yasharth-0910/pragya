"""Department and User models — the identity + RBAC tables.

A User belongs to at most one Department; the department_id drives the
vector-DB access filter (CLAUDE.md §6), so it is the backbone of access control.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from models import Base


def _utcnow() -> datetime:
    # Timezone-aware UTC timestamp. Replaces _utcnow (deprecated in 3.12+),
    # which returned a *naive* datetime. Passed as a callable so it's evaluated at
    # each insert/update, not once at import time.
    return datetime.now(timezone.utc)


class Department(Base):
    __tablename__ = "departments"

    # Surrogate UUID PK (CLAUDE.md §3) — generated app-side via uuid4 so we never
    # depend on a DB sequence and IDs are unguessable.
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Human-readable department name (e.g. "Human Resources"); unique so two
    # departments can't share a name.
    name = Column(String(100), unique=True, nullable=False)
    # Optional longer blurb describing the department; shown in admin UI.
    description = Column(String(500), nullable=True)
    # When the row was created. Python-side default at insert time.
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class User(Base):
    __tablename__ = "users"

    # Surrogate UUID PK, app-generated (uuid4).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Display name of the user.
    name = Column(String(200), nullable=False)
    # Login identifier; unique so it can't be registered twice. 320 = the RFC
    # 5321 maximum email length (64 local-part + 1 "@" + 255 domain).
    email = Column(String(320), unique=True, nullable=False)
    # bcrypt hash of the password — NEVER the plaintext. 255 comfortably fits a
    # bcrypt digest plus algorithm/cost metadata.
    password_hash = Column(String(255), nullable=False)
    # The user's department. Nullable so a global admin can exist without being
    # tied to one department.
    department_id = Column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=True
    )
    # Access role: admin / user / viewer. Kept as a plain string (not a DB enum)
    # so new roles can be added without a schema migration.
    role = Column(String(20), nullable=False, default="user")
    # Soft-delete flag — we deactivate users rather than hard-deleting them, so
    # their documents/queries keep their author reference.
    is_active = Column(Boolean, nullable=False, default=True)
    # Row creation timestamp.
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    # Last-modified timestamp; refreshed on every update via onupdate.
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # Many-to-one: each User links to its Department. Lets `user.department`
    # load the related row without a manual query.
    department = relationship("Department")
