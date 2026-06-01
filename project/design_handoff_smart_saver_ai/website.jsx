/* website.jsx — responsive web app for חוסך (reuses proto-data.jsx globals) */
const { useState, useEffect } = React;

const WLOGO = {
  "019 מובייל": "019", "הוט מובייל": "hotmobile", "גולן טלקום": "golan",
  "סלקום": "cellcom", "פרטנר": "partner", "בזק": "bezeq", "אקספון 018": "xphone",
  "פלאפון": "pelephone", "HOT": "hot", "IBC / ccc": "ccc", "Triple C": "ccc",
  "FreeTV": "freetv", "STING+": "sting", "yes": "yes", "NEXT TV": "nexttv", "גילת": "gilat", "Gilat": "gilat",
};
function logoSrc(name) { return WLOGO[name] ? "assets/logos/" + WLOGO[name] + ".png" : null; }
const WCOLOR = { cellular: "#2563EB", internet: "#0D9488", tv: "#7C3AED", triple: "#EA580C", abroad: "#DB2777" };
function WLogo({ name, cls }) {
  const s = logoSrc(name);
  if (s) return <span className={cls || "plogo"}><img src={s} alt={name} /></span>;
  return <span className={(cls || "plogo") + " txt"}>{name}</span>;
}

function PCard({ p, current }) {
  const save = planSaveYear(p, current);
  const warn = planWarn(p);
  return (
    <div className={"pcard" + (p.best ? " best" : "")}>
      {p.best && <span className="badge">★ הבחירה המשתלמת</span>}
      <div className="top">
        <WLogo name={p.provider} />
        <div style={{ textAlign: "end" }}>
          <div className="pprice">{planPrice(p)}{p.price != null && <small> /חודש</small>}</div>
          {planAfter(p) && <div className="pafter">אח״כ {planAfter(p)}</div>}
        </div>
      </div>
      <div className="pname">{p.plan}</div>
      <div className="pnet">{p.net}</div>
      <div className="ptags">
        {warn && <span className="ptag warn">⚠ מחיר עולה</span>}
        {p.feats.slice(0, 2).map((f, i) => <span className="ptag" key={i}>{f.label}</span>)}
      </div>
      <div className="foot">
        {save > 0 ? <span className="psave">↗ חוסך ₪{save}/שנה</span> : <span style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 700 }}>{p.term}</span>}
        <button className="btn sm">קבלת הצעה</button>
      </div>
    </div>
  );
}

function Site() {
  const [cat, setCat] = useState("cellular");
  const [bill, setBill] = useState(119);
  const [sort, setSort] = useState("match");
  const c = CATS.find(x => x.id === cat);
  let list = [...plansByCat(cat)];
  if (sort === "price") list.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
  else if (sort === "save") list.sort((a, b) => planSaveYear(b, bill) - planSaveYear(a, bill));
  else list.sort((a, b) => (b.best ? 1 : 0) - (a.best ? 1 : 0));
  list = list.slice(0, 9);
  const topSave = Math.max(...plansByCat(cat).map(p => planSaveYear(p, bill)), 0);

  return (
    <React.Fragment>
      <nav>
        <div className="wrap">
          <div className="brand"><span className="mk">⚡</span> חוסך</div>
          <div className="links">
            <a href="#compare">השוואה</a><a href="#how">איך זה עובד</a><a href="#brands">החברות</a><a href="#compare">קהילה</a>
          </div>
          <div className="spacer"></div>
          <a href="#compare" className="btn sm">השוו עכשיו</a>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap grid">
          <div>
            <h1>כל שוק התקשורת,<br /><em>במסלול אחד חכם.</em></h1>
            <p>השוו סלולר, אינטרנט, טלוויזיה וטריפל מכל החברות בישראל — ואנחנו מלווים אתכם יד ביד עד הניתוק מהספק הישן.</p>
            <div className="cta-row">
              <div className="billbox">
                <span style={{ color: "var(--ink-3)", fontWeight: 700 }}>₪</span>
                <input type="number" value={bill} onChange={e => setBill(+e.target.value || 0)} />
                <a href="#compare" className="btn">בדקו כמה תחסכו</a>
              </div>
            </div>
            <div className="trust">
              <div className="avatars"><span></span><span></span><span></span><span></span></div>
              12,400 לקוחות כבר חסכו איתנו
            </div>
          </div>
          <div className="hero-card">
            <div className="lbl">לפי ₪{bill} שאתם משלמים — אפשר לחסוך עד</div>
            <div className="big">₪{(topSave || 1240).toLocaleString()}<small> / שנה</small></div>
            {list.slice(0, 2).map(p => (
              <div className="mini" key={p.id}>
                <WLogo name={p.provider} cls="logo" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>{p.plan}</div>
                  <div style={{ fontSize: 12, color: "var(--lime)", fontWeight: 700 }}>{planPrice(p)}/חודש · חוסך ₪{planSaveYear(p, bill)}/שנה</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="wrap">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
          {[["10", "חברות"], ["60+", "מסלולים"], ["₪0", "עלות לבדיקה"], ["24ש׳", "חוזרים אליכם"]].map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "16px 22px" }}>
              <div style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 26, color: "var(--green)" }}>{s[0]}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 700 }}>{s[1]}</div>
            </div>
          ))}
        </div>
      </div>

      <section id="compare">
        <div className="wrap">
          <div className="sec-head">
            <div className="kick">השוואה חיה</div>
            <h2>בחרו תחום והשוו את כל המסלולים</h2>
          </div>
          <div className="cattabs">
            {CATS.map(x => <div key={x.id} className={"cattab" + (x.id === cat ? " on" : "")} style={x.id === cat ? { background: WCOLOR[x.id], borderColor: WCOLOR[x.id] } : null} onClick={() => setCat(x.id)}>{x.label}</div>)}
          </div>
          <div className="freshline">✓ המחירים עודכנו היום · {plansByCat(cat).length} מסלולים מ-10 חברות</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 22 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)", alignSelf: "center" }}>מיון:</span>
            {[["match", "מומלצים"], ["price", "מחיר"], ["save", "חיסכון"]].map(s => <span key={s[0]} className={"cattab" + (sort === s[0] ? " on" : "")} style={{ padding: "7px 14px", fontSize: 13.5 }} onClick={() => setSort(s[0])}>{s[1]}</span>)}
          </div>
          <div className="pgrid">
            {list.map(p => <PCard key={p.id} p={p} current={bill} />)}
          </div>
        </div>
      </section>

      <section id="how">
        <div className="wrap">
          <div className="sec-head"><div className="kick">פשוט וברור</div><h2>איך זה עובד</h2></div>
          <div className="steps">
            <div className="step"><div className="n">1</div><h3>משווים בקלות</h3><p>בוחרים תחום, מזינים כמה אתם משלמים, ומקבלים את המסלולים המשתלמים ביותר מכל החברות.</p></div>
            <div className="step"><div className="n">2</div><h3>בוחרים ומשאירים פרטים</h3><p>נציג אישי חוזר אליכם, מסביר הכול ומבצע את ההצטרפות לספק החדש דרכנו.</p></div>
            <div className="step usp"><div className="n">★</div><h3>מלווים עד הניתוק</h3><p>אנחנו לצידכם יד ביד מול הספק הישן עד הניתוק המלא — שומרים על המספר (ניוד), לא מנתקים.</p></div>
          </div>
        </div>
      </section>

      <section id="brands">
        <div className="wrap">
          <div className="sec-head"><div className="kick">כל השוק</div><h2>משווים בין כל חברות התקשורת</h2></div>
          <div className="brandstrip">
            {["yes", "פלאפון", "סלקום", "פרטנר", "HOT", "גולן טלקום", "019 מובייל", "בזק", "FreeTV", "הוט מובייל", "גילת", "Triple C"].map(n => <WLogo key={n} name={n} cls="b" />)}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="ctaband">
            <h2>מוכנים לחסוך?</h2>
            <p>3 שאלות קצרות ונמצא לכם את המסלול הזול ביותר — בלי התחייבות.</p>
            <a href="#compare" className="btn lime">התחילו השוואה חכמה</a>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="grid">
            <div className="col" style={{ maxWidth: 260 }}>
              <div className="brand" style={{ marginBottom: 10 }}><span className="mk">⚡</span> חוסך</div>
              <div style={{ lineHeight: 1.6 }}>השוואת מחירים חכמה לכל שוק התקשורת בישראל — וליווי אישי עד הניתוק מהספק הישן.</div>
            </div>
            <div className="col"><h4>תחומים</h4><a href="#compare">סלולר</a><a href="#compare">אינטרנט</a><a href="#compare">טלוויזיה</a><a href="#compare">טריפל</a></div>
            <div className="col"><h4>החברה</h4><a href="#how">איך זה עובד</a><a href="#brands">החברות</a><a href="#compare">קהילה</a><a href="#compare">צור קשר</a></div>
            <div className="col"><h4>משפטי</h4><a href="#">תנאי שימוש</a><a href="#">פרטיות</a><a href="#">נגישות</a></div>
          </div>
          <div className="disc">מחירים מייצגים שנאספו ממקורות הספקים · יש לאמת מול הספק טרם הצטרפות · אנחנו מסייעים בתהליך הניתוק/ניוד — איננו מנתקים עבורכם. © 2026 חוסך</div>
        </div>
      </footer>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Site />);
