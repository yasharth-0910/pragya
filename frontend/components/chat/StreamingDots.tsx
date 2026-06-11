// Three amber dots pulsing in sequence while we wait for the first token
// (DESIGN.md §6 motion). The stagger is per-dot animation-delay; the keyframe
// (.streaming-dot / dot-pulse) lives in globals.css and respects reduced motion.
export default function StreamingDots() {
  return (
    <div className="flex items-center gap-1" role="status" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="streaming-dot h-1.5 w-1.5 rounded-full bg-accent"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}
