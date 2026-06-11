"""Alembic migration environment — ASYNC setup.

This differs from the stock Alembic template, which assumes a SYNCHRONOUS engine.
Our app uses asyncpg, so we:
  • build an AsyncEngine with create_async_engine,
  • open an async connection and hand it to Alembic via connection.run_sync(),
    because Alembic's migration ops themselves are synchronous,
  • drive the whole thing with asyncio.run().
We also pull DATABASE_URL straight from app settings (not alembic.ini) so there's
one source of truth and the password's special characters don't trip ConfigParser
'%' interpolation. SSL is required by Neon, passed via connect_args.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

from config import get_settings
from models import Base  # importing this registers every model on Base.metadata

# Alembic Config object (values from alembic.ini).
config = context.config

# Set up Python logging per the .ini file.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate diffs the live DB against this metadata.
target_metadata = Base.metadata

# App settings — the single source of the DB URL (postgresql+asyncpg://...).
settings = get_settings()


def run_migrations_offline() -> None:
    """'Offline' mode: emit SQL using just the URL, no live DB connection."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    # Runs inside connection.run_sync(), so `connection` is a sync-style proxy.
    # compare_type=True so column type changes are detected on future autogenerates.
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an AsyncEngine, then run the (sync) migrations over an async conn."""
    connectable = create_async_engine(
        settings.DATABASE_URL,
        poolclass=pool.NullPool,  # one-shot connection; no pooling needed for migrations
        connect_args={"ssl": True},  # Neon requires SSL (matches database.py)
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """'Online' mode: drive the async engine via asyncio."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
