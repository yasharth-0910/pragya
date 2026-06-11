"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Reveal from "./Reveal";

/* Sticky-scroll feature section (replaces the flat 3-column strip).
   Desktop (≥640px): left 40% column is sticky and crossfades the current
   feature's serif title + description; right 60% column scrolls through one
   ~80vh panel per feature (icon, detail, mini example).
   Mobile (<640px): the sticky column is hidden and each panel shows its own
   title — plain vertical sections, nothing sticky. */

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

// a) "Reads everything": file list with pdf/docx/pptx rows fading in.
function FileListExample() {
  const files: [string, string][] = [
    ["HR_Leave_Policy", "pdf"],
    ["Onboarding_Guide", "docx"],
    ["Q3_All_Hands", "pptx"],
  ];
  return (
    <div className="rounded-[12px] border border-border bg-card px-5 py-3">
      {files.map(([name, ext], i) => (
        // Nested Reveal: rows fade in one after another once the card is seen.
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

// b) "Cites everything": chat bubble with a citation chip + source tag (§5).
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

// c) "Walls that hold": two department boxes split by a hairline.
function AccessExample() {
  return (
    <div>
      <div className="grid grid-cols-2 overflow-hidden rounded-[12px] border border-border bg-card">
        <div className="border-r border-border px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-chip-text">HR</div>
          <p className="mt-2 font-sans text-[12.5px] leading-[1.7] text-muted">
            sees HR documents
          </p>
        </div>
        <div className="px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-chip-text">IT</div>
          <p className="mt-2 font-sans text-[12.5px] leading-[1.7] text-muted">
            sees IT documents
          </p>
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
  detail: string;
  icon: ReactNode;
  example: ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: "Reads everything",
    desc: "PDFs, Word, and slide decks are parsed with their page numbers intact, then chunked so retrieval stays precise.",
    detail: "Drop in a policy PDF, a process doc, a deck from the last all-hands — each is parsed and indexed within seconds.",
    icon: <FileIcon />,
    example: <FileListExample />,
  },
  {
    title: "Cites everything",
    desc: "Every answer carries its receipts — the source file and the exact page, so a claim can always be checked.",
    detail: "No answer arrives without a link back to the file and page it came from. If it can't be cited, it isn't said.",
    icon: <CiteIcon />,
    example: <CitationExample />,
  },
  {
    title: "Walls that hold",
    desc: "Access is enforced at the vector-database query itself. You only ever see answers drawn from your department's documents.",
    detail: "Department access isn't a UI checkbox — it's a filter applied inside the data layer on every single query.",
    icon: <WallIcon />,
    example: <AccessExample />,
  },
];

export default function StickyFeatures() {
  const [active, setActive] = useState(0);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // Whichever right-column panel crosses the middle band of the viewport
    // becomes the active feature shown in the sticky left column.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    panelRefs.current.forEach((panel) => panel && observer.observe(panel));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="mt-24 border-y border-border bg-subtle">
      <div className="mx-auto max-w-4xl px-7 sm:grid sm:grid-cols-[40%_60%]">
        {/* Left column — sticky on ≥640px, hidden on mobile. */}
        <div className="hidden sm:block">
          <div className="sticky top-0 flex h-screen flex-col justify-center pr-12">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              How it works
            </div>

            {/* All three title/desc pairs stacked in one grid cell; the
               active one crossfades in as the right column scrolls. */}
            <div className="mt-5 grid">
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  style={{ gridArea: "1 / 1" }}
                  aria-hidden={i !== active}
                  className={`transition-opacity duration-300 ${
                    i === active ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                >
                  <h3 className="font-serif text-[32px] leading-[1.15] tracking-[-0.02em] text-primary">
                    {f.title}
                  </h3>
                  <p className="mt-4 font-sans text-[14px] leading-[1.75] text-muted">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 font-mono text-[10px] tracking-[0.1em] text-muted">
              0{active + 1} / 0{FEATURES.length}
            </div>
          </div>
        </div>

        {/* Right column — one tall panel per feature. */}
        <div>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              data-index={i}
              className="flex flex-col justify-center py-14 sm:min-h-[80vh] sm:py-16"
            >
              {/* Mobile-only title/desc — stands in for the hidden sticky column. */}
              <h3 className="font-serif text-[22px] leading-[1.2] text-primary sm:hidden">
                {f.title}
              </h3>
              <p className="mt-3 font-sans text-[14px] leading-[1.75] text-muted sm:hidden">
                {f.desc}
              </p>

              <Reveal className="mt-8 sm:mt-0">
                <div className="text-chip-text">{f.icon}</div>
                <p className="mt-4 max-w-md font-sans text-[14px] leading-[1.75] text-muted">
                  {f.detail}
                </p>
                <div className="mt-7 max-w-md">{f.example}</div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
