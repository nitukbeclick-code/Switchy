// ────────────────────────────────────────────────────────────────────────────
// <LlmDataFeed> — renders the page's machine-readable comparison snapshot as a
// <script type="application/json" id="llm-data-feed"> in the INITIAL SSR/ISR HTML
// (AEO pillar 3). LLM scrapers that fetch the page can read one compact, lossless
// JSON block of the real plans (id/provider/price/unit/flags + cheapest id +
// currency + as-of date) without executing JS or parsing the visual table.
//
// Server component (no state). It is NOT schema.org JSON-LD (that's rendered via
// <JsonLd>); this is a dedicated, easy-to-lift truth feed. The payload comes from
// lib/aeo `llmDataFeed(plans, meta)` — pass EITHER a prebuilt `feed` object or
// the `plans` (+ optional `meta`) and let the component build it, always from the
// SAME real plan list the page renders.
//
// HONESTY: the script only serialises real plan rows; it fabricates nothing.
// `type="application/json"` is inert (browsers never execute it), so embedding it
// is safe — the content is data, not script.
// ────────────────────────────────────────────────────────────────────────────

import { llmDataFeed, type LlmDataFeed as LlmDataFeedPayload, type LlmFeedMeta } from "@/lib/aeo";
import { safeJsonForScript } from "@/lib/safe-json";
import type { Plan } from "@/lib/types";

export type LlmDataFeedProps =
  | {
      /** A prebuilt feed (from `llmDataFeed(...)`). Mutually exclusive with `plans`. */
      feed: LlmDataFeedPayload;
      plans?: never;
      meta?: never;
      id?: string;
    }
  | {
      /** The real plan list; the component builds the feed via `llmDataFeed`. */
      plans: Plan[];
      /** Optional context (service/city/url/asOf/stale) for the feed. */
      meta?: LlmFeedMeta;
      feed?: never;
      id?: string;
    };

/** The conventional script id AEO scrapers look for. */
const FEED_ID = "llm-data-feed";

export default function LlmDataFeed(props: LlmDataFeedProps) {
  const id = props.id ?? FEED_ID;
  const payload: LlmDataFeedPayload =
    "feed" in props && props.feed
      ? props.feed
      : llmDataFeed(props.plans ?? [], props.meta ?? {});

  return (
    <script
      id={id}
      type="application/json"
      // application/json is inert data (never executed), but a raw `</script>`
      // in a string would still close this block, so escape defensively — the
      // payload is built from catalogue data today, but this keeps the sink safe
      // regardless of source. safeJsonForScript keeps the JSON valid.
      dangerouslySetInnerHTML={{ __html: safeJsonForScript(payload) }}
    />
  );
}
