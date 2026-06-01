/* proto-screens-a.jsx — Home + Quiz */

const CATCOLOR = { cellular: "#2563EB", internet: "#0D9488", tv: "#7C3AED", triple: "#EA580C", abroad: "#DB2777" };

const PROOF = [
  "מאיה מתל אביב חסכה ₪540 לפני 8 דקות",
  "דוד מחיפה עבר לגולן 1500GB הרגע",
  "משפחת לוי חוסכת ₪1,080 בשנה",
  "רונן השלים מעבר — ליווי ניתוק הסתיים ✓",
  "נועה מבאר שבע חסכה ₪720 היום",
];
function SocialProof() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(x => (x + 1) % PROOF.length), 3200); return () => clearInterval(t); }, []);
  return (
    <div className="ticker" style={{ marginBottom: 14 }}>
      <span className="live"></span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }} key={i}>{PROOF[i]}</span>
    </div>
  );
}

function Home({ app }) {
  return (
    <div className="view-scroll">
      <div className="pad stagger">
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 0 16px" }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon n="bolt" s={20} fill="var(--lime)" style={{ color: "var(--lime)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 700 }}>ערב טוב,</div>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 16 }}>דני 👋</div>
          </div>
          <button className="iconbtn" onClick={() => app.go("alerts")} style={{ position: "relative" }}>
            <Icon n="bell" s={20} />
            <span style={{ position: "absolute", top: 9, insetInlineEnd: 10, width: 7, height: 7, borderRadius: 9, background: "var(--danger)", border: "2px solid var(--card)" }}></span>
          </button>
        </div>

        <SocialProof />
        <div className="hero" onClick={() => app.go("quiz")} style={{ cursor: "pointer" }}>
          <div className="lbl">לפי הפרופיל שלך אפשר לחסוך עד</div>
          <div className="big">₪1,240<small> / שנה</small></div>
          <div className="sub">3 שאלות קצרות ונמצא לך את המסלול המשתלם ביותר מכל החברות.</div>
          <button className="btn lime" style={{ marginTop: 16, width: "auto", padding: "13px 22px" }}>
            התחלת השוואה חכמה <Icon n="arrowL" s={19} />
          </button>
        </div>

        {(() => {
          const hot = PLANS.filter(p => p.price != null).map(p => ({ p, s: planSaveYear(p) })).sort((a, b) => b.s - a.s)[0];
          if (!hot) return null;
          const p = hot.p;
          return (
            <div className="hotdeal" onClick={() => app.selectPlan(p.id)}>
              <div className="flame">🔥 מבצע חם</div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 9 }}>
                <Logo name={p.provider} h={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 14, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.plan}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--lime)" }}>חוסך עד ₪{hot.s} בשנה</div>
                </div>
                <div style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 22, color: "#fff" }}>{planPrice(p)}</div>
              </div>
            </div>
          );
        })()}

        <div className="card" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 13, cursor: "pointer", background: "linear-gradient(135deg,#0E3A26,#1E7A4F 70%,#2563EB)", overflow: "hidden", position: "relative" }} onClick={() => app.go("ai")}>
          <div className="ai-avatar lg" style={{ flex: "0 0 auto" }}><Icon n="spark" s={24} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 16, color: "#fff" }}>שאלו את חוסך AI ✦</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.78)", fontWeight: 600, marginTop: 2 }}>יועץ חכם שמוצא לכם את המסלול המושלם</div>
          </div>
          <Icon n="arrowL" s={19} style={{ color: "var(--lime)" }} />
        </div>

        <div className="card tight" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }} onClick={() => app.go("bills")}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--paper-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--green)", flex: "0 0 auto" }}>
            <Icon n="edit" s={21} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ fontSize: 14.5 }}>כמה אתם משלמים היום?</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>הזינו או סרקו חשבונית — נחשב חיסכון מיידי</div>
          </div>
          <Icon n="fwd" s={18} style={{ color: "var(--ink-3)" }} />
        </div>

        <div className="label" style={{ margin: "22px 2px 12px" }}>בחרו תחום להשוואה</div>
        <div className="cats">
          {CATS.map(c => (
            <div key={c.id} className="cat" onClick={() => app.selectCat(c.id)}>
              <Icon n="fwd" s={16} style={{ position: "absolute", top: 17, insetInlineStart: 15, color: "var(--ink-3)" }} />
              <div className="ic" style={{ background: (CATCOLOR[c.id] || "#15603E") + "1f", color: CATCOLOR[c.id] || "#15603E" }}><Icon n={c.icon} s={21} /></div>
              <div className="nm">{c.label}</div>
              <div className="ds">{c.sub}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: CATCOLOR[c.id] || "var(--green)", marginTop: 5 }}>{plansByCat(c.id).length} מסלולים</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 14, background: "var(--green-d)" }} onClick={() => app.go("tracker")}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(201,236,75,.16)", color: "var(--lime)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
            <Icon n="track" s={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14.5, color: "#fff" }}>יש לך מעבר פעיל</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)", fontWeight: 600, marginTop: 2 }}>סלקום · בשלב ליווי הניתוק</div>
          </div>
          <Icon n="fwd" s={18} style={{ color: "var(--lime)" }} />
        </div>

        <div className="label" style={{ margin: "22px 2px 12px" }}>כלים שימושיים</div>
        <div style={{ display: "flex", gap: 9 }}>
          {[["wifi", "בדיקת זמינות", "availability"], ["trend", "כדאיות מעבר", "switchcalc"], ["shield", "מה המצב שלי", "situation"]].map((tl, i) => (
            <div key={i} className="card tight" style={{ flex: 1, textAlign: "center", padding: "13px 6px", cursor: "pointer" }} onClick={() => app.go(tl[2])}>
              <div style={{ width: 34, height: 34, borderRadius: 11, background: "var(--paper-2)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}><Icon n={tl[0]} s={17} /></div>
              <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 11.5 }}>{tl[1]}</div>
            </div>
          ))}
        </div>

        <div className="card tight" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }} onClick={() => app.go("callback")}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--paper-2)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Icon n="phone" s={20} /></div>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ fontSize: 14.5 }}>שנחזור אליכם בטלפון?</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>נציג אנושי יעזור — בלי טפסים</div>
          </div>
          <Icon n="fwd" s={18} style={{ color: "var(--ink-3)" }} />
        </div>

        <div className="card tight" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }} onClick={() => app.go("community")}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--lime)", color: "var(--green-d)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
            <Icon n="users" s={21} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ fontSize: 14.5 }}>קהילת החוסכים</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>38 מחוברים · המלצות, דילים ועזרה בניתוק</div>
          </div>
          <Icon n="fwd" s={18} style={{ color: "var(--ink-3)" }} />
        </div>

        <div className="card tight" style={{ marginTop: 20 }}>
          <div className="lbl-sm" style={{ fontSize: 12, marginBottom: 11, fontWeight: 700, color: "var(--ink-3)" }}>משווים בין כל חברות התקשורת</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["yes", "פרטנר", "סלקום", "HOT", "גולן טלקום", "019 מובייל", "בזק", "FreeTV", "STING+", "הוט מובייל", "Gilat", "אקספון 018"].map(n => (
              <Logo key={n} name={n} h={20} />
            ))}
          </div>
        </div>

        <div className="trust" style={{ margin: "22px 0 6px" }}>
          <div className="avatars"><span></span><span></span><span></span><span></span></div>
          <div className="it"><Icon n="check" s={15} style={{ color: "var(--green)" }} /> 12,400 לקוחות חסכו איתנו</div>
        </div>
        <div className="disclaimer">מחירים מייצגים · מאי 2026 · נתונים מתעדכנים מול הספקים</div>
      </div>
    </div>
  );
}

const QUIZ = [
  { q: "כמה קווים / מסכים בבית?", k: "lines", opts: [["אחד", "מתאים ליחיד"], ["2–3", "זוג או שותפים"], ["4 ומעלה", "משפחה"], ["לא בטוח", "נעזור להחליט"]] },
  { q: "מה הכי חשוב לכם?", k: "priority", opts: [["המחיר הכי נמוך", "חיסכון מקסימלי"], ["נפח גלישה גדול", "5G מהיר"], ["ללא התחייבות", "גמישות מלאה"], ["כולל חו\"ל", "לנוסעים"]] },
];

function Quiz({ app }) {
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState({});
  const [budget, setBudget] = useState(90);
  const total = QUIZ.length + 1;
  const cat = CATS.find(c => c.id === app.cat) || CATS[0];

  const pick = (k, v) => { setAns(a => ({ ...a, [k]: v })); setTimeout(() => next(), 220); };
  const next = () => { if (step < total - 1) setStep(s => s + 1); else finish(); };
  const finish = () => { app.setPrefs({ priority: ans.priority, budget }); app.go("results"); };
  const prev = () => { if (step === 0) app.go("home"); else setStep(s => s - 1); };

  return (
    <div className="view-scroll">
      <AppHeader title="התאמה אישית" sub={cat.label} onBack={prev} />
      <div className="pad" style={{ paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div className="progress" style={{ flex: 1 }}><span style={{ width: ((step + 1) / total * 100) + "%" }}></span></div>
          <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13, color: "var(--ink-3)" }}>{step + 1}/{total}</span>
        </div>

        {step < QUIZ.length ? (
          <div className="anim-fade" key={step}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 25, letterSpacing: "-.02em", lineHeight: 1.15, marginBottom: 20 }}>{QUIZ[step].q}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {QUIZ[step].opts.map((o, i) => {
                const on = ans[QUIZ[step].k] === o[0];
                return (
                  <div key={i} className={"opt" + (on ? " on" : "")} onClick={() => pick(QUIZ[step].k, o[0])}>
                    <span className="rd">{on && <Icon n="check" s={15} style={{ color: "#fff" }} />}</span>
                    <div style={{ flex: 1 }}><div className="ttl">{o[0]}</div><div className="ds">{o[1]}</div></div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="anim-fade">
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 25, letterSpacing: "-.02em", lineHeight: 1.15, marginBottom: 8 }}>מה התקציב החודשי?</div>
            <div style={{ fontSize: 13.5, color: "var(--ink-3)", fontWeight: 600, marginBottom: 26 }}>נסנן מסלולים שמתאימים לכיס שלך</div>
            <div className="card" style={{ textAlign: "center", padding: 22 }}>
              <div className="price" style={{ fontSize: 44, color: "var(--green)" }}>₪{budget}<small style={{ fontSize: 16 }}> / חודש</small></div>
              <input className="range" type="range" min="20" max="250" step="5" value={budget} onChange={e => setBudget(+e.target.value)} style={{ marginTop: 20 }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, marginTop: 8 }}><span>₪20</span><span>₪250</span></div>
            </div>
            <button className="btn" style={{ marginTop: 26 }} onClick={finish}>
              מצאו לי מסלול <Icon n="spark" s={19} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Home, Quiz });
