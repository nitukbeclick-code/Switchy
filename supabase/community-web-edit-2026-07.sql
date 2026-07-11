-- ─────────────────────────────────────────────────────────────────────────────
-- community-web-edit-2026-07.sql  (2026-07-06)  — Social wave 3.
--
-- Lets a member edit their OWN post / reply, with a truthful "נערך" indicator, and
-- closes the moderation-bypass an edit would otherwise open (the moderate edge fn
-- only ran on INSERT, so edited-in spam sailed through). Additive, idempotent.
-- ⚠️ web reads edited_at + the edge fn must accept UPDATE → apply at merge, and
-- redeploy the community-moderate function. MCP migration: community_content_edit_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

-- (1) Truthful "edited" stamp (NULL until the first real edit).
alter table public.community_posts   add column if not exists edited_at timestamptz;
alter table public.community_replies  add column if not exists edited_at timestamptz;

-- (2) Replies had NO update policy and NO update grant — editing was impossible.
-- Add an own-row UPDATE policy + a COLUMN-SCOPED grant (body, edited_at only) so a
-- user can only edit their reply's text, never escalate is_flagged/user_id/etc.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_replies' and policyname='replies_update_own') then
    create policy replies_update_own on public.community_replies
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
grant update (body, edited_at) on public.community_replies to authenticated;
-- Posts already have posts_update_own + the community_posts_guard_update trigger
-- (community-posts-update-guard-2026-07) which pins is_pinned/is_flagged/... for
-- owners, so an owner post UPDATE can only really change body + edited_at. No grant
-- change needed for posts.

-- (3) Surface edited_at through the feed view (explicit column list — must re-create).
-- ⚠️ SUPERSEDED: this community_feed definition was later replaced by
-- community-web-provider-tag → community-accepted-answer-2026-07.sql (the
-- CANONICAL copy, + the security_invoker ALTER in security-views-hardening-
-- 2026-07.sql). Re-running the view below against prod ERRORS (CREATE OR
-- REPLACE VIEW cannot drop the later columns) — skip section (3); the rest of
-- this file (edited_at columns, reply policy/grant, re-moderation trigger) is
-- still current.
create or replace view public.community_feed as
  select
    p.id, p.user_id, p.author, p.avatar, p.channel, p.body,
    p.media_type, p.media_url, p.media_duration_ms, p.created_at,
    coalesce(l.cnt, 0::bigint) as like_count,
    coalesce(r.cnt, 0::bigint) as reply_count,
    p.is_flagged, p.moderation_note, p.is_pinned,
    p.edited_at
  from community_posts p
    left join (select post_id, count(*) as cnt from post_likes group by post_id) l on l.post_id = p.id
    left join (select post_id, count(*) as cnt from community_replies group by post_id) r on r.post_id = p.id;
grant select on public.community_feed to anon, authenticated;

-- (4) Re-moderate on edit. Mirrors notify_community_moderate_on_insert but fires only
-- when the BODY actually changed, and sends type='UPDATE' so the edge fn re-classifies
-- (and can CLEAR a stale classifier flag when the edit is now clean, or RAISE one when
-- the edit introduced a violation). The community_posts_guard_update trigger keeps a
-- non-admin owner from touching is_flagged directly; only the edge fn (service_role)
-- changes it.
create or replace function public.notify_community_moderate_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  if new.body is not distinct from old.body then
    return new; -- nothing to re-moderate (media/other-column change)
  end if;
  begin
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'lead_webhook_secret';
  exception when others then
    secret := null;
  end;
  if secret is null then return new; end if;
  perform net.http_post(
    url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/community-moderate',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    body    := jsonb_build_object('type', 'UPDATE', 'table', tg_table_name, 'record', to_jsonb(new))
  );
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.notify_community_moderate_on_update() from public, anon, authenticated;

drop trigger if exists notify_community_moderate_on_update on public.community_posts;
create trigger notify_community_moderate_on_update
  after update of body on public.community_posts
  for each row execute function public.notify_community_moderate_on_update();

drop trigger if exists notify_community_moderate_on_update on public.community_replies;
create trigger notify_community_moderate_on_update
  after update of body on public.community_replies
  for each row execute function public.notify_community_moderate_on_update();

-- Rollback: drop the two update triggers + function; recreate community_feed without
-- edited_at; drop policy replies_update_own; revoke update on community_replies;
-- alter table drop column edited_at (both tables).
