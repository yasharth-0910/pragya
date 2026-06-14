# Pragya backend — FastAPI + RAG pipeline.
# Base: python:3.11-slim (CLAUDE.md pins Python 3.11). "slim" = Debian minus the
# build/doc cruft; small base, but we add nothing heavy at the OS level because all
# our deps (PyMuPDF, asyncpg, cryptography, torch) ship prebuilt manylinux wheels.
FROM python:3.11-slim

# - PYTHONDONTWRITEBYTECODE: don't litter the image with .pyc files.
# - PYTHONUNBUFFERED: flush stdout/stderr immediately so `docker compose logs`
#   shows uvicorn output in real time instead of buffering it.
# - HF_HOME: pin the HuggingFace/sentence-transformers cache to a fixed path so
#   compose can mount a named volume here (see model_cache in docker-compose.yml)
#   and the ~85MB reranker survives container restarts instead of re-downloading.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/root/.cache/huggingface

WORKDIR /app

# Copy requirements FIRST, install, THEN copy the code. Docker caches each layer;
# as long as requirements.txt is unchanged this whole install layer is reused, so
# editing app code doesn't re-trigger the (slow) pip install on every rebuild.
COPY requirements.txt .

# HEAVY LAYER — EXPECT THIS TO BE SLOW AND THE IMAGE TO BE LARGE (multiple GB).
# sentence-transformers pulls in torch (the CPU wheel alone is ~600MB+ unpacked).
# This is inherent to running a local cross-encoder reranker; nothing is wrong if
# this step takes several minutes. --no-cache-dir keeps the pip download cache out
# of the final image to claw back some size.
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the backend source. The .dockerignore strips venv/, __pycache__,
# .env, and the evaluation results so none of that bloats the image or leaks in.
COPY . .

# FastAPI/uvicorn listens here; published to the host in docker-compose.yml.
EXPOSE 8000

# Secrets are NOT baked into the image — config.py reads them from the process
# environment, which compose injects via env_file/.env at run time.
# --host 0.0.0.0 so the server is reachable from outside the container (the
# default 127.0.0.1 would only accept connections from inside it).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
