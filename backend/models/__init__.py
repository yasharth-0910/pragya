"""Models package — the single declarative Base and the model registry.

Alembic autogenerate diffs the live DB against Base.metadata, so EVERY model
module must be imported here; a model that isn't imported is invisible to
migrations and its table silently never gets created. database.py imports Base
from here too, so one Base is shared by the models, create_tables(), and Alembic.
"""

from sqlalchemy.orm import declarative_base

# The one Base every model subclasses. Defined here (the models/ ORM layer, per
# CLAUDE.md §3) so the models own it; database.py and Alembic import this exact
# object — never a second declarative_base().
Base = declarative_base()

# Import each model AFTER Base exists so the classes register on Base.metadata at
# package-import time (Alembic then sees every table). Order matters only in that
# Base must be defined first — the model modules do `from models import Base`, so
# importing them before the line above would be a circular import.
from models.user import Department, User  # noqa: E402
from models.document import Document, DocumentChunk  # noqa: E402
from models.chat import ChatMessage, ChatSession, QueryLog  # noqa: E402

__all__ = [
    "Base",
    "Department",
    "User",
    "Document",
    "DocumentChunk",
    "ChatSession",
    "ChatMessage",
    "QueryLog",
]
