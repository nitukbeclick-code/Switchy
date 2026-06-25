// Customer-facing renewal-radar reminder email — pure builders, no I/O.
//
// Maps a RenewalRow (from get_upcoming_renewals) onto the shared, email-client-
// safe template in _shared/email.ts. Split out of index.ts so it can be
// unit-tested without booting the Deno.serve entrypoint (mirrors the
// site-subscribe/lib.ts convention).
//
// HONESTY: we only tell the customer their tracked plan is about to renew and
// invite a fresh comparison. We do NOT quote a specific replacement
// offer/price/saving in the email — those are computed live on the site. Every
// numeric field is rendered only when present; missing data is omitted.

import type { RenewalRow } from "../_shared/types.ts";
import { renewalRadarEmail, unsubscribeUrlFor } from "../_shared/email.ts";
import { CAT_HE, daysUntil } from "../_shared/digests.ts";

export const RENEWAL_EMAIL_SUBJECT = "תזכורת חידוש — שווה לבדוק אם אפשר לחסוך";

// Build the compare-now link: deep-links to the relevant category on the
// marketing site when we recognise the category, else the site root. Base is
// overridable via SITE_BASE_URL (same env the shared template reads).
function compareUrlFor(category: string | null | undefined): string {
  const base = (Deno.env.get("SITE_BASE_URL") || "https://switchy-ai.com").replace(/\/+$/, "");
  const slug: Record<string, string> = {
    cellular: "/cellular.html",
    internet: "/internet.html",
    tv: "/tv.html",
    triple: "/triple.html",
    abroad: "/abroad.html",
  };
  const path = (category && slug[category]) || "/compare.html";
  return `${base}${path}`;
}

// Render the reminder email HTML for one tracked renewal. `now` is injectable
// for deterministic tests.
export function buildRenewalReminderEmail(row: RenewalRow, now = new Date()): string {
  const days = row.promo_end_date ? daysUntil(row.promo_end_date, now) : null;
  return renewalRadarEmail({
    name: row.name,
    provider: row.provider,
    planName: row.plan_name,
    monthlyPrice: typeof row.monthly_price === "number" ? row.monthly_price : null,
    category: row.category ? (CAT_HE[row.category] ?? row.category) : null,
    renewDate: row.promo_end_date ?? null,
    daysLeft: days,
    compareUrl: compareUrlFor(row.category),
    unsubscribeUrl: unsubscribeUrlFor(row.email ?? undefined),
  });
}
