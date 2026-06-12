"use client";

import { useEffect, useState } from "react";
import type { ToastVariant } from "@/lib/useToast";

/* Presentational only — the provider (lib/useToast) owns the toast list and passes
   each item here. A toast slides in from the right on mount and auto-dismisses
   after 4s; the × button dismisses early. */

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const AUTO_DISMISS_MS = 4000;

export default function Toast({
  id,
  message,
  variant,
  onDismiss,
}: {
  id: string;
  message: string;
  variant: ToastVariant;
  onDismiss: (id: string) => void;
}) {
  // shown drives the slide-in: start off-screen/transparent, flip on next frame.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [id, onDismiss]);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-2.5 rounded-[10px] border bg-card px-3.5 py-2.5 font-sans text-[12.5px] text-primary transition-all duration-300 ease-out ${
        shown ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0"
      } ${
        // success: amber status dot. error: a quiet muted left border.
        variant === "error" ? "border-border border-l-[3px] border-l-muted" : "border-border"
      }`}
    >
      {variant === "success" && (
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      )}
      <span className="max-w-[260px]">{message}</span>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="interactive ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:text-primary"
      >
        <XIcon />
      </button>
    </div>
  );
}
