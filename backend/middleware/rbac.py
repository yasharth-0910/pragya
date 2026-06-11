"""Auth + RBAC FastAPI dependencies.

These turn a raw `Authorization: Bearer <jwt>` header into a live, trusted `User`
ORM object (`get_current_user`), and gate admin-only routes (`require_admin`).
Routers attach them via `Depends(...)` — the dependency runs before the handler,
so by the time the handler executes the caller is already authenticated/authorized.
This is the single enforcement point for the auth spec (CLAUDE.md §8).
"""

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.user import User
from services.auth_service import decode_token

# Tells FastAPI to look for the token in the `Authorization: Bearer` header, and
# powers the "Authorize" button in Swagger /docs. tokenUrl is ONLY metadata for
# that Swagger UI flow (it points the test form at our login route) — we are not
# running a real OAuth2 server, just borrowing the standard bearer-token plumbing.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # The core auth dependency: decode the JWT, then load the real user it names.
    # decode_token already raises 401 on a missing/malformed/expired token.
    payload = decode_token(token)

    # Pull the user id out of the standard `sub` claim and turn it back into a
    # UUID (we stored it as a string so JWT/JSON could serialize it). A token with
    # a missing or non-UUID `sub` is malformed → 401, same as a bad signature.
    user_id_str = payload.get("sub")
    try:
        user_id = uuid.UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Look up the user AND require is_active in the same query. The is_active
    # check belongs here at the auth layer (not in each router) because it's an
    # authentication concern: a soft-deactivated account must lose access on its
    # very next request, everywhere, without every handler remembering to check.
    # Folding it into the query means a deactivated user is indistinguishable from
    # a deleted one to the caller — we don't leak that the account still exists.
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()
    if user is None:
        # Valid signature but the subject no longer resolves to an active user
        # (deleted, deactivated, or the row vanished) → 404.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    # Admin gate, layered on top of get_current_user (so authentication runs
    # first, then this authorization check). Attach it to routes only admins may
    # call — e.g. creating departments, uploading org-wide documents, viewing the
    # analytics dashboard. A logged-in non-admin hits 403 (authenticated, but
    # forbidden), distinct from the 401 an anonymous caller would get.
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user
