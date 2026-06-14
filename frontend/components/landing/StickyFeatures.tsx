"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import Reveal from "./Reveal";

/* Feature section (Phase 3). Previously a pinned sticky-scroll; now relaxed into
   three alternating feature rows that reveal with parallax depth — the text and
   its example card travel at slightly different rates as the row scrolls, giving
   layered depth without a second scroll-jacking pin (we keep one pinned moment,
   the ScrollStory). Generous whitespace, slow pacing. Reduced motion: plain
   stacked blocks, no parallax. */

// Hand-drawn icons, stroke currentColor — no icon library (DESIGN.md §6).
function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 3v4h4M9.5 12h5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CiteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.5 7H5.8C5 7 4.5 7.5 4.5 8.3v3.4c0 .8.5 1.3 1.3 1.3h2.4c0 2.2-1 3.6-3 4.5M19.5 7h-3.7c-.8 0-1.3.5-1.3 1.3v3.4c0 .8.5 1.3 1.3 1.3h2.4c0 2.2-1 3.6-3 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WallIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20V6.8c0-.5.2-.9.6-1.1l6.8-3.4c.4-.2.8-.2 1.2 0l6.8 3.4c.4.2.6.6.6 1.1V20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 4v16M4 20h16M8 9.5h8M8 14.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Mini examples (one per feature) — token colors only ────────────────────

function FileListExample() {
  const files: [string, string][] = [
    ["HR_Leave_Policy", "pdf"],
    ["Onboarding_Guide", "docx"],
    ["Q3_All_Hands", "pptx"],
  ];
  return (
    <div className="rounded-[12px] border border-border bg-card px-5 py-3">
      {files.map(([name, ext], i) => (
        <Reveal key={name} delay={i * 120}>
          <div className="flex items-center justify-between py-2.5">
            <span className="font-sans text-[13.5px] text-primary">{name}</span>
            <span className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-chip-text">
              {ext}
            </span>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

function CitationExample() {
  return (
    <div className="rounded-[14px] rounded-bl-[3px] border border-border bg-card px-5 py-4">
      <p className="font-sans text-[13.5px] leading-[1.7] text-primary">
        You&rsquo;re entitled to 12 casual leaves per year.
        <sup className="ml-1 rounded-[4px] bg-chip px-1 font-sans text-[10px] text-chip-text">1</sup>
      </p>
      <div className="mt-2.5 inline-block rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[10px] text-chip-text">
        [Source: HR_Policy.pdf · p.4]
      </div>
    </div>
  );
}

function AccessExample() {
  return (
    <div>
      <div className="grid grid-cols-2 overflow-hidden rounded-[12px] border border-border bg-card">
        <div className="border-r border-border px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-chip-text">HR</div>
          <p className="mt-2 font-sans text-[12.5px] leading-[1.7] text-muted">sees HR documents</p>
        </div>
        <div className="px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-chip-text">IT</div>
          <p className="mt-2 font-sans text-[12.5px] leading-[1.7] text-muted">sees IT documents</p>
        </div>
      </div>
      {/* The wall is real: this is the actual Qdrant filter, not a promise. */}
      <div className="mt-2.5 text-center font-mono text-[9.5px] text-muted">
        filter: department_id == jwt.department_id
      </div>
    </div>
  );
}

type Feature = {
  title: string;
  desc: string;
  icon: ReactNode;
  example: ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: "Reads everything",
    desc: "PDFs, Word, and slide decks are parsed with their page numbers intact, then chunked so retrieval stays precise.",
    icon: <FileIcon />,
    example: <FileListExample />,
  },
  {
    title: "Cites everything",
    desc: "Every answer carries its receipts — the source file and the exact page, so a claim can always be checked.",
    icon: <CiteIcon />,
    example: <CitationExample />,
  },
  {
    title: "Walls that hold",
    desc: "Access is enforced at the vector-database query itself. You only ever see answers drawn from your department's documents.",
    icon: <WallIcon />,
    example: <AccessExample />,
  },
];

// A scroll-linked parallax wrapper. The child drifts within `range` (px) as the
// element travels through the viewport. Off under reduced motion.
function Parallax({
  children,
  range = [40, -40],
  className = "",
}: {
  children: ReactNode;
  range?: [number, number];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], range);
  return (
    <motion.div ref={ref} style={reduceMotion ? undefined : { y }} className={className}>
      {children}
    </motion.div>
  );
}

export default function StickyFeatures() {
  return (
    <section id="how-it-works" className="border-y border-border bg-subtle">
      <div className="mx-auto max-w-5xl px-6 py-24 sm:px-8 sm:py-32">
        <Reveal>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            What you can count on
          </div>
        </Reveal>

        <div className="mt-16 space-y-24 sm:mt-24 sm:space-y-36">
          {FEATURES.map((f, i) => {
            const flip = i % 2 === 1; // alternate sides for rhythm
            return (
              <div key={f.title} className="grid items-center gap-10 sm:grid-cols-2 sm:gap-16">
                {/* Text column — foreground, gentle opposite parallax for depth. */}
                <Parallax
                  range={[16, -16]}
                  className={flip ? "sm:order-2" : "sm:order-1"}
                >
                  <Reveal>
                    <div className="text-chip-text">{f.icon}</div>
                    <h3 className="mt-5 font-serif text-[clamp(1.6rem,3vw,2rem)] leading-[1.15] tracking-[-0.02em] text-primary">
                      {f.title}
                    </h3>
                    <p className="mt-4 max-w-md font-sans text-[14.5px] leading-[1.75] text-muted">
                      {f.desc}
                    </p>
                  </Reveal>
                </Parallax>

                {/* Visual column — background layer, larger parallax travel. */}
                <Parallax
                  range={[48, -48]}
                  className={flip ? "sm:order-1" : "sm:order-2"}
                >
                  <Reveal delay={120}>{f.example}</Reveal>
                </Parallax>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
