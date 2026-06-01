/* proto-screens-f.jsx — Bills/Invoices + Provider Ratings + Profile/Settings */

function Bills({ app }) {
  const [scanned, setScanned] = useState(false);
  const cats = CATS.filter(c => c.current > 0);
  const bills = app.data.bills || {};
  const billOf = (c) => (bills[c.id] != null ? bills[c.id] : c.current);
  const total = cats.reduce((s, c) => s + billOf(c), 0);
  const overpay = Math.round(total * 0.32 / 10) * 10;
  const setBill = (id, v) => app.set({ bills: { ...(app.data.bills || {}), [id]: Math.max(0, v) } });
  const scan = () => { app.set({ bills: { ...(app.data.bills || {}), cellular: 124, internet: 139 } }); setScanned(true); app.showToast("זיהינו חשבונית — עודכן אוטומטית"); };

  return (
    <div className="view-scroll">
      <AppHeader title="החשבוניות שלי" sub="כמה אתם משלמים היום" onBack={() => app.go("account")} />
      <div className="pad" style={{ paddingTop: 4 }}>
        <div className="hero">
          <div className="lbl">סך הוצאה חודשית על תקשורת</div>
          <div className="big">₪{total}<small> / חודש</small></div>
          <div className="sub">≈ ₪{total * 12} בשנה · עדכנו כדי לחשב חיסכון מדויק</div>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span className="label" style={{ fontSize: 14 }}>מגמת הוצאה</span>
            <span style={{ fontSize: 11.5, color: "var(--green)", fontWeight: 700 }}>↓ מאז שעברת דרכנו</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 90 }}>
            {[["ינו", 649], ["פבר", 649], ["מרץ", 649], ["אפר", 560], ["מאי", 480], ["יוני", total]].map((b, i, a) => {
              const max = 660; const h = Math.max(8, (b[1] / max) * 78); const last = i === a.length - 1;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: last ? "var(--green)" : "var(--ink-3)" }}>{b[1]}</span>
                  <div style={{ width: "100%", height: h, borderRadius: "6px 6px 3px 3px", background: last ? "linear-gradient(var(--lime),var(--green))" : "var(--bar)" }}></div>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--ink-3)" }}>{b[0]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {scanned && (
          <div className="smartrec" style={{ margin: "16px 0 0" }} onClick={() => app.go("results")}>
            <div className="hd">⚠ זיהינו בזבוז</div>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 9 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 14 }}>אתם משלמים בערך ₪{overpay} מעל הממוצע</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--green)" }}>≈ ₪{overpay * 12} בשנה — בואו נחסוך</div>
              </div>
              <Icon n="arrowL" s={18} style={{ color: "var(--green)" }} />
            </div>
          </div>
        )}

        <div className="dropzone" style={{ marginTop: 16 }} onClick={scan}>
          <div className="ic"><Icon n="edit" s={24} /></div>
          <div className="label" style={{ fontSize: 15 }}>צילום / העלאת חשבונית</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 600, marginTop: 4 }}>נזהה אוטומטית כמה אתם משלמים בכל תחום</div>
        </div>

        <div className="label" style={{ margin: "22px 2px 12px" }}>לפי תחום</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {cats.map(c => (
            <div className="card tight" key={c.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--paper-2)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Icon n={c.icon} s={20} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>{c.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--green)", fontWeight: 700, cursor: "pointer" }} onClick={() => { app.setCat(c.id); app.go("results"); }}>השוואת מסלולים ←</div>
              </div>
              <div className="stepper">
                <button onClick={() => setBill(c.id, billOf(c) - 10)}><Icon n="minus" s={15} w={2.6} /></button>
                <span className="v">₪{billOf(c)}</span>
                <button onClick={() => setBill(c.id, billOf(c) + 10)}><Icon n="plus" s={15} w={2.6} /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="disclaimer" style={{ marginTop: 16 }}>הסכומים נשמרים ומשמשים לחישוב החיסכון בכל מסך השוואה.</div>
      </div>
    </div>
  );
}

const REVIEW_SNIP = {
  "גולן טלקום": "שירות תיקונים מעולה ומחיר הוגן.",
  "019 מובייל": "מחיר קבוע לכל החיים — בלי הפתעות.",
  "סלקום": "רשת מהירה וקליטה מצוינת בכל הארץ.",
  "פרטנר": "נטפליקס מובנה זה שינוי משחק.",
  "FreeTV": "כל הערוצים באפליקציה, פשוט וזול.",
  "פלאפון": "הרשת הכי יציבה שהיתה לי.",
  "STING+": "תוכן של yes בלי ההתחייבות.",
  "הוט מובייל": "חבילה גדולה במחיר נמוך.",
};

function Ratings({ app }) {
  const baseBrand = (n) => n.startsWith("סלקום") ? "סלקום" : n.startsWith("פרטנר") ? "פרטנר" : n.startsWith("STING") ? "STING+" : n.startsWith("yes") ? "yes" : n.startsWith("HOT") ? "HOT" : n;
  const [open, setOpen] = useState(false);
  const [rv, setRv] = useState({ provider: "", stars: 0, text: "" });
  const submit = () => { setOpen(false); setRv({ provider: "", stars: 0, text: "" }); app.showToast("תודה! הביקורת נשלחה לאישור"); };
  const map = {};
  PLANS.forEach(p => {
    const b = baseBrand(p.provider);
    if (!map[b]) map[b] = { sum: 0, n: 0, rev: 0, cat: p.cat };
    map[b].sum += p.rating; map[b].n++; map[b].rev += p.reviews;
  });
  const list = Object.entries(map).map(([provider, v]) => ({ provider, avg: v.sum / v.n, reviews: v.rev, cat: v.cat }))
    .sort((a, b) => b.avg - a.avg);

  return (
    <div className="view-scroll">
      <AppHeader title="דירוג ספקים" sub="לפי הקהילה" onBack={() => app.go("community")} />
      <div className="pad" style={{ paddingTop: 4 }}>
        <div className="reassure" style={{ marginBottom: 14 }}>
          <div className="ic"><Icon n="star" s={18} /></div>
          <div style={{ flex: 1 }}>
            <div className="t">דירוג אמיתי מחברי הקהילה</div>
            <div className="d">ממוצע ביקורות על פני כל המסלולים של כל ספק.</div>
          </div>
        </div>

        {!open && <button className="btn ghost" style={{ marginBottom: 18 }} onClick={() => setOpen(true)}><Icon n="edit" s={18} /> כתבו ביקורת על ספק</button>}
        {open && (
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="label" style={{ fontSize: 15, marginBottom: 12 }}>הביקורת שלך</div>
            <div className="seg" style={{ marginBottom: 12 }}>
              {["סלקום", "פרטנר", "פלאפון", "גולן טלקום", "019 מובייל", "HOT", "yes", "FreeTV"].map(pr => (
                <span key={pr} className={"chip" + (rv.provider === pr ? " on" : "")} onClick={() => setRv(s => ({ ...s, provider: pr }))}>{pr}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} onClick={() => setRv(s => ({ ...s, stars: n }))} style={{ cursor: "pointer", color: n <= rv.stars ? "var(--lime-d)" : "var(--line-2)" }}>
                  <Icon n="star" s={28} fill={n <= rv.stars ? "var(--lime-d)" : "none"} w={1.6} />
                </span>
              ))}
            </div>
            <textarea className="input" rows="3" placeholder="ספרו על השירות, המהירות, התמיכה…" value={rv.text} onChange={e => setRv(s => ({ ...s, text: e.target.value }))} style={{ resize: "none", fontFamily: "var(--f-body)" }}></textarea>
            <div style={{ display: "flex", gap: 9, marginTop: 12 }}>
              <button className="btn ghost sm block" onClick={() => setOpen(false)}>ביטול</button>
              <button className="btn sm block" disabled={!rv.provider || !rv.stars} onClick={submit}>שליחת ביקורת</button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {list.map((r, i) => (
            <div className="card tight" key={r.provider} style={{ display: "flex", alignItems: "center", gap: 12 }} onClick={() => { app.setCat(r.cat); app.go("results"); }}>
              <span style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 15, color: "var(--ink-3)", width: 20, flex: "0 0 auto" }}>{i + 1}</span>
              <Logo name={r.provider} h={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Stars r={r.avg} />
                  <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13 }}>{r.avg.toFixed(1)}</span>
                  {i === 0 && <span className="badge-team">★ מוביל</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {REVIEW_SNIP[r.provider] || (r.reviews.toLocaleString() + " ביקורות")}
                </div>
              </div>
              <Icon n="fwd" s={17} style={{ color: "var(--ink-3)", flex: "0 0 auto" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Profile({ app }) {
  const [set, setSet] = useState({ price: true, request: true, news: false, community: true });
  const toggle = (k) => setSet(s => ({ ...s, [k]: !s[k] }));
  const rows = [
    ["price", "trend", "התראות ירידת מחיר", "כשמסלול זול יותר מופיע"],
    ["request", "bell", "עדכוני בקשה", "סטטוס המעבר והניתוק"],
    ["community", "users", "פעילות בקהילה", "תגובות ולייקים"],
    ["news", "gift", "מבצעים וניוזלטר", "הטבות בלעדיות"],
  ];
  return (
    <div className="view-scroll">
      <AppHeader title="פרופיל והגדרות" onBack={() => app.go("account")} />
      <div className="pad" style={{ paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="avatar" style={{ width: 60, height: 60, fontSize: 24, background: "var(--green)" }}>ד</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 19 }}>דני כהן</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}>dani@email.co.il</div>
          </div>
          <button className="iconbtn"><Icon n="edit" s={19} /></button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          {[["₪1,080", "חסכת"], ["2", "מעברים"], ["14", "בקהילה"]].map((s, i) => (
            <div className="card tight" key={i} style={{ flex: 1, textAlign: "center", padding: "13px 6px" }}>
              <div style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 18, color: "var(--green)" }}>{s[0]}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 700, marginTop: 2 }}>{s[1]}</div>
            </div>
          ))}
        </div>

        <div className="label" style={{ margin: "24px 2px 4px" }}>התראות</div>
        <div>
          {rows.map(r => (
            <div className="setrow" key={r[0]}>
              <div className="ic"><Icon n={r[1]} s={19} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>{r[2]}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>{r[3]}</div>
              </div>
              <div className={"sw" + (set[r[0]] ? " on" : "")} onClick={() => toggle(r[0])}></div>
            </div>
          ))}
        </div>

        <div className="label" style={{ margin: "24px 2px 4px" }}>תצוגה</div>
        <div className="setrow" style={{ borderBottom: "none" }}>
          <div className="ic"><Icon n="bolt" s={19} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>מצב כהה</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>ערכת צבעים כהה לעיניים</div>
          </div>
          <div className={"sw" + (app.dark ? " on" : "")} onClick={() => app.toggleDark()}></div>
        </div>
        <div style={{ padding: "14px 0 2px" }}>
          <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14, marginBottom: 10 }}>שפה</div>
          <div className="seg">
            {["עברית", "English", "العربية", "Русский"].map(l => (
              <span key={l} className={"chip" + (app.lang === l ? " on" : "")} onClick={() => { app.setLang(l); app.showToast("השפה: " + l); }}>{l}</span>
            ))}
          </div>
        </div>

        <div className="label" style={{ margin: "24px 2px 4px" }}>אבטחה</div>
        <div className="setrow">
          <div className="ic"><Icon n="user" s={19} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>כניסה עם Face ID</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>התחברות מהירה ומאובטחת</div>
          </div>
          <div className={"sw" + (app.faceid ? " on" : "")} onClick={() => { app.toggleFace(); app.showToast(app.faceid ? "Face ID בוטל" : "Face ID הופעל ✓"); }}></div>
        </div>
        <div className="setrow" style={{ borderBottom: "none", cursor: "pointer" }} onClick={() => app.go("twofa")}>
          <div className="ic"><Icon n="shield" s={19} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>אימות דו-שלבי (2FA)</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>{app.twofa ? "מופעל · Google Authenticator" : "Google Authenticator"}</div>
          </div>
          {app.twofa ? <span style={{ color: "var(--green)", fontWeight: 800, fontSize: 12.5 }}>מופעל ✓</span> : <Icon n="fwd" s={17} style={{ color: "var(--ink-3)" }} />}
        </div>

        <div className="setrow" style={{ borderBottom: "none", marginTop: 6, cursor: "pointer" }} onClick={() => app.go("agent")}>
          <div className="ic"><Icon n="compare" s={19} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>תצוגת נציג · דמו</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>דשבורד לידים נכנסים</div>
          </div>
          <Icon n="fwd" s={17} style={{ color: "var(--ink-3)" }} />
        </div>

        <button className="btn ghost" style={{ marginTop: 16 }} onClick={() => app.logout()}>התנתקות</button>
        <div className="disclaimer" style={{ marginTop: 14 }}>חוסך · Smart Saver · גרסת הדגמה</div>
      </div>
    </div>
  );
}

Object.assign(window, { Bills, Ratings, Profile });
