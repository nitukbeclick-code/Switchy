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
