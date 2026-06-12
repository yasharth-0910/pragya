"use client";

import { useRef, useState, type ReactElement } from "react";
import { ApiError, uploadDocument } from "@/lib/api";
import { getUser } from "@/lib/auth";

// Hand-drawn upload cloud — no icon library (DESIGN.md §6).
function CloudIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted">
      <path
        d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a4.5 4.5 0 0 1 .5 8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 13v6m0-6-2.5 2.5M12 13l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Visibility icons — hand-drawn, monochrome (DESIGN.md §8 forbids emoji in UI, so
// the spec's 🌐/🏢/🔒 are rendered as inline SVGs in the existing icon style).
function GlobeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M3 21h18" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 8h2M8 12h2M8 16h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// One file currently being uploaded (shown in the queue below the drop zone).
type QueueItem = { id: string; name: string; error?: string };

const FORMATS = ["PDF", "DOCX", "PPTX"];

type Visibility = "company" | "department" | "personal";

// The three tiers, in display order. icon + label render the segmented control.
const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: () => ReactElement }[] = [
  { value: "company", label: "Company-wide", icon: GlobeIcon },
  { value: "department", label: "My Department", icon: BuildingIcon },
  { value: "personal", label: "Personal", icon: LockIcon },
];

type UploadZoneProps = {
  // Called after each successful upload so the parent can refresh its list.
  onUploaded: () => void;
};

export default function UploadZone({ onUploaded }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  // Default "department" — the original single-level behavior (CLAUDE.md 3-tier).
  const [visibility, setVisibility] = useState<Visibility>("department");

  // Display-only role check (the backend re-validates on upload). Non-admins may
  // not publish company-wide docs, so we block that combination in the UI too.
  const isAdmin = getUser()?.role === "admin";
  const companyBlocked = visibility === "company" && !isAdmin;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Guard: a non-admin can't upload company-wide docs — the drop zone is disabled
    // in this state, but double-check here so a stray drop can't slip through.
    if (companyBlocked) return;
    // Upload sequentially — gentler on the backend than a burst, and the queue
    // reads top-to-bottom in the order chosen.
    for (const file of Array.from(files)) {
      const id = Math.random().toString(36).slice(2);
      setQueue((q) => [...q, { id, name: file.name }]);
      try {
        await uploadDocument(file, undefined, visibility);
        // Success: drop it from the queue (it now appears in the list) and let the
        // parent re-fetch so the new "processing" card shows up and self-polls.
        setQueue((q) => q.filter((item) => item.id !== id));
        onUploaded();
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Upload failed. Please try again.";
        setQueue((q) => q.map((item) => (item.id === id ? { ...item, error: message } : item)));
      }
    }
  }

  return (
    <div>
      {/* Visibility selector — segmented control (DESIGN.md §5 primary-button
          colors for the selected pill; --bg-subtle/muted for the rest). */}
      <div className="mb-3 inline-flex w-full overflow-hidden rounded-[10px] border border-border">
        {VISIBILITY_OPTIONS.map((opt, i) => {
          const Icon = opt.icon;
          const selected = visibility === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVisibility(opt.value)}
              className={`interactive flex flex-1 items-center justify-center gap-1.5 px-3 py-2 font-sans text-[12.5px] ${
                i > 0 ? "border-l border-border" : ""
              } ${
                selected
                  ? "bg-ink-2 text-paper dark:bg-paper dark:text-ink"
                  : "bg-subtle text-muted hover:text-primary"
              }`}
            >
              <Icon />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Description line — changes with the selection. Company+non-admin gets an
          amber warning instead of the muted hint. */}
      <p
        className={`mb-3 font-sans text-[12px] leading-relaxed ${
          companyBlocked ? "text-accent" : "text-muted"
        }`}
      >
        {visibility === "company" &&
          (companyBlocked
            ? "You need admin access to upload company docs."
            : "Visible to all employees. Requires admin access.")}
        {visibility === "department" && "Visible to your department only."}
        {visibility === "personal" && "Only visible to you. Completely private."}
      </p>

      {/* Drop zone — dashed border on --bg-subtle; click anywhere triggers the
          hidden input (DESIGN.md upload mockup). Disabled when a non-admin has
          selected company-wide: clicks/drops are ignored. */}
      <div
        role="button"
        tabIndex={companyBlocked ? -1 : 0}
        aria-disabled={companyBlocked}
        onClick={() => {
          if (!companyBlocked) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (companyBlocked) return;
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!companyBlocked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!companyBlocked) handleFiles(e.dataTransfer.files);
        }}
        className={`interactive flex flex-col items-center justify-center rounded-[12px] border border-dashed bg-subtle px-6 py-10 text-center ${
          companyBlocked
            ? "cursor-not-allowed border-border opacity-50"
            : dragging
            ? "cursor-pointer border-accent"
            : "cursor-pointer border-border"
        }`}
      >
        <CloudIcon />
        <p className="mt-3 font-serif text-[14px] text-primary">
          Drop files here or click to browse
        </p>
        <div className="mt-3 flex items-center gap-1.5">
          {FORMATS.map((f) => (
            <span
              key={f}
              className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-chip-text"
            >
              {f}
            </span>
          ))}
        </div>

        {/* Hidden native input — the click target above proxies to it. */}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.pptx"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same file later
          }}
        />
      </div>

      {/* Upload queue — files mid-flight (and any that errored). */}
      {queue.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {queue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-[8px] border border-border bg-card px-3 py-2"
            >
              {item.error ? null : (
                <span className="streaming-dot h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              )}
              <span className="min-w-0 flex-1 truncate font-sans text-[13px] text-primary">
                {item.name}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                {item.error ? item.error : "Uploading…"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
