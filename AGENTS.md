# AGENTS.md — Pragya

> Project memory for Codex. Read this fully at the start of every session.
> Pragya (प्रज्ञा, "wisdom") is an Enterprise RAG Knowledge Platform built as an
> internship project at HCL Infosystems. 6-week timeline. Builder is learning —
> explain non-obvious decisions in 1–2 comment lines as you go.

---

## 1. What this project is

An internal AI knowledge assistant for an organization. Employees ask questions
in natural language ("How many casual leaves do I get?") and get answers grounded
in their department's documents, with citations to the exact source file and page.

It is NOT a generic chatbot. The defining features are:
- **Hybrid retrieval** (dense semantic + sparse BM25 keyword) — not dense-only.
- **Citation grounding** — every answer cites `[Source: filename, page X]`.
- **Department-level access control** enforced at the vector-DB query level.

---

## 2. Tech stack (verified April 2026 — do not substitute without checking)

| Layer        | Choice                                   | Notes |
|--------------|------------------------------------------|-------|
| Backend      | FastAPI (async), Python 3.11             | venv at `backend/venv` |
| ORM          | SQLAlchemy (async)                       | not Prisma — DB logic lives in Python |
| Migrations   | Alembic                                  | autogenerate from models |
| Database     | Neon DB (serverless PostgreSQL, cloud)   | `DATABASE_URL` in `.env`, needs SSL |
| Vector DB    | Qdrant (local Docker, `localhost:6333`)  | native hybrid search |
| Embeddings   | `gemini-embedding-001` @ **768 dims**    | text-embedding-004 deprecated 2026-01-14; truncate 3072→768 via Matryoshka |
| LLM (chat)   | Gemini Flash — **model string from config** | confirm exact name in Google AI Studio; store as `GEMINI_CHAT_MODEL` env var |
| Reranker     | `cross-encoder/ms-marco-MiniLM-L-6-v2`   | sentence-transformers, runs locally, ~85MB first download |
| PDF parse    | PyMuPDF (`fitz`)                         | keeps page numbers |
| DOCX / PPTX  | `python-docx` / `python-pptx`            | |
| Frontend     | Next.js 15 (App Router) + Tailwind       | built LAST, after backend works |
| Eval         | RAGAS                                    | faithfulness, answer relevancy, context precision |
| Auth         | JWT (`python-jose`) + bcrypt (`passlib`) | **email + password only, no OAuth** |

**Free-tier discipline:** Gemini free tier limits are per-project, by RPM / TPM / RPD,
reset midnight Pacific. A 429 means a limit was hit. Run RAGAS experiments deliberately
and cache results — never in a casually re-run loop.

---

## 3. Architecture rules (do not violate)

- **3-layer backend**, strictly:
  - `routers/` — HTTP only: validate input, call a service, return response. No logic.
  - `services/` — all business logic (chunking, retrieval, generation, etc.).
  - `models/` — SQLAlchemy ORM. DB access only.
- All config via `pydantic-settings` from `.env`. No hardcoded secrets or model names.
- Async everywhere in the backend.
- UUID primary keys on every table.
- Type hints on every function.
- Frontend never touches the DB. It only calls FastAPI endpoints via `lib/api.ts`.
- Frontend aesthetics: ALWAYS follow DESIGN.md exactly. Never invent colors, fonts, or effects outside it.

---

## 4. The two core flows

**Ingestion (on document upload):**
```
upload → parse (PyMuPDF/docx/pptx) → clean text → hierarchical chunk
→ embed children (gemini-embedding-001, 768d) → upsert to Qdrant (+payload)
→ save metadata to Neon DB
```

**Query (on user question):**
```
question → JWT → dept_id → embed query
→ dense retrieval (top 20) + BM25 sparse retrieval (top 20)
→ RRF fusion (dedupe, ~40 pooled) → cross-encoder rerank → top 5 parent chunks
→ citation-enforced prompt → Gemini Flash → SSE stream to UI
→ log query to Neon DB (for analytics + RAGAS)
```

---

## 5. Chunking spec

- **Child chunks**: 256 tokens, 20% overlap. These are embedded and retrieved.
- **Parent chunks**: 1024 tokens. Stored as Qdrant payload `parent_text`.
- Retrieve on children (precision); generate from parents (context).
- Edge case: documents shorter than 256 tokens must not produce empty parents —
  fall back to using the whole document as both child and parent.

---

## 6. Qdrant collection spec

- Collection name: `pragya_docs` (from `QDRANT_COLLECTION`).
- Named vectors: one **dense** (768d, cosine) + one **sparse** (BM25).
- Payload fields (every point): `document_id`, `department_id`, `chunk_index`,
  `parent_text`, `source_filename`, `page_number`.
- **Every** query filters `must: department_id == <jwt dept_id>`. This is the RBAC
  boundary — never query Qdrant without it.

---

## 7. Database tables (Neon DB)

`departments`, `users`, `documents`, `document_chunks`, `chat_sessions`,
`chat_messages`, `query_logs`. UUID PKs. Key columns:
- `users`: name, email (unique), password_hash, department_id (FK), role (admin/user/viewer)
- `documents`: filename, department_id, uploaded_by, status (processing/ready/failed),
  summary, key_points (JSON), action_items (JSON)
- `document_chunks`: document_id, chunk_index, child_text, parent_text, page_number, qdrant_point_id
- `chat_messages`: session_id, role (user/assistant), content, sources (JSON)
- `query_logs`: session_id, query_text, faithfulness_score, answered (bool) — feeds analytics + paper

---

## 8. Auth spec (no OAuth)

- **Signup**: name, email, password → bcrypt hash → store user → return JWT.
- **Login**: email, password → verify bcrypt → return JWT.
- JWT payload: `user_id`, `department_id`, `role`, `exp` (8h).
- `get_current_user` dependency decodes the Bearer token on every protected route.
- `require_admin` dependency raises 403 if role != admin.

---

## 9. Module build order (DO NOT skip ahead)
r
1. **Foundation** — config, database, qdrant client, models, migrations, health check.
2. **Auth + RBAC** — signup, login, JWT, role dependencies.
3. **Ingestion** — parsers, chunker, embedder, Qdrant upsert, upload endpoint.
4. **RAG chat** — dense → +BM25 → +RRF → +reranker → citation prompt → SSE. (research core)
5. **Doc intelligence** — summary / key points / action items.
6. **Conversation history** — sessions, multi-turn context.
7. **Analytics dashboard** (stretch) — top queries, unanswered, doc usage.
8. **Meeting assistant** (stretch) — transcript → summary / decisions / action items. Text only.

One module per session. Test and git-commit each module before starting the next.

---

## 10. Research angle (optional, high value for grad school)

Controlled comparison on one corpus + 50 fixed test questions:
- A: dense-only  ·  B: hybrid (dense+BM25+RRF)  ·  C: hybrid + reranker
- Metrics: RAGAS faithfulness, answer relevancy, context precision + Recall@5
- Output: a results table. Target: IEEE COMPSAC / ICCIT.

---

## 11. Definition of done (per module)

- Runs without error and is testable via `/docs` (backend) or the UI.
- Follows the 3-layer rule.
- No hardcoded config.
- Committed to git with a clear message.
- Builder can explain what it does and why (for the LOR + interviews).