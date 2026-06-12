"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  ApiError,
  getAdminDepartments,
  getAdminUsers,
  updateUserRole,
  getAnalyticsOverview,
  getTopQueries,
  getUnansweredQueries,
  getQueriesOverTime,
  getDepartmentActivity,
  type AnalyticsOverview,
  type TopQuery,
  type UnansweredQuery,
  type QueryOverTime,
  type DepartmentActivity,
} from "@/lib/api";
import { getUser } from "@/lib/auth";
import type { DepartmentWithCount, UserAdmin } from "@/types";

// AMBER from DESIGN.md § constants — used directly in Recharts because SVG
// attributes don't resolve CSS variables.
const AMBER = "#e8c87e";

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function MetricCard({
  label,
  value,
  sub,
  amber,
}: {
  label: string;
  value: string | number;
  sub?: string;
  amber?: boolean;
}) {
  return (
    <div
      className={`rounded-[12px] border bg-card px-5 py-4 ${
        amber ? "border-accent" : "border-border"
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
        {label}
      </div>
      <div
        className={`mt-1.5 font-serif text-[28px] tracking-[-0.02em] ${
          amber ? "text-accent" : "text-primary"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-[10px] text-muted">{sub}</div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
      {children}
    </div>
  );
}

const TOOLTIP_STYLE = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--text-primary)",
} as const;

export default function AdminPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [topQueries, setTopQueries] = useState<TopQuery[]>([]);
  const [unanswered, setUnanswered] = useState<UnansweredQuery[]>([]);
  const [overTime, setOverTime] = useState<QueryOverTime[]>([]);
  const [deptActivity, setDeptActivity] = useState<DepartmentActivity[]>([]);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);

  const [depts, setDepts] = useState<DepartmentWithCount[]>([]);
  const [users, setUsers] = useState<UserAdmin[]>([]);
  const [mgmtLoaded, setMgmtLoaded] = useState(false);
  const [mgmtError, setMgmtError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);

  const currentUserId = getUser()?.sub;

  useEffect(() => {
    Promise.all([
      getAnalyticsOverview(),
      getTopQueries(),
      getUnansweredQueries(),
      getQueriesOverTime(),
      getDepartmentActivity(),
    ])
      .then(([ov, tq, un, ot, da]) => {
        setOverview(ov);
        setTopQueries(tq);
        setUnanswered(un);
        setOverTime(ot);
        setDeptActivity(da);
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoaded(true));

    Promise.all([getAdminDepartments(), getAdminUsers()])
      .then(([d, u]) => {
        setDepts(d);
        setUsers(u);
      })
      .catch((err) => {
        setMgmtError(
          err instanceof ApiError ? err.message : "Failed to load admin data."
        );
      })
      .finally(() => setMgmtLoaded(true));
  }, []);

  async function handlePromote(userId: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "user" : "admin";
    setPromoting(userId);
    setMgmtError(null);
    try {
      const updated = await updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setMgmtError(err instanceof ApiError ? err.message : "Role update failed.");
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-serif text-[18px] tracking-[-0.01em] text-primary">
          Analytics
        </h1>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">

        {/* ── Row 1: Metric cards ─────────────────────────────────────────── */}
        {!analyticsLoaded ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-[12px] border border-border bg-card"
              />
            ))}
          </div>
        ) : (
          overview && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard
                label="Total queries"
                value={overview.total_queries.toLocaleString()}
              />
              <MetricCard
                label="Docs indexed"
                value={overview.total_documents.toLocaleString()}
              />
              <MetricCard
                label="Unanswered"
                value={overview.unanswered_queries.toLocaleString()}
                sub={
                  overview.total_queries > 0
                    ? `${Math.round(
                        (overview.unanswered_queries / overview.total_queries) *
                          100
                      )}% of total`
                    : undefined
                }
                amber={overview.unanswered_queries > 0}
              />
              <MetricCard
                label="Avg response"
                value={
                  overview.avg_response_time_ms != null
                    ? `${Math.round(overview.avg_response_time_ms)}ms`
                    : "—"
                }
                sub={
                  overview.avg_faithfulness != null
                    ? `faithfulness ${overview.avg_faithfulness.toFixed(2)}`
                    : undefined
                }
              />
            </div>
          )
        )}

        {/* ── Row 2: Line chart + Dept table ──────────────────────────────── */}
        <div className="flex flex-col gap-5 md:flex-row">
          <div className="flex-[3] rounded-[12px] border border-border bg-card px-5 py-4">
            <SectionLabel>Queries over time (30 days)</SectionLabel>
            {!analyticsLoaded ? (
              <div className="h-[180px] animate-pulse rounded-[8px] bg-subtle" />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={overTime}
                  margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                    tickLine={false}
                    axisLine={false}
                    interval={6}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(v) => fmtDate(String(v))}
                    formatter={(v) => [v, "queries"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={AMBER}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, fill: AMBER }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex-[2] rounded-[12px] border border-border bg-card px-5 py-4">
            <SectionLabel>Department activity</SectionLabel>
            {!analyticsLoaded ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-7 animate-pulse rounded-[6px] bg-subtle"
                  />
                ))}
              </div>
            ) : deptActivity.length === 0 ? (
              <p className="font-sans text-[12px] text-muted">No data yet.</p>
            ) : (
              <div>
                <div className="mb-2 grid grid-cols-4 gap-1">
                  {["Dept", "Q", "Docs", "Users"].map((h) => (
                    <span
                      key={h}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted"
                    >
                      {h}
                    </span>
                  ))}
                </div>
                {deptActivity.map((d) => (
                  <div
                    key={d.department_id}
                    className="grid grid-cols-4 gap-1 border-t border-border py-1.5 first:border-0"
                  >
                    <span className="truncate font-sans text-[11.5px] text-primary">
                      {d.department_name}
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      {d.query_count}
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      {d.document_count}
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      {d.user_count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 3: Unanswered queries ────────────────────────────────────── */}
        {analyticsLoaded && unanswered.length > 0 && (
          <div className="rounded-[12px] border border-border bg-card px-5 py-4">
            <SectionLabel>Unanswered queries</SectionLabel>
            <div className="mb-2 grid grid-cols-[1fr_160px_72px] gap-3">
              {["Query", "Department", "Time"].map((h) => (
                <span
                  key={h}
                  className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted"
                >
                  {h}
                </span>
              ))}
            </div>
            {unanswered.map((q, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_160px_72px] gap-3 border-t border-border py-2 first:border-0"
              >
                <span className="truncate font-sans text-[12.5px] text-primary">
                  {q.query_text}
                </span>
                <span className="truncate font-sans text-[12px] text-muted">
                  {q.department_name}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {relTime(q.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Row 4: Top query topics ──────────────────────────────────────── */}
        <div className="rounded-[12px] border border-border bg-card px-5 py-4">
          <SectionLabel>Top query topics</SectionLabel>
          {!analyticsLoaded ? (
            <div className="h-[180px] animate-pulse rounded-[8px] bg-subtle" />
          ) : topQueries.length === 0 ? (
            <p className="font-sans text-[12px] text-muted">No queries yet.</p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(100, topQueries.length * 30)}
            >
              <BarChart
                data={topQueries}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="query_preview"
                  width={220}
                  tick={{ fontSize: 10, fill: "var(--text-primary)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) =>
                    v.length > 34 ? v.slice(0, 32) + "…" : v
                  }
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v) => [v, "times asked"]}
                />
                <Bar
                  dataKey="count"
                  fill={AMBER}
                  radius={[0, 3, 3, 0]}
                  barSize={12}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Divider ──────────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            User management
          </div>
        </div>

        {mgmtError && (
          <div className="rounded-[8px] border border-border px-4 py-2.5 font-sans text-[12px] text-muted">
            {mgmtError}
          </div>
        )}

        {/* ── Departments ──────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Departments</SectionLabel>
          {!mgmtLoaded ? (
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
                  <span className="font-sans text-[13.5px] text-primary">
                    {d.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {d.user_count} {d.user_count === 1 ? "member" : "members"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Users ────────────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Users</SectionLabel>
          {!mgmtLoaded ? (
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
                      <span className="font-sans text-[13.5px] text-primary">
                        {u.name}
                      </span>
                      <span className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-chip-text">
                        {u.role}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted">
                      {u.email}
                      {u.department_name ? ` · ${u.department_name}` : ""}
                    </div>
                  </div>
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
