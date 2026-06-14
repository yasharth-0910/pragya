"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useSpring, useReducedMotion } from "motion/react";

// Magnetic wrapper (Phase 4): the wrapped element is gently pulled toward the
// cursor while hovered, then springs back on leave. Desktop (fine pointer) only
// — on touch or under reduced motion it renders children untouched (no wrapper,
// no layout change), so it can't affect mobile or accessibility.
//
// SSR/first render is the pass-through path; the magnetic wrapper only switches
// on after mount + capability check, so there's no hydration mismatch.
export default function Magnetic({
  children,
  strength = 0.35,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 250, damping: 18, mass: 0.5 });
  const y = useSpring(0, { stiffness: 250, damping: 18, mass: 0.5 });

  useEffect(() => {
    if (reduceMotion) return;
    if (window.matchMedia("(pointer: fine)").matches) setEnabled(true);
  }, [reduceMotion]);

  if (!enabled) return <>{children}</>;

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x, y }}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.div>
  );
}
