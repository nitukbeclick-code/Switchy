// ────────────────────────────────────────────────────────────────────────────
// GET /api/llm-feed → application/json (CANONICAL semantic-map feed).
// A machine-readable SEMANTIC MAP of the Israeli telecom market for AI ingestion:
//   marketContext, topologicalLinks (category↔compare, provider↔plans, glossary,
//   transparency), recommendationEngine (truthful "best for X" picks + methodology),
//   providers (with real official sameAs), and plans — all factual, minified.
// The legacy /api/llm-feed.json route serves the identical payload.
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
