/* proto-screens-g.jsx — Live agent chat + Number-porting form */

const CHAT_SEED = [
  { who: "agent", t: "שלום דני! 👋 אני דנה, הנציגה האישית שלך. אני כאן ללוות אותך עד הניתוק המלא מהספק הישן.", time: "09:32" },
  { who: "agent", t: "יש לי עדכון: בקשת הניוד הוגשה לספק הישן. בדרך כלל זה לוקח 3–5 ימי עסקים.", time: "09:32" },
  { who: "me", t: "מעולה, תודה! צריך שאעשה משהו מצידי?", time: "09:34" },
  { who: "agent", t: "לא צריך 🙂 אנחנו מטפלים בהכול. רק נוודא יחד שלא חויבת פעמיים — אשלח לך אישור ברגע שהניתוק יושלם.", time: "09:35" },
];
const QUICK = ["מתי הניתוק יושלם?", "האם המספר יישמר?", "קיבלתי חיוב כפול"];

function Chat({ app }) {
  const [msgs, setMsgs] = useState(CHAT_SEED);
  const [draft, setDraft] = useState("");
  const send = (txt) => {
    const t = (txt || draft).trim(); if (!t) return;
    setMsgs(m => [...m, { who: "me", t, time: "עכשיו" }]);
    setDraft("");
    setTimeout(() => setMsgs(m => [...m, { who: "agent", t: "קיבלתי 🙏 בודקת ומיד חוזרת אליך עם תשובה מדויקת.", time: "עכשיו" }]), 900);
  };
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll" style={{ background: "var(--paper-2)" }}>
        <div style={{ background: "var(--card)", borderBottom: "1px solid var(--line)" }}>
          <AppHeader title="דנה · הנציגה שלך" sub="מחוברת · מלווה את הניתוק" onBack={() => app.go("tracker")}
            right={<span className="avatar" style={{ width: 38, height: 38, fontSize: 14, background: "var(--green-2)" }}>ד</span>} />
        </div>
        <div className="pad" style={{ paddingTop: 14, paddingBottom: 150, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--ink-3)", fontWeight: 700, margin: "2px 0 6px" }}>היום</div>
          {msgs.map((m, i) => (
            <div key={i} className={"chatbub " + m.who}>
              <div className="b">{m.t}</div>
              <div className="tm">{m.time}{m.who === "agent" && " · דנה"}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, background: "var(--card)", borderTop: "1px solid var(--line)" }}>
        <div className="chiprow" style={{ padding: "10px 14px 2px" }}>
          {QUICK.map(q => <span key={q} className="chip" style={{ fontSize: 12 }} onClick={() => send(q)}>{q}</span>)}
        </div>
        <div className="composer" style={{ position: "static", boxShadow: "none", borderTop: "none", paddingTop: 6 }}>
          <input className="input" placeholder="כתבו הודעה לדנה…" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
          <button className="send" disabled={!draft.trim()} onClick={() => send()}><Icon n="up" s={22} w={2.4} /></button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- NUMBER PORTING ---------------- */
function Porting({ app }) {
  const [f, setF] = useState({ number: "", id: "", from: "", agree: false });
  const [docs, setDocs] = useState([]);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = f.number.replace(/\D/g, "").length >= 9 && f.id.replace(/\D/g, "").length >= 8 && f.from && f.agree;
  const FROMS = ["פלאפון", "סלקום", "פרטנר", "הוט מובייל", "גולן", "019", "אחר"];
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="ניוד מספר" sub="שומרים על המספר שלך" onBack={() => app.go("tracker")} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: 120 }}>
          <div className="reassure" style={{ marginBottom: 20 }}>
            <div className="ic"><Icon n="shield" s={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="t">ניוד = שמירת המספר</div>
              <div className="d">אנחנו מנייּדים את המספר אליך לספק החדש — לא מנתקים אותו. כך לא תאבד את המספר.</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div className="field"><label>מספר הטלפון לניוד</label>
              <input className="input" type="tel" placeholder="050-0000000" value={f.number} onChange={e => set("number", e.target.value)} /></div>
            <div className="field"><label>מספר ת.ז של בעל הקו</label>
              <input className="input" type="tel" placeholder="000000000" value={f.id} onChange={e => set("id", e.target.value)} /></div>
            <div className="field"><label>הספק הנוכחי (ממנו מנייּדים)</label>
              <div className="seg">{FROMS.map(p => <span key={p} className={"chip" + (f.from === p ? " on" : "")} onClick={() => set("from", p)}>{p}</span>)}</div>
            </div>
            <div className="field"><label>מסמכים (ת.ז / חשבונית אחרונה)</label>
              <div className="dropzone" onClick={() => setDocs(d => [...d, "מסמך " + (d.length + 1)])}>
                <div className="ic"><Icon n="plus" s={22} /></div>
                <div className="label" style={{ fontSize: 14 }}>העלאת מסמך</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, marginTop: 3 }}>{docs.length ? docs.length + " מסמכים הועלו ✓" : "צילום או קובץ"}</div>
              </div>
            </div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }} onClick={() => set("agree", !f.agree)}>
              <span style={{ flex: "0 0 auto", width: 22, height: 22, borderRadius: 7, border: "2px solid " + (f.agree ? "var(--green)" : "var(--line-2)"), background: f.agree ? "var(--green)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{f.agree && <Icon n="check" s={14} style={{ color: "#fff" }} />}</span>
              <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600, lineHeight: 1.5 }}>אני מאשר/ת ניוד המספר ומייפה את כוחכם לפעול מול הספק הישן בשמי.</span>
            </label>
          </div>
        </div>
      </div>
      <div className="stickybar">
        <button className="btn" disabled={!valid} onClick={() => { app.showToast("בקשת הניוד נשלחה ✓"); app.go("tracker"); }}>שליחת בקשת ניוד</button>
      </div>
    </div>
  );
}

/* ---------------- AGENT DASHBOARD (demo) ---------------- */
const LEADS = [
  { name: "מאיה ל.", cat: "אינטרנט", bill: 159, save: 720, score: "חם", st: "ממתין לשיחה" },
  { name: "יוסי כ.", cat: "סלולר", bill: 124, save: 1020, score: "חם", st: "ממתין לשיחה" },
  { name: "דנה ר.", cat: "טריפל", bill: 280, save: 960, score: "חמים", st: "בשיחה" },
  { name: "אבי מ.", cat: "טלוויזיה", bill: 99, save: 240, score: "פושר", st: "ממתין" },
  { name: "נועה ש.", cat: "סלולר", bill: 89, save: 360, score: "חמים", st: "בליווי ניתוק" },
  { name: "רון ב.", cat: "אינטרנט", bill: 139, save: 480, score: "פושר", st: "הושלם" },
];
const SCORECOLOR = { "חם": "#C5533B", "חמים": "#D99A2B", "פושר": "#7C8C82" };

function Agent({ app }) {
  const hot = LEADS.filter(l => l.score === "חם").length;
  const totalSave = LEADS.reduce((s, l) => s + l.save, 0);
  return (
    <div className="view-scroll">
      <AppHeader title="דשבורד נציג" sub="הלידים שלי · דמו" onBack={() => app.go("profile")} />
      <div className="pad" style={{ paddingTop: 4 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {[[LEADS.length, "לידים פתוחים"], [hot, "חמים 🔥"], ["₪" + totalSave.toLocaleString(), "פוטנציאל חיסכון"]].map((s, i) => (
            <div className="card tight" key={i} style={{ flex: 1, textAlign: "center", padding: "13px 4px" }}>
              <div style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 17, color: "var(--green)" }}>{s[0]}</div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 700, marginTop: 2 }}>{s[1]}</div>
            </div>
          ))}
        </div>
        <div className="chiprow" style={{ margin: "16px 0 6px" }}>
          <span className="chip on">הכל</span><span className="chip">חמים</span><span className="chip">בטיפול</span><span className="chip">הושלם</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {LEADS.map((l, i) => (
            <div className="card tight" key={i} style={{ display: "flex", alignItems: "center", gap: 11 }} onClick={() => app.showToast("פרטי הליד נפתחים בגרסה המלאה")}>
              <span className="avatar" style={{ width: 38, height: 38, fontSize: 14, background: SCORECOLOR[l.score] }}>{l.name[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13.5 }}>{l.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: SCORECOLOR[l.score], borderRadius: 6, padding: "1px 7px" }}>{l.score}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, marginTop: 2 }}>{l.cat} · משלם ₪{l.bill} · {l.st}</div>
              </div>
              <div style={{ textAlign: "end" }}>
                <div className="savepill" style={{ fontSize: 11 }}>₪{l.save}/ש'</div>
              </div>
            </div>
          ))}
        </div>
        <div className="disclaimer" style={{ marginTop: 16 }}>תצוגת דמו לצד הנציג — ניקוד ליד אוטומטי לפי פוטנציאל החיסכון.</div>
      </div>
    </div>
  );
}

Object.assign(window, { Chat, Porting, Agent });