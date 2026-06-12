"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { MessageSource } from "@/types";
import CitationTag from "./CitationTag";
import StreamingDots from "./StreamingDots";

/* ── Icons ──────────────────────────────────────────────────────────────────── */

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

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

// Strip [Source: N] and [N] citation markers before passing to ReactMarkdown.
// Returns cleaned text and ordered list of citation numbers (first-appearance order).
function extractCitations(content: string): { cleaned: string; nums: number[] } {
  const seen = new Set<number>();
  const nums: number[] = [];
  const cleaned = content
    .replace(/\[Source:\s*(\d+)\]/g, (_, n) => {
      const num = Number(n);
      if (!seen.has(num)) { seen.add(num); nums.push(num); }
      return "";
    })
    .replace(/\[(\d+)\]/g, (_, n) => {
      const num = Number(n);
      if (!seen.has(num)) { seen.add(num); nums.push(num); }
      return "";
    })
    .trim();
  return { cleaned, nums };
}

// Plain-text copy: strip common markdown tokens so the clipboard gets readable prose.
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .trim();
}

/* ── Markdown rendering contexts ──────────────────────────────────────────────
   react-markdown v9+ removed the `inline` prop on the `code` component.
   We use a React Context set by the `pre` override so the `code` override can
   tell whether it's rendering a fenced block or an inline span.
   Likewise, `InsideOrderedList` lets `li` choose amber-dot vs. decimal styling. */

const InsideCodeBlock = createContext(false);
const InsideOrderedList = createContext(false);

/* ── List/code renderers ──────────────────────────────────────────────────────
   These read a context, so they must call a hook. Defined as real (uppercase)
   components — not inline arrows on the components map — so the call satisfies the
   Rules of Hooks linter; react-markdown still invokes them as components. */

function ListItem({ children }: { children?: ReactNode }) {
  const isOrdered = useContext(InsideOrderedList);
  return isOrdered ? (
    <li className="pl-1 leading-[1.7]">{children}</li>
  ) : (
    // 5px amber dot, absolutely positioned left of the text
    <li className="relative pl-4 leading-[1.7] before:absolute before:left-0 before:top-[0.55em] before:h-[5px] before:w-[5px] before:rounded-full before:bg-accent before:content-['']">
      {children}
    </li>
  );
}

function CodeSpan({ children }: { children?: ReactNode }) {
  const isBlock = useContext(InsideCodeBlock);
  return isBlock ? (
    // Inside <pre> — pre already handles bg/text-color; just enforce mono
    <code className="font-mono text-[12px]">{children}</code>
  ) : (
    // Inline code chip
    <code className="rounded px-[3px] py-[1px] font-mono text-[12px] bg-chip text-primary">
      {children}
    </code>
  );
}

/* ── ReactMarkdown component overrides (DESIGN.md tokens) ────────────────────── */

const mdComponents: Components = {
  p: ({ children }) => (
    <p className="mb-[8px] leading-[1.75] last:mb-0">{children}</p>
  ),
  strong: ({ children }) => <strong className="font-[500]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <InsideOrderedList.Provider value={false}>
      <ul className="my-1.5 list-none space-y-0.5">{children}</ul>
    </InsideOrderedList.Provider>
  ),
  ol: ({ children }) => (
    <InsideOrderedList.Provider value={true}>
      <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
    </InsideOrderedList.Provider>
  ),
  li: ListItem,
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 font-serif text-[17px] tracking-[-0.01em] text-primary first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 font-serif text-[15px] tracking-[-0.01em] text-primary first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 font-serif text-[13.5px] text-primary first:mt-0">{children}</h3>
  ),
  code: CodeSpan,
  pre: ({ children }) => (
    // Wrap children in a context so nested `code` skips its inline-chip style
    <InsideCodeBlock.Provider value={true}>
      <pre className="my-2 overflow-x-auto rounded-[8px] bg-ink p-3 font-mono text-[12px] text-paper ring-1 ring-[#322d24]">
        {children}
      </pre>
    </InsideCodeBlock.Provider>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent no-underline hover:underline">
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-accent pl-3 italic text-muted">
      {children}
    </blockquote>
  ),
};

/* ── Component ───────────────────────────────────────────────────────────────── */

type ChatMessageProps = {
  content: string;
  sources?: MessageSource[] | null;
  // Wall-clock ms from send → [DONE]; only on freshly streamed turns.
  traceMs?: number;
  streaming?: boolean;
};

export default function ChatMessage({ content, sources, traceMs, streaming }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const hasSources = !!sources && sources.length > 0;
  const { cleaned, nums } = extractCitations(content);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(stripMarkdown(content));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-HTTPS or user denied)
    }
  }

  return (
    <div className="flex justify-start">
      {/* `group` enables hover-based copy button visibility */}
      <div className="group relative max-w-[85%] rounded-[14px] rounded-tl-[3px] border border-border bg-card px-4 py-3">
        {/* Copy button — top-right, visible only on card hover, never while streaming */}
        {!streaming && content.length > 0 && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy message"}
            className="interactive absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-[5px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-subtle"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        )}

        {/* Body: dots while waiting for first token, then rendered markdown */}
        {streaming && content.length === 0 ? (
          <StreamingDots />
        ) : (
          <div className="font-sans text-[14px] text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {cleaned}
            </ReactMarkdown>
            {/* Citation chips appended after the rendered prose */}
            {nums.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {nums.map((n) => (
                  <CitationTag key={n} n={n} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Source row — file icon + "filename · p.N" per cited source */}
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

        {/* Signature trace line — only shown when answer is grounded */}
        {hasSources && (
          <div className="mt-2 font-mono text-[9.5px] text-muted">
            hybrid → rrf → rerank(5){traceMs != null && ` · ${traceMs}ms`}
          </div>
        )}
      </div>
    </div>
  );
}
