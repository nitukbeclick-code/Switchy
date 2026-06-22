// ────────────────────────────────────────────────────────────────────────────
// <JsonLd> — renders a JSON-LD <script type="application/ld+json"> block from a
// plain object (use the builders in "@/lib/schema"). Server component; safe to
// render any number of times. The object is JSON.stringify'd verbatim.
// ────────────────────────────────────────────────────────────────────────────

export interface JsonLdProps {
  /** A plain JSON-LD object (e.g. from orgSchema(), productSchema(plan), …). */
  data: Record<string, unknown> | Record<string, unknown>[];
}

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // JSON-LD is data, not executable HTML; stringify is the standard pattern.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
