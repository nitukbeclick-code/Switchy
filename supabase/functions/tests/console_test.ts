import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeRep, dataCheckString, validateInitData } from "../_shared/webapp.ts";
import { buildBoard, toConsoleMeeting } from "../notify-lead/console.ts";

const TOKEN = "123456:TEST-bot-token-abcDEF";

// Build a correctly-signed initData string the way Telegram would, so the
// validator is cross-checked against an independent HMAC assembly.
async function signInitData(fields: Record<string, string>): Promise<string> {
  const enc = new TextEncoder();
  const hmac = async (keyData: Uint8Array, msg: string) => {
    const key = await crypto.subtle.importKey("raw", keyData as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  };
  const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = await hmac(enc.encode("WebAppData"), TOKEN);
  const hash = hex(await hmac(secret, dcs));
  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

Deno.test("validateInitData accepts a correctly-signed payload", async () => {
  const user = { id: 42, first_name: "דנה" };
  const initData = await signInitData({
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAA",
  });
  const got = await validateInitData(initData, TOKEN);
  assert(got);
  assertEquals(got!.id, 42);
});

Deno.test("validateInitData rejects a tampered hash", async () => {
  const initData = await signInitData({ user: '{"id":1}', auth_date: String(Math.floor(Date.now() / 1000)) });
  const tampered = initData.replace(/hash=[0-9a-f]+/, "hash=deadbeef");
  assertEquals(await validateInitData(tampered, TOKEN), null);
});

Deno.test("validateInitData rejects a stale auth_date", async () => {
  const old = Math.floor(Date.now() / 1000) - 100000; // > 24h
  const initData = await signInitData({ user: '{"id":1}', auth_date: String(old) });
  assertEquals(await validateInitData(initData, TOKEN, 86400), null);
});

Deno.test("validateInitData rejects the wrong token", async () => {
  const initData = await signInitData({ user: '{"id":1}', auth_date: String(Math.floor(Date.now() / 1000)) });
  assertEquals(await validateInitData(initData, "999:other"), null);
});

Deno.test("dataCheckString drops hash and sorts", () => {
  assertEquals(dataCheckString("b=2&a=1&hash=x"), "a=1\nb=2");
});

Deno.test("authorizeRep enforces the allowlist", async () => {
  const initData = await signInitData({ user: '{"id":7}', auth_date: String(Math.floor(Date.now() / 1000)) });
  assert(await authorizeRep(initData, TOKEN, [7, 8])); // on the list
  assertEquals(await authorizeRep(initData, TOKEN, [8, 9]), null); // not on the list
  assert(await authorizeRep(initData, TOKEN, [])); // empty list → any valid user
});

// ── Board partition ──────────────────────────────────────────────────────────

Deno.test("buildBoard splits today / pending / week", () => {
  const now = Date.parse("2026-06-16T09:00:00Z"); // a Tuesday
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const rows = [
    { id: "a".repeat(8), name: "היום-מאושר", status: "confirmed", meeting_date: todayYmd, slot: "14:30", starts_at: "2026-06-16T11:30:00Z", provider: "הוט" },
    { id: "b".repeat(8), name: "ממתין", status: "pending", meeting_date: "2026-06-18", slot: "10:00", starts_at: "2026-06-18T07:00:00Z" },
    { id: "c".repeat(8), name: "שבוע", status: "confirmed", meeting_date: "2026-06-19", slot: "12:00", starts_at: "2026-06-19T09:00:00Z" },
    { id: "d".repeat(8), name: "בוטל", status: "cancelled", meeting_date: todayYmd, slot: "09:00", starts_at: "2026-06-16T06:00:00Z" },
    { id: "e".repeat(8), name: "רחוק", status: "confirmed", meeting_date: "2026-07-30", slot: "12:00", starts_at: "2026-07-30T09:00:00Z" },
  ];
  const b = buildBoard(rows, now);
  assertEquals(b.today.map((m) => m.name), ["היום-מאושר"]); // cancelled excluded
  assertEquals(b.pending.map((m) => m.name), ["ממתין"]);
  assertEquals(b.week.map((m) => m.name), ["שבוע"]); // next-7 confirmed; far-future excluded
  assertEquals(b.stats, { today: 1, pending: 1, week: 1 });
});

Deno.test("toConsoleMeeting never leaks rep identity / notes", () => {
  const c = toConsoleMeeting({ id: "x", name: "א", phone: "0500000000", claimed_by: "סודי", notes: "פנימי", status: "pending", meeting_date: "2026-06-16", slot: "09:00" } as never);
  assert(!("claimed_by" in c));
  assert(!("notes" in c));
});

// Reschedule rules (parseReschedule) are covered in agenda_test.ts — the
// console reuses that shared parser, so it isn't re-tested here.
