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
import { jlog } from "../_shared/log.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { type AiKeys, type ChatTurn } from "../_shared/ai.ts";
import { type Plan, plansFromRows } from "../_shared/catalogue.ts";
import { captureAiLead, type AiLeadInput } from "../_shared/leads.ts";
import { runAgent } from "../_shared/agent.ts";
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
  HELP_REPLY,
  isOptOut,
  langFromTelegramLocale,
  OPTOUT_CONFIRM_REPLY,
  parseInbound,
  telegramSessionId,
  type TgUserUpdate,
  WELCOME_REPLY,
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

async function sendMessage(chatId: number, text: string, attempt = 0): Promise<boolean> {
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
      }),
    });
    if (r.status === 429 && attempt === 0) {
      const j = await r.json().catch(() => ({} as Record<string, unknown>));
      const retryAfter = Number((j.parameters as { retry_after?: number } | undefined)?.retry_after ?? 1);
      await sleep(Math.min(Math.max(retryAfter, 1), 5) * 1000);
      return await sendMessage(chatId, text, 1);
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
      return await sendMessage(chatId, text, 1);
    }
    jlog({ at: "tgu.send", ok: false, error: String(e) });
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

// ── Per-message orchestration (the guard chain ABOVE the agent) ───────────────
async function handleUpdate(update: TgUserUpdate): Promise<void> {
  const parsed = parseInbound(update);
  if (!parsed) return; // nothing actionable (no text / from a bot / malformed)
  const { chatId, userId, firstName, languageCode, text, isCommand, command } = parsed;

  // (3) §30A STOP — checked FIRST among message handling. A bare STOP token (as a
  //     /stop command or plain text) suppresses + confirms + RETURNS before any
  //     AI fan-out. Honouring the opt-out is the mandatory act.
  if (isOptOut(text)) {
    await handleOptOut(chatId, userId);
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

  // Plain /start and /help are deterministic — no LLM round-trip needed. The §11
  // note is appended to /start (the canonical first contact). /help is always the
  // help copy. Everything else goes to the shared agent.
  if (isCommand && command === "start") {
    const welcome = withFirstContactNote(WELCOME_REPLY, firstContact);
    await sendMessage(chatId, welcome);
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
  await sendMessage(chatId, outbound);

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
