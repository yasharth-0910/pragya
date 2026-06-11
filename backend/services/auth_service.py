"""Auth primitives: password hashing/verification and JWT mint/decode.

Pure functions — no DB, no HTTP request objects. The router layer calls these and
handles persistence; keeping the crypto here (services/, CLAUDE.md §3) means the
signing logic is testable in isolation and reused identically by register, login,
and the get_current_user dependency.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import get_settings

settings = get_settings()

# One shared CryptContext for the whole app. schemes=["bcrypt"] selects the
# algorithm; deprecated="auto" means if we ever add a newer scheme, hashes made
# with bcrypt get flagged as needing a rehash on next login (future-proofing,
# costs nothing now).
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # Returns a bcrypt hash string. bcrypt generates a random salt internally and
    # stores it *inside* the output string, so we never create or track a salt
    # ourselves — verify_password reads the salt back out of the stored hash.
    # (Two hashes of the same password therefore differ, which is correct.)
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Checks a plaintext attempt against a stored bcrypt hash. passlib's verify is
    # constant-time (timing-safe): it always does the full comparison so an
    # attacker can't learn how much of the password matched from response timing.
    # Returns False (not an exception) on mismatch so callers branch normally.
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    user_id: uuid.UUID,
    department_id: uuid.UUID | None,
    role: str,
) -> str:
    # Mints a signed JWT carrying just enough identity to authorize requests
    # without a DB hit on every call: who you are, your department (the RBAC
    # boundary), and your role.
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)

    payload = {
        # `sub` (subject) is the standard JWT claim for "who this token is about".
        # str(...) because the user_id is a uuid.UUID, and jwt.encode runs
        # json.dumps internally, which cannot serialize a UUID — it would raise.
        "sub": str(user_id),
        # Department drives the Qdrant access filter (CLAUDE.md §6). Guard the
        # nullable case: str(None) is the literal "None", which would silently
        # poison the RBAC filter — emit a real JSON null instead.
        "department_id": str(department_id) if department_id else None,
        "role": role,
        # exp/iat MUST be UTC-aware datetimes. jose compares exp against the
        # current UTC time on decode; a naive (tz-less) datetime would be read in
        # the server's local zone, so a token could expire hours early or late
        # depending on where the server runs. timezone.utc removes the ambiguity.
        "exp": expire,
        "iat": now,  # issued-at: when the token was minted (audit/debug).
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    # Verifies the signature and expiry, returning the claims dict. A single
    # except JWTError catches *both* a malformed/tampered token (bad signature,
    # garbage string) and an expired one (ExpiredSignatureError subclasses
    # JWTError) — from the caller's view both mean "this token can't be trusted",
    # so both become a 401. We don't reveal which, to avoid leaking token state.
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            # Per the OAuth2 Bearer spec, a 401 should tell the client the scheme
            # to authenticate with; clients/Swagger use this header.
            headers={"WWW-Authenticate": "Bearer"},
        )
