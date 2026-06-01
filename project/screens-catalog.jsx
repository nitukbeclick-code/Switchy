/* screens-catalog.jsx — Step 7: populated provider catalog (representative data, May 2026) */

const CATALOG = {
  "סלולר": {
    nav: "דור 4 / 5 · חבילות גלישה",
    rows: [
      { name: "019 מובייל", plan: "12GB · דור 4", price: "₪19.90", tags: ["ללא התחייבות"], badge: "הזול" },
      { name: "רמי לוי", plan: "100GB · רשת פלאפון", price: "₪29.90", tags: ["ללא התחייבות"] },
      { name: "הוט מובייל", plan: "300GB + שיחות חו\"ל", price: "₪30.90", tags: ["קו בודד"] },
      { name: "גולן טלקום", plan: "250GB · 5G", price: "~₪39", tags: ["5G", "מבצע שנה"] },
      { name: "סלקום", plan: "1500GB · 5G", price: "~₪59", tags: ["אפליקציות חופשי"], badge: "מומלץ" },
      { name: "פלאפון", plan: "1000GB · 5G Max", price: "~₪75", tags: ["רשת עצמאית"] },
    ],
  },
  "אינטרנט + ISP": {
    nav: "תשתית סיבים + ספק",
    rows: [
      { name: "בזק", plan: "סיבים 600Mb", price: "~₪99", tags: ["תשתית", "נתב כלול"] },
      { name: "סלקום Fiber", plan: "600Mb · Wi-Fi 7", price: "~₪99", tags: ["Wi-Fi 7"], badge: "מומלץ" },
      { name: "HOT", plan: "סיבים 1000Mb", price: "~₪109", tags: ["כבלים/סיבים"] },
      { name: "פרטנר Fiber", plan: "סיבים 1000Mb", price: "~₪119", tags: ["תשתית עצמאית"], badge: "מהיר" },
      { name: "IBC Unlimited", plan: "1000Mb", price: "~₪99", tags: ["סיבים"] },
    ],
  },
  "טלוויזיה": {
    nav: "סטרימינג / כבלים / לווין",
    rows: [
      { name: "FREE TV", plan: "60+ ערוצים · אפליקציה", price: "~₪29", tags: ["אינטרנטי"], badge: "הזול" },
      { name: "STING+", plan: "5 חבילות תוכן · מבית yes", price: "₪49", tags: ["ללא התחייבות"], badge: "מומלץ" },
      { name: "סלקום TV+", plan: "IPTV · VOD", price: "~₪99", tags: ["מבצעי שנה חינם"] },
      { name: "פרטנר TV", plan: "כולל נטפליקס מובנה", price: "~₪99", tags: ["נטפליקס"] },
      { name: "HOT", plan: "ערוצים + 4K VOD", price: "~₪99", tags: ["כבלים"] },
      { name: "yes", plan: "140+ ערוצים + 2 ממירים", price: "₪149", tags: ["VOD ענק"] },
    ],
  },
  "טריפל / משולב": {
    nav: "אינטרנט + TV + טלפון",
    rows: [
      { name: "STING+ דאבל", plan: "TV + פייבר", price: "₪149", tags: ["אינטרנטי"], badge: "הזול" },
      { name: "yes+ דאבל", plan: "TV + אינטרנט", price: "~₪149", tags: ["140+ ערוצים"] },
      { name: "פרטנר טריפל", plan: "1000Mb + TV + טלפון", price: "~₪175", tags: ["נטפליקס מובנה"], badge: "מומלץ" },
      { name: "HOT טריפל", plan: "סיבים + TV + טלפון", price: "~₪179", tags: ["מחיר ל-3 שנים"] },
      { name: "סלקום קוואטרו", plan: "טריפל + סלולר", price: "~₪199", tags: ["חשבונית אחת"] },
    ],
  },
  "חבילות חו\"ל": {
    nav: "eSIM ויעדים",
    rows: [
      { name: "אקספון 018", plan: "צבירת גלישה חו\"ל חודשית", price: "כלול", tags: ["eSIM"], badge: "מומלץ" },
      { name: "Airalo", plan: "eSIM לפי יעד", price: "לפי יעד", tags: ["170+ מדינות"] },
      { name: "פלאפון 5G Max", plan: "חבילת חו\"ל כלולה", price: "במסלול", tags: ["VIP Global"] },
      { name: "סלקום", plan: "חבילת חו\"ל לפי אזור", price: "לפי יעד", tags: ["יומי/שבועי"] },
    ],
  },
};

function PopRow({ r }) {
  const numeric = /^[~]?₪/.test(r.price);
  return (
    <Card className="flat" style={{ padding: 10 }}>
      {r.badge && <div className="tag-hand" style={{ fontSize: 14, color: "var(--accent-ink)", marginBottom: 2 }}>★ {r.badge}</div>}
      <Row justify="space-between" align="flex-start" gap={8}>
        <Stack gap={2} style={{ flex: 1 }}>
          <span className="lbl" style={{ fontSize: 13.5 }}>{r.name}</span>
          <span className="lbl-sm" style={{ fontSize: 11, fontWeight: 600 }}>{r.plan}</span>
        </Stack>
        <Stack gap={0} style={{ alignItems: "flex-end" }}>
          <span className="price" style={{ fontSize: numeric ? 19 : 14, color: numeric ? "var(--ink)" : "var(--ink-soft)" }}>{r.price}</span>
          {numeric && <span className="lbl-sm" style={{ fontSize: 9.5 }}>לחודש</span>}
        </Stack>
      </Row>
      <Row gap={5} style={{ flexWrap: "wrap", marginTop: 8 }}>
        {r.tags.map((t, i) => <Chip key={i} style={{ fontSize: 10, padding: "3px 8px" }}>{t}</Chip>)}
        <span style={{ flex: 1 }}></span>
        <Btn variant="sm" style={{ padding: "5px 10px", fontSize: 11.5 }}>קבלת הצעה</Btn>
      </Row>
    </Card>
  );
}

function CatalogPhone({ cat }) {
  const data = CATALOG[cat];
  return (
    <Phone tag={cat} caption={"קטלוג מאוכלס · " + data.rows.length + " מסלולים מייצגים. בייצור: פיד חי לכל ספק."}>
      <AppBar title={cat} nav="≡" action="סינון" />
      <div className="body scroll" style={{ gap: 9 }}>
        <Row justify="space-between" style={{ marginBottom: 2 }}>
          <span className="lbl-sm" style={{ fontSize: 10.5 }}>{data.nav}</span>
          <span className="lbl-sm" style={{ fontSize: 10.5 }}>ממוין: התאמה</span>
        </Row>
        {data.rows.map((r, i) => <PopRow key={i} r={r} />)}
        <div style={{ height: 4 }}></div>
      </div>
      <TabBar active={1} />
    </Phone>
  );
}

function ScreenCatalog() {
  return (
    <React.Fragment>
      <div className="step-head">
        <h2>7 · קטלוג ספקים מאוכלס</h2>
        <div className="desc">איך הדאטה האמיתית יושבת בעיצוב — שמות הספקים האמיתיים ומסלולים מייצגים, פר קטגוריה.</div>
        <div className="arrow">דאטה אמיתית</div>
      </div>
      <div className="wf-card flat" style={{ margin: "0 4px 18px", padding: "11px 14px", borderColor: "var(--accent-ink)", display: "flex", gap: 10, alignItems: "center", maxWidth: 760, background: "rgba(47,111,143,.08)" }}>
        <span style={{ fontFamily: "var(--hand)", fontSize: 22, color: "var(--accent-ink)", flex: "0 0 auto" }}>⚠</span>
        <div className="lbl-sm" style={{ fontSize: 12.5, fontWeight: 600 }}>
          נתונים <b style={{ color: "var(--ink)" }}>מייצגים</b> (מאי 2026). מחיר עם <b style={{ color: "var(--ink)" }}>~</b> = הערכה. מחירי תקשורת משתנים שבועית — בגרסת ייצור יש לחבר את האפליקציה ל-API / פיד חי לכל ספק לאימות מחירים, מבצעים ותנאים.
        </div>
      </div>
      <div className="phone-row">
        {Object.keys(CATALOG).map((c) => <CatalogPhone key={c} cat={c} />)}
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { ScreenCatalog });
