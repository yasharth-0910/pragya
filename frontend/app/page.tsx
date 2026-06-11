import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import TerminalDemo from "@/components/landing/TerminalDemo";
import StickyFeatures from "@/components/landing/StickyFeatures";
import Footer from "@/components/landing/Footer";

// Full-width 1px hairline between major sections (Phase 1.4). The feature
// band and footer carry their own border hairlines, so this is only needed
// where two borderless sections meet.
function Hairline() {
  return <div aria-hidden className="mt-20 h-px w-full bg-border sm:mt-24" />;
}

// Landing page (DESIGN.md §7), composed top to bottom.
export default function Home() {
  return (
    <main className="min-h-screen bg-main">
      {/* Nav + hero share a centered column. */}
      <div className="mx-auto max-w-5xl px-6 pt-6 sm:px-8">
        <Nav />
        <Hero />
      </div>

      <Hairline />

      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <TerminalDemo />
      </div>

      {/* Feature band (border-y = its own hairlines) and footer (border-t). */}
      <StickyFeatures />
      <Footer />
    </main>
  );
}
