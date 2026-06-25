// Unit tests for the THIRD-PARTY-SHARING consent gate (the "sellable" signal).
//
// The business SELLS leads, so a lead may be marked sellable ONLY when the person
// explicitly consented to have their details passed to providers. That consent is
// SEPARATE from the mandatory §30A terms/privacy consent and is carried end-to-end:
//   create_lead (consent_share) → buildAiLeadRow (consent_share_at) →
//   buildLeadSheetRow (the trailing "sellable" = yes/no export column).
//
// This file pins the gate at both ends:
//   • buildAiLeadRow: consent_share_at is set (now) ONLY on an explicit true; it is
//     never inferred from the §30A service consent or any marketing opt-in.
//   • buildLeadSheetRow: "sellable" is "yes" iff consent_share_at is set, else "no".
//
// Run from supabase/functions/:  deno task test
import { assert, assertEquals } from "@std/assert";
import type { Lead } from "../_shared/types.ts";
import { buildAiLeadRow } from "../_shared/leads.ts";
import { buildLeadSheetRow } from "../_shared/google_sheets.ts";

const NOW = "2026-06-25T09:00:00.000Z";

// ── buildAiLeadRow: the share-consent stamp ──────────────────────────────────

Deno.test("buildAiLeadRow: NO share consent ⇒ consent_share_at is null (default), lead still captured", () => {
  // §30A service consent given (mandatory to capture) but NO third-party-sharing
  // consent — the lead is contactable yet must NOT be sellable.
  const row = buildAiLeadRow({ name: "דנה כהן", phone: "0501234567", consent: true }, NOW);
  assert(row, "row should build (name+phone+§30A consent present)");
  assertEquals(row!.consent_share_at, null);

  // Explicitly false is identical to absent — never stamped.
  const rowFalse = buildAiLeadRow(
    { name: "דנה כהן", phone: "0501234567", consent: true, consent_share: false },
    NOW,
  );
  assertEquals(rowFalse!.consent_share_at, null);

  // Truthy-but-not-true (e.g. "true" string, 1) must NOT stamp — only a real true.
  const rowLoose = buildAiLeadRow(
    { name: "דנה כהן", phone: "0501234567", consent: true, consent_share: "yes" },
    NOW,
  );
  assertEquals(rowLoose!.consent_share_at, null);
});

Deno.test("buildAiLeadRow: EXPLICIT share consent ⇒ consent_share_at stamped now()", () => {
  const row = buildAiLeadRow(
    { name: "דנה כהן", phone: "0501234567", consent: true, consent_share: true },
    NOW,
  );
  assert(row, "row should build");
  assertEquals(row!.consent_share_at, NOW);
});

Deno.test("buildAiLeadRow: share consent is INDEPENDENT of marketing opt-ins (not bundled)", () => {
  // Marketing opt-ins ON but share consent absent → still not sellable.
  const marketingOnly = buildAiLeadRow(
    {
      name: "דנה כהן",
      phone: "0501234567",
      consent: true,
      consent_marketing_sms: true,
      consent_marketing_email: true,
      consent_marketing_whatsapp: true,
    },
    NOW,
  );
  assertEquals(marketingOnly!.consent_share_at, null);
  // marketing stamp present (sanity) — proves they're tracked separately.
  assertEquals(marketingOnly!.marketing_accepted_at, NOW);

  // Share consent WITHOUT any marketing opt-in → sellable, no marketing.
  const shareOnly = buildAiLeadRow(
    { name: "דנה כהן", phone: "0501234567", consent: true, consent_share: true },
    NOW,
  );
  assertEquals(shareOnly!.consent_share_at, NOW);
  assertEquals(shareOnly!.marketing_accepted_at, null);
});

// ── End-to-end: the buildAiLeadRow stamp drives the sheet "sellable" column ───

Deno.test("gate end-to-end: no consent ⇒ sellable 'no'; explicit consent ⇒ 'yes'", () => {
  // No share consent: the built row's null consent_share_at must export as "no".
  // The AiLeadRow already carries consent_share_at, which buildLeadSheetRow reads.
  const noShareRow = buildAiLeadRow({ name: "דנה כהן", phone: "0501234567", consent: true }, NOW);
  const noShareSheet = buildLeadSheetRow(noShareRow as unknown as Lead);
  assertEquals(noShareSheet.length, 13);
  assertEquals(noShareSheet[12], "no");

  // Explicit share consent: the stamped row must export as "yes".
  const shareRow = buildAiLeadRow(
    { name: "דנה כהן", phone: "0501234567", consent: true, consent_share: true },
    NOW,
  );
  const shareSheet = buildLeadSheetRow(shareRow as unknown as Lead);
  assertEquals(shareSheet.length, 13);
  assertEquals(shareSheet[12], "yes");
});

// ── buildLeadSheetRow: direct sellable honesty (read defensively off the row) ──

Deno.test("buildLeadSheetRow: sellable reads ONLY consent_share_at — honest yes/no", () => {
  // A set timestamp → yes.
  assertEquals(
    buildLeadSheetRow({ name: "x y", phone: "0501234567", consent_share_at: NOW } as unknown as Lead)[12],
    "yes",
  );
  // Null → no.
  assertEquals(
    buildLeadSheetRow({ name: "x y", phone: "0501234567", consent_share_at: null } as unknown as Lead)[12],
    "no",
  );
  // Absent → no.
  assertEquals(buildLeadSheetRow({ name: "x y", phone: "0501234567" } as Lead)[12], "no");
});
