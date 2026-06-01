/* proto-screens-i.jsx — AI advisor (חוסך AI) */

const AI_SUGGEST = ["הכי זול בסלולר", "אני נוסע הרבה לחו״ל", "משפחה עם 4 קווים", "אינטרנט מהיר לבית", "טלוויזיה זולה ללא התחייבות"];

function aiPick(q) {
  let cat = "cellular", reason = "";
  if (/אינטרנט|סיב|נתב|ביתי/.test(q)) cat = "internet";
  else if (/טלוויז|ערוצ|נטפ|סטרימ|tv/i.test(q)) cat = "tv";
  else if (/טריפל|משולב|הכל ביחד/.test(q)) cat = "triple";
  else if (/חו.?ל|נוסע|טיול|esim/i.test(q)) cat = "abroad";
  let pool = plansByCat(cat);
  if (/חו.?ל|נוסע|טיול/i.test(q)) { const a = pool.filter(p => p.flags.includes("abroad")); if (a.length) { pool = a; reason = "כי ציינת שאתה נוסע לחו״ל"; } }
  if (/משפח|קווים|ילדים/.test(q)) { const f = pool.filter(p => p.flags.includes("family")); if (f.length) { pool = f; reason = "כי חיפשת פתרון משפחתי"; } }
  if (/ללא התחייב|גמיש/.test(q)) { const n = pool.filter(p => p.flags.includes("nocommit")); if (n.length) { pool = n; reason = reason || "בלי התחייבות"; } }
  if (/5g|מהיר|נפח|גדול/i.test(q)) { pool = [...pool].sort((a, b) => (b.flags.includes("5g") ? 1 : 0) - (a.flags.includes("5g") ? 1 : 0)); reason = reason || "בדגש על 5G ונפח גדול"; }
  let pick;
  if (/זול|חיסכון|חוסך|תקציב|מוזל/.test(q)) { pick = [...pool].filter(p => p.price != null).sort((a, b) => a.price - b.price)[0]; reason = reason || "כי ביקשת את המשתלם ביותר"; }
  else { pick = [...pool].filter(p => p.price != null).sort((a, b) => planSaveYear(b) - planSaveYear(a))[0] || pool[0]; reason = reason || "לפי החיסכון הגבוה ביותר"; }
  return { pick, reason, cat };
}

function AIAdvisor({ app }) {
  const [msgs, setMsgs] = useState([{ who: "ai", text: "היי, אני חוסך AI 🤖 ספרו לי מה חשוב לכם — תקציב, נפח, חו״ל, משפחה — ואמצא לכם את המסלול המושלם." }]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);

  const ask = (text) => {
    const q = (text || draft).trim(); if (!q || typing) return;
    setMsgs(m => [...m, { who: "me", text: q }]); setDraft(""); setTyping(true);
    setTimeout(() => {
      const r = aiPick(q);
      setTyping(false);
      if (!r.pick) { setMsgs(m => [...m, { who: "ai", text: "לא מצאתי התאמה מדויקת — נסו לנסח אחרת או בחרו תחום." }]); return; }
      setMsgs(m => [...m, { who: "ai", text: "על סמך מה שכתבת, הייתי ממליץ על:", rec: r }]);
    }, 850);
  };

  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <div className="apphead">
          <button className="iconbtn" onClick={() => app.go("home")}><Icon n="fwd" s={20} /></button>
          <div className="ai-avatar"><Icon n="spark" s={20} /></div>
          <div style={{ flex: 1 }}><h2 style={{ fontSize: 17 }}>חוסך AI</h2><div className="sub">יועץ חכם · זמין 24/7</div></div>
        </div>
        <div className="pad" style={{ paddingTop: 10, paddingBottom: 150 }}>
          {msgs.map((m, i) => (
            <div key={i} className={"aimsg " + m.who}>
              {m.who === "ai" && <div className="ai-avatar"><Icon n="spark" s={18} /></div>}
              <div style={{ maxWidth: "84%" }}>
                <div className="aibub">{m.text}</div>
                {m.rec && (
                  <div className="ai-rec" onClick={() => { app.selectPlan(m.rec.pick.id); }}>
                    <div className="ai-hd"><Icon n="spark" s={13} /> ההמלצה של ה-AI</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Logo name={m.rec.pick.provider} h={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.rec.pick.plan}</div>
                        <div style={{ fontSize: 11.5, color: "var(--green)", fontWeight: 700 }}>{planPrice(m.rec.pick)}/חודש · {m.rec.reason}</div>
                      </div>
                      <Icon n="arrowL" s={18} style={{ color: "var(--green)" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {typing && <div className="aimsg ai"><div className="ai-avatar"><Icon n="spark" s={18} /></div><div className="aibub" style={{ padding: 0 }}><div className="typing"><i></i><i></i><i></i></div></div></div>}
          {msgs.length <= 1 && (
            <div className="aichips" style={{ marginTop: 6 }}>
              {AI_SUGGEST.map(s => <span key={s} className="aichip" onClick={() => ask(s)}><span className="sp">✦</span> {s}</span>)}
            </div>
          )}
        </div>
      </div>
      <div className="composer">
        <input className="input" placeholder="ספרו ל-AI מה אתם צריכים…" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()} />
        <button className="send" disabled={!draft.trim() || typing} onClick={() => ask()}><Icon n="up" s={22} w={2.4} /></button>
      </div>
    </div>
  );
}

Object.assign(window, { AIAdvisor });
