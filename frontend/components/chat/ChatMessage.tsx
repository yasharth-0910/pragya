import type { ReactNode } from "react";
import type { MessageSource } from "@/types";
import CitationTag from "./CitationTag";
import StreamingDots from "./StreamingDots";

// Small hand-drawn file glyph for the source row — no icon library (DESIGN.md §6).
function FileGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
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

// Replace each inline [Source: N] marker in the answer text with a CitationTag,
// keeping the surrounding prose intact. The capture group keeps the markers in
// the split output so we can swap them for chips.
function renderWithCitations(content: string): ReactNode[] {
  return content.split(/(\[Source:\s*\d+\])/g).map((part, i) => {
    const m = part.match(/\[Source:\s*(\d+)\]/);
    if (m) return <CitationTag key={i} n={Number(m[1])} />;
    return <span key={i}>{part}</span>;
  });
}

type ChatMessageProps = {
  content: string;
  sources?: MessageSource[] | null;
  // Wall-clock time from send → [DONE], measured client-side; only known for a
  // freshly streamed turn (historical messages don't carry it).
  traceMs?: number;
  // True while tokens are still arriving; shows dots if no text yet.
  streaming?: boolean;
};

// An assistant answer (DESIGN.md §5): left-aligned card, inline citation chips,
// a source row, and the signature trace line. User bubbles are rendered by the
// page directly (they're trivial); this component is the AI side.
export default function ChatMessage({ content, sources, traceMs, streaming }: ChatMessageProps) {
  const hasSources = !!sources && sources.length > 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-[14px] rounded-tl-[3px] border border-border bg-card px-4 py-3">
        {/* Body: before any token arrives, show the thinking dots. */}
        {streaming && content.length === 0 ? (
          <StreamingDots />
        ) : (
          <div className="whitespace-pre-wrap font-sans text-[14px] leading-[1.7] text-primary">
            {renderWithCitations(content)}
          </div>
        )}

        {/* Source row — file icon + "filename · p.N" per cited source (§5). */}
        {hasSources && (
          <div className="mt-3 space-y-1 border-t border-border pt-2.5">
            {sources!.map((s, i) => (
              <div
                key={`${s.filename}-${s.page ?? "x"}-${i}`}
                className="flex items-center gap-1.5 font-sans text-[12px] text-muted"
              >
                <FileGlyph />
                <span className="truncate">
                  {s.filename}
                  {s.page != null && ` · p.${s.page}`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Trace line (signature detail, §5) — only when the answer was grounded. */}
        {hasSources && (
          <div className="mt-2 font-mono text-[9.5px] text-muted">
            hybrid → rrf → rerank(5){traceMs != null && ` · ${traceMs}ms`}
          </div>
        )}
      </div>
    </div>
  );
}
