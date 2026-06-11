"""Pydantic request/response schemas for the auth + user surface.

These are the API contract — the shapes that cross the HTTP boundary. They are
deliberately separate from the SQLAlchemy `User` model (models/user.py): the ORM
model is how a user is *stored* (and includes secrets like password_hash), while
these schemas are what we *accept* and *return*. Keeping them apart is what lets
UserResponse guarantee the hash never leaves the server (CLAUDE.md §3, §8).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    """Body for POST /auth/register."""

    # 1–200 chars: matches the users.name column (String(200)); min 1 rejects
    # an empty/whitespace-only name.
    name: str = Field(
        min_length=1,
        max_length=200,
        description="The user's display name.",
    )
    # EmailStr runs real email-format validation (via the email-validator lib),
    # so a malformed address is rejected at the schema boundary, not in the DB.
    email: EmailStr = Field(description="Login email; must be unique across users.")
    # Min 8 is the practical floor below which brute-forcing a password becomes
    # cheap; NIST 800-63B sets 8 as the minimum for user-chosen secrets. Max 100
    # is a sanity cap — and note bcrypt itself only hashes the first 72 *bytes*,
    # so anything past that adds no security (a detail the hashing layer handles).
    password: str = Field(
        min_length=8,
        max_length=100,
        description="Plaintext password; hashed with bcrypt before storage, never persisted as-is.",
    )


class LoginRequest(BaseModel):
    """Body for POST /auth/login."""

    email: EmailStr = Field(description="The email the account was registered with.")
    # No length bounds on login — we validate against the stored hash, not the
    # rules. Re-imposing min_length here would leak which inputs *could* be valid
    # passwords; let the bcrypt verify be the single source of truth.
    password: str = Field(description="Plaintext password to verify against the stored hash.")


class UserResponse(BaseModel):
    """Public view of a user — the ONLY user shape we ever return over HTTP.

    SECURITY: this model intentionally has no `password_hash` field. Because we
    build it via `model_validate(orm_user)` with `from_attributes=True`, Pydantic
    copies *only* the fields declared below off the ORM object — the hash is never
    read and so can never be serialized into a response. Do not add password_hash
    here.
    """

    # from_attributes=True lets `UserResponse.model_validate(user_orm_object)`
    # read attributes straight off the SQLAlchemy model (Pydantic v2's successor
    # to v1's orm_mode), so routers don't hand-map every field.
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="The user's UUID primary key.")
    name: str = Field(description="The user's display name.")
    email: EmailStr = Field(description="The user's login email.")
    # Nullable: a global admin can exist without belonging to a department
    # (mirrors users.department_id being nullable in the ORM model).
    department_id: uuid.UUID | None = Field(
        default=None, description="UUID of the user's department, or null for a global admin."
    )
    role: str = Field(description="Access role: admin, user, or viewer.")
    is_active: bool = Field(description="False if the account has been soft-deactivated.")
    created_at: datetime = Field(description="When the account was created (UTC).")


class TokenResponse(BaseModel):
    """Returned by both register and login — the JWT plus the user it belongs to.

    Bundling the user object means the frontend can populate its auth state from a
    single response without an immediate follow-up GET /auth/me.
    """

    access_token: str = Field(description="Signed JWT bearer token.")
    # "bearer" is the OAuth2 token type the client echoes back as
    # `Authorization: Bearer <token>`. Hardcoded because we only issue bearer tokens.
    token_type: str = Field(default="bearer", description="Token scheme; always 'bearer'.")
    user: UserResponse = Field(description="The authenticated user's public profile.")
