// Team chat commands: /leads, /meetings, /stats, /search, /hot, /weekly, /help.

import type { Cfg, Lead, MeetingRow } from "../_shared/types.ts";
import { esc, NL, sendTelegram, waLink } from "../_shared/telegram.ts";
import { fetchRows, rpcRows } from "../_shared/db.ts";
import { buildText, keyboardFor, SOURCE_HE, STATUS_EMOJI, STATUS_HE } from "../_shared/leads.ts";
import { buildMeetingText, MEETING_STATUS_EMOJI, MEETING_STATUS_HE, meetingKeyboardFor } from "../_shared/meetings.ts";
import { formatMinutes, medianMinutes } from "../_shared/digests.ts";
import { buildWeeklyReport } from "../_shared/weekly.ts";

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

export async function handleCommand(cfg: Cfg, cmd: string, args: string): Promise<CmdResult> {
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
    const [rows, contacted] = await Promise.all([
      fetchRows<Record<string, unknown>>("/rest/v1/leads_by_source?select=*"),
      fetchRows<Lead>("/rest/v1/leads?contacted_at=not.is.null&select=created_at,contacted_at&order=created_at.desc&limit=200"),
    ]);
    if (rows === null) return await reportQueryFailure(cfg, cmd);
    if (rows.length === 0) {
      await sendTelegram(cfg, "📊 אין עדיין לידים במערכת.");
      return { ok: true, command: cmd };
    }
    const tot = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const med = medianMinutes(contacted ?? []);
    const lines = [
      "📊 <b>סטטיסטיקת לידים — חוסך</b>",
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
    "/leads — הלידים הפתוחים האחרונים, עם כפתורי סטטוס",
    "/meetings — פגישות הווידאו הקרובות, עם כפתורי אישור",
    "/search <code>שם או טלפון</code> — איתור ליד ישן",
    "/stats — המשפך לפי מקור + מהירות תגובה",
    "/hot — גולשים שצפו במסלולים ולא השאירו פנייה",
    "/weekly — הדוח העסקי השבועי, עכשיו",
    "/help — ההודעה הזו",
    "",
    "<i>טיפים: כפתור 🙋 תופס בעלות על ליד; תשובה (reply) להודעת ליד נשמרת כהערה; אחרי 🏆 השיבו עם סכום החיסכון.</i>",
  ].join(NL));
  return { ok: true, command: cmd };
}

export const BOT_COMMANDS = [
  { command: "leads", description: "לידים פתוחים עם כפתורי סטטוס" },
  { command: "meetings", description: "פגישות וידאו קרובות" },
  { command: "search", description: "חיפוש ליד לפי שם או טלפון" },
  { command: "stats", description: "משפך הלידים ומהירות תגובה" },
  { command: "hot", description: "גולשים חמים בלי פנייה" },
  { command: "weekly", description: "הדוח השבועי עכשיו" },
  { command: "help", description: "עזרה" },
];
