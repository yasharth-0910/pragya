"use client";

/**
 * Global toast state via React context.
 *
 * Any component under <ToastProvider> can call useToast().showToast(message,
 * variant) to pop a notification. The provider holds the list and renders the
 * fixed bottom-right stack; individual toasts (components/ui/Toast) handle their
 * own slide-in + 4s auto-dismiss and call back to remove themselves.
 */

import { createContext, createElement, useCallback, useContext, useState } from "react";
import Toast from "@/components/ui/Toast";

export type ToastVariant = "success" | "error";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Read the toast API. Throws if used outside <ToastProvider> so the missing
 *  provider surfaces immediately rather than as a silent no-op. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = "success") => {
    setToasts((prev) => [...prev, { id: newId(), message, variant }]);
  }, []);

  // This file is .ts (not .tsx), so JSX is built with createElement to keep the
  // hook/provider colocated without renaming the module.
  return createElement(
    ToastContext.Provider,
    { value: { showToast } },
    children,
    createElement(
      "div",
      {
        className:
          "pointer-events-none fixed bottom-4 right-4 z-[80] flex flex-col gap-2",
      },
      toasts.map((t) =>
        createElement(Toast, {
          key: t.id,
          id: t.id,
          message: t.message,
          variant: t.variant,
          onDismiss: dismissToast,
        })
      )
    )
  );
}
