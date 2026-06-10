"""Async database layer (Neon Postgres via SQLAlchemy).

Owns the async engine + session factory, the per-request get_db() dependency, and
a dev-only create_tables() helper. The declarative Base is defined in the models/
package and imported here, so one Base is shared across models, create_tables(),
and Alembic. DB access lives here only — routers and services never create
engines or sessions of their own (CLAUDE.md §3, 3-layer rule).
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from config import get_settings
from models import Base  # the single declarative Base, defined in models/__init__.py

settings = get_settings()

# Base is re-exported implicitly via this import; create_tables() below uses its
# metadata. (Importing models/ here also registers every model on Base.metadata.)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_ENV == "development",
    # echo=True logs all SQL in dev — great for learning; turn off in production.
    pool_pre_ping=True,
    # Neon serverless closes idle connections after ~5 min; pre_ping re-checks
    # (and reconnects) before a connection is used, avoiding stale-connection errors.
    connect_args={"ssl": True},
    # Neon requires SSL; asyncpg accepts it here rather than in the URL to avoid
    # conflicts with a ?ssl= query param.
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    # expire_on_commit=False keeps ORM objects readable after commit without a
    # re-query (otherwise post-commit attribute access would hit the DB again).
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    # FastAPI dependency — yields one session per request and guarantees it
    # commits on success, rolls back on error, and always closes.
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    # Same commit/rollback/close lifecycle as get_db, but as a plain async
    # context manager for use OUTSIDE a request — startup tasks, scripts,
    # background jobs — where FastAPI's Depends isn't available.
    # Usage: `async with get_session() as session: ...`
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables() -> None:
    # Creates all tables defined on Base.metadata. Dev-only convenience —
    # production uses Alembic migrations instead. Safe to call on every startup:
    # checkfirst=True skips tables that already exist.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)
