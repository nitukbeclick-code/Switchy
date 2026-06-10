// Digest builders: daily renewal digest + weekly business report.
// Pure formatting — data fetching stays in the functions.

import type { Lead, RenewalRow } from "./types.ts";
import { esc, NL, waLink } from "./telegram.ts";
import { SOURCE_HE } from "./leads.ts";

export const CAT_HE: Record<string, string> = {
  cellular: "סלולר", internet: "אינטרנט", tv: "טלוויזיה",
  triple: "חבילה משולבת", abroad: "חו\"ל",
};

export function daysUntil(dateStr: string, now = new Date()): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function waSuffix(phone: string | null): string {
  const wa = waLink(phone);
  return wa ? ` — <a href="${wa}">WhatsApp</a>` : "";
}

export function buildDigest(rows: RenewalRow[], days: number, now = new Date()): string {
  if (rows.length === 0) {
    return `📅 <b>חידושים קרובים — חוסך</b>${NL}${NL}אין מסלולים המתחדשים ב-${days} הימים הקרובים.`;
  }
  const lines: string[] = [`📅 <b>חידושים קרובים — חוסך (${days} ימים)</b>`, ""];
  for (const r of rows) {
    const d = daysUntil(r.promo_end_date, now);
    const urgency = d <= 3 ? "🔴" : d <= 7 ? "🟡" : "🟢";
    const cat = CAT_HE[r.category] ?? r.category;
    lines.push(`${urgency} <b>${esc(r.name ?? "ללא שם")}</b> — ${esc(r.phone ?? "")}${waSuffix(r.phone)}`);
    lines.push(`   📦 ${esc(r.provider)} · ${esc(r.plan_name)} · ₪${esc(r.monthly_price)}/חודש · ${esc(cat)}`);
    lines.push(`   📆 מתחדש: ${esc(r.promo_end_date)} (עוד ${d} ימים)`);
    lines.push("");
  }
  lines.push(`<i>נשלח אוטומטית על ידי מערכת חוסך</i>`);
  return lines.join(NL);
}

export type SourceStat = {
  source: string;
  total: number;
  new_leads: number;
  contacted: number;
  won: number;
  lost: number;
};

export type WeeklyInput = {
  thisWeek: Lead[];                 // leads created in the last 7 days
  lastWeek: Lead[];                 // leads created 7-14 days ago
  bySource: SourceStat[];           // all-time funnel (leads_by_source view)
  topPlans: { plan_id: string; provider: string; view_count: number }[];
  topProviders: { provider: string; view_count: number }[];
  hotBrowsers: number;              // signed-in browsers with no lead (7d)
  medianContactMinutes: number | null; // speed-to-lead, this week
};

function trend(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? "🆕" : "—";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return pct > 0 ? `▲ ${pct}%` : pct < 0 ? `▼ ${Math.abs(pct)}%` : "=";
}

export function buildWeekly(input: WeeklyInput, now = new Date()): string {
  const won = (ls: Lead[]) => ls.filter((l) => l.status === "won").length;
  const curr = input.thisWeek.length, prev = input.lastWeek.length;
  const currWon = won(input.thisWeek), prevWon = won(input.lastWeek);
  const lines: string[] = [
    `📈 <b>דוח שבועי — חוסך</b> (${now.toISOString().slice(0, 10)})`,
    "",
    `🔔 לידים השבוע: <b>${curr}</b> (${trend(curr, prev)} מול ${prev} שבוע שעבר)`,
    `🏆 נסגרו מהלידים של השבוע: <b>${currWon}</b> (${trend(currWon, prevWon)} מול ${prevWon})`,
    input.medianContactMinutes !== null
      ? `⚡ מהירות תגובה חציונית: <b>${formatMinutes(input.medianContactMinutes)}</b> מליד ועד שיחה`
      : `⚡ מהירות תגובה: אין עדיין נתונים השבוע`,
  ];
  if (input.bySource.length > 0) {
    lines.push("", "<b>המשפך (כל הזמנים):</b>");
    for (const s of input.bySource.slice(0, 6)) {
      const label = SOURCE_HE[s.source] ?? s.source;
      lines.push(`• ${esc(label)} — ${s.total} לידים, ${s.won} נסגרו`);
    }
  }
  if (input.topPlans.length > 0) {
    lines.push("", "<b>🔥 המסלולים הנצפים (30 יום):</b>");
    for (const p of input.topPlans.slice(0, 3)) {
      lines.push(`• ${esc(p.provider)} · ${esc(p.plan_id)} — ${p.view_count} צפיות`);
    }
  }
  if (input.topProviders.length > 0) {
    const names = input.topProviders.slice(0, 3).map((p) => esc(p.provider)).join(", ");
    lines.push(`👀 ספקים מבוקשים: ${names}`);
  }
  if (input.hotBrowsers > 0) {
    lines.push("", `🌡️ <b>${input.hotBrowsers} גולשים חמים</b> צפו במסלולים ולא השאירו פנייה — שלחו /hot לרשימה.`);
  }
  lines.push("", `<i>הבוט פעיל ✅ — נשלח אוטומטית על ידי מערכת חוסך</i>`);
  return lines.join(NL);
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)} דק׳`;
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return m > 0 ? `${h} שע׳ ${m} דק׳` : `${h} שע׳`;
}

export function medianMinutes(pairs: { created_at?: string; contacted_at?: string | null }[]): number | null {
  const diffs = pairs
    .map((p) => (Date.parse(String(p.contacted_at ?? "")) - Date.parse(String(p.created_at ?? ""))) / 60000)
    .filter((d) => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a - b);
  if (diffs.length === 0) return null;
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
}
