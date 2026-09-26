"use client";

import { useEffect, useRef, useState } from "react";
import { useScroll, useMotionValueEvent, motion } from "motion/react";

// ── Scene 4 — RETRIEVAL · THE CENTERPIECE ────────────────────────────────────
// The hybrid pipeline made visible, pinned and scroll-driven. Two lanes —
// DENSE (semantic) and SPARSE (bm25 / keyword) — each fan out ~20 candidate
// chunks. Their lines converge into RRF FUSION, and a cross-encoder reranker
// narrows the field to the few amber chunks that actually matter: the same
// signal-among-noise motif from the hero and ingestion, now resolved.
//
// A mono trace ticks in sync with scroll
//   dense·20  +  bm25·20  →  rrf(k=60)  →  rerank → 8
// and an amber step rail (01 Ask · 02 Retrieve · 03 Cite) fills as you descend.
//
// Implementation: one tall section (320vh) with a sticky 100svh stage. Scroll
// progress is read into state and turned into plain math; the diagram is an
// inline SVG so every line/point is a crisp vector at any size. Reduced motion
// and narrow screens swap in a calm static stack — no pin, no scroll-jacking.

const N = 16; // candidates per lane (reads as "~20", stays light in SVG)
const M = 8; // chunks surviving the rerank

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
// staggered per-item reveal: item i of n appears as `r` sweeps 0→1
const stagger = (r: number, i: number, n: number) =>
  clamp(r * (n + 3) - i);

// SVG geometry (viewBox 720×380)
const FX = 430,
  FY = 190; // fusion node
const denseX = 96,
  sparseX = 250,
  outX = 624;
const col = (x: number, n: number, top: number, bot: number) =>
  Array.from({ length: n }, (_, i) => ({
    x,
    y: top + (i * (bot - top)) / (n - 1),
  }));
const DENSE = col(denseX, N, 52, 328);
const SPARSE = col(sparseX, N, 52, 328);
const OUT = col(outX, M, 96, 284);

const STEPS = [
  { n: "01", label: "Ask" },
  { n: "02", label: "Retrieve" },
  { n: "03", label: "Cite" },
];

export default function RetrievalPinned() {
  // Decide pinned-vs-static only after mount (server + first client render must
  // match — both pinned — to avoid a hydration mismatch).
  const [staticMode, setStaticMode] = useState(false);
  useEffect(() => {
    const mqR = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqN = window.matchMedia("(max-width: 767px)");
    const decide = () => setStaticMode(mqR.matches || mqN.matches);
    decide();
    mqR.addEventListener("change", decide);
    mqN.addEventListener("change", decide);
    return () => {
      mqR.removeEventListener("change", decide);
      mqN.removeEventListener("change", decide);
    };
  }, []);

  if (staticMode) return <StaticRetrieval />;
  return <PinnedRetrieval />;
}

function PinnedRetrieval() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", setP);

  // Choreography windows
  const denseR = ramp(p, 0.04, 0.22);
  const sparseR = ramp(p, 0.18, 0.36);
  const convR = ramp(p, 0.36, 0.6); // candidate→fusion lines brighten
  const fuseR = ramp(p, 0.52, 0.64); // fusion node lights
  const dimR = ramp(p, 0.64, 0.82); // losing candidates fade
  const rerankR = ramp(p, 0.64, 0.9); // surviving chunks emerge, amber
  const railFill = ramp(p, 0.04, 0.96);

  const nDense = Math.round(20 * denseR);
  const nSparse = Math.round(20 * sparseR);

  return (
    <section
      ref={ref}
      id="how-it-works"
      aria-label="Retrieval: hybrid search, fusion, and reranking"
      className="relative h-[320vh] border-t border-border bg-main"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-3xl px-6 sm:px-8">
          <StepRail fill={railFill} />

          <div className="mt-10 sm:mt-12">
            <svg
              viewBox="0 0 720 380"
              className="w-full"
              role="img"
              aria-label="Diagram of dense and sparse retrieval converging into reciprocal-rank fusion and a reranker"
            >
              {/* lane labels */}
              <text x={denseX} y={32} textAnchor="middle" className="font-mono" fontSize="11" fill="var(--text-muted)" style={{ letterSpacing: "1px" }}>DENSE</text>
              <text x={denseX} y={356} textAnchor="middle" className="font-mono" fontSize="9" fill="var(--text-muted)" opacity={0.7}>semantic</text>
              <text x={sparseX} y={32} textAnchor="middle" className="font-mono" fontSize="11" fill="var(--text-muted)" style={{ letterSpacing: "1px" }}>SPARSE</text>
              <text x={sparseX} y={356} textAnchor="middle" className="font-mono" fontSize="9" fill="var(--text-muted)" opacity={0.7}>bm25</text>

              {/* candidate → fusion connector lines (faint, brighten on converge) */}
              {DENSE.map((d, i) => (
                <line key={"dl" + i} x1={d.x + 6} y1={d.y} x2={FX} y2={FY}
                  stroke="var(--text-muted)"
                  strokeWidth="0.6"
                  opacity={stagger(denseR, i, N) * convR * 0.22 * (1 - dimR * 0.7)} />
              ))}
              {SPARSE.map((s, i) => (
                <line key={"sl" + i} x1={s.x + 6} y1={s.y} x2={FX} y2={FY}
                  stroke="var(--text-muted)"
                  strokeWidth="0.6"
                  opacity={stagger(sparseR, i, N) * convR * 0.22 * (1 - dimR * 0.7)} />
              ))}

              {/* fusion → surviving chunk lines (amber) */}
              {OUT.map((o, i) => (
                <line key={"ol" + i} x1={FX} y1={FY} x2={o.x - 6} y2={o.y}
                  stroke="var(--accent)"
                  strokeWidth="1"
                  opacity={stagger(rerankR, i, M) * 0.7} />
              ))}

              {/* candidate dots — dim as the reranker discards them */}
              {DENSE.map((d, i) => (
                <circle key={"dd" + i} cx={d.x} cy={d.y} r="3.4"
                  fill="var(--text-muted)"
                  opacity={stagger(denseR, i, N) * (0.5 - dimR * 0.4)} />
              ))}
              {SPARSE.map((s, i) => (
                <circle key={"sd" + i} cx={s.x} cy={s.y} r="3.4"
                  fill="var(--text-muted)"
                  opacity={stagger(sparseR, i, N) * (0.5 - dimR * 0.4)} />
              ))}

              {/* RRF fusion node */}
              <circle cx={FX} cy={FY} r={9 + fuseR * 3}
                fill="var(--bg-card)" stroke="var(--accent)" strokeWidth="1.5"
                opacity={0.3 + convR * 0.7} />
              <circle cx={FX} cy={FY} r="3" fill="var(--accent)" opacity={fuseR} />
              <text x={FX} y={FY - 22} textAnchor="middle" className="font-mono" fontSize="10" fill="var(--text-muted)" opacity={convR} style={{ letterSpacing: "0.5px" }}>RRF · k=60</text>

              {/* surviving chunks — the amber few */}
              {OUT.map((o, i) => (
                <circle key={"od" + i} cx={o.x} cy={o.y} r="4.2"
                  fill="var(--accent)"
                  opacity={stagger(rerankR, i, M)} />
              ))}
              <text x={outX} y={72} textAnchor="middle" className="font-mono" fontSize="10" fill="var(--text-muted)" opacity={rerankR} style={{ letterSpacing: "0.5px" }}>RERANK</text>
              <text x={outX} y={306} textAnchor="middle" className="font-mono" fontSize="9" fill="var(--text-muted)" opacity={rerankR * 0.8}>cross-encoder</text>
            </svg>
          </div>

          {/* the live trace, ticking with scroll */}
          <div className="mt-8 text-center font-mono text-[11px] tracking-[0.04em] text-muted sm:text-[12px]">
            <span className="tabular-nums">dense·{nDense}</span>
            <span className="px-1.5 opacity-50">+</span>
            <span className="tabular-nums">bm25·{nSparse}</span>
            <span style={{ opacity: convR }}>
              <span className="px-1.5 opacity-50">→</span>rrf(k=60)
            </span>
            <span style={{ opacity: rerankR }}>
              <span className="px-1.5 opacity-50">→</span>rerank →{" "}
              <span className="text-accent">{Math.max(0, Math.round(rerankR * M))}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Amber step rail: 01 Ask — 02 Retrieve — 03 Cite ─────────────────────────
function StepRail({ fill }: { fill: number }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        The method
      </div>
      <div className="relative mt-6">
        <div className="absolute left-0 right-0 top-[7px] h-px bg-border" />
        <motion.div
          className="absolute left-0 top-[7px] h-px bg-accent"
          style={{ width: `${fill * 100}%` }}
        />
        <div className="relative flex justify-between">
          {STEPS.map((s, i) => {
            const at = 0.04 + 0.92 * (i / (STEPS.length - 1));
            const on = fill >= at - 0.04;
            const align =
              i === 0 ? "items-start" : i === STEPS.length - 1 ? "items-end" : "items-center";
            return (
              <div key={s.n} className={`flex flex-col ${align}`}>
                <span
                  className="h-[15px] w-[15px] rounded-full border-[3px] border-main"
                  style={{ backgroundColor: on ? "var(--accent)" : "var(--border)" }}
                />
                <div
                  className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em]"
                  style={{ color: on ? "var(--text-primary)" : "var(--text-muted)" }}
                >
                  <span className="text-accent">{s.n}</span> {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Reduced-motion / mobile fallback — the pipeline as a calm static stack.
function StaticRetrieval() {
  const stages = [
    { n: "01", t: "Ask", d: "A question in plain language — no keywords, no query syntax." },
    { n: "02", t: "Retrieve", d: "Dense + bm25 each return ~20 candidates, fused with RRF (k=60), then reranked by a cross-encoder to the 8 passages that matter." },
    { n: "03", t: "Cite", d: "An answer written from those passages — each claim tied to its source." },
  ];
  return (
    <section
      id="how-it-works"
      aria-label="Retrieval: hybrid search, fusion, and reranking"
      className="border-t border-border bg-main"
    >
      <div className="mx-auto max-w-3xl px-6 py-24 sm:px-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">The method</div>
        <div className="mt-10 space-y-12">
          {stages.map((s) => (
            <div key={s.n} className="border-t border-border pt-6">
              <div className="font-mono text-[11px] tracking-[0.14em] text-muted">
                <span className="text-accent">{s.n}</span> {s.t.toUpperCase()}
              </div>
              <p className="mt-3 max-w-xl font-sans text-[15px] leading-[1.7] text-muted">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 font-mono text-[11px] tracking-[0.04em] text-muted">
          dense·20 + bm25·20 → rrf(k=60) → rerank → <span className="text-accent">8</span>
        </div>
      </div>
    </section>
  );
}
