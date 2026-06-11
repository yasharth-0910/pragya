/**
 * Shared API types — the TypeScript mirror of the backend's Pydantic schemas
 * and ORM models. The frontend never touches the DB (CLAUDE.md §3), so these
 * describe exactly what crosses the HTTP boundary. Keep them in sync with
 * backend/schemas/*.py; field names and nullability match 1:1.
 *
 * UUIDs and datetimes arrive as JSON strings (ISO-8601 for dates), so both are
 * typed `string` here.
 */

// ── Identity / RBAC ─────────────────────────────────────────────────────────

/** Public user view → schemas/user.py:UserResponse (also the ORM users table).
 *  Never includes password_hash. Returned inside TokenResponse and by GET /auth/me. */
export interface User {
  id: string;
  name: string;
  email: string;
  /** Null for a global admin not tied to a department. */
  department_id: string | null;
  role: string; // "admin" | "user" | "viewer"
  is_active: boolean;
  created_at: string;
}

/** Department → models/user.py:Department (departments table). No response schema
 *  exposes this yet; shape mirrors the ORM columns for when an admin endpoint does. */
export interface Department {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

/** Auth success payload → schemas/user.py:TokenResponse. Returned by both
 *  register and login; bundles the JWT and the user so the UI can hydrate in one trip. */
export interface TokenResponse {
  access_token: string;
  token_type: string; // always "bearer"
  user: User;
}

/** Decoded JWT claims (display only, never trusted) → services/auth_service.py.
 *  `sub` is the user_id; verified server-side on every request. */
export interface JwtClaims {
  sub: string; // user_id
  department_id: string | null;
  role: string;
  exp: number; // seconds since epoch
  iat: number;
}

// ── Documents / ingestion ───────────────────────────────────────────────────

/** Full document view → schemas/document.py:DocumentResponse (documents table).
 *  Returned by GET /documents. Intelligence fields stay null until generated. */
export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  department_id: string;
  uploaded_by: string;
  status: string; // "processing" | "ready" | "failed"
  file_size: number | null;
  page_count: number | null; // null for DOCX
  chunk_count: number | null;
  summary: string | null;
  key_points: string[] | null;
  action_items: ActionItem[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Immediate upload ack (HTTP 202) → schemas/document.py:DocumentUploadResponse.
 *  status is "processing"; poll DocumentStatus with `id` until "ready". */
export interface DocumentUploadResponse {
  id: string;
  filename: string;
  original_filename: string;
  status: string;
  created_at: string;
}

/** Lightweight poll target → schemas/document.py:DocumentStatusResponse.
 *  GET /documents/{id}/status, hit every ~2s after upload. */
export interface DocumentStatus {
  id: string;
  status: string; // "processing" | "ready" | "failed"
  chunk_count: number | null;
  page_count: number | null; // null until ready, or N/A for DOCX
  error_message: string | null; // set only when status === "failed"
}

/** One hierarchical chunk → models/document.py:DocumentChunk (document_chunks table).
 *  No API endpoint returns these directly; typed for completeness / future use. */
export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  child_text: string; // 256-token piece that gets embedded + retrieved
  parent_text: string; // 1024-token piece sent to the LLM
  page_number: number | null; // null for DOCX
  qdrant_point_id: string | null;
  created_at: string;
}

// ── Chat / conversation ─────────────────────────────────────────────────────

/** One citation backing an answer → schemas/chat.py:MessageSource. Also the exact
 *  dict shape stored in chat_messages.sources (JSONB). Renders the [Source: N] chip. */
export interface MessageSource {
  filename: string;
  page: number | null; // null for DOCX sources
  citation_number: number; // the N in [Source: N]
}

/** A conversation turn → schemas/chat.py:ChatMessageResponse (chat_messages table).
 *  sources is null on user messages, populated on assistant answers. */
export interface ChatMessage {
  id: string;
  role: string; // "user" | "assistant"
  content: string;
  sources: MessageSource[] | null;
  created_at: string;
}

/** Conversation summary → schemas/chat.py:ChatSessionResponse (chat_sessions table).
 *  title is null until the first message auto-generates one. */
export interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

/** Body of POST /chat/query → schemas/chat.py:ChatRequest.
 *  session_id null starts a new conversation. */
export interface ChatRequest {
  query: string;
  session_id?: string | null;
}

/** Analytics/research record → models/chat.py:QueryLog (query_logs table). No
 *  endpoint returns these yet (Session 7 dashboard); typed to match the columns. */
export interface QueryLog {
  id: string;
  session_id: string | null;
  user_id: string;
  department_id: string;
  query_text: string;
  retrieval_method: string | null; // dense | hybrid | hybrid_rerank
  faithfulness_score: number | null;
  answer_relevancy_score: number | null;
  context_precision_score: number | null;
  answered: boolean;
  response_time_ms: number | null;
  created_at: string;
}

// ── Document intelligence ───────────────────────────────────────────────────

/** One extracted to-do → schemas/intelligence.py:ActionItem. owner/deadline are
 *  best-effort (null when the source text doesn't name them). */
export interface ActionItem {
  text: string;
  owner: string | null;
  deadline: string | null; // free-text as written ("next Friday", "Q3")
}

/** Full intelligence payload → schemas/intelligence.py:IntelligenceResponse.
 *  GET /intelligence/{document_id}. All fields null until generation runs. */
export interface IntelligenceResponse {
  document_id: string;
  summary: string | null;
  key_points: string[] | null;
  action_items: ActionItem[] | null;
  document_type: string | null; // policy | meeting_notes | technical | other
  word_count: number | null;
  created_at: string | null;
}
