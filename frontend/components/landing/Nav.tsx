"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useScroll, useMotionValueEvent } from "motion/react";
import Magnetic from "./Magnetic";

// Hand-drawn moon/sun so we don't pull an icon library (DESIGN.md §6: no libs).
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ThemeToggle({ scrolled }: { scrolled: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`interactive flex h-9 w-9 items-center justify-center rounded-full border active:scale-[0.98] ${
        scrolled ? "border-input text-muted hover:text-primary" : "border-paper/20 text-paper/70 hover:text-paper"
      }`}
    >
      {/* Crafted icon swap: the old glyph rotates out as the new one rotates in
          (the page colours themselves crossfade via the .45s token transition). */}
      {mounted ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "sun" : "moon"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </motion.span>
        </AnimatePresence>
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  );
}

export default function Nav() {
  // Transparent over the dark hero; gains a solid themed background once scrolled
  // past it (no blur / glassmorphism — just a clean surface + hairline).
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => {
    setScrolled(v > (typeof window !== "undefined" ? window.innerHeight * 0.8 : 600));
  });

  const link = `interactive link-underline hidden font-sans text-[14px] sm:inline ${
    scrolled ? "text-muted hover:text-primary" : "text-paper/65 hover:text-paper"
  }`;

  return (
    <nav className={`fixed inset-x-0 top-0 z-50 ${scrolled ? "border-b border-border bg-main" : "border-b border-transparent"}`}>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 sm:px-8">
        <a href="#" className={`font-serif text-[22px] tracking-[-0.02em] ${scrolled ? "text-primary" : "text-paper"}`}>
          Pragya
        </a>

        <div className="flex items-center gap-5 sm:gap-7">
          <a href="#how-it-works" className={link}>How it works</a>
          <a href="#security" className={link}>Security</a>

          <ThemeToggle scrolled={scrolled} />

          <Magnetic strength={0.4}>
            <a
              href="/login"
              className={`interactive block rounded-full border px-5 py-2 font-sans text-[14px] active:scale-[0.98] ${
                scrolled ? "border-input text-primary hover:bg-subtle" : "border-paper/20 text-paper hover:bg-paper/10"
              }`}
            >
              Sign in
            </a>
          </Magnetic>
        </div>
      </div>
    </nav>
  );
}
