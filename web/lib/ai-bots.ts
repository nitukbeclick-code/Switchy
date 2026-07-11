// ────────────────────────────────────────────────────────────────────────────
// AI_BOTS — the AI / answer-engine crawler allow-list, the SINGLE source of
// truth shared by:
//   • app/robots.ts       — the explicit robots.txt Allow rules
//   • app/ai.txt/route.ts — the /ai.txt crawler-policy stanzas
// (previously each hand-copied the list with a "keep in sync" comment — a
// guaranteed drift where a bot is welcomed in one file and absent from the
// other). The static site's robots stanzas (site/build.js) mirror this same
// set; when adding a bot here, mirror it there too.
// ────────────────────────────────────────────────────────────────────────────

export const AI_BOTS = [
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
] as const;
