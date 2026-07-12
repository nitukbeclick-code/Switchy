// Unit tests for the whatsapp-webhook intent classification (whatsapp-webhook/
// intents.ts) — the regexes + routing that decide whether an inbound message is a
// human handoff, a recommendation, a greeting, or plain catalogue Q&A. These pin
// the regexes' ACTUAL behaviour, including two Hebrew quirks worth knowing about
// (see the greeting + recommend tests). Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  classifyTextIntent,
  FIRST_CONTACT_NOTICE,
  isOptedOut,
  messageText,
  OPTOUT_CONFIRM_REPLY,
  RE_GREETING,
  RE_HANDOFF,
  RE_RECOMMEND,
  withFirstContactNotice,
} from "../whatsapp-webhook/intents.ts";
// §30A opt-out + Amendment-13 detectors are now unified in _shared/compliance.ts —
// the webhook imports them from there, so the tests pin them at that source too.
import {
  isDataAccessRequest,
  isErasureRequest,
  isOptOut,
} from "../_shared/compliance.ts";

// The HMAC App-Secret must be set BEFORE the module is imported (read into
// APP_SECRET at top level). A known value lets a test forge a VALID signature so
// the POST path runs end-to-end through the capture-handler rig below.
const WA_APP_SECRET = "test-app-secret-123";
Deno.env.set("WHATSAPP_APP_SECRET", WA_APP_SECRET);
Deno.env.set("WHATSAPP_VERIFY_TOKEN", "verify-tok");
// No WHATSAPP_TOKEN ⇒ every outbound send returns null (fail-soft), so the
// handler never actually calls the Graph API during these tests.
Deno.env.delete("WHATSAPP_TOKEN");

import { __resetRateLimitForTests } from "../_shared/ratelimit.ts";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

// Capture the Deno.serve handler WITHOUT binding a port (Deno.serve is stubbed
// during the dynamic import). We then pull the module's named pure helpers from
// the now-cached module — importing them statically would run the module's
// top-level Deno.serve against the REAL Deno.serve (binding a port + defeating the
// capture), so both the handler and the helpers come through this one import.
const waHandler = await captureServeHandler("../whatsapp-webhook/index.ts");
const {
  capInbound,
  senderBurstOk,
  buildHandoffReply,
  handleOptOut,
  botEnabled,
  humanTakeoverActive,
  HUMAN_TAKEOVER_FRESH_MS,
  deriveHistoryAndFirstContact,
  parseContentRangeCount,
  shouldSendRateNotice,
  __resetRateNoticeForTests,
  extractWebhookEvents,
  parseStatusReceipt,
  receiptStatusFilter,
} = await import(
  "../whatsapp-webhook/index.ts"
);
// §7b disclosure constant — the single source of truth the handoff replies reuse.
import { COMMISSION_DISCLOSURE } from "../_shared/tools.ts";

// ── opt-out / STOP — the UNIFIED §30A detector (_shared/compliance.ts) ─────────
// The webhook now routes opt-out through compliance.isOptOut, the BROAD
// contains-match union (he/en/ar/ru + multi-word + slash). §30A errs toward
// CATCHING an opt-out: a missed one is an illegal proactive contact, a
// false-positive merely sends one confirmation and stops.

Deno.test("isOptOut matches Hebrew unsubscribe verbs", () => {
  assert(isOptOut("הסר"));
  assert(isOptOut("הסירו אותי מהרשימה"));
  assert(isOptOut("אני רוצה להסיר"));
  assert(isOptOut("עצור"));
  assert(isOptOut("תפסיקו לשלוח לי הודעות"));
  assert(isOptOut("ביטול"));
  assert(isOptOut("בטל מנוי"));
  assert(isOptOut("אל תשלח לי יותר"));
  assert(isOptOut("לא לשלוח"));
});

Deno.test("isOptOut matches a MULTI-WORD Hebrew opt-out (the §30A broad rule)", () => {
  // The whole point of the unified contains-match: a politely-phrased multi-word
  // request still opts out, where the old narrowly-anchored regex could miss it.
  assert(isOptOut("אנא הסירו אותי מהרשימה"));
});

Deno.test("isOptOut matches the universal English carriers + slash forms", () => {
  assert(isOptOut("STOP"));
  assert(isOptOut("stop"));
  assert(isOptOut("please unsubscribe"));
  assert(isOptOut("CANCEL"));
  assert(isOptOut("/stop"));
});

Deno.test("isOptOut does NOT fire on ordinary catalogue / chat messages", () => {
  // None of these contain an opt-out keyword — they must reach the normal AI flow.
  assertFalse(isOptOut("כמה עולה סלולר?"));
  assertFalse(isOptOut("מה המסלול הזול ביותר"));
  assertFalse(isOptOut("רוצה לדבר עם נציג"));
  assertFalse(isOptOut("תמליצו לי על מסלול"));
  assertFalse(isOptOut("שלום, מה שלומך"));
  assertFalse(isOptOut(""));
  assertFalse(isOptOut("   "));
});

// ── opted-out contact guard (outbound path) ───────────────────────────────────

Deno.test("isOptedOut recognises the opted_out contact status only", () => {
  assert(isOptedOut("opted_out"));
  assert(isOptedOut("OPTED_OUT"));
  assertFalse(isOptedOut("new"));
  assertFalse(isOptedOut("active"));
  assertFalse(isOptedOut("handed_off"));
  assertFalse(isOptedOut(null));
  assertFalse(isOptedOut(undefined));
});

// ── §11 first-contact privacy notice gate ─────────────────────────────────────

Deno.test("withFirstContactNotice appends the notice ONLY on the first inbound", () => {
  const reply = "היי, אני העוזר החכם של Switchy AI";
  // First contact → reply + notice, separated by a blank line.
  const first = withFirstContactNotice(reply, true);
  assertStringIncludes(first, reply);
  assertStringIncludes(first, FIRST_CONTACT_NOTICE);
  // Later messages → reply returned unchanged (notice shown exactly once).
  assertEquals(withFirstContactNotice(reply, false), reply);
});

Deno.test("the first-contact notice carries the required §11 disclosures", () => {
  // Brand identity, the privacy-policy URL, and the opt-out keyword.
  assertStringIncludes(FIRST_CONTACT_NOTICE, "Switchy AI");
  assertStringIncludes(FIRST_CONTACT_NOTICE, "https://app.switchy-ai.com/privacy");
  assertStringIncludes(FIRST_CONTACT_NOTICE, "הסר");
  // The opt-out keyword in the notice is itself a real opt-out trigger.
  assert(isOptOut("הסר"));
});

Deno.test("withFirstContactNotice falls back to just the notice on an empty reply", () => {
  assertEquals(withFirstContactNotice("", true), FIRST_CONTACT_NOTICE);
});

Deno.test("the opt-out confirmation reply is a single, clear Hebrew message", () => {
  assertStringIncludes(OPTOUT_CONFIRM_REPLY, "הוסרת מרשימת הדיוור");
  assertStringIncludes(OPTOUT_CONFIRM_REPLY, "לא נשלח אליך הודעות יזומות");
  // And it invites re-engagement (the person can always write again).
  assertStringIncludes(OPTOUT_CONFIRM_REPLY, "אפשר לכתוב שוב");
});

// ── handoff regex ─────────────────────────────────────────────────────────────

Deno.test("RE_HANDOFF matches requests to reach a human, not catalogue questions", () => {
  assert(RE_HANDOFF.test("אפשר לדבר עם נציג?"));
  assert(RE_HANDOFF.test("רוצה לדבר עם בן אדם"));
  assert(RE_HANDOFF.test("תתקשרו אליי בבקשה"));
  assert(RE_HANDOFF.test("מישהו אמיתי בבקשה"));
  assertFalse(RE_HANDOFF.test("כמה עולה סלולר?"));
  assertFalse(RE_HANDOFF.test("מה המסלול הזול ביותר"));
});

// ── recommend regex ───────────────────────────────────────────────────────────

Deno.test("RE_RECOMMEND matches advisor asks", () => {
  assert(RE_RECOMMEND.test("מה הכי משתלם?"));
  assert(RE_RECOMMEND.test("איזה מסלול מתאים לי"));
  assert(RE_RECOMMEND.test("מצא לי משהו זול"));
  assert(RE_RECOMMEND.test("מה כדאי לי לקחת"));
  assertFalse(RE_RECOMMEND.test("שלום, מה שלומך"));
});

Deno.test("RE_RECOMMEND's 'תמליצ' stem matches inflected forms, not the final-tsadi imperative", () => {
  // The stem uses a NON-final tsadi (צ), so mid-word inflections match…
  assert(RE_RECOMMEND.test("תמליצו לי על מסלול"));
  assert(RE_RECOMMEND.test("תמליצי לי בבקשה"));
  // …but the bare imperative "תמליץ" ends in a FINAL tsadi (ץ) — a different
  // Unicode char — so it does NOT match the stem on its own.
  assertFalse(RE_RECOMMEND.test("תמליץ"));
});

// ── greeting regex ────────────────────────────────────────────────────────────

Deno.test("RE_GREETING matches the ASCII openers at the start, case-insensitively", () => {
  assert(RE_GREETING.test("hi"));
  assert(RE_GREETING.test("Hello there"));
  assert(RE_GREETING.test("START"));
  assert(RE_GREETING.test("help me"));
  // A greeting word mid-sentence doesn't count — the pattern is anchored with ^.
  assertFalse(RE_GREETING.test("please say hi"));
});

Deno.test("RE_GREETING's \\b never fires after the Hebrew openers (a known quirk)", () => {
  // JS \b is a boundary between a [A-Za-z0-9_] char and a non-word char. Hebrew
  // letters are 'non-word' to \b, so "^…היי\b" can never find a boundary right
  // after an all-Hebrew opener — these inputs are classified as plain Q&A, NOT
  // greeting. Pinned so a future regex fix is a deliberate, visible change.
  assertFalse(RE_GREETING.test("היי"));
  assertFalse(RE_GREETING.test("שלום"));
  assertFalse(RE_GREETING.test("מה נשמע"));
});

// ── classifyTextIntent: the routing decision ──────────────────────────────────

Deno.test("classifyTextIntent routes handoff > recommend > greeting > qa", () => {
  assertEquals(classifyTextIntent("אפשר נציג אנושי?"), "human");
  assertEquals(classifyTextIntent("מה הכי משתלם לי?"), "recommend");
  assertEquals(classifyTextIntent("hello"), "greeting");
  assertEquals(classifyTextIntent("כמה עולה אינטרנט 1 גיגה?"), "qa");
});

Deno.test("classifyTextIntent: handoff wins even when other cues are present", () => {
  // Contains a recommend cue ("מה הכי") AND a handoff cue ("נציג") — handoff wins.
  assertEquals(classifyTextIntent("מה הכי משתלם? ואם אפשר חבר אותי לנציג"), "human");
});

Deno.test("classifyTextIntent: an all-Hebrew greeting falls through to qa (the \\b quirk)", () => {
  // Consistent with the RE_GREETING quirk above: "היי" alone is qa, not greeting.
  assertEquals(classifyTextIntent("היי"), "qa");
  assertEquals(classifyTextIntent("  היי  "), "qa");
});

Deno.test("classifyTextIntent trims and handles empty input", () => {
  assertEquals(classifyTextIntent("   "), "qa");
  assertEquals(classifyTextIntent(""), "qa");
});

// ── messageText: pulling text out of the Meta envelope ────────────────────────

Deno.test("messageText reads text.body for text messages", () => {
  assertEquals(messageText({ type: "text", text: { body: "שלום" } }), "שלום");
  // Default type is "text".
  assertEquals(messageText({ text: { body: "ללא type" } }), "ללא type");
});

Deno.test("messageText reads image.caption for image messages", () => {
  assertEquals(messageText({ type: "image", image: { caption: "החשבון שלי" } }), "החשבון שלי");
  // An image with no caption collapses to "".
  assertEquals(messageText({ type: "image", image: { id: "media-1" } }), "");
});

Deno.test("messageText is tolerant of a malformed/empty envelope", () => {
  assertEquals(messageText({}), "");
  assertEquals(messageText({ type: "text" }), "");
});

// ── HARDEN: inbound input cap (capInbound) ─────────────────────────────────────
// A cheap runaway-token guard: the inbound text/caption/transcript fed to the
// (paid) agent is TRUNCATED to MAX_INBOUND_TEXT (2000). Truncation, not rejection,
// so the bot still answers; the DB row is separately clipped to 4000.

Deno.test("HARDEN: capInbound truncates oversize input to the agent cap (2000)", () => {
  const big = "א".repeat(5000);
  const out = capInbound(big);
  assertEquals(out.length, 2000);
  assert(big.startsWith(out), "the cap keeps the START of the message");
});

Deno.test("HARDEN: capInbound is a no-op for normal-length input and total on junk", () => {
  assertEquals(capInbound("כמה עולה סלולר?"), "כמה עולה סלולר?");
  assertEquals(capInbound(""), "");
  // Never throws on a non-string coerced by the caller.
  assertEquals(capInbound(undefined as unknown as string), "");
});

// ── HARDEN: per-sender burst shed is fail-soft (senderBurstOk) ─────────────────
// A SECOND layer in front of the per-contact hourly DB cap: a process-local
// fixed-window shed that drops a tight loop BEFORE any DB/AI work. The clock is
// injectable so no timers are needed; the limiter never drops a legitimate first
// message and reopens once the window rolls.

Deno.test("HARDEN: senderBurstOk allows a normal conversation, sheds a flood, reopens next window", () => {
  __resetRateLimitForTests();
  const t0 = 1_000_000;
  // The generous limit (20/min) admits a normal back-and-forth…
  for (let i = 0; i < 20; i++) {
    assert(senderBurstOk("972500000001", t0), `message ${i + 1} should be allowed`);
  }
  // …and sheds the 21st within the same window (abuse only).
  assertFalse(senderBurstOk("972500000001", t0), "the over-cap message in-window is shed");
  // A distinct sender has its OWN bucket — one flood can't starve everyone.
  assert(senderBurstOk("972500000002", t0), "a different sender is unaffected");
  // The very next window reopens the original sender.
  assert(senderBurstOk("972500000001", t0 + 61_000), "the window rolls and reopens");
  __resetRateLimitForTests();
});

// ── HARDEN: obs wrapper never changes the response (handshake + signature gate) ─
// The top-level handler is wrapped so an unexpected throw is fire-and-forwarded to
// captureError and STILL returns a fail-soft response. We pin that the wrapper is
// transparent: every response contract Meta + the verification handshake depend on
// is byte-for-byte unchanged. (waHandler is captured once at the top of the file.)

async function signBody(raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WA_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

Deno.test("HARDEN: GET verification handshake echoes the challenge (200) — unchanged", async () => {
  const r = await Promise.resolve(
    waHandler(
      new Request("https://edge/wa?hub.mode=subscribe&hub.verify_token=verify-tok&hub.challenge=42", { method: "GET" }),
    ),
  );
  assertEquals(r.status, 200);
  assertEquals(await r.text(), "42");
});

Deno.test("HARDEN: GET with a wrong verify token is rejected (403) — unchanged", async () => {
  const r = await Promise.resolve(
    waHandler(
      new Request("https://edge/wa?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=42", { method: "GET" }),
    ),
  );
  assertEquals(r.status, 403);
});

Deno.test("HARDEN: POST with a bad/missing signature stays 401 — guard chain preserved", async () => {
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "x", id: "m1", type: "text" }] } }] }] });
  // No signature header at all.
  const r1 = await Promise.resolve(
    waHandler(new Request("https://edge/wa", { method: "POST", body: raw })),
  );
  assertEquals(r1.status, 401);
  // A present-but-wrong signature.
  const r2 = await Promise.resolve(
    waHandler(new Request("https://edge/wa", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body: raw,
    })),
  );
  assertEquals(r2.status, 401);
});

Deno.test("HARDEN: a VALID signature with no messages returns the 200 {ok:true} contract (no throw)", async () => {
  // A signed event carrying no `messages` (e.g. a status callback) does no DB/AI
  // work and must return the exact 200 {ok:true} body Meta expects — proving the
  // obs wrapper passes the success contract through untouched.
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "s1" }] } }] }] });
  const sig = await signBody(raw);
  const r = await Promise.resolve(
    waHandler(new Request("https://edge/wa", {
      method: "POST",
      headers: { "x-hub-signature-256": sig },
      body: raw,
    })),
  );
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { ok: true });
});

// ── §7b: the deterministic human-handoff replies carry the commission disclosure ─
// A hand-off reaches a commission-bearing rep, so BOTH the success reply and the
// rate-limited fallback MUST prepend the SAME COMMISSION_DISCLOSURE create_lead
// surfaces (Switchy may earn a commission). Pinned via the exported pure builder so
// the disclosure can never be silently dropped from either branch.

Deno.test("§7b: buildHandoffReply prepends the commission disclosure on the SUCCESS reply", () => {
  const reply = buildHandoffReply(true);
  // The disclosure leads the message (mirrors create_lead's note).
  assert(reply.startsWith(COMMISSION_DISCLOSURE), "disclosure leads the success handoff reply");
  assertStringIncludes(reply, "עמלה"); // the disclosure mentions a commission
  // (a) a human rep will get back to the customer soon, AND…
  assertStringIncludes(reply, "יחזור/תחזור אליך בהקדם");
  // (b) …the assistant stays available meanwhile (the bot is NOT going silent).
  assertStringIncludes(reply, "בינתיים אני כאן");
});

Deno.test("§7b: buildHandoffReply prepends the disclosure on the rate-limited fallback too", () => {
  const reply = buildHandoffReply(false);
  assert(reply.startsWith(COMMISSION_DISCLOSURE), "disclosure leads the fallback handoff reply");
  assertStringIncludes(reply, "עמלה");
  // The existing insert-blocked reassurance copy is kept verbatim.
  assertStringIncludes(reply, "רשמתי שתרצה/י לדבר עם נציג");
});

Deno.test("§7b: NEITHER handoff branch can omit the disclosure (both contain it)", () => {
  for (const ok of [true, false]) {
    assertStringIncludes(
      buildHandoffReply(ok),
      COMMISSION_DISCLOSURE,
      `handoff reply (ok=${ok}) must carry the §7b disclosure`,
    );
  }
});

// ── Privacy: the opt-out breadcrumb log carries NO phone (PII) ──────────────────
// handleOptOut's final jlog line must be { at: "wa.optout", ok: true } — the phone
// is the data subject and lives in the durable marketing_suppression record + the
// security_audit_log row, NOT in the operational breadcrumb. We capture console.log
// (jlog's sink) while running handleOptOut with a fake contact; every DB/send call
// it makes is fail-soft and no-ops without service-role env, so no DB is needed.

Deno.test("PRIVACY: the wa.optout log line contains ok:true and NO phone (PII)", async () => {
  const phone = "972500000999";
  const captured: string[] = [];
  const origLog = console.log;
  // Hermetic: sibling test files set SUPABASE_URL/SERVICE_ROLE at module load with
  // no cleanup, and `deno test` shares one process — so clear them here to force
  // handleOptOut's fail-soft no-op DB path (the pg* helpers return early without a
  // URL). Otherwise a real fetch to the leaked stub URL throws before the breadcrumb.
  // Restored in finally so we don't perturb later tests.
  const savedUrl = Deno.env.get("SUPABASE_URL");
  const savedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  // jlog writes one JSON line per event via console.log; capture them all.
  console.log = (...args: unknown[]) => {
    captured.push(args.map((a) => String(a)).join(" "));
  };
  try {
    await handleOptOut(
      // Minimal contact Row; no _convId so the outbound store is skipped. The DB
      // helpers (pgPatch/pgInsert/logSecurityEvent) no-op without SUPABASE_URL.
      { id: "contact-1", wa_phone: phone } as Record<string, unknown>,
      "הסר",
    );
  } finally {
    console.log = origLog;
    if (savedUrl !== undefined) Deno.env.set("SUPABASE_URL", savedUrl);
    if (savedKey !== undefined) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", savedKey);
  }
  const optoutLine = captured.find((l) => l.includes('"at":"wa.optout"'));
  assert(optoutLine, "an wa.optout breadcrumb line was logged");
  // The breadcrumb signals success…
  assertStringIncludes(optoutLine!, '"ok":true');
  // …and must NOT leak the phone (PII) into the structured log.
  assertFalse(optoutLine!.includes(phone), "the opt-out log line must not carry the phone (PII)");
  assertFalse(/"phone"/.test(optoutLine!), "the opt-out log line has no phone field at all");
});

// ── §30A: a MULTI-WORD opt-out reaches handleOptOut ───────────────────────────
// The webhook's opt-out guard is `isOptOut(text)` → handleOptOut. With the unified
// contains-match detector a politely-phrased multi-word request ("אנא הסירו אותי
// מהרשימה") is caught (the guard is true) AND drives handleOptOut to completion —
// the exact same path a bare "הסר" takes. We prove both halves: the guard selects
// this text, and feeding it to handleOptOut emits the opt-out breadcrumb.

Deno.test("§30A: a multi-word opt-out is caught and triggers handleOptOut", async () => {
  const multiWord = "אנא הסירו אותי מהרשימה";
  // 1) The guard the handler uses to route into handleOptOut is true for this text.
  assert(isOptOut(multiWord), "the multi-word opt-out must satisfy the handler's guard");

  // 2) Feeding that same text to handleOptOut runs it to completion (fail-soft, no
  //    DB — env cleared as in the PRIVACY test) and logs the opt-out breadcrumb.
  const captured: string[] = [];
  const origLog = console.log;
  const savedUrl = Deno.env.get("SUPABASE_URL");
  const savedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  console.log = (...args: unknown[]) => {
    captured.push(args.map((a) => String(a)).join(" "));
  };
  try {
    await handleOptOut(
      { id: "contact-mw", wa_phone: "972500000123" } as Record<string, unknown>,
      multiWord,
    );
  } finally {
    console.log = origLog;
    if (savedUrl !== undefined) Deno.env.set("SUPABASE_URL", savedUrl);
    if (savedKey !== undefined) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", savedKey);
  }
  assert(
    captured.some((l) => l.includes('"at":"wa.optout"') && l.includes('"ok":true')),
    "handleOptOut ran to completion for the multi-word opt-out (wa.optout breadcrumb)",
  );
});

// ── Amendment-13: erasure / data-access detectors (he/en) ─────────────────────
// Right after the opt-out check the webhook handles Amendment-13 requests
// deterministically (no paid AI): erasure WINS over access so a "delete my data"
// never resolves to a read-only summary. Pinned at the unified compliance source.

Deno.test("Amendment-13: isErasureRequest detects deletion commands (he/en)", () => {
  assert(isErasureRequest("מחק את המידע שלי"));
  assert(isErasureRequest("תמחקו אותי"));
  assert(isErasureRequest("delete my data"));
  assert(isErasureRequest("please erase my data"));
  // An ordinary catalogue question is not an erasure request.
  assertFalse(isErasureRequest("כמה עולה סלולר?"));
  assertFalse(isErasureRequest(""));
});

Deno.test("Amendment-13: isDataAccessRequest detects access asks; erasure wins", () => {
  assert(isDataAccessRequest("מה אתם יודעים עליי"));
  assert(isDataAccessRequest("what data do you have on me"));
  // Erasure is the stronger intent — a delete request must NOT read as access.
  assertFalse(isDataAccessRequest("מחק את המידע שלי"));
  assertFalse(isDataAccessRequest("delete my data"));
  // An ordinary catalogue question is neither.
  assertFalse(isDataAccessRequest("מה המסלול הזול ביותר"));
  assertFalse(isDataAccessRequest(""));
});

// ── TAKEOVER RECONCILE: the bot gate vs. the two takeover flavours ────────────
// Telegram takeover = bot_enabled=false + relay_tg_chat_id (relayActive).
// CRM-app takeover  = bot_enabled=false + status='human' + human_active_at
// (crm-api takeOver/sendMessage — NO relay target). The self-heal that ended the
// "silent forever" outage used to treat the relay-less CRM state as "stuck" and
// re-enabled the bot on the customer's next message — answering OVER the rep.
// botEnabled() now respects a RECENT CRM takeover, while a stale/unstamped
// bot_enabled=false row still self-heals. These pin the full truth table.

type Convo = Record<string, unknown>;
const freshAt = () => new Date(Date.now() - 60_000).toISOString();
const staleAt = () => new Date(Date.now() - HUMAN_TAKEOVER_FRESH_MS - 60_000).toISOString();

Deno.test("TAKEOVER: a fresh CRM-app takeover silences the bot (no relay target needed)", () => {
  const convo: Convo = {
    bot_enabled: false,
    status: "human",
    human_active_at: freshAt(),
    relay_tg_chat_id: null,
  };
  assert(humanTakeoverActive(convo), "the CRM takeover fingerprint is recognised");
  assertFalse(botEnabled(convo), "the bot must NOT answer over a rep who just took over");
});

Deno.test("TAKEOVER: humanTakeoverActive expires exactly at the freshness window (injectable clock)", () => {
  const t0 = Date.parse("2026-07-01T10:00:00Z");
  const convo: Convo = {
    bot_enabled: false,
    status: "human",
    human_active_at: new Date(t0).toISOString(),
  };
  // Active for the whole window (crm-api re-stamps on every rep reply)…
  assert(humanTakeoverActive(convo, t0 + 1));
  assert(humanTakeoverActive(convo, t0 + HUMAN_TAKEOVER_FRESH_MS - 1));
  // …and degrades to the stuck state once the rep has gone dark for the window.
  assertFalse(humanTakeoverActive(convo, t0 + HUMAN_TAKEOVER_FRESH_MS));
});

Deno.test("TAKEOVER: a STALE CRM takeover self-heals — the outage fix stays intact", () => {
  const convo: Convo = { bot_enabled: false, status: "human", human_active_at: staleAt() };
  assertFalse(humanTakeoverActive(convo));
  assert(botEnabled(convo), "a rep dark past the window cannot keep the customer silent");
});

Deno.test("TAKEOVER: the original stuck state (no relay, no stamp) still self-heals", () => {
  // The exact production-outage shape: bot_enabled=false and nothing else.
  assert(botEnabled({ bot_enabled: false }));
  assert(botEnabled({ bot_enabled: false, status: "human" })); // never stamped
  assert(botEnabled({ bot_enabled: false, relay_tg_chat_id: null, human_active_at: null }));
  // A garbage timestamp can't accidentally hold the bot silent.
  assert(botEnabled({ bot_enabled: false, status: "human", human_active_at: "not-a-date" }));
});

Deno.test("TAKEOVER: the CRM fingerprint requires all three fields", () => {
  // bot_enabled must be false…
  assertFalse(humanTakeoverActive({ bot_enabled: true, status: "human", human_active_at: freshAt() }));
  // …status must be 'human' (a fresh stamp alone is not a takeover)…
  assertFalse(humanTakeoverActive({ bot_enabled: false, status: "open", human_active_at: freshAt() }));
  // …and human_active_at must exist (crm-api always stamps it).
  assertFalse(humanTakeoverActive({ bot_enabled: false, status: "human" }));
});

Deno.test("TAKEOVER: the Telegram relay contract still silences on its own", () => {
  // No human_active_at at all — notify-lead sets only bot_enabled + relay target.
  assertFalse(botEnabled({ bot_enabled: false, relay_tg_chat_id: "12345" }));
});

Deno.test("TAKEOVER: the webhook's own rep-REQUEST marking keeps the bot answering", () => {
  // A customer asking for a rep sets conversation status='human' WITHOUT flipping
  // bot_enabled — the assistant must stay available until an actual takeover.
  assert(botEnabled({ bot_enabled: true, status: "human" }));
  assertFalse(humanTakeoverActive({ bot_enabled: true, status: "human", human_active_at: freshAt() }));
});

Deno.test("TAKEOVER: pre-migration rows (no bot_enabled column) fail OPEN", () => {
  assert(botEnabled(null));
  assert(botEnabled({}));
  assert(botEnabled({ bot_enabled: null }));
});

// ── BATCH: deriveHistoryAndFirstContact reproduces the old two-query answers ───
// The per-turn history + first-contact reads were collapsed into ONE contact-
// scoped query; this pure derivation must answer BOTH questions exactly like the
// old per-conversation recentHistory + per-contact isFirstContact queries did.

Deno.test("BATCH: a failed read (null rows) matches the old fail-soft — empty history, first contact", () => {
  const { history, firstContact } = deriveHistoryAndFirstContact(null, "conv-1", "msg-9");
  assertEquals(history, []);
  assertEquals(firstContact, true); // old isFirstContact: (null?.length ?? 0) === 0
});

Deno.test("BATCH: only the just-stored inbound present ⇒ first contact, no history", () => {
  const rows = [{ id: "msg-9", conversation_id: "conv-1", direction: "in", body: "היי" }];
  const { history, firstContact } = deriveHistoryAndFirstContact(rows, "conv-1", "msg-9");
  assertEquals(history, []);
  assertEquals(firstContact, true);
});

Deno.test("BATCH: prior turns exclude the inserted row, map roles, and read oldest→newest", () => {
  // Rows arrive NEWEST FIRST (order=created_at.desc), like the query returns.
  const rows = [
    { id: "msg-9", conversation_id: "conv-1", direction: "in", body: "וכמה זה עולה?" }, // just stored
    { id: "msg-8", conversation_id: "conv-1", direction: "out", body: "יש מסלול ב-49 ₪" },
    { id: "msg-7", conversation_id: "conv-1", direction: "in", body: "כמה עולה סלולר?" },
  ];
  const { history, firstContact } = deriveHistoryAndFirstContact(rows, "conv-1", "msg-9");
  assertEquals(firstContact, false);
  assertEquals(history, [
    { role: "user", text: "כמה עולה סלולר?" },
    { role: "bot", text: "יש מסלול ב-49 ₪" },
  ]);
});

Deno.test("BATCH: rows from ANOTHER conversation count against first-contact but stay out of history", () => {
  // A returning contact whose previous conversation was closed: the welcome must
  // NOT re-fire (old isFirstContact was contact-scoped), yet the new
  // conversation's history starts clean (old recentHistory was conversation-scoped).
  const rows = [
    { id: "msg-2", conversation_id: "conv-NEW", direction: "in", body: "חזרתי" }, // just stored
    { id: "msg-1", conversation_id: "conv-OLD", direction: "in", body: "שיחה ישנה" },
  ];
  const { history, firstContact } = deriveHistoryAndFirstContact(rows, "conv-NEW", "msg-2");
  assertEquals(firstContact, false);
  assertEquals(history, []);
});

Deno.test("BATCH: history is capped at 8 turns and drops empty bodies — like the old query", () => {
  const rows = [{ id: "msg-x", conversation_id: "c", direction: "in", body: "עכשיו" }];
  for (let i = 20; i > 0; i--) {
    rows.push({ id: `m${i}`, conversation_id: "c", direction: i % 2 ? "in" : "out", body: i === 20 ? "" : `הודעה ${i}` });
  }
  const { history } = deriveHistoryAndFirstContact(rows, "c", "msg-x");
  assert(history.length <= 8, "history is capped at 8 turns");
  assert(history.every((h) => h.text), "empty bodies are filtered out");
});

Deno.test("BATCH: no exclusion id (insert failed) still returns the newest 8 — old behaviour", () => {
  const rows = [];
  for (let i = 12; i > 0; i--) rows.push({ id: `m${i}`, conversation_id: "c", direction: "in", body: `ה${i}` });
  const { history, firstContact } = deriveHistoryAndFirstContact(rows, "c", null);
  assertEquals(firstContact, false);
  assertEquals(history.length, 8);
  assertEquals(history[history.length - 1].text, "ה12"); // newest last (oldest→newest)
});

// ── RATE LIMIT: HEAD+count parsing and the once-per-window notice ─────────────

Deno.test("RATE: parseContentRangeCount reads the PostgREST exact count", () => {
  assertEquals(parseContentRangeCount("0-8/57"), 57);
  assertEquals(parseContentRangeCount("*/0"), 0);
  assertEquals(parseContentRangeCount("0-30/31"), 31);
});

Deno.test("RATE: parseContentRangeCount fails soft on unknown/missing counts", () => {
  assertEquals(parseContentRangeCount("0-0/*"), null); // count not computed
  assertEquals(parseContentRangeCount(null), null);
  assertEquals(parseContentRangeCount(""), null);
  assertEquals(parseContentRangeCount("garbage"), null);
});

Deno.test("RATE: the 'one moment' notice goes out once per window, per contact", () => {
  __resetRateNoticeForTests();
  const t0 = 10_000_000;
  // First over-limit inbound → notice; the flood that follows is silent.
  assert(shouldSendRateNotice("contact-A", t0));
  assertFalse(shouldSendRateNotice("contact-A", t0 + 1_000));
  assertFalse(shouldSendRateNotice("contact-A", t0 + 3_599_999));
  // The window rolls → one fresh notice.
  assert(shouldSendRateNotice("contact-A", t0 + 3_600_000));
  // A different contact has its own window.
  assert(shouldSendRateNotice("contact-B", t0 + 2_000));
  __resetRateNoticeForTests();
});

// ── VOICE: the transcript is capped like every other agent input ──────────────
// The voice branch routes `routeText = capInbound(transcript)` — the SAME
// runaway-token guard the typed-text path gets (MAX_INBOUND_TEXT = 2000). This
// pins the composed contract: an over-long Whisper transcript reaches the agent
// truncated to the cap, never full-length.

Deno.test("VOICE: an over-long transcript is fed onward capped at 2000 chars", () => {
  const transcript = "דיבור ארוך מאוד ".repeat(400); // ≫ 2000 chars of "speech"
  const routed = capInbound(transcript);
  assertEquals(routed.length, 2000);
  assert(transcript.startsWith(routed), "the cap keeps the START of the spoken message");
  // A normal-length transcript passes through verbatim (the common case).
  assertEquals(capInbound("כמה עולה מסלול סלולר?"), "כמה עולה מסלול סלולר?");
});

// ── META BATCH: every entry/change is processed (not entry[0].changes[0]) ─────
// Meta batches deliveries: ONE POST can carry multiple entry items, each with
// multiple changes. The old handler read entry[0].changes[0] only and silently
// dropped the rest — an invisible customer message. extractWebhookEvents
// flattens the WHOLE batch (with per-change profile names, since a batch can
// span senders) and collects every value.statuses receipt.

Deno.test("BATCH: a two-entry payload yields EVERY message with its own change's profile name", () => {
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: "דנה" } }],
              messages: [{ id: "wamid.A", from: "111", type: "text" }],
            },
          },
          // A second CHANGE in the same entry — receipts only.
          { value: { statuses: [{ id: "wamid.OUT1", status: "delivered" }] } },
        ],
      },
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: "יוסי" } }],
              messages: [
                { id: "wamid.B", from: "222", type: "text" },
                { id: "wamid.C", from: "222", type: "text" },
              ],
            },
          },
        ],
      },
    ],
  };
  const batch = extractWebhookEvents(body);
  assertEquals(batch.messages.map((m) => String(m.message.id)), ["wamid.A", "wamid.B", "wamid.C"]);
  // Each message carries ITS OWN change's contact profile name.
  assertEquals(batch.messages[0].profileName, "דנה");
  assertEquals(batch.messages[1].profileName, "יוסי");
  assertEquals(batch.messages[2].profileName, "יוסי");
  // The receipt from the second change was collected too.
  assertEquals(batch.statuses.length, 1);
  assertEquals(String(batch.statuses[0].id), "wamid.OUT1");
});

Deno.test("BATCH: the same wamid repeated across entries is deduped in-batch (safety net)", () => {
  const dup = { id: "wamid.DUP", from: "111", type: "text" };
  const batch = extractWebhookEvents({
    entry: [
      { changes: [{ value: { messages: [dup] } }] },
      { changes: [{ value: { messages: [dup, { id: "wamid.NEW", from: "111" }] } }] },
    ],
  });
  assertEquals(batch.messages.map((m) => String(m.message.id)), ["wamid.DUP", "wamid.NEW"]);
  // A message WITHOUT a wamid is never deduped away (it can't collide).
  const noId = extractWebhookEvents({
    entry: [{ changes: [{ value: { messages: [{ from: "1" }, { from: "2" }] } }] }],
  });
  assertEquals(noId.messages.length, 2);
});

Deno.test("BATCH: extractWebhookEvents is total on malformed payloads", () => {
  assertEquals(extractWebhookEvents(null), { messages: [], statuses: [] });
  assertEquals(extractWebhookEvents({}), { messages: [], statuses: [] });
  assertEquals(extractWebhookEvents({ entry: "junk" }), { messages: [], statuses: [] });
  assertEquals(extractWebhookEvents({ entry: [{}] }), { messages: [], statuses: [] });
  assertEquals(extractWebhookEvents({ entry: [{ changes: [{}, { value: null }, { value: 4 }] }] }), {
    messages: [],
    statuses: [],
  });
  assertEquals(
    extractWebhookEvents({ entry: [{ changes: [{ value: { messages: "x", statuses: 7 } }] }] }),
    { messages: [], statuses: [] },
  );
});

// ── RECEIPTS: value.statuses → whatsapp_messages.status by wamid ──────────────

Deno.test("RECEIPTS: parseStatusReceipt accepts ONLY the closed sent/delivered/read/failed set", () => {
  assertEquals(parseStatusReceipt({ id: "wamid.1", status: "delivered" }), { wamid: "wamid.1", status: "delivered" });
  assertEquals(parseStatusReceipt({ id: "wamid.1", status: "READ" }), { wamid: "wamid.1", status: "read" });
  assertEquals(parseStatusReceipt({ id: "wamid.1", status: "failed" }), { wamid: "wamid.1", status: "failed" });
  assertEquals(parseStatusReceipt({ id: "wamid.1", status: "warned" }), null); // unknown → ignored
  assertEquals(parseStatusReceipt({ id: "", status: "read" }), null); // no wamid
  assertEquals(parseStatusReceipt({}), null);
});

Deno.test("RECEIPTS: receiptStatusFilter keeps out-of-order receipts monotonic", () => {
  // A stale 'sent'/'delivered' must never downgrade 'read' (or overwrite 'failed').
  assertEquals(receiptStatusFilter("sent"), "&status=not.in.(delivered,read,failed)");
  assertEquals(receiptStatusFilter("delivered"), "&status=not.in.(read,failed)");
  assertEquals(receiptStatusFilter("read"), "&status=not.in.(failed)");
  // 'failed' is Graph's definitive verdict — no filter, it may overwrite anything.
  assertEquals(receiptStatusFilter("failed"), "");
});

// Set env for the duration of `fn`, restoring the previous values afterwards —
// sibling test files leak SUPABASE_* at module load, so both set AND restore.
async function withEnvVars(env: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(env)) {
    saved.set(k, Deno.env.get(k));
    Deno.env.set(k, v);
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("RECEIPTS: statuses across TWO entries land as wamid-scoped PATCHes (fail-soft per receipt)", async () => {
  const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
  await withEnvVars(
    { SUPABASE_URL: "https://wa-batch.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc-stub" },
    async () => {
      await withFetchStub([
        {
          match: (u, init) =>
            u.includes("/rest/v1/whatsapp_messages") && (init?.method ?? "GET") === "PATCH",
          respond: (u, init) => {
            patches.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
            // FAIL-SOFT PER RECEIPT: the first PATCH 500s; later ones still run.
            return patches.length === 1 ? new Response("boom", { status: 500 }) : jsonResponse([]);
          },
        },
        // Any other PostgREST call from this host → benign empty.
        { match: (u) => u.includes("wa-batch.supabase.co"), respond: () => jsonResponse([]) },
      ], async () => {
        const raw = JSON.stringify({
          entry: [
            { changes: [{ value: { statuses: [{ id: "wamid.R1", status: "delivered" }] } }] },
            {
              changes: [{
                value: {
                  statuses: [
                    { id: "wamid.R2", status: "read" },
                    { id: "wamid.R3", status: "bogus" }, // unknown status → never written
                  ],
                },
              }],
            },
          ],
        });
        const sig = await signBody(raw);
        const r = await Promise.resolve(waHandler(
          new Request("https://edge/wa", {
            method: "POST",
            headers: { "x-hub-signature-256": sig },
            body: raw,
          }),
        ));
        // Meta always gets the 200 {ok:true} contract, even with a failed receipt.
        assertEquals(r.status, 200);
        assertEquals(await r.json(), { ok: true });
      });
    },
  );
  assertEquals(patches.length, 2, "both entries' valid receipts were written; the bogus one skipped");
  // wamid-scoped URL + the monotonic guard + the bare {status} body.
  assert(patches[0].url.includes("wa_message_id=eq.wamid.R1"));
  assert(patches[0].url.includes("status=not.in.(read,failed)"), "delivered never downgrades read");
  assertEquals(patches[0].body, { status: "delivered" });
  assert(patches[1].url.includes("wa_message_id=eq.wamid.R2"));
  assertEquals(patches[1].body, { status: "read" });
});

Deno.test("BATCH: messages in BOTH entries are handled end-to-end (two inbound rows stored)", async () => {
  __resetRateLimitForTests();
  const inbound: Array<Record<string, unknown>> = [];
  await withEnvVars(
    { SUPABASE_URL: "https://wa-batch2.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc-stub" },
    async () => {
      await withFetchStub([
        // Contact upsert → echo a row keyed by the phone.
        {
          match: (u, init) =>
            u.includes("/rest/v1/whatsapp_contacts") && (init?.method ?? "GET") === "POST",
          respond: (_u, init) => {
            const b = JSON.parse(String(init?.body ?? "{}"));
            return jsonResponse([{ id: `c-${b.wa_phone}`, wa_phone: b.wa_phone }], 201);
          },
        },
        // Open-conversation lookup → one live conversation.
        {
          match: (u, init) =>
            u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "GET",
          respond: () => jsonResponse([{ id: "conv-batch", status: "open", bot_enabled: true, ai_state: {} }]),
        },
        // Message inserts — capture the INBOUND rows (the assertion target).
        {
          match: (u, init) =>
            u.includes("/rest/v1/whatsapp_messages") && (init?.method ?? "GET") === "POST",
          respond: (_u, init) => {
            const b = JSON.parse(String(init?.body ?? "{}"));
            if (b.direction === "in") inbound.push(b);
            return jsonResponse([{ id: `m-${String(b.wa_message_id ?? "out")}` }], 201);
          },
        },
        // Graph API (markRead / the opt-out confirmation send) → ok.
        {
          match: (u) => u.includes("graph.facebook.com"),
          respond: () => jsonResponse({ messages: [{ id: "wamid.CONF" }] }),
        },
        // Everything else on this PostgREST host (patches, suppression, audit,
        // crm_events, the config RPC) → benign empty.
        { match: (u) => u.includes("wa-batch2.supabase.co"), respond: () => jsonResponse([]) },
      ], async () => {
        // Both messages are STOP texts — the deterministic §30A path (no AI),
        // which still exercises the full store-inbound pipeline per message.
        const raw = JSON.stringify({
          entry: [
            {
              changes: [{
                value: {
                  contacts: [{ profile: { name: "דנה" } }],
                  messages: [{ from: "972500000111", id: "wamid.E1", type: "text", text: { body: "הסר" } }],
                },
              }],
            },
            {
              changes: [{
                value: {
                  contacts: [{ profile: { name: "יוסי" } }],
                  messages: [{ from: "972500000222", id: "wamid.E2", type: "text", text: { body: "הסר" } }],
                },
              }],
            },
          ],
        });
        const sig = await signBody(raw);
        const r = await Promise.resolve(waHandler(
          new Request("https://edge/wa", {
            method: "POST",
            headers: { "x-hub-signature-256": sig },
            body: raw,
          }),
        ));
        assertEquals(r.status, 200);
        assertEquals(await r.json(), { ok: true });
      });
    },
  );
  // The message in entry[1] — dropped entirely by the old entry[0].changes[0]
  // reader — was stored exactly like the first one.
  assertEquals(inbound.length, 2, "BOTH entries' messages reached the pipeline");
  assertEquals(inbound.map((b) => b.wa_message_id).sort(), ["wamid.E1", "wamid.E2"]);
  __resetRateLimitForTests();
});
