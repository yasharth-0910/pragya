"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { getDepartments, getMe, getSessions } from "@/lib/api";
import { clearToken, getUser, isLoggedIn } from "@/lib/auth";
import type { ChatSession } from "@/types";

/* ── Icons (16px, hand-drawn strokes, no icon library — DESIGN.md §6) ──────── */

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.6 8.6 0 0 1-3.8-.9L3 20.5l1.5-5.6a8.4 8.4 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 3H8a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6l-3-3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M15 3v3h3M4 7v12a2 2 0 0 0 2 2h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15V4m0 0L8 8m4-4 4 4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Theme toggle ────────────────────────────────────────────────────────────── */

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="interactive flex h-8 w-8 items-center justify-center rounded-full text-paper/55 hover:bg-[#322d24] hover:text-paper active:scale-[0.98]"
    >
      {mounted ? (isDark ? <SunIcon /> : <MoonIcon />) : <span className="h-[15px] w-[15px]" />}
    </button>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function truncate(text: string, max = 32): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 172800) return "yesterday";
  return `${Math.floor(sec / 86400)}d ago`;
}

const COLLAPSED_W = 52;
const DEFAULT_W = 220;
const MIN_W = 180;
const MAX_W = 320;

/* ── App layout ──────────────────────────────────────────────────────────────── */

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [authorized, setAuthorized] = useState(false);
  const [checked, setChecked] = useState(false);

  const [name, setName] = useState<string | null>(null);
  const [deptName, setDeptName] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  // Sidebar state — initialised from localStorage after mount to avoid hydration mismatch
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_W);
  // Transitions enabled only after first paint so the sidebar doesn't animate
  // from its default to the stored position on every page load.
  const [transitionEnabled, setTransitionEnabled] = useState(false);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(true);

  const isResizing = useRef(false);

  // Auth gate
  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    setAuthorized(true);
    setChecked(true);
  }, [router]);

  // Read localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const c = localStorage.getItem("sidebar-collapsed") === "true";
    const w = parseInt(localStorage.getItem("sidebar-width") ?? String(DEFAULT_W), 10);
    setCollapsed(c);
    setSidebarWidth(isNaN(w) ? DEFAULT_W : Math.min(Math.max(w, MIN_W), MAX_W));
    // A rAF ensures the browser has painted once before we switch on transitions
    requestAnimationFrame(() => setTransitionEnabled(true));
  }, []);

  // Load user name + dept + sessions
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    Promise.all([getMe(), getDepartments()])
      .then(([u, depts]) => {
        if (cancelled) return;
        setName(u.name);
        const dept = depts.find((d) => d.id === u.department_id);
        setDeptName(dept?.name ?? null);
      })
      .catch(() => {});

    getSessions()
      .then((s) => !cancelled && setSessions(s))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [authorized]);

  // Refresh sessions when the route changes (new chat may have been created)
  useEffect(() => {
    if (!authorized) return;
    getSessions().then(setSessions).catch(() => {});
  }, [authorized, pathname]);

  // Drag-resize handler (global listeners, cleaned up on unmount)
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isResizing.current) return;
      const w = Math.min(Math.max(e.clientX, MIN_W), MAX_W);
      setSidebarWidth(w);
      localStorage.setItem("sidebar-width", String(w));
    }
    function onMouseUp() {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  if (!checked) return <div className="min-h-screen bg-main" />;
  if (!authorized) return <div className="min-h-screen bg-main" />;

  const claims = getUser();
  const isAdmin = claims?.role === "admin";

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  function onResizerMouseDown(e: React.MouseEvent) {
    if (collapsed) return;
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  const effectiveWidth = collapsed ? COLLAPSED_W : sidebarWidth;

  const navItemClass = (active: boolean) =>
    `interactive flex items-center rounded-[8px] px-2 py-2 font-sans text-[13.5px] ${
      active
        ? "bg-[#322d24] text-[#f0e9d9]"
        : "text-paper/70 hover:bg-[#2a251e] hover:text-paper"
    }`;

  /* ── Sidebar markup (shared by desktop fixed + mobile overlay) ─────────────── */
  function SidebarContent() {
    return (
      <aside
        style={{
          width: effectiveWidth,
          // Smooth width change only after first paint (no animation on load)
          transition: transitionEnabled ? "width 0.25s ease" : "none",
        }}
        className="flex h-full shrink-0 flex-col overflow-hidden bg-ink"
      >
        {/* ── Header: logo + collapse toggle ─────────────────────────── */}
        <div className="flex items-center justify-between px-3 pt-5 pb-4">
          {!collapsed && (
            <Link
              href="/chat"
              className="flex items-center gap-2 font-serif text-[16px] tracking-[-0.02em] text-paper"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-paper font-serif text-[13px] leading-none text-ink">
                P
              </span>
              Pragya
            </Link>
          )}
          {collapsed && (
            <Link
              href="/chat"
              className="mx-auto flex h-6 w-6 items-center justify-center rounded-[5px] bg-paper font-serif text-[13px] leading-none text-ink"
            >
              P
            </Link>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              className="interactive flex h-7 w-7 items-center justify-center rounded-[6px] text-paper/40 hover:bg-[#2a251e] hover:text-paper"
            >
              <ChevronLeftIcon />
            </button>
          )}
        </div>

        {/* ── Expand chevron when collapsed ──────────────────────────── */}
        {collapsed && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              className="interactive flex h-7 w-7 items-center justify-center rounded-[6px] text-paper/40 hover:bg-[#2a251e] hover:text-paper"
            >
              <ChevronRightIcon />
            </button>
          </div>
        )}

        {/* ── Search bar ─────────────────────────────────────────────── */}
        {!collapsed && (
          <div className="px-3 pb-3">
            {/* focus-within triggers amber glow — deliberate DESIGN.md exception (focus ring) */}
            <label className="flex cursor-text items-center gap-2 rounded-[8px] border border-[#322d24] px-3 py-2 text-paper/40 transition-shadow focus-within:shadow-[0_0_0_2px_rgba(232,200,126,0.3)]">
              <SearchIcon />
              <input
                type="text"
                placeholder="Search"
                className="flex-1 bg-transparent font-sans text-[12.5px] placeholder:text-paper/40 focus:outline-none"
              />
              <span className="font-mono text-[10px] tracking-[0.04em]">⌘K</span>
            </label>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center pb-3">
            <button
              type="button"
              aria-label="Search"
              className="interactive flex h-8 w-8 items-center justify-center rounded-[8px] text-paper/40 hover:bg-[#2a251e] hover:text-paper"
            >
              <SearchIcon />
            </button>
          </div>
        )}

        {/* ── Nav scrolls if content overflows ───────────────────────── */}
        <nav className="flex-1 overflow-y-auto px-2">
          {/* Section label with hairline separator */}
          {!collapsed && (
            <div className="mb-2 border-b border-[#322d24] px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/40">
              Workspace
            </div>
          )}

          {/* Primary nav items */}
          <div className="space-y-0.5">
            {(
              [
                { href: "/chat", label: "Chat", icon: <ChatIcon />, match: "/chat" },
                { href: "/conversations", label: "Conversations", icon: <HistoryIcon />, match: "/conversations" },
                { href: "/documents", label: "Documents", icon: <FilesIcon />, match: "/documents" },
                { href: "/documents", label: "Upload", icon: <UploadIcon />, match: null },
              ] as const
            ).map((item) => {
              const active = item.match !== null && pathname.startsWith(item.match);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={navItemClass(active)}
                >
                  <span className={collapsed ? "mx-auto" : "shrink-0"}>{item.icon}</span>
                  {!collapsed && <span className="ml-2.5">{item.label}</span>}
                </Link>
              );
            })}

            {/* Admin item — only for admins */}
            {isAdmin && (
              <Link
                href="/admin"
                title={collapsed ? "Admin" : undefined}
                className={navItemClass(pathname.startsWith("/admin"))}
              >
                <span className={collapsed ? "mx-auto" : "shrink-0"}>
                  <AdminIcon />
                </span>
                {!collapsed && <span className="ml-2.5">Admin</span>}
              </Link>
            )}
          </div>

          {/* Last chats — collapsible, 8 sessions */}
          {sessions.length > 0 && !collapsed && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setChatsOpen((o) => !o)}
                className="interactive flex w-full items-center gap-1.5 px-2 pb-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-paper/40 hover:text-paper/70"
              >
                {chatsOpen ? <ChevronDownIcon /> : <ChevronUpIcon />}
                Last chats
              </button>
              {chatsOpen && (
                <div className="space-y-0.5">
                  {sessions.slice(0, 8).map((s) => {
                    const active = pathname === "/chat" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("session") === s.id;
                    return (
                      <Link
                        key={s.id}
                        href={`/chat?session=${s.id}`}
                        className={`interactive flex items-center gap-2 rounded-[8px] px-2 py-1.5 ${
                          active
                            ? "bg-[#322d24] text-paper"
                            : "text-paper/55 hover:bg-[#2a251e] hover:text-paper"
                        }`}
                      >
                        <span className="shrink-0 text-paper/30">
                          <ChatIcon />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-sans text-[12px]">
                          {truncate(s.title ?? "New conversation")}
                        </span>
                        <span className="shrink-0 font-mono text-[9.5px] text-paper/30">
                          {relativeTime(s.updated_at)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Last chats icons — collapsed mode shows just chat dots */}
          {sessions.length > 0 && collapsed && (
            <div className="mt-4 space-y-0.5">
              {sessions.slice(0, 4).map((s) => (
                <Link
                  key={s.id}
                  href={`/chat?session=${s.id}`}
                  title={s.title ?? "Conversation"}
                  className="interactive flex h-8 w-8 mx-auto items-center justify-center rounded-[8px] text-paper/40 hover:bg-[#2a251e] hover:text-paper"
                >
                  <ChatIcon />
                </Link>
              ))}
            </div>
          )}
        </nav>

        {/* ── New chat (pinned above user pill) ──────────────────────── */}
        <div className="px-2 pb-2">
          <Link
            href="/chat"
            className={`interactive flex items-center justify-center rounded-[8px] border border-[#322d24] py-2 font-sans text-[13px] text-paper/70 hover:bg-[#2a251e] hover:text-paper ${
              collapsed ? "w-full" : "gap-2"
            }`}
          >
            <PlusIcon />
            {!collapsed && <span>New chat</span>}
          </Link>
        </div>

        {/* ── User pill + theme toggle + logout ──────────────────────── */}
        <div className="border-t border-[#322d24] px-2 py-3">
          {collapsed ? (
            /* Collapsed: just theme + logout stacked */
            <div className="flex flex-col items-center gap-1.5">
              <ThemeToggle />
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Sign out"
                className="interactive flex h-8 w-8 items-center justify-center rounded-full text-paper/55 hover:bg-[#322d24] hover:text-paper active:scale-[0.98]"
              >
                <LogoutIcon />
              </button>
            </div>
          ) : (
            /* Expanded: user pill with avatar circle + role badge */
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2 px-1">
                {/* 28px avatar circle — first letter of name */}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#322d24] font-serif text-[13px] text-paper/90">
                  {name?.[0]?.toUpperCase() ?? "U"}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-sans text-[11px] text-paper/85">
                      {name ?? "Account"}
                    </span>
                    {/* Role badge */}
                    {claims?.role === "admin" ? (
                      <span className="shrink-0 rounded-[3px] bg-accent px-1 py-px font-mono text-[8.5px] uppercase tracking-[0.08em] text-ink">
                        Admin
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-[0.08em] text-paper/35">
                        {claims?.role === "viewer" ? "Viewer" : "Member"}
                      </span>
                    )}
                  </div>
                  <div className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-paper/40">
                    {deptName ?? "—"}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Sign out"
                  className="interactive flex h-8 w-8 items-center justify-center rounded-full text-paper/55 hover:bg-[#322d24] hover:text-paper active:scale-[0.98]"
                >
                  <LogoutIcon />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <div className="flex min-h-screen bg-main">
      {/* ── Desktop sidebar (sticky, full height) ── */}
      <div className="sticky top-0 hidden h-screen md:block" style={{ width: effectiveWidth, transition: transitionEnabled ? "width 0.25s ease" : "none" }}>
        <SidebarContent />
        {/* 4px drag handle — col-resize cursor, only when expanded */}
        {!collapsed && (
          <div
            onMouseDown={onResizerMouseDown}
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[#322d24]"
            style={{ zIndex: 10 }}
          />
        )}
      </div>

      {/* ── Mobile: hamburger button (shown when sidebar is closed) ── */}
      {!mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="interactive fixed left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-[8px] bg-ink text-paper md:hidden"
        >
          <HamburgerIcon />
        </button>
      )}

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Sidebar panel */}
          <div className="fixed inset-y-0 left-0 z-50 md:hidden" style={{ width: DEFAULT_W }}>
            <SidebarContent />
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <main className="min-w-0 flex-1 bg-main">{children}</main>
    </div>
  );
}
