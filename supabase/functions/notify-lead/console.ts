// The rep meeting-management console — a Telegram Mini App. The bot opens this
// page (menu button / inline button); it loads Telegram's Web App SDK, hands
// us the signed `initData`, and we serve today's agenda + upcoming/pending
// meetings with one-tap confirm / send-Zoom / reschedule / cancel actions.
//
// Routes (wired in index.ts):
//   GET  ?action=console        → the HTML page (this file's CONSOLE_HTML)
//   POST ?action=console-data   → { initData }                    → board JSON
//   POST ?action=console-act    → { initData, id, act, payload? } → updated row
//
// Auth on the two POST routes goes through authorizeRep() (HMAC over the bot
// token + the rep allowlist) — the same trust the bot commands require.

import type { Cfg, MeetingRow } from "../_shared/types.ts";
import { fetchRows, logMeetingEvent, patchCount } from "../_shared/db.ts";
import { authorizeRep } from "../_shared/webapp.ts";
import { createZoomMeeting, zoomConfigured } from "../_shared/zoom.ts";
import { sendCustomerEmail } from "../_shared/email.ts";
import { buildMeetingCustomerEmailHtml } from "../_shared/meetings.ts";
import { parseReschedule } from "../_shared/reschedule.ts";

// ── Board shaping (PURE — unit-tested) ───────────────────────────────────────

/// The trimmed meeting the page needs (never rep identity / notes / IP).
export interface ConsoleMeeting {
  id: string;
  name: string;
  phone: string;
  provider: string;
  meetingDate: string;
  slot: string;
  startsAt: string;
  status: string;
  joinUrl: string | null;
}

export function toConsoleMeeting(m: MeetingRow): ConsoleMeeting {
  return {
    id: String(m.id ?? ""),
    name: m.name ?? "",
    phone: m.phone ?? "",
    provider: m.provider ?? "",
    meetingDate: m.meeting_date ?? "",
    slot: m.slot ?? "",
    startsAt: m.starts_at ?? "",
    status: m.status ?? "pending",
    joinUrl: m.join_url ?? null,
  };
}

function israelYmd(nowMs: number): string {
  // The Israel calendar date for "now" (the page groups by Israel wall day).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

export interface ConsoleBoard {
  today: ConsoleMeeting[];
  pending: ConsoleMeeting[];
  week: ConsoleMeeting[];
  stats: { today: number; pending: number; week: number };
}

/// Partition the open meetings into the three board tabs. Pure over (rows, now):
/// today = anything (any status) happening on Israel-today; pending = awaiting
/// a rep, future-first; week = confirmed meetings in the next 7 Israel days.
export function buildBoard(rows: MeetingRow[], nowMs: number): ConsoleBoard {
  const todayYmd = israelYmd(nowMs);
  const weekEnd = nowMs + 7 * 24 * 60 * 60 * 1000;
  const ms = (m: MeetingRow) => Date.parse(m.starts_at ?? "") || 0;
  const all = rows.map(toConsoleMeeting);

  const today = all
    .filter((m) => m.meetingDate === todayYmd && m.status !== "cancelled")
    .sort((a, b) => a.slot.localeCompare(b.slot));

  const pending = all
    .filter((m) => m.status === "pending")
    .sort((a, b) => (Date.parse(a.startsAt) || 0) - (Date.parse(b.startsAt) || 0));

  const week = rows
    .filter((m) => {
      const t = ms(m);
      return m.status === "confirmed" && t >= nowMs && t <= weekEnd;
    })
    .map(toConsoleMeeting)
    .sort((a, b) => (Date.parse(a.startsAt) || 0) - (Date.parse(b.startsAt) || 0));

  return {
    today,
    pending,
    week,
    stats: { today: today.length, pending: pending.length, week: week.length },
  };
}

// ── Data + action handlers (called from index.ts after auth) ─────────────────

/// Fetch the open meetings the console shows: anything pending/confirmed plus
/// today's terminal rows (so the rep still sees a meeting that just completed).
async function fetchBoardRows(): Promise<MeetingRow[]> {
  const rows = await fetchRows<MeetingRow>(
    "/rest/v1/meetings?status=in.(pending,confirmed,no_rep,completed)" +
      "&select=id,name,phone,provider,plan_id,meeting_date,slot,starts_at,status,join_url,email" +
      "&order=starts_at.asc&limit=200",
  );
  return rows ?? [];
}

export async function handleConsoleData(cfg: Cfg, initData: string): Promise<Response> {
  const rep = await authorizeRep(initData, cfg.tgToken, cfg.allowedUserIds);
  if (!rep) return json({ ok: false, error: "unauthorized" }, 401);
  const board = buildBoard(await fetchBoardRows(), Date.now());
  const repName = [rep.first_name, rep.last_name].filter(Boolean).join(" ") || rep.username || "נציג";
  return json({ ok: true, rep: { name: repName }, ...board });
}

export async function handleConsoleAct(
  cfg: Cfg,
  body: { initData?: string; id?: string; act?: string; payload?: string },
): Promise<Response> {
  const rep = await authorizeRep(body.initData ?? "", cfg.tgToken, cfg.allowedUserIds);
  if (!rep) return json({ ok: false, error: "unauthorized" }, 401);
  const id = String(body.id ?? "");
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return json({ ok: false, error: "bad id" }, 400);
  const actor = [rep.first_name, rep.last_name].filter(Boolean).join(" ") || rep.username || "נציג";

  const rows = await fetchRows<MeetingRow>(
    `/rest/v1/meetings?id=eq.${id}&select=id,name,phone,provider,plan_id,meeting_date,slot,starts_at,status,join_url,email&limit=1`,
  );
  const m = rows?.[0];
  if (!m) return json({ ok: false, error: "not found" }, 404);

  switch (body.act) {
    case "confirm": {
      if (m.status !== "pending") return json({ ok: false, error: "כבר טופל" });
      let joinUrl: string | null = null;
      let zoomId: string | null = null;
      if (zoomConfigured(cfg)) {
        const created = await createZoomMeeting(cfg, {
          topic: `חוסך — פגישת ייעוץ ${m.provider ?? ""} עם ${m.name ?? ""}`.trim(),
          startsAtIso: m.starts_at ?? "",
        });
        if (created) { joinUrl = created.join_url; zoomId = String(created.id); }
      }
      if (!joinUrl) {
        // No auto-Zoom — the page collects a link via the `sendlink` act.
        return json({ ok: true, needsLink: true, id });
      }
      const n = await patchCount(
        `/rest/v1/meetings?id=eq.${id}&status=eq.pending`,
        { status: "confirmed", join_url: joinUrl, zoom_meeting_id: zoomId, confirmed_at: new Date().toISOString() },
      );
      if (n === 0) return json({ ok: false, error: "כבר טופל" });
      await logMeetingEvent({ meeting_id: id, event: "status_change", old_status: "pending", new_status: "confirmed", actor_name: actor });
      await logMeetingEvent({ meeting_id: id, event: "link_set", actor_name: actor, note: "console" });
      await notifyCustomer(cfg, { ...m, status: "confirmed", join_url: joinUrl });
      return okMeeting(id);
    }
    case "sendlink": {
      const link = String(body.payload ?? "").trim();
      if (!/^https:\/\/([a-z0-9-]+\.)?zoom\.us\//i.test(link)) {
        return json({ ok: false, error: "קישור Zoom לא תקין" });
      }
      const n = await patchCount(
        `/rest/v1/meetings?id=eq.${id}&status=eq.pending`,
        { status: "confirmed", join_url: link, confirmed_at: new Date().toISOString() },
      );
      if (n === 0) return json({ ok: false, error: "כבר טופל" });
      await logMeetingEvent({ meeting_id: id, event: "status_change", old_status: "pending", new_status: "confirmed", actor_name: actor });
      await logMeetingEvent({ meeting_id: id, event: "link_set", actor_name: actor, note: "console reply" });
      await notifyCustomer(cfg, { ...m, status: "confirmed", join_url: link });
      return okMeeting(id);
    }
    case "norep":
    case "cancel": {
      const newStatus = body.act === "norep" ? "no_rep" : "cancelled";
      const n = await patchCount(
        `/rest/v1/meetings?id=eq.${id}&status=in.(pending,confirmed)`,
        { status: newStatus },
      );
      if (n === 0) return json({ ok: false, error: "כבר טופל" });
      await logMeetingEvent({ meeting_id: id, event: "status_change", old_status: m.status, new_status: newStatus, actor_name: actor });
      return okMeeting(id);
    }
    case "reschedule": {
      // Shares the bot's reschedule rules + DST-safe starts_at (single source).
      const parsed = parseReschedule(String(body.payload ?? ""), Date.now());
      if (!parsed.ok) return json({ ok: false, error: parsed.error });
      const n = await patchCount(
        `/rest/v1/meetings?id=eq.${id}&status=in.(pending,confirmed)`,
        { meeting_date: parsed.meetingDate, slot: parsed.slot, starts_at: parsed.startsAt },
      );
      if (n === 0) return json({ ok: false, error: "כבר טופל" });
      await logMeetingEvent({ meeting_id: id, event: "reschedule", actor_name: actor, note: `${parsed.meetingDate} ${parsed.slot}` });
      await notifyCustomer(cfg, { ...m, meeting_date: parsed.meetingDate, slot: parsed.slot, starts_at: parsed.startsAt });
      return okMeeting(id);
    }
    default:
      return json({ ok: false, error: "unknown act" }, 400);
  }
}

async function notifyCustomer(cfg: Cfg, m: MeetingRow): Promise<void> {
  if (!m.email) return;
  try {
    await sendCustomerEmail(cfg, m.email, "אישור פגישת וידאו — חוסך", buildMeetingCustomerEmailHtml(m));
  } catch (_) { /* best-effort */ }
}

async function okMeeting(id: string): Promise<Response> {
  const rows = await fetchRows<MeetingRow>(
    `/rest/v1/meetings?id=eq.${id}&select=id,name,phone,provider,meeting_date,slot,starts_at,status,join_url&limit=1`,
  );
  return json({ ok: true, meeting: rows?.[0] ? toConsoleMeeting(rows[0]) : null });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// ── The Mini App page ────────────────────────────────────────────────────────

/// The console HTML. [mockJson] is null in production (the page fetches live
/// data via initData); a JSON string renders a no-Telegram local preview.
export function renderConsoleHtml(mockJson: string | null = null): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>לוח הפגישות · חוסך</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
:root{
  --ink:#111827; --ink-700:#1F2733; --ink-500:#4B5563; --line:#E4E8EC;
  --bg:#F5F7F8; --card:#fff; --accent:#4F46E5; --accent-t:#EEF0FB; --value:#F59E0B; --value-t:#FEF3E2;
  --ok:#0E7C5A; --danger:#DC2626;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;font-family:'Rubik','Assistant',system-ui,'Segoe UI',sans-serif;background:var(--bg);color:var(--ink);
  padding:0 0 28px;min-height:100vh}
.wrap{max-width:560px;margin:0 auto;padding:0 14px}
header{position:sticky;top:0;z-index:5;background:linear-gradient(180deg,var(--bg) 70%,rgba(245,247,248,0));padding:16px 0 8px}
.h-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
h1{font-size:20px;font-weight:800;margin:0;letter-spacing:-.4px}
.rep{font-size:12.5px;color:var(--ink-500);margin-top:2px;font-weight:600}
.refresh{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--card);
  display:grid;place-items:center;cursor:pointer;font-size:18px;color:var(--ink-700)}
.refresh:active{transform:scale(.94)}
.stats{display:flex;gap:8px;margin:12px 0 4px}
.stat{flex:1;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 8px;text-align:center}
.stat b{display:block;font-size:22px;font-weight:800;font-feature-settings:"tnum"}
.stat span{font-size:11px;color:var(--ink-500);font-weight:600}
.stat--today b{color:var(--accent)} .stat--pending b{color:var(--value)} .stat--week b{color:var(--ink)}
.tabs{display:flex;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px;margin:12px 0}
.tab{flex:1;border:0;background:transparent;font-family:inherit;font-weight:700;font-size:13.5px;color:var(--ink-500);
  padding:9px 6px;border-radius:10px;cursor:pointer;transition:.15s}
.tab.on{background:var(--accent);color:#fff}
.list{display:flex;flex-direction:column;gap:12px;margin-top:6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;
  box-shadow:0 2px 6px rgba(15,27,34,.05),0 10px 26px rgba(15,27,34,.06)}
.card--pending{border-color:rgba(245,158,11,.4)}
.card__top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.time{font-size:20px;font-weight:800;font-feature-settings:"tnum"}
.time small{font-size:12px;font-weight:600;color:var(--ink-500);margin-inline-start:6px}
.chip{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;white-space:nowrap}
.chip--pending{background:var(--value-t);color:#B45309} .chip--confirmed{background:var(--accent-t);color:var(--accent)}
.chip--no_rep,.chip--cancelled,.chip--completed{background:#EEF1F3;color:var(--ink-500)}
.who{margin-top:8px;font-size:15px;font-weight:700}
.who span{color:var(--ink-500);font-weight:600}
.contact{display:flex;gap:8px;margin-top:8px}
.contact a{flex:1;text-align:center;text-decoration:none;font-size:12.5px;font-weight:700;padding:8px;border-radius:10px;
  border:1px solid var(--line);color:var(--ink-700)}
.contact a:active{transform:scale(.97)}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.btn{flex:1 1 auto;min-width:96px;border:0;font-family:inherit;font-weight:700;font-size:13px;padding:11px 12px;border-radius:12px;
  cursor:pointer;transition:.15s}
.btn:active{transform:scale(.97)}
.btn--primary{background:linear-gradient(165deg,var(--accent),#3730A3);color:#fff;box-shadow:0 6px 14px rgba(79,70,229,.3)}
.btn--ghost{background:var(--bg);color:var(--ink-700);border:1px solid var(--line)}
.btn--danger{background:#FEECEC;color:var(--danger)}
.btn[disabled]{opacity:.5;pointer-events:none}
.empty{text-align:center;color:var(--ink-500);padding:48px 12px;font-weight:600}
.empty .em-ico{font-size:40px;display:block;margin-bottom:10px;opacity:.6}
.toast{position:fixed;inset-inline:0;bottom:20px;margin:0 auto;width:max-content;max-width:88%;background:var(--ink);
  color:#fff;font-weight:700;font-size:13px;padding:11px 18px;border-radius:14px;opacity:0;transform:translateY(12px);
  transition:.25s;pointer-events:none;z-index:9}
.toast.show{opacity:1;transform:translateY(0)}
.toast--err{background:var(--danger)}
.banner{background:var(--value-t);border:1px solid rgba(245,158,11,.4);color:#B45309;font-size:12.5px;font-weight:600;
  padding:9px 12px;border-radius:12px;margin:10px 0}
.skeleton{height:96px;border-radius:18px;background:linear-gradient(100deg,#eef1f3 30%,#f7f9fa 50%,#eef1f3 70%);
  background-size:200% 100%;animation:sk 1.2s linear infinite}
@keyframes sk{to{background-position:-200% 0}}
@media(prefers-color-scheme:dark){
  :root{--bg:#0F141A;--card:#19212B;--ink:#F2F5F7;--ink-700:#D7DDE3;--ink-500:#9AA6B2;--line:#27313D;--accent-t:#222A4A;--value-t:#3A2E16}
}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="h-row">
      <div><h1>לוח הפגישות</h1><div class="rep" id="rep">חוסך · קונסולת נציגים</div></div>
      <button class="refresh" id="refresh" aria-label="רענון">⟳</button>
    </div>
    <div class="stats">
      <div class="stat stat--today"><b id="s-today">–</b><span>היום</span></div>
      <div class="stat stat--pending"><b id="s-pending">–</b><span>ממתינות</span></div>
      <div class="stat stat--week"><b id="s-week">–</b><span>השבוע</span></div>
    </div>
    <div class="tabs">
      <button class="tab on" data-tab="today">היום</button>
      <button class="tab" data-tab="pending">ממתינות</button>
      <button class="tab" data-tab="week">השבוע</button>
    </div>
    <div id="banner"></div>
  </header>
  <div class="list" id="list">
    <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
(function(){
  "use strict";
  var MOCK = ${mockJson ?? "null"};
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg) { try { tg.expand(); tg.ready(); } catch(e){} }
  var initData = tg ? tg.initData : "";
  var board = { today:[], pending:[], week:[], stats:{today:0,pending:0,week:0} };
  var tab = "today";

  function api(action, body){
    if (MOCK) return Promise.resolve(MOCK); // local preview
    return fetch("?action="+action, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(Object.assign({initData:initData}, body||{}))
    }).then(function(r){ return r.json(); });
  }
  function haptic(type){ try{ tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred(type); }catch(e){} }
  function toast(msg, err){
    var t=document.getElementById("toast"); t.textContent=msg;
    t.className="toast show"+(err?" toast--err":""); haptic(err?"error":"success");
    setTimeout(function(){ t.className="toast"+(err?" toast--err":""); }, 2600);
  }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function he(d){
    var days=["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
    var p=(d.meetingDate||"").split("-"); if(p.length<3) return "";
    var js=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));
    return "יום "+days[js.getUTCDay()]+" · "+(+p[2])+"."+(+p[1]);
  }
  var STATUS={pending:"ממתין לאישור",confirmed:"מאושרת",no_rep:"אין נציג",cancelled:"בוטלה",completed:"הסתיימה"};

  function card(m){
    var digits=(m.phone||"").replace(/\\D/g,""); if(digits.indexOf("0")===0) digits="972"+digits.slice(1);
    var wa="https://wa.me/"+digits, tel="tel:"+(m.phone||"");
    var acts="";
    if(m.status==="pending"){
      acts='<button class="btn btn--primary" data-act="confirm" data-id="'+m.id+'">אשר ושלח Zoom</button>'+
           '<button class="btn btn--ghost" data-act="reschedule" data-id="'+m.id+'">שנה מועד</button>'+
           '<button class="btn btn--danger" data-act="cancel" data-id="'+m.id+'">בטל</button>';
    } else if(m.status==="confirmed"){
      acts=(m.joinUrl?'<a class="btn btn--primary" style="text-align:center;text-decoration:none" href="'+esc(m.joinUrl)+'" target="_blank" rel="noopener">פתח Zoom</a>':"")+
           '<button class="btn btn--ghost" data-act="reschedule" data-id="'+m.id+'">שנה מועד</button>'+
           '<button class="btn btn--danger" data-act="cancel" data-id="'+m.id+'">בטל</button>';
    }
    return '<div class="card card--'+m.status+'">'+
      '<div class="card__top"><div class="time">'+esc(m.slot)+'<small>'+he(m)+'</small></div>'+
      '<span class="chip chip--'+m.status+'">'+(STATUS[m.status]||m.status)+'</span></div>'+
      '<div class="who">'+esc(m.name)+(m.provider?' <span>· '+esc(m.provider)+'</span>':"")+'</div>'+
      '<div class="contact"><a href="'+wa+'" target="_blank" rel="noopener">וואטסאפ</a><a href="'+tel+'">חיוג</a></div>'+
      (acts?'<div class="acts">'+acts+'</div>':"")+'</div>';
  }
  function empty(txt){ return '<div class="empty"><span class="em-ico">📅</span>'+txt+'</div>'; }

  function render(){
    document.getElementById("s-today").textContent=board.stats.today;
    document.getElementById("s-pending").textContent=board.stats.pending;
    document.getElementById("s-week").textContent=board.stats.week;
    var items=board[tab]||[];
    var html = items.length ? items.map(card).join("") :
      empty(tab==="today"?"אין פגישות היום":tab==="pending"?"אין בקשות שממתינות לאישור":"אין פגישות מאושרות השבוע");
    document.getElementById("list").innerHTML=html;
  }
  function setTab(t){ tab=t; [].forEach.call(document.querySelectorAll(".tab"),function(b){b.classList.toggle("on",b.dataset.tab===t);}); render(); }

  function load(){
    api("console-data").then(function(d){
      if(!d||!d.ok){ document.getElementById("list").innerHTML=empty(d&&d.error==="unauthorized"?"אין הרשאה — פתחו מתוך הבוט":"שגיאה בטעינה"); return; }
      board=d; if(d.rep&&d.rep.name) document.getElementById("rep").textContent="שלום "+d.rep.name;
      if(MOCK) document.getElementById("banner").innerHTML='<div class="banner">תצוגה מקדימה — נתוני דוגמה (ללא טלגרם)</div>';
      render();
    }).catch(function(){ document.getElementById("list").innerHTML=empty("שגיאת רשת"); });
  }

  function act(id, action, payload){
    api("console-act",{id:id,act:action,payload:payload}).then(function(d){
      if(!d||!d.ok){ toast((d&&d.error)||"הפעולה נכשלה", true); return; }
      if(d.needsLink){
        promptLink(id); return;
      }
      toast("בוצע"); load();
    }).catch(function(){ toast("שגיאת רשת", true); });
  }
  function promptLink(id){
    var link = window.prompt("הדביקו קישור Zoom לפגישה:");
    if(link) act(id,"sendlink",link.trim());
  }
  function promptReschedule(id){
    var v = window.prompt("מועד חדש (YYYY-MM-DD HH:MM):");
    if(v) act(id,"reschedule",v.trim());
  }

  document.getElementById("refresh").addEventListener("click", load);
  [].forEach.call(document.querySelectorAll(".tab"),function(b){ b.addEventListener("click",function(){ setTab(b.dataset.tab); }); });
  document.getElementById("list").addEventListener("click", function(e){
    var el=e.target.closest("[data-act]"); if(!el) return;
    var id=el.dataset.id, a=el.dataset.act;
    if(a==="reschedule"){ promptReschedule(id); return; }
    if(a==="cancel" && !window.confirm("לבטל את הפגישה?")) return;
    el.setAttribute("disabled","disabled");
    act(id,a);
  });

  load();
})();
</script>
</body>
</html>`;
}
