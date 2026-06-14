import Reveal from "./Reveal";

// Hero content for the dark ink stage (Phase 2). Sits in front of the particle
// backdrop (HeroBackdrop), so all text is paper-toned for contrast on ink. The
// staggered Reveal entrance (80 → 200 → 320 → 440ms) is unchanged.
//
// Colours: paper text + amber accent on ink — exactly the DESIGN.md identity,
// just staged on the always-dark surface (like the sidebar/terminal constants).
export default function Hero() {
  return (
    // flex-col + justify-center centres the block vertically; the inner box is a
    // full-width, max-width-capped, text-centred column. (Using items-center here
    // would shrink children to their content width and let the h1 escape the
    // viewport — the source of the earlier mobile overflow.)
    <div className="flex flex-1 flex-col justify-center pb-24 pt-10 sm:pb-28">
      <div className="mx-auto w-full max-w-2xl text-center">
        {/* Mono kicker — a single amber "signal" dot then a quiet label, echoing
            the particle metaphor. */}
        <Reveal delay={40}>
          <div className="mb-7 inline-flex max-w-full items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/55 sm:text-[10.5px] sm:tracking-[0.18em]">
            <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-accent shadow-[0_0_8px_1px_var(--accent)]" />
            Grounded in your documents
          </div>
        </Reveal>

        <Reveal delay={120}>
          {/* clamp floor stays small enough to never overflow ~320px; text-balance
              evens the wrap on mobile where the <br> is hidden. */}
          <h1 className="text-balance font-serif text-[clamp(1.85rem,6.5vw,4.25rem)] leading-[1.08] tracking-[-0.02em] text-paper">
            Every answer,
            <br className="hidden sm:block" /> <span className="hl-mark">with its source.</span>
          </h1>
        </Reveal>

        <Reveal delay={240}>
          <p className="mx-auto mt-7 max-w-xl font-sans text-[15px] leading-[1.75] text-paper/70">
            Pragya reads your team&rsquo;s documents and answers in plain language —
            every claim traced back to the exact file and page it came from.
          </p>
        </Reveal>

        <Reveal delay={360}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {/* Primary on the dark stage = the dark-mode button (paper fill, ink
                text), per DESIGN.md §5. High contrast against ink. */}
            <a
              href="/login"
              className="interactive w-full rounded-full bg-paper px-7 py-3 font-sans text-[14px] text-ink-2 hover:opacity-90 active:scale-[0.98] sm:w-auto"
            >
              Start free
            </a>
            <a
              href="#how-it-works"
              className="interactive w-full rounded-full border border-paper/25 px-7 py-3 font-sans text-[14px] text-paper hover:bg-paper/10 active:scale-[0.98] sm:w-auto"
            >
              See the method
            </a>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
