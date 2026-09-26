"use client";

import { motion, useReducedMotion } from "motion/react";
import Reveal from "@/components/landing/Reveal";

// ── Scene 5 — THE WALL (access control) ──────────────────────────────────────
// The credibility beat. A clean hairline partition slides in with an amber
// boundary; chunks from other departments dim and are cut off. The wall is real:
// it's a filter on the vector query itself (Qdrant), not a check in app code —
// so an HR user can never retrieve an IT document, by construction. Below, the
// three visibility tiers the store enforces: company / department / personal.
//
// whileInView reveal (no pin needed). Reduced motion shows the settled state.

// A small grid of "chunks" split across the boundary. Left = your department
// (kept, present). Right = other departments (blocked, dimmed + cut off).
const KEPT = [
  "HR_Leave_Policy",
  "Onboarding_Guide",
  "Payroll_FAQ",
  "Benefits_2026",
  "Code_of_Conduct",
  "Holiday_List",
];
const BLOCKED = [
  "IT_Runbook",
  "Network_Config",
  "Incident_Postmortem",
  "Finance_Q3",
  "Vendor_Contracts",
  "Cap_Table",
];

const TIERS = [
  { t: "Company", d: "everyone can read" },
  { t: "Department", d: "your team only", active: true },
  { t: "Personal", d: "only you" },
];

export default function AccessWall() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="security"
      aria-label="Access control enforced at the vector layer"
      className="border-t border-border bg-subtle"
    >
      <div className="mx-auto max-w-5xl px-6 py-24 sm:px-8 sm:py-32">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          {/* ── Copy ── */}
          <div>
            <Reveal>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Security
              </div>
            </Reveal>
            <Reveal>
              <h2 className="mt-6 max-w-md font-serif text-[clamp(1.6rem,3.4vw,2.4rem)] leading-[1.14] tracking-[-0.02em] text-primary">
                A wall that holds, because it isn&rsquo;t in the app.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-5 max-w-md font-sans text-[14.5px] leading-[1.75] text-muted">
                An HR user can never read an IT document — enforced at the vector
                layer, not in application code. Permissions are a filter on the
                retrieval query itself, so blocked passages are never fetched,
                never ranked, never seen.
              </p>
            </Reveal>
            <Reveal delay={200}>
              <div className="mt-7 inline-block rounded-[5px] bg-chip px-2.5 py-1.5 font-mono text-[10.5px] text-chip-text">
                filter: department_id == jwt.department_id
              </div>
            </Reveal>
          </div>

          {/* ── Visual: the partition ── */}
          <Reveal delay={120}>
            <div>
              <div className="relative overflow-hidden rounded-[12px] border border-border bg-card p-5">
                {/* labels */}
                <div className="mb-4 flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.12em]">
                  <span className="flex items-center gap-1.5 text-chip-text">
                    <span className="h-[5px] w-[5px] rounded-full bg-accent" />
                    HR · you
                  </span>
                  <span className="text-muted opacity-60">other departments</span>
                </div>

                <div className="relative grid grid-cols-2 gap-x-10 gap-y-2.5">
                  {/* kept column */}
                  <div className="space-y-2.5">
                    {KEPT.map((name, i) => (
                      <motion.div
                        key={name}
                        initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, amount: 0.5 }}
                        transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 0.61, 0.36, 1] }}
                        className="flex items-center gap-2 rounded-[5px] border border-border bg-subtle px-2.5 py-1.5"
                      >
                        <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-accent" />
                        <span className="truncate font-mono text-[10px] text-primary">{name}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* blocked column — dims and is cut off */}
                  <div className="space-y-2.5">
                    {BLOCKED.map((name, i) => (
                      <motion.div
                        key={name}
                        initial={reduceMotion ? false : { opacity: 0.5 }}
                        whileInView={{ opacity: 0.14 }}
                        viewport={{ once: true, amount: 0.5 }}
                        transition={{ duration: 0.6, delay: 0.5 + i * 0.05 }}
                        className="flex items-center gap-2 rounded-[5px] border border-border px-2.5 py-1.5"
                      >
                        <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-muted" />
                        <span className="truncate font-mono text-[10px] text-muted line-through">{name}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* the partition: an amber hairline that slides down the centre */}
                  <motion.div
                    className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent"
                    initial={reduceMotion ? false : { scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
                    style={{ originY: 0 }}
                    aria-hidden
                  />
                </div>
              </div>

              {/* 3-tier visibility legend */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                {TIERS.map((tier) => (
                  <div
                    key={tier.t}
                    className="rounded-[8px] border border-border bg-card px-3 py-2.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-[5px] w-[5px] rounded-full"
                        style={{ backgroundColor: tier.active ? "var(--accent)" : "var(--border)" }}
                      />
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-primary">
                        {tier.t}
                      </span>
                    </div>
                    <div className="mt-1 font-sans text-[11px] leading-[1.5] text-muted">
                      {tier.d}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
