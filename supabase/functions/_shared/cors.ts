// Shared CORS for the public site-* AI endpoints (site-ai-chat, site-plan-advisor,
// site-bill-analyzer). These are unauthenticated, paid-LLM-backed endpoints, so an
// open `Access-Control-Allow-Origin: *` lets ANY website drive our metered Gemini/
// Groq quota from a victim's browser. We reflect an *allowlisted* Origin instead.
//
// The allowlist is the production site surfaces plus localhost (dev). The Vercel
// preview alias changes per deploy, so it's configurable via the
// AI_CORS_ALLOWED_ORIGINS env var (comma-separated exact origins) without a code
// change. A request with no Origin header (server-to-server, curl) is allowed
// through with no CORS headers — CORS only governs *browser* cross-origin reads.

// Hard-coded production origins (always allowed).
const STATIC_ALLOWED = new Set<string>([
  "https://switchy-ai.com",
  "https://www.switchy-ai.com",
  "https://app.switchy-ai.com",
]);

// Localhost (any port) + the Vercel *.vercel.app preview domain are matched by
// pattern so we don't have to enumerate every dev port / preview deploy.
const ALLOWED_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
];

function envAllowed(): Set<string> {
  const raw = Deno.env.get("AI_CORS_ALLOWED_ORIGINS") ?? "";
  const set = new Set<string>();
  for (const o of raw.split(",").map((s) => s.trim()).filter(Boolean)) set.add(o);
  return set;
}

// Is this Origin permitted to read our responses cross-origin?
export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWED.has(origin) || envAllowed().has(origin)) return true;
  return ALLOWED_PATTERNS.some((re) => re.test(origin));
}

// CORS headers for a given request. When the request's Origin is on the
// allowlist we reflect it (and Vary: Origin so caches don't cross-pollinate);
// otherwise we emit NO Allow-Origin header, which makes the browser block the
// cross-origin read. `extra` is merged in for the preflight (methods/headers).
export function corsHeaders(req: Request, extra: Record<string, string> = {}): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    ...extra,
  };
  if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

// Standard preflight response for the allowlisted POST endpoints.
export function preflight(req: Request): Response {
  return new Response("ok", {
    headers: corsHeaders(req, { "Access-Control-Allow-Methods": "POST, OPTIONS" }),
  });
}
