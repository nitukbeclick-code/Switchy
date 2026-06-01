/* proto-screens-h.jsx — Availability checker + Switch calculator + Situation quiz */

function Availability({ app }) {
  const [addr, setAddr] = useState({ city: "", street: "" });
  const [done, setDone] = useState(false);
  const ready = addr.city.trim().length > 1 && addr.street.trim().length > 1;
  // deterministic mock result from address length
  const seed = (addr.city + addr.street).length;
  const rows = [
    ["בזק", "סיבים אופטיים", true],
    ["פרטנר Fiber", "תשתית עצמאית", seed % 2 === 0],
    ["סלקום Fiber", "סיבים", seed % 3 !== 0],
    ["HOT", "כבלים / סיבים", true],
    ["IBC / Triple C", "סיבים", seed % 2 === 1],
  ];
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="בדיקת זמינות בכתובת" sub="מה זמין אצלך בבית" onBack={() => app.go("home")} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: done ? 120 : 30 }}>
          <div className="reassure" style={{ marginBottom: 20 }}>
            <div className="ic"><Icon n="wifi" s={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="t">סיבים לא נמצאים בכל מקום</div>
              <div className="d">הזינו כתובת ונראה אילו תשתיות וספקים זמינים אצלכם.</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div className="field"><label>עיר / יישוב</label><input className="input" placeholder="תל אביב" value={addr.city} onChange={e => { setAddr(a => ({ ...a, city: e.target.value })); setDone(false); }} /></div>
            <div className="field"><label>רחוב ומספר</label><input className="input" placeholder="הרצל 10" value={addr.street} onChange={e => { setAddr(a => ({ ...a, street: e.target.value })); setDone(false); }} /></div>
          </div>
          {!done && <button className="btn" style={{ marginTop: 18 }} disabled={!ready} onClick={() => setDone(true)}><Icon n="search" s={18} /> בדיקת זמינות</button>}

          {done && (
            <div className="anim-fade">
              <div className="label" style={{ margin: "22px 2px 12px" }}>זמין ב{addr.street}, {addr.city}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.map((r, i) => (
                  <div className="card tight" key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Logo name={r[0]} h={24} />
                    <div style={{ flex: 1 }}><div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 13 }}>{r[0]}</div><div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600 }}>{r[1]}</div></div>
                    {r[2]
                      ? <span style={{ display: "inline-flex", gap: 5, alignItems: "center", color: "var(--green)", fontWeight: 800, fontSize: 12.5 }}><Icon n="check" s={15} /> זמין</span>
                      : <span style={{ color: "var(--ink-3)", fontWeight: 700, fontSize: 12 }}>בקרוב</span>}
                  </div>
                ))}
              </div>
              <div className="card tight" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, background: "rgba(21,96,62,.06)" }}>
                <Icon n="phone" s={18} style={{ color: "var(--green)" }} /><span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)" }}>סלולר 5G — כל הרשתות זמינות באזורך</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {done && <div className="stickybar"><button className="btn" onClick={() => { app.setCat("internet"); app.go("results"); }}>הצגת מסלולים זמינים <Icon n="arrowL" s={19} /></button></div>}
    </div>
  );
}

function SwitchCalc({ app }) {
  const [cur, setCur] = useState(119);
  const [neu, setNeu] = useState(49);
  const [fee, setFee] = useState(0);
  const saveYear = Math.max(0, (cur - neu) * 12);
  const net1 = saveYear - fee;
  const Slider = ({ label, val, set, min, max, step, unit }) => (
    <div className="card tight" style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span className="lbl" style={{ fontSize: 13.5 }}>{label}</span><span style={{ fontFamily: "var(--f-disp)", fontWeight: 800, color: "var(--green)" }}>{unit}{val}</span></div>
      <input className="range" type="range" min={min} max={max} step={step} value={val} onChange={e => set(+e.target.value)} />
    </div>
  );
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="כדאיות מעבר" sub="גם אחרי קנס יציאה" onBack={() => app.go("home")} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: 120 }}>
          <Slider label="כמה אתם משלמים היום" val={cur} set={setCur} min={20} max={400} step={5} unit="₪" />
          <Slider label="מחיר המסלול החדש" val={neu} set={setNeu} min={19} max={300} step={5} unit="₪" />
          <Slider label="קנס יציאה מהספק הישן" val={fee} set={setFee} min={0} max={600} step={10} unit="₪" />

          <div className="hero" style={{ marginTop: 8, textAlign: "center" }}>
            <div className="lbl">חיסכון בשנה הראשונה — גם אחרי הקנס</div>
            <div className="big" style={{ fontSize: 44 }}>₪{net1 > 0 ? net1.toLocaleString() : 0}</div>
            <div className="sub">חיסכון שנתי ₪{saveYear.toLocaleString()} פחות קנס חד-פעמי ₪{fee}</div>
          </div>
          {net1 > 0
            ? <div className="card tight" style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", background: "rgba(21,96,62,.06)" }}><Icon n="check" s={18} style={{ color: "var(--green)" }} /><span style={{ fontSize: 12.5, fontWeight: 700 }}>כדאי לעבור! החיסכון מכסה את הקנס תוך {Math.max(1, Math.round(fee / Math.max(1, (cur - neu))))} חודשים.</span></div>
            : <div className="card tight" style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", background: "rgba(197,83,59,.08)" }}><span style={{ color: "var(--danger)", fontWeight: 800 }}>⚠</span><span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--danger)" }}>בשנה הראשונה הקנס גדול מהחיסכון — אך משנה שנייה תרוויחו ₪{saveYear}/שנה.</span></div>}
          <div className="disclaimer" style={{ marginTop: 14 }}>ניוד שומר על המספר. אין התחייבות או חיוב מצידנו — רק ליווי.</div>
        </div>
      </div>
      <div className="stickybar"><button className="btn" onClick={() => app.go("lead")}>קבלת ליווי למעבר <Icon n="arrowL" s={19} /></button></div>
    </div>
  );
}

function Situation({ app }) {
  const [s, setS] = useState({ commit: false, device: false, multi: false });
  const t = (k) => setS(o => ({ ...o, [k]: !o[k] }));
  const rows = [
    ["commit", "shield", "אני בהתחייבות מול הספק הנוכחי", "נבדוק קנס יציאה ונראה אם עדיין כדאי"],
    ["device", "phone", "אני באמצע תשלומים על מכשיר", "המכשיר נשאר שלך — התשלומים ממשיכים מול הספק הישן"],
    ["multi", "layers", "יש לי כמה קווים / שירותים בחשבון", "ננייד את כולם יחד ונדאג שלא תיפול אף שירות"],
  ];
  const active = rows.filter(r => s[r[0]]);
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="מה המצב שלך?" sub="נתאים לך ליווי" onBack={() => app.go("home")} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: 120 }}>
          <div style={{ fontSize: 14, color: "var(--ink-2)", fontWeight: 600, marginBottom: 16, lineHeight: 1.5 }}>סמנו מה רלוונטי אליכם ונסביר בדיוק מה זה אומר למעבר שלכם.</div>
          {rows.map(r => (
            <div className="setrow" key={r[0]} onClick={() => t(r[0])} style={{ cursor: "pointer" }}>
              <div className="ic"><Icon n={r[1]} s={19} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>{r[2]}</div>
              </div>
              <div className={"sw" + (s[r[0]] ? " on" : "")}></div>
            </div>
          ))}
          {active.length > 0 && (
            <div className="anim-fade">
              <div className="label" style={{ margin: "22px 2px 12px" }}>מה זה אומר עבורך</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {active.map(r => (
                  <div className="card tight" key={r[0]} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                    <Icon n="check" s={18} style={{ color: "var(--green)", flex: "0 0 auto", marginTop: 1 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", lineHeight: 1.5 }}>{r[3]}</span>
                  </div>
                ))}
                {s.commit && <button className="btn ghost sm" onClick={() => app.go("switchcalc")}><Icon n="trend" s={17} /> בדקו כדאיות גם עם קנס יציאה</button>}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="stickybar"><button className="btn" onClick={() => app.go("lead")}>קבלת ליווי אישי <Icon n="arrowL" s={19} /></button></div>
    </div>
  );
}

function TwoFA({ app }) {
  const [code, setCode] = useState("");
  const ok = code.replace(/\D/g, "").length === 6;
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="אימות דו-שלבי (2FA)" sub="Google Authenticator" onBack={() => app.go("profile")} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: 120 }}>
          <div className="reassure" style={{ marginBottom: 20 }}>
            <div className="ic"><Icon n="shield" s={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="t">שכבת אבטחה נוספת</div>
              <div className="d">סרקו את הקוד באפליקציית Google Authenticator והזינו את הקוד בן 6 הספרות.</div>
            </div>
          </div>
          <div className="card" style={{ textAlign: "center", padding: 20 }}>
            <div style={{ width: 150, height: 150, margin: "0 auto", borderRadius: 14, background: "repeating-conic-gradient(var(--ink) 0 6.5%, #fff 0 13%)", border: "6px solid #fff", boxShadow: "0 0 0 1px var(--line)" }}></div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 700, marginTop: 12 }}>סריקת קוד QR ב-Google Authenticator</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, marginTop: 4 }}>או הזינו ידנית: <b style={{ color: "var(--ink)" }}>JBSW Y3DP EHPK 3PXP</b></div>
          </div>
          <div className="field" style={{ marginTop: 18 }}><label>קוד אימות בן 6 ספרות</label>
            <input className="input" type="tel" placeholder="000000" value={code} onChange={e => setCode(e.target.value)} style={{ textAlign: "center", letterSpacing: "6px", fontFamily: "var(--f-disp)", fontSize: 22 }} /></div>
        </div>
      </div>
      <div className="stickybar"><button className="btn" disabled={!ok} onClick={() => { app.setTwofa(true); app.showToast("אימות דו-שלבי הופעל ✓"); app.go("profile"); }}>הפעלת 2FA</button></div>
    </div>
  );
}

function Callback({ app }) {
  const [f, setF] = useState({ name: "", phone: "", when: "בהקדם" });
  const valid = f.name.trim().length > 1 && f.phone.replace(/\D/g, "").length >= 9;
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="שנחזור אליכם?" sub="בלי טפסים ארוכים" onBack={() => app.go("home")} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: 120 }}>
          <div className="reassure" style={{ marginBottom: 20 }}>
            <div className="ic"><Icon n="phone" s={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="t">נציג אנושי יחזור אליכם</div>
              <div className="d">השאירו טלפון ונתקשר — נעזור להשוות ולעבור, בלי שתצטרכו לעשות דבר.</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="field"><label>שם</label><input className="input" placeholder="ישראל" value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} /></div>
            <div className="field"><label>טלפון</label><input className="input" type="tel" placeholder="050-0000000" value={f.phone} onChange={e => setF(s => ({ ...s, phone: e.target.value }))} /></div>
            <div className="field"><label>מתי נוח לכם?</label>
              <div className="seg">{["בהקדם", "בבוקר", "אחה״צ", "בערב"].map(w => <span key={w} className={"chip" + (f.when === w ? " on" : "")} onClick={() => setF(s => ({ ...s, when: w }))}>{w}</span>)}</div>
            </div>
          </div>
          <div className="disclaimer" style={{ marginTop: 16 }}>ללא התחייבות וללא עלות — רק שיחת ייעוץ.</div>
        </div>
      </div>
      <div className="stickybar"><button className="btn" disabled={!valid} onClick={() => { app.showToast("תודה! נחזור אליכם " + f.when); app.go("home"); }}>שנתקשר אליי</button></div>
    </div>
  );
}

Object.assign(window, { Availability, SwitchCalc, Situation, TwoFA, Callback });