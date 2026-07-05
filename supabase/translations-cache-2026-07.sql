-- ─────────────────────────────────────────────────────────────────────────────
-- site_translations — cache for the on-demand, site-wide UI translation feature
-- (the `translate` edge function). Authored 2026-07-05.
--
-- The public site is Hebrew; visitors can switch to ar/en/ru/am/es/fr. The client
-- sends the visible strings to the `translate` function, which returns + caches the
-- translation here. One row per (source string, target language): the FIRST viewer
-- of a string in a language pays the model latency; everyone after is served from
-- this table in ~100ms.
--
-- Access: the edge function uses the SERVICE ROLE for both read and write, so RLS
-- is enabled with NO anon policy — the public anon key cannot read or write this
-- table directly; every access goes through the (rate-limited, size-capped)
-- function. The content is non-sensitive (public marketing copy), but keeping it
-- service-role-only avoids the table being scraped/poisoned via the anon key.
--
-- Idempotent: safe to run more than once. Apply in the Supabase SQL editor (or via
-- the CI migration path) BEFORE deploying the `translate` function.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.site_translations (
  id           bigint generated always as identity primary key,
  source_hash  text        not null,   -- sha-256 hex of source_text (stable cache key)
  lang         text        not null,   -- target language code: ar|en|ru|am|es|fr
  source_text  text        not null,   -- the Hebrew source (kept for audit/re-warm)
  translated   text        not null,   -- the cached translation served to the client
  created_at   timestamptz not null default now(),
  unique (source_hash, lang)           -- one translation per (string, language)
);

-- The function looks up rows by (lang, source_hash) — this composite index serves
-- both the equality on lang and the IN (…) on source_hash.
create index if not exists site_translations_lang_hash_idx
  on public.site_translations (lang, source_hash);

alter table public.site_translations enable row level security;

-- No policies are defined on purpose: with RLS enabled and no permissive policy,
-- the anon/authenticated roles get zero rows and cannot insert. The service role
-- (used by the edge function) bypasses RLS, so the function keeps full access.


-- ── Global daily model budget ────────────────────────────────────────────────
-- A hard, cross-isolate ceiling on how many strings the paid model may translate
-- per day. The `translate` function's per-IP rate limit is process-local and its
-- key (X-Forwarded-For) is client-spoofable, so it cannot bound TOTAL spend under
-- a distributed / header-rotating flood. This counter can: the function atomically
-- consumes from today's budget BEFORE calling the model, and once the cap is hit,
-- uncached strings simply fail soft to Hebrew. Legitimate steady-state traffic
-- (served from site_translations) sits far below the cap.
create table if not exists public.translation_budget (
  day   date   primary key,
  count bigint not null default 0
);
alter table public.translation_budget enable row level security; -- service-role only

-- Atomic consume-and-check: adds p_n to TODAY's counter only if it stays within
-- p_cap, and reports whether the request may proceed. SECURITY DEFINER so the
-- service role can call it; the row lock (FOR UPDATE) makes concurrent calls safe.
create or replace function public.translate_budget_consume(p_n int, p_cap int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  insert into public.translation_budget (day, count) values (current_date, 0)
    on conflict (day) do nothing;
  select count into v_count from public.translation_budget where day = current_date for update;
  if coalesce(v_count, 0) + p_n > p_cap then
    return false;
  end if;
  update public.translation_budget set count = count + p_n where day = current_date;
  return true;
end;
$$;
revoke all on function public.translate_budget_consume(int, int) from public, anon, authenticated;
