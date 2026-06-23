// Team chat commands: /today, /agenda, /week, /leads, /meetings, /stats,
// /search, /customer, /hot, /weekly, /help.

import type { Cfg, Lead, MeetingRow } from "../_shared/types.ts";
import { esc, NL, sendTelegram, waLink } from "../_shared/telegram.ts";
import { fetchRows, rpcRows } from "../_shared/db.ts";
import { buildText, keyboardFor, SOURCE_HE, STATUS_EMOJI, STATUS_HE } from "../_shared/leads.ts";
import { buildMeetingText, MEETING_STATUS_EMOJI, MEETING_STATUS_HE, meetingKeyboardFor } from "../_shared/meetings.ts";
import { formatMinutes, medianMinutes } from "../_shared/digests.ts";
import { buildWeeklyReport } from "../_shared/weekly.ts";
import { buildAgenda, buildDailyDigest, buildDossier, buildStats, buildWeek, type DossierInput } from "../_shared/agenda.ts";

type CmdResult = { ok: boolean; command: string; failures?: number };

async function sendLeadCards(cfg: Cfg, leads: Lead[]): Promise<number> {
  let failures = 0;
  // oldest of the batch first so the newest lands closest to the input box
  for (const lead of [...leads].reverse()) {
    const head = `${STATUS_EMOJI[String(lead.status ?? "new")] ?? ""} <b>${esc(STATUS_HE[String(lead.status ?? "new")] ?? lead.status)}</b> · ${String(lead.created_at ?? "").slice(0, 10)}`;
    // status-aware keyboard: closed leads stay frozen even in search results
    const r = await sendTelegram(cfg, head + NL + buildText(lead), keyboardFor(lead));
    if (!r.ok) failures++;
  }
  if (failures > 0) {
    await sendTelegram(cfg, `⚠️ ${failures} כרטיסים לא נשלחו (תקלת טלגרם) — נסו שוב עוד רגע.`);
  }
  return failures;
}

// Honest failure: a broken query must not read as "no results".
async function reportQueryFailure(cfg: Cfg, cmd: string): Promise<CmdResult> {
  await sendTelegram(cfg, "⚠️ השאילתה נכשלה — נסו שוב בעוד רגע.");
  return { ok: false, command: cmd };
}

const enc = encodeURIComponent;

// A bare phone token in the team chat (e.g. "0501234567" or "+972501234567").
// 9–15 digits, optional leading +, separators allowed. Returns the digits.
export function baresPhone(text: string): string | null {
  const t = text.trim();
  if (!/^\+?[0-9][0-9\-\s]{7,15}$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

// Today's agenda: confirmed + pending meetings (±24h, trimmed to the Israel day
// by buildAgenda) and uncontacted (status=new) leads. Returns null on a failed
// query so the caller can say "try again" instead of "nothing today".
async function fetchAgenda(): Promise<{ confirmed: MeetingRow[]; pending: MeetingRow[]; uncontacted: Lead[] } | null> {
  const winStart = enc(new Date(Date.now() - 24 * 3_600_000).toISOString());
  const winEnd = enc(new Date(Date.now() + 36 * 3_600_000).toISOString());
  const [confirmed, pending, uncontacted] = await Promise.all([
    fetchRows<MeetingRow>(`/rest/v1/meetings?select=*&status=eq.confirmed&starts_at=gte.${winStart}&starts_at=lt.${winEnd}&order=starts_at.asc&limit=30`),
    fetchRows<MeetingRow>(`/rest/v1/meetings?select=*&status=eq.pending&starts_at=gte.${winStart}&starts_at=lt.${winEnd}&order=starts_at.asc&limit=30`),
    fetchRows<Lead>(`/rest/v1/leads?select=*&status=eq.new&order=created_at.asc&limit=30`),
  ]);
  if (confirmed === null || pending === null || uncontacted === null) return null;
  return { confirmed, pending, uncontacted };
}

// Compose a customer-360 dossier from existing tables (no new SQL): resolve the
// phone to lead/meeting rows + (when those carry a user_id) the profile name,
// tracked plans and reviews. Returns null on a failed query.
export async function fetchDossier(phoneDigits: string): Promise<DossierInput | null> {
  const [leads, meetings] = await Promise.all([
    rpcRows<Lead>("search_leads", { q: phoneDigits }),
    // meetings have no search RPC — match on the normalized phone column
    fetchRows<MeetingRow>(`/rest/v1/meetings?select=*&phone=ilike.*${enc(phoneDigits.slice(-9))}*&order=created_at.desc&limit=50`),
  ]);
  if (leads === null || meetings === null) return null;
  // a user_id anchors the profile / tracked plans / reviews lookups
  const userId = leads.map((l) => l.user_id).find(Boolean) ?? meetings.map((m) => m.user_id).find(Boolean) ?? null;
  let profileName: string | null = null;
  let tracked: DossierInput["tracked"] = [];
  let reviews: DossierInput["reviews"] = [];
  if (userId) {
    const [prof, trk, rev] = await Promise.all([
      fetchRows<{ name?: string | null }>(`/rest/v1/profiles?select=name&id=eq.${enc(String(userId))}`),
      fetchRows<{ category?: string; provider?: string; plan_name?: string; monthly_price?: number; promo_end_date?: string | null }>(
        `/rest/v1/tracked_plans?select=category,provider,plan_name,monthly_price,promo_end_date&user_id=eq.${enc(String(userId))}&order=created_at.desc&limit=20`),
      fetchRows<{ provider?: string; overall?: number; body?: string }>(
        `/rest/v1/provider_reviews?select=provider,overall,body&user_id=eq.${enc(String(userId))}&order=created_at.desc&limit=20`),
    ]);
    profileName = prof?.[0]?.name ?? null;
    tracked = trk ?? [];
    reviews = rev ?? [];
  }
  return { query: phoneDigits, profileName, leads, meetings, tracked, reviews };
}

async function sendDossier(cfg: Cfg, phoneDigits: string): Promise<CmdResult> {
  const d = await fetchDossier(phoneDigits);
  if (d === null) return await reportQueryFailure(cfg, "/customer");
  if (d.leads.length === 0 && d.meetings.length === 0) {
    await sendTelegram(cfg, `🗂️ לא נמצא לקוח עם הטלפון <code>${esc(phoneDigits)}</code>.`);
    return { ok: true, command: "/customer" };
  }
  await sendTelegram(cfg, buildDossier(d));
  return { ok: true, command: "/customer" };
}

export async function handleCommand(cfg: Cfg, cmd: string, args: string): Promise<CmdResult> {
  if (cmd === "/today" || cmd === "/agenda") {
    const data = await fetchAgenda();
    if (data === null) return await reportQueryFailure(cfg, cmd);
    await sendTelegram(cfg, buildAgenda(data, Date.now()));
    return { ok: true, command: cmd };
  }

  if (cmd === "/digest") {
    // The count-led executive brief over the same agenda data as /today.
    const data = await fetchAgenda();
    if (data === null) return await reportQueryFailure(cfg, cmd);
    await sendTelegram(cfg, buildDailyDigest(data, Date.now()));
    return { ok: true, command: cmd };
  }

  if (cmd === "/week") {
    const winStart = enc(new Date(Date.now() - 24 * 3_600_000).toISOString());
    const winEnd = enc(new Date(Date.now() + 8 * 86_400_000).toISOString());
    const meetings = await fetchRows<MeetingRow>(
      `/rest/v1/meetings?select=*&status=eq.confirmed&starts_at=gte.${winStart}&starts_at=lt.${winEnd}&order=starts_at.asc&limit=100`,
    );
    if (meetings === null) return await reportQueryFailure(cfg, cmd);
    await sendTelegram(cfg, buildWeek(meetings, Date.now()));
    return { ok: true, command: cmd };
  }

  if (cmd === "/customer") {
    const digits = baresPhone(args.trim());
    if (!digits) {
      await sendTelegram(cfg, "🗂️ שימוש: <code>/customer 0501234567</code> (או פשוט שלחו מספר טלפון)");
      return { ok: true, command: cmd };
    }
    return await sendDossier(cfg, digits);
  }

  if (cmd === "/leads") {
    const open = await fetchRows<Lead>("/rest/v1/leads?status=in.(new,contacted)&order=created_at.desc&limit=5&select=*");
    if (open === null) return await reportQueryFailure(cfg, cmd);
    if (open.length === 0) {
      await sendTelegram(cfg, "📭 אין לידים פתוחים — הכול טופל 🎉");
      return { ok: true, command: cmd };
    }
    await sendTelegram(cfg, `📬 <b>${open.length} הלידים הפתוחים האחרונים</b> (חדש / בטיפול):`);
    const failures = await sendLeadCards(cfg, open);
    return { ok: true, command: cmd, failures };
  }

  if (cmd === "/meetings") {
    const nowIso = encodeURIComponent(new Date().toISOString());
    const open = await fetchRows<MeetingRow>(
      `/rest/v1/meetings?status=in.(pending,confirmed)&starts_at=gt.${nowIso}&order=starts_at.asc&limit=5&select=*`,
    );
    if (open === null) return await reportQueryFailure(cfg, cmd);
    if (open.length === 0) {
      await sendTelegram(cfg, "🎥 אין פגישות וידאו קרובות.");
      return { ok: true, command: cmd };
    }
    await sendTelegram(cfg, `🎥 <b>${open.length} פגישות הווידאו הקרובות</b> (ממתינות / מאושרות):`);
    let failures = 0;
    // latest of the batch first so the soonest lands closest to the input box
    for (const m of [...open].reverse()) {
      const status = String(m.status ?? "pending");
      const head = `${MEETING_STATUS_EMOJI[status] ?? ""} <b>${esc(MEETING_STATUS_HE[status] ?? status)}</b>`;
      // status-aware keyboard: confirmed meetings stay frozen even in listings
      const r = await sendTelegram(cfg, head + NL + buildMeetingText(m), meetingKeyboardFor(m));
      if (!r.ok) failures++;
    }
    if (failures > 0) {
      await sendTelegram(cfg, `⚠️ ${failures} כרטיסים לא נשלחו (תקלת טלגרם) — נסו שוב עוד רגע.`);
    }
    return { ok: true, command: cmd, failures };
  }

  if (cmd === "/search") {
    const q = args.trim();
    if (q.length < 2) {
      await sendTelegram(cfg, "🔎 שימוש: <code>/search שם או טלפון</code>");
      return { ok: true, command: cmd };
    }
    const hits = await rpcRows<Lead>("search_leads", { q });
    if (hits === null) return await reportQueryFailure(cfg, cmd);
    if (hits.length === 0) {
      await sendTelegram(cfg, `🔎 לא נמצאו לידים עבור "${esc(q)}"`);
      return { ok: true, command: cmd };
    }
    await sendTelegram(cfg, `🔎 <b>${hits.length} תוצאות</b> עבור "${esc(q)}":`);
    const failures = await sendLeadCards(cfg, hits);
    return { ok: true, command: cmd, failures };
  }

  if (cmd === "/stats") {
    const sevenAgo = enc(new Date(Date.now() - 7 * 86_400_000).toISOString());
    const [rows, contacted, weekLeads, weekMeetings] = await Promise.all([
      fetchRows<Record<string, unknown>>("/rest/v1/leads_by_source?select=*"),
      fetchRows<Lead>("/rest/v1/leads?contacted_at=not.is.null&select=created_at,contacted_at&order=created_at.desc&limit=200"),
      fetchRows<Lead>(`/rest/v1/leads?select=status,created_at,contacted_at,actual_saving&created_at=gte.${sevenAgo}&limit=1000`),
      fetchRows<MeetingRow>(`/rest/v1/meetings?select=status,created_at&created_at=gte.${sevenAgo}&limit=1000`),
    ]);
    if (rows === null) return await reportQueryFailure(cfg, cmd);
    if (rows.length === 0) {
      await sendTelegram(cfg, "📊 אין עדיין לידים במערכת.");
      return { ok: true, command: cmd };
    }
    // this-week funnel first (the most actionable view)
    await sendTelegram(cfg, buildStats({ weekLeads: weekLeads ?? [], weekMeetings: weekMeetings ?? [] }));
    const tot = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const med = medianMinutes(contacted ?? []);
    const lines = [
      "📊 <b>סטטיסטיקת לידים — חוסך (כל הזמנים)</b>",
      "",
      `סה"כ: <b>${tot("total")}</b> | 🆕 ${tot("new_leads")} | 📞 ${tot("contacted")} | 🏆 ${tot("won")} | ❌ ${tot("lost")}`,
      med !== null ? `⚡ מהירות תגובה חציונית: <b>${formatMinutes(med)}</b>` : null,
      "",
      "<b>לפי מקור:</b>",
      ...rows.map((r) => {
        const label = SOURCE_HE[String(r.source ?? "")] ?? String(r.source ?? "");
        return `• ${esc(label)} — ${r.total} (${r.new_leads} חדשים, ${r.won} נסגרו)`;
      }),
    ].filter((x): x is string => x !== null);
    await sendTelegram(cfg, lines.join(NL));
    return { ok: true, command: cmd };
  }

  if (cmd === "/hot") {
    const hot = await rpcRows<Record<string, unknown>>("get_hot_browsers", {});
    if (hot === null) return await reportQueryFailure(cfg, cmd);
    if (hot.length === 0) {
      await sendTelegram(cfg, "🌡️ אין כרגע גולשים חמים (משתמשים מחוברים שצפו במסלולים בלי להשאיר פנייה).");
      return { ok: true, command: cmd };
    }
    const lines = [
      `🌡️ <b>${hot.length} גולשים חמים</b> — צפו במסלולים בשבוע האחרון ולא השאירו פנייה:`,
      "",
      ...hot.map((h) => {
        const wa = waLink(h.phone);
        return `• <b>${esc(h.name)}</b> — ${h.views} צפיות, בעיקר ${esc(h.top_provider)}` +
          (wa ? ` — <a href="${wa}">WhatsApp</a>` : "");
      }),
    ];
    await sendTelegram(cfg, lines.join(NL));
    return { ok: true, command: cmd };
  }

  if (cmd === "/weekly") {
    await sendTelegram(cfg, await buildWeeklyReport());
    return { ok: true, command: cmd };
  }

  // /help and anything unrecognized
  await sendTelegram(cfg, [
    "🤖 <b>הנציג הדיגיטלי של חוסך</b>",
    "",
    "/today — סדר היום: פגישות מאושרות וממתינות + לידים שלא טופלו",
    "/agenda — כינוי ל-/today",
    "/digest — דייג'סט יומי קצר: המספרים של היום + מה דחוף עכשיו",
    "/week — הפגישות המאושרות ב-7 הימים הקרובים, לפי יום",
    "/leads — הלידים הפתוחים האחרונים, עם כפתורי סטטוס",
    "/meetings — פגישות הווידאו הקרובות, עם כפתורי אישור",
    "/search <code>שם או טלפון</code> — איתור ליד ישן",
    "/customer <code>טלפון</code> — תיק לקוח מלא (אפשר גם לשלוח מספר טלפון)",
    "/stats — המשפך השבועי + המשפך לפי מקור + מהירות תגובה",
    "/hot — גולשים שצפו במסלולים ולא השאירו פנייה",
    "/weekly — הדוח העסקי השבועי, עכשיו",
    "/help — ההודעה הזו",
    "",
    "<i>טיפים: כפתור 🙋 תופס בעלות על ליד; ⏰ דחה דוחה את התזכורת בכשעתיים; תשובה (reply) להודעת ליד נשמרת כהערה; אחרי 🏆 השיבו עם סכום החיסכון; כפתור 🔄 על כרטיס פגישה מאפשר לשנות מועד.</i>",
  ].join(NL));
  return { ok: true, command: cmd };
}

export const BOT_COMMANDS = [
  { command: "today", description: "סדר היום — פגישות ולידים פתוחים" },
  { command: "agenda", description: "כינוי ל-/today" },
  { command: "digest", description: "דייג'סט יומי — המספרים של היום ומה דחוף" },
  { command: "week", description: "פגישות מאושרות ב-7 הימים הקרובים" },
  { command: "leads", description: "לידים פתוחים עם כפתורי סטטוס" },
  { command: "meetings", description: "פגישות וידאו קרובות" },
  { command: "search", description: "חיפוש ליד לפי שם או טלפון" },
  { command: "customer", description: "תיק לקוח מלא לפי טלפון" },
  { command: "stats", description: "המשפך השבועי ומהירות תגובה" },
  { command: "hot", description: "גולשים חמים בלי פנייה" },
  { command: "weekly", description: "הדוח השבועי עכשיו" },
  { command: "help", description: "עזרה" },
];
