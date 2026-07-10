# SWITCHY CRM — Workflow בנייה ושדרוג

מסמך עבודה חי לקונסולת ה-CRM (`/crm` באפליקציית ה-web). כל **פרוסה** = יחידת עבודה
אחת שנסגרת ב-**PR אחד + אימות מלא + פריסה** (אם נגעה ב-edge). סימון מצב:
🟢 = אני (Claude) מבצע לבד · 🟡 = דורש פעולה קטנה מהבעלים · 🔴 = חסום/דורש אישור מוצר או אבטחה.

עודכן: 2026-07-10 · בסיס (PRs 116–121) + Backlog גל A מלא (A.1–A.5) + גל B (B.1/B.2/B.3/B.5)
נסגרו (PRs 123–131). קונסולה בת 6 טאבים: סקירה (עם SLA), לידים (חיפוש·מיון·ייצוא·bulk·quick-views·נציג),
פגישות, שיחות (Realtime), אנשי קשר, אנליטיקס (עם לוח מובילים). נותרו: B.4 (🟡) + גל C (🔴).

---

## 0. עקרונות ברזל (must-follow בכל פרוסה)

1. **Admin-only.** כל קריאה/כתיבה עוברת דרך פונקציית edge שמאמתת `requireAdmin` →
   `profiles.is_admin` (`_shared/admin.ts`). ה-gate ב-UI (`useAuth().profile.is_admin`)
   הוא ל-UX בלבד — השרת מאמת שוב, fail-closed.
2. **הדפדפן לא נוגע ב-PII ישירות.** לעולם לא `select` על `leads` / `whatsapp_*` /
   `lead_events` מהלקוח (ה-lockdown של PR #107 מסתיר את כל עמודות ה-PII ממפתחות
   anon/authenticated). הכול דרך `crm-api` (service_role).
3. **DTO עם allowlist.** כל תשובה שמחזירה שורת DB עוברת shaper שממפה **רק** שדות
   מותרים (ראו `shapeLeadDetail`/`shapeLeadEvent` ב-`crm_logic.ts`). `source_ip`
   ועמודות פנימיות **לעולם** לא נחשפות. לכל shaper חדש — הוסף טסט allowlist.
4. **כל כתיבה מבוקרת.** אחרי כל mutation: שורת `lead_events` (ציר זמן) + `logAudit`
   ל-`security_audit_log` עם `admin.uid` המאומת (Reg.13). ה-uid מגיע מה-JWT, לא מהגוף.
5. **אמת בלבד.** מספרים אמיתיים מהקטלוג/DB; `clamp` על סכומים (חיסכון 0..100000)
   כדי שטעות-הקלדה לא תיצור נתון כוזב; ספק מנורמל-או-מושמט, לעולם לא מנוחש.
6. **שימוש חוזר.** design tokens + `ui.tsx` primitives; שכבת data אחת
   (`web/lib/crm-admin.ts`, במתכונת `community-admin.ts`). לא לשכפל.

## 1. תהליך פרוסה (per-slice loop)

1. **Explore** (read-only) — הבן את ה-schema/פונקציה הרלוונטית לפני כתיבה.
2. **Plan** — הגדר **פרוסה אחת** קטנה ובעלת ערך.
3. **Build** — קודם ה-edge (action חדש ב-`crm-api` עם אותו gate + validate + audit),
   ואז ה-web (data layer → component → חיווט לתוך `CrmConsole`/drawer).
4. **Validate** — כל השערים (סעיף 2).
5. **PR** — draft, **פרוסה אחת = PR אחד** (קטן ובר-סקירה).
6. **Merge → Deploy** — אם היה שינוי edge: פרוס `crm-api` דרך `deploy-functions.yml`
   ואמת ב-`get_logs` + `execute_sql`. web-only → אין פריסה.

## 2. שערי אימות (להריץ בכל פרוסה)

| שכבה | פקודות |
|------|--------|
| Web (types) | `cd web && npx tsc --noEmit` → נקי |
| Web (build) | `npm run build` → ✓ Compiled successfully |
| Web (tests) | `npx vitest run <touched files>` → ירוק |
| Edge (types) | `cd supabase/functions && deno check --import-map=/tmp/importmap.json crm-api/index.ts` |
| Edge (tests) | `deno test --allow-env --allow-net --allow-read --import-map=/tmp/importmap-tests.json tests/crm_api_test.ts` |
| Deploy edge | Actions → "Deploy edge functions" → `function: crm-api` → אמת `get_logs` |

> **הערה:** `ci.yml` בונה/בודק **Flutter + deno בלבד** — הוא לא בונה את אפליקציית ה-Next
> (`web/`). לכן web-only מאומת ע"י `next build` מקומי + תצוגת Vercel. (מכסת deploy
> יומית של free-tier ב-Vercel עלולה לחסום תצוגות — זו מגבלת חשבון, לא הקוד.)

## 3. מפת קבצים

| תפקיד | קובץ |
|-------|------|
| Route (server shell, noindex) | `web/app/crm/page.tsx` |
| Shell + tab-nav + admin gate | `web/components/crm/CrmConsole.tsx` |
| מדורים | `web/components/crm/{CrmDashboard,CrmLeads,CrmLeadDrawer,CrmCallBrief,CrmInbox,CrmAnalytics}.tsx` |
| Primitives משותפים | `web/components/crm/ui.tsx` |
| שכבת data (source-of-truth) | `web/lib/crm-admin.ts` |
| Edge — CRM | `supabase/functions/crm-api/{index.ts,crm_logic.ts}` |
| Edge — מטריקות / תדריך | `supabase/functions/{admin-metrics,rep-brief}/` |
| Auth | `_shared/admin.ts` (`requireAdmin`) · web `lib/auth-context.tsx` |
| פריסה | `.github/workflows/deploy-functions.yml` (crm-api כבר ברשימה) |
| טסטים | `supabase/functions/tests/crm_api_test.ts` · `web/components/crm/__tests__/` |

`crm-api` actions קיימות: `overview`, `listConversations`, `getThread`, `sendReply`,
`takeOver`, `handBack`, `setContactStatus`, `setLeadStatus`, `listLeads`,
`getLeadDetail`, `addNote`, `recordSaving`, `claimLead`.

---

## 4. מה כבר נבנה (✅ הבסיס — PRs 116–121)

| # | פרוסה | PR | תוכן |
|---|-------|----|------|
| S1 | ✅ יסודות + Dashboard + Leads | #116 | route, shell, admin gate, KPIs צנרת, טבלת לידים |
| S2 | ✅ מגירת פרטי ליד + סטטוס | #117 | `getLeadDetail` + allowlist shapers (נבדק), drawer, שינוי שלב |
| S3 | ✅ תיבת WhatsApp | #118 | רשימת שיחות, שרשור, תשובה, השתלטות/החזרה |
| S4 | ✅ Won-flow | #119 | `addNote` / `recordSaving` (סוגר כ-won) / `claimLead` |
| S5 | ✅ אנליטיקס | #120 | משפך, הצלחת כלים, יומן ביקורת, בריאות cron |
| S6 | ✅ תדריך שיחה + טסטים | #121 | `rep-brief` במגירה, `crm-ui.test.tsx` |

---

## 5. Backlog מתועדף — הפרוסות הבאות

### גל A — שיפורים מהירים (Tier 1 · low risk · 🟢)

| # | פריט | מצב | פירוט |
|---|------|-----|--------|
| A.1 | ✅ **פיד פעילות Realtime** | בוצע 2026-07-10 (PR #131) | hook `useCrmEvents` (fail-soft) נרשם ל-INSERT על `crm_events` (Realtime, RLS admin, בפרסום `supabase_realtime`) → רענון **שקט** (בלי הבהוב) של הסקירה (Dashboard) ותיבת ה-WhatsApp (Inbox: רשימה + שרשור פתוח). מראה: Flutter `crmEventStream()` + `CommunityFeed` channel. |
| A.2 | ✅ **חיפוש + מיון לידים** | בוצע 2026-07-10 | `listLeads` הורחב (search in-memory שם/טלפון + sort recent/oldest); סרגל חיפוש (debounced) + מיון בטבלת הלידים. |
| A.3 | ✅ **Speed-to-lead / SLA** | בוצע 2026-07-10 (PR #125) | action חדש `slaMetrics` (זמן-תגובה חציוני + ממתינים למענה + חריגות SLA), משתמש חוזר ב-`medianMinutes` (`_shared/digests.ts`) ו-`SLA_HOURS` (`lead-digest/lib.ts`) — אותו מקור-אמת של דיגסט/נאדג׳ הטלגרם. סקשן "מהירות טיפול" ב-Dashboard (best-effort, fail-soft). |
| A.4 | ✅ **ייצוא CSV של התצוגה** | בוצע 2026-07-10 (PR #124) | כפתור "ייצוא CSV" שמוריד את התצוגה הנוכחית כ-CSV בדפדפן-המנהל (ללא endpoint חדש). `lib/csv.ts` עם שמירה מפני CSV-injection (נטרול נוסחאות) + RFC-4180 quoting + UTF-8 BOM; נבדק ב-`lib/__tests__/csv.test.ts`. |
| A.5 | ✅ **תצוגות/פילטרים שמורים** | בוצע 2026-07-10 (PR #128) | שורת quick-view לפי טווח יצירה (הכול/24ש׳/7 ימים/30 יום) מעל טבלת הלידים, סינון client-side על השורות שכבר נטענו (`lib/date-range.ts` `withinRange`, נבדק). מחובר לספירה/ייצוא/בחירה-מרובה. ("שלי" יגיע עם B.3 — נציג/claimed_by.) |

### גל B — יכולות ניהול (Tier 2 · medium · 🟢/🟡)

| # | פריט | מצב | פירוט |
|---|------|-----|--------|
| B.1 | ✅ **טאב פגישות** | בוצע 2026-07-10 (PR #127) | actions חדשות `listMeetings`/`getMeeting`/`setMeetingStatus` על `meetings`+`meeting_events` (allowlist DTO `shapeMeeting`/`shapeMeetingDetail`/`shapeMeetingEvent` — נבדקו; email/join_url רק בפירוט, gcal/tg-id לעולם לא). טאב "פגישות" חדש: רשימה מסוננת + מגירת פרטים (קישור Zoom + שינוי סטטוס + timeline). כל שינוי סטטוס מבוקר (`meeting_events` + `security_audit_log`). |
| B.2 | ✅ **פעולות מרובות (bulk)** | בוצע 2026-07-10 (PR #126) | בחירה-מרובה בטבלת/כרטיסי הלידים (checkbox + "בחר הכול") → העברת שלב מרובה (יצירת-קשר/אבוד; `won` נשאר בזרימת המגירה). כל כתיבה = אותו `setLeadStatus` מבוקר, מפוזר בגלים חסומי-מקביליות (`lib/batch.ts` `runChunked`, נבדק). |
| B.3 | ✅ **תצוגת נציג + לידרבורד** | בוצע 2026-07-10 (PR #130) | action חדש `repLeaderboard` (אגרגציה `aggregateReps` pure+נבדקת: claimed/won/lost + חיסכון-שנרשם-אמיתי מלידי won בלבד). לוח-מובילים ב-Analytics; `claimedBy` נוסף ל-DTO של listLeads → עמודת "נציג" + סינון-נציג client-side + נציג ב-CSV. |
| B.4 | ✅ **עריכת `leads.notes`** | בוצע 2026-07-10 (PR #132) | action `setLeadNote` — דורס את שדה ההערה הראשי + רושם כל שמירה ל-`lead_events` (event=`note_edit`) ול-`security_audit_log` (PII-light: אורך+preview), כך שההיסטוריה נשמרת בציר-הזמן. עריכה במגירה (textarea + "שמור הערה ראשית"). **החלטה:** היסטוריה נשמרת דרך ה-audit trail. |
| B.5 | ✅ **ניהול אנשי קשר (contacts)** | בוצע 2026-07-10 (PR #129) | action חדש `listContacts {status?,search?}` (allowlist `shapeContact` — נבדק; wa_id/עמודות פנימיות לא דולפות). טאב "אנשי קשר": רשימה מסוננת + חיפוש + בורר-סטטוס לכל שורה (מחזור-חיים 7 שלבים) דרך `setContactStatus` הקיים (מבוקר). |

### גל C — דורש אישור מוצר/אבטחה (Tier 3 · 🔴)

| # | פריט | מצב | פירוט |
|---|------|-----|--------|
| C.1 | ✅ **תצוגת לידים לשיתוף (קריאה-בלבד)** | בוצע 2026-07-10 (PR #140, באישור בעלים) | טאב "לידים לשיתוף": action `listSellableLeads` — **רק** לידים עם `consent_share_at` (מגן כפול: query `not.is.null` + `isSellable` מ-`lead-export/lib.ts`), allowlist DTO `shapeSellableLead` (ללא source_ip/notes — נבדק), **audit** לכל צפייה (`crm_lead_export`). **קריאה-בלבד** — לא דוחף לרוכש; ה-cron ה-secret-gated נשאר הנתיב היחיד לרוכש. הערה משפטית ב-UI (§7b/DPA באחריות הבעלים). |
| C.2 | 🟡 **הרשאות ברמת נציג** | **בסיס נבנה** — [`docs/CRM_C2_ROLES_PLAN.md`](./CRM_C2_ROLES_PLAN.md); אימות פרוד §6 עבר (2026-07-10) | טבלת `crm_members` ייעודית (option B: RLS-on, ללא policies ל-anon/authenticated, grants מבוטלים) + `requireCrmAccess` fail-closed (is_admin superset) + gating פר-action ב-crm-api + actions `listMembers`/`setMemberRole` (admin-only, audited, מסרב שינוי-עצמי) + טסטים. **T1 (self-elevation) סגור מבנית.** נותר: **rollout ע"י הבעלים** (החלת המיגרציה + פריסת crm-api) + **PR2: טאב "צוות והרשאות"** ב-web. |
| C.3 | 🔴 **קמפיינים/תבניות WhatsApp יוצאות** | §30A consent gating | שליחה יזומה מרובה — חייב שער הסכמה שיווקי + אישור משפטי. |

---

## 6. מלכודות (gotchas)

- **פריסת edge:** `crm-api` כבר ברשימת `deploy-functions.yml`. **function חדש → הוסף
  אותו** ל-choice options **וגם** ל-loop של `all`.
- **Concurrency:** ל-`deploy-functions.yml` יש `concurrency group` — הפעלת כמה ריצות
  ברצף **מבטלת את זו שבאמצע**. פרוס **פונקציה אחת בכל פעם** ווודא success לפני הבאה.
- **Middleware של desktop:** נתיב Next ללא `.html` twin מוגש ב-desktop (כמו `/crm`).
  נתיב חדש → ודא שאין תאום סטטי (`site/<name>.html`).
- **stub של `@std/assert` מקומית** משווה ב-`JSON.stringify` (רגיש-לסדר) — טסטים בסגנון
  `auditDetail` "נכשלים" מקומית אך **עוברים ב-CI** (deep-equal אמיתי). אל תתקן אותם.
- **Vercel free-tier:** מכסת deploy יומית — תצוגות עלולות לא להיבנות. אמת מקומית.

## 7. Definition of Done (לכל פרוסה)

- ✅ כל שערי האימות ירוקים (סעיף 2).
- ✅ אין חשיפת PII חדשה; ל-DTO חדש יש טסט allowlist.
- ✅ כל כתיבה מבוקרת (`lead_events` + `security_audit_log`).
- ✅ PR ממוזג · edge נפרס ואומת (אם רלוונטי) · המסמך הזה עודכן (✅ + מספר PR).
