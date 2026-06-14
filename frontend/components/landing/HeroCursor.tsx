"use client";

import { useEffect, useState } from "react";
import { motion, useSpring, useReducedMotion } from "motion/react";

// Custom cursor treatment for the hero (Phase 4): a subtle amber ring that
// trails the real cursor while it's over the dark hero stage. Desktop / fine
// pointer only, never on touch, and off under reduced motion. Purely decorative
// (aria-hidden, pointer-events-none) so it never interferes with interaction.
export default function HeroCursor() {
  const reduceMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  // Spring-follow so the ring trails with a little weight, never snaps.
  const x = useSpring(0, { stiffness: 350, damping: 28, mass: 0.4 });
  const y = useSpring(0, { stiffness: 350, damping: 28, mass: 0.4 });

  useEffect(() => {
    if (reduceMotion) return;
    if (window.matchMedia("(pointer: fine)").matches) setEnabled(true);
  }, [reduceMotion]);

  useEffect(() => {
    if (!enabled) return;
    const stage = document.getElementById("hero-stage");
    if (!stage) return;
    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    const enter = () => setVisible(true);
    const leave = () => setVisible(false);
    stage.addEventListener("mousemove", move);
    stage.addEventListener("mouseenter", enter);
    stage.addEventListener("mouseleave", leave);
    return () => {
      stage.removeEventListener("mousemove", move);
      stage.removeEventListener("mouseenter", enter);
      stage.removeEventListener("mouseleave", leave);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-40 transition-opacity duration-300"
      style={{ x, y, opacity: visible ? 1 : 0 }}
    >
      {/* offset so the 32px ring centres on the pointer */}
      <div className="-ml-4 -mt-4 h-8 w-8 rounded-full border border-accent/70" />
    </motion.div>
  );
}
