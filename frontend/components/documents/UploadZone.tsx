"use client";

import { useRef, useState } from "react";
import { ApiError, uploadDocument } from "@/lib/api";

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

// One file currently being uploaded (shown in the queue below the drop zone).
type QueueItem = { id: string; name: string; error?: string };

const FORMATS = ["PDF", "DOCX", "PPTX"];

type UploadZoneProps = {
  // Called after each successful upload so the parent can refresh its list.
  onUploaded: () => void;
};

export default function UploadZone({ onUploaded }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Upload sequentially — gentler on the backend than a burst, and the queue
    // reads top-to-bottom in the order chosen.
    for (const file of Array.from(files)) {
      const id = Math.random().toString(36).slice(2);
      setQueue((q) => [...q, { id, name: file.name }]);
      try {
        await uploadDocument(file);
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
      {/* Drop zone — dashed border on --bg-subtle; click anywhere triggers the
          hidden input (DESIGN.md upload mockup). */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`interactive flex cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed bg-subtle px-6 py-10 text-center ${
          dragging ? "border-accent" : "border-border"
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
