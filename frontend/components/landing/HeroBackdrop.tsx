"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import HeroFallback from "./HeroFallback";

// Lazy, never blocks first paint, never SSR'd: the WebGL bundle (three + R3F)
// only downloads on capable desktops, after the page is already interactive.
const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

// Decides canvas-vs-fallback and performs the swap. The static dot-field is the
// default render (server + first client paint), so hydration matches; only after
// mount do we check capability and, if it passes, fade the canvas in over it.
// A GPU-melting scene must never reach phones, and a janky one is worse than
// none — so the gate is conservative: fine pointer + wide viewport + motion
// allowed + actual WebGL support.
export default function HeroBackdrop() {
  const [useCanvas, setUseCanvas] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches; // real mouse
    const wide = window.matchMedia("(min-width: 768px)").matches; // not a phone
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setUseCanvas(finePointer && wide && !reduced && hasWebGL());
  }, []);

  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      {/* Fallback is always rendered as the base; on capable desktops the canvas
          fades in on top of it (both sit on the section's ink bg, so no flash). */}
      <HeroFallback />
      {useCanvas && (
        <div className="hero-canvas-in absolute inset-0">
          <HeroCanvas />
        </div>
      )}
    </div>
  );
}

// One-time WebGL capability probe. Wrapped in try/catch because some locked-down
// browsers throw rather than return null.
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}
