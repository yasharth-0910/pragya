// Footer (DESIGN.md §7.5): quiet mono labels, wordmark left, meta right.
export default function Footer() {
  return (
    <footer
      id="security"
      className="rise mt-24 border-t border-border"
      style={{ animationDelay: "680ms" }}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-7 py-10 font-mono text-[10px] uppercase tracking-[0.1em] text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>Pragya / प्रज्ञा — Wisdom</span>
        <span>Est. 2026 · Self-hosted</span>
      </div>
    </footer>
  );
}
