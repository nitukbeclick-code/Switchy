// Tests for the branded customer-email template system (_shared/email.ts) and
// the renewal-radar email builder (renewal-reminders/email.ts).
//
// These are pure HTML builders — no network, no Deno.serve — so they unit-test
// directly. We assert the email-client-safety + compliance invariants:
//   • table layout + inline styles (no <style> block / flex / grid)
//   • RTL Hebrew, green CTA, sender identity + privacy + unsubscribe footer
//   • missing data is OMITTED (no "undefined"/"null"/"NaN")
//   • hostile input is escaped and non-http(s)/mailto URLs collapse to "#"

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  escAttr,
  escHtml,
  leadConfirmEmail,
  listUnsubscribeHeader,
  renewalRadarEmail,
  safeUrl,
  unsubscribeUrlFor,
  welcomeEmail,
} from "../_shared/email.ts";
import { buildRenewalReminderEmail, RENEWAL_EMAIL_SUBJECT } from "../renewal-reminders/email.ts";
import type { RenewalRow } from "../_shared/types.ts";

// ── escapers ─────────────────────────────────────────────────────────────────

Deno.test("escHtml escapes text-node specials", () => {
  assertEquals(escHtml(`a & b < c > d`), "a &amp; b &lt; c &gt; d");
});

Deno.test("escAttr also escapes quotes (attribute-safe)", () => {
  assertEquals(escAttr(`x"y'z`), "x&quot;y&#39;z");
});

Deno.test("safeUrl allows http(s) + mailto, collapses the rest to #", () => {
  assertEquals(safeUrl("https://switchy-ai.com"), "https://switchy-ai.com");
  assertEquals(safeUrl("mailto:a@b.com?subject=x"), "mailto:a@b.com?subject=x");
  assertEquals(safeUrl("javascript:alert(1)"), "#");
  assertEquals(safeUrl("/relative"), "#");
  assertEquals(safeUrl(undefined), "#");
});

// ── client-safety invariants (shared by every template) ──────────────────────

function assertClientSafe(html: string) {
  assert(html.includes('dir="rtl"'), "must be RTL");
  assert(html.includes("<table"), "must use table layout");
  assert(!/<style[\s>]/i.test(html), "must NOT use a <style> block (stripped by Gmail)");
  assert(!/display:\s*flex|display:\s*grid/i.test(html), "must NOT use flex/grid");
  assertStringIncludes(html, "מדיניות פרטיות"); // privacy link (footer)
  assertStringIncludes(html, "Switch AI"); // sender identity
  // no leaked placeholders
  for (const bad of ["undefined", "NaN", "null/חודש"]) {
    assert(!html.includes(bad), `must not contain "${bad}"`);
  }
  // no live javascript: URLs
  assert(!html.includes("javascript:"), "must not contain javascript: URLs");
}

Deno.test("welcomeEmail is client-safe + carries unsubscribe (marketing)", () => {
  const html = welcomeEmail({ unsubscribeUrl: unsubscribeUrlFor("a@b.com") });
  assertClientSafe(html);
  assertStringIncludes(html, "#16A34A"); // green CTA
  assertStringIncludes(html, "הסרה מרשימת התפוצה");
  assertStringIncludes(html, "ברוכים הבאים");
});

Deno.test("leadConfirmEmail is client-safe + has NO unsubscribe (transactional)", () => {
  const html = leadConfirmEmail({ name: "דנה", provider: "פרטנר", category: "סלולר" });
  assertClientSafe(html);
  assert(!html.includes("הסרה מרשימת התפוצה"), "transactional confirm must not show unsubscribe");
  assertStringIncludes(html, "דנה");
  assertStringIncludes(html, "פרטנר");
});

Deno.test("renewalRadarEmail renders present fields, omits absent ones cleanly", () => {
  const full = renewalRadarEmail({
    name: "יוסי", provider: "HOT", planName: "5G", monthlyPrice: 39, category: "סלולר",
    renewDate: "2026-07-10", daysLeft: 18, compareUrl: "https://switchy-ai.com/cellular.html",
    unsubscribeUrl: unsubscribeUrlFor("y@e.com"),
  });
  assertClientSafe(full);
  assertStringIncludes(full, "₪39/חודש");
  assertStringIncludes(full, "2026-07-10");
  assertStringIncludes(full, "18");

  // sparse: every optional field missing — must still be safe + no garbage
  const sparse = renewalRadarEmail({ compareUrl: "https://switchy-ai.com/compare.html" });
  assertClientSafe(sparse);
  assert(!sparse.includes("₪"), "no price figure when monthlyPrice absent");
});

Deno.test("renewalRadarEmail does NOT fabricate a specific offer/saving", () => {
  const html = renewalRadarEmail({
    provider: "סלקום", planName: "Plan", monthlyPrice: 50, category: "סלולר",
    renewDate: "2026-08-01", daysLeft: 10, compareUrl: "https://switchy-ai.com/cellular.html",
  });
  // honest framing only — never claims a concrete replacement price/saving
  assert(!/תחסכו ₪|מחיר חדש|הצעה ב-?₪/.test(html), "must not quote a fabricated replacement offer");
});

Deno.test("templates escape hostile input + neutralise hostile URLs", () => {
  const html = renewalRadarEmail({
    name: '<script>x</script>', provider: "p", planName: "q", monthlyPrice: 1,
    category: "c", renewDate: "2026-07-01", daysLeft: 5,
    compareUrl: "javascript:alert(1)", unsubscribeUrl: "javascript:alert(2)",
  });
  assert(!html.includes("<script>"), "raw <script> must be escaped");
  assertStringIncludes(html, "&lt;script&gt;");
  assert(!html.includes("javascript:"), "hostile URLs must collapse to #");
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  // privacy link survives; both hostile URLs became "#"
  assertEquals(hrefs.filter((h) => h === "#").length, 2);
});

// ── unsubscribe helpers ──────────────────────────────────────────────────────

Deno.test("unsubscribeUrlFor falls back to a working mailto with the address", () => {
  const u = unsubscribeUrlFor("user@example.com");
  assertStringIncludes(u, "mailto:");
  assertStringIncludes(u, encodeURIComponent("user@example.com"));
});

Deno.test("listUnsubscribeHeader yields an RFC-2369 mailto bracket", () => {
  const h = listUnsubscribeHeader("user@example.com");
  assert(h.startsWith("<mailto:"), "must be angle-bracketed mailto");
  assert(h.endsWith(">"));
});

// ── renewal-reminders/email.ts builder ───────────────────────────────────────

Deno.test("buildRenewalReminderEmail maps a RenewalRow + computes days left", () => {
  const row: RenewalRow = {
    id: "1", user_id: "u", provider: "HOT mobile", plan_name: "אנלימיטד 5G",
    monthly_price: 39, promo_end_date: "2026-07-10", category: "cellular",
    name: "יוסי", phone: "0500000000", email: "y@e.com",
  };
  const html = buildRenewalReminderEmail(row, new Date("2026-06-23"));
  assertClientSafe(html);
  assertStringIncludes(html, "HOT mobile");
  assertStringIncludes(html, "סלולר"); // category mapped via CAT_HE
  assertStringIncludes(html, "₪39/חודש");
  assertStringIncludes(html, "/cellular.html"); // category-deep-linked CTA
  assert(RENEWAL_EMAIL_SUBJECT.length > 0);
});
