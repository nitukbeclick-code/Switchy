/* screens-compare.jsx — Step 3 (Results) + Step 4 (Single plan) */

function PlanCard({ rank, name, price, save, chips, best }) {
  return (
    <Card className="flat" style={{ padding: 11, borderColor: best ? "var(--accent-ink)" : "var(--ink)", borderWidth: best ? 2.5 : 2 }}>
      {best && <div className="tag-hand" style={{ fontSize: 16, color: "var(--accent-ink)", marginBottom: 4 }}>★ ההתאמה הכי טובה</div>}
      <Row justify="space-between" align="flex-start">
        <Logo name={name} style={{ width: 56, height: 26 }} />
        <Stack gap={1} style={{ alignItems: "flex-start" }}>
          <span className="price" style={{ fontSize: 22 }}>₪{price}</span>
          <span className="lbl-sm" style={{ fontSize: 10 }}>לחודש</span>
        </Stack>
      </Row>
      <Bar w="70%" mt={9} />
      <Row gap={5} style={{ flexWrap: "wrap", marginTop: 9 }}>
        {chips.map((c, i) => <Chip key={i} style={{ fontSize: 10.5, padding: "3px 8px" }}>{c}</Chip>)}
      </Row>
      <Row justify="space-between" style={{ marginTop: 10 }}>
        <span className="hl" style={{ fontSize: 12 }}>חוסך ₪{save}/שנה</span>
        <Btn variant="sm">בחירה</Btn>
      </Row>
    </Card>
  );
}

function ResultsA() {
  return (
    <Phone tag="גישה A · רשימה מדורגת" caption="כרטיסים ממוינים לפי התאמה, עם תג חיסכון בולט. הפורמט המוכר והאמין ביותר.">
      <AppBar title="8 מסלולים מתאימים" action="סינון" />
      <Body gap={10} scroll>
        <Row gap={7} style={{ flexWrap: "wrap" }}>
          <Chip on>מומלץ</Chip><Chip>הזול ביותר</Chip><Chip>5G</Chip>
        </Row>
        <PlanCard best name="ספק A" price="79" save="540" chips={["5G", "ללא התחייבות", "100GB"]} />
        <PlanCard name="ספק B" price="89" save="360" chips={["דור 4", "ראוטר חינם"]} />
        <PlanCard name="ספק C" price="99" save="240" chips={["חבילת חו\"ל"]} />
        <div style={{ height: 4 }}></div>
      </Body>
    </Phone>
  );
}

function ResultsB() {
  const rows = ["מחיר חודשי", "נפח גלישה", "דור רשת", "התחייבות", "חבילת חו\"ל", "ראוטר"];
  const cols = [["ספק A", true], ["ספק B", false], ["ספק C", false]];
  return (
    <Phone tag="גישה B · טבלת השוואה" caption="עמודות ספקים מול שורות מאפיינים. עוצמתי להשוואת פרטים מדוקדקת זה מול זה.">
      <AppBar title="השוואה צד-לצד" action="הוסף" />
      <Body gap={0} scroll style={{ paddingInline: 12 }}>
        <Row gap={0} style={{ position: "sticky", top: 0, background: "var(--card)" }}>
          <span style={{ flex: "0 0 78px" }}></span>
          {cols.map((c, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", padding: "4px 2px" }}>
              <Logo name={c[0]} style={{ width: "100%", height: 24 }} />
              {c[1] && <div className="tag-hand" style={{ fontSize: 12, color: "var(--accent-ink)" }}>הזוכה</div>}
            </div>
          ))}
        </Row>
        {rows.map((r, ri) => (
          <Row key={ri} gap={0} style={{ borderTop: "1.5px dashed var(--line)", padding: "9px 0" }}>
            <span className="lbl-sm" style={{ flex: "0 0 78px", fontSize: 11 }}>{r}</span>
            {cols.map((c, ci) => (
              <span key={ci} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700, color: ci === 0 ? "var(--accent-ink)" : "var(--ink-soft)" }}>
                {ri === 0 ? "₪" + [79, 89, 99][ci] : (ci === 0 || ri % 2 === 0 ? "✓" : "—")}
              </span>
            ))}
          </Row>
        ))}
        <Btn style={{ marginTop: 12 }}>בחרו את ספק A</Btn>
      </Body>
    </Phone>
  );
}

function ResultsC() {
  return (
    <Phone tag="גישה C · המלצה אחת + חלופות" caption="המלצה בודדת גדולה עם נימוקים, והשאר מקופלים. מצוין לזרימה המונחית של העוזר.">
      <AppBar title="ההמלצה שלנו" action="עוד" />
      <Body gap={11} scroll>
        <Card style={{ padding: 14, borderColor: "var(--accent-ink)", borderWidth: 2.5 }}>
          <div className="tag-hand" style={{ fontSize: 18, color: "var(--accent-ink)" }}>הכי משתלם עבורכם</div>
          <Row justify="space-between" align="flex-start" style={{ marginTop: 6 }}>
            <Logo name="ספק A" style={{ width: 60, height: 28 }} />
            <span className="price" style={{ fontSize: 28 }}>₪79</span>
          </Row>
          <Stack gap={6} style={{ marginTop: 10 }}>
            {["100GB ב-5G", "ללא התחייבות", "חוסך לכם ₪540 בשנה"].map((t, i) => (
              <Row key={i} gap={8}><Ic shape="r" accent style={{ width: 18, height: 18, fontSize: 10 }}>✓</Ic><span className="lbl" style={{ fontSize: 12.5 }}>{t}</span></Row>
            ))}
          </Stack>
          <Btn style={{ marginTop: 12 }}>אני רוצה את המסלול הזה</Btn>
        </Card>
        <span className="lbl-sm">חלופות נוספות</span>
        {[["ספק B", "89"], ["ספק C", "99"]].map((p, i) => (
          <Row key={i} justify="space-between" style={{ borderBottom: "1.5px dashed var(--line)", paddingBottom: 8 }}>
            <Logo name={p[0]} style={{ width: 50, height: 22 }} />
            <Row gap={10}><span className="price">₪{p[1]}</span><span className="nav" style={{ fontSize: 18 }}>›</span></Row>
          </Row>
        ))}
      </Body>
    </Phone>
  );
}

function ScreenResults() {
  return (
    <Step title="3 · תוצאות והשוואה" hint="3 דרכים להציג"
      desc="הלב של המוצר. רשימה מדורגת, טבלת השוואה צד-לצד, או המלצה בודדת עם חלופות?">
      <ResultsA /><ResultsB /><ResultsC />
    </Step>
  );
}

/* ---------------- SINGLE PLAN ---------------- */
function PlanDetailA() {
  return (
    <Phone tag="גישה A · עמוד מסלול מלא" caption="כל הפרטים: כלול במסלול, אותיות קטנות, ביקורות, ו-CTA דביק למטה.">
      <AppBar title="ספק A · מסלול 5G" action="♡" />
      <Body gap={11} scroll>
        <Row justify="space-between" align="flex-start">
          <Logo name="ספק A" style={{ width: 60, height: 30 }} />
          <Stack gap={0} style={{ alignItems: "flex-start" }}>
            <span className="price" style={{ fontSize: 26 }}>₪79<span className="lbl-sm" style={{ fontSize: 11 }}> /חודש</span></span>
            <span className="hl" style={{ fontSize: 11 }}>חוסך ₪540/שנה</span>
          </Stack>
        </Row>
        <span className="lbl">מה כלול</span>
        <Stack gap={7}>
          {["100GB גלישה ב-5G", "שיחות ו-SMS ללא הגבלה", "ללא התחייבות", "5GB חבילת חו\"ל"].map((t, i) => (
            <Row key={i} gap={8}><Ic shape="r" accent style={{ width: 18, height: 18, fontSize: 10 }}>✓</Ic><span className="lbl" style={{ fontSize: 12.5, fontWeight: 600 }}>{t}</span></Row>
          ))}
        </Stack>
        <Card className="flat wf-soft" style={{ padding: 10 }}>
          <Row justify="space-between"><span className="lbl-sm">אותיות קטנות</span><span className="nav" style={{ fontSize: 16 }}>﹀</span></Row>
        </Card>
        <Row gap={8}><Stars n={4} /><span className="lbl-sm">4.2 · 1,830 ביקורות</span></Row>
        <Card className="flat" style={{ padding: 10 }}><Lines ws={["100%", "85%", "55%"]} /></Card>
      </Body>
      <div style={{ padding: 12, borderTop: "2px solid var(--ink)", background: "var(--card)" }}>
        <Btn>עברו למסלול הזה →</Btn>
      </div>
    </Phone>
  );
}

function PlanDetailB() {
  return (
    <Phone tag="גישה B · 'היום' מול 'החדש'" caption="השוואה ישירה למסלול הנוכחי של הלקוח. ההפרש הכספי הוא הגיבור.">
      <AppBar title="כמה תחסכו" action="" />
      <Body gap={12}>
        <Row gap={10} align="stretch">
          <Card className="flat" style={{ flex: 1, padding: 11, background: "rgba(207,201,186,.18)" }}>
            <span className="lbl-sm">היום אתם משלמים</span>
            <div className="price" style={{ fontSize: 22, marginTop: 6, textDecoration: "line-through", color: "var(--ink-soft)" }}>₪124</div>
            <Bar w="80%" mt={9} /><Bar w="55%" mt={6} />
          </Card>
          <Card className="flat" style={{ flex: 1, padding: 11, borderColor: "var(--accent-ink)", borderWidth: 2.5 }}>
            <span className="lbl-sm" style={{ color: "var(--accent-ink)" }}>המסלול החדש</span>
            <div className="price" style={{ fontSize: 24, marginTop: 6, color: "var(--accent-ink)" }}>₪79</div>
            <Bar w="80%" mt={9} /><Bar w="55%" mt={6} />
          </Card>
        </Row>
        <Card style={{ padding: 14, textAlign: "center", borderColor: "var(--accent-ink)" }}>
          <span className="lbl-sm">החיסכון שלכם בשנה</span>
          <div className="tag-hand" style={{ fontSize: 38, color: "var(--accent-ink)", lineHeight: 1.1 }}>₪540</div>
        </Card>
        <Note brush>הפרש המחיר מול הספק הנוכחי הוא הטריגר החזק ביותר להמרה.</Note>
        <div style={{ flex: 1 }}></div>
        <Btn>כן, אני רוצה לעבור</Btn>
      </Body>
    </Phone>
  );
}

function ScreenPlan() {
  return (
    <Step title="4 · עמוד מסלול בודד" hint="2 כיוונים"
      desc="לאחר שבחרו מסלול. להציג את כל הפרטים בעמוד עשיר, או למקד בהשוואה למה שיש להם היום?">
      <PlanDetailA /><PlanDetailB />
    </Step>
  );
}

Object.assign(window, { ScreenResults, ScreenPlan });
