"use client";

import { useEffect, useState } from "react";

const QUERY = "how many casual leaves do i get?";

export default function TerminalDemo() {
  const [typed, setTyped] = useState("");
  const [showResponse, setShowResponse] = useState(false);

  useEffect(() => {
    // The cleanup below clears every pending timeout, so a StrictMode
    // double-invoke just cancels the first run and cleanly restarts typing.

    // Reduced motion (§6): skip the animation, show the final state.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(QUERY);
      setShowResponse(true);
      return;
    }

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let i = 0;

    const typeNext = () => {
      i += 1;
      setTyped(QUERY.slice(0, i));
      if (i < QUERY.length) {
        // 45ms ± ~20ms jitter for an organic, human cadence (§6).
        const delay = 45 + (Math.random() * 40 - 20);
        timeouts.push(setTimeout(typeNext, delay));
      } else {
        // Brief beat, then fade the response in (.5s via .fade-in).
        timeouts.push(setTimeout(() => setShowResponse(true), 450));
      }
    };

    // ~650ms head start so typing begins after the terminal's rise settles.
    timeouts.push(setTimeout(typeNext, 650));
    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <section
      className="rise mx-auto mt-20 max-w-2xl sm:mt-24"
      style={{ animationDelay: "440ms" }}
    >
      <div className="overflow-hidden rounded-[12px] bg-terminal shadow-[0_0_0_6px_var(--terminal-ring)]">
        {/* Title bar — three monochrome window dots (§5). */}
        <div className="flex items-center gap-2 border-b border-terminal-line px-4 py-3">
          <span className="h-[10px] w-[10px] rounded-full bg-terminal-dot" />
          <span className="h-[10px] w-[10px] rounded-full bg-terminal-dot" />
          <span className="h-[10px] w-[10px] rounded-full bg-terminal-dot" />
        </div>

        {/* Body */}
        <div className="px-5 py-5 font-mono text-[12px] leading-[1.7] sm:px-6">
          {/* Query line: amber prompt, typed text, blinking amber cursor. */}
          <div className="text-terminal-text">
            <span className="text-accent">❯ </span>
            <span>{typed}</span>
            <span className="terminal-cursor ml-[1px] inline-block text-accent">▍</span>
          </div>

          {/* Response: query → trace → answer → source (§7.3), faded in once. */}
          {showResponse && (
            <div className="fade-in mt-3 space-y-1.5">
              <div className="text-[9.5px] text-terminal-dim">
                hybrid → rrf → rerank(5) · 287ms · faithfulness 0.94
              </div>
              <div className="text-terminal-text">
                You&rsquo;re entitled to{" "}
                <span className="text-accent">12 casual leaves</span> per year.
              </div>
              <div className="text-accent">
                └─ HR_Leave_Policy.pdf · page 4
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
