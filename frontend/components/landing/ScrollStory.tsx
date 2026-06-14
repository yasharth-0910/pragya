"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react";

// Phase 3 — the one pinned scrollytelling moment. A tall section (300vh) with a
// sticky 100vh stage; as you scroll its progress (0→1) drives three stages of
// the product's method in sync: Ask → Retrieve → Cite. This is the conceptual
// "how it works under the hood"; the terminal demo below shows it for real.
//
// useScroll reads the real document scroll, which Lenis drives (and which shares
// Framer Motion's frame loop), so the choreography stays locked to the smooth
// scroll. Reduced motion swaps the whole thing for a calm static stack — no pin,
// no scroll-jacking (DESIGN.md motion rule + the brief).

const STAGES = [
  {
    n: "01",
    title: "Ask",
    blurb: "A question in plain language — no keywords, no query syntax.",
  },
  {
    n: "02",
    title: "Retrieve",
    blurb: "Dense + keyword search, fused and reranked to the few passages that matter.",
  },
  {
    n: "03",
    title: "Cite",
    blurb: "An answer written from those passages — each claim tied to its source.",
  },
];

export default function ScrollStory() {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  // Phones get the calm static stack, not the 300vh pinned sequence — pinned
  // scrollytelling tends to feel off on touch. Desktop only for the pinned view.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (reduceMotion || isNarrow) return <StaticStory />;

  return (
    <section ref={ref} className="relative h-[300vh]" aria-label="How it works: ask, retrieve, cite">
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-3xl px-6 sm:px-8">
          <StepRail progress={scrollYProgress} />

          {/* The three stages share one grid cell and crossfade as progress
              moves through their windows. */}
          <div className="relative mt-12 grid min-h-[220px] place-items-center sm:mt-16 sm:min-h-[260px]">
            <Stage progress={scrollYProgress} range={[0, 0.06, 0.28, 0.36]}>
              <AskVisual />
            </Stage>
            <Stage progress={scrollYProgress} range={[0.32, 0.42, 0.6, 0.68]}>
              <RetrieveVisual />
            </Stage>
            <Stage progress={scrollYProgress} range={[0.64, 0.74, 1, 1]}>
              <CiteVisual />
            </Stage>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── The step rail: 01 Ask — 02 Retrieve — 03 Cite, with an amber fill line that
//    advances with scroll and nodes that light as the fill passes them. ────────
function StepRail({ progress }: { progress: MotionValue<number> }) {
  const fillWidth = useTransform(progress, [0.04, 0.96], ["0%", "100%"]);
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        The method
      </div>
      <div className="relative mt-6">
        {/* base hairline + amber progress fill */}
        <div className="absolute left-0 right-0 top-[7px] h-px bg-border" />
        <motion.div
          className="absolute left-0 top-[7px] h-px bg-accent"
          style={{ width: fillWidth }}
        />
        <div className="relative flex justify-between">
          {STAGES.map((s, i) => (
            <RailNode key={s.n} progress={progress} index={i} label={s.title} num={s.n} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RailNode({
  progress,
  index,
  label,
  num,
}: {
  progress: MotionValue<number>;
  index: number;
  label: string;
  num: string;
}) {
  // Activate each node exactly as the fill line (which spans progress 0.04→0.96)
  // reaches its position — so the last node fully lights by the end of scroll.
  const at = 0.04 + 0.92 * (index / (STAGES.length - 1));
  const dotColor = useTransform(
    progress,
    [at - 0.05, at],
    ["var(--border)", "var(--accent)"]
  );
  const labelColor = useTransform(
    progress,
    [at - 0.05, at],
    ["var(--text-muted)", "var(--text-primary)"]
  );
  const align = index === 0 ? "items-start" : index === STAGES.length - 1 ? "items-end" : "items-center";
  return (
    <div className={`flex flex-col ${align}`}>
      <motion.span
        className="h-[15px] w-[15px] rounded-full border-[3px] border-main"
        style={{ backgroundColor: dotColor }}
      />
      <motion.div
        className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: labelColor }}
      >
        <span className="text-accent">{num}</span> {label}
      </motion.div>
    </div>
  );
}

// A crossfading stage layer. `range` is [fadeInStart, fadeInEnd, fadeOutStart,
// fadeOutEnd] in progress units; the layer also rises slightly for depth.
function Stage({
  progress,
  range,
  children,
}: {
  progress: MotionValue<number>;
  range: [number, number, number, number];
  children: ReactNode;
}) {
  const [a, b, c, d] = range;
  const opacity = useTransform(progress, [a, b, c, d], [0, 1, 1, 0]);
  const y = useTransform(progress, [a, d], [24, -24]);
  return (
    <motion.div style={{ opacity, y }} className="col-start-1 row-start-1 w-full">
      {children}
    </motion.div>
  );
}

// ── Stage visuals — all strictly serif / mono / paper / ink / amber ──────────

function AskVisual() {
  return (
    <div className="text-center">
      <p className="font-serif text-[clamp(1.5rem,3.4vw,2.25rem)] leading-[1.3] tracking-[-0.01em] text-primary">
        &ldquo;How many casual leaves<br className="hidden sm:block" /> do I get?&rdquo;
      </p>
      <p className="mt-5 font-sans text-[14px] text-muted">{STAGES[0].blurb}</p>
    </div>
  );
}

function RetrieveVisual() {
  // A row of passage "chunks"; two are amber — the relevant few retrieved from
  // many (the same signal-among-noise idea as the hero).
  const bars = [38, 64, 92, 50, 78, 44, 70, 56];
  const amber = new Set([2, 5]);
  return (
    <div className="text-center">
      <div className="flex items-end justify-center gap-2 sm:gap-2.5" aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            className={`w-3 rounded-full sm:w-3.5 ${amber.has(i) ? "bg-accent" : "bg-chip"}`}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
      <div className="mt-6 font-mono text-[10.5px] tracking-[0.06em] text-muted">
        dense + bm25 → rrf → rerank → <span className="text-chip-text">top 5</span>
      </div>
      <p className="mt-4 font-sans text-[14px] text-muted">{STAGES[1].blurb}</p>
    </div>
  );
}

function CiteVisual() {
  return (
    <div className="text-center">
      <p className="font-serif text-[clamp(1.5rem,3.4vw,2.25rem)] leading-[1.3] tracking-[-0.01em] text-primary">
        You&rsquo;re entitled to{" "}
        <span className="hl-mark">12 casual leaves</span> a year.
      </p>
      <div className="mt-5 inline-flex items-center gap-2 rounded-[5px] bg-chip px-2.5 py-1 font-mono text-[10.5px] text-chip-text">
        <span className="h-[5px] w-[5px] rounded-full bg-accent" />
        HR_Leave_Policy.pdf · p.4
      </div>
      <p className="mt-5 font-sans text-[14px] text-muted">{STAGES[2].blurb}</p>
    </div>
  );
}

// Reduced-motion / no-JS fallback: the same three steps, stacked and static.
function StaticStory() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:px-8" aria-label="How it works: ask, retrieve, cite">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">The method</div>
      <div className="mt-10 space-y-14">
        {STAGES.map((s) => (
          <div key={s.n} className="border-t border-border pt-6">
            <div className="font-mono text-[11px] tracking-[0.14em] text-muted">
              <span className="text-accent">{s.n}</span> {s.title.toUpperCase()}
            </div>
            <p className="mt-3 max-w-xl font-sans text-[15px] leading-[1.7] text-muted">{s.blurb}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
