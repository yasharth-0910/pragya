"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { getDepartments, getDocuments, getMe, getSessionMessages, getSessions, queryChat } from "@/lib/api";
import type { MessageSource } from "@/types";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";

// Local view-model for a rendered turn. Mirrors a ChatMessage but also tracks the
// transient streaming/error/timing state the API's persisted shape doesn't carry.
type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: MessageSource[] | null;
  traceMs?: number; // client-measured send→[DONE]; only on a fresh turn
  streaming?: boolean;
  error?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/* ── Topbar theme toggle, styled for the paper surface ─────────────────────── */
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
      className="interactive flex h-9 w-9 items-center justify-center rounded-full border border-input text-muted hover:text-primary active:scale-[0.98]"
    >
      {mounted ? (
        isDark ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )
      ) : (
        <span className="h-[15px] w-[15px]" />
      )}
    </button>
  );
}

function ChatInner() {
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(searchParams.get("session"));
  const [streaming, setStreaming] = useState(false);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [deptName, setDeptName] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const startRef = useRef<number>(0);
  // Which session's transcript is currently loaded — guards the URL effect from
  // re-fetching (and clobbering a freshly streamed turn) on our own replaceState.
  const loadedSessionRef = useRef<string | null | undefined>(undefined);

  const updateMsg = useCallback((id: string, patch: Partial<UIMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  // Doc-count chip + dept name chip resolved in parallel
  useEffect(() => {
    getDocuments()
      .then((d) => setDocCount(d.length))
      .catch(() => setDocCount(null));
    Promise.all([getMe(), getDepartments()])
      .then(([u, depts]) => {
        const dept = depts.find((d) => d.id === u.department_id);
        setDeptName(dept?.name ?? null);
      })
      .catch(() => {});
  }, []);

  // Load a conversation when the URL ?session= changes (sidebar click, refresh,
  // or a new-chat navigation to /chat with no param). Skips when the URL already
  // matches what's loaded, so our own replaceState after the first answer is a no-op.
  useEffect(() => {
    const sid = searchParams.get("session");
    if (sid === loadedSessionRef.current) return;
    loadedSessionRef.current = sid;
    setSessionId(sid);
    if (!sid) {
      setMessages([]); // /chat with no session = a fresh, empty conversation
      return;
    }
    let cancelled = false;
    getSessionMessages(sid)
      .then((msgs) => {
        if (cancelled) return;
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            sources: m.sources,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Auto-scroll to the newest content (also fires as tokens append).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Abort an in-flight stream if the user navigates away mid-answer.
  useEffect(() => () => controllerRef.current?.abort(), []);

  // After [DONE]: discover the (possibly new) session id, sync the URL, then pull
  // the persisted sources. The assistant row is written server-side just after
  // [DONE], so we retry briefly until it appears (race with the stream's close).
  async function finalize(aiId: string) {
    let sid = sessionId;
    if (!sid) {
      const sessions = await getSessions().catch(() => []);
      if (sessions.length > 0) {
        sid = sessions[0].id; // sessions are ordered by most-recent activity
        setSessionId(sid);
        loadedSessionRef.current = sid; // pre-claim so the URL effect won't reload
        window.history.replaceState(null, "", `?session=${sid}`);
      }
    }
    if (!sid) return;

    for (let attempt = 0; attempt < 6; attempt++) {
      const msgs = await getSessionMessages(sid).catch(() => []);
      const last = msgs[msgs.length - 1];
      // Once the last persisted message is the assistant's, its sources are final
      // (null for an ungrounded / "no info" answer — that's correct, not a miss).
      if (last && last.role === "assistant") {
        updateMsg(aiId, { sources: last.sources ?? null });
        return;
      }
      await sleep(500);
    }
  }

  function handleSend(text: string) {
    if (streaming) return;

    const userMsg: UIMessage = { id: uid(), role: "user", content: text };
    const aiId = uid();
    const aiMsg: UIMessage = { id: aiId, role: "assistant", content: "", streaming: true };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setStreaming(true);
    startRef.current = Date.now();

    let acc = "";
    controllerRef.current = queryChat(text, sessionId ?? undefined, {
      onToken: (tok) => {
        acc += tok;
        updateMsg(aiId, { content: acc });
      },
      onError: (err) => {
        updateMsg(aiId, {
          streaming: false,
          error: err.message || "Something went wrong generating that answer.",
        });
        setStreaming(false);
      },
      onDone: () => {
        updateMsg(aiId, { streaming: false, traceMs: Date.now() - startRef.current });
        setStreaming(false);
        void finalize(aiId);
      },
    });
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen flex-col">
      {/* Topbar */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="font-serif text-[18px] tracking-[-0.01em] text-primary">
          Ask your knowledge base
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {deptName && (
              <span className="rounded-[5px] bg-chip px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-chip-text">
                {deptName}
              </span>
            )}
            {docCount != null && (
              <span className="rounded-[5px] bg-chip px-2 py-1 font-mono text-[10px] tracking-[0.04em] text-chip-text">
                {docCount} doc{docCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <p className="max-w-sm font-serif text-[17px] leading-[1.4] text-muted">
              Ask anything about your department&rsquo;s documents
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[75%] whitespace-pre-wrap rounded-[14px] rounded-br-[3px] bg-ink-2 px-4 py-2.5 font-sans text-[14px] leading-[1.6] text-paper">
                    {m.content}
                  </div>
                </div>
              ) : m.error ? (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[85%] rounded-[14px] rounded-tl-[3px] border border-border bg-card px-4 py-3 font-sans text-[13px] leading-[1.6] text-muted">
                    {m.error}
                  </div>
                </div>
              ) : (
                <ChatMessage
                  key={m.id}
                  content={m.content}
                  sources={m.sources}
                  traceMs={m.traceMs}
                  streaming={m.streaming}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-5 py-4">
        <div className="mx-auto max-w-3xl">
          <ChatInput onSend={handleSend} disabled={streaming} />
        </div>
      </div>
    </div>
  );
}

// useSearchParams requires a Suspense boundary for static rendering (Next 15).
export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-main" />}>
      <ChatInner />
    </Suspense>
  );
}
