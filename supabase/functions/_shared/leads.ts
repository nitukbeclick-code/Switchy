// Lead message formatting + inline keyboards. Pure functions — unit-tested in
// supabase/functions/tests/.

import type { Lead, TgInlineKeyboard, TriageResult } from "./types.ts";
import { esc, NL, waDraftLink, waLink } from "./telegram.ts";
import { insertRow } from "./db.ts";

// ─────────────────────────────────────────────────────────────────────────────
// AI-chat lead capture (Track 2E) — when the site "Switchy AI" chat detects a
// genuine switch/contact intent and the user supplies name + phone + the
// MANDATORY consent, we capture a lead via the service role. The leads table's
// BEFORE INSERT gate re-stamps consent + IP and rate-limits; the pg_net trigger
// fans the row out to the Telegram rep bot. So this layer only has to build a
// clean, honest row — NEVER fabricating consent (see captureAiLead's gate).
//
// CONSENT HONESTY (Spam Law §30A + Privacy Reg.13): we set terms/privacy consent
// timestamps ONLY when the client passes consent === true (the same mandatory
// gate the LeadForm enforces). The three per-channel marketing opt-ins are
// OPTIONAL and default OFF — exactly mirroring web/app/api/lead/route.ts so the
// two capture paths can never drift on what consent means.
// ─────────────────────────────────────────────────────────────────────────────

// Israeli mobile/landline → digits-only national form, validated against the
// same shape the leads_rate_limit DB gate accepts ('^[+0-9][0-9\-\s]{7,14}$').
// Returns "" when the input can't be a real IL number (so the caller can refuse
// rather than insert junk). Mirrors web/lib/phone's normalizeIsraeliPhone intent
// without importing across the web/edge boundary.
export function normalizeLeadPhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  // Strip a +972 / 972 country prefix back to the national 0-leading form.
  let national = digits;
  if (national.startsWith("972")) national = "0" + national.slice(3);
  // IL mobile is 10 digits (05x…), landline 9 digits (0x…). Anything outside
  // 9–10 digits, or not starting with a 0, is not a valid local number.
  if (!/^0\d{8,9}$/.test(national)) return "";
  return national;
}

// The structured lead the chat client collects once intent is confirmed. Every
// field is validated/coerced here — never trusted as-is.
export type AiLeadInput = {
  name?: unknown;
  phone?: unknown;
  provider?: unknown; // current/desired provider, if mentioned (free text, clipped)
  category?: unknown; // desired service category, folded into notes
  notes?: unknown; // short context (e.g. the user's ask), clipped
  consent?: unknown; // MANDATORY terms+privacy — must be true to capture
  consent_marketing_sms?: unknown;
  consent_marketing_email?: unknown;
  consent_marketing_whatsapp?: unknown;
};

export type AiLeadRow = {
  name: string;
  phone: string;
  email: null;
  provider: string | null;
  source: "advisor";
  notes: string | null;
  terms_accepted_at: string;
  privacy_accepted_at: string;
  marketing_accepted_at: string | null;
  consent_marketing_sms: boolean;
  consent_marketing_email: boolean;
  consent_marketing_whatsapp: boolean;
};

function clip(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

// Build the leads row from a validated AiLeadInput, or null when the row can't
// be captured honestly: no valid name, no valid phone, or — critically — no
// mandatory consent. Returning null means "do NOT insert" (the AI should keep
// asking for the missing piece). Consent is NEVER fabricated: timestamps are set
// only because the user passed consent === true. The DB trigger re-stamps them
// with now() so the proof can't be backdated.
export function buildAiLeadRow(input: AiLeadInput, nowIso = new Date().toISOString()): AiLeadRow | null {
  const name = clip(input.name, 80);
  if (name.length < 2) return null;
  const phone = normalizeLeadPhone(input.phone);
  if (!phone) return null;
  // MANDATORY consent gate — Spam Law §30A + Privacy. No consent → no capture.
  if (input.consent !== true) return null;

  const marketingSms = input.consent_marketing_sms === true;
  const marketingEmail = input.consent_marketing_email === true;
  const marketingWhatsapp = input.consent_marketing_whatsapp === true;
  const anyMarketing = marketingSms || marketingEmail || marketingWhatsapp;

  const category = clip(input.category, 40);
  const notesParts: string[] = ["נוצר משיחת Switchy AI באתר"];
  if (category) notesParts.push(`שירות מבוקש: ${category}`);
  const extra = clip(input.notes, 600);
  if (extra) notesParts.push(extra);
  const notes = notesParts.join(" | ").slice(0, 1900); // < DB gate's 2000 cap

  return {
    name,
    phone,
    email: null,
    provider: clip(input.provider, 120) || null,
    source: "advisor",
    notes: notes || null,
    // Non-null sentinels → the BEFORE INSERT trigger overwrites with now();
    // null marketing → stays null (no marketing consent).
    terms_accepted_at: nowIso,
    privacy_accepted_at: nowIso,
    marketing_accepted_at: anyMarketing ? nowIso : null,
    consent_marketing_sms: marketingSms,
    consent_marketing_email: marketingEmail,
    consent_marketing_whatsapp: marketingWhatsapp,
  };
}

// Service-role capture: build the row (honest-consent gated) and INSERT it. The
// leads table's pg_net trigger then notifies the rep team; the DB gate enforces
// rate limits + re-stamps consent/IP. Returns "captured" on a successful insert,
// "incomplete" when the row can't be built honestly (missing name/phone/consent
// → the AI should keep collecting), or "error" on an insert failure (so the AI
// can apologise / fall back to WhatsApp). Fail-soft: never throws.
export async function captureAiLead(
  input: AiLeadInput,
): Promise<"captured" | "incomplete" | "error"> {
  const row = buildAiLeadRow(input);
  if (!row) return "incomplete";
  const ok = await insertRow("leads", row);
  return ok ? "captured" : "error";
}

// ── Intent detection (deterministic, no extra paid AI call) ──────────────────
// Recognise a GENUINE switch/contact intent in the user's free text so the chat
// can offer to capture a lead (collect name+phone+consent). This is intentionally
// conservative: a pure price/info question ("כמה עולה X?") is NOT intent — only
// an explicit wish to switch, be called back, get a personal offer, or talk to a
// human. Used to DECIDE WHETHER TO OFFER capture; the actual capture still
// requires the user to provide details + tick consent.
// Note: JS \b word boundaries are ASCII-only and never match around Hebrew
// letters, so these patterns must NOT rely on \b — substring/anchored matches
// only.
const INTENT_PATTERNS: RegExp[] = [
  /(לעבור|להחליף|לנייד|ניוד|לבצע מעבר)/, // switch / port
  /(תחזרו אלי|שיחזרו אלי|תתקשרו|להתקשר אלי|צרו קשר|ליצור קשר|שיצרו איתי קשר)/, // call me back
  /(נציג|בנאדם|אנושי|לדבר עם מישהו|לדבר עם נציג)/, // talk to a human
  /(הצעה מותאמת|הצעה אישית|הצעה משתלמת|תכינו לי הצעה|רוצה הצעה|מעוניין בהצעה|מעוניינת בהצעה)/, // personal offer
  /(תעזרו לי לחסוך|רוצה לחסוך|איך חוסכים|כדאי לי לעבור)/, // wants to save / should I switch
  /(אני רוצה להירשם|השאיר פרטים|להשאיר פרטים|רוצה להתחיל)/, // sign up / leave details
];

export function detectSwitchIntent(text: string): boolean {
  const s = String(text ?? "");
  if (!s.trim()) return false;
  return INTENT_PATTERNS.some((re) => re.test(s));
}

export const CALLBACK_HE: Record<string, string> = { now: "עכשיו", noon: "בצהריים", evening: "בערב", tomorrow: "מחר" };
export const SOURCE_HE: Record<string, string> = { form: "טופס", plan: "דף מסלול", compare: "השוואה", advisor: "יועץ AI", callback: "בקשת התקשרות", porting: "ניוד", renewal: "חידוש", whatsapp: "וואטסאפ" };
export const STATUS_HE: Record<string, string> = { new: "חדש", contacted: "דיברתי", won: "נסגר", lost: "לא רלוונטי" };
export const STATUS_EMOJI: Record<string, string> = { new: "🆕", contacted: "📞", won: "🏆", lost: "❌" };

// Plan categories (lib/data.dart's owned set) → Hebrew, for the "desired need"
// card line. Mirrors digests.ts CAT_HE; kept here so leads.ts stays dependency-light.
export const CATEGORY_HE: Record<string, string> = {
  cellular: "סלולר", internet: "אינטרנט", tv: "טלוויזיה",
  triple: "חבילה משולבת (טריפל)", abroad: 'חבילת חו"ל',
};

// The leads table has no category column — the desired service is captured in
// the notes free text (the AI-chat capture writes "שירות מבוקש: <category>") or
// implied by the plan_id prefix. Surface it ONLY when it's actually present:
// honesty over a fabricated guess. Returns the Hebrew category label, or "".
export function desiredCategory(lead: Lead): string {
  // 1) Explicit, structured hint the AI-chat capture (or any form) wrote.
  const tagged = String(lead.notes ?? "").match(/שירות מבוקש:\s*([^\n|]{1,40})/);
  if (tagged) {
    const raw = tagged[1].trim();
    // map a known english key if that's what was stored, else show the free text
    const key = raw.toLowerCase();
    return CATEGORY_HE[key] ?? raw;
  }
  // 2) plan_id is "<provider>-<cat>-…" in the catalogue, so a leading known
  // category token is a reliable, non-fabricated signal.
  const planCat = String(lead.plan_id ?? "").toLowerCase().split(/[-_ ]/).find((t) => t in CATEGORY_HE);
  if (planCat) return CATEGORY_HE[planCat];
  return "";
}

export function tgDisplayName(from?: { first_name?: string; last_name?: string }): string {
  return [from?.first_name, from?.last_name].filter(Boolean).join(" ");
}

// A one-line compliance reminder for the rep, shown on the inbound card. The
// rep is about to call the customer, so they must remember §7b (disclose the
// commission/affiliation when recommending a deal) + §30A (get consent before
// any marketing follow-up). Italic, low-key — a nudge, not a wall of text.
export const REP_COMPLIANCE_LINE =
  '⚖️ <i>תזכורת: גלו עמלה/שיוך בהמלצה (§7b) · אישור ללקוח לפני פולואו-אפ שיווקי (§30A).</i>';

// Default WhatsApp opener when the AI didn't supply one.
export function defaultDraft(lead: Lead): string {
  const first = String(lead.name ?? "").trim().split(/\s+/)[0] || "";
  const about = lead.provider ? ` לגבי ${lead.provider}` : "";
  return `היי${first ? " " + first : ""}, כאן Switchy AI 💚 קיבלנו את הפנייה שלך${about} — מתי נוח לדבר?`;
}

export function buildText(lead: Lead, triage?: TriageResult | null): string {
  const cb = CALLBACK_HE[String(lead.callback_time ?? "")] ?? String(lead.callback_time ?? "—");
  const wa = waLink(lead.phone);
  const sourceLabel = SOURCE_HE[String(lead.source ?? "")] ?? (lead.source ? String(lead.source) : null);
  const category = desiredCategory(lead);
  const hot = (triage?.score ?? 0) >= 4;
  const lines: (string | null)[] = [
    hot ? "🔥 <b>ליד חם — Switchy AI</b>" : "🔔 <b>פנייה חדשה — Switchy AI</b>",
    "",
    `👤 <b>שם:</b> ${esc(lead.name)}`,
    `📞 <b>טלפון:</b> ${esc(lead.phone)}` + (wa ? ` — <a href="${wa}">WhatsApp</a>` : ""),
    lead.email ? `📧 <b>אימייל:</b> ${esc(lead.email)}` : null,
    // Desired-service line first — it's the "what does this customer want?" the
    // rep reads before dialing. Shown only when we honestly have it.
    category ? `🎯 <b>צריך:</b> ${esc(category)}` : null,
    (lead.provider || lead.plan_id) ? `📦 <b>ספק / מסלול:</b> ${esc(lead.provider ?? "—")} / ${esc(lead.plan_id ?? "—")}` : null,
    `⏰ <b>זמן חזרה מועדף:</b> ${esc(cb)}`,
    sourceLabel ? `📌 <b>מקור:</b> ${esc(sourceLabel)}` : null,
    lead.claimed_by ? `🙋 <b>בטיפול:</b> ${esc(lead.claimed_by)}` : null,
    // 700 pre-escape chars: even at 5x entity expansion (&→&amp;) the whole
    // message stays under Telegram's 4096-char sendMessage limit
    lead.notes ? `📋 <b>הקשר:</b> ${esc(String(lead.notes).slice(0, 700))}` : null,
    triage?.line ? "" : null,
    triage?.line ? `🤖 <i>${esc(triage.line)}</i>${triage.score > 0 ? ` (כוונה: ${triage.score}/5)` : ""}` : null,
    "",
    REP_COMPLIANCE_LINE,
  ];
  return lines.filter((x) => x !== null).join(NL);
}

export function buildHtml(lead: Lead, triage?: TriageResult | null): string {
  const cb = CALLBACK_HE[String(lead.callback_time ?? "")] ?? String(lead.callback_time ?? "—");
  const sourceLabel = SOURCE_HE[String(lead.source ?? "")] ?? (lead.source ? String(lead.source) : null);
  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#15281e">`
    + `<h2 style="color:#15603E">🔔 פנייה חדשה — Switchy AI</h2>`
    + `<p><b>שם:</b> ${esc(lead.name)}<br>`
    + `<b>טלפון:</b> ${esc(lead.phone)}<br>`
    + (lead.email ? `<b>אימייל:</b> ${esc(lead.email)}<br>` : "")
    + `<b>ספק / מסלול:</b> ${esc(lead.provider ?? "—")} / ${esc(lead.plan_id ?? "—")}<br>`
    + `<b>זמן חזרה מועדף:</b> ${esc(cb)}<br>`
    + (sourceLabel ? `<b>מקור:</b> ${esc(sourceLabel)}<br>` : "")
    + (lead.notes ? `<b>הקשר:</b> ${esc(String(lead.notes).slice(0, 700))}<br>` : "")
    + `</p>`
    + (triage?.line ? `<p style="background:#F4F0E8;padding:10px;border-radius:8px">🤖 ${esc(triage.line)}</p>` : "")
    + `<p style="font-size:12px;color:#4B5563;margin-top:14px">תזכורת לנציג: גלו עמלה/שיוך בעת המלצה (§7b לחוק הגנת הצרכן) · קבלו אישור מהלקוח לפני פולואו-אפ שיווקי (§30A לחוק התקשורת).</p>`
    + `</div>`;
}

// A lead originated by the WhatsApp bot — its phone is a live WhatsApp contact, so
// the rep can take the conversation over IN-PLACE (relay) instead of only opening
// a fresh wa.me draft. The bot stamps source='whatsapp' (SOURCE_HE has the label);
// anything else is a form/plan/advisor lead with no live WhatsApp thread to relay.
export function isWhatsappLead(lead: Lead): boolean {
  return String(lead.source ?? "").toLowerCase() === "whatsapp";
}

// Live keyboard: status row + lost/snooze row + history + claim/WhatsApp row.
// Every callback_data carries the lead id so reply-notes can resolve the lead
// even from frozen stamps. The ⏰ snooze button pushes the SLA nudge back ~2h
// (sets nudged_at forward) for a rep who'll get to it later but isn't dropping
// it — a softer middle ground than "לא רלוונטי".
//
// For a WhatsApp-source lead we add a relay control row: "🤝 השתלט ושוחח כאן"
// (take over → bot goes silent, the live conversation is relayed to THIS rep's
// Telegram chat) and "🤖 החזר לבוט" (hand back → the AI bot resumes). Both flip
// whatsapp_conversations.bot_enabled / relay_tg_chat_id per the take-over contract
// in callbacks.ts handleCallback; the existing wa.me draft button stays for the
// non-relay "just message them" path.
export function leadKeyboard(lead: Lead, draft = ""): TgInlineKeyboard | undefined {
  if (!lead.id) return undefined;
  const id = String(lead.id);
  const rows: TgInlineKeyboard["inline_keyboard"] = [
    [
      { text: `${STATUS_EMOJI.contacted} דיברתי`, callback_data: `lead:${id}:contacted` },
      { text: `${STATUS_EMOJI.won} נסגר`, callback_data: `lead:${id}:won` },
    ],
    [
      { text: `${STATUS_EMOJI.lost} לא רלוונטי`, callback_data: `lead:${id}:lost` },
      { text: "⏰ דחה", callback_data: `lead:${id}:snooze` },
    ],
    [
      { text: "📜 היסטוריה", callback_data: `lead:${id}:history` },
    ],
  ];
  // WhatsApp-source leads get a live take-over / hand-back relay row. This is the
  // human-in-the-loop control: take-over silences the bot and pipes the customer's
  // messages to the pressing rep's Telegram; hand-back returns the AI bot.
  if (isWhatsappLead(lead)) {
    rows.push([
      { text: "🤝 השתלט ושוחח כאן", callback_data: `lead:${id}:takeover` },
      { text: "🤖 החזר לבוט", callback_data: `lead:${id}:handback` },
    ]);
  }
  const actionRow: TgInlineKeyboard["inline_keyboard"][number] = [];
  if (lead.claimed_by) {
    actionRow.push({ text: `👤 בטיפול: ${lead.claimed_by}`.slice(0, 60), callback_data: `lead:${id}:claimed` });
  } else {
    actionRow.push({ text: "🙋 אני על זה", callback_data: `lead:${id}:claim` });
  }
  const wa = waDraftLink(lead.phone, draft || defaultDraft(lead));
  if (wa) actionRow.push({ text: "💬 וואטסאפ מוכן", url: wa });
  rows.push(actionRow);
  return { inline_keyboard: rows };
}

// Frozen stamp after a status press: who handled it + undo + history.
export function frozenKeyboard(lead: Lead, status: string, who: string): TgInlineKeyboard {
  const id = String(lead.id ?? "");
  return {
    inline_keyboard: [
      [{ text: `${STATUS_EMOJI[status] ?? "✅"} ${STATUS_HE[status] ?? status}${who ? " — " + who : ""}`.slice(0, 60), callback_data: `lead:${id}:noop` }],
      [
        { text: "↩️ בטל", callback_data: `lead:${id}:undo` },
        { text: "📜 היסטוריה", callback_data: `lead:${id}:history` },
      ],
    ],
  };
}

export type LeadEvent = {
  event?: string;
  old_status?: string | null;
  new_status?: string | null;
  actor_name?: string | null;
  note?: string | null;
  created_at?: string;
};

// Full lead timeline for the 📜 button — the audit trail, readable.
export function formatTimeline(lead: Lead, events: LeadEvent[]): string {
  const fmtTime = (iso?: string): string => {
    const t = Date.parse(String(iso ?? ""));
    if (!Number.isFinite(t)) return "—";
    return new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(new Date(t));
  };
  const status = String(lead.status ?? "new");
  const lines: string[] = [
    `📜 <b>היסטוריית הליד — ${esc(lead.name)}</b> (${STATUS_EMOJI[status] ?? ""} ${STATUS_HE[status] ?? status})`,
    "",
    `🔔 ${fmtTime(lead.created_at)} — הפנייה התקבלה` +
      (lead.source ? ` (${esc(SOURCE_HE[String(lead.source)] ?? lead.source)})` : ""),
  ];
  const sorted = [...events].sort((a, b) =>
    Date.parse(String(a.created_at ?? "")) - Date.parse(String(b.created_at ?? "")));
  for (const ev of sorted.slice(-15)) {
    const who = esc(ev.actor_name ?? "");
    const at = fmtTime(ev.created_at);
    switch (String(ev.event ?? "")) {
      case "claim":
        lines.push(`🙋 ${at} — ${who} בטיפול`);
        break;
      case "status_change": {
        const oldHe = STATUS_HE[String(ev.old_status ?? "")] ?? String(ev.old_status ?? "");
        const newHe = STATUS_HE[String(ev.new_status ?? "")] ?? String(ev.new_status ?? "");
        lines.push(`${STATUS_EMOJI[String(ev.new_status ?? "")] ?? "✅"} ${at} — ${who}: ${esc(oldHe)} ← ${esc(newHe)}`);
        break;
      }
      case "note":
        lines.push(`📝 ${at} — ${who}: ${esc(String(ev.note ?? "").slice(0, 200))}`);
        break;
      case "snooze":
        lines.push(`⏰ ${at} — ${who} דחה את התזכורת`);
        break;
      case "undo":
        lines.push(`↩️ ${at} — ${who} שחזר ל"${esc(STATUS_HE[String(ev.new_status ?? "")] ?? String(ev.new_status ?? ""))}"`);
        break;
      case "saving":
        lines.push(`💰 ${at} — ${who} רשם ₪${esc(ev.note ?? "")}`);
        break;
      default:
        lines.push(`• ${at} — ${esc(ev.event ?? "")}`);
    }
  }
  if (events.length === 0) lines.push("<i>אין עדיין פעולות על הליד הזה.</i>");
  if (lead.actual_saving) lines.push("", `💰 חיסכון שנתי שנרשם: ₪${lead.actual_saving}`);
  return lines.join(NL);
}

// Status-aware keyboard: closed leads (won/lost) get the frozen stamp so a
// /search result can't re-fire the won-flow; open leads get the live buttons.
export function keyboardFor(lead: Lead, draft = ""): TgInlineKeyboard | undefined {
  const status = String(lead.status ?? "new");
  if (status === "won" || status === "lost") {
    return lead.id ? frozenKeyboard(lead, status, lead.claimed_by ?? "") : undefined;
  }
  return leadKeyboard(lead, draft);
}

// Find a lead id embedded in any inline-keyboard callback_data of a message —
// used to resolve which lead a chat reply refers to.
export function leadIdFromMarkup(markup?: { inline_keyboard?: { callback_data?: string }[][] }): string | null {
  for (const row of markup?.inline_keyboard ?? []) {
    for (const btn of row) {
      const m = String(btn.callback_data ?? "").match(/^lead:([0-9a-fA-F-]{36}):/);
      if (m) return m[1];
    }
  }
  return null;
}

// True when the replied-to message is the won-flow "כמה חסכנו?" prompt.
export function isWonAskMarkup(markup?: { inline_keyboard?: { callback_data?: string }[][] }): boolean {
  for (const row of markup?.inline_keyboard ?? []) {
    for (const btn of row) {
      if (/^lead:[0-9a-fA-F-]{36}:wonask$/.test(String(btn.callback_data ?? ""))) return true;
    }
  }
  return false;
}
