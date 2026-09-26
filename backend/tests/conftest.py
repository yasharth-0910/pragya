"""Test bootstrap.

Service modules call get_settings() at import time (database.py builds its engine
from it), which requires these four vars. Dummy values are enough: nothing here
connects to Neon, Qdrant or Gemini. setdefault keeps a developer's real env intact.
"""

import os
import sys
from pathlib import Path

for key, value in {
    "DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test",
    "GEMINI_API_KEY": "test",
    "GEMINI_CHAT_MODEL": "test",
    "SECRET_KEY": "test",
}.items():
    os.environ.setdefault(key, value)

# Backend modules use top-level imports (`from config import ...`).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
