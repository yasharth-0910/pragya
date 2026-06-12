"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { getSessionMessages, queryChat } from "@/lib/api";
import { useDepartments, useDocuments, useMe, useSessions } from "@/lib/hooks";
import { exportChatAsPDF } from "@/lib/exportChat";
import type { MessageSource } from "@/types";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";

// Local view-model for a rendered turn.
type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: MessageSource[] | null;
  traceMs?: number;
  streaming?: boolean;
  error?: string;
  createdAt: number; // ms timestamp — used for relative-time display (Fix 4a)
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

// Relative time for message timestamps (updated every minute by a page-level tick).
function msgRelativeTime(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const SUGGESTION_CHIPS = [
  "What documents are available?",
  "Summarize the latest upload",
  "What are the key policies?",
] as const;

// Shown instead of the above when the chat is scoped to one document (?doc=).
const DOC_SUGGESTION_CHIPS = [
  "Summarise this document",
  "What are the key points?",
  "What action items are mentioned?",
] as const;

/* ── Tiny topbar glyphs (monochrome — DESIGN.md §8 forbids emoji in UI) ─────── */
function FileGlyphMini() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function XMini() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Topbar theme toggle ──────────────────────────────────────────────────── */
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
  const router = useRouter();
  const searchParams = useSearchParams();

  // Sessions come from the shared SWR cache (same data the sidebar shows), so the
  // title resolves instantly on navigation and finalize() can refresh on demand.
  const { data: sessions = [], mutate: mutateSessions } = useSessions();

  // Topbar chips + doc scoping read from the shared SWR caches (instant on revisit).
  const { data: documents = [] } = useDocuments();
  const { data: me } = useMe();
  const { data: departments = [] } = useDepartments();
  const docCount = documents.length;
  const deptName = departments.find((d) => d.id === me?.department_id)?.name ?? null;

  // ?doc=<id> scopes the whole conversation to one document — retrieval AND the UI.
  const docId = searchParams.get("doc");
  const scopedDoc = docId ? documents.find((d) => d.id === docId) ?? null : null;
  const scopedName = scopedDoc?.original_filename ?? null;

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(searchParams.get("session"));
  const [streaming, setStreaming] = useState(false);

  // Lifted text state so suggestion chips can prefill the input (Fix 4c)
  const [inputText, setInputText] = useState("");

  // Single page-level tick every 60s — causes relative timestamps to refresh (Fix 4a)
  const [, setTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const startRef = useRef<number>(0);
  const loadedSessionRef = useRef<string | null | undefined>(undefined);

  const updateMsg = useCallback((id: string, patch: Partial<UIMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  // Clear the doc scope: drop ?doc, keep the active session if there is one.
  function clearDocScope() {
    router.push(sessionId ? `/chat?session=${sessionId}` : "/chat");
  }

  // One timer for all relative timestamps — avoids N timers for N messages
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Load a conversation when the URL ?session= changes
  useEffect(() => {
    const sid = searchParams.get("session");
    if (sid === loadedSessionRef.current) return;
    loadedSessionRef.current = sid;
    setSessionId(sid);
    if (!sid) {
      setMessages([]);
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
            createdAt: new Date(m.created_at).getTime(),
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function finalize(aiId: string) {
    let sid = sessionId;
    if (!sid) {
      // A first message creates the session server-side; revalidate to pick up its
      // id (and refresh the sidebar history at the same time).
      const fresh = (await mutateSessions().catch(() => [])) ?? [];
      if (fresh.length > 0) {
        sid = fresh[0].id;
        setSessionId(sid);
        loadedSessionRef.current = sid;
        // Keep the doc scope in the URL so a reload stays scoped to the document.
        const docSuffix = docId ? `&doc=${docId}` : "";
        window.history.replaceState(null, "", `?session=${sid}${docSuffix}`);
      }
    }
    if (!sid) return;

    for (let attempt = 0; attempt < 6; attempt++) {
      const msgs = await getSessionMessages(sid).catch(() => []);
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        updateMsg(aiId, { sources: last.sources ?? null });
        return;
      }
      await sleep(500);
    }
  }

  function handleSend(text: string) {
    if (streaming) return;

    const now = Date.now();
    const userMsg: UIMessage = { id: uid(), role: "user", content: text, createdAt: now };
    const aiId = uid();
    const aiMsg: UIMessage = { id: aiId, role: "assistant", content: "", streaming: true, createdAt: now };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setStreaming(true);
    startRef.current = now;

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
    }, docId ?? undefined);
  }

  const isEmpty = messages.length === 0;
  // Title resolved from the cached sessions list — no separate fetch.
  const sessionTitle = sessions.find((s) => s.id === sessionId)?.title ?? null;

  return (
    <div className="flex h-screen flex-col">
      {/* Topbar */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="font-serif text-[18px] tracking-[-0.01em] text-primary">
          {sessionTitle ?? "Ask your knowledge base"}
        </h1>
        <div className="flex items-center gap-3">
          {docId ? (
            /* Doc-scoped banner — replaces the dept/doc chips. × clears the scope. */
            <span className="flex items-center gap-1.5 rounded-[5px] bg-chip py-1 pl-2 pr-1 font-mono text-[10px] text-chip-text">
              <FileGlyphMini />
              <span className="max-w-[220px] truncate">{scopedName ?? "Document"}</span>
              <button
                type="button"
                onClick={clearDocScope}
                aria-label="Clear document scope"
                className="interactive flex h-4 w-4 items-center justify-center rounded-full text-chip-text/70 hover:text-chip-text active:scale-[0.9]"
              >
                <XMini />
              </button>
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              {deptName && (
                <span className="rounded-[5px] bg-chip px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-chip-text">
                  {deptName}
                </span>
              )}
              {docCount > 0 && (
                <span className="rounded-[5px] bg-chip px-2 py-1 font-mono text-[10px] tracking-[0.04em] text-chip-text">
                  {docCount} doc{docCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
          {/* Export the loaded conversation to PDF (browser print). Only when there's
              something to export. */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => exportChatAsPDF({ title: sessionTitle }, messages)}
              aria-label="Export as PDF"
              title="Export as PDF"
              className="interactive flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-primary active:scale-[0.98]"
            >
              <DownloadIcon />
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
        {isEmpty ? (
          /* ── Empty state: time-based greeting + suggestion chips (Fix 4c) ── */
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <div>
              <p className="font-serif text-[22px] tracking-[-0.02em] text-primary">
                {getGreeting()}
              </p>
              <p className="mt-1.5 font-sans text-[13.5px] text-muted">
                {docId
                  ? `Ask anything about ${scopedName ?? "this document"}`
                  : "Ask anything about your department’s documents"}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {(docId ? DOC_SUGGESTION_CHIPS : SUGGESTION_CHIPS).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setInputText(chip)}
                  className="interactive rounded-full border border-input bg-card px-3.5 py-2 font-sans text-[12.5px] text-primary hover:bg-subtle active:scale-[0.97]"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m) =>
              m.role === "user" ? (
                /* User bubble */
                <div key={m.id}>
                  <div className="flex justify-end">
                    <div className="max-w-[75%] break-words whitespace-pre-wrap rounded-[14px] rounded-br-[3px] bg-ink-2 px-4 py-2.5 font-sans text-[14px] leading-[1.6] text-paper">
                      {m.content}
                    </div>
                  </div>
                  {/* Relative timestamp — bottom-right of bubble (Fix 4a) */}
                  <div className="mt-0.5 text-right font-mono text-[10px] text-muted">
                    {msgRelativeTime(m.createdAt)}
                  </div>
                </div>
              ) : m.error ? (
                /* Error bubble — amber left border (Fix 4d) */
                <div key={m.id} className="flex justify-start">
                  <div>
                    <div className="max-w-[85%] break-words rounded-[8px] border border-border border-l-[3px] border-l-accent bg-card px-4 py-3 font-sans text-[13px] leading-[1.6] text-primary">
                      {m.error}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted">
                      {msgRelativeTime(m.createdAt)}
                    </div>
                  </div>
                </div>
              ) : (
                /* Assistant message with markdown + copy button (Fix 4a + Fix 1) */
                <div key={m.id}>
                  <ChatMessage
                    content={m.content}
                    sources={m.sources}
                    traceMs={m.traceMs}
                    streaming={m.streaming}
                  />
                  {!m.streaming && (
                    <div className="mt-0.5 font-mono text-[10px] text-muted">
                      {msgRelativeTime(m.createdAt)}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Input — controlled by ChatInner so chips can prefill (Fix 4c) */}
      <div className="border-t border-border px-5 py-4">
        <div className="mx-auto max-w-3xl">
          <ChatInput
            value={inputText}
            onChange={setInputText}
            onSend={handleSend}
            disabled={streaming}
          />
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
