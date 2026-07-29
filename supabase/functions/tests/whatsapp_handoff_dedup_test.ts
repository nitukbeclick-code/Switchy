// The DEDUP contract of whatsapp-webhook createHandoffLead.
//
// WHY THIS FILE EXISTS. createHandoffLead used to insert unconditionally, one lead
// row per hand-off. In production that produced 32 lead rows for 16 real people —
// one customer accumulated THIRTEEN — each insert firing a fresh Telegram card, so a
// rep would phone the same person repeatedly, and each insert stealing
// whatsapp_contacts.lead_id (a single column) from the row before it, orphaning 8 of
// them from the conversation view.
//
// A repeat hand-off from someone with an OPEN lead now updates that lead instead.
// The contract:
//   • open ('new'/'contacted')  → PATCH, and ZERO inserts;
//   • closed ('won'/'lost')     → a NEW lead (never resurrect a finished deal);
//   • no lead / lookup failure  → insert (fail toward the duplicate, never toward
//     silently swallowing a customer's request for a human);
//   • the reuse is VISIBLE to a human even though a PATCH fires no rep card.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

const APP_SECRET = "wa-handoff-dedup-secret";
Deno.env.set("WHATSAPP_APP_SECRET", APP_SECRET);
Deno.env.set("WHATSAPP_TOKEN", "wa-test-token");
Deno.env.set("WHATSAPP_PHONE_ID", "1202423646285095");
Deno.env.set("SUPABASE_URL", "https://handoff-dedup-test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("TELEGRAM_BOT_TOKEN", "tg-test-token");
Deno.env.set("TELEGRAM_CHAT_ID", "-100999");
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

const PHONE = "972501234567";

function metaTextBody(text: string): unknown {
  return {
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: "דנה כהן" }, wa_id: PHONE }],
          messages: [{ from: PHONE, id: `wamid.${crypto.randomUUID()}`, type: "text", text: { body: text } }],
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
  leadEvents: Row[];
  graph: Array<{ body: string }>;
};

function emptyWrites(): Writes {
  return { leadsInsert: [], leadsPatch: [], contactPatch: [], leadEvents: [], graph: [] };
}

// `existing` is what lookupOpenLead's `phone=in.(…)` GET returns — null for "this
// person has no lead yet". `persistInsert` makes an inserted lead become the
// `existing` one for the NEXT request, so repeated hand-offs can be driven for real
// instead of assumed. `lookupFails` 500s that GET (fetchRows → null → fail-soft).
function routes(
  w: Writes,
  opts: { existing?: Row | null; persistInsert?: boolean; lookupFails?: boolean; storedNotes?: string } = {},
) {
  const convo = { id: "conv-dd", status: "bot", bot_enabled: true, ai_state: null, relay_tg_chat_id: null };
  const contact = { id: "c-dd", wa_phone: PHONE, wa_name: "דנה כהן" };
  let existing: Row | null = opts.existing ?? null;
  let storedNotes = opts.storedNotes ?? "";
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
    { match: (u: string) => u.includes("api.telegram.org"), respond: () => jsonResponse({ ok: true, result: { message_id: 1 } }) },
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "GET",
      respond: () => jsonResponse([convo]),
    },
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
        u.includes("/rest/v1/lead_events") && (init?.method ?? "GET") === "POST",
      respond: (_u: string, init?: RequestInit) => {
        w.leadEvents.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([], 200);
      },
    },
    // reuseHandoffLead's read of the FULL stored notes (id=eq.<id>&select=notes).
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/leads") && u.includes("id=eq.") && (init?.method ?? "GET") === "GET",
      respond: () => jsonResponse([{ notes: storedNotes }]),
    },
    // lookupOpenLead's read (phone=in.(…)).
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/leads") && u.includes("phone=in.") && (init?.method ?? "GET") === "GET",
      respond: () =>
        opts.lookupFails ? jsonResponse({ message: "boom" }, 500) : jsonResponse(existing ? [existing] : []),
    },
    {
      match: (u: string, init?: RequestInit) => u.includes("/rest/v1/leads") && init?.method === "PATCH",
      respond: (_u: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Row;
        w.leadsPatch.push(body);
        if (typeof body.notes === "string") storedNotes = body.notes; // the PATCH persists
        return jsonResponse([], 200);
      },
    },
    {
      match: (u: string, init?: RequestInit) => u.includes("/rest/v1/leads") && init?.method === "POST",
      respond: (_u: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Row;
        w.leadsInsert.push(body);
        if (opts.persistInsert) {
          existing = { id: "lead-1", status: "new", created_at: new Date().toISOString(), notes: body.notes };
          storedNotes = String(body.notes ?? "");
        }
        return jsonResponse([{ id: "lead-1" }], 201);
      },
    },
    { match: (u: string) => u.includes("/rest/v1/"), respond: () => jsonResponse([], 200) },
  ];
}

const HANDOFF_TEXT = "תן לי נציג בבקשה";

// ── THE production finding, as an assertion ──────────────────────────────────

Deno.test("FOUR consecutive hand-offs produce exactly ONE lead row", async () => {
  // This is the regression that put 13 rows in the CRM for one person. The first
  // request inserts; every repeat must find that lead and update it.
  const w = emptyWrites();
  await withFetchStub(routes(w, { persistInsert: true }), async () => {
    for (let i = 0; i < 4; i++) await postSigned(metaTextBody(HANDOFF_TEXT));
  });
  assertEquals(w.leadsInsert.length, 1, "exactly one INSERT across four hand-offs");
  assertEquals(w.leadsPatch.length, 3, "the other three reuse the open lead");
  // Every reuse repoints the contact at the surviving lead — this is what stopped
  // the orphaning, where each duplicate insert stole whatsapp_contacts.lead_id.
  assert(
    w.contactPatch.filter((b) => b.lead_id === "lead-1").length >= 3,
    "the contact keeps pointing at the surviving lead",
  );
});

// ── Open lead → reuse ────────────────────────────────────────────────────────

Deno.test("an OPEN lead is PATCHed, with zero inserts", async () => {
  for (const status of ["new", "contacted"]) {
    const w = emptyWrites();
    await withFetchStub(
      routes(w, { existing: { id: "lead-9", status, created_at: "2026-07-01T00:00:00Z", notes: "clipped snippet" } }),
      async () => {
        await postSigned(metaTextBody(HANDOFF_TEXT));
      },
    );
    assertEquals(w.leadsInsert.length, 0, `status '${status}' must not insert a duplicate`);
    assertEquals(w.leadsPatch.length, 1, `status '${status}' reuses the open lead`);
  }
});

Deno.test("reuse RE-ARMS the follow-up, so a repeat is visible without a new rep card", async () => {
  // A PATCH fires no Telegram card (the rep card is an AFTER-INSERT trigger), so
  // followup.ts followUpDue() is the only thing that puts the repeat in front of a
  // human: it needs follow_up_at <= now AND nudged_at unset/older.
  const w = emptyWrites();
  await withFetchStub(
    routes(w, { existing: { id: "lead-9", status: "new", created_at: "2026-07-01T00:00:00Z" } }),
    async () => {
      await postSigned(metaTextBody(HANDOFF_TEXT));
    },
  );
  assertEquals(w.leadsPatch.length, 1);
  const patch = w.leadsPatch[0];
  const due = Date.parse(String(patch.follow_up_at ?? ""));
  assert(Number.isFinite(due), "follow_up_at is set to a real timestamp");
  assert(due <= Date.now() + 1000, "…and it is already due, so the next pass pushes it");
  assertEquals(patch.nudged_at, null, "nudged_at cleared, else followUpDue treats it as already sent");
  // The 📜 lead history records the repeat even though no card was sent.
  const note = w.leadEvents.find((e) => e.lead_id === "lead-9");
  assert(note, `expected a lead_events row, got ${JSON.stringify(w.leadEvents)}`);
  assertStringIncludes(String(note.note ?? ""), "פנייה חוזרת");
});

Deno.test("reuse keeps the EARLIER brief and puts the newest request FIRST", async () => {
  // The rep must not lose the previous brief — but when the 1900-char budget runs
  // out it has to be the OLDER text that gets clipped, not the request just made.
  const w = emptyWrites();
  const previous = "פרטים קודמים שהנציג צריך: הלקוחה שאלה על סלולר בתקציב 60 ש\"ח";
  await withFetchStub(
    routes(w, {
      existing: { id: "lead-9", status: "new", created_at: "2026-07-01T00:00:00Z", notes: "clipped to 160" },
      storedNotes: previous,
    }),
    async () => {
      await postSigned(metaTextBody(HANDOFF_TEXT));
    },
  );
  const notes = String(w.leadsPatch[0].notes ?? "");
  assertStringIncludes(notes, "פנייה חוזרת");
  assertStringIncludes(notes, previous);
  assertStringIncludes(notes, "פנייה קודמת");
  // The full STORED notes are read back, not openLead.notes — that field is
  // pre-clipped to 160 chars for the prompt and PATCHing it back would destroy the
  // rest of the rep's brief.
  assertFalse(notes.includes("clipped to 160"), "the 160-char prompt snippet must not become the stored notes");
  assert(notes.length <= 1900, "stays under the DB gate's cap");
  assert(
    notes.indexOf("פנייה קודמת") > notes.indexOf(HANDOFF_TEXT),
    "the newest request comes BEFORE the older brief",
  );
});

// ── Closed lead → a new one ──────────────────────────────────────────────────

Deno.test("a CLOSED lead ('won'/'lost') inserts a NEW lead — a finished deal is never resurrected", async () => {
  for (const status of ["won", "lost"]) {
    const w = emptyWrites();
    await withFetchStub(
      routes(w, { existing: { id: "lead-old", status, created_at: "2026-06-01T00:00:00Z" } }),
      async () => {
        await postSigned(metaTextBody(HANDOFF_TEXT));
      },
    );
    assertEquals(w.leadsInsert.length, 1, `status '${status}' is a genuinely new enquiry`);
    assertEquals(w.leadsPatch.length, 0, `status '${status}' must not be reopened`);
  }
});

Deno.test("an UNRECOGNISED status is not reused — a duplicate beats swallowing the request", async () => {
  const w = emptyWrites();
  await withFetchStub(
    routes(w, { existing: { id: "lead-x", status: "some_new_stage", created_at: "2026-07-01T00:00:00Z" } }),
    async () => {
      await postSigned(metaTextBody(HANDOFF_TEXT));
    },
  );
  assertEquals(w.leadsInsert.length, 1);
  assertEquals(w.leadsPatch.length, 0);
});

// ── Fail-soft ────────────────────────────────────────────────────────────────

Deno.test("a FAILED lookup falls back to inserting, never to silence", async () => {
  const w = emptyWrites();
  await withFetchStub(routes(w, { lookupFails: true }), async () => {
    await postSigned(metaTextBody(HANDOFF_TEXT));
  });
  assertEquals(w.leadsInsert.length, 1, "a DB error must not swallow the hand-off");
  assert(w.graph.length >= 1, "the customer is still reassured");
});
