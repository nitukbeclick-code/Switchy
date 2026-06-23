// Tests for the site-push-notify deal-feed Web Push sender.
//
//   • deals.ts (PURE): material-drop threshold, drop detection over a history,
//     quiet-hours (Israel, DST-aware), category/opt-out targeting, dedupe key,
//     Hebrew copy.
//   • webpush.ts: base64url round-trip, VAPID JWT structure + a real ES256
//     signature VERIFIED with the public key, and a FULL RFC 8291 aes128gcm
//     encrypt→decrypt round-trip proving the ciphertext decrypts to the payload.
//   • sendWebPush: 201 ok, 410 → expired (prune), network error → soft fail —
//     all via a stub fetch (NO real push is ever sent).
//
// No env, no real network. Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import {
  buildPushMessage,
  CATEGORY_HE,
  detectDrops,
  dropDedupeKey,
  inQuietHours,
  isMaterialDrop,
  israelHour,
  type PriceDrop,
  type PriceSnapshot,
  type Subscription,
  subscriptionWantsCategory,
} from "../site-push-notify/deals.ts";
import {
  b64urlToBytes,
  buildVapidJwt,
  bytesToB64url,
  encryptPayload,
  endpointAudience,
  importVapidKeys,
  type PushTarget,
  sendWebPush,
  type VapidKeys,
} from "../site-push-notify/webpush.ts";

// ── helpers ────────────────────────────────────────────────────────────────────
function snap(
  plan_id: string,
  price: number,
  captured_at: string,
  category = "cellular",
  provider = "סלקום",
): PriceSnapshot {
  return { plan_id, category, provider, price, captured_at };
}
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ════════════════════════════════════════════════════════════════════════════
// deals.ts — thresholds
// ════════════════════════════════════════════════════════════════════════════

Deno.test("isMaterialDrop: >= ₪5 absolute clears even at low %", () => {
  assert(isMaterialDrop(300, 295)); // ₪5 on ₪300 = 1.7% but absolute floor met
});

Deno.test("isMaterialDrop: >= 10% clears even when under ₪5", () => {
  assert(isMaterialDrop(20, 16)); // ₪4 but 20%
});

Deno.test("isMaterialDrop: a sub-₪5 AND sub-10% wobble does NOT qualify", () => {
  assertEquals(isMaterialDrop(100, 96), false); // ₪4 / 4%
});

Deno.test("isMaterialDrop: a price INCREASE or no-change never qualifies", () => {
  assertEquals(isMaterialDrop(50, 60), false);
  assertEquals(isMaterialDrop(50, 50), false);
});

// ════════════════════════════════════════════════════════════════════════════
// deals.ts — detectDrops
// ════════════════════════════════════════════════════════════════════════════

Deno.test("detectDrops: latest-vs-previous material drop is detected", () => {
  const drops = detectDrops([
    snap("p1", 99, isoDaysAgo(3)),
    snap("p1", 79, isoDaysAgo(1)), // -20 → material
  ]);
  assertEquals(drops.length, 1);
  assertEquals(drops[0].planId, "p1");
  assertEquals(drops[0].oldPrice, 99);
  assertEquals(drops[0].newPrice, 79);
  assertEquals(drops[0].dropAmount, 20);
});

Deno.test("detectDrops: a single snapshot (no prior) yields no drop", () => {
  assertEquals(detectDrops([snap("p1", 79, isoDaysAgo(1))]).length, 0);
});

Deno.test("detectDrops: a drop OLDER than the window is not re-announced", () => {
  const drops = detectDrops(
    [snap("p1", 99, isoDaysAgo(40)), snap("p1", 50, isoDaysAgo(30))],
    Date.now(),
    7 * 86_400_000,
  );
  assertEquals(drops.length, 0);
});

Deno.test("detectDrops: an immaterial latest move is ignored", () => {
  const drops = detectDrops([snap("p1", 100, isoDaysAgo(2)), snap("p1", 98, isoDaysAgo(1))]);
  assertEquals(drops.length, 0); // ₪2 / 2%
});

Deno.test("detectDrops: rows out of order are sorted; newest pair compared", () => {
  const drops = detectDrops([
    snap("p1", 79, isoDaysAgo(1)), // newest
    snap("p1", 99, isoDaysAgo(5)), // oldest
    snap("p1", 90, isoDaysAgo(3)), // middle → this is the "previous" to newest
  ]);
  assertEquals(drops.length, 1);
  assertEquals(drops[0].oldPrice, 90); // immediately previous, not the oldest
  assertEquals(drops[0].newPrice, 79);
});

Deno.test("detectDrops: multiple plans sorted by biggest absolute saving first", () => {
  const drops = detectDrops([
    snap("small", 50, isoDaysAgo(2)),
    snap("small", 40, isoDaysAgo(1)), // -10
    snap("big", 200, isoDaysAgo(2)),
    snap("big", 150, isoDaysAgo(1)), // -50
  ]);
  assertEquals(drops.map((d) => d.planId), ["big", "small"]);
});

Deno.test("detectDrops: malformed rows (null price / bad date) are skipped", () => {
  const drops = detectDrops([
    { plan_id: "p1", category: "cellular", provider: "x", price: null, captured_at: isoDaysAgo(2) },
    snap("p1", 99, isoDaysAgo(2)),
    snap("p1", 70, isoDaysAgo(1)),
    { plan_id: "", category: "cellular", provider: "x", price: 10, captured_at: "nope" },
  ]);
  assertEquals(drops.length, 1);
  assertEquals(drops[0].newPrice, 70);
});

// ════════════════════════════════════════════════════════════════════════════
// deals.ts — quiet hours (Israel, DST-aware)
// ════════════════════════════════════════════════════════════════════════════

Deno.test("israelHour: summer (IDT, UTC+3) shifts the UTC hour by 3", () => {
  // 2026-07-01 05:00 UTC → 08:00 Israel (IDT).
  const t = Date.parse("2026-07-01T05:00:00Z");
  assertEquals(israelHour(t), 8);
});

Deno.test("israelHour: winter (IST, UTC+2) shifts the UTC hour by 2", () => {
  // 2026-01-01 05:00 UTC → 07:00 Israel (IST).
  const t = Date.parse("2026-01-01T05:00:00Z");
  assertEquals(israelHour(t), 7);
});

Deno.test("inQuietHours: 02:00 Israel is quiet; 12:00 Israel is not", () => {
  // Winter: Israel 02:00 = 00:00 UTC; Israel 12:00 = 10:00 UTC.
  assert(inQuietHours(Date.parse("2026-01-15T00:00:00Z")));
  assertEquals(inQuietHours(Date.parse("2026-01-15T10:00:00Z")), false);
});

Deno.test("inQuietHours: 08:00 Israel is NOT quiet (window is [23:00,08:00) )", () => {
  // Winter: Israel 08:00 = 06:00 UTC.
  assertEquals(inQuietHours(Date.parse("2026-01-15T06:00:00Z")), false);
});

Deno.test("inQuietHours: 23:00 Israel IS quiet (inclusive)", () => {
  // Winter: Israel 23:00 = 21:00 UTC.
  assert(inQuietHours(Date.parse("2026-01-15T21:00:00Z")));
});

// ════════════════════════════════════════════════════════════════════════════
// deals.ts — targeting
// ════════════════════════════════════════════════════════════════════════════

const noonIsrael = Date.parse("2026-01-15T10:00:00Z"); // 12:00 Israel (not quiet)

function sub(partial: Partial<Subscription>): Subscription {
  return {
    id: "s1",
    endpoint: "https://push.example/x",
    p256dh: "p",
    auth: "a",
    categories: [],
    ...partial,
  };
}

Deno.test("subscriptionWantsCategory: empty categories = all categories", () => {
  assert(subscriptionWantsCategory(sub({ categories: [] }), "tv", noonIsrael));
});

Deno.test("subscriptionWantsCategory: a category filter is honored both ways", () => {
  const s = sub({ categories: ["cellular", "internet"] });
  assert(subscriptionWantsCategory(s, "cellular", noonIsrael));
  assertEquals(subscriptionWantsCategory(s, "tv", noonIsrael), false);
});

Deno.test("subscriptionWantsCategory: opted_out is a hard mute", () => {
  assertEquals(subscriptionWantsCategory(sub({ opted_out: true }), "cellular", noonIsrael), false);
});

Deno.test("subscriptionWantsCategory: quiet_hours suppresses during the quiet window", () => {
  const quiet = Date.parse("2026-01-15T00:00:00Z"); // 02:00 Israel
  assertEquals(subscriptionWantsCategory(sub({ quiet_hours: true }), "cellular", quiet), false);
  // ...but the same subscriber gets it during the day
  assert(subscriptionWantsCategory(sub({ quiet_hours: true }), "cellular", noonIsrael));
  // ...and a subscriber who DISABLED quiet hours gets it overnight
  assert(subscriptionWantsCategory(sub({ quiet_hours: false }), "cellular", quiet));
});

// ════════════════════════════════════════════════════════════════════════════
// deals.ts — dedupe + copy
// ════════════════════════════════════════════════════════════════════════════

const sampleDrop: PriceDrop = {
  planId: "p1",
  category: "cellular",
  provider: "סלקום",
  oldPrice: 99,
  newPrice: 79,
  dropAmount: 20,
  dropPct: 20.2,
  capturedAt: "2026-06-23T10:00:00Z",
};

Deno.test("dropDedupeKey: stable per (sub, plan, captured_at); a later drop is a new key", () => {
  const k1 = dropDedupeKey("s1", sampleDrop);
  assertEquals(k1, dropDedupeKey("s1", sampleDrop)); // stable
  const later = { ...sampleDrop, capturedAt: "2026-06-24T10:00:00Z" };
  assert(k1 !== dropDedupeKey("s1", later)); // a further drop → new key
  assert(k1 !== dropDedupeKey("s2", sampleDrop)); // different subscriber → new key
});

Deno.test("buildPushMessage: Hebrew copy states the real old→new price, no invented per-user saving", () => {
  const msg = buildPushMessage(sampleDrop);
  assert(msg.title.includes("סלקום"));
  assert(msg.title.includes(CATEGORY_HE.cellular));
  assert(msg.body.includes("99"));
  assert(msg.body.includes("79"));
  assert(msg.body.includes("20")); // the per-month delta, which IS real
  assert(msg.data.url.includes("category=cellular"));
});

Deno.test("buildPushMessage: deep-link uses the configured site origin", () => {
  const msg = buildPushMessage(sampleDrop, "https://www.switchy-ai.com/");
  assert(msg.data.url.startsWith("https://www.switchy-ai.com/compare"));
});

// ════════════════════════════════════════════════════════════════════════════
// webpush.ts — base64url codec
// ════════════════════════════════════════════════════════════════════════════

Deno.test("base64url round-trips arbitrary bytes (incl. +,/ producing chars)", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 62, 63]);
  const s = bytesToB64url(bytes);
  assertEquals(s.includes("+"), false);
  assertEquals(s.includes("/"), false);
  assertEquals(s.includes("="), false);
  assertEquals([...b64urlToBytes(s)], [...bytes]);
});

Deno.test("endpointAudience: origin only (scheme+host), no path", () => {
  assertEquals(
    endpointAudience("https://fcm.googleapis.com/fcm/send/abc123"),
    "https://fcm.googleapis.com",
  );
});

// ── shared VAPID keypair for the JWT tests ─────────────────────────────────────
async function makeVapid(): Promise<{ keys: VapidKeys; verifyKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)); // 65-byte point
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const keys = await importVapidKeys(bytesToB64url(rawPub), jwk.d as string);
  return { keys, verifyKey: pair.publicKey };
}

Deno.test("buildVapidJwt: three segments, ES256 header, expected claims", async () => {
  const { keys } = await makeVapid();
  const jwt = await buildVapidJwt(keys, "https://push.example", "mailto:a@b.com", 1_000_000);
  const parts = jwt.split(".");
  assertEquals(parts.length, 3);
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  assertEquals(header.alg, "ES256");
  assertEquals(header.typ, "JWT");
  assertEquals(payload.aud, "https://push.example");
  assertEquals(payload.sub, "mailto:a@b.com");
  assertEquals(payload.exp, 1_000_000 + 12 * 60 * 60);
});

Deno.test("buildVapidJwt: the ES256 signature VERIFIES against the public key", async () => {
  const { keys, verifyKey } = await makeVapid();
  const jwt = await buildVapidJwt(keys, "https://push.example", "mailto:a@b.com");
  const [h, p, s] = jwt.split(".");
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verifyKey,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  assert(ok, "VAPID JWT signature must verify");
});

Deno.test("importVapidKeys: rejects a malformed public key", async () => {
  let threw = false;
  try {
    await importVapidKeys(bytesToB64url(new Uint8Array(10)), "x");
  } catch (_) {
    threw = true;
  }
  assert(threw, "a non-65-byte public point must be rejected");
});

// ════════════════════════════════════════════════════════════════════════════
// webpush.ts — RFC 8291 aes128gcm encrypt → decrypt round-trip
// ════════════════════════════════════════════════════════════════════════════
//
// Generate a recipient ECDH keypair (the "browser") + a 16-byte auth secret,
// encrypt a payload to its public key with our encryptPayload, then perform the
// recipient's decryption (the exact inverse) and assert the plaintext matches.
// This proves the HKDF/ECDH/GCM wiring is correct without any network.

async function hkdfRaw(salt: BufferSource, ikm: BufferSource, info: BufferSource, len: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8),
  );
}
function cat(...a: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}

Deno.test("encryptPayload: produces an RFC 8188 body that the recipient can decrypt", async () => {
  const recipient = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;
  const recipientPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", recipient.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));

  const plaintext = new TextEncoder().encode(JSON.stringify({ title: "מחיר ירד", body: "₪99→₪79" }));
  const { body, headers } = await encryptPayload(
    plaintext,
    bytesToB64url(recipientPubRaw),
    bytesToB64url(authSecret),
  );
  assertEquals(headers["Content-Encoding"], "aes128gcm");

  // ── parse the RFC 8188 header: salt(16) ‖ rs(4) ‖ idlen(1) ‖ keyid(idlen) ──
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const serverPubRaw = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  assertEquals(idlen, 65); // uncompressed P-256 point

  // ── recipient ECDH with the server's ephemeral public key ──
  const serverKey = await crypto.subtle.importKey(
    "raw",
    serverPubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, recipient.privateKey, 256),
  );

  // ── re-derive IKM, CEK, nonce exactly as the sender did ──
  const te = (s: string) => new TextEncoder().encode(s);
  const keyInfo = cat(te("WebPush: info\0"), recipientPubRaw, serverPubRaw);
  const ikm = await hkdfRaw(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdfRaw(salt, ikm, te("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfRaw(salt, ikm, te("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["decrypt"]);
  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, ciphertext),
  );

  // ── strip the trailing 0x02 record-delimiter padding byte (RFC 8188) ──
  assertEquals(decrypted[decrypted.length - 1], 0x02);
  const recovered = decrypted.slice(0, decrypted.length - 1);
  assertEquals(new TextDecoder().decode(recovered), new TextDecoder().decode(plaintext));
});

// ════════════════════════════════════════════════════════════════════════════
// webpush.ts — sendWebPush outcome mapping (stub fetch; no real push)
// ════════════════════════════════════════════════════════════════════════════

async function makeTargetAndKeys(): Promise<{ target: PushTarget; keys: VapidKeys }> {
  const recipient = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;
  const recipientPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", recipient.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const { keys } = await makeVapid();
  return {
    target: {
      endpoint: "https://push.example/sub/abc",
      p256dh: bytesToB64url(recipientPubRaw),
      auth: bytesToB64url(auth),
    },
    keys,
  };
}

Deno.test("sendWebPush: 201 → ok, not expired", async () => {
  const { target, keys } = await makeTargetAndKeys();
  let calledUrl = "";
  const stub: typeof fetch = (input, init) => {
    calledUrl = String(input);
    // assert the VAPID + encryption headers are present
    const h = new Headers(init?.headers);
    assert(h.get("Authorization")?.startsWith("vapid t="));
    assertEquals(h.get("Content-Encoding"), "aes128gcm");
    return Promise.resolve(new Response("", { status: 201 }));
  };
  const out = await sendWebPush(target, new TextEncoder().encode("{}"), keys, "mailto:a@b.com", 3600, stub);
  assertEquals(out.ok, true);
  assertEquals(out.expired, false);
  assertEquals(calledUrl, target.endpoint);
});

Deno.test("sendWebPush: 410 Gone → expired (caller prunes)", async () => {
  const { target, keys } = await makeTargetAndKeys();
  const stub: typeof fetch = () => Promise.resolve(new Response("", { status: 410 }));
  const out = await sendWebPush(target, new TextEncoder().encode("{}"), keys, "mailto:a@b.com", 3600, stub);
  assertEquals(out.ok, false);
  assertEquals(out.expired, true);
  assertEquals(out.status, 410);
});

Deno.test("sendWebPush: a thrown network error is reported soft (status 0), never raised", async () => {
  const { target, keys } = await makeTargetAndKeys();
  const stub: typeof fetch = () => Promise.reject(new Error("network down"));
  const out = await sendWebPush(target, new TextEncoder().encode("{}"), keys, "mailto:a@b.com", 3600, stub);
  assertEquals(out.ok, false);
  assertEquals(out.expired, false);
  assertEquals(out.status, 0);
});
