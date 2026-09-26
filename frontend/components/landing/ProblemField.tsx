"use client";

import { motion, useReducedMotion } from "motion/react";

// ── Scene 2 — THE PROBLEM ────────────────────────────────────────────────────
// The noise the engine has to cut through. A drifting field of faint mono
// document-fragments (file names, sections, half-sentences) — overwhelming,
// unanswerable at a glance — with ONE plain-language question that floats in
// and holds dead-centre. This establishes the "signal among noise" motif that
// the retrieval + cite scenes later resolve.
//
// Positions are a fixed, hand-tuned list (NOT Math.random) so server and client
// render identically — no hydration mismatch, no layout shift. Drift is pure
// transform (translate), so it stays on the compositor at 60fps and never
// touches layout/colour. Reduced motion freezes the field to its settled frame.

type Fragment = {
  t: string;
  // position in % of the stage
  x: number;
  y: number;
  // drift amplitude (px) + duration (s) — each fragment breathes on its own clock
  dx: number;
  dy: number;
  dur: number;
  // base opacity — all faint; none competes with the question
  o: number;
  size: number;
};

const FRAGMENTS: Fragment[] = [
  { t: "leave_policy_v3.pdf", x: 7, y: 14, dx: 10, dy: -8, dur: 17, o: 0.26, size: 11 },
  { t: "§4.2 · casual leave accrual", x: 70, y: 9, dx: -12, dy: 9, dur: 21, o: 0.2, size: 10.5 },
  { t: "…1.25 days per month…", x: 30, y: 24, dx: 8, dy: 10, dur: 19, o: 0.16, size: 10 },
  { t: "onboarding_guide.docx", x: 80, y: 30, dx: -9, dy: -7, dur: 23, o: 0.24, size: 11 },
  { t: "probation: 90 days", x: 13, y: 38, dx: 11, dy: 6, dur: 18, o: 0.18, size: 10 },
  { t: "q3_all_hands.pptx · slide 12", x: 58, y: 33, dx: -7, dy: -10, dur: 20, o: 0.22, size: 10.5 },
  { t: "reimbursement ≤ 30 days", x: 4, y: 60, dx: 9, dy: -6, dur: 22, o: 0.17, size: 10 },
  { t: "vpn_setup.md", x: 88, y: 56, dx: -10, dy: 8, dur: 16, o: 0.23, size: 11 },
  { t: "payroll cutoff · 25th", x: 24, y: 70, dx: 7, dy: 9, dur: 24, o: 0.16, size: 10 },
  { t: "section 7 · grievances", x: 66, y: 64, dx: -8, dy: -8, dur: 19, o: 0.19, size: 10.5 },
  { t: "security_handbook.pdf", x: 47, y: 78, dx: 10, dy: -9, dur: 21, o: 0.21, size: 11 },
  { t: "…unless otherwise stated…", x: 12, y: 86, dx: -6, dy: 7, dur: 18, o: 0.15, size: 10 },
  { t: "carry-forward: max 10", x: 82, y: 82, dx: 8, dy: 8, dur: 23, o: 0.18, size: 10 },
  { t: "expense_policy.xlsx", x: 38, y: 50, dx: -9, dy: -7, dur: 20, o: 0.2, size: 10.5 },
  { t: "appendix B · holidays", x: 92, y: 18, dx: -7, dy: 9, dur: 17, o: 0.17, size: 10 },
  { t: "…subject to manager approval…", x: 2, y: 28, dx: 9, dy: 6, dur: 22, o: 0.15, size: 10 },
  { t: "code_of_conduct.pdf", x: 54, y: 16, dx: -8, dy: -6, dur: 19, o: 0.22, size: 11 },
  { t: "remote_work_addendum.docx", x: 72, y: 90, dx: -10, dy: -8, dur: 24, o: 0.18, size: 10.5 },
];

export default function ProblemField() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      aria-label="The problem: the answer is buried in the documents"
      className="relative flex min-h-svh items-center overflow-hidden border-t border-border bg-main"
    >
      {/* The drifting noise — decorative, hidden from AT. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {FRAGMENTS.map((f, i) => (
          <motion.span
            key={i}
            className="absolute whitespace-nowrap font-mono tracking-[0.04em] text-muted"
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              fontSize: `${f.size}px`,
              opacity: f.o,
            }}
            animate={
              reduceMotion ? undefined : { x: [0, f.dx, 0], y: [0, f.dy, 0] }
            }
            transition={{
              duration: f.dur,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {f.t}
          </motion.span>
        ))}
      </div>

      {/* Vignette: fades the drifting fragments toward the centre so the
          question sits in a calm clearing. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, var(--bg-main) 12%, rgba(0,0,0,0) 75%)",
        }}
      />

      {/* The question — the signal. Rises in and holds. */}
      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 text-center sm:px-8">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <div className="mb-7 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            The problem
          </div>
          <p className="font-serif text-[clamp(1.75rem,5vw,3rem)] leading-[1.18] tracking-[-0.02em] text-primary">
            The answer is in here.
            <br />
            <span className="italic text-muted">Somewhere.</span>
          </p>
          <p className="mx-auto mt-7 max-w-md font-sans text-[14.5px] leading-[1.75] text-muted">
            Every policy, deck, and doc your team has ever written — and not one
            of them tells you which sentence to trust.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
