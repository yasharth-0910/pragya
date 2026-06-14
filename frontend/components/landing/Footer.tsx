import Reveal from "./Reveal";

// Footer (DESIGN.md §7.5) — elevated for Phase 4 around the प्रज्ञा wordmark:
// a large serif "Pragya" with the Devanagari + tagline beneath, a quiet links
// column, and the mono meta line. Still calm and restrained.
export default function Footer() {
  return (
    <footer id="security" className="border-t border-border">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:px-8 sm:py-28">
        <Reveal>
          <div className="flex flex-col items-start justify-between gap-12 sm:flex-row sm:items-end">
            <div>
              <div className="font-serif text-[44px] leading-none tracking-[-0.02em] text-primary sm:text-[60px]">
                Pragya
              </div>
              <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                प्रज्ञा · Wisdom, cited
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:items-end">
              <div className="flex gap-6 font-sans text-[14px] text-muted">
                <a href="#how-it-works" className="link-underline interactive hover:text-primary">
                  How it works
                </a>
                <a href="#security" className="link-underline interactive hover:text-primary">
                  Security
                </a>
                <a href="/login" className="link-underline interactive hover:text-primary">
                  Sign in
                </a>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Est. 2026 · Self-hosted
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </footer>
  );
}
