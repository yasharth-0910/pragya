"use client";

import { useCallback, useEffect, useState } from "react";
import { getDocuments } from "@/lib/api";
import type { Document } from "@/types";
import UploadZone from "@/components/documents/UploadZone";
import DocumentCard from "@/components/documents/DocumentCard";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Authoritative list from the server. Called on mount and after each upload so a
  // newly accepted (still "processing") document shows up and then self-polls.
  const reload = useCallback(() => {
    getDocuments()
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-serif text-[18px] tracking-[-0.01em] text-primary">Documents</h1>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Section 1 — upload */}
        <UploadZone onUploaded={reload} />

        {/* Section 2 — document list */}
        <section className="mt-9">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            Your documents
          </div>

          {loaded && documents.length === 0 ? (
            /* Empty state — cloud icon + serif heading + muted subline (Fix 5a) */
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
          ) : (
            <div className="space-y-2.5">
              {documents.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
