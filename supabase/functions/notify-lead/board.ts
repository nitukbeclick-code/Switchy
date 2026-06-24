// Native Telegram renderers for the in-chat meetings board + leads pipeline.
// PURE — no I/O. Each function returns { text, reply_markup } ready to hand to
// sendTelegram, so the rep gets a one-message, tap-to-act board right inside the
// team chat (the Mini App console is the richer, separate surface).
//
// CALLBACK-DATA CONTRACT (shared verbatim with console.ts applyMeetingAct +
// callbacks.ts; do NOT drift):
//   meeting actions = "mtg:<id>:zoom" | "mtg:<id>:reschedule"
//                   | "mtg:<id>:confirm" | "mtg:<id>:cancel"
//   board tab switch = "board:today" | "board:pending" | "board:week"
//   leads view       = "leads:new" | "leads:all"
// Lead cards reuse the EXISTING lead-card keyboard (lead:<id>:… contract) so a
// pipeline row behaves exactly like an inbound lead card.

import type { ConsoleBoard, ConsoleMeeting } from "./console.ts";
import type { Lead, TgInlineButton, TgInlineKeyboard } from "../_shared/types.ts";
import { esc, NL } from "../_shared/telegram.ts";
import {
  keyboardFor as leadKeyboardFor,
  SOURCE_HE,
  STATUS_EMOJI as LEAD_STATUS_EMOJI,
  STATUS_HE as LEAD_STATUS_HE,
} from "../_shared/leads.ts";
import { REP_COMPLIANCE_LINE } from "../_shared/leads.ts";

export type BoardTab = "today" | "pending" | "week";

export interface RenderedMessage {
  text: string;
  reply_markup: { inline_keyboard: TgInlineButton[][] };
}

// Tab labels + the message header per tab.
const TAB_HE: Record<BoardTab, string> = { today: "היום", pending: "ממתינות", week: "השבוע" };
const TAB_HEAD: Record<BoardTab, string> = {
  today: "🎥 <b>פגישות היום</b>",
  pending: "🕐 <b>פגישות שממתינות לאישור</b>",
  week: "📅 <b>פגישות מאושרות השבוע</b>",
};
const TAB_EMPTY: Record<BoardTab, string> = {
  today: "אין פגישות היום.",
  pending: "אין בקשות שממתינות לאישור.",
  week: "אין פגישות מאושרות ב-7 הימים הקרובים.",
};

// Per-status chip (Hebrew + emoji) for the meeting line. Mirrors the console
// chip vocabulary so the two surfaces read the same.
const MEETING_STATUS_HE: Record<string, string> = {
  pending: "ממתין לאישור", confirmed: "מאושרת", no_rep: "אין נציג",
  cancelled: "בוטלה", expired: "פג תוקף", completed: "הסתיימה",
};
const MEETING_STATUS_EMOJI: Record<string, string> = {
  pending: "🕐", confirmed: "✅", no_rep: "🚫", cancelled: "❌", expired: "⌛", completed: "🏁",
};

// "יום ג׳ · 16.6" from a YYYY-MM-DD meeting date (UTC-safe; the date is already
// the Israel wall day, computed server-side). Returns "" on a malformed date.
function heDay(meetingDate: string): string {
  const p = String(meetingDate ?? "").split("-");
  if (p.length < 3) return "";
  const y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  if (!y || !m || !d) return "";
  const days = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  const js = new Date(Date.UTC(y, m - 1, d));
  return `יום ${days[js.getUTCDay()]} · ${d}.${m}`;
}

// One meeting's text line: ⏰ time · name · provider · status.
function meetingLine(m: ConsoleMeeting): string {
  const status = String(m.status ?? "pending");
  const chip = `${MEETING_STATUS_EMOJI[status] ?? ""} ${MEETING_STATUS_HE[status] ?? status}`.trim();
  const day = heDay(m.meetingDate);
  const when = `🕒 <b>${esc(m.slot || "—")}</b>` + (day ? ` <i>(${esc(day)})</i>` : "");
  const who = `👤 ${esc(m.name || "—")}` + (m.provider ? ` · ${esc(m.provider)}` : "");
  return `${when}${NL}${who} — ${esc(chip)}`;
}

// Per-meeting action row. Always shows the full action set so the rep can act on
// any meeting from the board; the act handler (applyMeetingAct) enforces what's
// valid for the current status (e.g. "כבר טופל" on a re-confirm).
function meetingActionRow(id: string): TgInlineButton[] {
  return [
    { text: "🔗 קישור זום", callback_data: `mtg:${id}:zoom` },
    { text: "⏰ דחה", callback_data: `mtg:${id}:reschedule` },
    { text: "✅ אישור", callback_data: `mtg:${id}:confirm` },
    { text: "❌ ביטול", callback_data: `mtg:${id}:cancel` },
  ];
}

// The tab-switch row (board:today / board:pending / board:week). The active tab
// is marked with a dot so the rep sees which view they're on.
function tabRow(active: BoardTab, board: ConsoleBoard): TgInlineButton[] {
  const order: BoardTab[] = ["today", "pending", "week"];
  return order.map((t) => ({
    text: `${t === active ? "🔵 " : ""}${TAB_HE[t]} (${board.stats[t]})`,
    callback_data: `board:${t}`,
  }));
}

// Render the meetings board for the chosen tab. `summary` is an OPTIONAL,
// fail-soft AI day-line grounded in the real meetings (omitted when absent so
// the board still renders). Tab defaults to "today".
export function renderMeetingsBoard(
  board: ConsoleBoard,
  summary?: string | null,
  tab: BoardTab = "today",
): RenderedMessage {
  const items = board[tab] ?? [];
  const lines: string[] = [
    `${TAB_HEAD[tab]} — ${items.length}`,
  ];
  const clean = String(summary ?? "").trim();
  if (clean) lines.push("", `🤖 <i>${esc(clean)}</i>`);
  lines.push("");

  const keyboard: TgInlineButton[][] = [];
  if (items.length === 0) {
    lines.push(TAB_EMPTY[tab]);
  } else {
    items.forEach((m, i) => {
      if (i > 0) lines.push("");
      lines.push(meetingLine(m));
      if (m.id) keyboard.push(meetingActionRow(m.id));
    });
  }
  // Tab switch row last, so the action rows sit closest to their meeting lines.
  keyboard.push(tabRow(tab, board));

  return { text: lines.join(NL), reply_markup: { inline_keyboard: keyboard } };
}

// ── Leads pipeline ───────────────────────────────────────────────────────────

export interface LeadsPipeline {
  /// counts by funnel stage (new = uncontacted, contacted = in progress, won = closed)
  counts: { new: number; contacted: number; won: number };
  /// the latest few leads to surface as live cards (each gets the EXISTING keyboard)
  recent: Lead[];
}

// Bucket leads into the three pipeline counts (lost is folded out — the pipeline
// view is the active funnel). Pure over the supplied lead list.
export function pipelineCounts(leads: Lead[]): LeadsPipeline["counts"] {
  const counts = { new: 0, contacted: 0, won: 0 };
  for (const l of leads) {
    const s = String(l.status ?? "new");
    if (s === "new") counts.new++;
    else if (s === "contacted") counts.contacted++;
    else if (s === "won") counts.won++;
  }
  return counts;
}

// The pipeline summary message: a counts header + a §7b compliance reminder.
// Returned separately from the per-lead cards because Telegram inline keyboards
// can't host the rich lead-card buttons inline with a counts header — the caller
// sends this header, then each lead card (renderLeadCard) after it.
export function renderLeadsPipeline(pipeline: LeadsPipeline): RenderedMessage {
  const c = pipeline.counts;
  const lines: string[] = [
    "📊 <b>צינור הלידים — חוסך</b>",
    "",
    `${LEAD_STATUS_EMOJI.new} חדשים: <b>${c.new}</b>  ·  ` +
      `${LEAD_STATUS_EMOJI.contacted} בטיפול: <b>${c.contacted}</b>  ·  ` +
      `${LEAD_STATUS_EMOJI.won} נסגרו: <b>${c.won}</b>`,
  ];
  if (pipeline.recent.length > 0) {
    lines.push("", `📬 ${pipeline.recent.length} הלידים האחרונים:`);
  } else {
    lines.push("", "📭 אין לידים פתוחים — הכול טופל 🎉");
  }
  lines.push("", REP_COMPLIANCE_LINE);
  // The pipeline view's own switch row: new-only vs all (the leads:* contract).
  const keyboard: TgInlineButton[][] = [[
    { text: "🆕 חדשים בלבד", callback_data: "leads:new" },
    { text: "📋 הכול", callback_data: "leads:all" },
  ]];
  return { text: lines.join(NL), reply_markup: { inline_keyboard: keyboard } };
}

// One lead card for the pipeline: the EXISTING lead-card keyboard (claim/status/
// done/snooze/history/undo via keyboardFor) so a pipeline row behaves exactly
// like an inbound lead card. Header mirrors the /leads card head.
export function renderLeadCard(lead: Lead): RenderedMessage {
  const status = String(lead.status ?? "new");
  const wa = waText(lead);
  const lines: string[] = [
    `${LEAD_STATUS_EMOJI[status] ?? ""} <b>${esc(LEAD_STATUS_HE[status] ?? status)}</b> · ${String(lead.created_at ?? "").slice(0, 10)}`,
    `👤 ${esc(lead.name ?? "—")}`,
    `📞 ${esc(lead.phone ?? "—")}`,
  ];
  const sourceLabel = SOURCE_HE[String(lead.source ?? "")] ?? (lead.source ? String(lead.source) : "");
  if (sourceLabel) lines.push(`📌 ${esc(sourceLabel)}`);
  if (wa) lines.push(wa);
  const kb: TgInlineKeyboard | undefined = leadKeyboardFor(lead);
  return {
    text: lines.join(NL),
    reply_markup: { inline_keyboard: kb?.inline_keyboard ?? [] },
  };
}

// A tiny provider/plan context hint for the lead card (kept off the keyboard).
function waText(lead: Lead): string {
  if (!lead.provider && !lead.plan_id) return "";
  return `📦 ${esc(lead.provider ?? "—")}${lead.plan_id ? ` / ${esc(lead.plan_id)}` : ""}`;
}
