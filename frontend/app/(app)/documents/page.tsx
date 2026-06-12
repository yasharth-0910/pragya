"use client";

import { useEffect, useRef, useState } from "react";
import { searchDocuments, type SearchResult } from "@/lib/api";
import { useDocuments } from "@/lib/hooks";
import UploadZone from "@/components/documents/UploadZone";
import DocumentCard from "@/components/documents/DocumentCard";

/* ── Icons ───────────────────────────────────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-accent">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Search result card ──────────────────────────────────────────────────────── */

function SearchResultCard({ result }: { result: SearchResult }) {
  return (
    <div className="rounded-[12px] border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[4px] bg-chip px-1.5 py-0.5 font-mono text-[10px] text-chip-text">
          {result.source_filename}
        </span>
        {result.page_number != null && (
          <span className="font-mono text-[10px] text-muted">
            p. {result.page_number}
          </span>
        )}
        <span className="ml-auto font-mono text-[9.5px] text-muted">
          {Math.round(result.score * 100)}% match
        </span>
      </div>
      {result.chunk_preview && (
        <p className="mt-2 font-sans text-[12.5px] leading-relaxed text-primary">
          {result.chunk_preview}
          {result.chunk_preview.length >= 200 ? "…" : ""}
        </p>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────────── */

export default function DocumentsPage() {
  // Cache-first list with status-aware polling (5s while processing, else 30s).
  // mutate() is the post-upload refresh hook handed to UploadZone.
  const { data: documents = [], isLoading, mutate } = useDocuments();
  const loaded = !isLoading;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false);

  // Client-side visibility filter for the document list (default: all tiers).
  const [visFilter, setVisFilter] = useState<"all" | "company" | "department" | "personal">("all");
  const visibleDocuments =
    visFilter === "all" ? documents : documents.filter((d) => d.visibility === visFilter);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSearchActive(false);
      setSearchResults([]);
      setSearching(false);
      return;
    }
    // Show pulsing dot immediately; fire the request after 400ms of idle typing.
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchDocuments(value.trim());
        setSearchResults(results);
        setSearchActive(true);
      } catch {
        setSearchResults([]);
        setSearchActive(true);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery("");
    setSearchActive(false);
    setSearchResults([]);
    setSearching(false);
  }

  // Clean up the timer on unmount.
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-serif text-[18px] tracking-[-0.01em] text-primary">Documents</h1>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Section 1 — upload */}
        <UploadZone onUploaded={() => mutate()} />

        {/* Section 2 — search bar */}
        <div className="mt-7">
          <div className="flex items-center gap-2 rounded-full border border-input bg-card px-3.5 py-2.5 focus-within:ring-1 focus-within:ring-accent">
            <SearchIcon />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search documents…"
              className="flex-1 bg-transparent font-sans text-[13px] text-primary placeholder:text-muted focus:outline-none"
            />
            {/* Pulsing amber dot while debouncing / fetching */}
            {searching && (
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
            )}
            {/* Clear button when there's a query */}
            {searchQuery && !searching && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="interactive flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:text-primary"
              >
                <XIcon />
              </button>
            )}
          </div>
        </div>

        {/* Section 3 — results or document list */}
        {searchActive ? (
          /* ── Search results view ─────────────────────────────────────────── */
          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                {searchResults.length === 0 ? "No results" : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`}
              </div>
              <button
                type="button"
                onClick={clearSearch}
                className="interactive font-mono text-[10px] uppercase tracking-[0.08em] text-muted hover:text-primary"
              >
                Clear search
              </button>
            </div>
            {searchResults.length === 0 ? (
              <div className="rounded-[12px] border border-border bg-card px-4 py-8 text-center">
                <p className="font-serif text-[14px] tracking-[-0.01em] text-primary">
                  Nothing matched
                </p>
                <p className="mt-1 font-sans text-[12.5px] text-muted">
                  Try different keywords or check your department has indexed documents.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {searchResults.map((r, i) => (
                  <SearchResultCard key={`${r.document_id}-${i}`} result={r} />
                ))}
              </div>
            )}
          </section>
        ) : (
          /* ── Normal document list ────────────────────────────────────────── */
          <section className="mt-9">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                Your documents
              </div>
              {/* Visibility filter tabs — a smaller, secondary segmented control. */}
              <div className="inline-flex overflow-hidden rounded-[8px] border border-border">
                {(["all", "company", "department", "personal"] as const).map((tab, i) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setVisFilter(tab)}
                    className={`interactive px-2.5 py-1 font-mono text-[10px] capitalize tracking-[0.04em] ${
                      i > 0 ? "border-l border-border" : ""
                    } ${
                      visFilter === tab
                        ? "bg-ink-2 text-paper dark:bg-paper dark:text-ink"
                        : "bg-subtle text-muted hover:text-primary"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {loaded && documents.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[12px] border border-border bg-card px-4 py-10 text-center">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted">
                  <path d="M18 10a6 6 0 0 0-12 0 4 4 0 0 0 0 8h12a4 4 0 0 0 0-8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M12 13v4m0 0-2-2m2 2 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <p className="font-serif text-[16px] tracking-[-0.01em] text-primary">No documents yet</p>
                  <p className="mt-1 font-sans text-[13px] text-muted">Upload a PDF, Word doc, or slide deck to get started.</p>
                </div>
              </div>
            ) : visibleDocuments.length === 0 ? (
              <div className="rounded-[12px] border border-border bg-card px-4 py-8 text-center">
                <p className="font-sans text-[12.5px] text-muted">
                  No {visFilter} documents.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {visibleDocuments.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
