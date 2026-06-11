"use client";

import { useEffect, useState } from "react";
import { ApiError, getAdminDepartments, getAdminUsers, updateUserRole } from "@/lib/api";
import { getUser } from "@/lib/auth";
import type { DepartmentWithCount, UserAdmin } from "@/types";

export default function AdminPage() {
  const [depts, setDepts] = useState<DepartmentWithCount[]>([]);
  const [users, setUsers] = useState<UserAdmin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null); // userId being changed

  const currentUserId = getUser()?.sub;

  useEffect(() => {
    Promise.all([getAdminDepartments(), getAdminUsers()])
      .then(([d, u]) => {
        setDepts(d);
        setUsers(u);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load admin data.");
      })
      .finally(() => setLoaded(true));
  }, []);

  async function handlePromote(userId: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "user" : "admin";
    setPromoting(userId);
    setError(null);
    try {
      const updated = await updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Role update failed.");
    } finally {
      setPromoting(null);
    }
  }

  const labelClass =
    "mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-serif text-[18px] tracking-[-0.01em] text-primary">Admin</h1>
      </header>

      <div className="mx-auto max-w-3xl space-y-10 px-6 py-8">
        {error && (
          <div className="rounded-[8px] border border-border px-4 py-2.5 font-sans text-[12px] text-muted">
            {error}
          </div>
        )}

        {/* ── Departments ─────────────────────────────────────────────── */}
        <section>
          <div className={labelClass}>Departments</div>
          {!loaded ? (
            <p className="font-sans text-[13px] text-muted">Loading…</p>
          ) : depts.length === 0 ? (
            <p className="font-sans text-[13px] text-muted">No departments yet.</p>
          ) : (
            <div className="space-y-2">
              {depts.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-[12px] border border-border bg-card px-4 py-3"
                >
                  <span className="font-sans text-[13.5px] text-primary">{d.name}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {d.user_count} {d.user_count === 1 ? "member" : "members"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Users ───────────────────────────────────────────────────── */}
        <section>
          <div className={labelClass}>Users</div>
          {!loaded ? (
            <p className="font-sans text-[13px] text-muted">Loading…</p>
          ) : users.length === 0 ? (
            <p className="font-sans text-[13px] text-muted">No users yet.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-4 rounded-[12px] border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-[13.5px] text-primary">{u.name}</span>
                      <span className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-chip-text">
                        {u.role}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted">
                      {u.email}
                      {u.department_name ? ` · ${u.department_name}` : ""}
                    </div>
                  </div>

                  {/* Can't strip your own admin role */}
                  {u.id !== currentUserId && (
                    <button
                      type="button"
                      disabled={promoting === u.id}
                      onClick={() => handlePromote(u.id, u.role)}
                      className="interactive shrink-0 rounded-full border border-input px-3 py-1.5 font-sans text-[12px] text-primary hover:bg-subtle active:scale-[0.97] disabled:opacity-50"
                    >
                      {promoting === u.id
                        ? "…"
                        : u.role === "admin"
                          ? "Remove admin"
                          : "Make admin"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
