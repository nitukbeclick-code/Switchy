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
//
// The defensive-write tests at the BOTTOM stub globalThis.fetch (the PostgREST
// service-role layer insertRow uses) so they need SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY set BEFORE _shared/db.ts reads them. No real network.
import { assert, assertEquals, assertFalse } from "@std/assert";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-stub");

import type { Lead } from "../_shared/types.ts";
import { buildAiLeadRow, captureAiLead } from "../_shared/leads.ts";
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

// ── captureAiLead: DEFENSIVE lead-write (missing consent_share_at can't throw) ──
// These pin the schema-drift safety: even if the consent_share_at column is missing
// (PostgREST 4xx on the insert that references it), captureAiLead must NEVER throw,
// and a CONSENTED customer's lead must still land (just as not-sellable) rather than
// vanish. We stub globalThis.fetch as the leads-insert sink.

const realFetch = globalThis.fetch;

type Insert = { body: Record<string, unknown> };

// Install a fetch stub for /rest/v1/leads inserts. `colMissing` simulates a project
// where consent_share_at hasn't been migrated: any insert whose body carries that key
// is rejected (400), all others accepted (201). Returns the captured insert bodies.
function stubLeadsInsert(colMissing: boolean): { inserts: Insert[]; restore: () => void } {
  const inserts: Insert[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("/rest/v1/leads")) {
      return Promise.resolve(new Response("[]", { status: 200 }));
    }
    let body: Record<string, unknown> = {};
    try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { body = {}; }
    inserts.push({ body });
    const refsMissingCol = colMissing && Object.prototype.hasOwnProperty.call(body, "consent_share_at");
    return Promise.resolve(
      refsMissingCol
        ? new Response(
          JSON.stringify({ code: "PGRST204", message: "column \"consent_share_at\" does not exist" }),
          { status: 400 },
        )
        : new Response("", { status: 201 }),
    );
  }) as typeof globalThis.fetch;
  return { inserts, restore: () => { globalThis.fetch = realFetch; } };
}

Deno.test("captureAiLead: missing consent_share_at column ⇒ no throw, lead still captured (not-sellable)", async () => {
  // Column ABSENT + an explicit share consent: the first insert (with the stamp) is
  // rejected, the defensive retry without it succeeds → "captured", never a throw.
  const { inserts, restore } = stubLeadsInsert(true);
  try {
    const res = await captureAiLead({
      name: "דנה כהן",
      phone: "0501234567",
      consent: true,
      consent_share: true,
    });
    assertEquals(res, "captured");
    // Two attempts: first WITH the stamp (rejected), retry WITHOUT it (accepted).
    assertEquals(inserts.length, 2);
    assert(
      Object.prototype.hasOwnProperty.call(inserts[0].body, "consent_share_at"),
      "first attempt should carry the share stamp",
    );
    assertFalse(
      Object.prototype.hasOwnProperty.call(inserts[1].body, "consent_share_at"),
      "retry must DROP the unknown column so the lead still lands",
    );
    // The lead's actual data still persisted on the retry (consented customer kept).
    assertEquals(inserts[1].body.phone, "0501234567");
    assertEquals(inserts[1].body.source, "advisor");
  } finally {
    restore();
  }
});

Deno.test("captureAiLead: column present + share consent ⇒ single insert keeps the stamp", async () => {
  const { inserts, restore } = stubLeadsInsert(false);
  try {
    const res = await captureAiLead({
      name: "דנה כהן",
      phone: "0501234567",
      consent: true,
      consent_share: true,
    });
    assertEquals(res, "captured");
    assertEquals(inserts.length, 1); // no retry needed when the column exists
    assertEquals(inserts[0].body.consent_share_at != null, true);
  } finally {
    restore();
  }
});

Deno.test("captureAiLead: NO share consent ⇒ one insert that never references the column", async () => {
  // colMissing=true would reject any body carrying consent_share_at — so this passing
  // proves the no-consent path never sends the key at all (safe on any schema).
  const { inserts, restore } = stubLeadsInsert(true);
  try {
    const res = await captureAiLead({ name: "דנה כהן", phone: "0501234567", consent: true });
    assertEquals(res, "captured");
    assertEquals(inserts.length, 1);
    assertFalse(
      Object.prototype.hasOwnProperty.call(inserts[0].body, "consent_share_at"),
      "no-share path must omit the column entirely",
    );
  } finally {
    restore();
  }
});

Deno.test("captureAiLead: every insert fails ⇒ 'error' (still no throw)", async () => {
  const { restore } = stubLeadsInsert(false);
  // Reject ALL leads inserts to prove the failure path returns 'error', never throws.
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/rest/v1/leads")) return Promise.resolve(new Response("", { status: 500 }));
    return Promise.resolve(new Response("[]", { status: 200 }));
  }) as typeof globalThis.fetch;
  try {
    const res = await captureAiLead({
      name: "דנה כהן",
      phone: "0501234567",
      consent: true,
      consent_share: true,
    });
    assertEquals(res, "error");
  } finally {
    restore();
  }
});

Deno.test("captureAiLead: no name/phone/consent ⇒ 'incomplete' (no insert attempted)", async () => {
  const { inserts, restore } = stubLeadsInsert(false);
  try {
    assertEquals(await captureAiLead({ name: "א", phone: "0501234567", consent: true }), "incomplete"); // name too short
    assertEquals(await captureAiLead({ name: "דנה כהן", phone: "x", consent: true }), "incomplete"); // bad phone
    assertEquals(await captureAiLead({ name: "דנה כהן", phone: "0501234567" }), "incomplete"); // no §30A consent
    assertEquals(inserts.length, 0);
  } finally {
    restore();
  }
});
