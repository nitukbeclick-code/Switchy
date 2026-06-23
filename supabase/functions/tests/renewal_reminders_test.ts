// Unit tests for the renewal-reminders email builder (renewal-reminders/email.ts)
// that complement email_templates_test.ts: here we pin the compare-link routing
// (SITE_BASE_URL override + trailing-slash normalisation + unknown-category
// fallback to /compare.html) and the days-left computation/omission, all through
// the public builder. Pure HTML — no network, no Deno.serve. The only env touched
// is SITE_BASE_URL, set + restored within each test. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { buildRenewalReminderEmail, RENEWAL_EMAIL_SUBJECT } from "../renewal-reminders/email.ts";
import type { RenewalRow } from "../_shared/types.ts";

function row(over: Partial<RenewalRow> = {}): RenewalRow {
  return {
    id: "1",
    user_id: "u",
    provider: "HOT mobile",
    plan_name: "אנלימיטד 5G",
    monthly_price: 39,
    promo_end_date: "2026-07-10",
    category: "cellular",
    name: "יוסי",
    phone: "0500000000",
    email: "y@e.com",
    ...over,
  };
}

// Run `fn` with SITE_BASE_URL forced to `val`, restoring the prior value after.
function withSiteBase(val: string | null, fn: () => void) {
  const prev = Deno.env.get("SITE_BASE_URL");
  try {
    if (val === null) Deno.env.delete("SITE_BASE_URL");
    else Deno.env.set("SITE_BASE_URL", val);
    fn();
  } finally {
    if (prev === undefined) Deno.env.delete("SITE_BASE_URL");
    else Deno.env.set("SITE_BASE_URL", prev);
  }
}

// Pull every href out of the rendered HTML.
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

// ── subject line ─────────────────────────────────────────────────────────────

Deno.test("RENEWAL_EMAIL_SUBJECT is a non-empty Hebrew reminder line", () => {
  assert(RENEWAL_EMAIL_SUBJECT.length > 0);
  assertStringIncludes(RENEWAL_EMAIL_SUBJECT, "חידוש");
});

// ── compare-link routing ──────────────────────────────────────────────────────

Deno.test("compare link deep-links per known category on the configured base", () => {
  withSiteBase("https://example.test", () => {
    const cases: Record<string, string> = {
      cellular: "/cellular.html",
      internet: "/internet.html",
      tv: "/tv.html",
      triple: "/triple.html",
      abroad: "/abroad.html",
    };
    for (const [cat, path] of Object.entries(cases)) {
      const html = buildRenewalReminderEmail(row({ category: cat }), new Date("2026-06-23"));
      assert(
        hrefs(html).some((h) => h === `https://example.test${path}`),
        `expected compare link ${path} for category ${cat}`,
      );
    }
  });
});

Deno.test("compare link falls back to /compare.html for an unknown/empty category", () => {
  withSiteBase("https://example.test", () => {
    for (const cat of ["electricity", "", "weird"]) {
      const html = buildRenewalReminderEmail(row({ category: cat }), new Date("2026-06-23"));
      assert(
        hrefs(html).some((h) => h === "https://example.test/compare.html"),
        `expected /compare.html fallback for category ${JSON.stringify(cat)}`,
      );
    }
  });
});

Deno.test("SITE_BASE_URL trailing slashes are stripped (no '//' in the link)", () => {
  withSiteBase("https://example.test///", () => {
    const html = buildRenewalReminderEmail(row({ category: "cellular" }), new Date("2026-06-23"));
    assert(
      hrefs(html).some((h) => h === "https://example.test/cellular.html"),
      "trailing slashes on the base must be normalised",
    );
  });
});

Deno.test("compare link uses the production default when SITE_BASE_URL is unset", () => {
  withSiteBase(null, () => {
    const html = buildRenewalReminderEmail(row({ category: "cellular" }), new Date("2026-06-23"));
    assert(
      hrefs(html).some((h) => h === "https://switchy-ai.com/cellular.html"),
      "must default to the production site base",
    );
  });
});

// ── days-left computation / omission ──────────────────────────────────────────

Deno.test("days-left is computed from `now` to the promo end date", () => {
  // daysUntil ceils from midnight-local of `now`: 2026-06-23 → 2026-07-10 = 18.
  // Use a price that can't itself contain "18" so the match is unambiguous.
  const html = buildRenewalReminderEmail(
    row({ promo_end_date: "2026-07-10", monthly_price: 39 }),
    new Date("2026-06-23"),
  );
  assertStringIncludes(html, "18");
  assertStringIncludes(html, "2026-07-10");
});

Deno.test("a missing promo_end_date renders no days-left and no NaN", () => {
  const html = buildRenewalReminderEmail(
    row({ promo_end_date: "" as unknown as string }),
    new Date("2026-06-23"),
  );
  assert(!html.includes("NaN"), "must not leak NaN when the renew date is absent");
});
