# מסמך הגדרות מאגר מידע / Database Definitions

> **DRAFT — engineering-grounded, for lawyer review.** This is the "database
> definitions document" (**מסמך הגדרות מאגר**) that the Privacy Protection
> Regulations (Information Security), 2017 expect a database holder to maintain.
> It is derived from the real schema (`supabase/schema.sql`,
> `supabase/*-2026-06*.sql`) and `docs/DATA_MODEL.md`. It does **not** assert
> formal compliance or a completed audit. Re-derive from the code if the schema
> changes.

---

## 1. זהות המאגר / Database identity

| שדה / Field | ערך / Value |
|-------------|-------------|
| שם המאגר / Database name | Switch AI (חוסך) — לקוחות, פניות ושיווק / customers, leads & marketing |
| בעל המאגר / Holder | `[[OWNER: registered legal entity]]`, ח.פ `[[OWNER: company number]]` |
| מנהל המאגר / Database manager | `[[OWNER: name]]` (typically the owner/founder) |
| מחזיק/מעבד / Processor of record | Supabase Inc. (managed Postgres) — see [`PROCESSOR_REGISTER.md`](./PROCESSOR_REGISTER.md) |
| ממונה הגנת פרטיות / DPO | `[[OWNER: name + contact]]` — see [`DPO_CHARTER.md`](./DPO_CHARTER.md) |
| Supabase project ref | `orzitfqmlvopujsoyigr` |
| יצירת קשר לנושאי מידע / Data-subject contact | hello@chosech.co.il · WhatsApp 050-503-7537 |

## 2. מטרת המאגר / Purpose

A telecom **price-comparison + lead-generation** service. Personal data is
collected to:

1. **יצירת קשר חוזר עם פונים** — call a person back about the comparison/offer
   they requested (the core lead-gen purpose).
2. **התאמת הצעות** — match cheaper telecom plans to the inquiry (category, city).
3. **שיווק ישיר — בהסכמה בלבד** — direct marketing **only** to those who gave
   prior explicit opt-in (Communications Law §30A / "Spam Law").
4. **תפעול ותמיכה** — operate the app/site, handle support tickets and
   WhatsApp conversations, and improve the service via aggregate analytics.

The plan **catalogue** (providers/plans/prices) is static reference data shipped
with the app/site — it contains **no personal data** and is **not** in the
database (see `docs/DATA_MODEL.md`).

## 3. סוגי המידע במאגר / Categories of personal data

| קטגוריה / Category | פרטים / Items | מקור / Source | טבלה / Table |
|--------------------|---------------|---------------|--------------|
| פרטי קשר / Contact | שם, טלפון (נורמלי E.164), אימייל (אופציונלי) | טופס פנייה / lead form | `public.leads` (name, phone, email) |
| מיקום / Location | עיר מגורים (טקסט חופשי) / city | טופס פנייה | `public.leads.city` |
| העדפת שירות / Service intent | קטגוריה (cellular/internet/tv/triple/abroad), ספק/מסלול מבוקש, זמן חזרה מועדף | טופס | `leads` (notes/provider/plan_id/callback_time) |
| הוכחת הסכמה / Consent proof | חותמות זמן: תנאים, פרטיות, שיווק; גרסת הסכמה; IP רישום | מוטבע בשרת / server-stamped | `leads` + `profiles` (`*_accepted_at`, `consent_version`, `registration_ip`) |
| נתוני מניעת שימוש לרעה / Anti-abuse | `source_ip` (כתובת IP של השולח) | מוטבע ע"י gate בשרת | `leads.source_ip` — **מנוקה אחרי 30 יום** (ראו §6) |
| חשבון משתמש / Account | מזהה משתמש, סנכרון שאלון/חשבונות (אופציונלי) | אפליקציה | `public.profiles` |
| מסלולים במעקב / Tracked plans | מסלולים שהמשתמש עוקב אחריהם לחידוש | אפליקציה | `public.tracked_plans` |
| קהילה / Community | פוסטים, תגובות, לייקים, דיווחים, סימניות | אפליקציה | `community_*`, `post_*` |
| ביקורות ספקים / Reviews | דירוג + טקסט ביקורת | אפליקציה | `provider_reviews` |
| פגישות / Meetings | פגישת ייעוץ וידאו (טלפון, חלון זמן) | אפליקציה | `meetings`, `meeting_events` |
| תמיכה / Support | פניות ותכתובת תמיכה | אפליקציה | `support_tickets`, `support_messages` |
| AI / יועץ | היסטוריית צ'אט, סשני יועץ, סיכום ניתוח חשבון (**התמונה לא נשמרת**) | אפליקציה/אתר | `chat_messages`, `advisor_sessions`, `bill_analyses` |
| WhatsApp CRM | טלפון (E.164), שם פרופיל WhatsApp, סטטוס, opt-in שיווקי, גוף הודעות (טקסט בלבד — **לא בייטים/מדיה**) | Meta WhatsApp webhook | `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages` |
| אנליטיקה / Analytics | אירועי משפך מוצר (תוויות בלבד, ללא PII); GA4 מצטבר | אפליקציה/אתר | `analytics_events` (write-only); GA4 (אצל Google) |
| ניוזלטר / Newsletter | אימייל נרשם לאתר | אתר | `newsletter_subscribers` |
| יומן אבטחה / Security log | אירועי אבטחה (consent_recorded וכו'), user_id, IP, detail | מוטבע בשרת | `security_audit_log` (service-role בלבד) |

**מידע "רגיש" במיוחד / Special-sensitivity note:** the inquiry implies telecom
spending but the database holds **no** financial-account numbers, ID numbers
(ת"ז), health, or biometric data. Bill photos analysed by the AI are
**processed transiently and never stored** — only a summary row is kept
(`bill_analyses`).

## 4. סוגי נושאי מידע / Categories of data subjects

- **פונים / Leads** — people who submitted the contact form on the site/app
  (the largest category; may be anonymous-to-us beyond what they typed).
- **משתמשים רשומים / Registered app users** — including anonymous-auth sessions
  the app creates at startup.
- **לקוחות WhatsApp** — people who messaged the WhatsApp business number.
- **נרשמי ניוזלטר / Newsletter subscribers**.
- **מבקרים / Site visitors** — aggregate analytics only (GA4, consent-gated).

## 5. אחסון ומיקום / Storage & location

| היבט / Aspect | פרט / Detail |
|---------------|--------------|
| מערכת / System | Supabase (managed PostgreSQL) — project `orzitfqmlvopujsoyigr` |
| אזור / Region | **`eu-central-1` (Frankfurt, EU)** — lowest latency to Israel; outside Israel → **cross-border transfer** governed by the Privacy Regulations (Transfer of Data Abroad), 2001 (`[[OWNER: confirm transfer basis with lawyer]]`) |
| הצפנה במנוחה / At rest | Supabase disk-level encryption (default) |
| הצפנה בתעבורה / In transit | TLS 1.2+ enforced at the edge (Supabase + Vercel); site sets HSTS |
| גיבוי / Backups | Supabase managed backups (`[[OWNER: confirm tier + PITR]]`) — see [`SECURITY_POLICY.md`](./SECURITY_POLICY.md) §backup |
| אירוח האתר / Site hosting | Vercel (serves the Next.js app at app.switchy-ai.com) |
| לוגיקת שרת / Server logic | Supabase Edge Functions (Deno) — see `docs/EDGE_FUNCTIONS.md` |

## 6. שמירה ומחיקה / Retention & deletion

| נתון / Data | תקופת שמירה / Retention | מנגנון / Mechanism |
|-------------|------------------------|---------------------|
| פניות (`leads`) | **עד 24 חודשים** מהפנייה, או עד בקשת מחיקה — המוקדם | מוצהר במדיניות הפרטיות; ראו auto-purge למטה |
| `source_ip` (anti-abuse) | **30 יום** ואז ניקוי ל-NULL | מיושם בפועל — `renewal-reminders` mode `weekly` מנקה `source_ip` של פניות מעל 30 יום |
| תמונת חשבון (bill) | **לא נשמרת** — עיבוד חולף בלבד | by design (`bill_analyses` שומר סיכום בלבד) |
| הודעות WhatsApp | `[[OWNER: set retention with lawyer]]` (proposed 24mo) | auto-purge (planned) |
| ניוזלטר | עד הסרה / until unsubscribe | בקשת המשתמש |
| יומן אבטחה (`security_audit_log`) | `[[OWNER: set, e.g. 12–24mo]]` | auto-purge (planned) |

> **Auto-purge (חדש — מתוכנן / new — planned):** beyond the live 30-day
> `source_ip` clearing, a scheduled **pg_cron** job should hard-delete `leads`
> (and dependent `lead_events`) older than the retention window (proposed 24
> months) and apply matching windows to `whatsapp_*` and `security_audit_log`.
> The 30-day `source_ip` purge is **already implemented and running**; the
> table-wide retention purge is **not yet implemented** — it is a documented plan
> here and an owner action (see [`OWNER_ACTIONS.md`](./OWNER_ACTIONS.md)). Do not
> represent it as live until the cron job is deployed.

**זכויות נושא המידע / Data-subject rights** (עיון, תיקון, מחיקה / access,
correction, deletion): requests to hello@chosech.co.il; fulfilled via the
service-role admin path (the team reads/edits `leads` etc. server-side).

## 7. הרשאות גישה / Access permissions

Access is least-privilege and enforced in the database (Row-Level Security),
not only in application code:

| תפקיד / Role | מה רואה / Sees | כיצד נאכף / Enforcement |
|--------------|----------------|--------------------------|
| `anon` (אנונימי, אתר) | **INSERT בלבד** לפניות; אין SELECT | `leads_insert_anyone` (insert) + `revoke select … from anon` |
| `authenticated` (משתמש אפליקציה) | רק השורות שלו; ב-`leads` רק עמודות בטוחות (`id, status, created_at, user_id`) | RLS `auth.uid() = user_id` + column-scoped grant |
| `service_role` (שרת בלבד) | הכל — עוקף RLS | מפתח `SUPABASE_SERVICE_ROLE_KEY` קיים **רק** בשרת (Vercel env + Edge env), אף פעם לא בדפדפן |
| צוות מכירות / Ops team | קורא/פועל על נתונים תפעוליים | דרך Edge Functions (service-role) + `crm-api` מאחורי **admin gate** (`requireAdmin` → 403) |

**Defence in depth:** even when a row policy lets a session see its own rows,
**column-level GRANTs** are tightened so internal/PII columns (`notes`,
`source_ip`, `city`, `claimed_by*`, `actual_saving`, timestamps) are **never**
client-readable — only the service-role (team) sees them. The `whatsapp_*` and
`security_audit_log` tables have **RLS on with no client policy** → fully locked
to clients; only the service-role reaches them.

## 8. מעבדים / Processors

Personal data is shared with the third-party processors listed in
[`PROCESSOR_REGISTER.md`](./PROCESSOR_REGISTER.md): Supabase (DB/hosting),
Vercel (site hosting), Google (Gemini AI grounding + GA4 analytics), Meta
(WhatsApp Cloud API), Resend (transactional/notification email), Telegram
(internal team lead/meeting notifications), Cloudflare (CDN/edge, where applicable).

## 9. אמצעי אבטחה / Security measures (summary)

Detailed in [`SECURITY_POLICY.md`](./SECURITY_POLICY.md): RLS on every table;
column-scoped grants; server-only service-role key; multi-tier rate-limit +
shape-validation triggers on `leads`; server-authoritative consent stamping
(can't be backdated); HMAC/secret authentication on every webhook
(`x-webhook-secret`, Telegram `secret_token`, Meta `X-Hub-Signature-256`);
TLS in transit + HSTS; `security_audit_log` with a throttled append RPC; secrets
in Supabase Vault (never in client code).

---
_Grounded in: `supabase/schema.sql`, `supabase/legal-consent-2026-06.sql`,
`supabase/leads-city-2026-06.sql`, `supabase/whatsapp-2026-06.sql`,
`web/app/api/lead/route.ts`, `docs/DATA_MODEL.md`, `docs/EDGE_FUNCTIONS.md`,
`supabase/README.md`. Draft — verify with counsel._
