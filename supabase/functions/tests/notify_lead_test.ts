// Unit tests for notify-lead pure helpers that the existing bot_test.ts does NOT
// already cover: the integrations-status reducer (index.ts), the lone-zero
// amount guard (callbacks.ts), the /commands menu contract (commands.ts), plus
// additional parseTriage / parseSavingAmount edge cases that pin the
// security-relevant invariants (attacker-controlled model output / rep replies
// must never escape their clamps). Mostly pure — no network, no Deno.serve; the
// pipeline-counter tests stub fetch + env (restored) to pin the HEAD probes.
// Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import type { Cfg } from "../_shared/types.ts";
import {
  integrationsStatus,
  parseExactCount,
  PIPELINE_FAILURE_EVENTS,
  pipelineFailureCounts,
} from "../notify-lead/index.ts";
import { isLoneZeroAmount, parseSavingAmount } from "../notify-lead/callbacks.ts";
import { BOT_COMMANDS } from "../notify-lead/commands.ts";
import { parseTriage } from "../notify-lead/triage.ts";
import { withFetchStub } from "./_capture_handler.ts";

// A fully-zeroed Cfg; tests flip exactly the fields under test so nothing else
// can leak in and accidentally pass an assertion.
function blankCfg(over: Partial<Cfg> = {}): Cfg {
  return {
    tgToken: "",
    tgChat: "",
    resend: "",
    resendFrom: "",
    notifyEmail: "",
    openai: "",
    anthropic: "",
    gemini: "",
    webhookSecret: "",
    zoomAccountId: "",
    zoomClientId: "",
    zoomClientSecret: "",
    zoomHostEmail: "",
    googleServiceAccount: "",
    googleCalendarId: "",
    googleSpreadsheetId: "",
    allowedUserIds: [],
    src: {},
    ...over,
  };
}

// ── integrationsStatus: booleans only, each gate independent ───────────────────

Deno.test("integrationsStatus reports all-off for a blank config", () => {
  assertEquals(integrationsStatus(blankCfg()), {
    zoom: false,
    calendar: false,
    sheets: false,
    email: false,
    telegram: false,
  });
});

Deno.test("integrationsStatus.email tracks ONLY the resend key", () => {
  assert(integrationsStatus(blankCfg({ resend: "re_x" })).email);
  assertFalse(integrationsStatus(blankCfg({ resendFrom: "a@b.co" })).email);
});

Deno.test("integrationsStatus.telegram tracks ONLY the bot token", () => {
  assert(integrationsStatus(blankCfg({ tgToken: "123:abc" })).telegram);
  assertFalse(integrationsStatus(blankCfg({ tgChat: "-100" })).telegram);
});

Deno.test("integrationsStatus.zoom requires ALL three S2S fields", () => {
  // every partial pair stays false; only the full triple flips on
  assertFalse(integrationsStatus(blankCfg({ zoomAccountId: "a", zoomClientId: "c" })).zoom);
  assertFalse(integrationsStatus(blankCfg({ zoomClientId: "c", zoomClientSecret: "s" })).zoom);
  assert(
    integrationsStatus(blankCfg({ zoomAccountId: "a", zoomClientId: "c", zoomClientSecret: "s" })).zoom,
  );
});

Deno.test("integrationsStatus.calendar requires BOTH the SA json and a calendar id", () => {
  assertFalse(integrationsStatus(blankCfg({ googleServiceAccount: "eyJ9" })).calendar);
  assertFalse(integrationsStatus(blankCfg({ googleCalendarId: "x@group.calendar" })).calendar);
  assert(
    integrationsStatus(blankCfg({ googleServiceAccount: "eyJ9", googleCalendarId: "x@group.calendar" })).calendar,
  );
});

Deno.test("integrationsStatus never leaks a secret VALUE (booleans only)", () => {
  const cfg = blankCfg({ resend: "re_supersecret", tgToken: "999:topsecret" });
  const out = integrationsStatus(cfg);
  const serialised = JSON.stringify(out);
  assertFalse(serialised.includes("re_supersecret"));
  assertFalse(serialised.includes("topsecret"));
  // every value is a strict boolean
  for (const v of Object.values(out)) assertEquals(typeof v, "boolean");
});

// ── isLoneZeroAmount: precise "positive amount required" nudge ─────────────────

Deno.test("isLoneZeroAmount is true ONLY for a well-formed zero", () => {
  for (const z of ["0", " 0 ", "₪0", "0₪", "00", "0,000"]) {
    assert(isLoneZeroAmount(z), `expected lone-zero: ${JSON.stringify(z)}`);
  }
});

Deno.test("isLoneZeroAmount is false for positive amounts and for prose", () => {
  for (const nz of ["1200", "₪50", "850", "אפס", "לא חסכנו כלום", "0 ש\"ח חסכון", ""]) {
    assertFalse(isLoneZeroAmount(nz), `expected NOT lone-zero: ${JSON.stringify(nz)}`);
  }
});

Deno.test("isLoneZeroAmount and parseSavingAmount partition the lone-number space", () => {
  // A lone zero parses to null (invalid) AND is flagged as the zero case, so the
  // handler can pick the precise nudge instead of the generic one.
  assertEquals(parseSavingAmount("0"), null);
  assert(isLoneZeroAmount("0"));
  // A lone positive parses fine AND is NOT the zero case.
  assertEquals(parseSavingAmount("1200"), 1200);
  assertFalse(isLoneZeroAmount("1200"));
  // Prose is neither a parseable amount nor a lone zero.
  assertEquals(parseSavingAmount("חסכנו 100 בחודש"), null);
  assertFalse(isLoneZeroAmount("חסכנו 100 בחודש"));
});

// ── parseSavingAmount: clamp + currency-suffix edge cases (beyond bot_test) ────

Deno.test("parseSavingAmount clamps to the 100k ceiling and strips suffixes", () => {
  assertEquals(parseSavingAmount("100000"), 100_000);
  assertEquals(parseSavingAmount("999999"), 100_000); // clamped, not rejected
  assertEquals(parseSavingAmount('1200 שח'), 1200); // bare שח suffix
  assertEquals(parseSavingAmount("₪1250₪"), 1250); // currency on both sides still parses
  assertEquals(parseSavingAmount("1200 ש\"ח לחודש"), null); // trailing prose after the suffix
});

// ── BOT_COMMANDS: the /commands menu contract ─────────────────────────────────

Deno.test("BOT_COMMANDS entries match Telegram's setMyCommands shape", () => {
  assert(BOT_COMMANDS.length > 0);
  for (const c of BOT_COMMANDS) {
    // Telegram: command is 1-32 chars, lowercase a-z/0-9/_; description 1-256.
    assertEquals(c.command, c.command.toLowerCase());
    assert(/^[a-z0-9_]{1,32}$/.test(c.command), `bad command slug: ${c.command}`);
    assert(c.description.length >= 1 && c.description.length <= 256, `bad desc for /${c.command}`);
  }
});

Deno.test("BOT_COMMANDS slugs are unique and expose the core surfaces", () => {
  const slugs = BOT_COMMANDS.map((c) => c.command);
  assertEquals(new Set(slugs).size, slugs.length, "duplicate command slug");
  for (const must of ["today", "leads", "help"]) {
    assert(slugs.includes(must), `missing core command /${must}`);
  }
});

// ── parseTriage: hostile / malformed model output stays clamped ────────────────

Deno.test("parseTriage clamps an out-of-range or non-numeric score into 0..5", () => {
  assertEquals(parseTriage('{"summary":"x","score":99,"draft":""}').score, 5);
  assertEquals(parseTriage('{"summary":"x","score":-4,"draft":""}').score, 1);
  // non-numeric score → not finite → 0 (no false "hot lead")
  assertEquals(parseTriage('{"summary":"x","score":"high","draft":""}').score, 0);
});

Deno.test("parseTriage bounds summary (200) and draft (300) lengths", () => {
  const r = parseTriage(JSON.stringify({ summary: "ש".repeat(500), score: 3, draft: "ד".repeat(500) }));
  assertEquals(r.line.length, 200);
  assertEquals(r.draft.length, 300);
});

Deno.test("parseTriage returns the empty result for blank / unparseable input", () => {
  assertEquals(parseTriage(""), { line: "", score: 0, draft: "" });
  assertEquals(parseTriage("   ```json```   "), { line: "", score: 0, draft: "" });
  // a non-JSON line is salvaged as the summary with a zero score
  const salvaged = parseTriage("הלקוח מעוניין במעבר");
  assertEquals(salvaged.score, 0);
  assertEquals(salvaged.draft, "");
  assert(salvaged.line.length > 0);
});

// ── pipeline failure counters (?action=health + the rep console) ───────────────
// The two silent lead-pipeline failure modes the WhatsApp bot records into
// security_audit_log (handoff_lead_insert_failed / voice_transcription_failed)
// are surfaced as 24h counts. Contract: real counts from HEAD + count=exact,
// and an HONEST null (unknown) — never a false 0 — when a probe fails.

Deno.test("parseExactCount reads the PostgREST exact count and fails soft", () => {
  assertEquals(parseExactCount("0-0/57"), 57);
  assertEquals(parseExactCount("*/0"), 0);
  assertEquals(parseExactCount("0-0/*"), null); // count not computed
  assertEquals(parseExactCount(null), null);
  assertEquals(parseExactCount("garbage"), null);
});

Deno.test("PIPELINE_FAILURE_EVENTS is exactly the two audited pipeline failure modes", () => {
  assertEquals([...PIPELINE_FAILURE_EVENTS], [
    "handoff_lead_insert_failed",
    "voice_transcription_failed",
  ]);
});

// Set env for the duration of `fn`, restoring the PREVIOUS values (sibling test
// files leak SUPABASE_* at module load, so both set and restore).
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

Deno.test("pipelineFailureCounts: 24h-scoped HEAD probes; a failed probe is null, never 0", async () => {
  const urls: string[] = [];
  await withEnvVars(
    { SUPABASE_URL: "https://nl-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc-stub" },
    async () => {
      await withFetchStub([
        {
          match: (u, init) =>
            u.includes("/rest/v1/security_audit_log") &&
            u.includes("event=eq.handoff_lead_insert_failed") &&
            (init?.method ?? "GET") === "HEAD",
          respond: (u) => {
            urls.push(u);
            return new Response(null, { status: 200, headers: { "content-range": "0-0/3" } });
          },
        },
        {
          match: (u, init) =>
            u.includes("/rest/v1/security_audit_log") &&
            u.includes("event=eq.voice_transcription_failed") &&
            (init?.method ?? "GET") === "HEAD",
          respond: (u) => {
            urls.push(u);
            return new Response("boom", { status: 500 }); // probe failure
          },
        },
      ], async () => {
        const counts = await pipelineFailureCounts();
        assertEquals(counts.handoff_lead_insert_failed, 3); // the real count
        assertEquals(counts.voice_transcription_failed, null); // honest unknown
      });
    },
  );
  assertEquals(urls.length, 2, "one probe per failure event");
  // Both probes are scoped to the trailing 24h window.
  for (const u of urls) assert(u.includes("created_at=gte."), "24h window filter present");
});

Deno.test("pipelineFailureCounts: a zero count is a REAL 0 (distinct from a failed probe)", async () => {
  await withEnvVars(
    { SUPABASE_URL: "https://nl-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc-stub" },
    async () => {
      await withFetchStub([
        {
          match: (u, init) =>
            u.includes("/rest/v1/security_audit_log") && (init?.method ?? "GET") === "HEAD",
          respond: () => new Response(null, { status: 200, headers: { "content-range": "*/0" } }),
        },
      ], async () => {
        const counts = await pipelineFailureCounts();
        assertEquals(counts.handoff_lead_insert_failed, 0);
        assertEquals(counts.voice_transcription_failed, 0);
      });
    },
  );
});
