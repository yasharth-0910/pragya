import SmoothScroll from "@/components/landing/SmoothScroll";
import HeroBackdrop from "@/components/landing/HeroBackdrop";
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import TerminalDemo from "@/components/landing/TerminalDemo";
import StickyFeatures from "@/components/landing/StickyFeatures";
import Footer from "@/components/landing/Footer";

// Landing page (DESIGN.md §7), composed top to bottom.
// SmoothScroll wraps only this route: it mounts Lenis (smooth-scroll) + the
// Framer Motion reduced-motion config. The app screens never mount it, so they
// keep native scroll untouched.
export default function Home() {
  return (
    <SmoothScroll>
      <main className="min-h-screen bg-main">
        {/* Hero stage — an always-dark ink surface (a constant, like the sidebar
            and terminal), full viewport. The particle backdrop sits behind; nav
            and hero content are layered in front in paper/amber. The dark→paper
            edge at its base is the divider into the rest of the page. */}
        <section className="relative flex min-h-svh flex-col overflow-hidden bg-ink">
          <HeroBackdrop />
          <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 sm:px-8">
            <Nav />
            <Hero />
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          <TerminalDemo />
        </div>

        {/* Feature band (border-y = its own hairlines) and footer (border-t). */}
        <StickyFeatures />
        <Footer />
      </main>
    </SmoothScroll>
  );
}
