-- Patch 008: anonymous hearts (heart sent from one table to another, revealed only
-- when two tables send hearts to each other).
-- Run once in the Supabase SQL Editor on an existing database.
-- schema.sql already contains everything below, so fresh installs do not need this file.
-- Safe to re-run: every statement is idempotent.

-- 1) table ---------------------------------------------------------------------
create table if not exists public.hearts (
  id text primary key,
  from_table_number text not null default '',
  from_nickname text not null default '',
  to_table_number text not null default '',
  to_nickname text not null default '',
  business_date timestamptz not null default now(), -- 영업일 시작 시각 (KST 15:00)
  is_revealed boolean not null default false,       -- 서로 하트라 닉네임 공개됨
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hearts_business_date_created_at_idx
  on public.hearts (business_date desc, created_at desc);

create index if not exists hearts_pair_idx
  on public.hearts (from_table_number, to_table_number);

-- 2) permissions ---------------------------------------------------------------
alter table public.hearts enable row level security;

grant select, insert, update, delete on public.hearts to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'hearts'
      and policyname = 'hearts: app all'
  ) then
    create policy "hearts: app all"
      on public.hearts for all to anon, authenticated
      using (true) with check (true);
  end if;
end $$;

-- 3) realtime ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hearts'
  ) then
    alter publication supabase_realtime add table public.hearts;
  end if;
end $$;

alter table public.hearts replica identity full;

-- 4) verification --------------------------------------------------------------
-- Expect the 9 columns below and realtime = t.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'hearts'
 order by ordinal_position;

select exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = 'hearts'
       ) as realtime;
