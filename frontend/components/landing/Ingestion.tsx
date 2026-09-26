"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";

// ── Scene 3 — INGESTION (the engine wakes) ───────────────────────────────────
// The first machine moment. A source document splits into a stack of chunk bars
// — small 256-token "child" chunks nested inside a large 1024-token "parent" —
// and, as you scroll, those chunks slot into a faint vector grid (the embedding
// space). The copy carries the real idea: retrieve on the small chunks for
// precision, generate from the large ones for context (hierarchical chunking).
//
// One pinned stage (sticky 100svh inside a tall parent). All choreography is
// driven by a single scroll-progress value read into React state and turned into
// plain math — far less machinery than dozens of useTransform hooks, and a
// pinned scene re-renders cheaply. Reduced motion / mobile → calm static stack.

const COLS = 12;
const ROWS = 6;
const TOTAL = COLS * ROWS;
// A scattered handful of grid cells light amber — the signal among the noise,
// reused from the hero and carried forward into retrieval.
const AMBER = new Set([8, 19, 27, 41, 52, 63]);

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (p: number, a: number, b: number) => clamp((p - a) / (b - a));

export default function Ingestion() {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  // Mirror scroll progress into state so the visual can be plain JSX math.
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", setP);
  const prog = reduceMotion ? 1 : p;

  // Choreography windows (in progress units):
  const split = ramp(prog, 0.04, 0.34); // children separate out of the document
  const fill = ramp(prog, 0.34, 0.92); // grid fills with embedded chunks
  const litThreshold = fill; // a cell is "embedded" once fill passes its position

  const children = [0, 1, 2, 3]; // four 256-token child chunks per parent

  return (
    <section
      ref={ref}
      id="ingestion"
      aria-label="Ingestion: documents are chunked and embedded"
      className="relative h-[220vh] border-t border-border bg-subtle"
    >
      <div className="sticky top-0 flex h-svh items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-12 px-6 sm:px-8 md:grid-cols-2 md:gap-16">
          {/* ── Copy ── */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Ingestion
            </div>
            <h2 className="mt-6 max-w-md font-serif text-[clamp(1.6rem,3.4vw,2.4rem)] leading-[1.14] tracking-[-0.02em] text-primary">
              Read once, chunked two ways.
            </h2>
            <p className="mt-5 max-w-md font-sans text-[14.5px] leading-[1.75] text-muted">
              Each document is split into small child chunks and the larger
              parent passages that hold them. Retrieval searches the small chunks
              for precision; the answer is written from the parents for context.
            </p>
            <div className="mt-7 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.1em]">
              <span className="rounded-[4px] bg-chip px-2 py-1 text-chip-text">
                256-token child
              </span>
              <span className="rounded-[4px] bg-chip px-2 py-1 text-chip-text">
                1024-token parent
              </span>
            </div>
          </div>

          {/* ── Visual: document → chunk stack → vector grid ── */}
          <div className="relative" aria-hidden>
            {/* Parent chunk: a bordered card that the children separate within. */}
            <div className="relative mx-auto w-full max-w-xs">
              <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                HR_Leave_Policy.pdf
              </div>
              <div className="rounded-[10px] border border-border bg-card p-3">
                <div className="space-y-2">
                  {children.map((c) => {
                    // Children fan apart vertically as `split` advances, then the
                    // top two drift toward the grid below (slotting in).
                    const slot = ramp(prog, 0.18 + c * 0.04, 0.5);
                    const isAmber = c === 1; // one child is the retrieved signal
                    return (
                      <div
                        key={c}
                        className="origin-left"
                        style={{
                          transform: `translateX(${slot * 14}px)`,
                          opacity: 1 - slot * 0.25,
                        }}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className="h-[6px] w-[6px] rounded-full"
                            style={{
                              backgroundColor: isAmber
                                ? "var(--accent)"
                                : "var(--border)",
                            }}
                          />
                          <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
                            child · 256
                          </span>
                        </div>
                        {/* faux text lines */}
                        <div className="space-y-1 pl-3.5">
                          <div
                            className="h-[3px] rounded-full"
                            style={{
                              width: `${70 - c * 8}%`,
                              backgroundColor: isAmber
                                ? "var(--accent)"
                                : "var(--border)",
                              opacity: isAmber ? 0.5 + split * 0.3 : 0.6,
                            }}
                          />
                          <div
                            className="h-[3px] rounded-full"
                            style={{
                              width: `${52 - c * 6}%`,
                              backgroundColor: "var(--border)",
                              opacity: 0.45,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Vector grid — chunks embed into points; cells light as you scroll. */}
            <div className="mx-auto mt-7 w-full max-w-xs">
              <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                <span>vector space</span>
                <span className="tabular-nums">
                  {Math.round(fill * TOTAL)} / {TOTAL} embedded
                </span>
              </div>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
              >
                {Array.from({ length: TOTAL }).map((_, i) => {
                  const lit = i / TOTAL < litThreshold;
                  const amber = AMBER.has(i) && lit;
                  return (
                    <span
                      key={i}
                      className="aspect-square rounded-[2px]"
                      style={{
                        backgroundColor: amber
                          ? "var(--accent)"
                          : lit
                          ? "var(--text-muted)"
                          : "var(--border)",
                        opacity: amber ? 0.95 : lit ? 0.38 : 0.5,
                        transition: reduceMotion
                          ? "none"
                          : "background-color .25s ease, opacity .25s ease",
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Connector caption — the trace, mono. */}
            <motion.div
              className="mt-4 text-center font-mono text-[9.5px] tracking-[0.06em] text-muted"
              initial={reduceMotion ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              parse → chunk(256 / 1024) → embed → index
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
