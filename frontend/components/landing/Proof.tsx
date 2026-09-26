"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import Reveal from "./Reveal";

// Proof — the engine-room credibility moment (landing prompt scene 7). The
// corrected RAGAS evaluation made visible: three retrieval strategies, two
// metrics, 30 fixed questions, graded by two judge models independent of the
// generator. Hybrid wins on both — the one amber row among muted ones, reusing
// the page's signal-among-noise motif. The headline figure counts up once when
// scrolled into view; each row's average has a hairline bar that grows to its
// score. Reduced motion shows the settled state, no count, no growth.
// Source: backend/evaluation/final_results.json.

type Row = {
  method: string;
  faith: number;
  ctx: number;
  avg: number;
  best?: boolean;
};

const ROWS: Row[] = [
  { method: "Dense", faith: 0.873, ctx: 0.933, avg: 0.903 },
  { method: "Hybrid", faith: 0.89, ctx: 0.939, avg: 0.914, best: true },
  { method: "Hybrid + rerank", faith: 0.777, ctx: 0.903, avg: 0.84 },
];

// Count a number up from 0 to `target` the first time it enters view. easeOutCubic
// matches the brand reveal curve; reduced motion jumps straight to the value.
function useCountUp(target: number, decimals = 3, durationMs = 1100) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      setVal(target);
      return;
    }
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setVal(target * easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduceMotion, target, durationMs]);

  return { ref, text: val.toFixed(decimals) };
}

function ProofRow({ row }: { row: Row }) {
  const reduceMotion = useReducedMotion();
  const amber = row.best;
  return (
    <div
      className={`relative grid grid-cols-[1.5fr_repeat(3,1fr)] items-center gap-2 px-5 py-3.5 ${
        amber ? "bg-subtle" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-[6px] w-[6px] rounded-full ${amber ? "bg-accent" : "bg-border"}`} aria-hidden />
        <span className={`font-sans text-[13px] ${amber ? "text-primary" : "text-muted"}`}>{row.method}</span>
      </div>
      <span className="text-right font-mono text-[12px] tabular-nums text-muted">{row.faith.toFixed(3)}</span>
      <span className="text-right font-mono text-[12px] tabular-nums text-muted">{row.ctx.toFixed(3)}</span>
      <span className={`text-right font-mono text-[12px] tabular-nums ${amber ? "text-accent" : "text-muted"}`}>
        {row.avg.toFixed(3)}
      </span>

      {/* Hairline bar along the bottom of the row, scaled to the average score —
          a quiet bar chart hidden in the table; amber only for the winner. */}
      <motion.div
        className={`absolute bottom-0 left-5 h-px origin-left ${amber ? "bg-accent" : "bg-border"}`}
        style={{ width: `calc((100% - 2.5rem) * ${row.avg})` }}
        initial={reduceMotion ? false : { scaleX: 0 }}
        whileInView={reduceMotion ? undefined : { scaleX: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
        aria-hidden
      />
    </div>
  );
}

export default function Proof() {
  const hero = useCountUp(0.914, 3);

  return (
    <section id="research" className="bg-main">
      <div className="mx-auto max-w-5xl px-6 py-24 sm:px-8 sm:py-32">
        <Reveal>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            Measured, not asserted
          </div>
        </Reveal>

        <div className="mt-12 grid gap-14 sm:mt-16 sm:grid-cols-[0.9fr_1.1fr] sm:items-center sm:gap-16">
          {/* The headline figure — the focal count-up. */}
          <Reveal>
            <div>
              <span
                ref={hero.ref}
                className="block font-serif text-[clamp(3.5rem,9vw,5.5rem)] leading-none tracking-[-0.02em] tabular-nums text-accent"
              >
                {hero.text}
              </span>
              <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                average · best of three strategies
              </div>
              <h2 className="mt-7 max-w-sm font-serif text-[clamp(1.5rem,3vw,2rem)] leading-[1.2] tracking-[-0.02em] text-primary">
                Hybrid retrieval, proven the hard way.
              </h2>
              <p className="mt-4 max-w-md font-sans text-[14.5px] leading-[1.75] text-muted">
                Three retrieval strategies, two metrics, thirty fixed questions —
                graded by two judge models that never see their own generations.
                Hybrid wins on both.
              </p>
            </div>
          </Reveal>

          {/* The comparison — hybrid is the one amber row. */}
          <Reveal delay={120}>
            <div>
              <div className="overflow-hidden rounded-[12px] border border-border bg-card">
                <div className="grid grid-cols-[1.5fr_repeat(3,1fr)] gap-2 border-b border-border px-5 py-3 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                  <span>Method</span>
                  <span className="text-right">Faith.</span>
                  <span className="text-right">Ctx.</span>
                  <span className="text-right">Avg.</span>
                </div>
                {ROWS.map((r) => (
                  <ProofRow key={r.method} row={r} />
                ))}
              </div>
              <div className="mt-3 text-center font-mono text-[9.5px] leading-[1.7] text-muted">
                RAGAS · judges qwen2.5:7b + llama-3.1-8b, independent of the generator
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
