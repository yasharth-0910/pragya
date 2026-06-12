/**
 * Global keyboard shortcuts for the app shell.
 *
 * Registers a single window-level keydown listener and dispatches to the handlers
 * the caller provides. ⌘ on Mac and Ctrl on Windows/Linux both count as the
 * modifier, so the same bindings work cross-platform.
 *
 * Handlers are kept in a ref and refreshed every render, so the listener binds
 * exactly once (no add/remove churn) yet always calls the latest closures — the
 * caller can pass inline arrow functions that read current state freely.
 */

"use client";

import { useEffect, useRef } from "react";

export interface KeyboardShortcutHandlers {
  /** ⌘K / Ctrl+K — focus the sidebar search (expanding it first if collapsed). */
  onFocusSearch?: () => void;
  /** ⌘N / Ctrl+N — start a new chat. */
  onNewChat?: () => void;
  /** ⌘/ / Ctrl+/ — toggle the shortcuts help modal. */
  onToggleHelp?: () => void;
  /** Escape — blur search, close an open modal/overlay; the "get me out" key. */
  onEscape?: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  // Mirror the latest handlers into a ref so the listener below never goes stale
  // without re-binding on every keystroke's worth of state change.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      // ⌘K / Ctrl+K — focus search. preventDefault stops Firefox's quick-find.
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        ref.current.onFocusSearch?.();
        return;
      }
      // ⌘N / Ctrl+N — new chat. Ctrl+N opens a new browser window by default, so
      // we must preventDefault() to intercept it (best-effort: some browsers
      // reserve this combo at the OS level and won't yield it to the page).
      if (mod && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        ref.current.onNewChat?.();
        return;
      }
      // ⌘/ / Ctrl+/ — show the shortcuts help.
      if (mod && e.key === "/") {
        e.preventDefault();
        ref.current.onToggleHelp?.();
        return;
      }
      // Escape — never preventDefault (let inputs handle their own Esc too).
      if (e.key === "Escape") {
        ref.current.onEscape?.();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
