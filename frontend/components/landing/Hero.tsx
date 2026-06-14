"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import Reveal from "./Reveal";
import Magnetic from "./Magnetic";

// Hero content for the dark ink stage. Sits in front of the particle backdrop,
// so all text is paper-toned for contrast on ink. The headline animates in by
// word/line (Phase 4) — the one headline that gets this treatment; everything
// else uses the calmer Reveal rise. Reduced motion shows all of it static.
const headlineContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
};
const headlineWord: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 0.61, 0.36, 1] } },
};

export default function Hero() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-1 flex-col justify-center pb-24 pt-24 sm:pb-28">
      <div className="mx-auto w-full max-w-2xl text-center">
        {/* Mono kicker — a single amber "signal" dot then a quiet label. */}
        <Reveal delay={40}>
          <div className="mb-7 inline-flex max-w-full items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/55 sm:text-[10.5px] sm:tracking-[0.18em]">
            <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-accent shadow-[0_0_8px_1px_var(--accent)]" />
            Grounded in your documents
          </div>
        </Reveal>

        {/* Headline: word/line staggered entrance. The highlighted line animates
            as one unit so the amber ::after bar stays intact behind it. */}
        <motion.h1
          variants={headlineContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          className="font-serif text-[clamp(1.85rem,6.5vw,4.25rem)] leading-[1.08] tracking-[-0.02em] text-paper"
        >
          <motion.span variants={headlineWord} className="inline-block">Every</motion.span>{" "}
          <motion.span variants={headlineWord} className="inline-block">answer,</motion.span>
          <br className="hidden sm:block" />{" "}
          <motion.span variants={headlineWord} className="inline-block hl-mark">
            with its source.
          </motion.span>
        </motion.h1>

        <Reveal delay={450}>
          <p className="mx-auto mt-7 max-w-xl font-sans text-[15px] leading-[1.75] text-paper/70">
            Pragya reads your team&rsquo;s documents and answers in plain language —
            every claim traced back to the exact file and page it came from.
          </p>
        </Reveal>

        <Reveal delay={600}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {/* Primary on the dark stage = the dark-mode button (paper fill, ink
                text), per DESIGN.md §5. Both CTAs are magnetic on desktop. */}
            <Magnetic>
              <a
                href="/login"
                className="interactive block w-full rounded-full bg-paper px-7 py-3 font-sans text-[14px] text-ink-2 hover:opacity-90 active:scale-[0.98] sm:w-auto"
              >
                Start free
              </a>
            </Magnetic>
            <Magnetic>
              <a
                href="#how-it-works"
                className="interactive block w-full rounded-full border border-paper/25 px-7 py-3 font-sans text-[14px] text-paper hover:bg-paper/10 active:scale-[0.98] sm:w-auto"
              >
                See the method
              </a>
            </Magnetic>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
