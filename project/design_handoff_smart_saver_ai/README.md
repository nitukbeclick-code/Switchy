# Handoff: חוסך · Smart Saver — אפליקציית השוואת מחירי תקשורת + AI

> מסמך מסירה לפיתוח ב-Claude Code → FlutterFlow / Flutter. מי שלא היה בשיחה אמור להצליח לממש מתוך מסמך זה בלבד.

---

## 1. Overview
אפליקציית מובייל + אתר רספונסיבי להשוואת מחירים לכל שוק התקשורת בישראל (סלולר, אינטרנט, טלוויזיה, טריפל, חו״ל). מודל עסקי: **לידים**. בידול מרכזי: **ליווי הלקוח יד-ביד עד הניתוק/ניוד מהספק הישן** (אנחנו מסייעים — לא מנתקים). כולל יועץ **AI** שממליץ על מסלול, קהילה, אזור אישי, מחשבונים וכלים.

## 2. About the Design Files
הקבצים בחבילה הם **רפרנס עיצובי שנבנה ב-HTML/React (Babel)** — פרוטוטייפ שמדגים מראה והתנהגות, **לא קוד ייצור להעתקה ישירה**. המשימה: **לשחזר את העיצובים בסביבת היעד** (FlutterFlow / Flutter) לפי הדפוסים שלה. הלוגיקה (פונקציות טהורות) ניתנת לתרגום כמעט 1:1 ל-Dart.

## 3. Fidelity
**High-fidelity (hi-fi).** צבעים, טיפוגרפיה, מרווחים ואינטראקציות סופיים. יש לשחזר פיקסל-פרפקט בעזרת ה-design tokens שבהמשך.

---

## 4. Design Tokens

### צבעים
| Token | Hex | שימוש |
|---|---|---|
| paper | `#F4F0E8` | רקע ראשי (warm cream) |
| paper-2 | `#E9E3D5` | רקע משני / chips |
| card | `#FFFFFF` | כרטיסים |
| ink | `#16241D` | טקסט ראשי |
| ink-2 | `#46574E` | טקסט משני |
| ink-3 | `#7C8A81` | טקסט עמום |
| green | `#15603E` | מותג / CTA |
| green-d | `#0E3A26` | hero כהה |
| green-2 | `#1E7A4F` | גרדיאנט |
| lime | `#C9EC4B` | פופ / חיסכון / accent |
| lime-d | `#A9CE32` | כוכבים |
| line | `#E4DDCE` | קווי הפרדה |
| danger | `#C5533B` | אזהרות / מחיר עולה |

**צבעי קטגוריה** (אייקונים/טאבים): סלולר `#2563EB` · אינטרנט `#0D9488` · טלוויזיה `#7C3AED` · טריפל `#EA580C` · חו״ל `#DB2777`.

**Dark mode** (מתג בפרופיל): paper `#10211A`, card `#16291F`, ink `#EAF0EC`, line `#26402F` (green/lime נשארים).

### טיפוגרפיה
- **Display / מספרים:** Rubik (500–800), letter-spacing ‎-.02em בכותרות.
- **Body / UI:** Assistant (400–800).
- כותרת ראשית ~26–54px, גוף 14–16px, תוויות 11–13px.

### מרווחים / צורה
- Radius: כרטיס 18–26px, כפתור 14–16px, chip 30px (pill).
- צל כרטיס: `0 1px 2px rgba(20,36,29,.05), 0 10px 30px rgba(20,36,29,.07)`.
- כפתור ראשי: גרדיאנט `linear-gradient(135deg,#15603E,#1E7A4F)`, טקסט לבן.
- Hero: גרדיאנט `linear-gradient(135deg,#0E3A26,#12553A,#0B6B49)` + זוהר ליים רדיאלי.
- כיוון: **RTL**. שפות: עברית (ברירת מחדל), English, العربية, Русский.

---

## 5. Data Model (→ Firestore collection `plans`)

כל מסלול:
```
id            string
category      enum: cellular | internet | tv | triple | abroad
provider      string   // שם החברה (תואם ללוגו)
net           string   // רשת/תשתית (למשל "רשת עצמאית")
plan          string   // שם המסלול
price         number|null   // מחיר היכרות/נוכחי לחודש (null = "לפי יעד" וכו')
priceText     string?       // טקסט מחיר כשאין מספר
after         number|null   // מחיר אחרי תקופת ההיכרות (null = קבוע)
term          string   // "ללא" | "12 ח'" | "3 שנים" | "לכל החיים" ...
intro         string?  // הטבת היכרות (למשל "3 חודשים ב-39")
est           boolean  // true=מחיר מייצג(~), false=מאומת ממקור
flags         string[] // 5g, nocommit, fixed, abroad, family, kosher, fiber, g1000, wifi7, stream, netflix, sport, esim, global
best          boolean? // כרטיס מומלץ
feats         [{icon,label}]  // 2–4 תכונות
fine          string   // אותיות קטנות + מקור
rating        number   // 3.8–4.5
reviews       number
updatedAt     timestamp  // לחיווי "עודכן היום" + ניטור פיד
```
מטא-קטגוריה (`current` = חשבון חודשי ממוצע לחישוב חיסכון): סלולר 119 · אינטרנט 140 · TV 130 · טריפל 260.

הקטלוג הנוכחי: ~58 מסלולים מ-13 חברות. מקור אמיתי: פלאפון, סלקום, פרטנר, גולן, 019, בזק, גילת, Triple C, HOT, הוט מובייל, yes, FreeTV. מסומנים `est:true` = מייצגים עד חיבור פיד.

---

## 6. Logic — Pure Functions (תרגום ישיר ל-Dart Custom Functions)

```
planPrice(p)      → (p.price==null) ? p.priceText : (p.est?"~₪":"₪") + fmt(p.price)
planAfter(p)      → (p.after==null) ? null : (p.est?"~₪":"₪") + fmt(p.after)
planSaveYear(p, current?) →
    base = current ?? CATS[p.cat].current
    return max(0, round((base - p.price)*12 / 10)*10)   // 0 אם אין price/base
planCost24(p)     → p.price*12 + (p.after ?? p.price)*12   // "עלות אמיתית ל-24 ח'"
planWarn(p)       → inc=round((after-price)/price*100); inc>=50 ? "המחיר עולה ב-{inc}%" : null
aiPick(queryText) → // מנתח טקסט חופשי → בוחר מסלול
    קטגוריה לפי מילים (אינטרנט/טלוויזיה/טריפל/חו״ל, ברירת מחדל סלולר)
    סינון: חו״ל→flag abroad, משפחה→family, "ללא התחייבות"→nocommit, "5G/מהיר/נפח"→מיון 5g
    בחירה: "זול/חיסכון"→הזול ביותר, אחרת→החיסכון הגבוה ביותר
    return {pick, reason}
```
מיון רשימה: match (best תחילה) · price ↑ · save ↓. סינון: chips לפי `flags`.

---

## 7. Screens / Views (Pages ב-FlutterFlow)

| מסך | תפקיד | רכיבים מרכזיים |
|---|---|---|
| **Onboarding** | פתיחה ממותגת (פעם אחת) | hero כהה, 3 ערכי-ליבה, CTA |
| **Auth** | הרשמה/כניסה | Google/Facebook/Apple, מייל+סיסמה, **Face ID** (אם מופעל) |
| **Home** | מרכז | טיקר הוכחה-חברתית חי, hero חיסכון, **כרטיס AI**, באנר מבצע, רשת קטגוריות (עם ספירה+צבע), כלים (זמינות/כדאיות/מצב), קהילה, שיחה חוזרת, רצועת מותגים |
| **Quiz** | איתור צרכים | 2 שאלות + סליידר תקציב → משפיע על תוצאות |
| **Results** | השוואה | חיפוש, מחוון "כמה משלמים", מיון (match/price/save), filter chips לפי קטגוריה, באנר **"הבחירה החכמה"** (auto), PlanCards (+השוואה/+מתאים לך/+אזהרה), סרגל השוואה צף |
| **PlanDetail** | מסלול בודד | לוגו, hero חיסכון, "מה כלול", בלוק תמחור (היכרות/אחרי/התחייבות/**עלות 24ח'**/הטבה), אזהרת מחיר, מד איכות רשת, **ניטור מחיר** (toggle), שיתוף WhatsApp, CTA דביק |
| **Compare** | צד-לצד | טבלה 2–3 עמודות (לוגו/מחיר/אחרי/התחייבות/חיסכון/דירוג), גלילה אופקית |
| **AI Advisor** | יועץ AI | אווטר גרדיאנט, צ'יפים מוצעים, typing, כרטיס המלצה |
| **Lead** | טופס ליד | שם/טלפון/ספק נוכחי, ולידציה |
| **Success → Tracker** | אישור + מעקב ניתוק | טיימליין (שלב "ליווי ניתוק" מודגש), באנר "מלווים-לא מנתקים", **ערבות שקט**, צ'אט, ניוד |
| **Chat** | נציג חי | בועות agent/me, צ'יפים מהירים |
| **Porting** | ניוד מספר | טופס + העלאת מסמכים + אישור ייפוי כוח |
| **Community** | קהילה | פיד+ערוצים, כרטיסי דיל, badges (צוות/**עבר דרכנו**/עזרה), לייקים, thread, **דירוג ספקים** |
| **Bills** | החשבוניות שלי | סך הוצאה, גרף מגמה, סריקת חשבונית→"בזבוז", מחוון לכל תחום |
| **Account** | אזור אישי | חיסכון מצטבר, בקשות, **סריקה אוטומטית**, קישורים, פיד עדכונים |
| **Profile** | הגדרות | פרטים, סטטיסטיקות, התראות, **שפה**, **מצב כהה**, **Face ID + 2FA**, דשבורד נציג |
| **TwoFA** | אבטחה | QR + קוד 6 ספרות |
| **Tools** | זמינות בכתובת / כדאיות מעבר (קנס יציאה) / מה המצב שלך / שיחה חוזרת |
| **Agent** | דשבורד נציג (דמו) | לידים + ניקוד חם/חמים/פושר |

ניווט תחתון: בית · השוואה · קהילה · המעבר שלי · אזור אישי.

## 8. Interactions & State
- **Router**: state יחיד `screen` + `params` (cat, planId, threadMsg). מעברים: slide קדימה/אחורה, fade בטאבים.
- **App State / Persistence** (localStorage → ב-FF: App State + Firestore/SharedPrefs): screen, cat, planId, data.bills{}, compare[], dark, faceid, twofa, lang, prefs.
- אנימציות: מעבר מסך 0.34s cubic-bezier(.22,.7,.2,1); staggered reveal; typing dots; pop על success. **שים לב:** אל תתנה נראות תוכן באנימציית opacity (transform בלבד) כדי שלא ייעלם אם אנימציות מושהות.
- ולידציות: ליד (שם>1, טלפון≥9 ספרות), 2FA (6 ספרות), ניוד (ת.ז≥8, אישור).

## 9. Assets
- **לוגואים** ב-`assets/logos/*.png` (14): yes, sting, partner, cellcom, ccc, freetv, hotmobile, hot, golan, 019, xphone, bezeq, gilat, nexttv, pelephone. מיפוי שם-ספק→קובץ ב-`proto-ui.jsx` (`LOGO_MAP`) ו-`website.jsx` (`WLOGO`).
- אייקונים: stroke SVG (24×24, currentColor) ב-`proto-ui.jsx` (`ICONS`) — להמיר ל-Flutter Icons / SVG.
- פונטים: Rubik + Assistant (Google Fonts).

## 10. Files (רפרנס)
- `prototype.html` — אפליקציית המובייל (טוען את כל ה-proto-*.jsx).
- `proto.css` — מערכת העיצוב המלאה (tokens + רכיבים).
- `proto-data.jsx` — **קטלוג הנתונים + פונקציות הלוגיקה** (המקור לתרגום Dart).
- `proto-ui.jsx` — אייקונים, Logo, primitives, BottomNav, LOGO_MAP.
- `proto-app.jsx` — router, מסגרת טלפון, state.
- `proto-screens-a…i.jsx` — המסכים (a:בית/שאלון, b:השוואה/מסלול, c:ליד/מעקב/אזור, d:קהילה, e:השוואה/thread/onboarding/auth, f:חשבוניות/דירוג/פרופיל, g:צ'אט/ניוד/נציג, h:כלים/2FA/שיחה, i:AI).
- `website.html` + `website.css` + `website.jsx` — האתר הרספונסיבי.

## 11. FlutterFlow Mapping (תקציר)
- Tokens → **FF Theme** (Colors + Typography).
- `plans` → **Firestore Collection**; ה-PlanCard → **FF Component** עם Firestore query.
- פונקציות סעיף 6 → **Custom Functions (Dart)**.
- UI מורכב (Compare table, AI advisor, מד רשת, אנימציות) → **Custom Widgets (Flutter)**.
- סוכן עדכון מחירים יומי → **Cloud Function מתוזמנת** שכותבת ל-`plans.updatedAt` + סימון `est`/stale.
- ספקים חסומים (Incapsula): API רשמי/אפיליאייט מועדף על סקרייפינג.
