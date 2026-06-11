// Ingestion status as a slim bar + label (DESIGN.md palette: amber is the only
// accent — no green/purple). The backend's document.status is one of
// processing / ready / failed; we map each to a fill and a label. ("chunking" is
// not a real backend status, so it isn't shown as a distinct stage.)
type ProgressBarProps = { status: string };

const STAGES: Record<string, { label: string; pct: number }> = {
  processing: { label: "Processing", pct: 55 },
  ready: { label: "Ready", pct: 100 },
  failed: { label: "Failed", pct: 100 },
};

export default function ProgressBar({ status }: ProgressBarProps) {
  const stage = STAGES[status] ?? STAGES.processing;
  const isReady = status === "ready";
  const isFailed = status === "failed";

  // Ready → amber accent; processing → muted neutral; failed → faint input tone.
  const fill = isReady ? "bg-accent" : isFailed ? "bg-input" : "bg-muted";

  return (
    <div className="w-full">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${stage.pct}%` }}
        >
          <div className={`h-full w-full ${fill}`} />
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
        {/* A single pulsing amber dot signals live work while processing. */}
        {!isReady && !isFailed && (
          <span className="streaming-dot h-1 w-1 rounded-full bg-accent" />
        )}
        {stage.label}
      </div>
    </div>
  );
}
