"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createDepartment, getDepartments, login, register, updateMe } from "@/lib/api";
import { getUser, isLoggedIn, saveToken } from "@/lib/auth";
import type { Department } from "@/types";

function LogoMark() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-ink font-serif text-[16px] leading-none text-paper">
      P
    </span>
  );
}

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  // signup flows through two steps; step=1 is credentials, step=2 is department
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2 state — populated after register() succeeds
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [newDeptName, setNewDeptName] = useState("");
  // Whether the "create new department" inline form is expanded (admin-only edge case)
  const [creatingNew, setCreatingNew] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  useEffect(() => {
    if (isLoggedIn()) router.replace("/chat");
  }, [router]);

  function switchMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setStep(1);
    setError(null);
    setPassword("");
    setNewDeptName("");
    setSelectedDeptId("");
    setCreatingNew(false);
  }

  // ── Step 1: register (or sign in for existing users) ─────────────────────

  async function handleStep1() {
    if (loading) return;
    setError(null);

    if (isSignup && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      if (!isSignup) {
        // Sign-in path: no step 2 needed
        const res = await login(email, password);
        saveToken(res.access_token);
        router.replace("/chat");
        return;
      }

      // Register → save token immediately (needed for auth'd GET /departments)
      const res = await register(name, email, password);
      saveToken(res.access_token);

      // Fetch existing departments to decide which step-2 variant to show
      const depts = await getDepartments();
      setDepartments(depts);
      if (depts.length > 0) setSelectedDeptId(depts[0].id);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: assign department ─────────────────────────────────────────────

  async function handleStep2() {
    if (loading) return;
    setError(null);

    if (creatingNew && !newDeptName.trim()) {
      setError("Department name is required.");
      return;
    }

    setLoading(true);
    try {
      let deptId = selectedDeptId;

      if (creatingNew) {
        const dept = await createDepartment(newDeptName.trim());
        deptId = dept.id;
      }

      // Self-assign and get a fresh JWT with department_id set
      const tokenRes = await updateMe({ department_id: deptId });
      saveToken(tokenRes.access_token);
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (step === 1) handleStep1();
    else handleStep2();
  }

  const inputClass =
    "interactive w-full rounded-full border border-input bg-card px-5 py-3 font-sans text-[14px] text-primary placeholder:text-muted focus:border-accent focus:outline-none";

  // After registration, getUser() returns claims from the freshly saved JWT
  const isAdmin = getUser()?.role === "admin";

  return (
    <main className="flex min-h-screen items-center justify-center bg-main px-6">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="font-serif text-[26px] tracking-[-0.02em] text-primary">Pragya</span>
          </div>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
            Enterprise knowledge platform
          </p>
        </div>

        {/* Card */}
        <div className="mt-9 rounded-[12px] border border-border bg-card px-7 py-8">
          {/* Step indicator — only shown on step 2 */}
          {isSignup && step === 2 && (
            <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              Step 2 of 2
            </div>
          )}

          <h1 className="font-serif text-[20px] tracking-[-0.01em] text-primary">
            {!isSignup
              ? "Sign in"
              : step === 1
                ? "Create account"
                : creatingNew
                  ? "Create new department"
                  : "Choose your department"}
          </h1>

          <div className="mt-6 space-y-3">
            {/* ── Step 1 fields ── */}
            {step === 1 && (
              <>
                {isSignup && (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Name"
                    autoComplete="name"
                    className={inputClass}
                  />
                )}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Email"
                  autoComplete="email"
                  className={inputClass}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={isSignup ? "Password (min 8 characters)" : "Password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  className={inputClass}
                />
              </>
            )}

            {/* ── Step 2: department selector ── */}
            {step === 2 && !creatingNew && (
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="interactive w-full rounded-full border border-input bg-card px-5 py-3 font-sans text-[14px] text-primary focus:border-accent focus:outline-none"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}

            {/* ── Step 2: create new department (admin-only) ── */}
            {step === 2 && creatingNew && (
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Department name (e.g. Engineering)"
                autoFocus
                className={inputClass}
              />
            )}

            {/* Toggle — only admins can create new departments (others would get 403) */}
            {step === 2 && isAdmin && (
              <button
                type="button"
                onClick={() => { setCreatingNew((v) => !v); setError(null); }}
                className="interactive text-left font-sans text-[12px] text-muted hover:text-primary"
              >
                {creatingNew ? "← Choose existing department" : "or create a new department"}
              </button>
            )}
          </div>

          {/* Primary action */}
          <button
            type="button"
            onClick={step === 1 ? handleStep1 : handleStep2}
            disabled={loading}
            className="interactive mt-5 w-full rounded-full bg-ink-2 px-6 py-3 font-sans text-[14px] text-paper hover:opacity-90 active:scale-[0.98] disabled:opacity-60 dark:bg-paper dark:text-ink-2"
          >
            {loading
              ? step === 2
                ? creatingNew
                  ? "Creating department…"
                  : "Joining…"
                : isSignup
                  ? "Creating account…"
                  : "Signing in…"
              : step === 2
                ? creatingNew
                  ? "Create department"
                  : "Join department"
                : isSignup
                  ? "Continue"
                  : "Sign in"}
          </button>

          {/* Inline error */}
          {error && (
            <div className="mt-4 rounded-[8px] border border-border px-4 py-2.5 font-sans text-[12px] leading-[1.6] text-muted">
              {error}
            </div>
          )}

          {/* Mode toggle — only shown on step 1 */}
          {step === 1 && (
            <button
              type="button"
              onClick={switchMode}
              className="interactive mt-5 w-full text-center font-sans text-[12px] text-muted hover:text-primary"
            >
              {isSignup
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
