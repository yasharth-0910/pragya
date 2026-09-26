import SmoothScroll from "@/components/landing/SmoothScroll";
import HeroBackdrop from "@/components/landing/HeroBackdrop";
import HeroCursor from "@/components/landing/HeroCursor";
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import ProblemField from "@/components/landing/ProblemField";
import Ingestion from "@/components/landing/Ingestion";
import RetrievalPinned from "@/components/landing/RetrievalPinned";
import AccessWall from "@/components/landing/AccessWall";
import TerminalDemo from "@/components/landing/TerminalDemo";
import Proof from "@/components/landing/Proof";
import Footer from "@/components/landing/Footer";

// Landing page — one continuous descent from question → cited answer → proof.
// The "signal among noise" motif recurs (hero canvas → problem field → retrieval
// → cite) so the page reads as one idea unfolding, not stacked sections.
//
// SmoothScroll wraps only this route: it mounts Lenis + the reduced-motion
// MotionConfig. App screens never mount it, so they keep native scroll.
export default function Home() {
  return (
    <SmoothScroll>
      {/* Fixed nav (transparent over hero → solid on scroll) + desktop hero
          cursor ring, both above the page flow. */}
      <Nav />
      <HeroCursor />

      <main className="min-h-screen bg-main">
        {/* 1 · HERO — always-dark ink stage with the live flowing-lines canvas.
            The single amber line is the thread the whole story follows. */}
        <section
          id="hero-stage"
          className="relative flex min-h-svh flex-col overflow-hidden bg-ink"
        >
          <HeroBackdrop />
          <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 sm:px-8">
            <Hero />
          </div>

          {/* Scroll cue, centered at the foot of the stage. */}
          <div
            aria-hidden
            className="absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-paper/45"
          >
            scroll
            <span
              className="h-[34px] w-px"
              style={{ background: "linear-gradient(var(--paper), transparent)", opacity: 0.4 }}
            />
          </div>
        </section>

        {/* 2 · THE PROBLEM — the noise: drifting document fragments, one question
            holding in the centre. */}
        <ProblemField />

        {/* 3 · INGESTION — the engine wakes: documents chunk and embed into the
            vector grid (pinned). */}
        <Ingestion />

        {/* 4 · RETRIEVAL — the centerpiece: dense + sparse → RRF → rerank, made
            visible (pinned, scroll-driven). #how-it-works anchor lives here. */}
        <RetrievalPinned />

        {/* 5 · THE WALL — access control enforced at the vector layer.
            #security anchor lives here. */}
        <AccessWall />

        {/* 6 · CITE — the payoff: the real terminal demo with its citation. */}
        <div className="border-t border-border bg-main">
          <div className="mx-auto max-w-5xl px-6 pb-8 sm:px-8">
            <TerminalDemo />
          </div>
        </div>

        {/* 7 · PROOF — the engine-room credibility moment (count-up eval). */}
        <Proof />

        {/* 8 · CLOSE / FOOTER */}
        <Footer />
      </main>
    </SmoothScroll>
  );
}
