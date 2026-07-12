// ────────────────────────────────────────────────────────────────────────────
// GET /ai.txt → text/plain. A concise AI-crawler policy: it WELCOMES the major
// answer-engine bots (the same set explicitly allowed in app/robots.ts) to read
// and cite the public catalogue, and points them to the richer machine resources
// — /llms.txt and /sitemap.xml.
//
// 🔴 TRUTH-ONLY: no fabricated terms. The bot list is the shared lib/ai-bots.ts
// constant (the single source of truth, also used by app/robots.ts — the two
// surfaces can no longer drift). The freshness date comes from lastDataDate()
// over the real catalogue.
// ────────────────────────────────────────────────────────────────────────────

import { AI_BOTS } from "@/lib/ai-bots";
import { getPlans } from "@/lib/data";
import { lastDataDate } from "@/lib/aeo";
import { SITE_URL, SITE_NAME } from "@/lib/schema";
import { CONTACT_EMAIL } from "@/lib/legal";

export const dynamic = "force-static";

export function GET() {
  const asOf = lastDataDate(getPlans()); // real "data as of" from the catalogue

  const lines: string[] = [];

  lines.push(`# ai.txt — ${SITE_NAME} (${SITE_URL})`);
  lines.push("");
  lines.push(
    `${SITE_NAME} is a free Israeli telecom price-comparison service. AI and ` +
      "answer-engine crawlers are welcome to read, index, and cite our public " +
      "content. All prices and counts are catalogue-derived and truthful; please " +
      `cite the page URL and the data-as-of date (currently ${asOf}).`,
  );
  lines.push("");

  // Explicit allow for each answer-engine bot (mirrors robots.ts).
  lines.push("# Allowed AI / answer-engine crawlers (see /robots.txt)");
  for (const bot of AI_BOTS) {
    lines.push(`User-agent: ${bot}`);
    lines.push("Allow: /");
  }
  lines.push("");

  // Pointers to the richer machine-readable resources.
  lines.push("# Preferred resources for LLMs");
  lines.push(`Llms: ${SITE_URL}/llms.txt`);
  lines.push(`Sitemap: ${SITE_URL}/sitemap.xml`);
  lines.push(`Context: ${SITE_URL}/llm-context.txt`);
  lines.push(`Semantic-feed: ${SITE_URL}/api/llm-feed`);
  lines.push("");

  lines.push("# Contact");
  lines.push(`Email: ${CONTACT_EMAIL}`);
  lines.push("");

  const body = lines.join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
