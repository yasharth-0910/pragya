/**
 * The single place every backend call lives (CLAUDE.md §3: the frontend only ever
 * talks to FastAPI, never the DB). Each function names the endpoint it hits.
 *
 * Cross-cutting behavior handled here so callers don't repeat it:
 *   • Authorization: Bearer <token> is injected from localStorage on every call.
 *   • A 401 means the token is missing/expired/forged → we clear it and bounce to
 *     /login. The promise still rejects so callers don't proceed on stale state.
 */

import { clearToken, getToken } from "@/lib/auth";
import type {
  ChatSession,
  ChatMessage,
  Department,
  DepartmentWithCount,
  Document,
  DocumentStatus,
  DocumentUploadResponse,
  IntelligenceResponse,
  TokenResponse,
  User,
  UserAdmin,
} from "@/types";

// Base URL from env, with a localhost default for dev (CLAUDE.md: backend on :8000).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Thrown for any non-OK response, carrying the HTTP status + backend detail so
 *  UI can show the real message ("Incorrect email or password", etc.). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Build request headers, injecting the bearer token when present. JSON content
 *  type is opt-out (`json: false`) for multipart uploads, where the browser must
 *  set its own boundary-carrying Content-Type. */
function authHeaders(json = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** Common response handling: on 401 clear the token and redirect to /login; on any
 *  other error throw ApiError with the backend's `detail`; otherwise parse JSON. */
async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    clearToken();
    // Guard for SSR; in the browser send the user to re-authenticate.
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!res.ok) {
    // FastAPI errors are { detail: string | ... }; fall back to status text.
    const detail = await res.json().catch(() => null);
    const message =
      (detail && typeof detail.detail === "string" && detail.detail) ||
      res.statusText ||
      "Request failed";
    throw new ApiError(res.status, message);
  }
  // 204/202-with-empty-body safety: only parse when there's a JSON body.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Auth ────────────────────────────────────────────────────────────────────

/** POST /auth/register — create an account; returns a JWT + the new user. */
export async function register(
  name: string,
  email: string,
  password: string
): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, email, password }),
  });
  return handle<TokenResponse>(res);
}

/** POST /auth/login — exchange email + password for a JWT + the user. */
export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return handle<TokenResponse>(res);
}

/** GET /auth/me — the authenticated user's public profile (hydrates auth state). */
export async function getMe(): Promise<User> {
  const res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders() });
  return handle<User>(res);
}

// ── Documents ─────────────────────────────────────────────────────────────────

/** POST /documents/upload — multipart upload. Returns 202 immediately; the doc is
 *  "processing" until ingestion finishes, so poll getDocumentStatus(id). */
export async function uploadDocument(
  file: File,
  departmentId?: string
): Promise<DocumentUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  // Optional: server defaults to the uploader's own department when omitted.
  if (departmentId) form.append("department_id", departmentId);
  const res = await fetch(`${API_URL}/documents/upload`, {
    method: "POST",
    headers: authHeaders(false), // let the browser set the multipart boundary
    body: form,
  });
  return handle<DocumentUploadResponse>(res);
}

/** GET /documents/{id}/status — the polling target after an upload. */
export async function getDocumentStatus(id: string): Promise<DocumentStatus> {
  const res = await fetch(`${API_URL}/documents/${id}/status`, {
    headers: authHeaders(),
  });
  return handle<DocumentStatus>(res);
}

/** GET /documents[?status_filter=...] — list the caller's department documents.
 *  Note the backend query param is `status_filter` (e.g. "ready"), not `status`. */
export async function getDocuments(status?: string): Promise<Document[]> {
  const qs = status ? `?status_filter=${encodeURIComponent(status)}` : "";
  const res = await fetch(`${API_URL}/documents${qs}`, { headers: authHeaders() });
  return handle<Document[]>(res);
}

// ── Chat (SSE) ────────────────────────────────────────────────────────────────

/** Callbacks for the streamed chat answer. */
export interface ChatStreamHandlers {
  /** Fired for each token frame as the answer streams in. */
  onToken: (token: string) => void;
  /** Fired once after the backend sends [DONE]. */
  onDone?: () => void;
  /** Fired on a transport error, an HTTP error, or a backend [ERROR] frame. */
  onError?: (error: Error) => void;
}

/**
 * POST /chat/query — stream a grounded answer via Server-Sent Events.
 *
 * Why not a native EventSource? `EventSource` can only issue GET requests and
 * cannot attach an Authorization header, but this endpoint is a POST with a JSON
 * body behind bearer auth. So we read the SSE stream off `fetch`'s ReadableStream
 * by hand. Frames are `data: <text>\n\n`; the sentinels are `[DONE]` (success) and
 * a `[ERROR]...` prefix (generation failed mid-stream, e.g. a 429).
 *
 * Returns an AbortController so the caller can cancel an in-flight answer.
 */
export function queryChat(
  query: string,
  sessionId: string | undefined,
  handlers: ChatStreamHandlers
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_URL}/chat/query`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ query, session_id: sessionId ?? null }),
        signal: controller.signal,
      });

      // Auth/HTTP errors arrive before the stream opens — handle them like any call.
      if (res.status === 401) {
        clearToken();
        if (typeof window !== "undefined") window.location.href = "/login";
        throw new ApiError(401, "Session expired. Please sign in again.");
      }
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        throw new ApiError(
          res.status,
          (detail && detail.detail) || res.statusText || "Chat request failed"
        );
      }

      // Decode the byte stream into text and split on the SSE frame delimiter.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line ("\n\n"). Process complete
        // frames and keep any partial tail in the buffer for the next chunk.
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          if (!frame.startsWith("data: ")) continue;
          const data = frame.slice("data: ".length);

          if (data === "[DONE]") {
            handlers.onDone?.();
            return;
          }
          if (data.startsWith("[ERROR]")) {
            throw new Error(data.slice("[ERROR]".length).trim() || "Generation failed");
          }
          handlers.onToken(data);
        }
      }
      // Stream ended without an explicit [DONE]; treat as a clean finish.
      handlers.onDone?.();
    } catch (err) {
      // A caller-initiated abort isn't an error worth surfacing.
      if (err instanceof DOMException && err.name === "AbortError") return;
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return controller;
}

/** GET /chat/sessions — the caller's conversations, most recently active first. */
export async function getSessions(): Promise<ChatSession[]> {
  const res = await fetch(`${API_URL}/chat/sessions`, { headers: authHeaders() });
  return handle<ChatSession[]>(res);
}

/** DELETE /chat/sessions/{id} — permanently delete a session and its messages. */
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/chat/sessions/${sessionId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handle<void>(res);
}

/** GET /chat/sessions/{session_id}/messages — full transcript, oldest first. */
export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${API_URL}/chat/sessions/${sessionId}/messages`, {
    headers: authHeaders(),
  });
  return handle<ChatMessage[]>(res);
}

// ── Departments ───────────────────────────────────────────────────────────────

/** GET /departments — list all departments (any authenticated user). */
export async function getDepartments(): Promise<Department[]> {
  const res = await fetch(`${API_URL}/departments`, { headers: authHeaders() });
  return handle<Department[]>(res);
}

/** POST /departments — create a department. Allowed when table is empty (bootstrap)
 *  or by admins. */
export async function createDepartment(
  name: string,
  description?: string
): Promise<Department> {
  const res = await fetch(`${API_URL}/departments`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, description: description ?? null }),
  });
  return handle<Department>(res);
}

/** PATCH /auth/me — self-assign to a department; returns a fresh token. */
export async function updateMe(patch: {
  department_id: string;
  role?: string;
}): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/auth/me`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return handle<TokenResponse>(res);
}

// ── Admin ──────────────────────────────────────────────────────────────────────

/** GET /admin/users — all users with dept info (admin only). */
export async function getAdminUsers(): Promise<UserAdmin[]> {
  const res = await fetch(`${API_URL}/admin/users`, { headers: authHeaders() });
  return handle<UserAdmin[]>(res);
}

/** GET /admin/departments — all departments with member counts (admin only). */
export async function getAdminDepartments(): Promise<DepartmentWithCount[]> {
  const res = await fetch(`${API_URL}/admin/departments`, { headers: authHeaders() });
  return handle<DepartmentWithCount[]>(res);
}

/** PATCH /admin/users/{userId}/role — change a user's role (admin only). */
export async function updateUserRole(userId: string, role: string): Promise<UserAdmin> {
  const res = await fetch(`${API_URL}/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  });
  return handle<UserAdmin>(res);
}

// ── Document intelligence ──────────────────────────────────────────────────────

/** POST /intelligence/{document_id} — trigger (or return cached) generation.
 *  Idempotent server-side: a 200 means it already existed, 202 means it was just
 *  scheduled. We don't need the body here, so callers then poll getIntelligence. */
export async function triggerIntelligence(documentId: string): Promise<void> {
  const res = await fetch(`${API_URL}/intelligence/${documentId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  // Accept both 200 (cached) and 202 (scheduled); only real errors throw.
  if (!res.ok) await handle<unknown>(res);
}

/** GET /intelligence/{document_id} — fetch generated summary / key points /
 *  action items. 404 (ApiError) until generation has run. */
export async function getIntelligence(documentId: string): Promise<IntelligenceResponse> {
  const res = await fetch(`${API_URL}/intelligence/${documentId}`, {
    headers: authHeaders(),
  });
  return handle<IntelligenceResponse>(res);
}
