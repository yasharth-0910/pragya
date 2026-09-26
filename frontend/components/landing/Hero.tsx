"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import Reveal from "./Reveal";
import Magnetic from "./Magnetic";

// Hero content for the dark ink stage. Left-aligned over the flowing-lines
// canvas, with the left-fade gradient (HeroBackdrop) keeping the copy readable.
// All text is paper-toned for contrast on ink. The headline animates in by
// word/line (the one headline that gets this treatment); everything else uses
// the calmer Reveal rise. Reduced motion shows all of it static.
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
      <div className="w-full max-w-[880px] text-left">
        {/* Mono kicker — quiet, dotless, the way the design reads it. */}
        <Reveal delay={40}>
          <div className="mb-6 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/55 sm:text-[10.5px] sm:tracking-[0.18em]">
            Enterprise RAG · cited · self-hosted
          </div>
        </Reveal>

        {/* Headline: word/line staggered entrance. The highlighted line animates
            as one unit so the amber ::after bar stays intact behind it. */}
        <motion.h1
          variants={headlineContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          className="max-w-[14ch] font-serif text-[clamp(2.25rem,6.4vw,4rem)] leading-[1.04] tracking-[-0.02em] text-paper"
        >
          <motion.span variants={headlineWord} className="inline-block">Every</motion.span>{" "}
          <motion.span variants={headlineWord} className="inline-block">answer,</motion.span>{" "}
          <motion.span variants={headlineWord} className="inline-block">with</motion.span>
          <br />
          <motion.span variants={headlineWord} className="inline-block hl-mark">
            its source.
          </motion.span>
        </motion.h1>

        <Reveal delay={450}>
          <p className="mt-7 max-w-[46ch] font-sans text-[15px] leading-[1.75] text-paper/70">
            Pragya answers employee questions using only the documents
            they&rsquo;re allowed to see — and cites the exact file and page
            behind every claim. A calm library, with an engine room underneath.
          </p>
        </Reveal>

        <Reveal delay={600}>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Primary CTA is the amber accent pill (design-led), ink text. Both
                CTAs are magnetic on desktop. */}
            <Magnetic>
              <a
                href="/login"
                className="interactive block w-full rounded-full bg-accent px-7 py-3 text-center font-sans text-[14px] text-ink hover:-translate-y-px active:scale-[0.98] sm:w-auto"
              >
                Start free
              </a>
            </Magnetic>
            <Magnetic>
              <a
                href="#how-it-works"
                className="interactive block w-full rounded-full border border-paper/25 px-7 py-3 text-center font-sans text-[14px] text-paper hover:-translate-y-px hover:border-accent active:scale-[0.98] sm:w-auto"
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
