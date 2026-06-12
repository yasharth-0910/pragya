"use client";

import { useRef, useState } from "react";
import {
  ApiError,
  processMeeting,
  uploadTranscript,
  type MeetingActionItem,
  type MeetingResult,
} from "@/lib/api";

/* ── Icons ───────────────────────────────────────────────────────────────────── */

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-accent">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-muted">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8c-1.1 0-2 .9-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 12v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="17.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

/* ── Priority badge ──────────────────────────────────────────────────────────── */

function PriorityBadge({ priority }: { priority: MeetingActionItem["priority"] }) {
  const styles: Record<string, string> = {
    high: "bg-accent text-ink",
    medium: "bg-chip text-chip-text",
    low: "bg-subtle text-muted",
  };
  return (
    <span
      className={`rounded-[4px] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}

/* ── Avatar circle ───────────────────────────────────────────────────────────── */

function Avatar({ name }: { name: string }) {
  return (
    <div
      title={name}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-chip font-mono text-[10px] uppercase text-chip-text"
    >
      {name.trim().charAt(0)}
    </div>
  );
}

/* ── Export helper ───────────────────────────────────────────────────────────── */

function exportAsText(result: MeetingResult, title: string): void {
  const lines: string[] = [];
  if (title) lines.push(`MEETING: ${title}`, "");
  lines.push("SUMMARY", result.summary, "");
  if (result.participants.length) {
    lines.push("PARTICIPANTS", result.participants.join(", "), "");
  }
  if (result.duration_estimate) {
    lines.push("DURATION", result.duration_estimate, "");
  }
  if (result.decisions.length) {
    lines.push("DECISIONS");
    result.decisions.forEach((d) => lines.push(`• ${d}`));
    lines.push("");
  }
  if (result.action_items.length) {
    lines.push("ACTION ITEMS");
    result.action_items.forEach((a) => {
      let line = `• [${a.priority.toUpperCase()}] ${a.text}`;
      if (a.owner) line += ` — ${a.owner}`;
      if (a.deadline) line += ` (by ${a.deadline})`;
      lines.push(line);
    });
    lines.push("");
  }
  if (result.follow_up_questions.length) {
    lines.push("FOLLOW-UP QUESTIONS");
    result.follow_up_questions.forEach((q) => lines.push(`? ${q}`));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = title ? `${title.replace(/\s+/g, "_")}.txt` : "meeting_summary.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Page ────────────────────────────────────────────────────────────────────── */

type InputMode = "paste" | "upload";

export default function MeetingPage() {
  const [mode, setMode] = useState<InputMode>("paste");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MeetingResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Switching input methods clears the current input and any shown result, so the
  // two modes never bleed into each other.
  function switchMode(next: InputMode) {
    if (next === mode) return;
    setMode(next);
    setTranscript("");
    setFile(null);
    setResult(null);
    setError(null);
  }

  // True when the active mode has enough input to submit.
  const canSubmit = mode === "paste" ? transcript.trim().length >= 50 : file !== null;

  async function handleProcess() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === "upload" && file
          ? await uploadTranscript(file)
          : await processMeeting(transcript.trim(), title.trim() || undefined);
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Processing failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-serif text-[18px] tracking-[-0.01em] text-primary">
          Meeting assistant
        </h1>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">

          {/* ── Left panel: input ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-4 md:w-[42%] md:shrink-0">
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                Meeting title (optional)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Q2 Planning Session"
                maxLength={200}
                className="w-full rounded-[10px] border border-input bg-card px-3.5 py-2.5 font-sans text-[13.5px] text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Input-method toggle — segmented control (paste vs upload). */}
            <div className="inline-flex w-full overflow-hidden rounded-[10px] border border-border">
              {(["paste", "upload"] as const).map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`interactive flex-1 px-3 py-2 font-sans text-[12.5px] ${
                    i > 0 ? "border-l border-border" : ""
                  } ${
                    mode === m
                      ? "bg-ink-2 text-paper dark:bg-paper dark:text-ink"
                      : "bg-subtle text-muted hover:text-primary"
                  }`}
                >
                  {m === "paste" ? "Paste text" : "Upload file"}
                </button>
              ))}
            </div>

            {mode === "paste" ? (
              <div className="flex flex-col">
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Transcript
                </label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste your meeting transcript here…"
                  rows={14}
                  className="w-full resize-y rounded-[10px] border border-input bg-card px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  style={{ minHeight: 300 }}
                />
                <div className="mt-1 text-right font-mono text-[9.5px] text-muted">
                  {transcript.trim().split(/\s+/).filter(Boolean).length} words
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Transcript file
                </label>
                {/* Compact file drop zone — click to browse (no drag needed). */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                  }}
                  className="interactive flex cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed border-border bg-subtle px-6 py-8 text-center"
                >
                  <p className="font-serif text-[13.5px] text-primary">
                    {file ? file.name : "Click to choose a file"}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {["TXT", "PDF"].map((f) => (
                      <span
                        key={f}
                        className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-chip-text"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      e.target.value = ""; // allow re-selecting the same file
                    }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-[8px] border border-border px-3.5 py-2.5 font-sans text-[12px] text-muted">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={loading || !canSubmit}
              onClick={handleProcess}
              className="interactive rounded-full bg-ink-2 px-5 py-2.5 font-sans text-[13px] text-paper hover:opacity-90 active:scale-[0.98] disabled:opacity-40 dark:bg-paper dark:text-ink"
            >
              {loading ? "Processing…" : "Process transcript"}
            </button>
          </div>

          {/* ── Right panel: results ───────────────────────────────────────── */}
          <div className="flex-1">
            {loading ? (
              <div className="space-y-3">
                {[80, 60, 90, 50].map((w, i) => (
                  <div
                    key={i}
                    className="h-5 animate-pulse rounded-[6px] bg-subtle"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            ) : result ? (
              <div className="space-y-5">

                {/* Summary */}
                <div className="rounded-[12px] border border-border bg-card px-5 py-4">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    Summary
                  </div>
                  <p className="font-sans text-[13.5px] leading-relaxed text-primary">
                    {result.summary}
                  </p>
                  {result.duration_estimate && (
                    <div className="mt-2.5 font-mono text-[10px] text-muted">
                      Duration: {result.duration_estimate}
                    </div>
                  )}
                </div>

                {/* Participants */}
                {result.participants.length > 0 && (
                  <div className="rounded-[12px] border border-border bg-card px-5 py-4">
                    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      Participants
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {result.participants.map((p) => (
                        <div key={p} className="flex items-center gap-1.5">
                          <Avatar name={p} />
                          <span className="font-sans text-[12.5px] text-primary">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Decisions */}
                {result.decisions.length > 0 && (
                  <div className="rounded-[12px] border border-border bg-card px-5 py-4">
                    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      Decisions
                    </div>
                    <ul className="space-y-2">
                      {result.decisions.map((d, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckIcon />
                          <span className="font-sans text-[13px] leading-relaxed text-primary">
                            {d}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action items */}
                {result.action_items.length > 0 && (
                  <div className="rounded-[12px] border border-border bg-card px-5 py-4">
                    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      Action items
                    </div>
                    <div className="space-y-3">
                      {result.action_items.map((a, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 border-t border-border pt-3 first:border-0 first:pt-0"
                        >
                          <PriorityBadge priority={a.priority} />
                          <div className="min-w-0 flex-1">
                            <p className="font-sans text-[13px] leading-relaxed text-primary">
                              {a.text}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {a.owner && (
                                <span className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[9.5px] text-chip-text">
                                  {a.owner}
                                </span>
                              )}
                              {a.deadline && (
                                <span className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[9.5px] text-chip-text">
                                  by {a.deadline}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up questions */}
                {result.follow_up_questions.length > 0 && (
                  <div className="rounded-[12px] border border-border bg-card px-5 py-4">
                    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      Follow-up questions
                    </div>
                    <ul className="space-y-2">
                      {result.follow_up_questions.map((q, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <QuestionIcon />
                          <span className="font-sans text-[13px] leading-relaxed text-primary">
                            {q}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Export */}
                <button
                  type="button"
                  onClick={() => exportAsText(result, title)}
                  className="interactive rounded-full border border-input px-4 py-2 font-sans text-[12.5px] text-primary hover:bg-subtle active:scale-[0.97]"
                >
                  Export as text
                </button>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-[12px] border border-border bg-card px-6 py-14 text-center">
                <div className="font-serif text-[15px] tracking-[-0.01em] text-primary">
                  Paste a transcript to begin
                </div>
                <p className="mt-1 font-sans text-[12.5px] text-muted">
                  Summary, decisions, action items, and follow-ups will appear here.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
