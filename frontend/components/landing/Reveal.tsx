"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// Scroll-reveal primitive (Phase 1) — now Framer Motion instead of the old
// IntersectionObserver + `.reveal` CSS class. Same feel as before: each element
// starts 14px low and faded, then rises into place the first time it scrolls
// into view. `delay` (ms) staggers siblings — Hero passes 80 / 200 / 320, the
// feature file-list passes i*120, etc. The public API is unchanged, so every
// existing call site (Nav, Hero, Footer, StickyFeatures) keeps working as-is.
//
// IMPORTANT: this renders a plain motion.div WITHOUT the `.reveal` class. That
// class still lives in globals.css (TerminalDemo drives it directly for now),
// but if it landed on this element its 0.7s CSS transition would fight Framer
// Motion's per-frame inline animation → lag. FM owns opacity/transform here.
type RevealProps = {
  children: ReactNode;
  className?: string;
  // Stagger between sibling reveals, in ms (~120ms steps, DESIGN.md §6).
  delay?: number;
};

export default function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const reduceMotion = useReducedMotion();

  // Reduced motion: render the settled final state, no animation at all.
  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      // once: reveal a single time, never re-hide on scroll-up.
      // amount 0.15 == the old IntersectionObserver threshold of 0.15.
      viewport={{ once: true, amount: 0.15 }}
      // 0.7s + cubic-bezier(.22,.61,.36,1): identical curve to the old .reveal.
      transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1], delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  );
}
