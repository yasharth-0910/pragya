"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { getDocumentStatus } from "@/lib/api";
import type { Document } from "@/types";
import ProgressBar from "./ProgressBar";

// Monochrome file glyph — DESIGN.md keeps amber as the only accent, so file type
// is conveyed by the mono extension chip beside it, not by icon color.
function FileGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted">
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

// Visibility icons — small, monochrome (DESIGN.md §8: no emoji in UI).
function GlobeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M3 21h18" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Small visibility badge for the card's top-right. Personal is amber (the most
// distinctive state — the user should notice a private doc); company/department
// use the quiet chip colors.
function VisibilityBadge({ visibility }: { visibility: string }) {
  const config: Record<string, { label: string; icon: () => ReactElement; cls: string }> = {
    company: { label: "Company", icon: GlobeIcon, cls: "bg-chip text-chip-text" },
    department: { label: "Department", icon: BuildingIcon, cls: "bg-chip text-chip-text" },
    personal: { label: "Personal", icon: LockIcon, cls: "bg-accent text-ink" },
  };
  const c = config[visibility] ?? config.department;
  const Icon = c.icon;
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.04em] ${c.cls}`}
    >
      <Icon />
      {c.label}
    </span>
  );
}

function extensionOf(filename: string): string {
  return filename.includes(".") ? filename.split(".").pop()!.toUpperCase() : "FILE";
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type DocumentCardProps = { doc: Document };

export default function DocumentCard({ doc }: DocumentCardProps) {
  // Local status so a card can advance itself from "processing" to "ready" via
  // polling, without the parent re-fetching the whole list.
  const [status, setStatus] = useState(doc.status);
  const [chunkCount, setChunkCount] = useState<number | null>(doc.chunk_count);

  useEffect(() => {
    // Only poll while there's something to wait for. Stop once ready or failed.
    if (status !== "processing") return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const s = await getDocumentStatus(doc.id);
        if (!active) return;
        setStatus(s.status);
        if (s.chunk_count != null) setChunkCount(s.chunk_count);
        if (s.status !== "processing") clearInterval(timer);
      } catch {
        // Transient error — keep polling; a real auth failure is handled (redirect)
        // by the api layer.
      }
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [doc.id, status]);

  const isReady = status === "ready";

  return (
    <div className="rounded-[12px] border border-border bg-card px-4 py-3.5">
      <div className="flex items-start gap-3">
        <FileGlyph />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-sans text-[14px] text-primary">
              {doc.original_filename}
            </span>
            <span className="shrink-0 rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-chip-text">
              {extensionOf(doc.original_filename)}
            </span>
            {/* Intelligence ready badge — shown once summary has been generated (Fix 5b) */}
            {isReady && doc.summary != null && (
              <span className="shrink-0 rounded-[4px] bg-accent px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink">
                Intelligence ready
              </span>
            )}
            {/* Visibility badge — pinned to the card's top-right. */}
            <span className="ml-auto pl-2">
              <VisibilityBadge visibility={doc.visibility} />
            </span>
          </div>

          {/* Meta line — chunk count + file size once known (Fix 5c) */}
          {isReady && chunkCount != null && (
            <div className="mt-1 font-mono text-[10px] text-muted">
              {chunkCount} chunks{formatFileSize(doc.file_size) ? ` · ${formatFileSize(doc.file_size)}` : ""}
            </div>
          )}

          <div className="mt-2.5">
            <ProgressBar status={status} />
          </div>

          {/* Ready → two actions. */}
          {isReady && (
            <div className="mt-3 flex items-center gap-2">
              {/* Chat scoped to this doc — ?doc= drives a document_id filter ANDed
                  with the visibility rules in retrieval (chat page reads the param). */}
              <Link
                href={`/chat?doc=${doc.id}`}
                className="interactive rounded-full border border-input px-3.5 py-1.5 font-sans text-[12.5px] text-primary hover:bg-subtle active:scale-[0.98]"
              >
                Chat
              </Link>
              <Link
                href={`/documents/${doc.id}`}
                className="interactive rounded-full bg-ink-2 px-3.5 py-1.5 font-sans text-[12.5px] text-paper hover:opacity-90 active:scale-[0.98] dark:bg-paper dark:text-ink-2"
              >
                Intelligence
              </Link>
            </div>
          )}

          {/* Failed → surface the reason if the poll carried one. */}
          {status === "failed" && doc.error_message && (
            <div className="mt-2 font-sans text-[12px] leading-[1.5] text-muted">
              {doc.error_message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
