import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// referral-issue — Switchy AI
// Mints + PERSISTS a real referral code for the Flutter app's /referral screen,
// so app-shared codes are attributable in public.referral_codes (channel='app').
// Closes the parity gap where the app issued a local, UNPERSISTED code while the
// website persisted via web/app/api/referral.
//
// The referral_codes table is service_role-only (RLS denies anon by design — see
// supabase/referral-codes-2026-06.sql), so the app cannot insert directly; it
// invokes this function. verify_jwt MUST be false (the app's anon JWT is attached
// automatically). All the real work lives in _shared/referrals.ts; this is a thin,
// rate-limited, FAIL-SOFT wrapper.
//
// HONESTY / §30A: NO advertised reward — share-the-tool framing. Issuing a SHARE
// code is not marketing TO anyone (the referrer chooses to share it), so there is
// no consent gate; a code only becomes a contact event if a referee later redeems.
//
// Deploy: supabase functions deploy referral-issue --no-verify-jwt
//
// POST { name?, conversationId?, contact? } -> { ok:true, code, persisted }
// GET  (any)                                -> health string
// ─────────────────────────────────────────────────────────────────────────────

import { rateLimit } from "../_shared/ratelimit.ts";
import { jlog } from "../_shared/log.ts";
import { captureError } from "../_shared/observability.ts";
import { issueReferralCode, makeReferralCode } from "../_shared/referrals.ts";

const ALLOWED_ORIGINS = new Set<string>([
  "https://switchy-ai.com",
  "https://www.switchy-ai.com",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  // Browser callers get an exact-origin echo (or "null" for a non-allowed origin);
  // non-browser callers (the Flutter app sends no Origin) get "*". apikey/authorization
  // MUST be echoed or the supabase-js invoke preflight fails.
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : (origin ? "null" : "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
    if (req.method === "GET") {
      return new Response("referral-issue: ok", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin) },
      });
    }
    if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405, origin);

    // Per-IP throttle: minting is cheap, but cap a single client so it can't spam
    // rows. Generous (20 / 10 min). On throttle we STILL return a real (unpersisted)
    // code so the share UX never dead-ends — attribution just isn't recorded.
    const ip = clientIp(req);
    const rl = rateLimit(`ref:issue:${ip || "noip"}`, 20, 10 * 60_000);
    if (!rl.allowed) {
      jlog({ at: "referral-issue", ok: true, persisted: false, throttled: true });
      return json({ ok: true, code: makeReferralCode(), persisted: false }, 200, origin);
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // empty / non-JSON body is fine — all fields are optional
    }

    const code = await issueReferralCode({
      channel: "app",
      name: str(body.name),
      conversationId: str(body.conversationId),
      contact: str(body.contact),
    });

    if (code) {
      jlog({ at: "referral-issue", ok: true, persisted: true });
      return json({ ok: true, code, persisted: true }, 200, origin);
    }
    // Service-role / DB unavailable → fail-soft real code so sharing still works
    // (mirrors web/app/api/referral's unpersisted fallback).
    jlog({ at: "referral-issue", ok: false, persisted: false });
    return json({ ok: true, code: makeReferralCode(), persisted: false }, 200, origin);
  } catch (e) {
    captureError(e, { fn: "referral-issue", method: req.method });
    jlog({ at: "referral-issue", ok: false, error: String(e) });
    // Never dead-end the share UX: a local unpersisted code still lets them share.
    return json({ ok: true, code: makeReferralCode(), persisted: false }, 200, origin);
  }
});
