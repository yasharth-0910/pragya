// Feature strip (DESIGN.md §7.4): 3 columns on --bg-subtle, separated by
// hairlines — vertical on desktop, horizontal when stacked under 640px.
const features = [
  {
    title: "Reads everything",
    body: "PDFs, Word, and slide decks are parsed with their page numbers intact, then chunked so retrieval stays precise.",
  },
  {
    title: "Cites everything",
    body: "Every answer carries its receipts - the source file and the exact page, so a claim can always be checked.",
  },
  {
    title: "Walls that hold",
    body: "Access is enforced at the vector-database query itself. You only ever see answers drawn from your department's documents.",
  },
];

export default function FeatureStrip() {
  return (
    <section
      id="how-it-works"
      className="rise mt-24 border-y border-border bg-subtle"
      style={{ animationDelay: "560ms" }}
    >
      <div className="mx-auto grid max-w-4xl grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {features.map((f) => (
          <div key={f.title} className="px-7 py-10">
            <h3 className="font-serif text-[16px] text-primary">{f.title}</h3>
            <p className="mt-3 font-sans text-[14px] leading-[1.75] text-muted">
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
