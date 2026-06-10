// Hero (DESIGN.md §7.2). Staggered rise on h1 → subline → CTAs (~120ms apart).
export default function Hero() {
  return (
    <section className="mx-auto max-w-2xl pt-20 text-center sm:pt-28">
      <h1
        className="rise font-serif text-[38px] leading-[1.12] tracking-[-0.02em] text-primary sm:text-[42px]"
        style={{ animationDelay: "80ms" }}
      >
        Every answer, <span className="hl-mark">with its source.</span>
      </h1>

      <p
        className="rise mx-auto mt-6 max-w-xl font-sans text-[14.5px] leading-[1.75] text-muted"
        style={{ animationDelay: "200ms" }}
      >
        Pragya reads your team&rsquo;s documents and answers in plain language —
        every claim traced back to the exact file and page it came from.
      </p>

      <div
        className="rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        style={{ animationDelay: "320ms" }}
      >
        <a
          href="#"
          className="interactive w-full rounded-full bg-ink-2 px-6 py-3 font-sans text-[14px] text-paper hover:opacity-90 active:scale-[0.98] sm:w-auto dark:bg-paper dark:text-ink-2"
        >
          Start free
        </a>
        <a
          href="#how-it-works"
          className="interactive w-full rounded-full border border-input px-6 py-3 font-sans text-[14px] text-primary hover:bg-subtle active:scale-[0.98] sm:w-auto"
        >
          See the method
        </a>
      </div>
    </section>
  );
}
