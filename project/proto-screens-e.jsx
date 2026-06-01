/* proto-screens-e.jsx — Compare + Community Thread + Onboarding */

function Compare({ app }) {
  const ids = app.compare || [];
  const plans = ids.map(id => PLANS.find(p => p.id === id)).filter(Boolean);
  if (plans.length < 2) {
    return (
      <div className="view-scroll">
        <AppHeader title="השוואת מסלולים" onBack={() => app.go("results")} />
        <div className="pad" style={{ paddingTop: 60, textAlign: "center" }}>
          <div style={{ width: 70, height: 70, borderRadius: 22, background: "var(--paper-2)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}><Icon n="compare" s={32} /></div>
          <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 19, marginTop: 18 }}>בחרו 2–3 מסלולים</div>
          <div style={{ fontSize: 14, color: "var(--ink-3)", fontWeight: 600, marginTop: 8, maxWidth: 250, margin: "8px auto 0", lineHeight: 1.5 }}>סמנו מסלולים במסך ההשוואה (אייקון ה־+ בכרטיס) כדי לראות אותם זה מול זה.</div>
          <button className="btn" style={{ marginTop: 26 }} onClick={() => app.go("results")}>חזרה להשוואה</button>
        </div>
      </div>
    );
  }
  const cat = CATS.find(c => c.id === plans[0].cat);
  const current = (app.data.bills && app.data.bills[cat.id]) || cat.current;
  const rows = [
    ["מחיר היכרות", p => <span style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 17, color: "var(--green)" }}>{planPrice(p)}</span>],
    ["אחרי תקופה", p => planAfter(p) ? <span style={{ fontWeight: 800, color: "var(--danger)", fontSize: 14 }}>{planAfter(p)}</span> : <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 12.5 }}>קבוע</span>],
    ["התחייבות", p => <span style={{ fontWeight: 700, fontSize: 12.5 }}>{p.term || "ללא"}</span>],
    ["חיסכון/שנה", p => { const s = planSaveYear(p, current); return s > 0 ? <span className="savepill" style={{ fontSize: 11.5 }}>₪{s}</span> : <span className="muted" style={{ fontSize: 12 }}>—</span>; }],
    ["דירוג", p => <span style={{ display: "inline-flex", gap: 3, alignItems: "center", fontWeight: 700, fontSize: 12.5 }}><Icon n="star" s={12} fill="var(--lime-d)" w={0} style={{ color: "var(--lime-d)" }} />{p.rating.toFixed(1)}</span>],
    ["עיקר", p => <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", lineHeight: 1.35 }}>{p.feats[0].label}</span>],
  ];
  return (
    <div className="view-scroll">
      <AppHeader title={"השוואה · " + cat.label} sub={plans.length + " מסלולים"} onBack={() => app.go("results")} />
      <div style={{ padding: "4px 16px 30px" }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="cmptable">
            <div style={{ minWidth: "100%" }}>
              {/* logo header */}
              <div className="cmp-row" style={{ background: "var(--paper)" }}>
                <div className="cmp-lab"></div>
                {plans.map(p => (
                  <div className="cmp-cell" key={p.id} style={{ gap: 6 }}>
                    <Logo name={p.provider} h={24} />
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-2)", lineHeight: 1.2 }}>{p.plan}</span>
                  </div>
                ))}
              </div>
              {rows.map((r, i) => (
                <div className="cmp-row" key={i}>
                  <div className="cmp-lab">{r[0]}</div>
                  {plans.map(p => <div className="cmp-cell" key={p.id}>{r[1](p)}</div>)}
                </div>
              ))}
              <div className="cmp-row" style={{ borderBottom: "none" }}>
                <div className="cmp-lab"></div>
                {plans.map(p => (
                  <div className="cmp-cell" key={p.id}>
                    <button className="btn sm" style={{ padding: "8px 12px", fontSize: 12.5 }} onClick={() => app.selectPlan(p.id)}>בחירה</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="disclaimer" style={{ marginTop: 16 }}>גוללו לצדדים לראות את כל המסלולים · החיסכון מול ₪{current} שאתם משלמים היום</div>
      </div>
    </div>
  );
}

/* ---------------- THREAD ---------------- */
const THREAD_SEED = {
  default: [
    { id: 1, name: "צוות חוסך", init: "✓", c: "#0E3A26", team: true, time: "לפני 8 דק׳", text: "שאלה מצוינת! נשמח לעזור — אפשר גם לפתוח בקשת ליווי ונציג יחזור אליכם." },
    { id: 2, name: "ליאת ב.", init: "ל", c: "#1E7A4F", time: "לפני 4 דק׳", text: "גם אני התלבטתי בדיוק על זה. בסוף השוויתי כאן באפליקציה וזה היה סופר ברור." },
  ],
};

function Thread({ app }) {
  const m = app.threadMsg;
  const [replies, setReplies] = useState(THREAD_SEED.default);
  const [draft, setDraft] = useState("");
  if (!m) { app.go("community"); return null; }
  const send = () => {
    const t = draft.trim(); if (!t) return;
    setReplies(r => [...r, { id: Date.now(), name: "דני (אני)", init: "א", c: "#15603E", time: "עכשיו", text: t }]);
    setDraft("");
  };
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="שיחה" sub={m.channel} onBack={() => app.go("community")} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: 96 }}>
          <Message m={m} onLike={() => { }} />
          <div className="lbl-sm" style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", margin: "14px 0 4px" }}>{replies.length} תגובות</div>
          {replies.map(r => (
            <div className="reply" key={r.id}>
              <span className="avatar" style={{ width: 32, height: 32, fontSize: 12, background: r.c, color: r.c === "#A9CE32" ? "var(--green-d)" : "#fff" }}>{r.init}</span>
              <div className="bub">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="nm">{r.name}</span>
                  {r.team && <span className="badge-team"><Icon n="shield" s={10} /> צוות</span>}
                  <span style={{ fontSize: 10.5, color: "var(--ink-3)", fontWeight: 600 }}>· {r.time}</span>
                </div>
                <div className="tx">{r.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="composer">
        <input className="input" placeholder="כתבו תגובה…" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
        <button className="send" disabled={!draft.trim()} onClick={send}><Icon n="up" s={22} w={2.4} /></button>
      </div>
    </div>
  );
}

/* ---------------- ONBOARDING ---------------- */
function Onboarding({ app }) {
  const vps = [
    ["compare", "כל החברות במקום אחד", "סלולר, אינטרנט, TV, טריפל וחו״ל"],
    ["trend", "חיסכון אמיתי", "מול מה שאתם משלמים היום"],
    ["shield", "מלווים עד הניתוק", "יד ביד מול הספק הישן"],
  ];
  return (
    <div className="onb">
      <div className="top">
        <div className="mk"><Icon n="bolt" s={26} fill="var(--lime)" style={{ color: "var(--lime)" }} /></div>
        <h1>חוסך<br /><em>השוואת תקשורת חכמה.</em></h1>
        <div className="sub">3 שאלות קצרות ונמצא לכם את המסלול המשתלם ביותר מכל חברות התקשורת בישראל.</div>
        <div>
          {vps.map((v, i) => (
            <div className="vp" key={i}>
              <div className="ic"><Icon n={v[0]} s={21} /></div>
              <div><div className="vt">{v[1]}</div><div className="vd">{v[2]}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div className="bottom">
        <button className="btn lime" onClick={() => app.finishOnb()}>בואו נתחיל <Icon n="arrowL" s={19} /></button>
      </div>
    </div>
  );
}

/* ---------------- AUTH ---------------- */
function Auth({ app }) {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const valid = /\S+@\S+/.test(email) && pw.length >= 4;
  const social = (name) => { app.showToast("מתחבר עם " + name + "…"); setTimeout(() => app.finishAuth(), 500); };
  return (
    <div className="view-scroll">
      <div className="pad" style={{ paddingTop: 30 }}>
        <div style={{ width: 50, height: 50, borderRadius: 15, background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <Icon n="bolt" s={24} fill="var(--lime)" style={{ color: "var(--lime)" }} />
        </div>
        <div style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 26, letterSpacing: "-.02em" }}>{mode === "signup" ? "הצטרפו לחוסך" : "ברוכים השבים"}</div>
        <div style={{ fontSize: 14, color: "var(--ink-3)", fontWeight: 600, marginTop: 6, marginBottom: 24 }}>{mode === "signup" ? "פתחו חשבון בחינם ותתחילו לחסוך" : "התחברו כדי להמשיך"}</div>

        <div className="auth-tab">
          <button className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>הרשמה</button>
          <button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>כניסה</button>
        </div>

        {app.faceid && (
          <button className="sbtn" style={{ borderColor: "var(--green)", background: "rgba(21,96,62,.06)" }} onClick={() => { app.showToast("מזהה פנים…"); setTimeout(() => app.finishAuth(), 600); }}>
            <span className="g" style={{ background: "var(--green)" }}><Icon n="user" s={14} /></span>
            התחברות מהירה עם Face ID
          </button>
        )}

        <button className="sbtn" onClick={() => social("Google")}>
          <span className="g" style={{ background: "#fff", border: "1.5px solid var(--line)", color: "#4285F4" }}>G</span>
          המשך עם Google
        </button>
        <button className="sbtn" onClick={() => social("Facebook")}>
          <span className="g" style={{ background: "#1877F2" }}>f</span>
          המשך עם Facebook
        </button>
        <button className="sbtn" onClick={() => social("Apple")}>
          <span className="g" style={{ background: "#111" }}></span>
          המשך עם Apple
        </button>

        <div className="divider-or">או באמצעות מייל</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <div className="field"><label>אימייל</label>
            <input className="input" type="email" placeholder="name@email.co.il" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label>סיסמה</label>
            <input className="input" type="password" placeholder="לפחות 4 תווים" value={pw} onChange={e => setPw(e.target.value)} /></div>
        </div>

        <button className="btn" style={{ marginTop: 20 }} disabled={!valid} onClick={() => app.finishAuth()}>
          {mode === "signup" ? "יצירת חשבון" : "התחברות"} <Icon n="arrowL" s={19} />
        </button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}>
          {mode === "signup" ? "כבר יש לכם חשבון? " : "אין לכם חשבון עדיין? "}
          <span style={{ color: "var(--green)", fontWeight: 700, cursor: "pointer" }} onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
            {mode === "signup" ? "התחברו" : "הירשמו"}
          </span>
        </div>
        <div className="disclaimer" style={{ marginTop: 18 }}>בהרשמה אתם מאשרים את תנאי השימוש ומדיניות הפרטיות.</div>
      </div>
    </div>
  );
}

Object.assign(window, { Compare, Thread, Onboarding, Auth });