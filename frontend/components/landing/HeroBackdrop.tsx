import HeroFlow from "./HeroFlow";

// Hero backdrop: the flowing-lines field, behind the hero content. HeroFlow is a
// light Canvas-2D effect that handles reduced-motion (static frame), phones
// (fewer lines), cursor influence, and off-screen pausing itself — so this is
// just the positioned container.
export default function HeroBackdrop() {
  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      <HeroFlow />
    </div>
  );
}
