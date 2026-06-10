"""Pragya API — entry point. Registers startup/shutdown lifecycle, CORS
middleware, and all routers (routers added per session as they are built). Run
with: uvicorn main:app --reload --app-dir backend"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings, validate_settings
from database import create_tables
from qdrant import create_collection

logger = logging.getLogger(__name__)

settings = get_settings()
VERSION = "0.1.0"  # single source of truth for the app + /health version


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup (before yield) ──
    # 1. Fail fast if config is incomplete — better to crash here than to fail
    #    mid-request later with a cryptic KeyError/AttributeError.
    validate_settings(settings)
    # 2. Create tables if missing. Idempotent (checkfirst=True). Dev-only —
    #    production manages schema with Alembic migrations.
    await create_tables()
    # 3. Ensure the Qdrant collection exists before the first request arrives.
    #    Idempotent — skips silently if it already exists.
    await create_collection()
    logger.info("Pragya API started")

    yield

    # ── Shutdown (after yield) ──
    logger.info("Pragya API shutting down")


app = FastAPI(
    title="Pragya API",
    description="Enterprise RAG Knowledge Platform",
    version=VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — the Next.js frontend (dev ports 3000/3001) calls this API from the
# browser, so its origin must be explicitly allowed. Wildcard methods/headers
# are fine for dev; restrict origins (and ideally methods/headers) in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    # Unauthenticated liveness probe for Docker health checks / monitoring.
    # Dependency-free so it answers even if the DB or Qdrant hiccups.
    return {
        "status": "ok",
        "version": VERSION,
        "environment": settings.APP_ENV,
    }


# ── Routers (added per session as modules are built) ──────────────────────────
# Uncomment each router as its session is completed. Do NOT import routers that
# don't exist yet — that raises ImportError on startup and blocks all dev.
# from routers import auth, documents, chat, intelligence
# app.include_router(auth.router, prefix="/auth", tags=["auth"])
# app.include_router(documents.router, prefix="/documents", tags=["documents"])
# app.include_router(chat.router, prefix="/chat", tags=["chat"])
# app.include_router(intelligence.router, prefix="/intelligence", tags=["intelligence"])


if __name__ == "__main__":
    # For running directly with `python main.py` during development. Production
    # uses the uvicorn CLI (or a process manager) directly.
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
