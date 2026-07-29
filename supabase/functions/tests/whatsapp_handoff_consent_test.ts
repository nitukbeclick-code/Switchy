// The CONSENT + IDENTITY contract of the rewritten whatsapp-webhook
// createHandoffLead (whatsapp-webhook/index.ts).
//
// WHY THIS FILE EXISTS. The hand-off used to insert four raw columns of its own
// (`pgInsert("leads", { name, phone, source, notes })`), bypassing the single
// honest-consent gate in _shared/leads.ts entirely. In production that produced 18
// lead rows with NO consent record at all — terms_accepted_at, privacy_accepted_at,
// every consent_marketing_* and consent_share_at all null/false — and, because it
// also carried its own `normalizeLeadPhone`, every one of them stored in a phone
// format no other surface writes.
//
// It now routes through captureAiLead. The contract that must hold:
//   • the §30A SERVICE basis is RECORDED (terms+privacy stamped + named in Hebrew),
//     not merely implied by the absence of columns;
//   • it is still NOT marketing consent and NEVER sellable;
//   • the phone is the canonical national form _shared/leads.ts writes;
//   • a customer never LOSES their hand-off to the stricter gate — not to the name
//     floor, not to a foreign number, and not to a refused row.
//
// Same harness as whatsapp_relay_test.ts: capture the real Deno.serve handler and
// drive it with HMAC-signed Meta webhook POSTs, stubbing every outbound fetch.
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

const APP_SECRET = "wa-handoff-consent-secret";
Deno.env.set("WHATSAPP_APP_SECRET", APP_SECRET);
Deno.env.set("WHATSAPP_TOKEN", "wa-test-token");
Deno.env.set("WHATSAPP_PHONE_ID", "1202423646285095");
Deno.env.set("SUPABASE_URL", "https://handoff-consent-test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("TELEGRAM_BOT_TOKEN", "tg-test-token");
Deno.env.set("TELEGRAM_CHAT_ID", "-100999");
// No AI keys: the deterministic handoff branch must not reach a live LLM.
Deno.env.delete("GEMINI_API_KEY");
Deno.env.delete("GOOGLE_AI_KEY");
Deno.env.delete("GROQ_API_KEY");
Deno.env.delete("OPENROUTER_API_KEY");

const handler = await captureServeHandler("../whatsapp-webhook/index.ts");

async function sign(raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

function metaTextBody(from: string, text: string, name: string): unknown {
  return {
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name }, wa_id: from }],
          messages: [{ from, id: `wamid.${crypto.randomUUID()}`, type: "text", text: { body: text } }],
        },
      }],
    }],
  };
}

async function postSigned(body: unknown): Promise<Response> {
  const raw = JSON.stringify(body);
  return await Promise.resolve(
    handler(new Request("https://edge/whatsapp-webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await sign(raw), "Content-Type": "application/json" },
      body: raw,
    })),
  );
}

type Row = Record<string, unknown>;
type Writes = {
  leadsInsert: Row[];
  leadsPatch: Row[];
  contactPatch: Row[];
  audit: Row[];
  graph: Array<{ body: string }>;
};

function emptyWrites(): Writes {
  return { leadsInsert: [], leadsPatch: [], contactPatch: [], audit: [], graph: [] };
}

// `contact` is the row upsertContact returns — this is where wa_name comes from
// (NOT the Meta envelope), so each test controls the profile name through it.
// `leadLands` false ⇒ the leads POST 400s, driving the insert-failure branch.
function routes(w: Writes, contact: Row, leadLands = true) {
  const convo = { id: "conv-hc", status: "bot", bot_enabled: true, ai_state: null, relay_tg_chat_id: null };
  return [
    { match: (u: string) => u.includes("/rest/v1/rpc/get_lead_notify_config"), respond: () => jsonResponse({}) },
    {
      match: (u: string) => u.includes("graph.facebook.com"),
      respond: (_u: string, init?: RequestInit) => {
        const b = JSON.parse(String(init?.body ?? "{}"));
        if (b?.type === "text") w.graph.push({ body: String(b.text?.body ?? "") });
        return jsonResponse({ messages: [{ id: `wamid.out.${crypto.randomUUID()}` }] });
      },
    },
    {
      match: (u: string) => u.includes("api.telegram.org"),
      respond: () => jsonResponse({ ok: true, result: { message_id: 1 } }),
    },
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "GET",
      respond: () => jsonResponse([convo]),
    },
    // NOT a first contact → routes through classifyTextIntent, not the greeting.
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_messages") && (init?.method ?? "GET") === "GET",
      respond: () => jsonResponse([{ id: "prior-msg" }]),
    },
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_contacts") && init?.method === "PATCH",
      respond: (_u: string, init?: RequestInit) => {
        w.contactPatch.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([], 200);
      },
    },
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_contacts") && (init?.method ?? "GET") === "POST",
      respond: () => jsonResponse([contact]),
    },
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_messages") && (init?.method ?? "GET") === "POST",
      respond: () => jsonResponse([{ id: crypto.randomUUID() }]),
    },
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/security_audit_log") && (init?.method ?? "GET") === "POST",
      respond: (_u: string, init?: RequestInit) => {
        w.audit.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([], 200);
      },
    },
    {
      match: (u: string, init?: RequestInit) => u.includes("/rest/v1/leads") && init?.method === "PATCH",
      respond: (_u: string, init?: RequestInit) => {
        w.leadsPatch.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([], 200);
      },
    },
    {
      match: (u: string, init?: RequestInit) => u.includes("/rest/v1/leads") && init?.method === "POST",
      respond: (_u: string, init?: RequestInit) => {
        w.leadsInsert.push(JSON.parse(String(init?.body ?? "{}")));
        return leadLands ? jsonResponse([{ id: "lead-1" }], 201) : jsonResponse({ message: "blocked" }, 400);
      },
    },
    // Catch-all, incl. the leads GET lookupOpenLead uses → no existing lead.
    { match: (u: string) => u.includes("/rest/v1/"), respond: () => jsonResponse([], 200) },
  ];
}

const HANDOFF_TEXT = "תן לי נציג בבקשה";
const auditEvents = (w: Writes) => w.audit.map((a) => String(a.event));

// ── The recorded consent basis ────────────────────────────────────────────────

Deno.test("hand-off records the §30A SERVICE basis — stamped, named, and NEVER marketing", async () => {
  const w = emptyWrites();
  await withFetchStub(routes(w, { id: "c-1", wa_phone: "972501234567", wa_name: "דנה כהן" }), async () => {
    await postSigned(metaTextBody("972501234567", HANDOFF_TEXT, "דנה כהן"));
  });
  assertEquals(w.leadsInsert.length, 1);
  const row = w.leadsInsert[0];

  // Recorded, not implied.
  assert(row.terms_accepted_at, "terms stamped");
  assert(row.privacy_accepted_at, "privacy stamped");
  assertStringIncludes(String(row.notes ?? ""), "בסיס הסכמה");
  assertStringIncludes(String(row.notes ?? ""), "פעולת שירות");

  // Still not marketing, and never sellable — the two things that keep a service
  // hand-off distinguishable from a form lead where somebody ticked a box.
  assertEquals(row.consent_marketing_sms, false);
  assertEquals(row.consent_marketing_email, false);
  assertEquals(row.consent_marketing_whatsapp, false);
  assertEquals(row.marketing_accepted_at, null);
  assertEquals(
    row.consent_share_at,
    undefined,
    "consent_share_at must be ABSENT ⇒ buildLeadSheetRow reads sellable=no",
  );

  // Canonical national phone — the same shape every other writer produces.
  assertEquals(row.phone, "0501234567");
  // source drives leadKeyboard's 🤝 relay buttons; mislabelling loses the control.
  assertEquals(row.source, "whatsapp");
});

Deno.test("hand-off writes the Reg.13 basis audit row (PII-free)", async () => {
  const w = emptyWrites();
  await withFetchStub(routes(w, { id: "c-2", wa_phone: "972501234567", wa_name: "דנה כהן" }), async () => {
    await postSigned(metaTextBody("972501234567", HANDOFF_TEXT, "דנה כהן"));
  });
  const basis = w.audit.find((a) => a.event === "handoff_lead_service_consent");
  assert(basis, `expected a handoff_lead_service_consent row, got ${JSON.stringify(auditEvents(w))}`);
  const detail = (basis.detail ?? {}) as Row;
  assertEquals(detail.basis, "service_30a");
  assertEquals(detail.marketing, false);
  assertEquals(detail.sellable, false);
  // No PII in the audit detail — no phone, no name, no message text.
  const blob = JSON.stringify(detail);
  assertFalse(blob.includes("501234567"), "the audit detail must not carry the phone");
  assertFalse(blob.includes("דנה"), "the audit detail must not carry the name");
});

// ── The customer must never LOSE the hand-off to the stricter gate ────────────

Deno.test("a 1-char WhatsApp profile name falls back to the phone, it does NOT lose the lead", async () => {
  // buildAiLeadRow enforces a 2-char name floor and would refuse the row outright.
  // Losing a request for a human is far worse than an unlovely name on the card.
  const w = emptyWrites();
  await withFetchStub(routes(w, { id: "c-3", wa_phone: "972501234567", wa_name: "א" }), async () => {
    await postSigned(metaTextBody("972501234567", HANDOFF_TEXT, "א"));
  });
  assertEquals(w.leadsInsert.length, 1, "the hand-off still lands");
  assertEquals(w.leadsInsert[0].name, "0501234567", "name falls back to the normalized phone");
  assertFalse(
    auditEvents(w).includes("handoff_lead_incomplete"),
    "a short profile name is handled, not reported as incomplete",
  );
});

Deno.test("an emoji/business profile name is sanitized and flagged as UNVERIFIED to the rep", async () => {
  // Real production names: "Hila Ohayon❤️", "Yes-Pelehone-Bezeq", "חיבור וניתוק בקליק".
  // _shared/leads.ts defaultDraft puts the first token into the rep's prefilled
  // opener, so the rep has to know this name was never confirmed by the customer.
  const w = emptyWrites();
  await withFetchStub(routes(w, { id: "c-4", wa_phone: "972501234567", wa_name: "Hila  Ohayon❤️" }), async () => {
    await postSigned(metaTextBody("972501234567", HANDOFF_TEXT, "Hila  Ohayon❤️"));
  });
  assertEquals(w.leadsInsert.length, 1);
  const row = w.leadsInsert[0];
  assertEquals(row.name, "Hila Ohayon", "emoji stripped, whitespace collapsed");
  assertStringIncludes(String(row.notes ?? ""), "שם מפרופיל WhatsApp");
});

Deno.test("a NON-Israeli WhatsApp number still produces a lead (no silent black hole)", async () => {
  // _shared/leads.ts normalizeLeadPhone returns "" for a foreign number, which
  // without allow_international would mean: no lead, no rep card — while the
  // customer still reads "a rep will get back to you". Invisible to everyone.
  const w = emptyWrites();
  await withFetchStub(routes(w, { id: "c-5", wa_phone: "14155552671", wa_name: "Dana Cohen" }), async () => {
    await postSigned(metaTextBody("14155552671", HANDOFF_TEXT, "Dana Cohen"));
  });
  assertEquals(w.leadsInsert.length, 1, "a foreign hand-off must not vanish");
  assertEquals(w.leadsInsert[0].phone, "+14155552671", "kept in E.164, never guessed into an IL number");
});

// ── The two failure modes are DISTINCT ───────────────────────────────────────

Deno.test('a REFUSED row emits handoff_lead_incomplete — not the insert-failure signal', async () => {
  // A wa_id too short to be any phone ⇒ buildAiLeadRow refuses ⇒ "incomplete".
  // The old bespoke insert could not even express this state: everything that went
  // wrong looked like a failed insert.
  const w = emptyWrites();
  await withFetchStub(routes(w, { id: "c-6", wa_phone: "12345", wa_name: "דנה כהן" }), async () => {
    await postSigned(metaTextBody("12345", HANDOFF_TEXT, "דנה כהן"));
  });
  assertEquals(w.leadsInsert.length, 0, "nothing is inserted when the row can't be built honestly");
  const events = auditEvents(w);
  assert(events.includes("handoff_lead_incomplete"), `expected handoff_lead_incomplete, got ${JSON.stringify(events)}`);
  assertFalse(
    events.includes("handoff_lead_insert_failed"),
    "a refused row must NOT masquerade as a DB insert failure — different bug, different fix",
  );
  // …and the customer is still reassured rather than left with silence.
  assert(w.graph.length >= 1, "the customer still gets the hand-off reply");
});

Deno.test("a DB-rejected insert still emits handoff_lead_insert_failed", async () => {
  const w = emptyWrites();
  await withFetchStub(
    routes(w, { id: "c-7", wa_phone: "972501234567", wa_name: "דנה כהן" }, /* leadLands */ false),
    async () => {
      await postSigned(metaTextBody("972501234567", HANDOFF_TEXT, "דנה כהן"));
    },
  );
  const events = auditEvents(w);
  assert(events.includes("handoff_lead_insert_failed"), `expected the insert-failure signal, got ${JSON.stringify(events)}`);
  assertFalse(
    events.includes("handoff_lead_service_consent"),
    "no basis row for a lead that never landed",
  );
  assert(w.graph.length >= 1, "the customer is still reassured");
});
