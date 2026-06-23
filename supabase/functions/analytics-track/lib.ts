// Pure helpers for analytics-track, split out of index.ts so they can be
// unit-tested without booting the Deno.serve entrypoint (mirrors the
// site-subscribe/lib.ts + renewal-reminders/email.ts convention). No I/O, no env.
//
// These are the function's security boundary:
//   • ALLOWED_EVENTS  — the writer allowlist; an unknown name is rejected, so the
//     table can't be turned into arbitrary attacker-controlled storage. Mirrors
//     KNOWN_EVENTS in admin-metrics/metrics.ts (the reader side).
//   • sanitizeProps   — reduces an arbitrary client value to a small, safe jsonb
//     bag: scalar values only, strings/keys clamped, total size bounded; any
//     nested objects/arrays/PII-shaped blobs are dropped, not stored.
//   • clientIp        — picks the trustworthy client IP (CDN header, else the
//     last/infra-appended X-Forwarded-For hop — never the spoofable first hop).

export const MAX_EVENT_LEN = 64; // event names are short enum-ish strings
export const MAX_PROPS_BYTES = 2048; // keep the jsonb bag small; no payloads/bytes

// Known funnel events (mirrors AnalyticsEvent in lib/services/analytics_service.dart
// and KNOWN_EVENTS in admin-metrics/metrics.ts). An unknown name is rejected
// rather than stored.
export const ALLOWED_EVENTS = new Set<string>([
  "leadStart",
  "leadSubmit",
  "quizComplete",
  "compareView",
  "searchQuery",
  "whatsappClick",
  "savingsViewed",
  "planView",
]);

// True iff `event` is a non-empty, length-bounded, known funnel event name.
export function isAllowedEvent(event: string): boolean {
  return !!event && event.length <= MAX_EVENT_LEN && ALLOWED_EVENTS.has(event);
}

// Same trust order as site-subscribe / site-ai-chat: CDN header first, then the
// last (infra-appended) X-Forwarded-For hop — never the spoofable first hop.
export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "";
}

// Reduce an arbitrary client value to a small, safe jsonb bag: only plain scalar
// values (string/number/bool), strings clamped, total size bounded. Any nested
// objects/arrays/PII-shaped blobs are dropped, not stored.
export function sanitizeProps(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length === 0 || k.length > 40) continue;
    if (typeof v === "string") {
      out[k] = v.length > 200 ? v.slice(0, 200) : v;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    } else if (typeof v === "boolean") {
      out[k] = v;
    }
    // everything else (objects, arrays, null, functions) is intentionally dropped
  }
  // Final size guard — if the bag is still too big, drop it entirely.
  try {
    if (JSON.stringify(out).length > MAX_PROPS_BYTES) return {};
  } catch (_) {
    return {};
  }
  return out;
}
