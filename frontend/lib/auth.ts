/**
 * Client-side token storage + display-only JWT decoding.
 *
 * IMPORTANT: tokens are verified by the BACKEND on every request (it checks the
 * signature and expiry). The decode below is intentionally unverified — we never
 * trust these claims for access control, only to render the UI (showing the
 * user's department/role before a getMe() round-trip). Anything security-relevant
 * is enforced server-side.
 */

import type { JwtClaims } from "@/types";

// Single source of truth for the localStorage key, so api.ts and auth.ts agree.
const TOKEN_KEY = "pragya_token";

/** Persist the JWT after login/register. */
export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Read the stored JWT, or null if none / not in a browser (SSR-safe). */
export function getToken(): string | null {
  // typeof window guard: this module can be imported into a Server Component
  // tree; localStorage only exists in the browser.
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** Remove the JWT (logout, or after a 401 from the API layer). */
export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

/** True if a non-expired token is present. Display-gating only — the backend is
 *  the real authority and will 401 an expired/forged token regardless. */
export function isLoggedIn(): boolean {
  const claims = getUser();
  if (claims === null) return false;
  // exp is in seconds; Date.now() is ms. Treat an expired token as logged out.
  return claims.exp * 1000 > Date.now();
}

/** Decode (NOT verify) the JWT payload for display. Returns null if absent or
 *  malformed. Never use the result to make a trust decision. */
export function getUser(): JwtClaims | null {
  const token = getToken();
  if (token === null) return null;
  try {
    // A JWT is three base64url segments: header.payload.signature. We only read
    // the middle payload; we do NOT check the signature (that's the server's job).
    const payload = token.split(".")[1];
    if (!payload) return null;
    // base64url → base64, then decode. atob handles the rest.
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtClaims;
  } catch {
    // A garbage / tampered token simply reads as "logged out" in the UI.
    return null;
  }
}
