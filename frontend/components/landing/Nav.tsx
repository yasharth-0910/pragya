"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import Reveal from "./Reveal";

// Hand-drawn moon/sun so we don't pull an icon library (DESIGN.md §6: no libs).
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Theme is unknown until the client mounts; render a stable placeholder first
  // to avoid a hydration mismatch on the icon.
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      // Gate the label on `mounted` too (not just the icon): before mount the
      // theme is unknown, so server and client must render the SAME label or
      // React flags a hydration mismatch (server assumes light → "dark", client
      // resolves dark → "light"). Generic label until we know the real theme.
      aria-label={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="interactive flex h-9 w-9 items-center justify-center rounded-full border border-paper/20 text-paper/70 hover:text-paper active:scale-[0.98]"
    >
      {mounted ? (isDark ? <SunIcon /> : <MoonIcon />) : <span className="h-4 w-4" />}
    </button>
  );
}

export default function Nav() {
  return (
    // Nav sits at the top so its Reveal fires immediately on load — same
    // entrance as before, now consistent with the scroll-reveal system.
    <Reveal>
      <nav className="flex items-center justify-between py-6">
        <a href="#" className="font-serif text-[22px] tracking-[-0.02em] text-paper">
          Pragya
        </a>

        <div className="flex items-center gap-5 sm:gap-7">
          <a
            href="#how-it-works"
            className="interactive hidden font-sans text-[14px] text-paper/65 hover:text-paper sm:inline"
          >
            How it works
          </a>
          <a
            href="#security"
            className="interactive hidden font-sans text-[14px] text-paper/65 hover:text-paper sm:inline"
          >
            Security
          </a>

          <ThemeToggle />

          <a
            href="/login"
            className="interactive rounded-full border border-paper/20 px-5 py-2 font-sans text-[14px] text-paper hover:bg-paper/10 active:scale-[0.98]"
          >
            Sign in
          </a>
        </div>
      </nav>
    </Reveal>
  );
}
