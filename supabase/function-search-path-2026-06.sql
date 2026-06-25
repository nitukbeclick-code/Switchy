-- Pin search_path on public.set_updated_at() (2026-06).
-- ───────────────────────────────────────────────────────────────────────────
-- The Supabase advisor raises `function_search_path_mutable` (WARN) for any
-- SECURITY-context function whose search_path is not pinned: a mutable
-- search_path lets a caller shadow built-in objects via a schema earlier on the
-- path, which is an injection vector. The generic "stamp updated_at" trigger
-- function set_updated_at() (defined in schema.sql) is the flagged function.
--
-- Signature confirmed from schema.sql: it takes no arguments —
--   create or replace function public.set_updated_at()
--   returns trigger language plpgsql as $$ … new.updated_at = now(); … $$;
--
-- `alter function … set search_path = ''` empties the path (the strictest form
-- the advisor accepts): the function body uses no unqualified objects — only the
-- built-in now() and the trigger's NEW record — so an empty search_path is safe
-- and does not change behaviour. We use ALTER (not CREATE OR REPLACE) so the
-- function body is left untouched and only the config is pinned. Idempotent /
-- re-runnable (re-setting the same search_path is a no-op).

alter function public.set_updated_at() set search_path = '';
