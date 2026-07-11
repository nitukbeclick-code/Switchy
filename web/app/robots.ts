// ────────────────────────────────────────────────────────────────────────────
// robots.txt — allow general crawlers AND the major AI/answer-engine bots
// (GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended, ClaudeBot, etc.) so the
// GEO content can be cited. Points to the sitemap.
// ────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";
import { AI_BOTS } from "@/lib/ai-bots";
import { SITE_URL } from "@/lib/schema";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // General crawlers: full access.
      { userAgent: "*", allow: "/" },
      // AI / answer engines: explicitly allowed to read everything. The list is
      // the shared lib/ai-bots.ts constant (also rendered by /ai.txt).
      { userAgent: [...AI_BOTS], allow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
