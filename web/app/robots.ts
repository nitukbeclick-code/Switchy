// ────────────────────────────────────────────────────────────────────────────
// robots.txt — allow general crawlers AND the major AI/answer-engine bots
// (GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended, ClaudeBot, etc.) so the
// GEO content can be cited. Points to the sitemap.
// ────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/schema";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const aiBots = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "ClaudeBot",
    "Claude-Web",
    "anthropic-ai",
    "Applebot-Extended",
    "CCBot",
    "Amazonbot",
    "Bytespider",
    "Meta-ExternalAgent",
  ];

  return {
    rules: [
      // General crawlers: full access.
      { userAgent: "*", allow: "/" },
      // AI / answer engines: explicitly allowed to read everything.
      { userAgent: aiBots, allow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
