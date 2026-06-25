// ─────────────────────────────────────────────────────────────────────────────
// telegram-user-webhook — the PUBLIC, customer-facing Telegram bot for
// Switchy AI. End users DM this bot; it answers with the SHARED grounded,
// multilingual agent (_shared/agent.ts runAgent) over the live catalogue, captures
// consent-gated leads, and honours §30A STOP. This is NOT the internal rep bot
// (telegram-webhook/) — that one trusts an allowlist and relays to WhatsApp; this
// one trusts no one and never markets without consent.
//
// SHIPS DARK (like VAPID): the whole function FAILS SOFT when its bot token
// (TELEGRAM_USER_BOT_TOKEN) is unset — webhook POSTs become a 503 no-op and the
// secret-gated set-webhook action returns "disabled". So it can be deployed before
// the bot is provisioned without sending anything or erroring loudly.
//
// THE GUARD CHAIN (in order, ABOVE the agent — mirrors whatsapp-webhook):
//   0. token present?            — else 503 no-op (ships dark)
//   1. secret_token verify       — Telegram's x-telegram-bot-api-secret-token,
//                                  a SHA-256 digest of lead_webhook_secret (the
//                                  same scheme notify-lead/telegram-webhook use).
//                                  Fail CLOSED when the secret is unset.
//   2. per-chat rate limit       — bound AI fan-out cost per chat (shed with a
//                                  soft "one moment" reply, still 200 to Telegram).
//   3. §30A STOP / opt-out       — checked FIRST among message handling: flip to
//                                  suppressed, send ONE confirmation, RETURN.
//   4. §11 first-contact note    — appended once (who we are + privacy + STOP).
//   5. consent before lead       — runAgent's create_lead/book_callback tools
//                                  refuse without consent===true (captureAiLead).
//
// Endpoints:
//   POST /                    — Telegram update (secret_token-gated).
//   POST /?action=set-webhook — register the webhook with Telegram (x-webhook-
//                               secret-gated; sets the secret_token + allowed_updates).
//
// Deploy with verify_jwt=false (Telegram cannot send a Supabase JWT) — the
// secret_token check is the auth.  supabase functions deploy telegram-user-webhook --no-verify-jwt
// Env: TELEGRAM_USER_BOT_TOKEN (the user bot's token — REQUIRED; absent ⇒ dark),
//   lead_webhook_secret via vault/env (the webhook secret), Gemini via vault
//   gemini_api_key (or GEMINI_API_KEY/GOOGLE_AI_KEY), optional GROQ_API_KEY/
//   OPENROUTER_API_KEY, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for persistence.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  firstEnv,
  resolveCfgCached,
  safeEqual,
  tgWebhookToken,
} from "../_shared/config.ts";
import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import {
  isDataAccessRequest,
  isErasureRequest,
  recordErasureRequest,
  summarizeDataFor,
} from "../_shared/compliance.ts";
import { jlog } from "../_shared/log.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { type AiKeys, type ChatTurn } from "../_shared/ai.ts";
import { type Plan, plansFromRows } from "../_shared/catalogue.ts";
import { captureAiLead, type AiLeadInput } from "../_shared/leads.ts";
import { runAgent } from "../_shared/agent.ts";
import { esc, NL, sendTelegram } from "../_shared/telegram.ts";
import {
  appendTurn,
  asChatTurns,
  type ChatSession,
  emptySession,
  loadSession,
  recordToolCall,
  saveSession,
} from "../_shared/session.ts";
import {
  chunkTelegram,
  HANDOFF_ACK_REPLY,
  HANDOFF_RELAY_FAIL_REPLY,
  HELP_REPLY,
  isOptOut,
  langFromTelegramLocale,
  OPTOUT_CONFIRM_REPLY,
  parseInbound,
  telegramSessionId,
  telegramUpdateDedupKey,
  type TgUserUpdate,
  wantsHuman,
  WELCOME_REPLY,
  welcomeCategoryKeyboard,
  withFirstContactNote,
} from "./lib.ts";

// The user bot's OWN token — distinct from the rep bot's TELEGRAM_BOT_TOKEN.
// Absent ⇒ the function ships dark (503 no-op). Read at module load; the value is
// stable for the isolate's lifetime.
const USER_BOT_TOKEN = firstEnv(["TELEGRAM_USER_BOT_TOKEN"]);

// Per-chat AI fan-out cap: at most this many inbound turns per chat per window
// reach the (paid) agent; beyond it we send a soft "one moment" line. The secret
// gate is the real auth — this just bounds cost on a hot isolate.
const PER_CHAT_LIMIT = 20;
const PER_CHAT_WINDOW_MS = 60_000;

// ── catalogue grounding (live public.plans, cached per isolate) ───────────────
let _plans: Plan[] | null = null;
async function getPlans(): Promise<Plan[]> {
  if (_plans) return _plans;
  const rows = await fetchRows<Record<string, unknown>>(
    "/rest/v1/plans?select=id,provider,category,price,price_unit,specs,subtitle,kind,title&limit=1000",
  );
  _plans = rows ? plansFromRows(rows) : [];
  return _plans;
}

// Gemini key: vault (gemini_api_key, via the shared config RPC) → env. The other
// providers (Groq / OpenRouter) are env-only fallbacks. Mirrors the other functions.
async function aiKeys(): Promise<AiKeys> {
  const cfg = await resolveCfgCached();
  return {
    gemini: cfg.gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]),
    groq: firstEnv(["GROQ_API_KEY"]),
    cerebras: firstEnv(["CEREBRAS_API_KEY"]),
    openrouter: firstEnv(["OPENROUTER_API_KEY"]),
  };
}

// ── Telegram send (user bot token; single retry on 429 / transient error) ─────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
  attempt = 0,
): Promise<boolean> {
  if (!USER_BOT_TOKEN) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${USER_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    if (r.status === 429 && attempt === 0) {
      const j = await r.json().catch(() => ({} as Record<string, unknown>));
      const retryAfter = Number((j.parameters as { retry_after?: number } | undefined)?.retry_after ?? 1);
      await sleep(Math.min(Math.max(retryAfter, 1), 5) * 1000);
      return await sendMessage(chatId, text, replyMarkup, 1);
    }
    if (!r.ok) {
      // A permanently-rejected HTML payload (broken entities / too long) would
      // otherwise drop the reply — degrade to clipped plain text once.
      const body = await r.text().catch(() => "");
      if (attempt === 0 && /too long|can't parse|parse entities/i.test(body)) {
        return await sendPlain(chatId, text.replace(/<[^>]+>/g, "").slice(0, 3900));
      }
      jlog({ at: "tgu.send", ok: false, status: r.status });
      return false;
    }
    return true;
  } catch (e) {
    if (attempt === 0) {
      await sleep(800);
      return await sendMessage(chatId, text, replyMarkup, 1);
    }
    jlog({ at: "tgu.send", ok: false, error: String(e) });
    return false;
  }
}

// Send a (possibly long) reply as one or more ordered messages, respecting
// Telegram's 4096-char sendMessage limit (chunkTelegram splits on natural
// boundaries, never mid-word). Awaits each chunk in sequence so the user sees them
// in order; fail-soft PER chunk (a failed piece is logged, never thrown, and never
// aborts the remaining pieces). An optional reply_markup rides ONLY on the FIRST
// chunk (Telegram attaches a keyboard to a single message). A short reply is a
// single send — the common case is unchanged. Returns whether the first chunk sent.
async function sendChunked(
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<boolean> {
  const parts = chunkTelegram(text);
  if (parts.length === 0) return false;
  if (parts.length === 1) return await sendMessage(chatId, parts[0], replyMarkup);
  let firstOk = false;
  for (let i = 0; i < parts.length; i++) {
    const ok = await sendMessage(chatId, parts[i], i === 0 ? replyMarkup : undefined);
    if (i === 0) firstOk = ok;
    else if (!ok) jlog({ at: "tgu.chunk", ok: false, idx: i, total: parts.length });
    if (i < parts.length - 1) await sleep(350); // brief gap so ordering holds
  }
  return firstOk;
}

// Show the "Switchy is typing…" chat action so the user knows we're working on a
// reply during the (paid, sometimes slow) agent round-trip. Telegram clears it
// automatically after ~5s or when the next message lands, so there's nothing to
// turn off. Best-effort + fail-soft: never blocks (the caller does not await its
// result before running the agent) and swallows every error — a missing token /
// network blip must never affect the reply path.
function sendTyping(chatId: number): void {
  if (!USER_BOT_TOKEN) return;
  fetch(`https://api.telegram.org/bot${USER_BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch((e) => jlog({ at: "tgu.typing", ok: false, error: String(e) }));
}

// ── update_id idempotency ledger (reliability) ────────────────────────────────
// Telegram RE-DELIVERS an update if our webhook doesn't 200 quickly enough (a slow
// agent run), which would otherwise double-run the agent and double-reply. We
// record each update_id ONCE in a tiny ledger and treat a re-delivery as a no-op.
//
// REUSE (no new table): the ledger row lives in public.ai_sessions under a
// synthetic key ("tgu-upd-<update_id>", DISTINCT from a real chat key "tg-u-…"),
// inserted with on_conflict=session_id + resolution=ignore-duplicates +
// return=representation. PostgREST returns the inserted row on a FIRST insert and
// an EMPTY array when the row already existed — exactly the wamid-dedup pattern the
// WhatsApp webhook uses. We expire these rows the same way ai_sessions are pruned.
//
// FAIL-SOFT: any store error (no service key, network, PostgREST error) returns
// false ("not seen") so we PROCESS the update rather than drop the user's message.
// Returns true ONLY when we are certain this update_id was already recorded.
async function alreadyProcessed(updateId: number | undefined | null): Promise<boolean> {
  const key = telegramUpdateDedupKey(updateId);
  if (!key) return false; // no/!finite update_id ⇒ can't dedup → process anyway
  try {
    const r = await serviceFetch(`/rest/v1/ai_sessions?on_conflict=session_id`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ session_id: key, updated_at: new Date().toISOString() }),
    });
    if (!r || !r.ok) {
      jlog({ at: "tgu.dedup", ok: false, status: r?.status });
      return false; // store unavailable → fail-soft to processing
    }
    const rows = await r.json().catch(() => []);
    // [] ⇒ the row already existed ⇒ this is a Telegram re-delivery → no-op.
    if (Array.isArray(rows) && rows.length === 0) {
      jlog({ at: "tgu.dup", updateId });
      return true;
    }
    return false;
  } catch (e) {
    jlog({ at: "tgu.dedup", ok: false, error: String(e) });
    return false;
  }
}

async function sendPlain(chatId: number, text: string): Promise<boolean> {
  if (!USER_BOT_TOKEN) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${USER_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ── §30A STOP wiring ───────────────────────────────────────────────────────────
// On opt-out we record the withdrawal in BOTH the durable suppression registry
// (marketing_suppression — the authoritative do-not-contact list every future
// sender must check) and the audit log. Best-effort: even if the DB writes are
// blocked, the user still gets the single confirmation so they KNOW they're out,
// and the failure is logged — the confirmation is the legally-meaningful act.
async function handleOptOut(chatId: number, userId: number): Promise<void> {
  const contact = `tg:${chatId}`; // Telegram has no phone/email — the chat id is the contact key
  try {
    // marketing_suppression uses ON CONFLICT (channel, contact) DO NOTHING — a
    // repeat STOP is a harmless no-op. PostgREST: merge-duplicates on the unique
    // (channel, contact) index.
    await serviceFetch("/rest/v1/marketing_suppression?on_conflict=channel,contact", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ channel: "telegram", contact, reason: "telegram_stop" }),
    });
  } catch (e) {
    jlog({ at: "tgu.optout.suppress", ok: false, error: String(e) });
  }
  // Reg.13 audit row (best-effort) — proves WHEN the opt-out was honoured.
  try {
    await insertRow("security_audit_log", {
      event: "telegram_marketing_opt_out",
      detail: { channel: "telegram", chat_id: chatId, user_id: userId },
    });
  } catch (e) {
    jlog({ at: "tgu.optout.audit", ok: false, error: String(e) });
  }
  await sendMessage(chatId, OPTOUT_CONFIRM_REPLY);
  jlog({ at: "tgu.optout", chatId, ok: true });
}

// ── First-contact detection ────────────────────────────────────────────────────
// The §11 identification note shows exactly once. We treat a chat as a first
// contact when its unified session has no stored transcript yet (i.e. this is the
// first turn we're persisting). Fail-soft: a load error → not-first (we'd rather
// occasionally skip the note than spam it; the privacy policy is also reachable
// from /help and every catalogue surface).
function isFirstContact(session: ChatSession): boolean {
  return (session.transcript?.length ?? 0) === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// HUMAN-TAKEOVER LIVE RELAY (customer→team half) — the Telegram mirror of the
// WhatsApp human takeover. State lives on THIS chat's public.ai_sessions row in
// two dedicated columns (see supabase/telegram-handoff-2026-06.sql):
//   • bot_enabled         — true (default) = the agent answers; a takeover sets
//                           it FALSE (the agent is PAUSED for this chat).
//   • relay_team_chat_id  — the TEAM chat id the customer's live messages forward
//                           to while paused. Set on take-over, NULL on hand-back.
// RELAY-ACTIVE = (bot_enabled === false AND relay_team_chat_id is set).
//
// We read/write these columns DIRECTLY via PostgREST (not through the unified
// session's slots, whose loader whitelists keys) so the relay state is robust to
// every session save and independent of the transcript envelope. Everything is
// FAIL-SOFT: a missing column / DB error → "no takeover" so the agent keeps
// answering (the bot still works; it just never pauses) — never an error path.
// ─────────────────────────────────────────────────────────────────────────────

type RelayState = { active: boolean; teamChatId: string | null };

// Read the takeover state for a chat's session row. Fail-soft: a null/error query
// OR a row written before the migration (no columns) → not-active. The columns
// default bot_enabled=true / relay_team_chat_id=NULL, so a normal chat reads as
// not-active and the agent runs exactly as before.
//
// `transcriptLen` is OBSERVABILITY-ONLY (the loaded session's turn count): when a
// chat is paused (bot_enabled=false) but has NO usable relay target, a customer
// message would route to the AGENT instead of the team — a half-written / lost
// takeover row. For a brand-new chat (empty transcript) that's just the default
// not-active state and we stay silent; but for an in-flight chat (non-empty
// transcript) it's a real anomaly worth a WARN. Routing is UNCHANGED either way —
// we still fail soft to the agent so the bot keeps working.
async function relayStateFor(sessionKey: string, transcriptLen = 0): Promise<RelayState> {
  if (!sessionKey) return { active: false, teamChatId: null };
  const rows = await fetchRows<{ bot_enabled?: boolean | null; relay_team_chat_id?: string | null }>(
    `/rest/v1/ai_sessions?session_id=eq.${encodeURIComponent(sessionKey)}&select=bot_enabled,relay_team_chat_id&limit=1`,
  );
  if (!rows || rows.length === 0) return { active: false, teamChatId: null };
  const r = rows[0];
  const teamChatId = String(r.relay_team_chat_id ?? "").trim() || null;
  // Mirror whatsapp botEnabled(): an explicit false pauses; absent/undefined/true
  // keeps the agent on. Active only when paused AND a relay target is set.
  const paused = r.bot_enabled === false;
  // Observability: a PAUSED chat with no relay target + an existing transcript is a
  // takeover whose relay row was lost/half-written — the customer's in-flight message
  // is about to route to the agent rather than the team. WARN (no PII), keep routing.
  if (paused && !teamChatId && transcriptLen > 0) {
    jlog({ at: "tgu.relay.state_lost", ok: false, paused: true, hasTarget: false, transcriptLen });
  }
  return { active: paused && !!teamChatId, teamChatId: paused ? teamChatId : null };
}

// The reply-marker keyboard the team card / each forwarded customer line carries.
// A rep REPLY (reply-to) to any message bearing this marker relays back to the
// customer's Telegram chat (the chat id is encoded in callback_data). Mirrors the
// WhatsApp lead-card relay, but keyed by the customer's TG chat id. The hand-back
// button ends the takeover. Contract (shared verbatim with notify-lead/callbacks.ts):
//   reply marker  = "tgu:<chatId>:relay"
//   hand-back     = "tgu:<chatId>:handback"
function teamRelayKeyboard(chatId: number): Record<string, unknown> {
  return {
    inline_keyboard: [[
      { text: "💬 השיבו (reply) לכאן ללקוח", callback_data: `tgu:${chatId}:relay` },
      { text: "🤖 סיום והחזרה לבוט", callback_data: `tgu:${chatId}:handback` },
    ]],
  };
}

// Build the team takeover card: who the customer is + what they just asked, with
// the reply/hand-back keyboard. Mirrors the spirit of buildTakeoverContextHeader
// (the WhatsApp version) — the customer-controlled bits are HTML-escaped because
// sendTelegram posts parse_mode HTML, and the request text is clipped.
function buildHandoffCard(firstName: string, chatId: number, request: string): string {
  const ask = String(request ?? "").trim().slice(0, 400);
  return [
    `🤝 <b>בקשה לנציג אנושי בטלגרם</b>${firstName ? ` — ${esc(firstName)}` : ""}`,
    `👤 <b>לקוח:</b> ${esc(firstName || "—")} · <code>tg:${chatId}</code>`,
    ask ? `🧵 <b>מה הלקוח כתב:</b> ${esc(ask)}` : null,
    "",
    "העוזר האוטומטי הושהה. כל הודעה שתשיבו (reply) לכרטיס הזה תישלח ללקוח בטלגרם; לסיום הקישו «סיום והחזרה לבוט».",
  ].filter((x) => x !== null).join(NL);
}

// Forward ONE live customer message to the team relay chat during an active
// takeover (customer→team half). Prefixed with the 📩 marker + the customer's
// name, carries the reply/hand-back keyboard so a rep can reply to it. Best-effort
// + fail-soft: a Telegram error never blocks (the message is already persisted to
// the transcript). Uses the TEAM bot (sendTelegram → cfg.tgChat override).
async function relayCustomerToTeam(
  teamChatId: string,
  chatId: number,
  firstName: string,
  text: string,
): Promise<boolean> {
  try {
    const cfg = await resolveCfgCached();
    const who = esc(firstName || `tg:${chatId}`);
    const body = esc(String(text ?? "").slice(0, 3500));
    const r = await sendTelegram(
      { ...cfg, tgChat: teamChatId },
      `📩 <b>${who}</b>: ${body}`,
      teamRelayKeyboard(chatId),
    );
    return !!r.ok;
  } catch (e) {
    jlog({ at: "tgu.relay.toteam", ok: false, error: String(e) });
    return false;
  }
}

// START a takeover: pause the agent + point the relay at the team chat (a direct
// PATCH on the ai_sessions row, upserted first so a brand-new chat has a row to
// flip), then notify the team with the takeover card. Returns whether the team was
// notified. Fail-soft throughout — a DB/Telegram miss is logged, never thrown.
async function startHandoff(
  sessionKey: string,
  chatId: number,
  firstName: string,
  request: string,
): Promise<boolean> {
  const cfg = await resolveCfgCached();
  const teamChatId = String(cfg.tgChat ?? "").trim();
  if (!teamChatId) {
    // No team chat configured — we cannot relay anywhere. Leave the agent ON
    // (don't pause into a dead end) and report "not notified" so the caller falls
    // back to the agent (which can still offer a callback lead).
    jlog({ at: "tgu.handoff.start", ok: false, reason: "no team chat" });
    return false;
  }
  // Ensure a row exists, then flip it paused + pointed at the team. Upsert keeps a
  // brand-new chat's transcript intact (merge-duplicates) while setting the flags.
  try {
    await serviceFetch(`/rest/v1/ai_sessions?on_conflict=session_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        session_id: sessionKey,
        bot_enabled: false,
        relay_team_chat_id: teamChatId,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    jlog({ at: "tgu.handoff.flip", ok: false, error: String(e) });
  }
  // Reg.13 audit (best-effort) — proves WHEN a human takeover started + for whom.
  try {
    await insertRow("security_audit_log", {
      event: "telegram_user_handoff_start",
      detail: { channel: "telegram", chat_id: chatId, team_chat_id: teamChatId },
    });
  } catch (_) { /* the takeover still works without the audit row */ }
  // Notify the team with the context card + reply/hand-back keyboard. The takeover
  // is COMMITTED above (the relay target is set), so we return true even if this
  // single card send fails — the next customer message still forwards to the team
  // (relayCustomerToTeam), and we don't strand the customer by reverting to the
  // agent after pausing it. The card send is best-effort.
  const r = await sendTelegram(
    { ...cfg, tgChat: teamChatId },
    buildHandoffCard(firstName, chatId, request),
    teamRelayKeyboard(chatId),
  );
  jlog({ at: "tgu.handoff.start", chatId, card: !!r.ok });
  return true;
}

// ── Per-message orchestration (the guard chain ABOVE the agent) ───────────────
async function handleUpdate(update: TgUserUpdate): Promise<void> {
  const parsed = parseInbound(update);
  if (!parsed) return; // nothing actionable (no text / from a bot / malformed)
  const { chatId, userId, firstName, languageCode, text, isCommand, command } = parsed;

  // (2-) UPDATE_ID IDEMPOTENCY — Telegram re-delivers an update when our webhook
  //      doesn't 200 fast enough (a slow agent run), which would double-run the
  //      agent + double-reply. Record the update_id ONCE; a re-delivery is a no-op.
  //      Placed AFTER auth/503-dark (the HTTP handler) and AFTER confirming an
  //      actionable message, but BEFORE every message handler (opt-out / rate-limit
  //      / takeover / commands / agent) so NOTHING runs twice. Fail-soft: a store
  //      error returns false ("not seen") so we process rather than drop the turn.
  if (await alreadyProcessed(update?.update_id)) return;

  // (3) §30A STOP — checked FIRST among message handling. A bare STOP token (as a
  //     /stop command or plain text) suppresses + confirms + RETURNS before any
  //     AI fan-out. Honouring the opt-out is the mandatory act.
  if (isOptOut(text)) {
    await handleOptOut(chatId, userId);
    return;
  }

  // (3b) AMENDMENT-13 data-subject requests — DETERMINISTIC (no LLM), right after
  //      the §30A opt-out gate. A person may ask to DELETE their data ("erasure")
  //      or what data we hold ("access"). Erasure wins over access (it's the
  //      stronger, more specific intent — isDataAccessRequest already defers to it).
  //      Both honour the request before any AI fan-out and RETURN. Telegram has no
  //      phone/email — the chat id is the contact key (mirrors handleOptOut).
  const dsContact = `tg:${chatId}`;
  if (isErasureRequest(text)) {
    const reply = await recordErasureRequest("telegram", dsContact);
    await sendMessage(chatId, reply);
    jlog({ at: "tgu.erasure", chatId, ok: true });
    return;
  }
  if (isDataAccessRequest(text)) {
    const reply = await summarizeDataFor("telegram", dsContact);
    await sendMessage(chatId, reply);
    jlog({ at: "tgu.access", chatId, ok: true });
    return;
  }

  // (2) Per-chat rate limit — bound the paid agent fan-out. Over the cap → a soft
  //     line, still 200 to Telegram (no retry storm). Keyed by chat id only (the
  //     secret gate already authenticated the request, so the key is trusted).
  const rl = rateLimit(`tgu:${chatId}`, PER_CHAT_LIMIT, PER_CHAT_WINDOW_MS);
  if (!rl.allowed) {
    await sendMessage(chatId, "רגע 🙂 אני עונה לפי הסדר — חוזרים אליכם עוד כמה רגעים.");
    return;
  }

  // Load the unified session (transcript + slots) so multi-turn memory works and
  // we can detect first contact. Fail-soft → empty (stateless) session.
  const sessionKey = telegramSessionId(chatId);
  let session: ChatSession;
  try {
    session = sessionKey ? await loadSession("app", sessionKey) : emptySession("app", "");
  } catch {
    session = emptySession("app", sessionKey || "");
  }
  const firstContact = isFirstContact(session);

  // (2b) HUMAN-TAKEOVER LIVE RELAY — the Telegram mirror of the WhatsApp takeover
  //      gate. Runs AFTER the §30A STOP gate (opt-out always wins, above) and the
  //      rate limit, BEFORE the deterministic commands and the agent. Two cases:
  //
  //   • ALREADY relaying (this chat's session is bot_enabled=false + a team relay
  //     target set): the agent is PAUSED — forward the customer's message straight
  //     to the team and RETURN, never running the agent. The customer is in a live
  //     human conversation; the bot does not answer. Fail-soft: if the relay send
  //     fails we tell the customer their message was saved (honest), and we still
  //     persist the turn to the transcript so the rep's context is intact.
  //
  //   • NOT yet relaying but the customer just ASKED for a human (a /human-style
  //     command or a clear request): START a takeover — pause the agent, point the
  //     relay at the team chat, notify the team with a context card, send the
  //     customer the single connecting ack, and RETURN (the agent does not run).
  //     If the team chat isn't configured we can't relay anywhere → fall through
  //     to the agent (which can still offer a callback lead) rather than dead-end.
  const relay = await relayStateFor(sessionKey, session.transcript?.length ?? 0);
  if (relay.active && relay.teamChatId) {
    const delivered = await relayCustomerToTeam(relay.teamChatId, chatId, firstName, text);
    if (!delivered) await sendMessage(chatId, HANDOFF_RELAY_FAIL_REPLY);
    // Persist the customer turn so the team's running context (and any later
    // hand-back to the agent) sees the full thread. No bot reply is stored.
    await persistTurn(session, sessionKey, text, "", []);
    return;
  }
  if (wantsHuman(text, isCommand, command)) {
    const notified = await startHandoff(sessionKey, chatId, firstName, text);
    if (notified) {
      await sendMessage(chatId, HANDOFF_ACK_REPLY);
      await persistTurn(session, sessionKey, text, HANDOFF_ACK_REPLY, []);
      return;
    }
    // No team chat / notify failed → don't strand the customer in a paused state;
    // fall through to the agent, which can capture a consent-gated callback lead.
  }

  // Plain /start and /help are deterministic — no LLM round-trip needed. The §11
  // note is appended to /start (the canonical first contact). /help is always the
  // help copy. Everything else goes to the shared agent.
  if (isCommand && command === "start") {
    const welcome = withFirstContactNote(WELCOME_REPLY, firstContact);
    // UX: offer the catalogue's REAL categories as one-tap quick replies on /start
    // ONLY. Truth-only — welcomeCategoryKeyboard returns null for an empty/failed
    // catalogue, so we never show a fabricated option (and a getPlans() miss just
    // means no keyboard). Tapping a button SENDS its Hebrew label as the next
    // message → flows through this same guard chain + agent (no callback path,
    // no guard-chain change). Best-effort: a plans error → plain welcome.
    let kb: Record<string, unknown> | null = null;
    try {
      kb = welcomeCategoryKeyboard(await getPlans());
    } catch (e) {
      jlog({ at: "tgu.welcome.kb", ok: false, error: String(e) });
    }
    await sendMessage(chatId, welcome, kb ?? undefined);
    // Persist the turn so the next message has memory + first-contact is consumed.
    await persistTurn(session, sessionKey, text, WELCOME_REPLY, []);
    return;
  }
  if (isCommand && command === "help") {
    await sendMessage(chatId, withFirstContactNote(HELP_REPLY, firstContact));
    await persistTurn(session, sessionKey, text, HELP_REPLY, []);
    return;
  }

  // (5) The shared, grounded, multilingual, tool-using brain. Its create_lead /
  //     book_callback tools are consent-gated (captureAiLead refuses without
  //     consent===true), and it cites the live catalogue [Sn] — single source of
  //     truth with WhatsApp + site + app. We pass channel "app" (the conversational
  //     persona that also cites sources) and Telegram's locale as a soft language
  //     hint (runAgent still auto-detects from the message text).
  // UX: show "Switchy is typing…" while the (paid, sometimes slow) agent works.
  // We're past the opt-out gate (returned above) and the human-takeover relay
  // (returned above), so reaching here means a NORMAL agent turn — exactly when the
  // indicator is appropriate. Fire-and-forget (not awaited) so it never delays the
  // agent; fail-soft inside sendTyping.
  sendTyping(chatId);

  const keys = await aiKeys();
  const plans = await getPlans();
  const history: ChatTurn[] = asChatTurns(session);
  const langHint = langFromTelegramLocale(languageCode);

  let reply = "";
  const toolCalls: { name: string; ok: boolean; preview?: string }[] = [];
  try {
    const res = await runAgent({
      channel: "app",
      message: text,
      history,
      keys,
      plans,
      ...(langHint ? { lang: langHint } : {}),
      toolContext: {
        conversationId: sessionKey || null,
        contactId: null,
        logCrmEvent: (ev) => {
          const preview = (ev.preview ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
          insertRow("crm_events", {
            conversation_id: null,
            contact_id: null,
            actor: ev.actor,
            event: ev.event,
            preview,
          }).catch(() => {});
        },
        logSecurityEvent: (event, detail) => {
          insertRow("security_audit_log", { event, detail }).catch(() => {});
        },
        // Consent-gated lead capture — the SAME honest gate the site/app/WhatsApp
        // paths use. Refuses unless the agent collected consent===true.
        captureLead: (input) => captureAiLead(input as AiLeadInput),
      },
    });
    reply = res.reply;
    toolCalls.push(...res.toolCalls);
  } catch (e) {
    jlog({ at: "tgu.agent", ok: false, error: String(e) });
  }

  // runAgent effectively never returns empty, but guard anyway so the user always
  // gets *something* honest (no fabricated catalogue data here — just a nudge).
  if (!reply) {
    reply =
      "סליחה, נתקלתי בעומס רגעי 🙏 אפשר לנסות שוב עוד רגע, או להשוות הכול ב-https://switchy-ai.com";
  }

  // (4) §11 first-contact note — appended once, below the real answer.
  const outbound = withFirstContactNote(reply, firstContact);
  // Send via sendChunked: a long agent reply can exceed Telegram's 4096-char
  // sendMessage limit (and would otherwise fail to send). chunkTelegram splits on
  // natural boundaries into ordered pieces (≤4000 each); a short reply is a single
  // send (the common case is unchanged). Fail-soft per chunk.
  await sendChunked(chatId, outbound);

  // Persist memory (the reply WITHOUT the appended §11 note — that's a one-time
  // wrapper, not part of the conversation transcript).
  await persistTurn(session, sessionKey, text, reply, toolCalls);
}

// Append this turn + any tool calls to the unified session and save. Best-effort:
// a session I/O error never affects the reply (it already went out).
async function persistTurn(
  session: ChatSession,
  sessionKey: string,
  userText: string,
  botText: string,
  toolCalls: { name: string; ok: boolean; preview?: string }[],
): Promise<void> {
  if (!sessionKey) return;
  try {
    appendTurn(session, "user", userText);
    if (botText) appendTurn(session, "bot", botText);
    for (const tc of toolCalls) recordToolCall(session, tc.name, tc.ok, tc.preview);
    if (toolCalls.some((t) => (t.name === "create_lead" || t.name === "book_callback") && t.ok)) {
      session.slots.leadCaptured = true;
    }
    await saveSession(session);
  } catch (e) {
    jlog({ at: "tgu.persist", ok: false, error: String(e) });
  }
}

// ── set-webhook action (x-webhook-secret-gated) ───────────────────────────────
// Registers THIS function's URL as the user bot's webhook, with the secret_token
// (so inbound updates authenticate) and allowed_updates restricted to "message"
// (the user bot only handles text turns — no callback_query/inline). Gated by the
// shared x-webhook-secret (constant-time) so only the owner can (re)register it.
// Fails soft when the bot ships dark (no token) — returns disabled, never errors.
async function handleSetWebhook(req: Request): Promise<Response> {
  const cfg = await resolveCfgCached();
  // Auth: the shared x-webhook-secret. Fail closed when the secret is unset.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret || !(await safeEqual(provided, cfg.webhookSecret))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!USER_BOT_TOKEN) {
    // Ships dark — nothing to register yet.
    return json({ ok: false, disabled: true, reason: "TELEGRAM_USER_BOT_TOKEN not set" }, 200);
  }

  // The public function URL. Prefer an explicit override; else derive from the
  // project ref (SUPABASE_URL) → https://<ref>.functions.supabase.co/<fn>.
  const explicit = firstEnv(["TELEGRAM_USER_WEBHOOK_URL"]);
  let webhookUrl = explicit;
  if (!webhookUrl) {
    const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    if (base) {
      const host = base.replace(".supabase.co", ".functions.supabase.co");
      webhookUrl = `${host}/telegram-user-webhook`;
    }
  }
  if (!webhookUrl) {
    return json({ ok: false, error: "could not resolve webhook url (set TELEGRAM_USER_WEBHOOK_URL)" }, 400);
  }

  const secretToken = await tgWebhookToken(cfg.webhookSecret);
  try {
    const r = await fetch(`https://api.telegram.org/bot${USER_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>));
    const ok = r.ok && j.ok !== false;
    jlog({ at: "tgu.setWebhook", ok, url: webhookUrl });
    return json({ ok, url: webhookUrl, telegram: j }, ok ? 200 : 502);
  } catch (e) {
    jlog({ at: "tgu.setWebhook", ok: false, error: String(e) });
    return json({ ok: false, error: String(e) }, 502);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── HTTP ───────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // A friendly GET so a browser/health probe sees the function is live (and its
  // dark/live state) without leaking anything secret.
  if (req.method === "GET") {
    return new Response(
      USER_BOT_TOKEN
        ? "Switchy Telegram user bot is live"
        : "Switchy Telegram user bot is configured but dark (TELEGRAM_USER_BOT_TOKEN unset)",
      { status: 200, headers: { "Content-Type": "text/plain" } },
    );
  }

  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  // (0) Ships dark: with no bot token there is nothing to send and no webhook to
  //     manage — every POST is a 503 no-op (like VAPID push without keys). Done
  //     BEFORE the secret check so a dark deploy never even consults the vault.
  if (!USER_BOT_TOKEN) {
    return json({ ok: false, disabled: true, reason: "TELEGRAM_USER_BOT_TOKEN not set" }, 503);
  }

  // The secret-gated management action (register the webhook with Telegram).
  if (url.searchParams.get("action") === "set-webhook") {
    return await handleSetWebhook(req);
  }

  // (1) SECURITY: authenticate the inbound Telegram update via the secret_token
  //     registered at setWebhook (SHA-256 digest of lead_webhook_secret). Without
  //     this the handler would trust chat.id / from.id straight out of the body —
  //     an unauthenticated attacker could forge user messages and make the bot
  //     burn AI calls or capture junk leads. Fail CLOSED when the secret is unset.
  const cfg = await resolveCfgCached();
  const token = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!cfg.webhookSecret || !(await safeEqual(token, await tgWebhookToken(cfg.webhookSecret)))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // Parse + handle. We ALWAYS return 200 after auth (even on an internal error) so
  // Telegram does not hammer retries — failures are logged, the user is fail-soft.
  try {
    const update = (await req.json()) as TgUserUpdate;
    await handleUpdate(update);
  } catch (e) {
    jlog({ at: "tgu.post", ok: false, error: String(e) });
  }
  return json({ ok: true }, 200);
});
