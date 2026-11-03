-- Patch for a database that was imported before this change (run once in the Supabase SQL Editor).
-- schema.sql already contains everything below, so fresh installs do not need this file.
-- Safe to re-run: every statement is idempotent.

-- 1) products soft delete -----------------------------------------------------
alter table public.products add column if not exists deleted_at timestamptz;

create index if not exists products_deleted_at_idx on public.products (deleted_at);

-- 2) realtime (postgres_changes) ---------------------------------------------
do $$
declare
  target_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach target_table in array array[
    'order_sheets',
    'orders',
    'active_order_sheets',
    'chat_messages',
    'products',
    'categories',
    'counters'
  ]
  loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      continue;
    end if;

    execute format(
      'alter publication supabase_realtime add table public.%I',
      target_table
    );
  end loop;
end $$;

-- DELETE events only carry the filterable columns with replica identity full
alter table public.order_sheets replica identity full;
alter table public.orders replica identity full;
alter table public.active_order_sheets replica identity full;
alter table public.chat_messages replica identity full;
alter table public.products replica identity full;
alter table public.categories replica identity full;
alter table public.counters replica identity full;

-- 3) verification -------------------------------------------------------------
-- Expect 7 rows below. If some are missing, re-run this patch (or check that
-- Database -> Replication -> supabase_realtime is enabled in the dashboard).
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;
