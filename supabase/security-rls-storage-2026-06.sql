-- ============================================================================
-- security-rls-storage-2026-06.sql — Switchy RLS + Storage hardening (items 4 & 5)
-- REVIEW, then RUN MANUALLY (Supabase SQL editor or `apply_migration`).
-- NOT auto-applied. Idempotent + re-runnable. Changes NOTHING about pricing/
-- business logic. Touches only access-control (RLS roles + RPC grants + bucket caps).
--
-- Verified live 2026-06-24 against project orzitfqmlvopujsoyigr (security advisor +
-- pg_catalog + storage.buckets). Findings that shaped this file:
--   • RLS is ALREADY enabled on all 34 public tables. §1 is a belt-and-suspenders
--     loop so "RLS on every table" stays true if a table is ever added without it.
--   • `leads` ALREADY denies anon reads in practice: leads_select_own uses
--     auth.uid() = user_id, and anon has a NULL uid → zero rows. §2 only tightens
--     the policy's ROLE scope to `authenticated` so anon is not even in scope
--     (clears advisor 0012 for leads/meetings; matches "DENY SELECT to anon" literally).
--   • INSERT-for-anyone on leads / meetings / plan_views is INTENTIONAL (public
--     lead + meeting capture, view analytics) → LEFT IN PLACE by design.
--   • The service-role-only tables (RLS on + zero policies) already deny anon &
--     authenticated entirely; reachable only via the service role server-side.
-- ============================================================================

-- ── §1. Ensure RLS on every public table (no-op where already enabled) ──────
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security;', r.relname);
  end loop;
end $$;

-- ── §2. Lead / contact data: anon may INSERT, but never SELECT/UPDATE/DELETE ─
-- Re-scope the own-row SELECT to `authenticated` (anon drops out of role scope).
-- INSERT-for-anyone stays — that is how the public lead form submits.
drop policy if exists leads_select_own on public.leads;
create policy leads_select_own on public.leads
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists meetings_select_own on public.meetings;
create policy meetings_select_own on public.meetings
  for select to authenticated
  using (auth.uid() = user_id);

-- Defense-in-depth: there is NO anon UPDATE/DELETE policy on leads today (so anon
-- update/delete is already denied). These drops are guards against a future
-- mistake re-introducing one; they are no-ops if the policies are absent.
drop policy if exists leads_update_anyone on public.leads;
drop policy if exists leads_delete_anyone on public.leads;
drop policy if exists leads_update_own    on public.leads;  -- (none today; keep reads-only for anon)

-- ── §3. (REVIEW BEFORE APPLYING) Lock a SECURITY DEFINER RPC to the server ──
-- Advisor 0029: public.increment_savings(uuid,integer) is SECURITY DEFINER and
-- callable via /rest/v1/rpc by `authenticated`. Savings are written server-side
-- (the realized-savings trigger + edge fns via the service role). IF you confirm
-- NO client (Flutter/web) calls this RPC directly, revoke client EXECUTE:
revoke execute on function public.increment_savings(uuid, integer) from anon, authenticated;
-- (If a client DOES call it, skip this line and instead add an auth.uid() guard
--  inside the function body.)

-- ── §4. (NO CHANGE — documented) Service-role-only tables already anon-deny ──
-- advisor_sessions, agent_tool_calls, ai_sessions, bill_analyses, chat_messages,
-- lead_events, marketing_suppression, meeting_events, newsletter_subscribers,
-- push_deliveries, security_audit_log: RLS on + zero policies = no anon/auth
-- access at all (server/service-role only). Nothing to do.

-- ── §5. (OPTIONAL / MAINTENANCE WINDOW) advisor 0014: pg_net in public schema ─
-- Relocating it is intrusive — DB triggers call net.http_post(...). Only do this
-- deliberately, after auditing every trigger reference:
--   -- create schema if not exists extensions;
--   -- alter extension pg_net set schema extensions;

-- ============================================================================
-- §6. STORAGE buckets — verified live state + recommended caps (item 5)
-- ============================================================================
-- bucket           public  mime-allowlist            note
-- receipts         FALSE   pdf/png/jpeg/webp          ✓ ALREADY PRIVATE + typed. Durable bill/receipt uploads. Serve only via signed URLs.
-- community-media  TRUE    (none)                     ⚠ public + NO size/mime cap — user community media.
-- profiles         TRUE    png/jpeg/webp              public avatars (display use).
-- user-reviews     TRUE    png/jpeg/webp/gif          public review images (display use).
-- site             TRUE    (typed allowlist)          public static-site assets.
--
-- IMPORTANT: BILLS are NOT bucket-stored. site-bill-analyzer receives a base64
-- image, analyzes it in-memory (Vision), and persists only the RESULT into
-- public.bill_analyses. So there is no public "bill bucket" to lock down; the
-- durable upload bucket (`receipts`) is already PRIVATE. Item 5 is largely met.
--
-- Recommended hardening — add a size cap everywhere + a mime allowlist on the one
-- unrestricted bucket (community-media). Run here OR via the Storage dashboard:
update storage.buckets set file_size_limit = 10485760  -- 10 MB
  where id in ('receipts','profiles','user-reviews','community-media');
update storage.buckets
   set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
 where id = 'community-media';
-- Keep `receipts` PRIVATE (never set public = true). Create short-lived signed
-- URLs server-side (service role) when a file must be shown, e.g. 60 seconds:
--   await supabase.storage.from('receipts').createSignedUrl(path, 60)
-- ============================================================================
