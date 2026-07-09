// Pure, dependency-free helpers for site-subscribe, split out of index.ts so they
// can be unit-tested without booting the Deno.serve entrypoint (mirrors the
// whatsapp-webhook/intents.ts convention). No network, no env, no I/O.

// Pragmatic RFC-ish email check: a single @, non-empty local/domain parts, at
// least one dot in the domain, no whitespace. Not a full RFC 5322 parser — just
// enough to reject obvious garbage before we store it.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tri-state outcome of inserting a subscriber row.
export type InsertResult = "inserted" | "exists" | "error";

// Whether to send the welcome email after an insert attempt. ONLY a genuinely
// new subscriber gets welcomed — re-submitting an existing address is an
// idempotent success ("exists") but must NOT re-welcome, which would burn a paid
// Resend send on every duplicate form post. (B7 fix.)
export function shouldWelcome(result: InsertResult): boolean {
  return result === "inserted";
}

// Optional per-plan interest tag sent by the site's price-watch bell
// ("topic": "plan:<catalogue id>"). It lands in newsletter_subscribers.source,
// so it must stay a short, boring string: word chars (Latin or Hebrew), colon,
// dot, dash, space. Anything else — or anything over 80 chars — collapses to ""
// (plain newsletter signup), never an error: the subscription itself must not
// fail because of a malformed tag.
const TOPIC_RE = /^[\w:.\-֐-׿ ]+$/;
export function sanitizeTopic(t: unknown): string {
  if (typeof t !== "string") return "";
  const s = t.trim();
  if (!s || s.length > 80) return "";
  return TOPIC_RE.test(s) ? s : "";
}
