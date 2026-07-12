# SWITCHY — מפת הפרויקט (PROJECT_MAP)

מסמך "מה קיים" קנוני לכל הריפו — תשעה תחומים, ~341 רכיבים ממופים. המסמך מתאר
**מצב קיים בלבד**; רעיונות שדרוג ותעדוף חיים במסמך תכנית נפרד, לא כאן.

מיפוי: 2026-07-10 · מקרא מצב: `solid` = יציב · `needs-polish` = עובד אך דורש ליטוש ·
`stale` = התיישן/מת · `unknown` = לא ניתן לאימות מהריפו.

---

## TL;DR — כל המערכת בעשר שורות

1. **שני אתרים:** אתר סטטי (`site/`, switchy-ai.com) — 285 עמודים מיוצרים ע"י גנרטור Node יחיד ללא תלויות (`build.js`) + `index.html` ידני, נבנה מחדש כל 30 דק' מ-`public.plans` החי; ואפליקציית **Next.js** (`web/`) עם ~60 ראוטים — מובייל מקבל אותה, דסקטופ מנותב לאתר הסטטי ע"י middleware.
2. **אפליקציית Flutter** (`lib/`, ~65k LOC): 40 עמודים מאחורי StatefulShellRoute, ~35 שירותים טהורים עם seam של Local/Supabase backend, ~905 טסטים.
3. **סוכן WhatsApp:** webhook עם שרשרת שערים מלאה (HMAC, dedup, §30A, takeover) → מוח agent משותף (`_shared/agent.ts`) עם 12 כלים מקורקעים בקטלוג.
4. **שלושה בוטים בטלגרם:** בוט צוות (CRM מלא בצ'אט + Mini App), בוט לקוחות ציבורי (אותו agent), ובוט קישור פרופילים; בנוסף דיגסטים ותזכורות ב-cron.
5. **26 edge functions** + ספריית `_shared` בת 41 מודולים (21k LOC) — כל צד-השרת: AI לאתר, צינור לידים/פגישות, קהילה, ציות, ניטור.
6. **DB:** ‏`schema.sql` קנוני + ~87 קבצי מיגרציה ידניים; דומיינים: לידים, פגישות Zoom, CRM של WhatsApp/Telegram, קהילה, קטלוג ומחירים, ציות (§30A/תיקון 13), אבטחה וניטור.
7. **זרימת קטלוג:** נכתב ידנית ב-Dart‏ (`lib/data/`) → מיוצא ל-`site/data/plans.json` + seed ל-`public.plans` — **ה-DB הוא המקור הסמכותי**; שלושת הצרכנים (Flutter, אתר, web) קוראים live-first עם fallback שלעולם-לא-ריק.
8. **אוטומציה:** ‏`ci.yml` (Flutter + Deno), ‏`rebuild-static.yml` (כל 30 דק'), ‏`deploy-functions.yml`, ‏`bot-health.yml` + ~10 עבודות pg_cron.
9. **CRM console** בן 8 טאבים ב-web (admin-only, כל ה-PII דרך edge בלבד) + קהילה מלאה (פיד, מדיה, ריאקציות, מודרציה) + auth‏ (OAuth + email).
10. **עקרון בית:** אמת בלבד — אין מספרים מומצאים, אגרגציות מאחורי ספי פרסום, RLS ממושמע, וכל כתיבה רגישה מבוקרת (audit).

---

## 1. אתר סטטי (`site/` — switchy-ai.com)

**תקציר:** גנרטור Node יחיד ללא תלויות (`site/build.js`, ‏5,472 שורות) מייצר 285 עמודי
HTML + ‏`index.html` ידני: 5 עמודי קטגוריה, 18 אוספים, 4 מחשבונים, 3 עמודי versus
מושגיים, 69 עמודי ראש-בראש בין ספקים, 18 עמודי ספק, 150 מדריכים, עמודי חוק/המרה,
sitemap/robots/llms.txt/ai.txt. הנתונים נקראים **חיים** מ-`public.plans` בזמן build עם
`data/plans.json` (120 מסלולים) כ-fallback; Action בונה מחדש כל 30 דק' ו-Vercel פורס.
שכבת הלקוח (`script.js`, ‏3,753 שורות + `translate-runtime.js`) מספקת ~40 פיצ'רים.
איכות גבוהה במיוחד (truth-only, JSON-LD בכל מקום, נגישות לפני first paint); הקצוות:
README מיושן, קונפיגי deploy כפולים שנסחפו, CSS/JS לא ממוזערים (277KB/197KB),
עמודי רשימה כבדים (plans.html 523KB), churn של lastmod ב-sitemap.

| שם | נתיב | תפקיד | מצב |
|-----|------|--------|------|
| Build generator core | `site/build.js` | מייצר כל עמוד, מוחק עמודים שיצאו מהסט, מטביע ?v= hashes ו-provenance | solid |
| Live catalogue data layer | `site/build.js` (שורות 42–350) | קריאת public.plans + ratings בזמן build (anon key, 8s timeout), נרמול, fallback ל-plans.json | solid |
| דפי קטגוריה / אוספים / מחשבונים / versus (x30) | `build.js page()/collectionPage()/calculatorPage()/versusPage()` | 5 נחיתות קטגוריה, 18 אוספים מסוננים (סף ≥3 מסלולים), 4 מחשבוני חיסכון, 3 השוואות טכנולוגיה | solid |
| דפי ספקים + ראש-בראש (x87) | `build.js providerPage()/providerVsPage()` | 18 עמודי ספק (צבע מותג, דירוג קהילה חי) + 69 זוגות versus (15 ידניים + אוטו') | solid |
| מדריכים (x150) + אינדקס | `build.js guides + content/guides/*.json` | מערכת מאמרי SEO — הוספת JSON = מאמר חדש; TLDR, FAQ, ‏Article JSON-LD | solid |
| FAQ hub / glossary / how-it-works | `build.js faqPage()/glossaryPage()/howItWorksPage()` | ריכוז כל השו"ת + דה-דופ ל-FAQPage JSON-LD אחד; עמודי evergreen | solid |
| עמודים סטטיים/משפטיים (x5) | `build.js staticPages` | about, privacy, terms, account-deletion, accessibility — תוכן משפטי מוגן guardrail | solid |
| עמודי hub/המרה (x12) | `build.js plansPage()/dealsPage()/comparePage()...` | קטלוג מלא, deals, השוואה צד-לצד, hub השוואות, mirror קהילה, הזמנת Zoom, עמוד אפליקציה | solid |
| 404 + sitemap/robots/llms.txt/ai.txt | `build.js` (שורות 5158–5364) | ‏404 ממותג; sitemap מתועדף עם lastmod, ‏robots עם 14 בוטי AI, ‏llms.txt עם מספרים אמיתיים | solid |
| תבנית עמוד משותפת + head() | `build.js head()/jsonLd/iconSprite` | canonical/hreflang/OG, שומרי theme+a11y לפני paint, ‏GA4 Consent Mode v2, ‏JSON-LD, ‏SVG sprite | solid |
| דף בית ידני + צעד סנכרון | `site/index.html + build.js` (5368–5469) | העמוד הידני היחיד; ה-build מזריק hashes, ‏__HERO_PLANS__, ‏deal-ticker ו-provenance | solid |
| ניווט + mega-menu + hero finder | `site/script.js` | nav דביק, תפריט מובייל נגיש, mega-menu מדריכים; widget "תשובה ב-10 שניות" + ticker דילים | solid |
| טופס ליד + שיתוף הפניה | `site/script.js` (258–496) | ולידציה ישראלית, honeypot, שער הסכמה §30A עם חותמות — נתיב PII מוגן guardrail | solid |
| כלי עיון במסלולים | `site/script.js` | פילטרים, מגש השוואה (עד 3), צד-לצד עם URL params, price-watch, badge ירידת מחיר אמיתית | solid |
| ווידג'טים של AI | `site/script.js` | צ'אט, Plan Advisor צף, Bill Analyzer עם גרירת תמונה, הרשמה — הכול fail-soft מול ה-edge | solid |
| mirror קהילה + הזמנת Zoom | `site/script.js` (1631–2451) | פיד קהילה לקריאה, לוח מובילים, זרימת הזמנת פגישה אנונימית | solid |
| theme + cookie consent + a11y widget | `site/script.js` (2742–3089) | מצב כהה, באנר GA4 ‏(default denied), ווידג'ט נגישות בן 6 בקרות (ת"י 5568) | solid |
| Translation runtime (16 שפות) | `site/translate-runtime.js` | ‏SwitchyI18n — תרגום עמוד מלא on-demand דרך edge fn ‏translate; זהה בייט-לבייט ל-web | solid |
| שכבת אנימציה | `site/script.js` | scroll reveal, מונים, גרפי SVG, ‏tilt, ‏parallax — הכול מכבד reduced-motion | solid |
| Stylesheet | `site/styles.css` | ‏277KB יחיד: טוקנים, dark mode מלא, מחלקות a11y-*, ‏RTL logical properties | solid |
| נכסים (לוגואים, פונטים, OG) | `site/assets/`, `og-card.html` | 18 לוגואי ספקים, ‏Rubik/Assistant self-hosted, ‏og-image מ-headless Chrome | needs-polish |
| קונפיגי deploy | `site/vercel.json`, `netlify.toml`, `_headers` | ‏Vercel חי (headers + cache); ‏netlify/_headers עותקים מקבילים שנסחפו | needs-polish |
| אוטומציית rebuild | `.github/workflows/rebuild-static.yml` | ‏cron כל 30 דק' + webhook מה-DB; ‏commit של פלטים בלבד → redeploy | solid |
| נתונים ותוכן ארוזים | `site/data/plans.json`, `site/content/guides/` | snapshot אחרון-ידוע-כטוב (120 מסלולים) + 142 מדריכי JSON | solid |
| Site README | `site/README.md` | תיעוד המדריך לתיקייה | stale |

**נקודות תורפה**
- `site/README.md` — עדיין מתאר "landing page ללא build" תחת המיתוג הישן; קודם ל-build.js, ל-285 העמודים ולדומיין switchy-ai.com.
- קונפיגי deploy כפולים: ה-CSP של `netlify.toml` חסר את דומייני GA שיש ב-`vercel.json` — ‏GA4 יישבר בשקט בפריסת Netlify.
- נכסים: ‏`assets/logos/partner.png` ו-`hot-mobile.png` כפולים שאינם בשימוש; ‏`og-card.html` עדיין טוען פונטים מ-CDN של Google בעוד האתר self-hosted.

---

## 2. אפליקציית ה-web — משטח ציבורי (`web/`)

**תקציר:** אפליקציית Next.js‏ (App Router) עברית-תחילה, RTL, מובייל-תחילה, מאחורי
middleware שמפצל לפי מכשיר (דסקטופ → האתר הסטטי). ~60 ראוטים ציבוריים: בית,
‏hub השוואות + מטריצת ערים גיאוגרפית, 24 נחיתות קטגוריה על רכיב משותף אחד, עמודי
מסלול/ספק/versus, כלי חיסכון אינטראקטיביים, תוכן וסמכות, עמודים משפטיים, ותשתית
SEO/GEO כבדה. ‏13 ראוטי API בעמדה אחידה (origin allow-list, מפתח service-role בשרת
בלבד, שערי אמת, fail-soft). ~60 קומפוננטות משותפות. ‏65 קבצי טסט / 638 טסטים ירוקים.

| שם | נתיב | תפקיד | מצב |
|-----|------|--------|------|
| Root layout + תשתית (error/404/loading) | `web/app/layout.tsx` | פונטים, שומרי theme+a11y, ‏GA4 Consent Mode v2, ‏skip-link, גבולות שגיאה | solid |
| Device-split middleware | `web/middleware.ts` | דסקטופ → rewrite לאתר הסטטי; מובייל → האפליקציה; ‏Vary: User-Agent | solid |
| דף הבית | `web/app/page.tsx` | hero משגר קטגוריות עם עוגני מחיר אמיתיים, טיזרים, ‏FAQ, טופס ליד | solid |
| Compare hub + ערים | `web/app/compare/` | ‏/compare → ‏[service] → ‏[city]‏ (~6 שירותים × ~42 ערים) עם schema גיאוגרפי אמיתי | solid |
| נחיתות קטגוריה (x24) | `web/app/cellular/... ` | ‏5 קטגוריות + 19 פרוסות long-tail — כולן על CategoryLanding משותף מעל הקטלוג | solid |
| ‏/plans + ‏/plans/[id] | `web/app/plans/` | ‏hub מחירים + עמוד מסלול עשיר (מפרט, עמלות, אותיות קטנות, ‏Product/Offer JSON-LD) | solid |
| ‏/providers + ‏/vs/[pair] + ‏/switch/[provider] | `web/app/providers/`, `vs/`, `switch/` | עמודי ספק, ראש-בראש עם פסק-דין מנתונים, מדריכי יציאה עובדתיים | solid |
| כלים אינטראקטיביים | `web/app/{quiz,wallet,bills,negotiate,street-prices,switch-kit}/` | שאלון התאמה, ארנק טלקום, ‏OCR חשבונית, מאמן מו"מ, מחירי רחוב, ערכת מעבר | solid |
| Market pulse | `web/app/market-pulse/page.tsx` | תמונת מצב שוק פר קטגוריה, גרפי SVG ‏SSR, ‏Dataset JSON-LD | needs-polish |
| הזמנת Zoom‏ /book | `web/components/BookClient.tsx` | הזמנה ב-4 שלבים עם אימות email-OTP מול meeting-book | solid |
| ‏/referral + ‏/rights | `web/components/ReferralCard.tsx`, `RightsForm.tsx` | קוד הפניה אמיתי; טופס בקשות מידע (intake בלבד) | solid |
| עמודים משפטיים + תוכן/סמכות | `web/app/{privacy,terms,guides,glossary,faq,about}/...` | ‏privacy/terms/נגישות/שקיפות + ‏~150 מדריכים, מילון מונחים, ‏FAQ | solid |
| ‏/design + ‏/auth/callback | `web/app/design/`, `auth/callback/` | ‏styleguide חי (noindex); נחיתת PKCE ל-OAuth | solid |
| פידי SEO/GEO טקסטואליים | `web/app/{llms.txt,ai.txt}/route.ts`, `robots.ts` | ‏llms.txt, ‏ai.txt, ‏llm-context.txt, רשימת בוטי AI | needs-polish |
| Sitemap | `web/app/sitemap.ts` | ‏ISR — כל hub/עיר/ספק/מדריך/מונח + permalinks של הקהילה | needs-polish |
| LLM semantic feed | `web/app/_lib/llm-feed.ts` | בונה משותף ל-‏/api/llm-feed — הקשר שוק, קישורים, בחירות best-for אמיתיות | solid |
| ראוטי API‏ (x13) | `web/app/api/*/route.ts` | ‏lead, ai-chat, analyze-bill, recommend, negotiate, price-history, push, referral, rights, street-price, switch-kit, wallet-stats — עמדה אחידה, כולם נבדקים | solid |
| SiteHeader + SiteFooter | `web/components/SiteHeader.tsx` | ‏masthead דביק (ניווט, CTA, ‏theme, שפה, חשבון, ‏a11y) + footer גלובלי | solid |
| מערכת תצוגת השוואה | `web/components/ComparisonTable.tsx` | מערכת רינדור המסלולים האחת: כרטיסים במובייל / טבלה סמנטית בדסקטופ | solid |
| LeadForm (+lazy/sticky) | `web/components/LeadForm.tsx` | לכידת ליד רב-שלבית עם שערי הסכמה; המרה רק לאחר הצלחה מאושרת | solid |
| AiConcierge | `web/components/AiConcierge.tsx` | פאנל צ'אט AI מקורקע מה-header, שלב ליד עם הסכמה, גילוי §7ב | needs-polish |
| רכיבי ציות | `web/components/{CommissionDisclosure,PriceCaveat,ConsentBanner,AccessibilityWidget}.tsx` | גילוי §7ב, הסתייגות §17, באנר consent, ווידג'ט נגישות מתמיד | solid |
| שכבת AEO/E-E-A-T | `web/components/SgeSummary.tsx` ועוד | ‏SgeSummary, ‏AeoAnswerBlock, ‏FactCheckBadge, ‏JsonLd, ‏LlmDataFeed... — בלוקים למנועי תשובות | solid |
| רכיבי עזר (~20) | `web/components/Icon.tsx` ועוד | אייקונים, ‏Money, לוגואי ספקים, ‏skeletons, גרפים, ‏PwaInstaller, ‏AuthModal ועוד | solid |

**נקודות תורפה**
- `sitemap.ts` — מקיף, אבל משמיט את עמודי `/plans/[id]` לגמרי (הם indexable עם JSON-LD מלא).
- רשימת בוטי ה-AI משוכפלת ידנית בין `robots.ts` ל-`ai.txt/route.ts` עם הערת "keep in sync" — אין קבוע משותף.
- `AiConcierge` — מונוליט של 39KB; ההערה הפנימית מודה שה-focus trap הוא "focus trap-ish" (‏Tab בורח מהפאנל).
- `/market-pulse` מייבא SmartTimer בצורה eager בעוד הבית משתמש ב-SmartTimerLazy לאותו מיקום מתחת לקפל.
- דף הבית עדיין מייבא את ה-alias המיושן `AiSummary` (הצרכן האחרון של קובץ ה-back-compat).

---

## 3. ‏web — קונסולת CRM, קהילה ו-auth

**תקציר:** משטח תלת-חלקי בשל ומודע-אבטחה. ‏(1) קונסולת CRM בת 8 טאבים
(‏/crm?tab=…): סקירה, לידים, פגישות, שיחות WhatsApp, אנשי קשר, לידים-לשיתוף, צוות,
אנליטיקס — כל קריאה/כתיבה דרך crm-api/admin-metrics/rep-brief עם אימות אדמין בשרת;
הדפדפן לא נוגע ב-PII. ‏(2) קהילה: פיד עם Realtime, קומפוזר עם מדיה וקול, כרטיסי
פוסט מלאים, פעמון התראות, פרופילים, תור מודרציה — כל הגישה מרוכזת ב-`lib/community.ts`.
‏(3) ‏Auth: ‏AuthProvider, ‏AuthModal‏ (OAuth + email), ‏callback עם הגנת open-redirect.
הקצוות: חוסר עקביות ARIA בין טאבים, ‏N+1 בהידרציית הפיד, ‏4 עותקי focus-trap.

| שם | נתיב | תפקיד | מצב |
|-----|------|--------|------|
| שכבת data של ה-CRM | `web/lib/crm-admin.ts` | השער היחיד לדפדפן מול crm-api/admin-metrics/rep-brief; ‏DTOs מוקלדים; ‏crmPost לעולם לא זורק | solid |
| CrmConsole + ‏ui primitives | `web/components/crm/CrmConsole.tsx`, `ui.tsx` | שער UX לאדמין + ניווט 8 טאבים (ARIA תקין); מפות סטטוסים, ‏Pill, ‏StatCard | solid |
| CrmDashboard + useCrmEvents | `web/components/crm/CrmDashboard.tsx`, `web/lib/use-crm-events.ts` | ‏KPI צנרת + SLA + שיחות אחרונות; ריענון שקט דרך Realtime על crm_events | solid |
| CrmLeads + drawer + תדריך שיחה | `web/components/crm/CrmLeads.tsx`, `CrmLeadDrawer.tsx`, `CrmCallBrief.tsx` | צנרת לידים מלאה (חיפוש/מיון/CSV/bulk) + מגירת פרטים + תדריך rep-brief מקורקע | solid |
| CrmMeetings + drawer | `web/components/crm/CrmMeetings.tsx`, `CrmMeetingDrawer.tsx` | רשימת הזמנות Zoom לפי סטטוס + מגירת פרטים עם timeline | needs-polish |
| CrmInbox | `web/components/crm/CrmInbox.tsx` | תיבת WhatsApp: רשימה + שרשור, תשובה, takeover/hand-back, ‏Realtime | needs-polish |
| CrmContacts | `web/components/crm/CrmContacts.tsx` | לוח מחזור-חיים של אנשי קשר; שינוי סטטוס פר שורה | needs-polish |
| CrmSellableLeads + CrmTeam | `web/components/crm/CrmSellableLeads.tsx`, `CrmTeam.tsx` | פיד קריאה-בלבד של לידים עם consent_share_at (מבוקר) + ניהול תפקידי viewer/rep | solid |
| CrmAnalytics | `web/components/crm/CrmAnalytics.tsx` | לוח מובילים, משפך, הצלחת כלים, בריאות cron, יומן ביקורת | needs-polish |
| טסטים ל-CRM | `web/components/crm/__tests__/crm-ui.test.tsx` | כיסוי ה-primitives המשותפים ומפות הסטטוסים | solid |
| Auth context + callback | `web/lib/auth-context.tsx`, `web/app/auth/callback/` | ‏session + שורת profiles + backfill מ-OAuth; ‏PKCE polling עם הגנת redirect | solid |
| AuthModal | `web/components/auth/AuthModal.tsx` | ‏Google/Facebook + email/password עם הסכמות תנאים/פרטיות/שיווק | needs-polish |
| שכבות data של הקהילה | `web/lib/community.ts`, `community-admin.ts` | הגישה היחידה ל-Supabase‏ (JWT → RLS): פיד, חיפוש, פוסטים, ריאקציות, התראות, פרופילים; שער מודרציה | solid |
| CommunityFeed | `web/components/community/CommunityFeed.tsx` | האורקסטרטור: ערוצים, מיון, חיפוש, ‏Realtime buffering, גלילה אינסופית | needs-polish |
| PostCard | `web/components/community/PostCard.tsx` | כרטיס פוסט מלא: לייק, סימנייה, ריאקציות, שיתוף, דיווח, עריכה, הצמדה | needs-polish |
| PostComposer | `web/components/community/PostComposer.tsx` | כתיבת פוסט: ערוץ, ‏@mention, מדיה מרובה, הקלטת קול עם מגבלת 5 דק' | solid |
| Replies | `web/components/community/Replies.tsx` | שרשור תגובות דו-רמתי, תשובה מקובלת, עריכה inline, מדיה | needs-polish |
| ReactionBar | `web/components/community/ReactionBar.tsx` | 4 אימוג'י ריאקציות, אחת למשתמש, אופטימי עם revert | needs-polish |
| NotificationsBell | `web/components/community/NotificationsBell.tsx` | פעמון: ‏poll של 60ש', ‏badge, ‏mark-read אופטימי | needs-polish |
| AdminModeration | `web/components/community/AdminModeration.tsx` | תור מודרציה: דיווחים פתוחים + תוכן מסומן; אישור/הסרה/חסימה | needs-polish |
| ProfileView + ProfileEditor | `web/components/community/ProfileView.tsx`, `ProfileEditor.tsx` | פרופיל ציבורי עם סטטיסטיקות אמיתיות + עורך בעלים (אווטאר, ביו, העדפות) | solid |
| מדיה + עזרים | `web/components/community/{MediaView,MediaGallery,MentionTextarea,ShareBar,TalkInCommunity}.tsx` | רינדור מדיה, גלריה, ‏textarea עם mentions נגיש, שיתוף WhatsApp, ‏CTA מהקטלוג | solid |

**נקודות תורפה**
- ‏ARIA: ‏CrmInbox/CrmMeetings/CrmContacts/CrmAnalytics מסמנים צ'יפים של פילטר כ-role=tablist/tab בלי מודל מקלדת — בעוד CrmLeads כבר עושה זאת נכון (aria-pressed).
- ‏CrmMeetings שם role="button" על שורות `<tr>`/`<li>` — הורס סמנטיקת טבלה לקוראי מסך (בדיוק האנטי-דפוס ש-CrmLeads החליף).
- ‏N+1 בקהילה: כל PostCard וכל ReactionBar קוראים ל-fetchers התומכים ב-batch עם id בודד — ~100 בקשות לעמוד פיד.
- ‏CommunityFeed — ‏reachedEnd מחושב אחרי סינון לקוח של שורות flagged/blocked → סוף-פיד מוקדם מדי כשעוד יש פוסטים.
- ‏NotificationsBell — שורות נושאות post_id אבל קליק רק מסמן כנקרא, בלי ניווט ל-permalink הקיים.
- ‏AdminModeration משתמש ב-window.confirm החוסם במקום דפוס האישור הדו-שלבי של CrmTeam/CrmLeads.
- ‏AuthModal — כשנדרש אימות email, חותמת ההסכמה נדחית עם הערה על follow-up שלא קיים; לכפתורי ה-OAuth אין מצב busy.
- שכפולים: ~4 עותקי focus-trap ידניים ו-3 עותקי relativeTime על פני הרכיבים.

---

## 4. אפליקציית Flutter‏ (`lib/`)

**תקציר:** אפליקציה גדולה (~65k LOC) וכתובה-ביד ברמה גבוהה: 40 עמודים מאחורי
StatefulShellRoute‏ (3 טאבים + 2 branches ללא טאב), ~35 שירותים טהורים עם seam
מתחלף Local/Supabase, מערכת טוקנים Geist מונוכרום + ירוק יחיד עם dark mode מלא,
ו-~905 טסטים ב-110 קבצים. עקרון אמת-לפני-הכול נשמר כמעט בכל מקום. ממצאים
עיקריים: ‏CLAUDE.md התיישן (המעבר לירוק כבר בוצע), שערי האימות לא רצים בסביבה
הנוכחית (חוסר התאמה בין SDK ל-lockfile), 4 ווידג'טים משותפים מתים, ו-Availability
הוא חריג-האמת היחיד.

| שם | נתיב | תפקיד | מצב |
|-----|------|--------|------|
| Router + shell + bootstrap | `lib/router.dart`, `lib/main.dart`, `lib/app.dart` | ‏StatefulShellRoute עם 5 branches, שער ביומטרי, שער אדמין; בחירת backend, ‏Sentry, סנכרון scope-אפליקציה; ‏RTL wrap | solid |
| AppState | `lib/app_state.dart` | ‏singleton ChangeNotifier + SharedPreferences: חשבונות פר קטגוריה, שאלון, סל השוואה, מעקב חידושים, מחיקת חשבון | solid |
| Theme וטוקנים | `lib/theme/app_theme.dart` | ‏AppColors‏ (Geist מונוכרום + ירוק ‎#16A34A) + ‏AppTheme‏ (טיפוגרפיה, motion, glass) | solid |
| שכבת קטלוג + מודלים | `lib/data.dart`, `lib/models.dart` | ‏compiledPlans‏ (125) + hydrateCatalogue‏ (live-wins, never-blank); ‏priceUnitLabel כמקור יחיד; ‏Plan/TrackedPlan | solid |
| ‏core + עותק משפטי | `lib/core/`, `lib/legal.dart` | ‏nav, איש קשר יחיד, feature flags, יכולות Zoom; עותק §7ב/§17 מאושר | solid |
| ספריית ווידג'טים פעילה | `lib/widgets/` | ‏app_button, ‏consent_panel, ‏saving_pill, ‏price_text, ‏glass_panel, ‏skeleton ועוד — שימוש בריא | solid |
| ווידג'טים מתים | `lib/widgets/{digital_agent_fab,info_banner,stat_pill}.dart`, `lib/components/shimmer_card/` | אפס call sites בכל lib/ | stale |
| כרטיסי מסלול + לוגואים | `lib/components/plan_card/`, `logo_widget/` | ‏plan_card, ‏mini_plan_card, רזולוציית צבע מותג פר ספק (מחוץ לפלטת האפליקציה) | solid |
| שירותי דומיין טהורים | `lib/services/` | ‏recommendation_engine, ‏advisor (מקומי+edge), ‏notifications, ‏provider_ratings, ‏renewal_report, ‏search, ‏savings_summary, ‏wallet_summary, ‏switch_economics/kit, ‏negotiation_script, ‏street_price, ‏meeting_slots — כולם נבדקים | solid |
| מדיה + push | `lib/services/media_service.dart`, `push_notification_service.dart` | לכידת מדיה web-safe; תזכורות מקומיות עם לוח זמנים טהור | solid |
| ‏auth + ‏backend seam | `lib/services/auth_service.dart`, `backend/` | ‏OAuth/ביומטרי/הסכמות; ממשק Backend + ‏LocalBackend + ‏SupabaseBackend‏ (1:1 עם schema.sql) | solid |
| ‏Realtime וסנכרון | `lib/services/realtime_service.dart`, `catalogue_sync.dart`, `meeting_sync.dart`, `lead_step_sync.dart` | ‏poller עם fallback, הידרציית קטלוג חי, mirror אישורי פגישה, צעדי ליד | solid |
| אנליטיקס + ייצוא + עזרים | `lib/services/analytics_*.dart`, `comparison_*.dart`, `support_ticket_service.dart`, `referral_code.dart` | אירועי משפך ב-allow-list; ‏PDF השוואה RTL; טיקטים; קוד הפניה; ‏review_prompt | solid |
| דף הבית | `lib/pages/home/home_widget.dart` | ה-hub‏ (1,730 שורות): חיפוש, hero חיסכון, המלצות, גריד קטגוריות, מגש השוואה | needs-polish |
| כניסה: onboarding / auth / lock | `lib/pages/{onboarding,auth,biometric_gate}/` | ‏onboarding דו-שקופיות; התחברות אופציונלית; נעילה ביומטרית | solid |
| משפך התאמה | `lib/pages/{quiz,results,matches}/` | שאלון עם draft מתחדש, תוצאות, התאמות מנוע | solid |
| עיון בקטלוג | `lib/pages/{search,compare,plan_detail,provider,electricity}/` | חיפוש, השוואה (context.select), פירוט מסלול (2,276 שורות), פרופיל ספק, חשמל | solid |
| לוחות כסף | `lib/pages/{savings,bills,wallet,recap,switch_calculator}/` | חיסכון, ‏benchmark חשבונות, ארנק, ‏recap שנתי, מחשבון מעבר — רינדור פלט שירותים בלבד | solid |
| חידוש והתראות | `lib/pages/{tracker,renewal,renewal_report,notifications}/` | ‏tracker צעדים, רדאר חידושים, דוח חידוש, מרכז התראות | solid |
| המרה ויצירת קשר | `lib/pages/{lead,success,callback,meeting,chat,porting}/` | טופס ליד עם ConsentPanel, אשף פגישה, כרטיס צוות כן (בלי בוט מזויף), ניוד | solid |
| כלי מעבר | `lib/pages/{negotiate,switch_kit,street_price,deals}/` | תסריט מו"מ, ‏Switch Autopilot, מחירי רחוב, פיד דילים realtime | solid |
| קהילה ויועץ | `lib/pages/{community,ai_advisor,ratings,referral}/` | פיד קהילה (1,955 שורות), צ'אט יועץ AI, לוח דירוגים, שיתוף הפניה | solid |
| אשכול חשבון | `lib/pages/{account,profile,settings,support_ticket}/` | ‏hub חשבון, פרופיל, הגדרות (כולל מחיקה בעותק-אמת), טיקט תמיכה | solid |
| אדמין: CRM + אנליטיקס | `lib/pages/crm/`, `analytics/` | ‏CRM ‏WhatsApp בן 3 טאבים מעל crm-api; לוח משפך לבעלים | solid |
| Website + Availability | `lib/pages/website/`, `availability/` | נחיתה שיווקית in-app; בודק כיסוי אינטרנט לפי עיר/רחוב | needs-polish |

**נקודות תורפה**
- ‏CLAUDE.md התיישן מול הקוד: ‏brandAccent **כבר ירוק ‎#16A34A** (הדוקטרינה "עדיין indigo" שגויה) וערכי הבסיס המתועדים (‎#111827/#F5F7F8‎) אינם תואמים את טוקני ה-Geist בפועל (‎#0A0A0A/#FAFAFA‎).
- שערי האימות לא רצים כאן: ‏pubspec.lock דורש Flutter ‎>=3.38.1‎ / Dart ‎>=3.10‎ אבל ה-SDK המתועד ב-`$HOME/.flutter-sdk` הוא 3.24.5 — ‏pub get נכשל.
- 4 ווידג'טים משותפים מתים (digital_agent_fab, ‏info_banner, ‏stat_pill, ‏shimmer_card); ‏community_widget אף מגלגל _StatPill פרטי משלו.
- דף הבית עדיין full-listen על AppState — כל notify בונה מחדש את כל העמוד (‏Compare כבר עבר ל-context.select).
- ‏Availability — חריג האמת היחיד: רשימת 8 ספקים קבועה שנחשפת אחרי השהיה מלאכותית של 900ms ללא תלות בכתובת; ‏Website מחזיק seeds של חשבונות + חישוב חיסכון inline משלו (סיכון drift).
- שירותים ללא טסט ייעודי: ‏catalogue_sync, ‏review_prompt, ‏zoom_providers.

---

## 5. ‏Edge functions‏ (`supabase/functions/`)

**תקציר:** ‏26 פונקציות Deno + ספריית `_shared` בת 41 מודולים (21k LOC) — כל צד-השרת.
מודלי auth עקביים: ‏x-webhook-secret‏ (fail-closed) ל-cron/triggers; ‏requireAdmin /
requireCrmAccess למשטחי אדמין; חתימות פלטפורמה (Meta HMAC, ‏Telegram secret_token)
ל-webhooks; ‏allow-list מקורות + rate limits לנקודות אנונימיות. ‏CI מריץ check+test‏
(73 קבצי טסט). האיכות אחידה וגבוהה; היוצאים מן הכלל: ‏telegram-webhook בסגנון legacy
ו-referral-issue ללא שום כיסוי CI.

| שם | נתיב | תפקיד | מצב |
|-----|------|--------|------|
| site-ai-chat / site-plan-advisor / site-bill-analyzer / translate / street-price | `supabase/functions/{site-*,translate,street-price}/` | נקודות ה-AI הציבוריות של האתר: צ'אט מקורקע (SSE), ממליץ רב-סבבי, ‏Vision לחשבוניות, תרגום עם cache ‏DB, מחירי-רחוב עם סינון סבירות | solid |
| site-subscribe | `supabase/functions/site-subscribe/` | הרשמה לניוזלטר + מייל ברוכים-הבאים fail-soft | needs-polish |
| whatsapp-webhook | `supabase/functions/whatsapp-webhook/` | ‏webhook של Meta: שרשרת שערים מלאה + agent + ‏CRM — הפונקציה הנבדקת ביותר (~10 קבצי טסט) | solid |
| telegram-user-webhook | `supabase/functions/telegram-user-webhook/` | בוט הלקוחות הציבורי: אותו agent, ‏STOP §30A, ‏DSR, ‏takeover; כבוי-כברירת-מחדל בלי טוקן | solid |
| telegram-webhook | `supabase/functions/telegram-webhook/` | בוט קישור פרופילים (deep-link) + relay של נציג ל-WhatsApp | needs-polish |
| notify-lead | `supabase/functions/notify-lead/` | "הנציג הדיגיטלי" בטלגרם: כרטיסי לידים/פגישות, פקודות, ‏Mini App, ‏relays — צרכן ה-_shared הרחב ביותר | solid |
| crm-api | `supabase/functions/crm-api/` | ‏backend ה-CRM: ~18 actions עם מפת יכולות פר תפקיד (viewer/rep/admin), ‏DTO allowlist | solid |
| rep-brief | `supabase/functions/rep-brief/` | תדריך שיחה בעברית לנציג מתוך ליד + קטלוג ארוז; ‏AI רק מנסח מחדש | solid |
| פונקציות cron‏ (x5) | `renewal-reminders`, `lead-digest`, `community-digest`, `savings-watch`, `site-push-notify` | דיגסטים, ‏sweep, מדרג follow-up, דוח שבועי, התראות חיסכון (WhatsApp/Push), ‏Web Push על ירידות מחיר | solid |
| יעדי DB-webhook‏ (x2) | `community-notify`, `community-moderate` | פינג צוות + fan-out של mentions; מודרציה אוטומטית (היוריסטיקה + LLM, ‏flag בלבד) | solid |
| account-delete + meeting-book | `supabase/functions/{account-delete,meeting-book}/` | מחיקת חשבון מלאה (PII scrub); הזמנת Zoom עם email-OTP‏ (hash, ‏constant-time, חד-פעמי) | solid |
| admin-metrics + analytics-track + community-admin | `supabase/functions/{admin-metrics,analytics-track,community-admin}/` | ‏rollup תצפיתיות לקריאה; ‏sink אירועי משפך; סמכות שרת למודרציה | solid |
| lead-export | `supabase/functions/lead-export/` | פיד לידים-למכירה — רק consent_share_at, שער כפול; **בכוונה מחוץ לתפריט הפריסה** (guardrail) | solid |
| referral-issue | `supabase/functions/referral-issue/` | הנפקת קוד הפניה מתמיד לאפליקציה | needs-polish |
| ‏_shared: מוח ה-agent | `_shared/agent.ts`, `tools.ts`, `ai.ts`, `session.ts`, `knowledge.ts` | ‏runAgent האחד לשלושת הערוצים: פרסונה + קטלוג מצוטט + 12 כלים; שרשרת ספקי AI עם fallbacks; ‏session מאוחד; ‏FAQ אצור | solid |
| ‏_shared: ציות | `_shared/compliance.ts` | מקור אמת יחיד: גילוי §7ב, שעות שקט, גלאי opt-out ‏§30A רב-לשוני, ‏suppression — guardrail | solid |
| ‏_shared: מוחות דומיין | `_shared/catalogue.ts`, `scoring.ts`, `bill.ts`, `bill-forensics.ts`, `switch.ts` | קרקוע קטלוג; ‏rankPlans היחיד (מונע drift דירוג בין משטחים); ‏Vision לחשבוניות; ערכת מעבר | solid |
| ‏_shared: שכבת לידים ופגישות | `_shared/leads.ts`, `lead_quality.ts`, `leadlookup.ts`, `referrals.ts`, `meetings.ts`, `agenda.ts`, `digests.ts`, `followup.ts`, `weekly.ts` | ‏captureAiLead עם שער הסכמה; ציון איכות; בוני כרטיסים/דיגסטים/אג'נדה טהורים | solid |
| ‏_shared: תשתית + שערי auth | `_shared/db.ts`, `config.ts`, `log.ts`, `observability.ts`, `ratelimit.ts`, `cors.ts`, `cron_health.ts`, `admin.ts`, `crm_roles.ts` | ‏PostgREST fail-soft; ‏Vault-first config; ‏Sentry; ‏rate limiter; ‏CORS; ‏requireAdmin fail-closed + מודל יכולות CRM | solid |
| ‏_shared: תעבורה ואינטגרציות | `_shared/telegram.ts`, `whatsapp.ts`, `webapp.ts`, `sse.ts`, `google_calendar.ts`, `google_sheets.ts`, `zoom.ts`, `email.ts`, `types.ts` | שולחי Telegram/WhatsApp עם retry; אימות Mini App; ‏SSE; ‏Calendar/Sheets/Zoom‏ best-effort; תבניות email ‏RTL | solid |
| חבילת טסטים | `supabase/functions/tests/` | 73 קבצים + ‏_capture_handler שמריץ handlers אמיתיים ללא פורט | solid |
| deno.json (root + פר-פונקציה) | `supabase/functions/deno.json` | משימות check/test שה-CI מריץ; ‏import maps | needs-polish |
| deploy-functions (הצלבה) | `.github/workflows/deploy-functions.yml` | פריסה ידנית/בדחיפה דרך ה-CLI + בדיקת בריאות | needs-polish |

**נקודות תורפה**
- ‏`referral-issue` — הפונקציה היחידה ללא קובץ טסט וללא כיסוי ב-check task: אפס כיסוי CI.
- ‏`telegram-webhook` — היחידה שעדיין על std@0.168 ‏serve + ‏esm.sh supabase-js‏ (סגנון 2022).
- ‏`site-subscribe` — נושאת עותקי jlog/cors/json מקומיים במקום `_shared`, ומושמטת מלולאת ה-"all" של הפריסה.
- ‏`deno.json` — משימת ה-check מדלגת על 6 פונקציות פרוסות (community-admin/digest, ‏lead-digest, ‏lead-export, ‏referral-issue, ‏telegram-webhook).
- ‏`deploy-functions.yml` — ‏16/26 פונקציות בלבד באפשרויות; לולאת "all" משמיטה site-subscribe ו-translate; טריגר ה-push מכוון לענף מת (`claude/laughing-hawking-4q1i8j`).

---

## 6. צינור סוכן ה-WhatsApp

**תקציר:** בוט מכירות/ייעוץ עברית-תחילה, מקורקע ומשתמש-בכלים, מאחורי שרשרת שערים
קפדנית: אימות HMAC → ‏dedup לפי wamid → ‏STOP §30A → גלאי תיקון-13 → שער takeover
אנושי → תקרת AI שעתית → ניתוב. מסלולים: קול (Whisper), תמונת חשבונית (Vision),
תפריטים אינטראקטיביים, "אנושי" מפורש, וכל השאר → ‏runAgent עם 12 כלים. שרשרת
דגרדציה בת 4 רמות — הלקוח תמיד מקבל תשובה. כל ריצת כלי מבוקרת ל-crm_events +
security_audit_log. ‏takeover: צד הטלגרם קובע את החוזה המלא; ‏crm-api הופך רק את
bot_enabled — מה שה-self-heal של ה-webhook מפרש כ"תקוע" ומחזיר את הבוט.

| שם | נתיב | תפקיד | מצב |
|-----|------|--------|------|
| כניסת webhook + שרשרת שערים | `supabase/functions/whatsapp-webhook/index.ts` | ‏1,668 שורות: אימות Meta, ‏dedup, ‏persistence, §30A/תיקון-13, ‏takeover+self-heal, תקרה שעתית, ניתוב, בועות ≤1000 תווים | solid |
| גשר agent runner | `whatsapp-webhook/agent_runner.ts` | בונה ToolContext‏ (audit sinks, ‏captureAiLead, ‏escalate), טוען/שומר session, מריץ runAgent | solid |
| זיכרון slots לשיחה | `whatsapp-webhook/context.ts` | קטגוריה/תקציב/חו"ל/נושא/התנגדות מעל ai_state; זיהוי follow-up | solid |
| תבניות נושא (flows) | `whatsapp-webhook/flows.ts` | תשובות עבריות דטרמיניסטיות מקורקעות — שכבת ה-templateFallback של ה-agent | needs-polish |
| סיווג כוונות (intents) | `whatsapp-webhook/intents.ts` | ‏classifyTextIntent, רמזי התנגדות/נאמנות, הודעת §11 בקשר ראשון | needs-polish |
| מוח ה-agent המשותף | `_shared/agent.ts` | פרסונה אחת + קטלוג מצוטט + ציות לשלושת הערוצים; לולאת כלים ≤4 צעדים; זיהוי שפה (he/ar/ru/en); בחירת tier מודל | solid |
| רגיסטרי 12 הכלים | `_shared/tools.ts` | ‏search/recommend/refine, ‏provider/compare, ‏analyze_bill, ‏retention offer, ‏referral, ‏switch kit, ‏create_lead (שער הסכמה), ‏book_callback, ‏escalate | solid |
| שרשרת ספקי AI | `_shared/ai.ts` | ‏Gemini → ‏Groq → ‏Cerebras → ‏OpenRouter → ‏OpenAI; ‏timeouts; ‏Whisper; ‏cleanReply | solid |
| שכבת ידע אצור | `_shared/knowledge.ts` | ‏bot_knowledge לפרומפט + לוג שאלות לקוחות ללמידה אנושית | solid |
| מודול ציות | `_shared/compliance.ts` | גלאי opt-out רחב-בכוונה, ‏suppression, ‏DSR עם סיכום counts-only — guardrail | solid |
| ‏session מאוחד | `_shared/session.ts` | ‏12 תורות + 12 קריאות-כלים + slots מעל ai_sessions / ai_state | solid |
| ערכת שליחה Graph API | `_shared/whatsapp.ts` | ‏sendText‏ (retry על 5xx + מסווג חלון 24h), ‏markRead, ‏sendList, ‏sendImage/Document | solid |
| ‏lookup ליד פתוח | `_shared/leadlookup.ts` | ‏fan-out צורות טלפון → ‏ActiveLead אמיתי לשאלות סטטוס | solid |
| מסלול קול | `whatsapp-webhook/index.ts` (ענף voice) | הורדה ≤6MB → ‏Whisper מוצמד-עברית → אותו מסלול agent | needs-polish |
| מסלול תמונת חשבונית | `whatsapp-webhook/index.ts` (ענף image) | ‏Vision משותף עם site-bill-analyzer‏ (אין drift ב-OCR) → ‏billHint ל-agent | solid |
| ‏SQL: מודל CRM + takeover + relay + knowledge | `supabase/whatsapp-*.sql`, `crm-takeover-2026-06.sql`, `bot-knowledge-2026-06.sql` | הטריו contacts/conversations/messages‏ (RLS, ‏service-role בלבד), ‏crm_events, עמודות relay/thread, ‏FAQ אצור | solid |
| ‏crm-api: takeover/handback/reply | `supabase/functions/crm-api/index.ts` | הפיכת bot_enabled + שליחה מבוקרת מהקונסולה | needs-polish |
| חצאי ה-relay בטלגרם | `supabase/functions/notify-lead/callbacks.ts` | ‏takeover מלא (bot_enabled=false + ‏relay_tg_chat_id), ‏relay דו-כיווני, ‏hand-back | solid |
| שולח פרואקטיבי (אין תבניות HSM) | `supabase/functions/savings-watch/index.ts` | השולח היזום היחיד — התראות חיסכון ב-cron, מסונן suppression; כל השליחות free-form | solid |
| חבילת טסטים לצינור | `supabase/functions/tests/` | ‏webhook/runner/flows/relay/voice/handoff + ‏agent core/tools/closing/eval | unknown |

**נקודות תורפה**
- **פער ה-takeover:** ‏crm-api קובע bot_enabled=false בלי relay_tg_chat_id — בדיוק המצב שה-self-heal של ה-webhook "מתקן" חזרה ל-enabled; ‏takeover מאפליקציית ה-CRM לא באמת משתיק את הבוט (רק takeover מטלגרם כן).
- מסלול הקול עוקף את capInbound — תמליל ארוך נכנס ל-agent ללא התקרה המתועדת של 2000 תווים.
- ‏flows.ts/intents.ts — שכבה אינטראקטיבית שלמה (בוני כפתורים/פיקרים, ‏parseReplyId) מיוצאת ללא אף caller וללא טסט; ‏index.ts גידל מקבילות משלו עם סכמת id סותרת (‏bud: מול budget:).
- הטסטים לא ניתנים להרצה בסביבה זו (jsr.io ‏403 דרך ה-proxy) — הקבצים קיימים ועדכניים.

---

## 7. משטחי Telegram

**תקציר:** שלושה בוטים נפרדים + דחיפות cron. ‏(1) בוט הצוות (notify-lead ושות'):
CRM מלא בצ'אט — כרטיסי לידים עם claim אטומי, 14 פקודות, לוח פגישות, ‏Mini App
console, ‏relays חיים; ‏auth ‏fail-closed. ‏(2) בוט הלקוחות הציבורי
(telegram-user-webhook): ‏agent רב-לשוני מקורקע עם שרשרת שערים מלאה; ‏handoff
אנושי דרך ai_sessions. ‏(3) בוט הקישור (telegram-webhook): קושר profiles בדיפ-לינק —
אבל **אף שולח בשרת לא קורא את profiles.telegram_chat_id**, כך שערוץ התראות המשתמש
שהובטח חשוך. ‏bot-health מנטר רק 2 מהפונקציות. כיסוי טסטים חזק (~3,300 שורות).

| שם | נתיב | תפקיד | מצב |
|-----|------|--------|------|
| ‏notify-lead — ‏hub הצוות | `supabase/functions/notify-lead/index.ts` | ‏fan-out של לידים/פגישות לכרטיסי טלגרם + email + Sheets; ‏webhook + ‏health + console | solid |
| ניתוב כפתורים והודעות | `notify-lead/callbacks.ts` | ‏claim/סטטוס/undo/snooze/סיבת-הפסד/חיסכון-שנרשם; ‏relays דו-כיווניים; ‏suppression לפני כל שליחה ללקוח | solid |
| פקודות slash‏ (x14) | `notify-lead/commands.ts` | ‏/today /digest /week /leads /meetings /book /search /customer /stats /hot /weekly... | needs-polish |
| לוח פגישות + console + ‏meeting callbacks | `notify-lead/board.ts`, `console.ts`, `meeting_callbacks.ts` | רנדררים טהורים ללוח tap-to-act; ‏Mini App עם אימות initData; נתיב הכתיבה המשותף applyMeetingAct | solid |
| ‏AI triage ללידים | `notify-lead/triage.ts` | שורת סיכום + ציון כוונה 1–5 + טיוטת פתיח WhatsApp; ‏fail-soft | solid |
| תיעוד secrets + runbook | `notify-lead/.env.example`, `supabase/README.md §8` | טבלת סודות Vault/env, גילוי chat-id, רוטציית webhook | solid |
| ‏_shared: שולח + config + Mini App auth | `_shared/telegram.ts`, `config.ts`, `webapp.ts` | ‏retry על 429, ‏fallback לטקסט פשוט; ‏Vault-first config עם cache של 60ש'; אימות initData לפי המפרט | solid |
| ‏_shared: בוני דיגסטים ואג'נדה | `_shared/digests.ts`, `agenda.ts` | דיגסט חידושים, דוח שבועי, ‏/today, דוסייה לקוח, ‏speed-to-lead | solid |
| ‏lead-digest‏ (fn + lib + cron) | `supabase/functions/lead-digest/`, `supabase/lead-digest-cron-2026-06.sql` | דחיפת בוקר: דיגסט מנהלים + נאדג' SLA ללידים תקועים (05:30 UTC) | solid |
| ‏rep-brief‏ (endpoint + builder) | `supabase/functions/rep-brief/` | תדריך שיחה JSON; ‏buildBrief דטרמיניסטי עם אותם פרסרים של יועץ ה-WhatsApp | solid |
| ‏rep-brief — ‏snapshot קטלוג | `rep-brief/plans-snapshot.json` | קטלוג ארוז בזמן פריסה שהצעות המסלולים מקורקעות בו | needs-polish |
| בוט הלקוחות הציבורי | `supabase/functions/telegram-user-webhook/index.ts` | שרשרת שערים מלאה → ‏runAgent; ‏STOP, ‏DSR, ‏takeover, ‏dedup; כבוי בלי טוקן | solid |
| ‏lib טהור לבוט הציבורי | `telegram-user-webhook/lib.ts` | ‏chunking, זיהוי "אנושי" ב-4 שפות, מקלדת קטגוריות אמת-בלבד, עותקי §11/opt-out | solid |
| בוט הקישור + ‏relay נציג | `supabase/functions/telegram-webhook/index.ts` | ‏/start user_<uuid> קושר פרופיל (מוגן חטיפה); ‏relay נציג→WhatsApp לפי thread | needs-polish |
| ‏SQL: ‏handoff + ‏suppression + ‏thread | `supabase/telegram-handoff-2026-06.sql` ועוד | ‏bot_enabled/relay_team_chat_id על ai_sessions; הרחבת ערוץ suppression ל-telegram; ‏telegram_thread_id | solid |
| ‏bot-health workflow | `.github/workflows/bot-health.yml` | ‏probes יומיים ל-notify-lead ו-renewal-reminders בלבד | needs-polish |
| נקודות המגע של renewal-reminders | `supabase/functions/renewal-reminders/index.ts` | ‏digest/sweep/follow-up/weekly — כל הפלט לטלגרם הצוות | solid |
| פינגים קהילתיים | `community-notify`, `community-moderate` | פינג צוות על פוסטים/ביקורות + התראת מודרציה | solid |
| חצי ה-relay של ה-WhatsApp webhook | `supabase/functions/whatsapp-webhook/index.ts` | העברת הודעות לקוח נכנסות לצ'אט המשתלט בזמן takeover | solid |
| ‏Flutter: ‏TelegramService | `lib/services/telegram_service.dart` | ללא טוקן בצד לקוח בכוונה — בוני הודעות טהורים ונבדקים בלבד | solid |
| ‏Flutter: שורת ההגדרות + ‏AppState | `lib/pages/settings/settings_widget.dart`, `lib/app_state.dart` | חיבור בדיפ-לינק, "בדיקה", ניתוק — מעל מצב מקומי | needs-polish |
| ‏profiles.telegram_*‏ (עמודות DB חיות) | `supabase/profiles-insert-hardening-2026-07.sql` | נכתבות רק ע"י בוט הקישור | stale |
| חבילת טסטים + ‏workflow פריסה | `supabase/functions/tests/`, `.github/workflows/deploy-functions.yml` | ~3,300 שורות טסטים לשרשראות/handoff/board/דיגסטים; יעדי פריסה לטלגרם | solid |

**נקודות תורפה**
- **ערוץ התראות משתמש חשוך:** ‏profiles.telegram_chat_id נכתב אך אף שולח לא קורא אותו — ההבטחות של הודעת /start (אישורי פגישה, תזכורות, דילים) לא מסופקות; ‏savings-watch ללא שום קוד טלגרם.
- מצב חיבור באפליקציה שקרי: ‏setUserTelegramChatId ללא אף caller — השורה בהגדרות תמיד תראה "לא מחובר", ו"ניתוק" מנקה רק prefs מקומיים.
- ‏/leads בפקודות הצוות סופר רק את 5 השורות שהביא — "נסגרו" תמיד 0, סותר את התצוגה הזהה מה-callback.
- ‏telegram-webhook — סגנון legacy‏ (std@0.168, בלי jlog/captureError, בלי retry, מחזיר 500 → ‏Telegram משכפל עדכונים ללא dedup).
- ‏bot-health לא מנטר את שני הבוטים האחרים — בוט הלקוחות הציבורי יכול להיות חשוך שבועות בלי התראה.
- ‏rep-brief/plans-snapshot.json — רענון ידני + ‏redeploy בלבד; אין חיווי staleness בתשובה.

---

## 8. שכבת ה-DB‏ (`supabase/*.sql`)

**תקציר:** פרויקט Supabase Postgres שנתפס כ-`schema.sql` קנוני (~1,600 שורות) + ~87
קבצי delta ידניים עם כותרות רציונל מפורטות. עמדת ה-RLS ממושמעת ומתועדת פר טבלה:
קריאה ציבורית רק לקהילה/ביקורות/קטלוג; ‏own-row לנתוני משתמש; ‏allowlists ברמת עמודה
על leads/meetings/profiles; ~20 טבלאות service-role בלבד. ~10 עבודות pg_cron רשומות.
החולשה המרכזית: ‏schema.sql וכמה קבצים ישנים נסחפו מאחורי מחליפים מאוחרים — הרצה
חוזרת של קובץ ישן תחזיר לאחור hardening שהוחל.

| שם | נתיב | תפקיד | מצב |
|-----|------|--------|------|
| ‏schema.sql — הבסיס הקנוני | `supabase/schema.sql` | ‏mirror להתקנה טרייה: טבלאות ליבה, views, ‏RLS, ‏grants, ‏triggers | needs-polish |
| ‏profiles + נעילת עמודות מוחסנות | `schema.sql` + ‏hardening files | ‏1:1 עם auth.users; חותמות הסכמה; ‏UPDATE/INSERT ב-allowlist עמודות self-service בלבד | solid |
| ‏leads + שער אנטי-abuse + הסכמות | `schema.sql` + ‏leads-*.sql | ‏insert אנונימי עם rate-limits ב-trigger; חותמות הסכמה בשרת; ‏consent_share_at; ‏lead_events | solid |
| ‏RPCs לבוט/תפעול + ‏plan_views | `schema.sql`, `upgrade-2026-06-10.sql` | ‏search_leads, ‏get_cron_health, ‏get_upcoming_renewals, ‏increment_savings; ‏sink צפיות + views למשפך | solid |
| ‏tracked_plans (רדאר חידושים) | `schema.sql` + ‏optin files | מסלול במעקב פר משתמש; ‏opt-in לתזכורות email ולווצ'ר חיסכון | solid |
| ‏meetings + ‏guard + ‏realtime + ‏OTP | `meetings-2026-06.sql`, `meeting-*-otp-*.sql` ועוד | הזמנות Zoom עם מכונת סטטוסים, ‏guard נוכחי (ריבוי פגישות + מגבלות), ‏OTP אטומי (sha-256, ‏TOCTOU סגור) | solid |
| ‏CRM ‏WhatsApp/Telegram | `whatsapp-*.sql`, `crm-takeover`, `crm-roles-2026-07.sql` | הטריו + ‏crm_events‏ (realtime, אדמין בלבד) + ‏crm_members‏ (תפקידים, בלתי-נראה ללקוח מבנית) | solid |
| קהילה: ליבה + שומרי DB | `schema.sql` + ‏community-*.sql | ‏posts/replies/likes/bookmarks + ‏triggers‏ (עומק 2, ‏rate limit, אכיפת ban, תשובה מקובלת, ‏cap מדיה) | solid |
| קהילה: ‏views + ‏RPCs + התראות | `community-accepted-answer-2026-07.sql` (הסופי) ועוד | ‏community_feed‏ (6 גרסאות — האחרונה חיה), חיפוש FTS, ‏highlights, מודרציה, ‏notifications עם שער opt-out יחיד, ‏public_profiles | solid |
| קהילה: ‏storage + ‏digest + ‏webhooks | `storage.sql`, `community-digest-*.sql` | ‏bucket עם מדיניות פר-תיקיית-משתמש, ניקוי orphans, ‏digest שבועי opt-in, ‏triggers ל-notify/moderate | solid |
| ספקים + ביקורות + תג לקוח-מאומת | `providers-2026-06.sql`, `verified-customer-flow-2026-07.sql` | דירקטורי ספקים + יכולות Zoom; ‏provider_reviews; חותמת is_verified_customer כנה מאירועים אמיתיים | solid |
| העשרת public.plans | `plans-{enrich,rich-fields,rich-seed}-2026-06.sql` | עמודות פירוט owner-editable + ‏realtime + ‏seed אצור | needs-polish |
| ‏plan_price_history | `plan-price-history-*.sql` | ‏ledger מחירים append-only + ‏trigger snapshot אוטומטי; ‏realtime לפיד הדילים | solid |
| ‏street_prices + ‏k-anonymity | `street-prices-*.sql`, `street-price-kanonymity-2026-07.sql` | דיווחי קהל ללא PII; אגרגטים מאחורי ≥10 מדווחים נפרדים (קטגוריה: 5) | solid |
| ‏audit + ‏analytics | `legal-consent`, `audit-observability`, `analytics-events` | ‏security_audit_log‏ (Reg.13) עם bounds; ‏analytics_events + ‏rollup + ‏purge | solid |
| ציות: ‏DSR + ‏retention + ‏suppression + ניוזלטר | `data-protection-*.sql`, `marketing-consent-2026-06.sql` | תור בקשות §13/§14 עם דדליין 30 יום; טאטואי retention חודשיים; רישום do-not-contact רב-ערוצי; ‏double-opt-in | solid |
| ‏ai_sessions (זיכרון צ'אט) | `ai-sessions-2026-06.sql` | תמליל שמור עם cap פר session_id + מצב takeover לטלגרם | needs-polish |
| טבלאות throttle ל-AI | `schema.sql`, `bill-forensics-2026-06.sql` | ‏chat_messages / advisor_sessions / bill_analyses — מוני rate-limit + ממצאי forensics | needs-polish |
| ידע לבוט + ‏cache תרגומים | `bot-knowledge-2026-06.sql`, `translations-cache-2026-07.sql` | ‏FAQ אצור + לוג שאלות; ‏cache תרגומים + תקציב יומי אטומי | solid |
| הפניות + חיסכון ממומש + ‏push + ‏switch | `referral-codes`, `savings-history`, `wallet-stats`, `site-push-notify`, `switch-kit` | קודי הפניה (ללא תגמול בכוונה); ‏ledger חיסכון חסין-כפילות; מנויי push + ‏ledgers dedupe; ‏switch_progress | solid |
| ‏support_tickets | `support-tickets-2026-06-12.sql` | שרשורי תמיכה מודעי-אסקלציה עם own-row RLS | needs-polish |
| רגיסטרי pg_cron | `upgrade-2026-06-10.sql §9`, `cron-and-hardening-2026-07.sql` ועוד | ~10 עבודות רשומות (דיגסטים, ‏sweeps, ‏purges); כמה מנוסחות-אך-מוערות | needs-polish |
| ‏get_lead_notify_config | `observability-sentry-2026-06.sql` (הקנוני) | ‏RPC ‏Vault ל-config — חמישה עותקים מלאים בקבצים שונים | needs-polish |
| קבצי hardening רוחביים | `rls-defensive`, `security-*`, `function-search-path` | ‏deny-all מפורש, ‏security_invoker על views, הסרת is_admin מ-public_profiles, הצמדת search_path | solid |

**נקודות תורפה**
- ‏`schema.sql` נסחף: עדיין נושא את meetings_guard הישן, את policy ה-insert האנונימי שהוסר, ‏grant מלא על leads שצומצם, ושני עותקים ישנים של get_lead_notify_config — הרצה חוזרת תחזיר hardening לאחור; בנוסף מעניק הרשאות על אובייקטים חיים-בלבד (public.plans ועוד) כך שהרצה טרייה תיכשל.
- ‏get_lead_notify_config — חמישה עותקי החלפה-מלאה; רק של observability-sentry שלם. הרצת עותק ישן תחשיך Google logging ו-Sentry.
- טבלת הבסיס public.plans ללא CREATE בשום מקום בריפו (חיה-בלבד, נזרעת ע"י tool/export_plans.dart) — סיפור סביבה-טרייה שבור לקטלוג.
- ‏retention לא מתוזמן: ‏chat_messages גדל ללא גבול (ה-cron רק בהערה); ‏prune_ai_sessions כתוב ולא רשום; ‏advisor_sessions בלי retention כלל.
- רישומי cron כפולים בין upgrade-2026-06-10 ל-cron-and-hardening — שני מקורות אמת ללוחות זמנים.
- ‏support_tickets — הקובץ הישן היחיד בלי כותרת רציונל, עם משכפל של set_updated_at.
- טריגר ניקוי ה-storage קיים חי אבל בריפו רק כהערה ב-schema.sql; פערי תיעוד גם ב-supabase/README.md.

---

## 9. קטלוג נתונים + אוטומציה

**תקציר:** מקור הכתיבה של הקטלוג הוא Dart ידני (`lib/data/plans_*.dart`, ‏125 מסלולים,
6 קטגוריות). ‏`tool/export_plans.dart` מייצא ל-`site/data/plans.json` ו-seed‏ (insert-only)
ל-`public.plans` — **ה-DB סמכותי**; עריכות בעלים בדשבורד לעולם לא נדרסות. שלושת
הצרכנים קוראים live-first עם fallback ארוז. סחיפות שנמצאו: ה-snapshot הארוז
(2026-06-21) קודם לקטגוריית החשמל; העתק plans.json→catalogue.json ידני ללא שומר;
‏deploy-functions נסחף מסט הפונקציות; docs/EDGE_FUNCTIONS מיושן; זהות ספקים מוחזקת
ידנית ב-שלושה רגיסטרים מקבילים.

| שם | נתיב | תפקיד | מצב |
|-----|------|--------|------|
| ‏snapshot הקטלוג | `site/data/plans.json` | ‏fallback אחרון-ידוע-כטוב: ‏120 מסלולים, שדות מלאים כולל priceUnit/fees/fineLines | needs-polish |
| עותק ה-web הארוז | `web/data/catalogue.json` | עותק ידני זהה-בייט של plans.json — ‏fallback של אפליקציית ה-web | needs-polish |
| מקור ה-Dart | `lib/data.dart`, `lib/data/plans_*.dart` | מקור הכתיבה: ‏59 סלולר, ‏30 אינטרנט, ‏9 ‏TV, ‏11 טריפל, ‏11 חו"ל, ‏5 חשמל + ‏hydrateCatalogue | solid |
| כלי הייצוא | `tool/export_plans.dart` | ‏`flutter test` → כותב plans.json + ‏upsert ‏insert-only ל-public.plans; ידני בכוונה | solid |
| מדריך איסוף קטלוג | `site/data/CATALOGUE_COLLECTION.md` | ‏runbook עברי לאיסוף מסלולים מלא עם סכמה ושמות ספקים קנוניים | needs-polish |
| הגנרטור הסטטי | `site/build.js` | קורא public.plans חי בזמן build, מרנדר הכול, מטביע provenance ‏live/bundled | solid |
| ‏prewarm תרגומים | `scripts/prewarm-translations.mjs` | ‏Playwright שמחמם את site_translations על ~27 ראוטים בכל שפה | solid |
| ‏CI | `.github/workflows/ci.yml` | ‏flutter analyze+test, ‏Deno check+test, ‏build web + ‏APK — משקף את שערי CLAUDE.md | solid |
| ‏workflow פריסת פונקציות | `.github/workflows/deploy-functions.yml` | פריסת edge דרך ה-CLI‏ (16 אפשרויות + all) + ‏probe בריאות | needs-polish |
| ‏rebuild האתר הסטטי | `.github/workflows/rebuild-static.yml` | ‏cron 30 דק' + ‏webhook מה-DB; ‏commit פלטים בלבד → ‏redeploy | solid |
| ‏bot-health | `.github/workflows/bot-health.yml` | ‏probes יומיים לשתי פונקציות | solid |
| ‏vercel.json (root) | `vercel.json` | פורס את ./site כסטטי עם headers אבטחה + ‏cache immutable | needs-polish |
| קונפיגי deploy נוספים | `site/vercel.json`, `web/vercel.json`, `.vercelignore`, `package.json` | וריאנט headers עם GA4; ‏preset ‏Next; סינון upload; ‏build:site script | solid |
| נתיבי hosting חלופיים | `wrangler.jsonc`, `deploy-to-supabase.mjs` | ‏Cloudflare Workers ו-storage של Supabase — כנראה legacy מול Vercel | unknown |
| ‏deno.json (root) | `supabase/functions/deno.json` | משימות check/test שה-CI מריץ | needs-polish |
| ‏deno.json פר-פונקציה (x6) | `supabase/functions/*/deno.json` | ‏import maps לבידוד פריסה | solid |
| שכבת גישה לקטלוג ב-web | `web/lib/data.ts`, `live-catalogue.ts` | טוען build-time של catalogue.json + ‏getLivePlans חי עם ‏fallback stale:true | solid |
| רגיסטרי זהות ספקים | `web/lib/providers.generated.ts`, `lib/components/logo_widget/`, ‏`site/build.js` | שלושה רגיסטרים מקבילים ידניים: שם→slug/צבע/לוגו | solid |
| דאטהסטים נלווים ל-web | `web/data/cities.json`, `glossary.json` | ‏42 ערים עם קואורדינטות אמיתיות; מילון מונחים | solid |
| docs תקינים | `docs/{ARCHITECTURE,DEPLOYMENT,AI_AGENT,ROADMAP,events,CRM_WORKFLOW,CRM_C2_ROLES_PLAN,whatsapp-cloud-api-onboarding}.md` | מפת 4 המשטחים, מפת פריסה, ארכיטקטורת ה-agent, תכנית עבודה חיה, טקסונומיית GA4, יומן ה-CRM, ‏runbook ‏WhatsApp | solid |
| ‏docs/DATA_MODEL.md | `docs/DATA_MODEL.md` | סיכום סכמה + ‏RLS | needs-polish |
| ‏docs/EDGE_FUNCTIONS.md | `docs/EDGE_FUNCTIONS.md` | רפרנס פונקציות + מודל auth פר פונקציה | stale |
| ‏docs/legal/ | `docs/legal/` | ‏8 מסמכי ציות (DPO, ‏incident response, ‏PIA...) — לא נסקרו לעומק (guardrail) | unknown |
| כלי עזר לפיתוח | `tool/check_console_template.py`, `tool/brand/` | ‏lint לתבנית ה-console; מקורות SVG לנכסי מותג | solid |

**נקודות תורפה**
- ‏snapshot מיושן: ‏plans.json ו-catalogue.json‏ (2026-06-21, ‏120 מסלולים, ‏5 קטגוריות) קודמים לקטגוריית החשמל — כשל קריאה חיה ישמיט קטגוריה שלמה מה-fallback; ‏11 מסלולי חו"ל עם updatedAt ריק.
- העתק plans.json → ‏catalogue.json ידני לגמרי — אין שום אימות שהשניים זהים.
- ‏CATALOGUE_COLLECTION.md מתעד שדות שטוחים (setupFee/equipment/rangeExtender) שהסכמה האמיתית לא נושאת (‏fees{} + ‏fineLines[]).
- ‏deploy-functions.yml — ‏10/26 פונקציות אינן אפשרויות כלל; לולאת "all" מדלגת על שתיים; טריגר push על ענף מת.
- ‏vercel.json בשורש — ה-CSP מתיר רק plausible.io בעוד build.js מזריק GA4; מי שמוגדר root של הפרויקט ב-Vercel קובע.
- ‏docs/EDGE_FUNCTIONS.md — מונה support-agent שאינו קיים ומשמיט 13 פונקציות שנשלחו; ‏docs/DATA_MODEL.md עדיין ממסגר את public.plans כ"mirror" של קטלוג סטטי-קנוני, הפוך מהמודל בפועל.
- ‏wrangler.jsonc ו-deploy-to-supabase.mjs — נתיבי hosting שלא ברור אם עדיין חיים (מועמדים ל-legacy).

---

## מתודולוגיה

- המפה הופקה ב-**2026-07-10** ע"י צי של **9 סוכני מיפוי** — סוכן לכל תחום (אתר סטטי,
  ‏web ציבורי, ‏CRM+קהילה+auth, ‏Flutter, ‏edge functions, ‏WhatsApp, ‏Telegram, ‏DB,
  קטלוג+CI) — שסרקו את הריפו לעומק והחזירו inventory מובנה של ~341 רכיבים.
- כל רכיב סווג לאחד מארבעה מצבים: ‏`solid`‏ (יציב ותקין), ‏`needs-polish`‏ (עובד אך עם
  קצוות ידועים), ‏`stale`‏ (התיישן, מת או מתעד מציאות שאיננה), ‏`unknown`‏ (לא ניתן
  לאימות מתוך הריפו/הסביבה).
- רשימות "נקודות תורפה" נגזרות מהרכיבים המסומנים needs-polish/stale בלבד; רעיונות
  שדרוג ותעדוף **אינם** חלק מהמסמך הזה וחיים במסמך תכנית נפרד.

> **אזהרת טריות:** המפה מתארת את הריפו **כפי שהיה ברגע ה-commit של המיפוי**.
> הפרויקט זז מהר (עשרות PRs בשבוע) — לפני הסתמכות על שורה ספציפית, אמתו מול הקוד
> העדכני. אם תחום שלם השתנה מהותית, עדכנו את הסעיף הרלוונטי או הריצו מיפוי מחדש.
