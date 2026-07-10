-- ── C.2: per-rep CRM roles (crm_members) ────────────────────────────────────
-- Adds a graded CRM permission model BELOW the existing binary is_admin gate,
-- WITHOUT weakening it: is_admin === true stays a full superset (unchanged).
--
-- Why a SEPARATE table (not a profiles.crm_role column): the prod audit for the
-- C.2 security plan (docs/CRM_C2_ROLES_PLAN.md §6) found that `authenticated`
-- holds a TABLE-LEVEL INSERT grant on public.profiles and a row-level
-- `profiles_update_own` (auth.uid() = id) UPDATE policy. A role column on
-- profiles would therefore be safe ONLY by relying on column-level grant hygiene
-- (exactly how is_admin survives). A dedicated table with NO anon/authenticated
-- grants at all removes that dependency entirely — there is simply no
-- user-reachable read or write path to a member's role. This is the T1
-- (self-elevation) mitigation from the plan, done structurally.
--
-- ACCESS MODEL:
--   • RLS is ENABLED with NO policies for anon/authenticated ⇒ they can neither
--     read nor write any row (no policy = deny for non-superuser roles).
--   • ALL privileges are REVOKEd from anon/authenticated (belt-and-suspenders vs.
--     Supabase's default table grants) — the row is invisible to the client key.
--   • The crm-api edge function reads/writes it via the SERVICE ROLE only (which
--     bypasses RLS), behind requireCrmAccess. Role changes go through the audited
--     `setMemberRole` action (admin-only, refuses self-change), logged to
--     security_audit_log (Reg.13) — the SAME trail every CRM control action uses.
--
-- ROLES (capabilities enforced per-action in the edge, see _shared/crm_roles.ts):
--   viewer → read-only CRM (dashboards, lists, details, meetings, analytics)
--   rep    → viewer + operate leads/conversations (status, notes, claim, reply,
--            takeover/handback, meeting status)
--   admin  → is_admin === true; EVERYTHING incl. the sellable-leads feed + role
--            management. (admin is the profiles.is_admin superset, NOT a crm_members row.)
--
-- Apply manually (do NOT auto-apply): run once against the prod project. The
-- table starts EMPTY, so nothing changes until an admin grants the first role —
-- every existing admin keeps full access, every non-admin stays locked out.

create table if not exists public.crm_members (
  uid        uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('viewer', 'rep')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_members is
  'Per-rep CRM roles below the is_admin superset. Service-role-only (RLS on, no anon/authenticated policies); written solely via the audited crm-api setMemberRole action. See docs/CRM_C2_ROLES_PLAN.md.';

alter table public.crm_members enable row level security;

-- No policies are created on purpose: with RLS enabled and no policy, anon and
-- authenticated match nothing → full deny. Only the service role (RLS-exempt)
-- reaches the rows, exclusively through the crm-api edge.

-- Belt-and-suspenders: strip any default table grants Supabase may attach to a
-- new public table, so the client (anon) + logged-in (authenticated) keys have
-- zero privilege on it even independent of RLS.
revoke all on table public.crm_members from anon, authenticated;
