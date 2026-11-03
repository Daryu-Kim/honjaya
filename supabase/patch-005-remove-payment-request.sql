-- Patch 005: drop the customer payment-request flow (table + legacy statuses).
-- Run once in the Supabase SQL Editor on an existing database.
-- The app no longer sends/approves checkout requests: customers order normally and
-- staff close tables from the tablet view (직접 결제 처리).
-- Safe to re-run: drop is idempotent and the updates only match legacy values.

-- 1) drop the realtime publication entry (no-op when it is already gone) --------
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'checkout_requests'
  ) then
    alter publication supabase_realtime drop table public.checkout_requests;
  end if;
end $$;

-- 2) drop the request records ----------------------------------------------------
drop table if exists public.checkout_requests;

-- 3) normalize legacy order sheet statuses --------------------------------------
-- PAYMENT_REQUESTED only ever meant "waiting for staff to approve", so the sheet
-- goes back to a normal open sheet. Payments already completed keep COMPLETED.
update public.order_sheets
   set status = 'OPEN',
       updated_at = now()
 where status = 'PAYMENT_REQUESTED';

update public.order_sheets
   set payment_status = 'UNPAID',
       updated_at = now()
 where payment_status = 'REQUESTED';

-- 4) verification ---------------------------------------------------------------
-- Expect 0 rows for both checks.
select count(*) as legacy_sheet_status
  from public.order_sheets
 where status = 'PAYMENT_REQUESTED'
    or payment_status = 'REQUESTED';

select count(*) as leftover_table
  from information_schema.tables
 where table_schema = 'public'
   and table_name = 'checkout_requests';
