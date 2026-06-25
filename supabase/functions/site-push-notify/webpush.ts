// Web Push (RFC 8030 / 8291 / 8188) over WebCrypto — no npm, no native deps.
//
// This is the cryptographic core of the deal-feed sender. It does two things,
// both with the Deno-built-in WebCrypto (`crypto.subtle`), so it runs unchanged
// on Supabase Edge and is fully testable offline:
//
//   1. VAPID (RFC 8292) — a signed JWT (ES256 / ECDSA P-256) proving to the push
//      service that WE own the application server key. The `Authorization: vapid`
//      header + the server's public key (`crypto-key`/`p256ecdsa`) authenticate
//      the request.
//
//   2. Message encryption (RFC 8291, content-coding `aes128gcm` per RFC 8188) —
//      the payload is encrypted END-TO-END to the subscription's public key
//      (`p256dh` + `auth`) so the push service relays ciphertext it cannot read.
//      ECDH(server ephemeral, client p256dh) → HKDF → CEK + nonce → AES-128-GCM.
//
// Nothing here talks to the DB or reads config; `sendWebPush` is the only fn that
// performs network I/O (the POST to the push endpoint). Tests inject a fetch stub
// or just exercise the pure crypto/codec helpers — no real push is ever sent.
//
// Refs: RFC 8030 (Web Push), RFC 8291 (Message Encryption), RFC 8188
// (aes128gcm), RFC 8292 (VAPID).

// ── base64url codec ──────────────────────────────────────────────────────────
// Web Push keys and JWT segments are all base64url (no padding). These convert
// to/from raw bytes without ever touching a Buffer (Deno-friendly).

// Every byte helper returns a Uint8Array backed by a concrete ArrayBuffer (not
// the wider ArrayBufferLike) so the values satisfy WebCrypto's BufferSource /
// fetch's BodyInit under Deno's strict DOM lib.
export function b64urlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  // Restore standard base64 alphabet + padding, then decode.
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function utf8(s: string): Uint8Array<ArrayBuffer> {
  // Copy into a fresh ArrayBuffer-backed view (TextEncoder's output type is the
  // wider ArrayBufferLike under the strict lib).
  const src = new TextEncoder().encode(s);
  const out = new Uint8Array(src.length);
  out.set(src);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ── VAPID keys ───────────────────────────────────────────────────────────────
// The application server (us) holds an ECDSA P-256 keypair. The PUBLIC key is the
// 65-byte uncompressed point (0x04 ‖ X ‖ Y), base64url-encoded — that's what the
// browser registered with and what we echo in the `p256ecdsa` header. The PRIVATE
// key is the 32-byte `d` scalar, base64url-encoded. We import the private key via
// JWK (we reconstruct x/y from the public point), which avoids PKCS#8 wrangling.

export interface VapidKeys {
  publicKey: string; // base64url of the 65-byte uncompressed point
  privateKey: CryptoKey; // ECDSA P-256 private, usages: ["sign"]
}

// Reconstruct the JWK coordinates from the raw VAPID material and import a
// signing key. Throws on malformed input so the caller can fail-soft to "not
// configured" rather than silently mis-sign.
export async function importVapidKeys(
  publicKeyB64url: string,
  privateKeyB64url: string,
): Promise<VapidKeys> {
  const pub = b64urlToBytes(publicKeyB64url);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  }
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  // JWK coordinates and the private scalar `d` are all base64url already.
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d: privateKeyB64url,
    ext: true,
    key_ops: ["sign"],
  };
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return { publicKey: publicKeyB64url, privateKey };
}

// ── VAPID JWT (ES256) ────────────────────────────────────────────────────────
// `aud` is the push endpoint's origin, `exp` is short-lived (≤24h; we use 12h),
// `sub` is a mailto:/https: contact the push service can reach. WebCrypto returns
// ECDSA signatures already in the raw r‖s (IEEE-P1363) form JWS requires.

export function endpointAudience(endpoint: string): string {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.host}`;
}

export async function buildVapidJwt(
  keys: VapidKeys,
  audience: string,
  subject: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  ttlSec = 12 * 60 * 60,
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: nowSec + ttlSec, sub: subject };
  const signingInput = `${bytesToB64url(utf8(JSON.stringify(header)))}.${
    bytesToB64url(utf8(JSON.stringify(payload)))
  }`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    utf8(signingInput),
  );
  return `${signingInput}.${bytesToB64url(sig)}`;
}

// The two VAPID auth headers for a request to `endpoint`.
export async function vapidHeaders(
  keys: VapidKeys,
  endpoint: string,
  subject: string,
  nowSec?: number,
): Promise<{ Authorization: string; "Crypto-Key": string }> {
  const jwt = await buildVapidJwt(keys, endpointAudience(endpoint), subject, nowSec);
  return {
    Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
    // legacy `Crypto-Key` header kept for push services that still read it
    "Crypto-Key": `p256ecdsa=${keys.publicKey}`,
  };
}

// ── HKDF (RFC 5869) over WebCrypto ───────────────────────────────────────────
async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// ── aes128gcm payload encryption (RFC 8291 + RFC 8188) ───────────────────────
// Produces the full request body: header block (salt ‖ rs ‖ idlen ‖ keyid) ‖
// ciphertext. `keyid` is the server's ephemeral public key, so the recipient can
// run the same ECDH. We append the single 0x02 record-delimiter padding byte to
// the plaintext (last-record marker) before sealing, per RFC 8188.
export interface EncryptedPush {
  body: Uint8Array<ArrayBuffer>; // the bytes to POST
  headers: Record<string, string>; // Content-Encoding/Length etc.
}

const RECORD_SIZE = 4096; // we always send a single record; rs is fixed

export async function encryptPayload(
  plaintext: Uint8Array,
  clientP256dhB64url: string,
  clientAuthB64url: string,
  // injectable so tests are deterministic; production passes nothing.
  ephemeral?: CryptoKeyPair,
  salt?: Uint8Array<ArrayBuffer>,
): Promise<EncryptedPush> {
  const clientPub = b64urlToBytes(clientP256dhB64url);
  const authSecret = b64urlToBytes(clientAuthB64url);
  if (clientPub.length !== 65 || clientPub[0] !== 0x04) {
    throw new Error("subscription p256dh must be a 65-byte uncompressed point");
  }

  // 1) Server ephemeral ECDH keypair (fresh per message).
  const eph = ephemeral ?? await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));

  // 2) ECDH shared secret with the client's static public key.
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, eph.privateKey, 256),
  );

  // 3) RFC 8291 key derivation:
  //    PRK_key = HKDF(auth_secret, ecdh, "WebPush: info" ‖ ua_pub ‖ as_pub, 32)
  const keyInfo = concatBytes(
    utf8("WebPush: info\0"),
    clientPub, // user-agent (recipient) public key
    serverPubRaw, // application-server (our ephemeral) public key
  );
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);

  // 4) The aes128gcm salt (16 random bytes) keys the next two HKDFs.
  const realSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(realSalt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(realSalt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // 5) Seal plaintext ‖ 0x02 (single, last record) with AES-128-GCM.
  const padded = concatBytes(plaintext, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded),
  );

  // 6) RFC 8188 header: salt(16) ‖ rs(4, big-endian) ‖ idlen(1) ‖ keyid(serverPub).
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE, false);
  const header = concatBytes(
    realSalt,
    rs,
    new Uint8Array([serverPubRaw.length]),
    serverPubRaw,
  );
  const body = concatBytes(header, sealed);

  return {
    body,
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.length),
    },
  };
}

// ── send ─────────────────────────────────────────────────────────────────────
// One push to one subscription. Returns a coarse outcome the caller uses to
// prune dead endpoints (404/410) vs retry-later (429/5xx) vs ok. Never throws —
// a network error is reported as { status: 0, expired: false }.
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushOutcome {
  status: number;
  ok: boolean;
  expired: boolean; // 404/410 → the subscription is gone; prune it
  error?: string;
}

export async function sendWebPush(
  target: PushTarget,
  payload: Uint8Array,
  keys: VapidKeys,
  subject: string,
  ttlSec = 24 * 60 * 60,
  fetchImpl: typeof fetch = fetch,
): Promise<PushOutcome> {
  try {
    const enc = await encryptPayload(payload, target.p256dh, target.auth);
    const vapid = await vapidHeaders(keys, target.endpoint, subject);
    const res = await fetchImpl(target.endpoint, {
      method: "POST",
      headers: {
        ...enc.headers,
        ...vapid,
        TTL: String(ttlSec),
        Urgency: "normal",
      },
      body: enc.body,
    });
    // Drain the body so the connection can be reused / closed cleanly.
    await res.text().catch(() => "");
    const expired = res.status === 404 || res.status === 410;
    return { status: res.status, ok: res.status >= 200 && res.status < 300, expired };
  } catch (e) {
    return { status: 0, ok: false, expired: false, error: String(e) };
  }
}
