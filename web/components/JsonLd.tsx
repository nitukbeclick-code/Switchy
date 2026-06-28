// ────────────────────────────────────────────────────────────────────────────
// <JsonLd> — renders a JSON-LD <script type="application/ld+json"> block from a
// plain object (use the builders in "@/lib/schema"). Server component; safe to
// render any number of times. The object is JSON.stringify'd verbatim.
//
// A top-level JSON-LD document MUST carry `@context: "https://schema.org"`.
// `data` is therefore required to be a context-bearing node (or an array of
// them); bare embedding-only helpers (e.g. geoSchema(), which returns a
// `@context`-less GeoCoordinates) belong INSIDE a node, never here. We assert
// this at render time so a misuse fails loudly instead of silently emitting an
// invalid top-level block.
// ────────────────────────────────────────────────────────────────────────────

export interface JsonLdProps {
  /**
   * A top-level JSON-LD node — a plain object carrying its own
   * `@context: "https://schema.org"` (e.g. from orgSchema(), productSchema()),
   * or an array of such nodes. Enforced at render time by {@link assertTopLevel}.
   */
  data: Record<string, unknown> | Record<string, unknown>[];
}

function assertTopLevel(node: Record<string, unknown>): void {
  if (node["@context"] !== "https://schema.org") {
    throw new Error(
      `<JsonLd> received a node without @context "https://schema.org" ` +
        `(@type=${String(node["@type"])}). A top-level JSON-LD block must carry ` +
        `@context; embedding-only helpers belong inside another node.`,
    );
  }
}

export default function JsonLd({ data }: JsonLdProps) {
  if (Array.isArray(data)) {
    data.forEach(assertTopLevel);
  } else {
    assertTopLevel(data);
  }
  return (
    <script
      type="application/ld+json"
      // JSON-LD is data, not executable HTML; stringify is the standard pattern.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
