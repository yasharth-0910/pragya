import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import TerminalDemo from "@/components/landing/TerminalDemo";
import FeatureStrip from "@/components/landing/FeatureStrip";
import Footer from "@/components/landing/Footer";

// Landing page (DESIGN.md §7), composed top to bottom.
export default function Home() {
  return (
    <main className="min-h-screen bg-main">
      {/* Nav + hero + terminal share a centered column. */}
      <div className="mx-auto max-w-5xl px-6 pt-6 sm:px-8">
        <Nav />
        <Hero />
        <TerminalDemo />
      </div>

      {/* Feature strip and footer are full-bleed bands. */}
      <FeatureStrip />
      <Footer />
    </main>
  );
}
