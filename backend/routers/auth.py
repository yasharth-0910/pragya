"""Auth routes: register, login, and the current-user probe.

HTTP-only layer (CLAUDE.md §3): each handler validates its request schema, calls
the auth_service crypto helpers, talks to the DB session, and returns a response
schema. No password hashing or token logic is implemented inline here — that lives
in services/auth_service.py and is merely orchestrated below.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import get_current_user
from models.user import Department, User
from schemas.department import UpdateMeRequest
from schemas.user import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from services.auth_service import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)

# No prefix here — main.py mounts this router under "/auth", so routes are
# declared relative ("/register", "/login", "/me") to avoid double-prefixing.
router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    # Check email uniqueness up front so we return a clean 409 instead of letting
    # the DB's UNIQUE constraint blow up as a 500 mid-insert.
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        logger.info("Registration rejected: email already in use (%s)", payload.email)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # First user ever? Promote to admin automatically so they can bootstrap the
    # org (create the first department) without a chicken-and-egg deadlock.
    # Count BEFORE inserting so the check is correct.
    count_result = await db.execute(select(func.count(User.id)))
    is_first_user = count_result.scalar_one() == 0

    # Hash before we ever persist — the plaintext password never touches the DB.
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role="admin" if is_first_user else "user",
    )
    db.add(user)
    # Commit to persist + fire the UNIQUE constraint, then refresh to pull
    # server/default-populated columns (id, created_at) back onto the object so
    # UserResponse can serialize them.
    await db.commit()
    await db.refresh(user)
    logger.info(
        "New user registered: %s (id=%s, role=%s)", user.email, user.id, user.role
    )

    # Return a token immediately so registration doubles as a login — the user is
    # authenticated in one round-trip and the frontend can proceed straight to the
    # app without a second POST /auth/login.
    access_token = create_access_token(user.id, user.department_id, user.role)
    return TokenResponse(access_token=access_token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # SECURITY: identical 401 whether the email is unknown OR the password is
    # wrong. Distinct messages would let an attacker enumerate which emails are
    # registered (a "wrong password" reply confirms the account exists). We also
    # only verify the password when a user exists, but the response is the same
    # either way.
    if user is None or not verify_password(payload.password, user.password_hash):
        logger.info("Failed login attempt for %s", payload.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    logger.info("User logged in: %s (id=%s)", user.email, user.id)
    access_token = create_access_token(user.id, user.department_id, user.role)
    return TokenResponse(access_token=access_token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    # get_current_user does all the work (decode token, load active user, 401/404
    # on failure); by the time we're here the caller is authenticated. We just
    # echo the public view of who they are — handy for the frontend to hydrate its
    # auth state on page load.
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=TokenResponse)
async def update_me(
    payload: UpdateMeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TokenResponse:
    """Self-service department assignment.

    Called by the frontend's signup step 2 so a newly registered user can join
    a department. Returns a fresh JWT so the client's token immediately reflects
    the updated department_id (and role if changed).

    Only admins may set the role field — non-admins may not escalate themselves.
    """
    # Validate the requested department exists.
    dept_result = await db.execute(
        select(Department).where(Department.id == payload.department_id)
    )
    dept = dept_result.scalar_one_or_none()
    if dept is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    current_user.department_id = payload.department_id

    # Role change is admin-only.
    if payload.role is not None:
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can change roles",
            )
        current_user.role = payload.role

    await db.commit()
    await db.refresh(current_user)
    logger.info(
        "User %s self-assigned to department %s", current_user.email, dept.name
    )

    # Fresh token so the stored JWT reflects the new department_id immediately.
    # The frontend must call saveToken() with this response before navigating.
    access_token = create_access_token(
        current_user.id, current_user.department_id, current_user.role
    )
    return TokenResponse(
        access_token=access_token, user=UserResponse.model_validate(current_user)
    )
