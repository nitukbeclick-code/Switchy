# Runbook — חיבור 050-503-7537 לסוכן (WhatsApp Cloud API)

מטרה: להעביר את המספר העסקי **050-503-7537** (`+972 50-503-7537`) מאפליקציית
WhatsApp בטלפון אל **WhatsApp Cloud API**, כך שהסוכן ה-AI עונה עליו 24/7,
עם השתלטות-אנושית דרך ה-CRM של Switchy. מסלול **A** (מעבר מלא).

> ⚠️ אחרי המעבר, המספר **לא יעבוד יותר כ-WhatsApp רגיל בטלפון** — כל התקשורת
> עוברת דרך Switchy (הסוכן + ה-CRM). זה הצד השני של מטבע "הסוכן הוא המספר".

App = **Switchy Bot** (ה-webhook שלה כבר מחווט נכון). אל תשתמש ב-Switchy AI.

---

## שלב 0 — לפני הכל (5 דק')
- [ ] **גבה צ'אטים** בטלפון: WhatsApp → הגדרות → צ'אטים → גיבוי. (הם לא עוברים ל-API.)
- [ ] ודא שה-SIM של 050-5037537 **פעיל וזמין לקבל SMS/שיחה** — צריך קוד-אימות בשלב 3.
- [ ] בחר **חלון שקט** (לילה/סופ"ש): בין מחיקת-החשבון לסיום-הרישום המספר לא יקבל WhatsApp.

## שלב 1 — אימות-עסק (להתחיל עכשיו — זה ה"long-pole", יכול לקחת ימים)
- [ ] `business.facebook.com` → **Business Settings → Security Center → Business Verification → Start**.
- [ ] חובה כדי לשלוח ללקוחות אמיתיים (לא רק 5 נמעני-בדיקה) ולהעלות מגבלות-הודעות.
- [ ] אפשר להתחיל את זה **במקביל** לשאר השלבים.

## שלב 2 — שחרור המספר מהאפליקציה (רגע לפני הרישום)
- [ ] בטלפון: WhatsApp → הגדרות → **חשבון → מחק את החשבון שלי** → הזן `+972 50-503-7537` → אשר.
- [ ] זה משחרר את המספר כך ש-Meta תאפשר לרשום אותו ל-Cloud API.

## שלב 3 — הוספה ורישום המספר ב-Switchy Bot
- [ ] `developers.facebook.com` → My Apps → **Switchy Bot** → **WhatsApp → API Setup**.
- [ ] **Add phone number** → פרטי פרופיל-עסקי → הזן `+972 50-503-7537`.
- [ ] בחר אימות ב-**SMS או שיחה** → הזן את הקוד שמתקבל על המספר.
- [ ] זה יוצר **WABA אמיתי** (במקום ה-Test WABA) ו-**Phone Number ID חדש** ל-050-5037537.
- [ ] **Display name**: הזן "Switchy" / "חוסך" → שלח לאישור (Meta בודקת; דקות-עד-שעות).

## שלב 4 — Webhook (כבר נכון, רק לאמת)
- [ ] Switchy Bot → **WhatsApp → Configuration**: Callback URL =
      `https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/whatsapp-webhook`,
      ושדה **`messages`** מסומן Subscribed. ודא שה-**WABA החדש מנוי** (בד"כ אוטומטי בעת ההוספה).

## שלב 5 — טוקן קבוע (System User)
- [ ] `business.facebook.com` → **System users → "Switchy Bot Token"** → **Add assets** →
      הוסף את ה-**WABA החדש** + המספר, עם **Full control**.
- [ ] ודא scopes: `whatsapp_business_messaging` + `whatsapp_business_management`.
- [ ] אם הטוקן הישן לא מכסה את ה-WABA החדש → **Generate new token** והעתק אותו (לשלב 6).
      (אל תשתף את הטוקן איתי — אתה מזין אותו ישירות ב-Supabase.)

## שלב 6 — עדכון סודות ב-Supabase (אתה, לבד)
Supabase Dashboard → Project `orzitfqmlvopujsoyigr` → **Edge Functions → Secrets**
(או `npx supabase secrets set ... --project-ref orzitfqmlvopujsoyigr`):
- [ ] `WHATSAPP_PHONE_ID` = **ה-Phone Number ID החדש** של 050-5037537 (מ-API Setup).
      ⛔ להחליף את ה-test הישן `1202423646285095`.
- [ ] `WHATSAPP_TOKEN` = הטוקן עם גישה ל-WABA החדש (אם השתנה).
- [ ] `GRAPH_API_VERSION` = להשאיר `v21.0`.

## שלב 7 — בדיקת קצה-לקצה
- [ ] **מטלפון אחר**, שלח WhatsApp ל-050-5037537 → הסוכן אמור לענות.
- [ ] Supabase → Edge logs (`whatsapp-webhook`): רואים inbound + תשובת הסוכן.
- [ ] שלח "STOP" → נכנס ל-`marketing_suppression`. שלח צילום-חשבון → ניתוח Vision.
- [ ] בדשבורד-Switchy: השיחה מופיעה ב-CRM, וניתן **להשתלט** (bot_enabled=false).

## מלכודות (לדעת מראש)
- **המספר לא יעבוד כ-WhatsApp רגיל בטלפון** אחרי המעבר — מנוהל רק דרך Switchy.
- **אימות-עסק** יכול לקחת ימים → התחל בשלב 1 מוקדם.
- **מגבלות**: מספר חדש מתחיל ב-250 שיחות עסק-יזומות/24ש'; תשובות לפניות-לקוח (מה שהסוכן עושה) — ללא הגבלה בחלון-24ש'. עולה עם איכות.
- **הפיכות**: כדי להחזיר את המספר ל-WhatsApp רגיל — מוחקים מה-API ורושמים מחדש באפליקציה.

## צד-הקוד (אני אעשה בגל אינטגרציית-WhatsApp)
- להסיר את ברירת-המחדל למספר-הבדיקה ב-`_shared/whatsapp.ts` (fail-loud אם `WHATSAPP_PHONE_ID` ריק).
- לחווט `972505037537` כמקור-אמת-יחיד בכל ה-CTA (אתר+אפליקציה) + הודעה מוכנה מותאמת-הקשר.
- פרסונת-הסגירה המקצועית (אבחון → חיסכון-אמת → טיפול-בהתנגדויות → לכידת-ליד+Switch-Autopilot → מסירה לנציג).
</content>
