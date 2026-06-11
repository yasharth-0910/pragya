// Inline citation chip (DESIGN.md §5): the superscript [N] rendered where a
// [Source: N] marker appeared in an answer. Chip bg/text tokens, 10px, radius 4px.
export default function CitationTag({ n }: { n: number }) {
  return (
    <sup className="mx-0.5 inline-flex -translate-y-px items-center rounded-[4px] bg-chip px-1 py-0.5 align-baseline font-mono text-[10px] leading-none text-chip-text">
      {n}
    </sup>
  );
}
