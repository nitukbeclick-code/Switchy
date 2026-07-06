-- ─────────────────────────────────────────────────────────────────────────────
-- community-admin-2026-07.sql  (2026-07-06)  — roadmap item #2 (admin moderation).
--
-- Backs the /community/admin dashboard. community_reports gains a lifecycle; a
-- profiles.is_banned flag blocks a banned user's new content in-DB; and THREE
-- SECURITY DEFINER RPCs (service_role-only, each with its OWN is_admin re-check as
-- defense-in-depth behind the edge fn's requireAdmin gate) do the privileged work —
-- the browser can NEVER read reports or mutate others' content (RLS forbids it).
--
-- PREREQUISITE (already live): community-web-hardening FIX 1 revoked the client's
-- UPDATE on profiles.is_admin, so requireAdmin()/the is_admin guards are trustworthy.
-- Additive, idempotent. Apply as MCP migration: community_admin_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

-- (1) Report lifecycle so a worked queue doesn't re-show resolved items.
alter table public.community_reports add column if not exists status      text not null default 'open'
  check (status in ('open','resolved','dismissed'));
alter table public.community_reports add column if not exists resolved_at timestamptz;
alter table public.community_reports add column if not exists resolved_by uuid references auth.users(id);
alter table public.community_reports add column if not exists resolution  text;
create index if not exists community_reports_status_idx on public.community_reports (status, created_at desc);

-- (2) A hard ban flag (admin-only; NOT in the authenticated UPDATE whitelist, so a
-- user can't self-ban/unban). Enforced in-DB on insert so it can't be bypassed.
alter table public.profiles add column if not exists is_banned boolean not null default false;

create or replace function public.community_block_banned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id and is_banned = true) then
    raise exception 'user_banned' using errcode = 'check_violation';
  end if;
  return new;
end; $$;
revoke execute on function public.community_block_banned() from public, anon, authenticated;
drop trigger if exists community_posts_block_banned on public.community_posts;
create trigger community_posts_block_banned before insert on public.community_posts
  for each row execute function public.community_block_banned();
drop trigger if exists community_replies_block_banned on public.community_replies;
create trigger community_replies_block_banned before insert on public.community_replies
  for each row execute function public.community_block_banned();

-- (3) Privileged RPCs — SECURITY DEFINER, service_role-only, each re-checks is_admin.
-- approve → clear the flag; remove → hard-delete. p_table whitelisted.
create or replace function public.admin_moderate_content(
  p_admin uuid, p_table text, p_id uuid, p_action text, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin = true) then
    raise exception 'not_admin';
  end if;
  if p_table not in ('community_posts','community_replies') then raise exception 'bad_table'; end if;
  if p_action = 'approve' then
    execute format('update public.%I set is_flagged = false, moderation_note = null, flagged_at = null where id = $1', p_table) using p_id;
  elsif p_action = 'remove' then
    execute format('delete from public.%I where id = $1', p_table) using p_id;
  else
    raise exception 'bad_action';
  end if;
  begin
    insert into public.security_audit_log (user_id, event, detail)
    values (p_admin, 'community_admin_moderate', jsonb_build_object('table', p_table, 'id', p_id, 'action', p_action, 'note', p_note));
  exception when others then null;
  end;
end; $$;
revoke execute on function public.admin_moderate_content(uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_moderate_content(uuid,text,uuid,text,text) to service_role;

create or replace function public.admin_set_ban(p_admin uuid, p_user uuid, p_banned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin = true) then raise exception 'not_admin'; end if;
  update public.profiles set is_banned = p_banned, updated_at = now() where id = p_user;
  begin
    insert into public.security_audit_log (user_id, event, detail)
    values (p_admin, 'community_admin_ban', jsonb_build_object('user', p_user, 'banned', p_banned));
  exception when others then null;
  end;
end; $$;
revoke execute on function public.admin_set_ban(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin_set_ban(uuid,uuid,boolean) to service_role;

create or replace function public.admin_resolve_report(
  p_admin uuid, p_report uuid, p_status text, p_resolution text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin = true) then raise exception 'not_admin'; end if;
  if p_status not in ('open','resolved','dismissed') then raise exception 'bad_status'; end if;
  update public.community_reports
     set status = p_status,
         resolved_at = case when p_status = 'open' then null else now() end,
         resolved_by = case when p_status = 'open' then null else p_admin end,
         resolution  = p_resolution
   where id = p_report;
  begin
    insert into public.security_audit_log (user_id, event, detail)
    values (p_admin, 'community_admin_resolve', jsonb_build_object('report', p_report, 'status', p_status));
  exception when others then null;
  end;
end; $$;
revoke execute on function public.admin_resolve_report(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_resolve_report(uuid,uuid,text,text) to service_role;

-- Rollback: drop the three admin_* functions + the ban trigger/function; alter table
-- drop is_banned + the community_reports lifecycle columns.
