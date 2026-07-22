// Unit tests for the admin-metrics pure helpers (admin-metrics/metrics.ts) — the
// window clamp, analytics per-day series shaper, agent_tool_calls success-rate
// rollups, and the security_audit_log histogram. These are the projections the
// read-only observability endpoint returns, tested without booting the server or
// touching the DB. Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import {
  clampDays,
  DEFAULT_DAYS,
  KNOWN_EVENTS,
  MAX_DAYS,
  rateBy,
  s,
  summariseAudit,
  summariseToolCalls,
  toEventSeries,
  type ToolCallRow,
} from "../admin-metrics/metrics.ts";

// ── clampDays ──────────────────────────────────────────────────────────────────

Deno.test("clampDays defaults a missing/garbage window to 7", () => {
  assertEquals(clampDays(undefined), DEFAULT_DAYS);
  assertEquals(clampDays(null), DEFAULT_DAYS);
  assertEquals(clampDays("not a number"), DEFAULT_DAYS);
  assertEquals(clampDays(NaN), DEFAULT_DAYS);
});

Deno.test("clampDays parses numeric strings and truncates fractions", () => {
  assertEquals(clampDays("30"), 30);
  assertEquals(clampDays(14.9), 14);
});

Deno.test("clampDays floors at 1 and caps at the 90-day retention window", () => {
  assertEquals(clampDays(0), 1);
  assertEquals(clampDays(-5), 1);
  assertEquals(clampDays(90), 90);
  assertEquals(clampDays(365), MAX_DAYS);
});

// ── toEventSeries ──────────────────────────────────────────────────────────────

Deno.test("toEventSeries sums per-day counts and reports the total", () => {
  const series = toEventSeries("leadSubmit", [
    { day: "2026-06-21", events: 3 },
    { day: "2026-06-22", events: 5 },
  ]);
  assertEquals(series.event, "leadSubmit");
  assertEquals(series.total, 8);
  assertEquals(series.days.length, 2);
  // Newest day first.
  assertEquals(series.days[0].day, "2026-06-22");
});

Deno.test("toEventSeries is honest zeros on a failed/empty read — no fabrication", () => {
  const failed = toEventSeries("planView", null);
  assertEquals(failed, { event: "planView", total: 0, days: [] });
  const empty = toEventSeries("planView", []);
  assertEquals(empty, { event: "planView", total: 0, days: [] });
});

Deno.test("toEventSeries clamps a bogus count to 0 and normalises the day to YYYY-MM-DD", () => {
  const series = toEventSeries("searchQuery", [
    { day: "2026-06-20T00:00:00+00:00", events: -4 as unknown as number },
    { day: "2026-06-21", events: 2 },
  ]);
  assertEquals(series.days.find((d) => d.day === "2026-06-20")?.events, 0);
  assertEquals(series.total, 2);
});

// ── rateBy / summariseToolCalls ──────────────────────────────────────────────

Deno.test("rateBy groups by tool with calls / ok / rate", () => {
  const rows: ToolCallRow[] = [
    { channel: "whatsapp", tool: "search_plans", ok: true },
    { channel: "site", tool: "search_plans", ok: false },
    { channel: "app", tool: "create_lead", ok: true },
  ];
  const byTool = rateBy(rows, "tool");
  const search = byTool.find((b) => b.key === "search_plans")!;
  assertEquals(search.calls, 2);
  assertEquals(search.ok, 1);
  assertEquals(search.rate, 0.5);
  // Most-used first.
  assertEquals(byTool[0].key, "search_plans");
});

Deno.test("rateBy treats anything but boolean true as a failure", () => {
  const rows: ToolCallRow[] = [
    { tool: "t", ok: true },
    { tool: "t", ok: "true" as unknown as boolean }, // string, not boolean → failure
    { tool: "t", ok: 1 as unknown as boolean }, // number → failure
    { tool: "t", ok: undefined }, // missing → failure
  ];
  const [bucket] = rateBy(rows, "tool");
  assertEquals(bucket.calls, 4);
  assertEquals(bucket.ok, 1);
  assertEquals(bucket.rate, 0.25);
});

Deno.test("rateBy buckets a missing key under (unknown)", () => {
  const rows: ToolCallRow[] = [{ tool: "", ok: true }, { ok: false }];
  const buckets = rateBy(rows, "tool");
  assertEquals(buckets.length, 1);
  assertEquals(buckets[0].key, "(unknown)");
  assertEquals(buckets[0].calls, 2);
});

Deno.test("summariseToolCalls reports overall + by-tool + by-channel", () => {
  const rows: ToolCallRow[] = [
    { channel: "whatsapp", tool: "search_plans", ok: true },
    { channel: "whatsapp", tool: "create_lead", ok: true },
    { channel: "site", tool: "search_plans", ok: false },
  ];
  const sum = summariseToolCalls(rows);
  assertEquals(sum.total, 3);
  assertEquals(sum.ok, 2);
  assertEquals(sum.rate, Math.round((2 / 3) * 10000) / 10000);
  const wa = sum.byChannel.find((b) => b.key === "whatsapp")!;
  assertEquals(wa.calls, 2);
  assertEquals(wa.rate, 1);
});

Deno.test("summariseToolCalls is honest zeros on a failed read", () => {
  const sum = summariseToolCalls(null);
  assertEquals(sum, { total: 0, ok: 0, rate: 0, byTool: [], byChannel: [] });
});

// ── summariseAudit ─────────────────────────────────────────────────────────────

Deno.test("summariseAudit counts events per label, most frequent first", () => {
  const out = summariseAudit([
    { event: "crm_takeover" },
    { event: "crm_takeover" },
    { event: "analytics_purge" },
  ]);
  assertEquals(out.total, 3);
  assertEquals(out.byEvent[0], { event: "crm_takeover", count: 2 });
  assertEquals(out.byEvent[1], { event: "analytics_purge", count: 1 });
});

Deno.test("summariseAudit is honest zeros on a failed read", () => {
  const out = summariseAudit(null);
  assertEquals(out, { total: 0, byEvent: [] });
});

// ── invariants ─────────────────────────────────────────────────────────────────

Deno.test("KNOWN_EVENTS mirrors the analytics-track writer allowlist", () => {
  assertEquals(
    [...KNOWN_EVENTS].sort(),
    [
      "appOpen",
      "compareView",
      "leadStart",
      "leadSubmit",
      "meetingRequest",
      "planView",
      "quizComplete",
      "savingsViewed",
      "searchQuery",
      "shortlistCreate",
      "shortlistLeadClick",
      "shortlistShare",
      "whatsappClick",
    ],
  );
});

Deno.test("s null-safely stringifies", () => {
  assertEquals(s(null), "");
  assertEquals(s(undefined), "");
  assertEquals(s(7), "7");
  assert(typeof s({}) === "string");
});
