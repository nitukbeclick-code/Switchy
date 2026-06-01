/* proto-screens-c.jsx — Lead + Success + Tracker + Account + Alerts */

const PROVIDERS = ["פלאפון", "סלקום", "פרטנר", "הוט", "yes", "בזק", "אחר"];

function Lead({ app }) {
  const p = PLANS.find(x => x.id === app.planId) || PLANS[0];
  const [name, setName] = useState(app.data.name || "");
  const [phone, setPhone] = useState(app.data.phone || "");
  const [cur, setCur] = useState(app.data.cur || "");
  const valid = name.trim().length > 1 && phone.replace(/\D/g, "").length >= 9;

  const submit = () => { app.set({ name, phone, cur }); app.go("success"); };

  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="כמעט סיימנו" sub="נציג ייקח את זה מכאן" onBack={() => app.go("plan")} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: 130 }}>
          <div className="card line" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, background: "var(--paper)" }}>
            <Logo name={p.provider} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>{p.plan}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>{planPrice(p)}{p.price != null && " / חודש"}</div>
            </div>
            <Icon n="check" s={20} style={{ color: "var(--green)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="field"><label>שם מלא</label>
              <input className="input" placeholder="ישראל ישראלי" value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="field"><label>טלפון</label>
              <input className="input" type="tel" placeholder="050-0000000" value={phone} onChange={e => setPhone(e.target.value)} /></div>
            <div className="field"><label>הספק הנוכחי שלך</label>
              <div className="seg">
                {PROVIDERS.map(pr => <span key={pr} className={"chip" + (cur === pr ? " on" : "")} onClick={() => setCur(pr)}>{pr}</span>)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 18, fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, lineHeight: 1.5 }}>
            <Icon n="shield" s={16} style={{ flex: "0 0 auto", marginTop: 1 }} />
            הפרטים מועברים לנציג אנושי בלבד לצורך השלמת המעבר וליווי הניתוק. ללא שיתוף עם צד ג׳.
          </div>
        </div>
      </div>
      <div className="stickybar">
        <button className="btn" disabled={!valid} onClick={submit}>שליחה וקבלת שיחה</button>
      </div>
    </div>
  );
}

function Success({ app }) {
  const p = PLANS.find(x => x.id === app.planId) || PLANS[0];
  const save = planSaveYear(p);
  return (
    <div className="view-scroll">
      <div className="pad" style={{ paddingTop: 40, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 92, height: 92, borderRadius: 30, background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop .5s cubic-bezier(.22,.9,.3,1.2)" }}>
          <Icon n="check" s={48} w={2.4} style={{ color: "var(--lime)" }} />
        </div>
        <div style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 27, letterSpacing: "-.02em", marginTop: 24 }}>קיבלנו, {app.data.name ? app.data.name.split(" ")[0] : "תודה"}!</div>
        <div style={{ fontSize: 15, color: "var(--ink-2)", fontWeight: 600, marginTop: 8, maxWidth: 280, lineHeight: 1.5 }}>
          נציג אישי יחזור אליך תוך <b style={{ color: "var(--ink)" }}>24 שעות</b> כדי להשלים את המעבר וללוות אותך עד הניתוק מהספק הישן.
        </div>

        <div className="card" style={{ marginTop: 28, width: "100%", textAlign: "start" }}>
          <div className="kicker" style={{ marginBottom: 12 }}>סיכום הבקשה</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>מסלול חדש</span>
            <span style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>{p.provider} · {planPrice(p)}{p.price != null && "/ח'"}</span>
          </div>
          <div className="hr"></div>
          {save > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>חיסכון שנתי צפוי</span>
            <span className="savepill"><Icon n="trend" s={13} /> ₪{save}</span>
          </div>}
        </div>

        <button className="btn" style={{ marginTop: 26 }} onClick={() => app.go("tracker")}>מעקב אחר התהליך <Icon n="track" s={19} /></button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => app.go("home")}>חזרה לבית</button>
      </div>
    </div>
  );
}

const TRACK = [
  ["done", "check", "הצטרפת לספק החדש", "הבקשה נקלטה · היום"],
  ["done", "check", "אישור קליטה התקבל", "המספר נויד בהצלחה"],
  ["now", "shield", "ליווי ניתוק מהספק הישן", "הנציגה שלך, דנה, עובדת על זה כעת"],
  ["next", "clock", "הניתוק הושלם — סיימנו!", "נוודא שלא חויבת פעמיים"],
];

function Tracker({ app }) {
  return (
    <div className="view-scroll">
      <AppHeader title="המעבר שלי" sub="סלקום · 1500GB 5G" />
      <div className="pad" style={{ paddingTop: 4 }}>
        <div className="reassure" style={{ marginBottom: 24 }}>
          <div className="ic"><Icon n="shield" s={19} /></div>
          <div style={{ flex: 1 }}>
            <div className="t">אנחנו מלווים — לא מנתקים</div>
            <div className="d">אנחנו לצידך יד ביד מול הספק הישן עד הניתוק המלא. שומרים על המספר שלך (ניוד) — לא מוחקים אותו.</div>
          </div>
        </div>

        <div className="tl">
          {TRACK.map((n, i) => (
            <div key={i} className={"node " + n[0]}>
              {i < TRACK.length - 1 && <span className="line"></span>}
              <span className={"dot " + n[0]}><Icon n={n[1]} s={16} w={2.2} /></span>
              <div className="body" style={{ paddingTop: 3 }}>
                <div className="t" style={{ color: n[0] === "next" ? "var(--ink-3)" : "var(--ink)" }}>{n[2]}</div>
                <div className="d">{n[3]}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 50, background: "var(--green-2)", flex: "0 0 auto" }}></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14.5 }}>דנה · הנציגה שלך</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>זמינה · זמן תגובה ~5 דק'</div>
          </div>
          <button className="btn sm" onClick={() => app.go("chat")}><Icon n="chat" s={17} /> צ'אט</button>
        </div>
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => app.go("porting")}><Icon n="phone" s={18} /> בקשת ניוד מספר</button>
        <div className="card" style={{ marginTop: 12, display: "flex", gap: 11, alignItems: "center", borderColor: "var(--green)", border: "1.5px solid var(--green)" }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(21,96,62,.1)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Icon n="shield" s={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13.5 }}>ערבות שקט</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>חויבת פעמיים בטעות? אנחנו מטפלים. מובטח.</div>
          </div>
        </div>
        <div className="disclaimer" style={{ marginTop: 18 }}>אנחנו מסייעים מול הספק — איננו מנתקים עבורך.</div>
      </div>
    </div>
  );
}

function Account({ app }) {
  const reqs = [
    ["סלקום · 1500GB 5G", "בליווי ניתוק", "now"],
    ["בזק · סיבים 600Mb", "הושלם", "done"],
  ];
  const alerts = [
    ["trend", "ירידת מחיר", "מסלול דומה לשלך ירד ל-₪49", true],
    ["bell", "עדכון בקשה", "דנה עדכנה את תהליך הניתוק", false],
  ];
  return (
    <div className="view-scroll">
      <AppHeader title="אזור אישי" sub="שלום, דני"
        right={<div style={{ display: "flex", gap: 8 }}><button className="iconbtn" onClick={() => app.go("alerts")}><Icon n="bell" s={20} /></button><button className="iconbtn" onClick={() => app.go("profile")}><Icon n="user" s={20} /></button></div>} />
      <div className="pad" style={{ paddingTop: 4 }}>
        <div className="hero">
          <div className="lbl">סך הכל חסכת איתנו</div>
          <div className="big">₪1,080<small> / שנה</small></div>
          <div className="sub">על פני 2 מעברים שביצעת דרכנו</div>
        </div>

        <div style={{ display: "flex", gap: 11, marginTop: 14 }}>
          <div className="card tight" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, cursor: "pointer" }} onClick={() => app.go("bills")}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--paper-2)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="edit" s={18} /></div>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 13 }}>החשבוניות שלי</div>
          </div>
          <div className="card tight" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, cursor: "pointer" }} onClick={() => app.go("ratings")}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--paper-2)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="star" s={18} /></div>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 13 }}>דירוג ספקים</div>
          </div>
        </div>

        <div className="label" style={{ margin: "22px 2px 12px" }}>הבקשות שלי</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {reqs.map((r, i) => (
            <div key={i} className="card tight" style={{ display: "flex", alignItems: "center", gap: 12 }} onClick={() => r[2] === "now" && app.go("tracker")}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: r[2] === "now" ? "var(--green-d)" : "var(--paper-2)", color: r[2] === "now" ? "var(--lime)" : "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                <Icon n={r[2] === "now" ? "track" : "check"} s={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>{r[0]}</div>
                <div style={{ fontSize: 12, color: r[2] === "now" ? "var(--green)" : "var(--ink-3)", fontWeight: 700 }}>{r[1]}</div>
              </div>
              {r[2] === "now" && <Icon n="fwd" s={17} style={{ color: "var(--ink-3)" }} />}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 11, marginTop: 16 }}>
          <button className="btn ghost sm block" onClick={() => app.go("home")}><Icon n="plus" s={18} /> השוואה חדשה</button>
          <button className="btn sm block" onClick={() => app.go("chat")}><Icon n="chat" s={18} /> צ'אט תמיכה</button>
        </div>

        <div className="card" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, background: "var(--green-d)", cursor: "pointer" }} onClick={() => app.showToast("סרקנו — מצאנו לך מסלול זול ב-₪22 בחודש!")}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(201,236,75,.16)", color: "var(--lime)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Icon n="trend" s={21} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 14, color: "#fff" }}>סריקה אוטומטית של השוק</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontWeight: 600, marginTop: 2 }}>בדקו אם יש עכשיו מסלול זול יותר</div>
          </div>
          <Icon n="fwd" s={18} style={{ color: "var(--lime)" }} />
        </div>

        <div className="label" style={{ margin: "24px 2px 6px" }}>עדכונים אחרונים</div>
        <div>
          {alerts.map((a, i) => (
            <div key={i} className="alert" style={i === alerts.length - 1 ? { borderBottom: "none" } : null}>
              <div className={"ic" + (a[3] ? " lime" : "")}><Icon n={a[0]} s={19} /></div>
              <div style={{ flex: 1 }}><div className="t">{a[1]}</div><div className="d">{a[2]}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Alerts({ app }) {
  const feed = [
    ["clock", "תזכורת חוזה", "מחיר ההיכרות שלך עולה בעוד 21 ימים — שווה להשוות שוב", "מחר", true],
    ["trend", "ירידת מחיר", "מסלול 5G דומה לשלך ירד ל-₪49 בסלקום", "לפני 2ש'", true],
    ["bell", "עדכון בקשה", "דנה עדכנה: בקשת הניתוק הוגשה לספק הישן", "היום", false],
    ["gift", "מבצע חדש", "פרטנר Fiber: 1000Mb במחיר של 600Mb", "אתמול", true],
    ["check", "הושלם", "הניתוק מהספק הישן אושר סופית", "השבוע", false],
  ];
  return (
    <div className="view-scroll">
      <AppHeader title="התראות ועדכונים" onBack={() => app.go("account")} />
      <div className="pad" style={{ paddingTop: 4 }}>
        <div className="chiprow" style={{ marginBottom: 12 }}>
          <span className="chip on">הכל</span><span className="chip">מחירים</span><span className="chip">בקשות</span><span className="chip">מבצעים</span>
        </div>
        <div className="stagger">
          {feed.map((a, i) => (
            <div key={i} className="alert">
              <div className={"ic" + (a[4] ? " lime" : "")}><Icon n={a[0]} s={19} /></div>
              <div style={{ flex: 1 }}><div className="t">{a[1]}</div><div className="d">{a[2]}</div></div>
              <span className="tm">{a[3]}</span>
            </div>
          ))}
        </div>
        <div className="reassure" style={{ marginTop: 20, background: "var(--card)", color: "var(--ink)", boxShadow: "var(--shadow-card)" }}>
          <div className="ic" style={{ background: "var(--paper-2)", color: "var(--green)" }}><Icon n="bell" s={19} /></div>
          <div style={{ flex: 1 }}>
            <div className="t">התראות ירידת מחיר</div>
            <div className="d" style={{ color: "var(--ink-3)" }}>ננטר עבורך את השוק ונודיע כשמופיע מסלול זול יותר.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Lead, Success, Tracker, Account, Alerts });
