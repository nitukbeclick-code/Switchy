// Unit tests for the security-watch anomaly analysis. Run from
// supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import { analyze, composeAlert, REVEAL_THRESHOLD } from "../security-watch/lib.ts";

Deno.test("analyze returns no findings for benign audit traffic", () => {
  const rows = [
    { event: "crm_thread_view", user_id: "u1" },
    { event: "crm_reply", user_id: "u1" },
    { event: "crm_pii_reveal", user_id: "u1" }, // a couple of reveals is normal
    { event: "crm_pii_reveal", user_id: "u1" },
  ];
  assertEquals(analyze(rows), []);
});

Deno.test("analyze flags any admin_grant (privilege change) as high severity", () => {
  const f = analyze([{ event: "admin_grant", user_id: "u9" }]);
  assertEquals(f.length, 1);
  assertEquals(f[0].severity, "high");
});

Deno.test("analyze flags rate-limit trips as medium severity", () => {
  const f = analyze([
    { event: "crm_rate_limited", user_id: "u1" },
    { event: "crm_rate_limited", user_id: "u1" },
  ]);
  assertEquals(f.length, 1);
  assertEquals(f[0].severity, "medium");
});

Deno.test("analyze flags a per-actor reveal burst at/over the threshold", () => {
  const rows = Array.from({ length: REVEAL_THRESHOLD }, () => ({
    event: "crm_pii_reveal",
    user_id: "attacker-uid-1234",
  }));
  const f = analyze(rows);
  assertEquals(f.length, 1);
  assertEquals(f[0].severity, "high");
});

Deno.test("analyze counts reveals PER actor — two small actors don't sum into an alert", () => {
  const rows = [
    ...Array.from({ length: REVEAL_THRESHOLD - 1 }, () => ({ event: "crm_pii_reveal", user_id: "a" })),
    ...Array.from({ length: REVEAL_THRESHOLD - 1 }, () => ({ event: "crm_pii_reveal", user_id: "b" })),
  ];
  assertEquals(analyze(rows), []);
});

Deno.test("composeAlert marks the batch high when any finding is high", () => {
  const text = composeAlert(
    [{ severity: "medium", line: "x" }, { severity: "high", line: "y" }],
    42,
  );
  assert(text.includes("🚨"));
  assert(text.includes("42"));
});

Deno.test("composeAlert stays a warning when all findings are medium", () => {
  const text = composeAlert([{ severity: "medium", line: "x" }], 3);
  assert(text.includes("⚠️"));
  assert(!text.includes("🚨"));
});
