"use client";

import { useState } from "react";

// Up-arrow for the send button — ink-colored on the amber circle (DESIGN.md §5).
function SendArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5m0 0-6 6m6-6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ChatInputProps = {
  onSend: (text: string) => void;
  // True while a previous answer is streaming — input + send are locked.
  disabled?: boolean;
};

// Pill input + amber circular send button. No <form> (DESIGN.md); Enter submits.
export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-input bg-card py-1.5 pl-5 pr-1.5">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        disabled={disabled}
        placeholder="Ask about your department's documents…"
        className="min-w-0 flex-1 bg-transparent font-sans text-[14px] text-primary placeholder:text-muted focus:outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || text.trim().length === 0}
        aria-label="Send"
        className="interactive flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-ink hover:opacity-90 active:scale-[0.96] disabled:opacity-40"
      >
        <SendArrow />
      </button>
    </div>
  );
}
