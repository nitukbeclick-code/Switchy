// GAP 2 — Zoom-provider pre-check on the agent's VIDEO-meeting path.
//
// book_callback is the agent's only booking tool; a VIDEO (Zoom) meeting request
// flows through it. These tests pin the gate's contract:
//   • supported provider (DB true)      → unchanged flow (consent gate + §7b intact)
//   • unsupported provider (DB false)   → polite structured refusal, NOTHING written
//   • DB error (null / thrown probe)    → const-list fallback (the 10 catalogue ids)
//   • plain PHONE callbacks             → NEVER consult the capability probe
// Plus: the fallback const stays in lockstep with meeting-book/lib.ts's list, and
// the pure resolveZoomSupport mirrors the meeting-book semantics exactly.
// No network, no env writes. Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import {
  bookCallback,
  COMMISSION_DISCLOSURE,
  isVideoMeetingRequest,
  resolveZoomSupport,
  TOOL_DECLARATIONS,
  type ToolContext,
  ZOOM_SUPPORTED_PROVIDERS_FALLBACK,
} from "../_shared/tools.ts";
import { ZOOM_SUPPORTED_PROVIDERS } from "../meeting-book/lib.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";

const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29, noCommit: true },
  { id: "c3", cat: "cellular", provider: "019 מובייל", plan: "חסכוני", price: 19 },
  { id: "i1", cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99, net: "fiber" },
];

// Fake ToolContext recording audit events, lead captures, and capability probes.
function fakeCtx(opts: Partial<ToolContext> = {}): ToolContext & {
  crm: string[];
  captured: Record<string, unknown>[];
  probed: string[];
} {
  const crm: string[] = [];
  const captured: Record<string, unknown>[] = [];
  const probed: string[] = [];
  const ctx = {
    plans: PLANS,
    channel: "whatsapp" as const,
    conversationId: "conv-1",
    contactId: "contact-1",
    logCrmEvent: (ev: { actor: string; event: string; preview?: string }) => {
      crm.push(`${ev.event}:${ev.preview ?? ""}`);
    },
    logSecurityEvent: () => {},
    captureLead: (input: Record<string, unknown>) => {
      captured.push(input);
      return Promise.resolve("captured" as const);
    },
    ...opts,
    crm,
    captured,
    probed,
  };
  return ctx as ToolContext & { crm: string[]; captured: Record<string, unknown>[]; probed: string[] };
}

const VALID = { name: "דנה כהן", phone: "0501234567", consent: true } as const;

// ── supported provider: unchanged flow ────────────────────────────────────────

Deno.test("book_callback video: SUPPORTED provider (DB true) books via the unchanged flow", async () => {
  const ctx = fakeCtx({
    providerSupportsZoom: (p: string) => {
      ctx.probed.push(p);
      return Promise.resolve(true);
    },
  });
  const r = await bookCallback(ctx, { ...VALID, meeting_type: "video", provider: "פרטנר", slot: "מחר" });
  assert(r.ok);
  assertEquals(ctx.probed, ["פרטנר"], "capability checked exactly once, canonical id");
  assertEquals(ctx.captured.length, 1, "lead captured");
  // The video request + verified provider land honestly on the lead row.
  assertEquals(ctx.captured[0].provider, "פרטנר");
  assert(String(ctx.captured[0].notes).includes("פגישת וידאו"), "video marker in notes");
  assert(String(ctx.captured[0].notes).includes("מועד מועדף: מחר"), "slot preserved");
  // §7b disclosure preserved (unchanged flow) + machine-readable verification flag.
  assert(r.note!.includes(COMMISSION_DISCLOSURE.slice(0, 20)));
  assertEquals(r.data!.videoMeetingSupported, true);
});

Deno.test("book_callback video: consent gate is NOT weakened — supported provider still needs consent", async () => {
  const ctx = fakeCtx({ providerSupportsZoom: () => Promise.resolve(true) });
  const r = await bookCallback(ctx, { name: "דנה כהן", phone: "0501234567", consent: false, meeting_type: "video", provider: "פרטנר" });
  assert(!r.ok);
  assertEquals(r.reason, "consent_required");
  assertEquals(ctx.captured.length, 0, "nothing written without consent");
});

// ── unsupported provider: polite structured refusal, nothing written ──────────

Deno.test("book_callback video: UNSUPPORTED provider (DB false) refuses UP FRONT, writes nothing", async () => {
  const ctx = fakeCtx({ providerSupportsZoom: () => Promise.resolve(false) });
  const r = await bookCallback(ctx, { ...VALID, meeting_type: "video", provider: "019 מובייל" });
  assert(!r.ok);
  assertEquals(r.reason, "video_not_supported");
  // The exact honest phrasing the app/meeting-book surface uses.
  assert(r.note!.includes("ספק זה אינו תומך כרגע בשיחות וידאו"));
  // ...and the alternative is offered (phone callback / regular lead).
  assert(r.note!.includes("שיחה טלפונית"));
  const d = r.data as Record<string, unknown>;
  assertEquals(d.videoMeetingSupported, false);
  assertEquals(d.capabilitySource, "db");
  assert(Array.isArray(d.alternatives) && (d.alternatives as string[]).includes("phone_callback"));
  assertEquals(ctx.captured.length, 0, "NO lead written for an unsupported video request");
  assert(ctx.crm.some((e) => e.startsWith("tool:book_callback") && e.includes("video_unsupported")));
});

Deno.test("book_callback video: DB row missing (probe false) is unsupported even for a catalogue provider", async () => {
  // The read-side default is unsupported: a false probe (row false OR no row)
  // rejects even a provider that happens to be in the offline fallback list —
  // the live table wins whenever it is readable.
  const ctx = fakeCtx({ providerSupportsZoom: () => Promise.resolve(false) });
  const r = await bookCallback(ctx, { ...VALID, meeting_type: "video", provider: "פרטנר" });
  assert(!r.ok);
  assertEquals(r.reason, "video_not_supported");
  assertEquals(ctx.captured.length, 0);
});

// ── DB error → const-list fallback (mirror the app/meeting-book semantics) ────

Deno.test("book_callback video: DB ERROR (null) falls back to the const list — supported id passes", async () => {
  const ctx = fakeCtx({ providerSupportsZoom: () => Promise.resolve(null) });
  const r = await bookCallback(ctx, { ...VALID, meeting_type: "video", provider: "בזק" });
  assert(r.ok, "בזק is in the 10-provider fallback list");
  assertEquals(ctx.captured.length, 1);
});

Deno.test("book_callback video: DB ERROR (null) falls back to the const list — non-listed id refused", async () => {
  const ctx = fakeCtx({ providerSupportsZoom: () => Promise.resolve(null) });
  const r = await bookCallback(ctx, { ...VALID, meeting_type: "video", provider: "019 מובייל" });
  assert(!r.ok);
  assertEquals(r.reason, "video_not_supported");
  assertEquals((r.data as Record<string, unknown>).capabilitySource, "fallback_list");
  assertEquals(ctx.captured.length, 0);
});

Deno.test("book_callback video: a THROWN probe behaves like a failed query (fallback, fail-soft)", async () => {
  const ctx = fakeCtx({ providerSupportsZoom: () => { throw new Error("db down"); } });
  const ok = await bookCallback(ctx, { ...VALID, meeting_type: "video", provider: "סלקום" });
  assert(ok.ok, "listed provider still bookable when the probe throws");

  const ctx2 = fakeCtx({ providerSupportsZoom: () => { throw new Error("db down"); } });
  const no = await bookCallback(ctx2, { ...VALID, meeting_type: "video", provider: "019 מובייל" });
  assert(!no.ok);
  assertEquals(no.reason, "video_not_supported");
});

Deno.test("book_callback video: no injected probe + no env → default DB read fails soft to the const list", async () => {
  // No ctx.providerSupportsZoom → providerSupportsZoomDb runs; with no
  // SUPABASE_URL/KEY in tests, fetchRows returns null → const-list fallback.
  // (Skip when a real env IS present — the injected-probe tests cover semantics.)
  if (Deno.env.get("SUPABASE_URL") && Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return;
  const ctx = fakeCtx();
  const r = await bookCallback(ctx, { ...VALID, meeting_type: "video", provider: "פלאפון" });
  assert(r.ok, "fallback list honoured without an injected probe");
});

// ── video with no provider: fail-closed for VIDEO only (asks, offers phone) ───

Deno.test("book_callback video: missing provider asks for it instead of booking blind", async () => {
  const ctx = fakeCtx({ providerSupportsZoom: () => Promise.resolve(true) });
  const r = await bookCallback(ctx, { ...VALID, meeting_type: "video" });
  assert(!r.ok);
  assertEquals(r.reason, "provider_required");
  assertEquals(ctx.captured.length, 0);
  assert(r.note!.includes("שיחה טלפונית"), "phone alternative offered");
});

// ── phone callbacks: NEVER gated ──────────────────────────────────────────────

Deno.test("book_callback PHONE: never consults the capability probe, flow unchanged", async () => {
  let probes = 0;
  const ctx = fakeCtx({ providerSupportsZoom: () => { probes++; return Promise.resolve(false); } });
  const r = await bookCallback(ctx, { ...VALID, slot: "בערב" });
  assert(r.ok);
  assertEquals(probes, 0, "phone path never probes zoom capability");
  assertEquals(ctx.captured.length, 1);
  // Pre-existing behavior preserved exactly: no provider stamped, slot in notes,
  // no video marker.
  assertEquals(ctx.captured[0].provider, undefined);
  assertEquals(ctx.captured[0].notes, "מועד מועדף: בערב");
});

Deno.test("book_callback: explicit meeting_type='phone' stays ungated even if notes mention zoom", async () => {
  let probes = 0;
  const ctx = fakeCtx({ providerSupportsZoom: () => { probes++; return Promise.resolve(false); } });
  const r = await bookCallback(ctx, { ...VALID, meeting_type: "phone", notes: "לא רוצה זום, רק טלפון" });
  assert(r.ok);
  assertEquals(probes, 0);
});

Deno.test("book_callback: zoom/video wording in slot/notes IS gated even without meeting_type", async () => {
  const ctx = fakeCtx({ providerSupportsZoom: () => Promise.resolve(false) });
  const r = await bookCallback(ctx, { ...VALID, slot: "פגישת זום מחר", provider: "019 מובייל" });
  assert(!r.ok, "keyword-detected video request cannot bypass the gate");
  assertEquals(r.reason, "video_not_supported");
  assertEquals(ctx.captured.length, 0);
});

// ── pure helpers: detection + resolution semantics ────────────────────────────

Deno.test("isVideoMeetingRequest: explicit type wins both ways; keywords sniffed otherwise", () => {
  assertEquals(isVideoMeetingRequest({ meeting_type: "video" }), true);
  assertEquals(isVideoMeetingRequest({ meeting_type: "zoom" }), true);
  assertEquals(isVideoMeetingRequest({ meeting_type: "phone", notes: "זום" }), false);
  assertEquals(isVideoMeetingRequest({ slot: "מחר בערב" }), false);
  assertEquals(isVideoMeetingRequest({ notes: "רוצה פגישת וידאו" }), true);
  assertEquals(isVideoMeetingRequest({ slot: "zoom tomorrow" }), true);
  assertEquals(isVideoMeetingRequest({}), false);
});

Deno.test("resolveZoomSupport mirrors meeting-book semantics exactly", () => {
  // DB answer wins whenever readable.
  assertEquals(resolveZoomSupport("019 מובייל", true), true);
  assertEquals(resolveZoomSupport("פרטנר", false), false);
  // DB unreadable → const fallback.
  assertEquals(resolveZoomSupport("פרטנר", null), true);
  assertEquals(resolveZoomSupport("019 מובייל", null), false);
  // Empty provider is never supported.
  assertEquals(resolveZoomSupport("", true), false);
  assertEquals(resolveZoomSupport(undefined, null), false);
});

Deno.test("fallback const stays in lockstep with meeting-book/lib.ts (the 10 exact catalogue ids)", () => {
  assertEquals(
    [...ZOOM_SUPPORTED_PROVIDERS_FALLBACK].sort(),
    [...ZOOM_SUPPORTED_PROVIDERS].sort(),
    "tools.ts fallback and meeting-book fallback MUST agree",
  );
  assertEquals(ZOOM_SUPPORTED_PROVIDERS_FALLBACK.size, 10);
  for (
    const p of ["פרטנר", "yes", "STING TV", "HOT", "NextTV", "סלקום", "גולן טלקום", "בזק", "פלאפון", "הוט מובייל"]
  ) {
    assert(ZOOM_SUPPORTED_PROVIDERS_FALLBACK.has(p), `fallback contains ${p}`);
  }
});

// ── declaration: the model is taught the video path + params exist ────────────

Deno.test("book_callback declaration teaches the video pre-check and exposes the new params", () => {
  const decl = TOOL_DECLARATIONS.find((d) => d.name === "book_callback")!;
  assert(decl, "book_callback declaration present");
  const props = (decl.parameters as { properties: Record<string, unknown>; required: string[] }).properties;
  assert("meeting_type" in props, "meeting_type param declared");
  assert("provider" in props, "provider param declared");
  // Consent remains mandatory — the guard chain is untouched.
  assertEquals((decl.parameters as { required: string[] }).required, ["name", "phone", "consent"]);
  assert(decl.description.includes("וידאו"), "description covers the video path");
});
