import HeroFlow from "./HeroFlow";

// Hero backdrop: the flowing-lines field, behind the hero content. HeroFlow is a
// light Canvas-2D effect that handles reduced-motion (static frame), phones
// (fewer lines), cursor influence, and off-screen pausing itself — so this is
// just the positioned container.
export default function HeroBackdrop() {
  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      <HeroFlow />
      {/* Left-to-right fade: the ink stage stays solid under the left-aligned
          headline (so text reads), then clears to reveal the flowing lines on
          the right. Fades from --ink because the hero stage is always-dark. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, var(--ink) 0%, rgba(0,0,0,0) 62%)",
        }}
      />
    </div>
  );
}
