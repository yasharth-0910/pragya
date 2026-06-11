"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSession, getSessions } from "@/lib/api";
import type { ChatSession } from "@/types";

/* ── Icons ───────────────────────────────────────────────────────────────────── */

function HistoryIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-muted">
      <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.6 8.6 0 0 1-3.8-.9L3 20.5l1.5-5.6a8.4 8.4 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 172800) return "yesterday";
  return `${Math.floor(sec / 86400)}d ago`;
}

type DateGroup = { label: string; sessions: ChatSession[] };

function groupByDate(sessions: ChatSession[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86_400_000;
  const weekAgo = today - 7 * 86_400_000;

  const groups: DateGroup[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "This week", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const s of sessions) {
    const d = new Date(s.updated_at);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (dayStart >= today) groups[0].sessions.push(s);
    else if (dayStart >= yesterday) groups[1].sessions.push(s);
    else if (dayStart >= weekAgo) groups[2].sessions.push(s);
    else groups[3].sessions.push(s);
  }

  return groups.filter((g) => g.sessions.length > 0);
}

/* ── Session card ────────────────────────────────────────────────────────────── */

function SessionCard({
  session,
  onDeleted,
}: {
  session: ChatSession;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<"idle" | "confirm" | "pending">("idle");

  async function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (deleting === "idle") {
      setDeleting("confirm");
    } else if (deleting === "confirm") {
      setDeleting("pending");
      try {
        await deleteSession(session.id);
        onDeleted(session.id);
      } catch {
        setDeleting("idle");
      }
    }
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting("idle");
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/chat?session=${session.id}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/chat?session=${session.id}`)}
      className="group relative flex cursor-pointer items-start gap-3 rounded-[12px] border border-border bg-card px-4 py-3 transition-colors hover:border-[#322d24] hover:bg-subtle"
    >
      <ChatBubbleIcon />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="flex-1 truncate font-serif text-[14px] tracking-[-0.01em] text-primary">
            {session.title ?? "New conversation"}
          </p>
          <span className="shrink-0 font-mono text-[10px] text-muted">
            {relativeTime(session.updated_at)}
          </span>
        </div>
        {session.preview && (
          <p className="mt-0.5 truncate font-sans text-[12px] text-muted">
            {session.preview.slice(0, 80)}
          </p>
        )}
        {session.message_count > 0 && (
          <div className="mt-1.5">
            <span className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[9.5px] text-chip-text">
              {session.message_count} msg{session.message_count === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      {/* Delete — trash icon on hover, then inline confirm */}
      {deleting === "idle" ? (
        <button
          type="button"
          onClick={handleDeleteClick}
          aria-label="Delete conversation"
          className="absolute right-3 top-3 hidden h-6 w-6 items-center justify-center rounded-[5px] text-muted group-hover:flex hover:bg-subtle hover:text-primary"
        >
          <TrashIcon />
        </button>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-3 top-3 flex items-center gap-1.5"
        >
          {deleting === "confirm" ? (
            <>
              <span className="font-sans text-[11px] text-muted">Delete?</span>
              <button
                type="button"
                onClick={handleDeleteClick}
                className="interactive rounded-[5px] bg-accent px-2 py-0.5 font-sans text-[11px] text-ink"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="interactive rounded-[5px] border border-border px-2 py-0.5 font-sans text-[11px] text-muted hover:text-primary"
              >
                Cancel
              </button>
            </>
          ) : (
            <span className="font-mono text-[11px] text-muted">Deleting…</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────────── */

export default function ConversationsPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoaded(true));
  }, []);

  function handleDeleted(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  const groups = groupByDate(sessions);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-serif text-[18px] tracking-[-0.01em] text-primary">Conversations</h1>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {loaded && sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[12px] border border-border bg-card px-4 py-10 text-center">
            <HistoryIcon />
            <div>
              <p className="font-serif text-[16px] tracking-[-0.01em] text-primary">No conversations yet</p>
              <p className="mt-1 font-sans text-[13px] text-muted">Start a chat to see your history here.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(({ label, sessions: items }) => (
              <section key={label}>
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  {label}
                </div>
                <div className="space-y-2">
                  {items.map((s) => (
                    <SessionCard key={s.id} session={s} onDeleted={handleDeleted} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
