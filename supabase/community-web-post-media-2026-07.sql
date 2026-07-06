-- ─────────────────────────────────────────────────────────────────────────────
-- community-web-post-media-2026-07.sql  (2026-07-06)  — Social wave 4b.
--
-- Multiple images per post. The existing community_posts.media_url stays the PRIMARY
-- attachment (image/video/voice, unchanged); this ADDS an ordered child table for
-- EXTRA images so a post can carry a small gallery. Additive, idempotent, backward-
-- compatible (old single-media posts are untouched). ⚠️ web reads post_media → apply
-- at merge. MCP migration: community_post_media_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.post_media (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  url        text not null,
  media_type text not null default 'image' check (media_type in ('image','video')),
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.post_media enable row level security;

-- RLS: public read; write only by the OWNER of the parent post (mirrors the media
-- RLS posture — a user attaches media only to their own post). No is_flagged here;
-- moderation is on the post body/row.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='post_media' and policyname='post_media_select_all') then
    create policy post_media_select_all on public.post_media for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='post_media' and policyname='post_media_insert_own_post') then
    create policy post_media_insert_own_post on public.post_media
      for insert with check (
        exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='post_media' and policyname='post_media_delete_own_post') then
    create policy post_media_delete_own_post on public.post_media
      for delete using (
        exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid())
      );
  end if;
end $$;

grant select on public.post_media to anon, authenticated;
grant insert, delete on public.post_media to authenticated;

create index if not exists post_media_post_idx on public.post_media (post_id, sort);

-- Cap the gallery at 4 extra images per post (enforced in-DB, can't be bypassed).
create or replace function public.post_media_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  select count(*) into v_count from public.post_media where post_id = new.post_id;
  if v_count >= 4 then
    raise exception 'post_media_cap: עד 4 תמונות נוספות לפוסט.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists post_media_cap_trg on public.post_media;
create trigger post_media_cap_trg
  before insert on public.post_media
  for each row execute function public.post_media_cap();

-- Realtime is NOT needed here (galleries are fetched with the post). Rollback: drop
-- trigger + function; drop table post_media (cascades its rows only).
