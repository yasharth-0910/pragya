import Reveal from "./Reveal";

// Footer (DESIGN.md §7.5): quiet mono labels, wordmark left, meta right.
// Content unchanged; it now reveals on scroll instead of on load. The themed
// border stays on <footer> (Reveal must not carry themed borders).
export default function Footer() {
  return (
    <footer id="security" className="mt-24 border-t border-border">
      <Reveal>
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-7 py-10 font-mono text-[10px] uppercase tracking-[0.1em] text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>Pragya / प्रज्ञा — Wisdom</span>
          <span>Est. 2026 · Self-hosted</span>
        </div>
      </Reveal>
    </footer>
  );
}
