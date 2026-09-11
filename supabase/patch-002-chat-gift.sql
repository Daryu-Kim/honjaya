-- Patch 002: chat rooms (global / table <-> table / table <-> staff) and table gifts.
-- Run once in the Supabase SQL Editor on an existing database.
-- schema.sql already contains everything below, so fresh installs do not need this file.
-- Safe to re-run: every statement is idempotent.
-- patch-001 is still required (products.deleted_at + Realtime publication).

-- 1) chat rooms --------------------------------------------------------------
alter table public.chat_messages
  add column if not exists room_type text not null default 'GLOBAL';
alter table public.chat_messages
  add column if not exists room_key text not null default 'global';
alter table public.chat_messages
  add column if not exists recipient_table_number text not null default '';

-- rows written before rooms existed are all global chat messages
update public.chat_messages
   set room_key = 'global'
 where room_key is null or room_key = '';

update public.chat_messages
   set room_type = 'GLOBAL'
 where room_type is null or room_type = '';

create index if not exists chat_messages_room_key_created_at_idx
  on public.chat_messages (room_key, created_at);

-- 2) table gifts (menu sent to another table) --------------------------------
alter table public.orders
  add column if not exists is_gift boolean not null default false;
alter table public.orders
  add column if not exists gift_to_table_number text not null default '';
alter table public.orders
  add column if not exists gift_to_nickname text not null default '';

-- 3) verification ------------------------------------------------------------
select 'chat_messages' as table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'chat_messages'
   and column_name in ('room_type', 'room_key', 'recipient_table_number')
union all
select 'orders' as table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'orders'
   and column_name in ('is_gift', 'gift_to_table_number', 'gift_to_nickname')
order by table_name, column_name;
