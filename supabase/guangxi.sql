-- 广西 2026 独立分支：在 Supabase SQL Editor 执行一次；可重复执行。
-- 仅创建广西专用表、策略与私有 bucket，不迁移或修改青甘数据。
begin;
create table if not exists public.guangxi_trip_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.guangxi_trip_photos (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null check (day in ('d1','d2','d3','d4','d5','d6','d7')),
  category text not null default 'scenery' check (category in ('scenery','food')),
  meal text not null default 'dinner',
  caption text not null default '',
  file_path text not null,
  original_name text not null default '',
  created_at bigint not null,
  size_bytes bigint not null default 0
);
create table if not exists public.guangxi_trip_comments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('day','photo')),
  target_id text not null,
  author_name text not null,
  author_color text not null default '#bd6d3a',
  body text not null check (char_length(body) between 1 and 500),
  created_at bigint not null
);
create index if not exists guangxi_photos_user_created on public.guangxi_trip_photos(user_id, created_at);
create index if not exists guangxi_comments_user_created on public.guangxi_trip_comments(user_id, created_at);
alter table public.guangxi_trip_state enable row level security;
alter table public.guangxi_trip_photos enable row level security;
alter table public.guangxi_trip_comments enable row level security;
revoke all on public.guangxi_trip_state, public.guangxi_trip_photos, public.guangxi_trip_comments from anon;
grant select, insert, update, delete on public.guangxi_trip_state, public.guangxi_trip_photos, public.guangxi_trip_comments to authenticated;
do $$
declare trip_table text;
begin
  foreach trip_table in array array['guangxi_trip_state','guangxi_trip_photos','guangxi_trip_comments'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = trip_table and policyname = 'guangxi_owner_access') then
      execute format('create policy guangxi_owner_access on public.%I for all to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id)', trip_table);
    end if;
  end loop;
end $$;
insert into storage.buckets(id, name, public)
values ('guangxi-trip-photos', 'guangxi-trip-photos', false)
on conflict (id) do nothing;
-- Photos are stored under <auth user ID>/<photo ID>.jpg.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'guangxi_photo_owner_access') then
    create policy guangxi_photo_owner_access on storage.objects for all to authenticated
      using (bucket_id = 'guangxi-trip-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'guangxi-trip-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  -- Keep existing publication membership, including the Qinggan tables.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'guangxi_trip_comments') then
    alter publication supabase_realtime add table public.guangxi_trip_comments;
  end if;
end $$;
commit;
