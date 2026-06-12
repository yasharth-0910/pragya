/**
 * SWR data-fetching hooks — cache-first reads with background revalidation.
 *
 * Why SWR: re-fetching the same data on every page mount feels sluggish. SWR
 * keeps a module-level cache keyed by a stable string/array, so returning to a
 * page renders the last-known data instantly while a fresh copy loads silently
 * in the background. Each hook wraps exactly one lib/api.ts function and returns
 * SWR's standard { data, error, isLoading, mutate } shape.
 */

"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import {
  getAnalyticsOverview,
  getDepartments,
  getDocuments,
  getMe,
  getSessions,
} from "@/lib/api";
import { useToast } from "@/lib/useToast";

// Module-level guard so a given document's terminal-status notification fires once
// across the whole session, even if several useDocuments() instances observe the
// same SWR data update at the same time. Keyed `${id}:${status}`.
const announcedDocs = new Set<string>();

/** Chat history for the sidebar. */
export function useSessions() {
  // chat history sidebar — loads instantly from cache, refreshes every 30s in background
  return useSWR("sessions", () => getSessions(), {
    refreshInterval: 30_000,
  });
}

/** Documents list, optionally filtered by status. Also raises a toast when a
 *  document finishes processing — so a user waiting on a chat page learns the doc
 *  is ready without watching the documents list. */
export function useDocuments(status?: string) {
  const { showToast } = useToast();

  // 5s polling only when needed — stops burning API calls when all docs are ready.
  // refreshInterval accepts a function of the latest data, so we tighten the loop
  // only while at least one doc is still "processing".
  const swr = useSWR(["documents", status], () => getDocuments(status), {
    refreshInterval: (data) =>
      data?.some((d) => d.status === "processing") ? 5_000 : 30_000,
  });

  // Detect processing → ready / failed transitions by diffing the previous snapshot
  // against the latest data. We only toast on an actual transition (not on first
  // load of an already-ready doc), and the module-level guard dedupes across hook
  // instances reading the same SWR cache.
  const prevStatus = useRef<Map<string, string> | null>(null);
  const data = swr.data;
  useEffect(() => {
    if (!data) return;
    const prev = prevStatus.current;
    if (prev) {
      for (const doc of data) {
        const before = prev.get(doc.id);
        if (before !== "processing") continue; // only announce a doc that WAS processing
        if (doc.status === "ready") {
          const key = `${doc.id}:ready`;
          if (!announcedDocs.has(key)) {
            announcedDocs.add(key);
            showToast(`${doc.original_filename} is ready to chat`, "success");
          }
        } else if (doc.status === "failed") {
          const key = `${doc.id}:failed`;
          if (!announcedDocs.has(key)) {
            announcedDocs.add(key);
            showToast(`${doc.original_filename} failed to process`, "error");
          }
        }
      }
    }
    prevStatus.current = new Map(data.map((d) => [d.id, d.status]));
  }, [data, showToast]);

  return swr;
}

/** All departments. */
export function useDepartments() {
  // departments never change mid-session, no need to revalidate constantly
  return useSWR("departments", () => getDepartments(), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
}

/** The authenticated user's profile. */
export function useMe() {
  // current user — fetched once, cached for the session
  return useSWR("me", () => getMe(), {
    revalidateOnFocus: false,
  });
}

/** Admin analytics overview (top metric cards). */
export function useAnalyticsOverview() {
  return useSWR("analytics-overview", () => getAnalyticsOverview(), {
    refreshInterval: 60_000,
  });
}
