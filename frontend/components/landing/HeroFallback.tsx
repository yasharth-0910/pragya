// Static elegant dot-field — the hero backdrop when WebGL is off the table:
// mobile, reduced-motion, no-WebGL, or the brief moment before the canvas
// mounts. It's also the SSR default (HeroBackdrop renders this first, then
// swaps in the canvas on capable desktops), so its markup MUST be deterministic
// — identical on server and client — or React hydration screams. Hence a seeded
// PRNG computed once at module load, never Math.random() at render time.
//
// Same idea as the WebGL scene, in CSS: a quiet constellation of warm paper
// points on ink, with a few brighter amber points — "signal among noise"
// (retrieval finding the relevant few). Strictly ink-paper-amber.

// mulberry32 — tiny deterministic PRNG. Same seed → same sequence on both
// server and client, so the dot layout never differs between renders.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Dot = {
  left: number;
  top: number;
  size: number;
  opacity: number;
  amber: boolean;
  delay: number;
};

// Built once at import. ~64 points, biased toward the edges (1 - r²) so the
// centre stays open for the headline — echoing the WebGL shell's sparse middle.
const DOTS: Dot[] = (() => {
  const rand = mulberry32(0x9e3779b9);
  const out: Dot[] = [];
  const total = 64;
  const amberEvery = total / 7; // ~9 amber points, kept genuinely sparse
  for (let i = 0; i < total; i++) {
    // Edge-biased radius: push points outward so the centre reads clean.
    const r = Math.sqrt(rand()) * 0.5 + 0.04; // 0.04..0.54 of half-extent
    const a = rand() * Math.PI * 2;
    const amber = i % Math.round(amberEvery) === 0;
    out.push({
      left: 50 + Math.cos(a) * r * 96,
      top: 50 + Math.sin(a) * r * 92,
      size: amber ? 3 + rand() * 1.5 : 1 + rand() * 1.8,
      opacity: amber ? 0.85 : 0.25 + rand() * 0.4,
      amber,
      delay: rand() * 4,
    });
  }
  return out;
})();

export default function HeroFallback() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {DOTS.map((d, i) => (
        <span
          key={i}
          className={d.amber ? "hero-amber-dot absolute rounded-full" : "absolute rounded-full"}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity,
            backgroundColor: d.amber ? "var(--accent)" : "var(--paper)",
            // Soft glow on the amber "signal" points only.
            boxShadow: d.amber ? "0 0 6px 1px var(--accent)" : "none",
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
