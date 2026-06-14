"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  useMotionValueEvent,
} from "motion/react";
import Reveal from "./Reveal";

const QUERY = "how many casual leaves do i get?";

// The terminal demo (DESIGN.md §7.3), upgraded for Phase 3 into a scroll-driven
// moment: the card drifts with a gentle scroll parallax (depth), types its query
// on entering view (organic cadence, kept from §6), then reveals the answer and
// — as you keep scrolling — the source/citation line. Reduced motion shows the
// whole thing static, no parallax, no typing.
export default function TerminalDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  const [typed, setTyped] = useState("");
  const [showResponse, setShowResponse] = useState(false);
  const [showMeta, setShowMeta] = useState(false);

  // Parallax: card travels a touch against the scroll for depth (foreground vs
  // page). Tied to the section's progress through the viewport.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const parallaxY = useTransform(scrollYProgress, [0, 1], [44, -44]);

  // The source/meta line reveals "on scroll" — once the card has scrolled a bit
  // past the viewport centre — rather than on a timer.
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (v > 0.52) setShowMeta(true);
  });

  const startedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Organic char-by-char typing, then fade the response in. Triggered once when
  // the card enters view (onViewportEnter below).
  const startTyping = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const timeouts = timeoutsRef.current;
    let i = 0;
    const typeNext = () => {
      i += 1;
      setTyped(QUERY.slice(0, i));
      if (i < QUERY.length) {
        const delay = 45 + (Math.random() * 40 - 20); // 45ms ± jitter (§6)
        timeouts.push(setTimeout(typeNext, delay));
      } else {
        timeouts.push(setTimeout(() => setShowResponse(true), 450));
      }
    };
    timeouts.push(setTimeout(typeNext, 350));
  }, []);

  useEffect(() => {
    // Reduced motion: skip typing + parallax, show the final state at once.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(QUERY);
      setShowResponse(true);
      setShowMeta(true);
      startedRef.current = true;
    }
    const timeouts = timeoutsRef.current;
    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <section ref={sectionRef} className="mx-auto mt-28 max-w-2xl sm:mt-36">
      {/* Kicker so the demo reads as a deliberate moment, not a floating card. */}
      <Reveal>
        <div className="mb-8 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          See it answer
        </div>
      </Reveal>
      <motion.div style={reduceMotion ? undefined : { y: parallaxY }}>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          onViewportEnter={startTyping}
          transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
          // border-terminal-line lifts the card off the dark page in dark mode
          // (where bg-main and bg-terminal are very close); the ring stays too.
          className="overflow-hidden rounded-[12px] border border-terminal-line bg-terminal shadow-[0_0_0_6px_var(--terminal-ring)]"
        >
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

            {/* Response: trace → answer → source → [DONE] (§7.3). */}
            {showResponse && (
              <div className="fade-in mt-3 space-y-1.5">
                <div className="text-[9.5px] text-terminal-dim">
                  hybrid → rrf → rerank(5) · 287ms · faithfulness 0.94
                </div>
                <div className="text-terminal-text">
                  You&rsquo;re entitled to{" "}
                  <span className="text-accent">12 casual leaves</span> per year.
                </div>
                <div className="text-accent">└─ HR_Leave_Policy.pdf · page 4</div>
                <div className="text-terminal-dim">[DONE]</div>
              </div>
            )}

            {/* Retrieval-stats line — revealed on scroll (not a timer). */}
            {showResponse && showMeta && (
              <div className="fade-in mt-1.5 text-terminal-dim">
                └─ 2 sources · hybrid retrieval · 287ms
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
