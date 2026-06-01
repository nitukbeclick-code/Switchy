/* screens-discover.jsx — Step 1 (Home/Category) + Step 2 (Smart quiz) */

const CATS = [
  ["סלולר", "דור 4 / 5 · חבילות גלישה"],
  ["אינטרנט ביתי", "תשתית + ספק (ISP)"],
  ["טריפל / משולב", "נט + טלוויזיה + טלפון"],
  ["טלוויזיה", "סטרימינג בלבד"],
  ["חבילת חו\"ל", "eSIM ויעדים"],
  ["קו נייח", "טלפון בבית"],
];

function HomeHead({ title }) {
  return (
    <div className="appbar" style={{ paddingTop: 10 }}>
      <Logo name="לוגו" style={{ width: 48, height: 26 }} />
      <span className="h" style={{ fontSize: 15 }}>{title}</span>
      <Ic shape="r" style={{ width: 28, height: 28, fontSize: 13 }}>≡</Ic>
    </div>
  );
}

/* ---------------- HOME ---------------- */
function HomeA() {
  return (
    <Phone tag="גישה A · רשת קטגוריות" caption="פתיחה ויזואלית: בוחרים תחום ואז נכנסים לשאלון. הכי ברור למשתמש חדש.">
      <HomeHead title="כל שוק התקשורת במקום אחד" />
      <Body gap={12}>
        <Card className="wf-soft" style={{ padding: 13 }}>
          <div className="tag-hand" style={{ fontSize: 21 }}>משלמים יותר מדי?</div>
          <Bar w="92%" mt={8} /><Bar w="70%" mt={6} />
          <Row gap={6} style={{ marginTop: 10 }}><Stars n={5} /><span className="lbl-sm">12,400 לקוחות כבר חסכו</span></Row>
        </Card>
        <span className="lbl">בחרו תחום להשוואה</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          {CATS.slice(0, 6).map((c, i) => (
            <Card key={i} className="flat" style={{ padding: "10px 10px" }}>
              <Ic shape={i % 2 ? "r" : "d"} accent style={{ width: 26, height: 26, fontSize: 12 }}></Ic>
              <div className="lbl" style={{ fontSize: 12.5, marginTop: 7 }}>{c[0]}</div>
              <div className="lbl-sm" style={{ fontSize: 10.5 }}>{c[1]}</div>
            </Card>
          ))}
        </div>
        <Btn>התחלת שאלון חכם →</Btn>
      </Body>
      <TabBar active={0} />
    </Phone>
  );
}

function HomeB() {
  return (
    <Phone tag="גישה B · 'כמה משלמים היום'" caption="פתיחה מבוססת חשבונית: מזינים סכום או סורקים חשבונית — מחזיר חיסכון פוטנציאלי מיד.">
      <HomeHead title="גלו כמה אתם יכולים לחסוך" />
      <Body gap={13}>
        <div className="tag-hand" style={{ fontSize: 23, lineHeight: 1.1 }}>כמה אתם משלמים<br />היום בחודש?</div>
        <Card className="alt" style={{ padding: "16px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span className="tag-hand" style={{ fontSize: 30 }}>₪ ___</span>
        </Card>
        <Row gap={8} justify="center">
          <span className="lbl-sm">או</span>
        </Row>
        <Btn variant="ghost"><Ic style={{ width: 22, height: 22, fontSize: 12, border: "none" }}>▢</Ic> סריקת חשבונית בצילום</Btn>
        <div className="divider"></div>
        <span className="lbl-sm">קפיצה מהירה לתחום</span>
        <Row gap={7} style={{ flexWrap: "wrap" }}>
          {CATS.slice(0, 5).map((c, i) => <Chip key={i} on={i === 0}>{c[0]}</Chip>)}
        </Row>
        <Note style={{ marginTop: 2 }}>הסכום הזה הופך אותנו ל"ליד חם" — מציגים חיסכון לפני הרשמה</Note>
      </Body>
      <TabBar active={0} />
    </Phone>
  );
}

function HomeC() {
  return (
    <Phone tag="גישה C · עוזר אישי" caption="פתיחה שיחתית: עוזר וירטואלי מוביל בשאלות. מדגיש את הליווי האנושי שהוא היתרון שלכם.">
      <HomeHead title="הייעוץ שלכם לתקשורת" />
      <Body gap={11}>
        <Row gap={10} align="flex-start">
          <Ic shape="r" accent style={{ width: 40, height: 40, fontSize: 17 }}>◕</Ic>
          <Card className="flat" style={{ flex: 1, padding: 11, borderColor: "var(--accent-ink)" }}>
            <div className="lbl" style={{ fontSize: 13 }}>שלום 👋 אני אמצא לכם מסלול זול יותר ב-3 שאלות.</div>
            <Bar w="60%" mt={7} />
          </Card>
        </Row>
        <Row gap={8} style={{ flexWrap: "wrap", marginInlineStart: 50 }}>
          <Chip hl>סלולר</Chip><Chip hl>אינטרנט</Chip><Chip hl>טריפל</Chip><Chip hl>טלוויזיה</Chip>
        </Row>
        <div style={{ flex: 1 }}></div>
        <Card className="wf-soft flat" style={{ padding: 12 }}>
          <span className="lbl-sm">מה תרצו לבדוק?</span>
          <Bar w="80%" mt={8} /><Bar w="55%" mt={6} />
        </Card>
        <Btn>בואו נתחיל</Btn>
        <Note brush>הליווי האנושי = הבידול. שווה להבליט אותו כבר במסך הבית.</Note>
      </Body>
      <TabBar active={0} />
    </Phone>
  );
}

function ScreenHome() {
  return (
    <Step title="1 · בית ובחירת קטגוריה" hint="3 פתיחות שונות"
      desc="נקודת הכניסה. השאלה המרכזית: למקד מיד בקטגוריה, בחיסכון הכספי, או בליווי האישי?">
      <HomeA /><HomeB /><HomeC />
    </Step>
  );
}

/* ---------------- SMART QUIZ ---------------- */
function QuizA() {
  return (
    <Phone tag="גישה A · שאלה-אחר-שאלה" caption="שלב אחד בכל מסך עם סרגל התקדמות. הכי פשוט וברור, אפס עומס — מצוין למבוגרים.">
      <AppBar title="שאלון חכם" action="דלג" />
      <Body gap={14}>
        <Row gap={6}>
          {[1, 2, 3, 4].map(i => <span key={i} className="wf-bar" style={{ height: 6, flex: 1, background: i <= 2 ? "var(--accent)" : "var(--bar)" }}></span>)}
        </Row>
        <span className="lbl-sm">שאלה 2 מתוך 4</span>
        <div className="tag-hand" style={{ fontSize: 24, lineHeight: 1.15 }}>כמה קווי סלולר<br />יש במשפחה?</div>
        <Stack gap={9}>
          {["קו אחד", "2-3 קווים", "4 ומעלה", "לא בטוח/ה"].map((o, i) => (
            <Card key={i} className="flat" style={{ padding: "13px 14px", display: "flex", alignItems: "center", gap: 10, borderColor: i === 1 ? "var(--accent-ink)" : "var(--ink)", background: i === 1 ? "rgba(47,111,143,.10)" : "var(--card)" }}>
              <Ic shape="r" style={{ width: 20, height: 20 }}>{i === 1 ? "●" : ""}</Ic>
              <span className="lbl" style={{ fontSize: 14 }}>{o}</span>
            </Card>
          ))}
        </Stack>
        <div style={{ flex: 1 }}></div>
        <Btn>הבא →</Btn>
      </Body>
    </Phone>
  );
}

function QuizB() {
  return (
    <Phone tag="גישה B · טופס בעמוד אחד" caption="כל ההעדפות בגלילה אחת עם סליידרים. למשתמש מנוסה שרוצה שליטה מלאה ומהירה.">
      <AppBar title="מה חשוב לכם?" action="אפס" />
      <Body gap={13} scroll>
        <Stack gap={5}>
          <Row justify="space-between"><span className="lbl">נפח גלישה</span><span className="tag-hand">∞ ללא הגבלה</span></Row>
          <div className="wf-bar" style={{ height: 7 }}><span style={{ display: "block", width: "78%", height: "100%", background: "var(--accent)", borderRadius: 5 }}></span></div>
        </Stack>
        <Stack gap={5}>
          <Row justify="space-between"><span className="lbl">דקות שיחה</span><span className="tag-hand">בינוני</span></Row>
          <div className="wf-bar" style={{ height: 7 }}><span style={{ display: "block", width: "45%", height: "100%", background: "var(--accent)", borderRadius: 5 }}></span></div>
        </Stack>
        <Stack gap={5}>
          <Row justify="space-between"><span className="lbl">תקציב חודשי</span><span className="tag-hand">עד ₪120</span></Row>
          <div className="wf-bar" style={{ height: 7 }}><span style={{ display: "block", width: "35%", height: "100%", background: "var(--accent)", borderRadius: 5 }}></span></div>
        </Stack>
        <div className="divider"></div>
        <span className="lbl-sm">תוספות</span>
        <Row gap={7} style={{ flexWrap: "wrap" }}>
          {["5G", "חבילת חו\"ל", "ללא התחייבות", "ראוטר חינם"].map((c, i) => <Chip key={i} on={i < 2}>{c}</Chip>)}
        </Row>
        <Btn style={{ marginTop: 4 }}>הצגת התאמות (8)</Btn>
      </Body>
    </Phone>
  );
}

function QuizC() {
  return (
    <Phone tag="גישה C · בחירת 'מה חשוב'" caption="גריד צ'יפים מהיר + סליידר תקציב. משחקי וקליל — מתאים לקהל צעיר.">
      <AppBar title="התאמה אישית" action="2/3" />
      <Body gap={12}>
        <div className="tag-hand" style={{ fontSize: 22 }}>סמנו מה חשוב לכם 👇</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {["5G מהיר", "חבילת חו\"ל", "ללא התחייבות", "שירות בעברית", "ראוטר חינם", "מחיר קבוע"].map((c, i) => (
            <Card key={i} className="flat" style={{ padding: "12px 10px", textAlign: "center", borderColor: [0, 2, 3].includes(i) ? "var(--accent-ink)" : "var(--ink)", background: [0, 2, 3].includes(i) ? "rgba(47,111,143,.10)" : "var(--card)" }}>
              <Ic shape="d" accent={[0, 2, 3].includes(i)} style={{ width: 22, height: 22, margin: "0 auto" }}></Ic>
              <div className="lbl" style={{ fontSize: 12, marginTop: 8 }}>{c}</div>
            </Card>
          ))}
        </div>
        <Stack gap={5} style={{ marginTop: 4 }}>
          <Row justify="space-between"><span className="lbl">התקציב שלי</span><span className="tag-hand">₪90/חודש</span></Row>
          <div className="wf-bar" style={{ height: 7 }}><span style={{ display: "block", width: "40%", height: "100%", background: "var(--accent)", borderRadius: 5 }}></span></div>
        </Stack>
        <Btn>מצאו לי מסלול</Btn>
      </Body>
    </Phone>
  );
}

function ScreenQuiz() {
  return (
    <Step title="2 · שאלון חכם / איתור צרכים" hint="3 מבנים"
      desc="ממיר 'מבקר' ל'ליד'. שאלה-בכל-מסך (פשוט), טופס אחד (מהיר), או בחירת צ'יפים (קליל)?">
      <QuizA /><QuizB /><QuizC />
    </Step>
  );
}

Object.assign(window, { ScreenHome, ScreenQuiz });
