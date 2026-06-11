// Telegram Mini App (Web App) auth — validates the `initData` string that the
// Telegram client hands to the rep console page, proving the request really
// came from a Telegram user inside our bot. Algorithm per Telegram docs:
//   secret_key  = HMAC_SHA256(key="WebAppData", msg=<bot_token>)
//   check_hash  = HMAC_SHA256(key=secret_key, msg=<data_check_string>)
// where data_check_string is every initData field except `hash`, sorted by key
// and joined with newlines. We then constant-time compare to the supplied hash
// and (optionally) reject stale auth_dates.

export interface TgWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

async function hmac(keyData: Uint8Array, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}

function toHex(u8: Uint8Array): string {
  let out = "";
  for (const b of u8) out += b.toString(16).padStart(2, "0");
  return out;
}

// Constant-time string compare (avoids leaking the hash via timing).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/// The data-check-string Telegram signs: all params except `hash`, sorted,
/// `key=value` joined by `\n`. Exposed for testing.
export function dataCheckString(initData: string): string {
  const params = new URLSearchParams(initData);
  params.delete("hash");
  const pairs: string[] = [];
  for (const [k, v] of params.entries()) pairs.push(`${k}=${v}`);
  pairs.sort();
  return pairs.join("\n");
}

/// Validates `initData` against the bot token; returns the Telegram user when
/// the signature is valid and fresh, otherwise null. [maxAgeSec]=0 disables the
/// freshness check (used in tests).
export async function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86400,
  nowMs?: number,
): Promise<TgWebAppUser | null> {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const secret = await hmac(new TextEncoder().encode("WebAppData"), botToken);
  const computed = toHex(await hmac(secret, dataCheckString(initData)));
  if (!timingSafeEqual(computed, hash)) return null;

  if (maxAgeSec > 0) {
    const authDate = Number(params.get("auth_date") || 0);
    const now = (nowMs ?? Date.now()) / 1000;
    if (!authDate || now - authDate > maxAgeSec) return null;
  }

  try {
    const u = JSON.parse(params.get("user") || "null");
    return u && typeof u.id === "number" ? u as TgWebAppUser : null;
  } catch {
    return null;
  }
}

/// Validates AND authorizes: the user must be on the rep allowlist (same gate
/// as the bot commands). An empty allowlist authorizes any valid Telegram user
/// (mirrors the bot's "anyone in the team chat" fallback). Returns the user or
/// null.
export async function authorizeRep(
  initData: string,
  botToken: string,
  allowedUserIds: number[],
  maxAgeSec = 86400,
  nowMs?: number,
): Promise<TgWebAppUser | null> {
  const user = await validateInitData(initData, botToken, maxAgeSec, nowMs);
  if (!user) return null;
  if (allowedUserIds.length > 0 && !allowedUserIds.includes(user.id)) return null;
  return user;
}
