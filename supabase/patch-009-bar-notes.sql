-- Patch 009: today's one line (bar_notes). Each order sheet may leave one short note per
-- business day; notes are shown on the store TV board.
-- Run once in the Supabase SQL Editor on an existing database.
-- schema.sql already contains everything below, so fresh installs do not need this file.
-- Safe to re-run: every statement is idempotent.

-- 1) table ---------------------------------------------------------------------
create table if not exists public.bar_notes (
  id text primary key,
  order_sheet_id text not null default '',
  table_number text not null default '',
  nickname text not null default '',
  message text not null default '',                 -- 저장 전 금칙어 마스킹된 값
  business_date timestamptz not null default now(), -- 영업일 시작 시각 (KST 15:00)
  is_hidden boolean not null default false,         -- 운영자가 숨김 처리
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 주문서당 영업일 1개
create unique index if not exists bar_notes_sheet_business_date_idx
  on public.bar_notes (order_sheet_id, business_date);

create index if not exists bar_notes_business_date_created_at_idx
  on public.bar_notes (business_date desc, created_at desc);

create index if not exists bar_notes_table_number_idx
  on public.bar_notes (table_number);

-- 2) permissions ---------------------------------------------------------------
alter table public.bar_notes enable row level security;

grant select, insert, update, delete on public.bar_notes to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bar_notes'
      and policyname = 'bar_notes: app all'
  ) then
    create policy "bar_notes: app all"
      on public.bar_notes for all to anon, authenticated
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
      and tablename = 'bar_notes'
  ) then
    alter publication supabase_realtime add table public.bar_notes;
  end if;
end $$;

alter table public.bar_notes replica identity full;

-- 4) verification --------------------------------------------------------------
-- Expect the 9 columns below and realtime = t.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'bar_notes'
 order by ordinal_position;

select exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = 'bar_notes'
       ) as realtime;
