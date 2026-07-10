-- ── security: narrow client INSERT on public.profiles (§8, defense-in-depth) ──
-- The C.2 prod audit (docs/CRM_C2_ROLES_PLAN.md §8) found that `authenticated`
-- held a TABLE-LEVEL INSERT grant on public.profiles. Combined with the
-- `profiles_insert_own` RLS policy (WITH CHECK auth.uid() = id), that let a client
-- set ANY column at row-creation — including the privileged flags is_admin,
-- is_banned, is_verified_customer, total_savings*, the telegram_* fields, the
-- registration_ip and the consent stamps. It was mitigated in practice only by the
-- handle_new_user trigger pre-creating the row (so a second client INSERT hits a
-- PK conflict), NOT by the grants. This closes it structurally.
--
-- WHY NARROW (not revoke): the Flutter client legitimately UPSERTs its own profile
-- (id + name/phone/email, bills, renewal_reminders, quiz — see
-- lib/services/backend/supabase_backend.dart), and a PostgREST upsert needs INSERT
-- privilege on the columns it sends. So we REVOKE the blanket table-level INSERT
-- and re-GRANT INSERT on exactly the self-service columns — the SAME set that
-- already carries the column-specific UPDATE grant, plus `id` for the PK. The row
-- itself is still created by handle_new_user() (SECURITY DEFINER, inserts id+email,
-- runs as owner so it is unaffected by these grants). `anon` has no INSERT on
-- profiles and is untouched.
--
-- RESULT: a client can INSERT/UPDATE only the self-service columns; the privileged
-- columns default at row-creation and can be changed solely by service-role /
-- SECURITY DEFINER paths (e.g. admin flows, verified-customer flow, savings RPC).
--
-- REVERSIBLE in one statement if ever needed:
--   grant insert on public.profiles to authenticated;
--
-- Apply manually (do NOT auto-apply): run once against the prod project.

revoke insert on public.profiles from authenticated;

grant insert (
  id,
  name,
  phone,
  email,
  avatar_url,
  bio,
  bills,
  quiz,
  renewal_reminders,
  community_digest_opt_in,
  community_notify_opt_out,
  updated_at
) on public.profiles to authenticated;
