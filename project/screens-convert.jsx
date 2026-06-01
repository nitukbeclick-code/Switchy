/* screens-convert.jsx — Step 5 (Switch + disconnect handholding) + Step 6 (Account) */

function SwitchLead() {
  return (
    <Phone tag="גישה A · השארת פרטים + 'מה עכשיו'" caption="טופס ליד קצר ואז ציר זמן ברור של מה קורה אחרי. בונה אמון לפני ההתחייבות.">
      <AppBar title="כמעט סיימנו" action="" />
      <Body gap={11} scroll>
        <div className="tag-hand" style={{ fontSize: 21 }}>נציג שלנו ייקח את זה מכאן</div>
        <Stack gap={8}>
          {["שם מלא", "טלפון", "הספק הנוכחי שלי"].map((f, i) => (
            <Card key={i} className="flat" style={{ padding: "11px 13px" }}>
              <span className="lbl-sm" style={{ fontSize: 11 }}>{f}</span>
              <Bar w={i === 2 ? "45%" : "70%"} mt={7} d />
            </Card>
          ))}
        </Stack>
        <div className="divider"></div>
        <span className="lbl">מה קורה עכשיו</span>
        <Stack gap={9}>
          {[["1", "משאירים פרטים", true], ["2", "נציג חוזר אליכם תוך 24ש'", false], ["3", "מצטרפים לספק החדש דרכנו", false], ["4", "מלווים אתכם בניתוק מהישן", false]].map((s, i) => (
            <Row key={i} gap={10} align="flex-start">
              <Ic shape="r" accent={s[2]} style={{ width: 24, height: 24, fontSize: 11, background: s[2] ? "var(--accent)" : "var(--card)", color: s[2] ? "#fff" : "var(--ink-soft)", borderColor: s[2] ? "var(--accent-ink)" : "var(--line)" }}>{s[0]}</Ic>
              <span className="lbl" style={{ fontSize: 12.5, fontWeight: 600, paddingTop: 3 }}>{s[1]}</span>
            </Row>
          ))}
        </Stack>
        <Btn>שליחה וקבלת שיחה</Btn>
      </Body>
    </Phone>
  );
}

function SwitchTracker() {
  return (
    <Phone tag="גישה B · מעקב תהליך חי" caption="הלקוח רואה איפה הוא עומד. שלב הניתוק מודגש כפעיל — שם אתם מוסיפים ערך.">
      <AppBar title="התהליך שלך" action="" />
      <Body gap={12} scroll>
        <Card className="flat wf-soft" style={{ padding: 12 }}>
          <Row justify="space-between"><span className="lbl-sm">סטטוס</span><Chip on style={{ fontSize: 10.5 }}>בתהליך</Chip></Row>
          <div className="tag-hand" style={{ fontSize: 19, marginTop: 6, color: "var(--accent-ink)" }}>מלווים אותך בניתוק מהספק הישן</div>
        </Card>
        <div style={{ position: "relative", paddingInlineStart: 6 }}>
          {[["הצטרפת לספק החדש", "done"], ["אישור קליטה התקבל", "done"], ["ליווי ניתוק מהספק הישן", "now"], ["הניתוק הושלם — סיימנו!", "next"]].map((s, i, a) => (
            <Row key={i} gap={11} align="flex-start" style={{ paddingBottom: i < a.length - 1 ? 16 : 0, position: "relative" }}>
              <Ic shape="r" accent={s[1] !== "next"} style={{ width: 22, height: 22, fontSize: 11, zIndex: 1, background: s[1] === "done" ? "var(--accent)" : s[1] === "now" ? "var(--card)" : "var(--card)", color: s[1] === "done" ? "#fff" : "var(--accent-ink)", borderColor: s[1] === "next" ? "var(--line)" : "var(--accent-ink)", borderStyle: s[1] === "now" ? "dashed" : "solid" }}>{s[1] === "done" ? "✓" : ""}</Ic>
              <Stack gap={3} style={{ paddingTop: 1 }}>
                <span className="lbl" style={{ fontSize: 12.5, color: s[1] === "next" ? "var(--ink-soft)" : "var(--ink)" }}>{s[0]}</span>
                {s[1] === "now" && <span className="lbl-sm" style={{ fontSize: 10.5 }}>הנציג שלך: דנה · עודכן היום</span>}
              </Stack>
              {i < a.length - 1 && <span style={{ position: "absolute", insetInlineStart: 16, top: 22, bottom: -2, width: 2, background: "var(--line)" }}></span>}
            </Row>
          ))}
        </div>
        <Btn variant="ghost">💬 צ'אט עם הנציג</Btn>
        <Note>חשוב: אתם מלווים — לא מנתקים. ההבחנה הזו צריכה להופיע במפורש.</Note>
      </Body>
      <TabBar active={2} />
    </Phone>
  );
}

function SwitchGuide() {
  return (
    <Phone tag="גישה C · צ'קליסט ליווי ניתוק" caption="רשימת משימות מי-עושה-מה. מבהיר שאתם עוזרים מול הספק הישן, יד ביד.">
      <AppBar title="ליווי ניתוק מהספק הישן" action="" />
      <Body gap={11} scroll>
        <Card className="flat" style={{ padding: 11, borderColor: "var(--accent-ink)" }}>
          <Note brush style={{ fontSize: 15 }}>אנחנו לא מנתקים עבורכם — אנחנו לצידכם בכל שלב עד הניתוק המלא.</Note>
        </Card>
        <Stack gap={9}>
          {[["✓", "ריכזנו את פרטי הספק הישן", "אנחנו", true], ["✓", "הכנו עבורכם נוסח בקשת ניתוק", "אנחנו", true], ["○", "שיחה משותפת למוקד הספק", "יחד", false], ["○", "אישור סיום ההתקשרות", "אתם + ליווי", false], ["○", "וידוא שלא חויבתם פעמיים", "אנחנו", false]].map((s, i) => (
            <Row key={i} gap={10} align="flex-start" style={{ borderBottom: "1.5px dashed var(--line)", paddingBottom: 9 }}>
              <Ic shape="r" accent={s[3]} style={{ width: 22, height: 22, fontSize: 11, background: s[3] ? "var(--accent)" : "var(--card)", color: s[3] ? "#fff" : "var(--ink-soft)" }}>{s[0]}</Ic>
              <Stack gap={2} style={{ flex: 1 }}>
                <span className="lbl" style={{ fontSize: 12.5, fontWeight: 600 }}>{s[1]}</span>
                <span className="lbl-sm" style={{ fontSize: 10.5 }}>אחראי: {s[2]}</span>
              </Stack>
            </Row>
          ))}
        </Stack>
        <Btn>קביעת שיחת ליווי</Btn>
      </Body>
    </Phone>
  );
}

function ScreenSwitch() {
  return (
    <Step title="5 · מעבר + ליווי ניתוק מהספק" hint="הבידול שלכם · 3 גישות"
      desc="כאן נוצר הליד והליווי. הדגש: אתם מלווים יד-ביד עד הניתוק מהספק הישן — אך לא מנתקים בעצמכם.">
      <SwitchLead /><SwitchTracker /><SwitchGuide />
    </Step>
  );
}

/* ---------------- ACCOUNT ---------------- */
function AccountDash() {
  return (
    <Phone tag="גישה A · לוח בקרה אישי" caption="סיכום: חיסכון שהושג, בקשות פעילות והתראות. נקודת חזרה לאפליקציה.">
      <AppBar title="שלום, דני" nav="≡" action="♡" />
      <Body gap={11} scroll>
        <Card style={{ padding: 14, borderColor: "var(--accent-ink)", textAlign: "center" }}>
          <span className="lbl-sm">סך הכל חסכת איתנו</span>
          <div className="tag-hand" style={{ fontSize: 34, color: "var(--accent-ink)", lineHeight: 1.1 }}>₪1,080</div>
        </Card>
        <span className="lbl">הבקשות שלי</span>
        {[["מעבר סלולר · ספק A", "בליווי ניתוק", "now"], ["אינטרנט ביתי · ספק B", "הושלם", "done"]].map((r, i) => (
          <Card key={i} className="flat" style={{ padding: 11 }}>
            <Row justify="space-between">
              <span className="lbl" style={{ fontSize: 12.5 }}>{r[0]}</span>
              <Chip on={r[2] === "now"} style={{ fontSize: 10 }}>{r[1]}</Chip>
            </Row>
            <Bar w="60%" mt={8} />
          </Card>
        ))}
        <Row gap={9}>
          <Btn variant="ghost sm" style={{ flex: 1 }}>השוואה חדשה</Btn>
          <Btn variant="sm" style={{ flex: 1 }}>💬 צ'אט</Btn>
        </Row>
      </Body>
      <TabBar active={3} />
    </Phone>
  );
}

function AccountAlerts() {
  return (
    <Phone tag="גישה B · פיד התראות ומעקב" caption="זרם עדכונים: ירידות מחיר, מבצעים ועדכוני בקשה. מחזיר משתמשים לאפליקציה.">
      <AppBar title="התראות ועדכונים" nav="≡" action="⚙" />
      <Body gap={10} scroll>
        <Row gap={7}><Chip on>הכל</Chip><Chip>מחירים</Chip><Chip>בקשות</Chip></Row>
        {[["📉", "ירידת מחיר", "מסלול דומה לשלך ירד ל-₪69", "accent"], ["🔔", "עדכון בקשה", "הנציג דנה עדכן את תהליך הניתוק", ""], ["🎁", "מבצע חדש", "ספק C: 200GB באותו מחיר", "accent"], ["✓", "הושלם", "ניתוק מהספק הישן אושר", ""]].map((a, i) => (
          <Row key={i} gap={10} align="flex-start" style={{ borderBottom: "1.5px dashed var(--line)", paddingBottom: 10 }}>
            <Ic shape="r" accent={a[3] === "accent"} style={{ width: 30, height: 30, fontSize: 13 }}>{a[0]}</Ic>
            <Stack gap={3} style={{ flex: 1 }}>
              <span className="lbl" style={{ fontSize: 12.5 }}>{a[1]}</span>
              <span className="lbl-sm" style={{ fontSize: 11, fontWeight: 600 }}>{a[2]}</span>
            </Stack>
            <span className="lbl-sm" style={{ fontSize: 10 }}>2ש'</span>
          </Row>
        ))}
        <Note>התראות ירידת מחיר = מנוע חזרה (retention) ומקור לידים חוזרים.</Note>
      </Body>
      <TabBar active={2} />
    </Phone>
  );
}

function ScreenAccount() {
  return (
    <Step title="6 · אזור אישי · מעקב · צ'אט" hint="2 גישות"
      desc="החזרה לאפליקציה אחרי ההמרה. לוח בקרה עם חיסכון ובקשות, או פיד התראות על ירידות מחיר?">
      <AccountDash /><AccountAlerts />
    </Step>
  );
}

Object.assign(window, { ScreenSwitch, ScreenAccount });
