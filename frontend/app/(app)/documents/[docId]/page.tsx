"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, getDocuments, getIntelligence, triggerIntelligence } from "@/lib/api";
import type { Document, IntelligenceResponse } from "@/types";

const POLL_MS = 3000;
const MAX_ATTEMPTS = 20; // ~60s of polling before we offer a manual retry

type Phase = "analysing" | "done" | "error" | "timeout";

// Bytes → human size; null (unknown) stays null so the meta line can omit it.
function formatBytes(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

// "meeting_notes" → "Meeting notes" for the document-type badge.
function prettyType(t: string): string {
  const s = t.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extensionOf(filename: string): string {
  return filename.includes(".") ? filename.split(".").pop()!.toUpperCase() : "FILE";
}

// Monochrome file glyph (DESIGN.md: amber is the only accent; type shown via chip).
function FileGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted">
      <path
        d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// Small ink square with a paper check — the action-item marker (DESIGN.md §5).
function CheckSquare() {
  return (
    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-ink text-paper">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
      {children}
    </div>
  );
}

export default function IntelligencePage() {
  const { docId } = useParams<{ docId: string }>();

  const [doc, setDoc] = useState<Document | null>(null);
  const [intel, setIntel] = useState<IntelligenceResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("analysing");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Bumping this re-runs the whole effect (used by the timeout "retry" button).
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!docId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    // 1) Metadata: no single-doc GET exists, so find it in the dept list.
    async function loadMetadata(): Promise<boolean> {
      try {
        const docs = await getDocuments();
        if (!active) return false;
        const found = docs.find((d) => d.id === docId) ?? null;
        setDoc(found);
        if (!found) {
          setPhase("error");
          setErrorMsg("Document not found.");
          return false;
        }
        return true;
      } catch {
        if (active) {
          setPhase("error");
          setErrorMsg("Couldn't load this document.");
        }
        return false;
      }
    }

    // 3) Poll until the summary appears (404 = not generated yet → keep waiting).
    async function poll() {
      if (!active) return;
      try {
        const data = await getIntelligence(docId);
        if (!active) return;
        if (data.summary != null) {
          setIntel(data);
          setPhase("done");
          return;
        }
      } catch (err) {
        if (err instanceof ApiError && err.status !== 404 && active) {
          // A non-404 error (e.g. 403) is terminal — stop and surface it.
          setPhase("error");
          setErrorMsg(err.message);
          return;
        }
        // 404 → fall through and retry.
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        if (active) setPhase("timeout");
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    }

    async function run() {
      setPhase("analysing");
      setErrorMsg(null);
      if (!(await loadMetadata())) return;

      // 2) Kick off generation (idempotent: 200 if cached, 202 if newly scheduled).
      try {
        await triggerIntelligence(docId);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 400) {
          // Document hasn't finished ingestion — can't summarize it yet.
          setPhase("error");
          setErrorMsg("This document is still processing. Try again once it's ready.");
          return;
        }
        // Other trigger errors: still try polling — intelligence may already exist.
      }
      poll();
    }

    run();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [docId, retryNonce]);

  const metaParts = doc
    ? [formatBytes(doc.file_size), doc.page_count != null ? `${doc.page_count} pages` : null].filter(
        Boolean
      )
    : [];

  return (
    <div className="min-h-screen">
      {/* Header bar with a back link to the list */}
      <header className="border-b border-border px-6 py-4">
        <Link
          href="/documents"
          className="interactive font-mono text-[11px] uppercase tracking-[0.1em] text-muted hover:text-primary"
        >
          ← Documents
        </Link>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Document header — shown as soon as metadata loads */}
        {doc && (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <FileGlyph />
                <h1 className="truncate font-serif text-[20px] tracking-[-0.01em] text-primary">
                  {doc.original_filename}
                </h1>
                <span className="shrink-0 rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-chip-text">
                  {extensionOf(doc.original_filename)}
                </span>
              </div>
              {metaParts.length > 0 && (
                <div className="mt-2 font-mono text-[11px] tracking-[0.04em] text-muted">
                  {metaParts.join(" · ")}
                </div>
              )}
            </div>

            <Link
              href={`/chat?doc=${doc.id}`}
              className="interactive shrink-0 rounded-full bg-ink-2 px-4 py-2 font-sans text-[13px] text-paper hover:opacity-90 active:scale-[0.98] dark:bg-paper dark:text-ink-2"
            >
              Chat with doc
            </Link>
          </div>
        )}

        {/* Body */}
        <div className="mt-8">
          {phase === "analysing" && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <span className="streaming-dot h-2 w-2 rounded-full bg-accent" />
              <p className="font-serif text-[16px] text-muted">Analysing document…</p>
            </div>
          )}

          {phase === "error" && (
            <p className="rounded-[12px] border border-border bg-card px-4 py-8 text-center font-sans text-[13.5px] text-muted">
              {errorMsg ?? "Something went wrong."}
            </p>
          )}

          {phase === "timeout" && (
            <div className="rounded-[12px] border border-border bg-card px-4 py-8 text-center">
              <p className="font-sans text-[13.5px] text-muted">
                This is taking longer than usual. The model may be rate-limited.
              </p>
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="interactive mt-4 rounded-full border border-input px-4 py-2 font-sans text-[13px] text-primary hover:bg-subtle active:scale-[0.98]"
              >
                Keep waiting
              </button>
            </div>
          )}

          {phase === "done" && intel && (
            <div className="space-y-8">
              {/* Summary */}
              <section>
                <Label>Summary</Label>
                <p className="font-sans text-[13.5px] leading-[1.7] text-primary">
                  {intel.summary}
                </p>
              </section>

              {/* Key points + action items */}
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                {/* Key points */}
                <section>
                  <Label>Key points</Label>
                  {intel.key_points && intel.key_points.length > 0 ? (
                    <ul className="space-y-2.5">
                      {intel.key_points.map((point, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          <span className="font-sans text-[13px] leading-[1.6] text-primary">
                            {point}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="font-sans text-[13px] text-muted">No key points extracted.</p>
                  )}
                </section>

                {/* Action items */}
                <section>
                  <Label>Action items</Label>
                  {intel.action_items && intel.action_items.length > 0 ? (
                    <div className="space-y-2.5">
                      {intel.action_items.map((item, i) => (
                        <div
                          key={i}
                          className="flex gap-2.5 rounded-[12px] border border-border bg-card px-3.5 py-3"
                        >
                          <CheckSquare />
                          <div className="min-w-0">
                            <p className="font-sans text-[13px] leading-[1.6] text-primary">
                              {item.text}
                            </p>
                            {(item.owner || item.deadline) && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {item.owner && (
                                  <span className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[10px] text-chip-text">
                                    {item.owner}
                                  </span>
                                )}
                                {item.deadline && (
                                  <span className="font-mono text-[10px] text-muted">
                                    · {item.deadline}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-sans text-[13px] text-muted">No action items found.</p>
                  )}
                </section>
              </div>

              {/* Footer meta: document type + word count */}
              <div className="flex items-center gap-3 border-t border-border pt-5">
                {intel.document_type && (
                  <span className="rounded-[5px] bg-chip px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-chip-text">
                    {prettyType(intel.document_type)}
                  </span>
                )}
                {intel.word_count != null && (
                  <span className="font-mono text-[10px] tracking-[0.04em] text-muted">
                    {intel.word_count.toLocaleString()} words
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
