"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

// Scroll-triggered reveal (replaces the old load-time .rise): the wrapper
// starts hidden (opacity 0, translateY 14px — see .reveal in globals.css) and
// gains .is-revealed the first time 15% of it enters the viewport. Pure
// IntersectionObserver + CSS transition, no animation library (DESIGN.md §6).
//
// Note: keep themed backgrounds/borders OFF this wrapper — .reveal declares
// its own `transition`, which would override the global theme crossfade.
type RevealProps = {
  children: ReactNode;
  className?: string;
  // Stagger between sibling reveals, in ms (~120ms steps per DESIGN.md §6).
  delay?: number;
};

export default function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced motion: jump straight to the settled state (DESIGN.md §6).
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-revealed");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          el.classList.add("is-revealed");
          observer.disconnect(); // reveal once, never re-hide on scroll-up
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      // CSS var so the stagger lives in CSS (transition-delay), not JS timers.
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
