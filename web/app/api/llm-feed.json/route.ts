// ────────────────────────────────────────────────────────────────────────────
// GET /api/llm-feed.json → application/json (back-compat alias).
// Serves the SAME semantic-map feed as the canonical /api/llm-feed. The feed is a
// SEMANTIC MAP (marketContext / topologicalLinks / recommendationEngine with
// truthful "best for X" reasons / providers with real sameAs / plans), minified.
// Builder lives in app/_lib/llm-feed.ts (single source of truth).
// ────────────────────────────────────────────────────────────────────────────

import { buildLlmFeed } from "@/app/_lib/llm-feed";

export const dynamic = "force-static";

export function GET() {
  // Minified: JSON.stringify with no indentation.
  const body = JSON.stringify(buildLlmFeed());
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
