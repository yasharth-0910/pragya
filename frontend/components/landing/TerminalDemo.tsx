"use client";

import { useEffect, useRef, useState } from "react";

const QUERY = "how many casual leaves do i get?";

export default function TerminalDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const [typed, setTyped] = useState("");
  const [showResponse, setShowResponse] = useState(false);
  // Second-stage line ("└─ 2 sources · …") fades in 400ms after [DONE].
  const [showMeta, setShowMeta] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    // Reduced motion (§6): no reveal, no typing — show the final state.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-revealed");
      setTyped(QUERY);
      setShowResponse(true);
      setShowMeta(true);
      return;
    }

    // The cleanup clears every pending timeout, so a StrictMode double-invoke
    // just cancels the first run and cleanly restarts typing.
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
        // Brief beat, then fade in the response block ending in [DONE]…
        timeouts.push(
          setTimeout(() => {
            setShowResponse(true);
            // …and the retrieval-stats line 400ms after [DONE] appears.
            timeouts.push(setTimeout(() => setShowMeta(true), 400));
          }, 450)
        );
      }
    };

    // One observer does both jobs: reveal the section (threshold 0.15, same
    // as <Reveal>) and start the demo only once it's actually on screen —
    // after a 500ms pre-delay where the cursor just blinks at the bare prompt.
    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started) return;
        started = true;
        el.classList.add("is-revealed");
        observer.disconnect();
        timeouts.push(setTimeout(typeNext, 500));
      },
      { threshold: 0.15 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <section ref={sectionRef} className="reveal mx-auto mt-20 max-w-2xl sm:mt-24">
      <div className="overflow-hidden rounded-[12px] bg-terminal shadow-[0_0_0_6px_var(--terminal-ring)]">
        {/* Title bar — three window dots (§5). */}
        <div className="flex items-center gap-2 border-b border-terminal-line px-4 py-3">
          <span className="h-[10px] w-[10px] rounded-full border border-black/10 bg-[#ff5f57]" />
          <span className="h-[10px] w-[10px] rounded-full border border-black/10 bg-[#ffbd2e]" />
          <span className="h-[10px] w-[10px] rounded-full border border-black/10 bg-[#28c840]" />
        </div>

        {/* Body */}
        <div className="px-5 py-5 font-mono text-[12px] leading-[1.7] sm:px-6">
          {/* Query line: amber prompt, typed text, blinking amber cursor. */}
          <div className="text-terminal-text">
            <span className="text-accent">❯ </span>
            <span>{typed}</span>
            <span className="terminal-cursor ml-[1px] inline-block text-accent">▍</span>
          </div>

          {/* Response: trace → answer → source → [DONE] (§7.3), faded in once. */}
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
              <div className="text-terminal-dim">[DONE]</div>
            </div>
          )}

          {/* Retrieval-stats line, 400ms after [DONE] — the research signal. */}
          {showMeta && (
            <div className="fade-in mt-1.5 text-terminal-dim">
              └─ 2 sources · hybrid retrieval · 287ms
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
