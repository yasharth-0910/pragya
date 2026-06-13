"""Application configuration.

All settings are loaded from the .env file via pydantic-settings — no secrets or
model names are ever hardcoded (CLAUDE.md §3). Exposes a cached `get_settings()`
accessor and a `validate_settings()` that fails fast on startup if a required
secret is missing or blank.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the repo root, one level above backend/. Resolve it to an
# absolute path so config loads correctly regardless of the working directory
# (e.g. running uvicorn from backend/).
ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    # Read from the .env file (UTF-8) at the absolute path computed above.
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8")

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str
    # Must use the `postgresql+asyncpg://` driver prefix and a `?ssl=require`
    # suffix — Neon serverless is async-accessed and mandates SSL.

    # ── Qdrant ────────────────────────────────────────────────────────────
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION: str = "pragya_docs"

    # ── Gemini ────────────────────────────────────────────────────────────
    GEMINI_API_KEY: str
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"
    # text-embedding-004 was deprecated 2026-01-14; gemini-embedding-001 replaces it.
    GEMINI_CHAT_MODEL: str
    # Confirm the exact string from the Google AI Studio dashboard — never
    # hardcode it; keeping it in .env makes the chat model trivial to swap.
    GEMINI_EMBEDDING_DIMENSIONS: int = 768
    # Matryoshka truncation 3072 → 768: keeps the Qdrant collection small
    # without a meaningful quality loss.

    # ── Groq (RAGAS evaluation judge only) ────────────────────────────────
    GROQ_API_KEY: str = ""
    # Used ONLY by the RAGAS evaluation harness (backend/evaluation/) as an
    # independent judge LLM (llama-3.1-8b-instant), so the generator (Gemini) is
    # never grading its own answers. Empty-string default so the app boots
    # without it — only the offline eval scripts read this key.
    GROQ_API_KEY_2: str = ""
    GROQ_API_KEY_3: str = ""
    # Extra Groq keys (separate accounts → separate 500k tokens/day budgets). The
    # eval harness assigns one key per retrieval experiment so a single account's
    # daily cap can't stall the whole comparison. Eval-only; empty defaults.

    # ── Auth ──────────────────────────────────────────────────────────────
    SECRET_KEY: str
    # 64-char random hex used to sign JWTs — never commit this to git.
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8

    # ── App ───────────────────────────────────────────────────────────────
    APP_ENV: str = "development"
    MAX_UPLOAD_SIZE_MB: int = 50
    EMBEDDING_BATCH_SIZE: int = 20
    # Batch size for embedding calls — kept small as a Gemini free-tier
    # rate-limit buffer (RPM/TPM caps reset midnight Pacific).


@lru_cache
def get_settings() -> Settings:
    # Cached so the .env is read and parsed once at first call, not on every
    # request that needs config.
    return Settings()


def validate_settings(s: Settings) -> None:
    # Fail fast on startup rather than mid-request when a key is missing/blank.
    # (Fields without defaults already raise at load time; this also catches
    # present-but-empty values like SECRET_KEY="".)
    required = ["DATABASE_URL", "GEMINI_API_KEY", "GEMINI_CHAT_MODEL", "SECRET_KEY"]
    missing = [k for k in required if not getattr(s, k, None)]
    if missing:
        raise RuntimeError(
            f"Missing required env vars: {missing}\n"
            f"Check your .env file."
        )
