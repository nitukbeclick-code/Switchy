// Lead message formatting + inline keyboards. Pure functions — unit-tested in
// supabase/functions/tests/.

import type { Lead, TgInlineKeyboard, TriageResult } from "./types.ts";
import { esc, NL, waDraftLink, waLink } from "./telegram.ts";

export const CALLBACK_HE: Record<string, string> = { now: "עכשיו", noon: "בצהריים", evening: "בערב", tomorrow: "מחר" };
export const SOURCE_HE: Record<string, string> = { form: "טופס", plan: "דף מסלול", compare: "השוואה", advisor: "יועץ AI", callback: "בקשת התקשרות", porting: "ניוד", renewal: "חידוש" };
export const STATUS_HE: Record<string, string> = { new: "חדש", contacted: "דיברתי", won: "נסגר", lost: "לא רלוונטי" };
export const STATUS_EMOJI: Record<string, string> = { new: "🆕", contacted: "📞", won: "🏆", lost: "❌" };

export function tgDisplayName(from?: { first_name?: string; last_name?: string }): string {
  return [from?.first_name, from?.last_name].filter(Boolean).join(" ");
}

// Default WhatsApp opener when the AI didn't supply one.
export function defaultDraft(lead: Lead): string {
  const first = String(lead.name ?? "").trim().split(/\s+/)[0] || "";
  const about = lead.provider ? ` לגבי ${lead.provider}` : "";
  return `היי${first ? " " + first : ""}, כאן חוסך 💚 קיבלנו את הפנייה שלך${about} — מתי נוח לדבר?`;
}

export function buildText(lead: Lead, triage?: TriageResult | null): string {
  const cb = CALLBACK_HE[String(lead.callback_time ?? "")] ?? String(lead.callback_time ?? "—");
  const wa = waLink(lead.phone);
  const sourceLabel = SOURCE_HE[String(lead.source ?? "")] ?? (lead.source ? String(lead.source) : null);
  const hot = (triage?.score ?? 0) >= 4;
  const lines: (string | null)[] = [
    hot ? "🔥 <b>ליד חם — חוסך</b>" : "🔔 <b>פנייה חדשה — חוסך</b>",
    "",
    `👤 <b>שם:</b> ${esc(lead.name)}`,
    `📞 <b>טלפון:</b> ${esc(lead.phone)}` + (wa ? ` — <a href="${wa}">WhatsApp</a>` : ""),
    lead.email ? `📧 <b>אימייל:</b> ${esc(lead.email)}` : null,
    (lead.provider || lead.plan_id) ? `📦 <b>ספק / מסלול:</b> ${esc(lead.provider ?? "—")} / ${esc(lead.plan_id ?? "—")}` : null,
    `⏰ <b>זמן חזרה מועדף:</b> ${esc(cb)}`,
    sourceLabel ? `📌 <b>מקור:</b> ${esc(sourceLabel)}` : null,
    lead.claimed_by ? `🙋 <b>בטיפול:</b> ${esc(lead.claimed_by)}` : null,
    // 700 pre-escape chars: even at 5x entity expansion (&→&amp;) the whole
    // message stays under Telegram's 4096-char sendMessage limit
    lead.notes ? `📋 <b>הקשר:</b> ${esc(String(lead.notes).slice(0, 700))}` : null,
    triage?.line ? "" : null,
    triage?.line ? `🤖 <i>${esc(triage.line)}</i>${triage.score > 0 ? ` (כוונה: ${triage.score}/5)` : ""}` : null,
  ];
  return lines.filter((x) => x !== null).join(NL);
}

export function buildHtml(lead: Lead, triage?: TriageResult | null): string {
  const cb = CALLBACK_HE[String(lead.callback_time ?? "")] ?? String(lead.callback_time ?? "—");
  const sourceLabel = SOURCE_HE[String(lead.source ?? "")] ?? (lead.source ? String(lead.source) : null);
  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#15281e">`
    + `<h2 style="color:#15603E">🔔 פנייה חדשה — חוסך</h2>`
    + `<p><b>שם:</b> ${esc(lead.name)}<br>`
    + `<b>טלפון:</b> ${esc(lead.phone)}<br>`
    + (lead.email ? `<b>אימייל:</b> ${esc(lead.email)}<br>` : "")
    + `<b>ספק / מסלול:</b> ${esc(lead.provider ?? "—")} / ${esc(lead.plan_id ?? "—")}<br>`
    + `<b>זמן חזרה מועדף:</b> ${esc(cb)}<br>`
    + (sourceLabel ? `<b>מקור:</b> ${esc(sourceLabel)}<br>` : "")
    + (lead.notes ? `<b>הקשר:</b> ${esc(String(lead.notes).slice(0, 700))}<br>` : "")
    + `</p>`
    + (triage?.line ? `<p style="background:#F4F0E8;padding:10px;border-radius:8px">🤖 ${esc(triage.line)}</p>` : "")
    + `</div>`;
}

// Live keyboard: status row + lost row + claim/WhatsApp row.
// Every callback_data carries the lead id so reply-notes can resolve the lead
// even from frozen stamps.
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
      { text: "📜 היסטוריה", callback_data: `lead:${id}:history` },
    ],
  ];
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
