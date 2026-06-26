-- Bot knowledge / FAQ-learning layer (2026-06).
-- ─────────────────────────────────────────────────────────────────────────────
-- A truth-only "learning" layer for the Switchy AI agent. TWO tables, both
-- service-role only (RLS on, NO client policy — same shape as security_audit_log):
--
--   (1) public.bot_knowledge ...... a CURATED, truth-only FAQ knowledge base the
--       agent injects into its system prompt so it answers common questions
--       faster + more consistently (fewer tool round-trips). The team grows it by
--       hand — there is NO auto-learning of arbitrary content (that would risk
--       hallucination/abuse). Seeded below from the APPROVED site FAQ copy.
--
--   (2) public.bot_question_log .... the "learning data": every real free-text
--       customer question (+ the matched topic, if any) is appended here by the
--       agent path (fire-and-forget). The team reviews the unmatched / frequent
--       rows to decide which new bot_knowledge entries to add. This is how the
--       agent "learns from every customer's question" — SAFELY (humans curate).
--
-- Service-role only: RLS enabled with NO policy → anon/authenticated get nothing;
-- service_role bypasses RLS. This project's default privileges do NOT grant to
-- service_role, so every new object is granted explicitly (same documented
-- grant-gap incident as schema.sql §grants / audit-observability-2026-06.sql).
--
-- ⚠️  DRAFT — DO NOT AUTO-APPLY. Idempotent / re-runnable. Review, then apply
--     MANUALLY:
--       psql "$DATABASE_URL" -f supabase/bot-knowledge-2026-06.sql
--     (or paste into the Supabase SQL editor).


-- ════════════════════════════════════════════════════════════════════════════
-- (1) bot_knowledge — curated, truth-only FAQ entries injected into the prompt
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.bot_knowledge (
  id                uuid primary key default gen_random_uuid(),
  topic             text        not null,                    -- short human label, e.g. "זה בחינם"
  question_examples text[]      not null default '{}',       -- sample customer phrasings (for cheap matching)
  answer            text        not null,                    -- the APPROVED Hebrew answer (WhatsApp-sized)
  enabled           boolean     not null default true,       -- soft-disable without deleting
  priority          int         not null default 100,        -- lower = injected first (more important)
  source            text,                                    -- provenance, e.g. 'site_faq_2026_06' / 'about'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The agent loads enabled rows ordered by priority — index that exact access path.
create index if not exists bot_knowledge_enabled_priority_idx
  on public.bot_knowledge (enabled, priority);

alter table public.bot_knowledge enable row level security;

-- Deny-all to clients (no policy = no client access; this revoke is belt-and-braces
-- against any stray default grant). service_role bypasses RLS regardless.
revoke all on public.bot_knowledge from anon, authenticated;

-- Grant-gap: default privileges do NOT grant to service_role here, so the edge
-- functions (whatsapp-webhook, service-role) silently 403 on read without this.
grant select, insert, update, delete on public.bot_knowledge to service_role;

comment on table public.bot_knowledge is
  'Curated, truth-only FAQ knowledge base injected into the Switchy AI agent system prompt (service-role only; RLS on, no client policy). Grown by hand by the team — NO auto-learning of arbitrary content. Enabled rows ordered by priority are formatted into a compact Hebrew "verified knowledge" block so the agent answers common questions faster and more consistently.';


-- ════════════════════════════════════════════════════════════════════════════
-- (2) bot_question_log — the learning data: real customer questions + matches
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.bot_question_log (
  id            uuid primary key default gen_random_uuid(),
  channel       text        not null,                        -- e.g. 'whatsapp'
  question      text        not null,                        -- the customer's free-text question (truncated by the caller)
  matched_topic text,                                        -- the bot_knowledge topic we matched, or null (unmatched)
  answered      boolean     not null default false,          -- whether the agent produced a reply this turn
  created_at    timestamptz not null default now()
);

-- The team reviews recent rows (newest first) to find unmatched / frequent
-- questions worth turning into bot_knowledge entries — index that read path.
create index if not exists bot_question_log_created_idx
  on public.bot_question_log (created_at desc);

alter table public.bot_question_log enable row level security;

revoke all on public.bot_question_log from anon, authenticated;

grant select, insert on public.bot_question_log to service_role;

comment on table public.bot_question_log is
  'Learning data for the Switchy AI agent (service-role only; RLS on, no client policy). The agent appends one row per real free-text customer question (channel + question + matched bot_knowledge topic or null + answered). The team reviews unmatched/frequent rows to decide which curated bot_knowledge entries to add. NOT logged on opt-out, human takeover/relay, or system messages.';


-- ════════════════════════════════════════════════════════════════════════════
-- SEED — truth-only Q&As (idempotent; re-running does NOT duplicate)
-- ════════════════════════════════════════════════════════════════════════════
-- SOURCE OF TRUTH: site/index.html — the schema.org FAQPage JSON-LD + the visible
-- FAQ list are the APPROVED, accurate copy (source = 'site_faq_2026_06'). The
-- identity entry ("מי אתם") is NOT in the site FAQ; it is phrased from the site's
-- own Organization/About description (areaServed IL, telecom price-comparison) —
-- NO invented founders/names (source = 'about'). Answers are kept short
-- (WhatsApp-sized), warm, ≤1 emoji, and contain NO fabricated facts/figures.
--
-- Idempotency: we only insert a topic when it is not already present, so the
-- team's later hand-edits to answers/examples are never clobbered by a re-run.
insert into public.bot_knowledge (topic, question_examples, answer, priority, source)
select v.topic, v.question_examples, v.answer, v.priority, v.source
from (
  values
    -- Identity / "who are you" — phrased from the Organization/About description.
    (
      'מי אתם',
      array[
        'מי אתם', 'מי אתה', 'מי עומד מאחורי', 'מי המנהל', 'זה אמיתי',
        'מה זה switchy', 'מי אתם בכלל', 'אתם חברה אמיתית'
      ],
      'אנחנו SWITCHY — שירות ישראלי להשוואת מחירי תקשורת (סלולר, אינטרנט, טלוויזיה, חבילות וחו״ל) וליווי במעבר ספק. אני היועץ החכם של SWITCHY, ואפשר תמיד לחבר גם נציג אנושי 🙂',
      10,
      'about'
    ),
    -- "Is it free / how do you make money" — §7b commission, price unchanged.
    (
      'זה בחינם',
      array[
        'זה בחינם', 'זה באמת בחינם', 'כמה זה עולה לי', 'איך אתם מרוויחים',
        'מאיפה אתם מרוויחים', 'יש עמלה', 'אני משלם לכם', 'זה עולה כסף'
      ],
      'כן, לחלוטין בחינם בשבילכם. אנחנו מקבלים עמלה מחברת התקשורת כשעוברים — אתם לא משלמים לנו אגורה, והמחיר שלכם זהה.',
      20,
      'site_faq_2026_06'
    ),
    -- Number portability.
    (
      'ניוד מספר',
      array[
        'המספר נשמר', 'המספר שלי נשמר', 'אני שומר על המספר', 'ניוד מספר',
        'אאבד את המספר', 'המספר נשאר אותו דבר', 'מה עם המספר שלי'
      ],
      'בוודאי. ניוד המספר שומר על המספר הקיים שלכם, והוא מתבצע תוך 1–3 ימי עסקים בליווי שלנו.',
      30,
      'site_faq_2026_06'
    ),
    -- Which providers we compare.
    (
      'אילו חברות',
      array[
        'אילו חברות אתם משווים', 'אילו חברות', 'את מי אתם משווים',
        'אילו ספקים', 'איזה חברות יש לכם', 'יש לכם את פלאפון', 'משווים את סלקום'
      ],
      'את כולן — פלאפון, סלקום, פרטנר, הוט, גולן, 019, רמי לוי, בזק, yes ועוד, בכל הקטגוריות.',
      40,
      'site_faq_2026_06'
    ),
    -- How long the process takes.
    (
      'כמה זמן',
      array[
        'כמה זמן לוקח', 'כמה זמן התהליך', 'כמה זמן זה לוקח', 'תוך כמה זמן',
        'כמה זמן עד שעוברים', 'מתי זה מסתיים'
      ],
      'השאלון לוקח כ-2 דקות וההשוואה מיידית. נציג חוזר אליכם בהקדם (בשעות הפעילות) להשלמת המעבר, וניוד המספר מתבצע תוך 1–3 ימי עסקים.',
      50,
      'site_faq_2026_06'
    ),
    -- Renewal/promo-end alert.
    (
      'התראת חידוש',
      array[
        'מהי התראת החידוש', 'התראת חידוש', 'התראה על מבצע', 'מה זה התראת חידוש',
        'מתי המבצע נגמר', 'תזכירו לי לפני שהמחיר עולה'
      ],
      'מסלולים רבים זולים בשנה הראשונה ואז קופצים. SWITCHY עוקב ומזכיר לכם ~21 יום לפני סיום המבצע — כדי שתשוו שוב ולא תשלמו יותר מדי.',
      60,
      'site_faq_2026_06'
    ),
    -- How to start / how the process works.
    (
      'איך מתחילים',
      array[
        'איך מתחילים', 'איך זה עובד', 'איך התהליך עובד', 'מה עושים',
        'מאיפה מתחילים', 'איך עוברים', 'מה הצעד הראשון'
      ],
      'פשוט: עונים על שאלון קצר (כ-2 דקות) על מה שאתם משלמים היום ומה חשוב לכם, מקבלים המלצה חכמה שמשווה את כל החברות, ועוברים בליווי מלא שלנו. רוצים שאתחיל איתכם עכשיו? 🙂',
      70,
      'site_faq_2026_06'
    )
) as v(topic, question_examples, answer, priority, source)
where not exists (
  select 1 from public.bot_knowledge bk where bk.topic = v.topic
);
