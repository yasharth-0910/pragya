"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import { frame, cancelFrame, MotionConfig } from "motion/react";

// Landing-only smooth-scroll + motion foundation (Phase 1).
//
// NOTE ON DESIGN.md §6: the design system bans animation libraries / scroll
// effects for the *app*. The landing page is a deliberate, user-approved
// exception — award-level craft on the same ink-paper-amber identity. The
// palette + anti-slop rules (§2, §8) still hold; only the motion ban is lifted
// here. Don't "fix" this back to vanilla CSS.
//
// Lenis gives the page its "expensive site" inertia: wheel/trackpad input is
// interpolated into a smooth, weighted scroll instead of the OS's stepped
// jumps. We mount it HERE — wrapping only the landing page — and never in the
// root layout, so the app screens (chat, documents) keep native scroll.
//
// The single most important detail is the rAF wiring. Instead of letting Lenis
// run its own requestAnimationFrame loop, we advance it from Framer Motion's
// frame loop via `frame.update(cb, true)`. That keeps ONE rAF driving both
// Lenis and every Framer Motion value, so scroll-linked transforms (Phase 3's
// useScroll work) stay in lockstep with Lenis's smoothing instead of two loops
// racing a frame apart — the classic source of scroll jank.
export default function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Respect the OS "reduce motion" setting: skip Lenis entirely and fall back
    // to native scroll — no smoothing, no scroll-jacking, a calm static page.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      // Slightly long settle for a premium, weighted feel (Lenis default 1.2).
      duration: 1.2,
      // Expo-out easing (Lenis's default, spelled out so it stays tunable).
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      // Smooth the wheel/trackpad only. Touch devices stay on native momentum
      // scroll — smoothing touch feels laggy and drains battery (mobile spec).
      smoothWheel: true,
    });

    // Drive Lenis from Framer Motion's frame loop (see the note above).
    // `true` = keepAlive, so it re-runs every frame.
    function raf(data: { timestamp: number }) {
      lenis.raf(data.timestamp);
    }
    frame.update(raf, true);

    return () => {
      cancelFrame(raf);
      lenis.destroy();
    };
  }, []);

  // MotionConfig reducedMotion="user": every Framer Motion component below
  // automatically honors prefers-reduced-motion (drops transform/layout
  // animation, keeps opacity) — a global safety net on top of the per-component
  // checks (e.g. Reveal). Belt and suspenders for the accessibility requirement.
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
