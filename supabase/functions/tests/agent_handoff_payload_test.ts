// Unit tests for the AGENT → CRM HAND-OFF PAYLOAD wave.
//
// THE DEFECT THESE PIN: the rep opened every escalated call on two exchanges of
// chat and nothing else, while the agent's session already held the customer's
// category, budget, the plans they explicitly REJECTED and the objections they
// raised in their own words. escalate_to_human's only parameter is a free-text
// `reason`, so none of it could travel — and that paraphrase was then written
// into the lead under the label "הודעה אחרונה", so the line claiming to be what
// the customer last said was actually the model's summary of it.
//
// Covered here:
//   • buildHandoffFacts   — the canonical Hebrew fact block, truth-only (a slot
//     that holds nothing emits no line) and catalogue-resolved (a rejected plan
//     id becomes "ספק — מסלול"; an unknown id is dropped, never printed raw).
//   • buildHandoffNotes   — facts FIRST (the Telegram card clips notes at 700
//     chars, so ordering decides what the rep actually reads), the customer's
//     REAL message under "הודעה אחרונה", the model's paraphrase honestly
//     relabelled, and the deterministic path unchanged.
//   • leadSourceForChannel / SOURCE prefix — a WhatsApp lead must land as
//     source="whatsapp", because leadKeyboard gates the 🤝 live-takeover buttons
//     on isWhatsappLead(); "advisor" silently costs the rep that control.
//   • parseCallbackSlot / callback_time — the spoken slot must reach the COLUMN
//     followup.ts callbackDue() switches on, or the ⏰ callback ping never fires.
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { buildHandoffFacts, type HandoffContext } from "../whatsapp-webhook/agent_runner.ts";
import {
  buildAiLeadRow,
  isWhatsappLead,
  leadSourceForChannel,
  normalizeCallbackTime,
  parseCallbackSlot,
} from "../_shared/leads.ts";
import type { ChatTurn } from "../_shared/ai.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";
import { captureServeHandler } from "./_capture_handler.ts";

Deno.env.set("WHATSAPP_APP_SECRET", "test-app-secret-123");
Deno.env.set("WHATSAPP_VERIFY_TOKEN", "verify-tok");
Deno.env.delete("WHATSAPP_TOKEN");
await captureServeHandler("../whatsapp-webhook/index.ts");
const { buildHandoffNotes } = await import("../whatsapp-webhook/index.ts");

const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29, noCommit: true },
];

const TURNS: ChatTurn[] = [
  { role: "user", text: "מה יש לכם בסלולר?" },
  { role: "bot", text: "יש כמה אפשרויות" },
  { role: "user", text: "יקר לי" },
  { role: "bot", text: "יש גם זול יותר" },
  { role: "user", text: "תעבירו אותי לנציג" },
];

// ── buildHandoffFacts ────────────────────────────────────────────────────────

Deno.test("buildHandoffFacts renders the slots the rep needs, in Hebrew", () => {
  const facts = buildHandoffFacts(
    { category: "cellular", budget: 50, abroad: true, rejectedPlanIds: ["c1"], objections: ["מחיר", "התחייבות"] },
    PLANS,
  );
  assertStringIncludes(facts, "קטגוריה: סלולר");
  assertStringIncludes(facts, "עד ₪50");
  assertStringIncludes(facts, 'חו"ל');
  // The rejected plan is named, not printed as an opaque id.
  assertStringIncludes(facts, "סלקום — 5G 100GB");
  assertFalse(facts.includes("c1"), "a raw catalogue id tells a human nothing");
  assertStringIncludes(facts, "התנגדויות: מחיר · התחייבות");
});

Deno.test("buildHandoffFacts is truth-only: empty slots produce NOTHING", () => {
  assertEquals(buildHandoffFacts({}, PLANS), "");
  // A slot present but empty/zero is still nothing to say.
  assertEquals(buildHandoffFacts({ budget: 0, objections: [], rejectedPlanIds: [] }, PLANS), "");
});

Deno.test("buildHandoffFacts drops a rejected id with no catalogue row (never prints it raw)", () => {
  const facts = buildHandoffFacts({ rejectedPlanIds: ["ghost-plan"] }, PLANS);
  assertEquals(facts, "", "an unresolvable id is dropped, not surfaced as noise");
});

Deno.test("buildHandoffFacts surfaces the bill hint the customer's photo already gave us", () => {
  const withBill = buildHandoffFacts({}, PLANS, { provider: "HOT", monthly: 120 });
  assertStringIncludes(withBill, "חשבון נוכחי: ₪120 (HOT)");
  // Provider known but no figure → say only what we know.
  const providerOnly = buildHandoffFacts({}, PLANS, { provider: "HOT" });
  assertStringIncludes(providerOnly, "ספק נוכחי: HOT");
  assertFalse(providerOnly.includes("₪"), "no invented amount");
});

Deno.test("buildHandoffFacts phrasing is the one rep-brief parses back out of notes", async () => {
  const { parseNeed } = await import("../rep-brief/rep_brief.ts");
  const facts = buildHandoffFacts({ category: "cellular", budget: 50 }, PLANS);
  const need = parseNeed({ notes: facts });
  assertEquals(need.category, "cellular", "the call brief re-derives the category from these lines");
  assertEquals(need.budget, 50, "…and the budget");
});

// ── buildHandoffNotes ────────────────────────────────────────────────────────

Deno.test("buildHandoffNotes puts the facts FIRST — the card clips at 700 chars", () => {
  const handoff: HandoffContext = {
    lastMessage: "תעבירו אותי לנציג",
    facts: buildHandoffFacts({ category: "cellular", budget: 50 }, PLANS),
  };
  const notes = buildHandoffNotes("הלקוח מתוסכל ומבקש אדם", TURNS, handoff);
  const factsAt = notes.indexOf("קטגוריה: סלולר");
  const transcriptAt = notes.indexOf("שיחת WhatsApp:");
  assert(factsAt >= 0 && transcriptAt >= 0);
  assert(factsAt < transcriptAt, "facts must land inside the card's 700-char window");
});

Deno.test("buildHandoffNotes labels the customer's REAL message, not the model's paraphrase", () => {
  const handoff: HandoffContext = { lastMessage: "תעבירו אותי לנציג", facts: "" };
  const notes = buildHandoffNotes("הלקוח מתוסכל ומבקש אדם", TURNS, handoff);
  assertStringIncludes(notes, "הודעה אחרונה: תעבירו אותי לנציג");
  // The paraphrase is kept — but honestly relabelled as WHY we escalated.
  assertStringIncludes(notes, "סיבת ההעברה: הלקוח מתוסכל ומבקש אדם");
});

Deno.test("buildHandoffNotes carries more than two exchanges", () => {
  const notes = buildHandoffNotes("נציג", TURNS, { lastMessage: "נציג", facts: "" });
  // The oldest turn used to fall outside the 4-entry window.
  assertStringIncludes(notes, "מה יש לכם בסלולר?");
});

Deno.test("buildHandoffNotes: the DETERMINISTIC path (no handoff) is unchanged", () => {
  const notes = buildHandoffNotes("אני רוצה נציג", TURNS);
  assertStringIncludes(notes, "הודעה אחרונה: אני רוצה נציג");
  assertFalse(notes.includes("סיבת ההעברה"), "no paraphrase exists on this path");
  assertFalse(notes.includes("מה שכבר ידוע"), "no session facts on this path");
});

Deno.test("buildHandoffNotes stays under the leads gate's notes cap", () => {
  const long: ChatTurn[] = Array.from({ length: 12 }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "bot") as ChatTurn["role"],
    text: "מ".repeat(400),
  }));
  const notes = buildHandoffNotes("x".repeat(300), long, { lastMessage: "y".repeat(300), facts: "z".repeat(300) });
  assert(notes.length <= 1400, `notes ${notes.length} must stay well under the DB gate's 2000`);
});

// ── channel → source ─────────────────────────────────────────────────────────

Deno.test("leadSourceForChannel maps each channel; anything unknown stays 'advisor'", () => {
  assertEquals(leadSourceForChannel("whatsapp"), "whatsapp");
  assertEquals(leadSourceForChannel("telegram"), "telegram");
  assertEquals(leadSourceForChannel("site"), "advisor");
  assertEquals(leadSourceForChannel("app"), "advisor");
  assertEquals(leadSourceForChannel(undefined), "advisor", "the pre-existing default");
  assertEquals(leadSourceForChannel("carrier-pigeon"), "advisor");
});

Deno.test("a WhatsApp capture lands as source=whatsapp — which is what gives the rep the 🤝 takeover row", () => {
  const row = buildAiLeadRow({ name: "דנה כהן", phone: "0501234567", consent: true, channel: "whatsapp" });
  assert(row);
  assertEquals(row.source, "whatsapp");
  // leadKeyboard gates the live-takeover buttons on exactly this predicate.
  assert(isWhatsappLead({ ...row, id: "x", status: "new" } as never));
  // …and the notes must not claim the conversation happened on the site.
  assertStringIncludes(row.notes ?? "", "בוואטסאפ");
  assertFalse((row.notes ?? "").includes("באתר"));
});

Deno.test("a site capture is byte-identical to the pre-existing behaviour", () => {
  const row = buildAiLeadRow({ name: "דנה כהן", phone: "0501234567", consent: true });
  assert(row);
  assertEquals(row.source, "advisor");
  assertStringIncludes(row.notes ?? "", "נוצר משיחת Switchy AI באתר");
});

Deno.test("a Telegram capture is labelled Telegram, not the site", () => {
  const row = buildAiLeadRow({ name: "דנה כהן", phone: "0501234567", consent: true, channel: "telegram" });
  assert(row);
  assertEquals(row.source, "telegram");
  assertStringIncludes(row.notes ?? "", "בטלגרם");
});

// ── callback_time ────────────────────────────────────────────────────────────

Deno.test("normalizeCallbackTime accepts ONLY the four windows callbackDue switches on", () => {
  for (const v of ["now", "noon", "evening", "tomorrow"]) assertEquals(normalizeCallbackTime(v), v);
  for (const v of ["בערב", "soon", "", null, undefined, "EVENINGS"]) {
    assertEquals(normalizeCallbackTime(v), null, `${v} would render as a phantom window`);
  }
});

Deno.test("parseCallbackSlot maps what the customer actually says", () => {
  assertEquals(parseCallbackSlot("בערב"), "evening");
  assertEquals(parseCallbackSlot("בצהריים"), "noon");
  assertEquals(parseCallbackSlot("מחר"), "tomorrow");
  assertEquals(parseCallbackSlot("עכשיו"), "now");
  assertEquals(parseCallbackSlot("evening"), "evening");
  // The DAY constraint is the stronger promise — "מחר בערב" is tomorrow.
  assertEquals(parseCallbackSlot("מחר בערב"), "tomorrow");
});

Deno.test("parseCallbackSlot refuses to guess — an unrecognised phrase yields no window", () => {
  for (const v of ["ביום ראשון", "כשנוח לכם", "", "12:45"]) {
    assertEquals(parseCallbackSlot(v), null, "a guessed window pings the rep at a time nobody asked for");
  }
});

Deno.test("a booked slot reaches the COLUMN, not just the notes", () => {
  const row = buildAiLeadRow({
    name: "דנה כהן",
    phone: "0501234567",
    consent: true,
    channel: "whatsapp",
    callback_time: "evening",
    notes: "מועד מועדף: בערב",
  });
  assert(row);
  // Without this the card reads "⏰ זמן חזרה מועדף: —" and followup.ts
  // callbackDue() hits default:false, so the ⏰ ping never fires.
  assertEquals(row.callback_time, "evening");
});

Deno.test("a lead with no slot has a NULL window (never a fabricated one)", () => {
  const row = buildAiLeadRow({ name: "דנה כהן", phone: "0501234567", consent: true });
  assert(row);
  assertEquals(row.callback_time, null);
});
