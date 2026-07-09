// ────────────────────────────────────────────────────────────────────────────
// POST /api/ai-chat — proxy the AI concierge chat to the backend agent.
//
// Forwards the user's message (+ history, sessionId, optional consented lead) to
// the Supabase edge function `site-ai-chat`, which is the grounded agent: it only
// ever answers from the REAL plan catalogue, cites [Sn] sources, refuses/omits
// when data is missing, and captures a lead ONLY with explicit consent. This thin
// proxy keeps the function URL / anon key out of the browser and applies the SAME
// origin allow-list as the other /api routes.
//
// CONTRACT (passthrough of the backend's shape):
//   POST { message, history?, sessionId?, lead?, billHint? }
//     -> { reply, offerLead?, leadCaptured?, contextTruncated?, sessionId? }
// `billHint` {provider?, monthly, category?} lets a chat reference an
// already-analyzed bill; the backend re-validates + clamps it (parseBillHint).
//
// COMPLIANCE: lead capture is gated server-side (consent===true required, §7b
// disclosure shown in the UI before the lead step). We never fabricate consent;
// this route just relays the structured `lead` the client collected.
//
// FAIL-SOFT: a missing backend URL / unreachable function / timeout surfaces a
// friendly Hebrew error and an appropriate status so the widget can show "try
// again" — it never throws or leaks internals.
// ────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;

const AI_CHAT_FN = process.env.SITE_AI_CHAT_FN ?? "site-ai-chat";

// Coarse abuse/cost guard mirrored from the backend (it re-validates). Reject an
// obviously oversized payload before spending a (paid) AI call upstream.
const MAX_INPUT_LEN = 2000;

// Origin allow-list — identical posture to /api/lead, /api/rights, /api/push.
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  [
    "https://switchy-ai.com",
    "https://www.switchy-ai.com",
    "https://app.switchy-ai.com",
    "https://switchyy-omega.vercel.app",
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined,
  ].filter((o): o is string => typeof o === "string" && o.length > 0),
);

function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser callers: backend gates still apply
  return ALLOWED_ORIGINS.has(origin);
}

const FRIENDLY_BUSY = "השירות עמוס כרגע, נסו שוב בעוד רגע.";
const FRIENDLY_UNCONFIGURED =
  "הצ׳אט אינו זמין כרגע. אפשר לפנות אלינו בוואטסאפ או דרך טופס יצירת הקשר.";

export async function POST(req: Request) {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return Response.json({ error: "forbidden origin" }, { status: 403 });
  }

  // ── Parse + minimal validation ─────────────────────────────────────────────
  let body: {
    message?: unknown;
    history?: unknown;
    sessionId?: unknown;
    lead?: unknown;
    billHint?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  if (message.length > MAX_INPUT_LEN) {
    return Response.json({ error: "message too long" }, { status: 400 });
  }

  // ── Forward to the backend agent (site-ai-chat) ────────────────────────────
  const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${AI_CHAT_FN}`;

  // The backend chains Gemini/Groq/OpenRouter with its own timeouts; give the
  // overall call generous-but-bounded headroom so the widget can't hang forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }
    // Forward the client's IP hint so the backend's per-IP rate limit attributes
    // correctly (it reads cf-connecting-ip / the last x-forwarded-for hop).
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) headers["x-forwarded-for"] = fwd;

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        history: body.history,
        sessionId: body.sessionId,
        lead: body.lead,
        // Optional already-analyzed bill the client seeds (from the bill-analyzer
        // result screen) so follow-ups can reference the user's own bill. The
        // backend re-validates + clamps (parseBillHint); we relay it verbatim.
        billHint: body.billHint,
      }),
      signal: controller.signal,
    });

    // Backend not deployed yet ⇒ treat as unconfigured (friendly, soft).
    if (res.status === 404 || res.status === 501) {
      return Response.json({ error: FRIENDLY_UNCONFIGURED }, { status: 503 });
    }

    // Relay the backend's JSON + status verbatim (it already returns friendly
    // Hebrew errors with the right codes: 429 rate-limit, 503/504 busy, etc.).
    const data = await res.json().catch(() => null);
    if (data === null) {
      return Response.json({ error: FRIENDLY_BUSY }, { status: 502 });
    }
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    // Timeout / network error / unset backend — fail soft.
    return Response.json({ error: FRIENDLY_BUSY }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
