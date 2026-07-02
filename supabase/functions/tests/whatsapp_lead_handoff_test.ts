// Unit tests for the APP-HANDOFF / OPEN-LEAD AWARENESS wave:
//   • leadPhoneCandidates — every exact shape a WhatsApp phone could be stored
//     under in public.leads (webhook's "+E.164" vs the app/site national "05x").
//   • lookupOpenLead — newest-lead lookup, FAIL-SOFT (no env / DB error → null,
//     behavior identical to today) + the happy path via a fetch stub.
//   • leadStageText — TRUTH-ONLY leads.status → app-tracker stage wording
//     ('new'→1, 'contacted'→2, 'won'→4, 'lost'→closed; unknown → null, never
//     an invented stage).
//   • isLeadStatusInquiry — the app's prefilled deep-link pattern ("שלב…מתוך 4" /
//     "אשמח לעדכון" / "פנייה לגבי") + plain status asks; price questions do NOT trip it.
//   • buildActiveLeadSection — the persona section exists ONLY with a real lead,
//     carries the real stage, and surfaces an unknown status RAW (no fabrication).
//   • threading — runWhatsappAgent passes activeLead through to runAgent, and
//     runAgent folds the section into the ACTUAL Gemini system prompt.
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  type ActiveLead,
  buildActiveLeadSection,
  isLeadStatusInquiry,
  leadStageText,
  runAgent,
} from "../_shared/agent.ts";
import { runWhatsappAgent } from "../whatsapp-webhook/agent_runner.ts";
import type { RunAgentInput, RunAgentResult } from "../_shared/agent.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";
import { captureServeHandler, withFetchStub } from "./_capture_handler.ts";

// The webhook module reads env at top level; keep parity with the main webhook
// test rig (no WHATSAPP_TOKEN ⇒ every outbound send is a fail-soft null).
Deno.env.set("WHATSAPP_APP_SECRET", "test-app-secret-123");
Deno.env.set("WHATSAPP_VERIFY_TOKEN", "verify-tok");
Deno.env.delete("WHATSAPP_TOKEN");

// Capture the handler (stubs Deno.serve so no port binds), then pull the
// module's exported helpers from the now-cached module.
await captureServeHandler("../whatsapp-webhook/index.ts");
const { leadPhoneCandidates, lookupOpenLead } = await import("../whatsapp-webhook/index.ts");

const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
];

// The exact prefilled message the app's team-card deep-link sends.
const APP_HANDOFF_MSG = "היי, אני דנה. פנייה לגבי פרטנר — סיבים 1000 (שלב 2 מתוך 4). אשמח לעדכון.";

// ── leadPhoneCandidates ───────────────────────────────────────────────────────

Deno.test("leadPhoneCandidates: a wa_id (bare E.164) yields +E.164, bare, and national forms", () => {
  const c = leadPhoneCandidates("972505037537");
  assert(c.includes("+972505037537"), "webhook-handoff shape (+E.164)");
  assert(c.includes("972505037537"), "bare digits shape");
  assert(c.includes("0505037537"), "app/site national shape (05x…)");
});

Deno.test("leadPhoneCandidates: a national 0-leading phone yields itself + both IL E.164 shapes", () => {
  const c = leadPhoneCandidates("050-503-7537");
  assert(c.includes("0505037537"));
  assert(c.includes("+972505037537"));
  assert(c.includes("972505037537"));
});

Deno.test("leadPhoneCandidates: a non-IL, non-0 number matches only its exact digit forms (never guesses IL)", () => {
  const c = leadPhoneCandidates("14155552671");
  assertEquals(c.sort(), ["+14155552671", "14155552671"].sort());
  assertFalse(c.some((x) => x.includes("972")));
});

Deno.test("leadPhoneCandidates: junk / too-short / too-long input → [] (total, never throws)", () => {
  assertEquals(leadPhoneCandidates(""), []);
  assertEquals(leadPhoneCandidates("abc"), []);
  assertEquals(leadPhoneCandidates("123456"), []); // 6 digits < 7
  assertEquals(leadPhoneCandidates("123456789012345"), []); // 15 digits > 14
});

// ── lookupOpenLead — fail-soft + happy path ───────────────────────────────────

Deno.test("lookupOpenLead: no service-role env → null (fail-soft, identical to today)", async () => {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  try {
    assertEquals(await lookupOpenLead("972505037537"), null);
  } finally {
    if (prevUrl) Deno.env.set("SUPABASE_URL", prevUrl);
    else Deno.env.delete("SUPABASE_URL");
    if (prevKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
    else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
});

Deno.test("lookupOpenLead: a DB error (500) → null, never a throw", async () => {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://unit.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc-key");
  try {
    await withFetchStub([
      {
        match: (url) => url.includes("/rest/v1/leads"),
        respond: () => new Response("boom", { status: 500 }),
      },
    ], async () => {
      assertEquals(await lookupOpenLead("972505037537"), null);
    });
  } finally {
    if (prevUrl) Deno.env.set("SUPABASE_URL", prevUrl);
    else Deno.env.delete("SUPABASE_URL");
    if (prevKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
    else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
});

Deno.test("lookupOpenLead: newest lead comes back with status/created_at/clipped notes; query is phone-normalized + newest-first", async () => {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://unit.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc-key");
  try {
    const seen: string[] = [];
    await withFetchStub([
      {
        match: (url) => url.includes("/rest/v1/leads"),
        respond: (url) => {
          seen.push(url);
          return new Response(
            JSON.stringify([{
              status: "contacted",
              created_at: "2026-06-20T10:00:00Z",
              notes: "  שיחת   WhatsApp:\nלקוח: רוצה סיבים  " + "x".repeat(400),
            }]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      },
    ], async () => {
      const lead = await lookupOpenLead("972505037537");
      assert(lead, "lead found");
      assertEquals(lead!.status, "contacted");
      assertEquals(lead!.created_at, "2026-06-20T10:00:00Z");
      // Notes snippet is whitespace-collapsed + clipped (≤160) — no PII blob.
      assert(lead!.notes!.length <= 160);
      assertStringIncludes(lead!.notes!, "שיחת WhatsApp: לקוח: רוצה סיבים");
      // The query hits leads with the in.() candidates, newest first, limit 1.
      const q = decodeURIComponent(seen[0]);
      assertStringIncludes(q, 'phone=in.("');
      assertStringIncludes(q, "+972505037537");
      assertStringIncludes(q, "0505037537");
      assertStringIncludes(q, "order=created_at.desc");
      assertStringIncludes(q, "limit=1");
    });
  } finally {
    if (prevUrl) Deno.env.set("SUPABASE_URL", prevUrl);
    else Deno.env.delete("SUPABASE_URL");
    if (prevKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
    else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
});

Deno.test("lookupOpenLead: empty result (no lead) → null — never claims a lead exists", async () => {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://unit.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc-key");
  try {
    await withFetchStub([
      {
        match: (url) => url.includes("/rest/v1/leads"),
        respond: () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
      },
    ], async () => {
      assertEquals(await lookupOpenLead("972505037537"), null);
    });
  } finally {
    if (prevUrl) Deno.env.set("SUPABASE_URL", prevUrl);
    else Deno.env.delete("SUPABASE_URL");
    if (prevKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
    else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
});

// ── leadStageText — TRUTH-ONLY status → the app's stage language ──────────────

Deno.test("leadStageText maps exactly the app-tracker statuses; unknown → null (never invented)", () => {
  assertEquals(leadStageText("new"), "הפרטים נשלחו בהצלחה (שלב 1 מתוך 4)");
  assertEquals(leadStageText("contacted"), "נציג אישר את הבקשה (שלב 2 מתוך 4)");
  assertEquals(leadStageText("won"), "המעבר הושלם (שלב 4 מתוך 4)");
  assertEquals(leadStageText("lost"), "הפנייה נסגרה");
  assertEquals(leadStageText(" NEW "), leadStageText("new")); // trim + case-insensitive
  assertEquals(leadStageText("in_progress"), null); // unknown status → no stage claim
  assertEquals(leadStageText(""), null);
  assertEquals(leadStageText(undefined), null);
});

// ── isLeadStatusInquiry — the app's handoff pattern + plain status asks ────────

Deno.test("isLeadStatusInquiry matches the app's prefilled deep-link message", () => {
  assert(isLeadStatusInquiry(APP_HANDOFF_MSG));
});

Deno.test("isLeadStatusInquiry matches each app-pattern fragment on its own", () => {
  assert(isLeadStatusInquiry("אני בשלב 3 מתוך 4, מה הלאה?")); // שלב + מתוך 4
  assert(isLeadStatusInquiry("אשמח לעדכון"));
  assert(isLeadStatusInquiry("פנייה לגבי סלקום"));
});

Deno.test("isLeadStatusInquiry matches plain-language status asks", () => {
  assert(isLeadStatusInquiry("מה הסטטוס?"));
  assert(isLeadStatusInquiry("מה קורה עם הפנייה שלי?"));
  assert(isLeadStatusInquiry("מה מצב הבקשה?"));
});

Deno.test("isLeadStatusInquiry does NOT trip on ordinary sales/price questions", () => {
  assertFalse(isLeadStatusInquiry("כמה עולה סלולר בפרטנר?"));
  assertFalse(isLeadStatusInquiry("תמליץ לי על מסלול אינטרנט עד 100 שקל"));
  assertFalse(isLeadStatusInquiry("היי"));
  assertFalse(isLeadStatusInquiry(""));
});

// ── buildActiveLeadSection — truth-only persona section ───────────────────────

Deno.test("buildActiveLeadSection: no lead / no status → '' (prompt unchanged, nothing invented)", () => {
  assertEquals(buildActiveLeadSection(null, APP_HANDOFF_MSG), "");
  assertEquals(buildActiveLeadSection(undefined, APP_HANDOFF_MSG), "");
  assertEquals(buildActiveLeadSection({ status: "  " }, APP_HANDOFF_MSG), "");
});

Deno.test("buildActiveLeadSection: a real lead yields the real stage + the acknowledge-first rule", () => {
  const lead: ActiveLead = { status: "new", created_at: "2026-06-20T10:00:00Z", notes: "רוצה סיבים" };
  const s = buildActiveLeadSection(lead, "מה קורה עם הפנייה שלי?");
  assertStringIncludes(s, "הפרטים נשלחו בהצלחה (שלב 1 מתוך 4)");
  assertStringIncludes(s, "2026-06-20");
  assertStringIncludes(s, "רוצה סיבים");
  assertStringIncludes(s, "escalate_to_human"); // offer the existing human handoff path
  assertStringIncludes(s, "ואל תתחיל/י מחדש שיחת מכירה"); // no sales-pitch restart
  // The current message IS a status inquiry → the explicit open-with-stage line.
  assertStringIncludes(s, "ההודעה הנוכחית נראית כשאלת סטטוס");
});

Deno.test("buildActiveLeadSection: a NEW (non-status) question keeps the context available without the inquiry line", () => {
  const s = buildActiveLeadSection({ status: "contacted" }, "כמה עולה סלולר בפרטנר?");
  assertStringIncludes(s, "נציג אישר את הבקשה (שלב 2 מתוך 4)");
  assertFalse(s.includes("ההודעה הנוכחית נראית כשאלת סטטוס"));
});

Deno.test("buildActiveLeadSection: an UNKNOWN status is surfaced RAW — no fabricated stage", () => {
  const s = buildActiveLeadSection({ status: "in_progress" }, APP_HANDOFF_MSG);
  assertStringIncludes(s, '"in_progress"');
  assertFalse(s.includes("מתוך 4)")); // no invented stage-N wording
  assertFalse(s.includes("נשלחו בהצלחה"));
  assertFalse(s.includes("הושלם"));
});

// ── threading: runWhatsappAgent → runAgent → the actual Gemini system prompt ──

Deno.test("runWhatsappAgent threads activeLead through to runAgent", async () => {
  const seen: (ActiveLead | undefined)[] = [];
  const fakeRunAgent = (input: RunAgentInput): Promise<RunAgentResult> => {
    seen.push(input.activeLead);
    return Promise.resolve({ reply: "ok", via: "text", toolCalls: [], timedOut: false });
  };
  const lead: ActiveLead = { status: "contacted", created_at: "2026-06-20T10:00:00Z" };
  const r = await runWhatsappAgent({
    sessionKey: "", // stateless — no session I/O
    message: APP_HANDOFF_MSG,
    plans: PLANS,
    keys: {},
    deps: {
      logCrmEvent: () => {},
      logSecurityEvent: () => {},
      captureLead: () => Promise.resolve("incomplete" as const),
      escalate: () => false,
    },
    activeLead: lead,
    runAgentFn: fakeRunAgent as typeof runAgent,
  });
  assertEquals(r.reply, "ok");
  assertEquals(seen.length, 1);
  assertEquals(seen[0], lead);
});

Deno.test("runAgent folds the activeLead section into the REAL Gemini system prompt", async () => {
  const bodies: string[] = [];
  await withFetchStub([
    {
      match: (url) => url.includes("generativelanguage") || url.includes("googleapis"),
      respond: (_url, init) => {
        bodies.push(typeof init?.body === "string" ? init.body : "");
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "הבקשה שלך בשלב 2 — נציג אישר אותה." }] } }] }),
          { status: 200 },
        );
      },
    },
  ], async () => {
    const res = await runAgent({
      channel: "whatsapp",
      message: APP_HANDOFF_MSG,
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
      activeLead: { status: "contacted", created_at: "2026-06-20T10:00:00Z", notes: "סיבים 1000" },
    });
    assert(res.reply.length > 0);
    // The FIRST Gemini request body carries the truth-only lead section.
    const body = bodies[0] ?? "";
    assertStringIncludes(body, "נציג אישר את הבקשה");
    assertStringIncludes(body, "ההודעה הנוכחית נראית כשאלת סטטוס"); // the app pattern was detected
  });
});

Deno.test("runAgent WITHOUT an activeLead never mentions a lead/stage (truth-only)", async () => {
  const bodies: string[] = [];
  await withFetchStub([
    {
      match: (url) => url.includes("generativelanguage") || url.includes("googleapis"),
      respond: (_url, init) => {
        bodies.push(typeof init?.body === "string" ? init.body : "");
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "שלום! איך אפשר לעזור?" }] } }] }),
          { status: 200 },
        );
      },
    },
  ], async () => {
    await runAgent({
      channel: "whatsapp",
      message: "שלום",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
    });
    const body = bodies[0] ?? "";
    assertFalse(body.includes("פנייה פעילה במערכת"));
    assertFalse(body.includes("נציג אישר את הבקשה"));
  });
});
