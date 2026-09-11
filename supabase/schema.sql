-- Honjaya — Supabase schema (Firestore migration)
--
-- Apply this file once in the Supabase SQL Editor (or via CLI) BEFORE running
-- scripts/migration/import-supabase.mjs.
--
-- Design notes:
--   * All primary keys keep their original Firestore document IDs (text) so the
--     app's existing references (productId, orderSheetId, categoryIds, ...)
--     stay valid without re-mapping.
--   * Nested app payloads (optionGroups, order items, discounts, ...) are kept
--     as jsonb with their original camelCase keys.
--   * The app has no login yet, so API traffic uses the anon role. Policies
--     below intentionally mirror the previous open Firestore rules; tighten
--     them when the admin side gets real auth.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id text primary key,
  name text not null default '',
  code text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  product_name text not null default '',
  description text not null default '',
  category_id text not null default '',
  category_ids text[] not null default '{}',
  base_price integer not null default 0,
  stock integer not null default 0,
  image_url text not null default '',
  is_active boolean not null default true,
  is_sold_out boolean not null default false,
  sort_order integer not null default 0,
  option_groups jsonb not null default '[]'::jsonb,
  recipe_text text not null default '',
  recipe_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz -- soft delete: rows stay, the app filters deleted_at is null
);

create table if not exists public.order_sheets (
  id text primary key, -- equals the old orderSheetId ('000001' ...)
  sequence_no integer not null unique,
  business_date timestamptz not null,
  table_number text not null default '',
  display_name text not null default '',
  table_nickname text not null default '',
  status text not null default 'OPEN', -- OPEN | PAYMENT_REQUESTED | CLOSED
  payment_status text not null default 'UNPAID', -- UNPAID | REQUESTED | COMPLETED
  payment_method text not null default '',
  total_amount integer not null default 0,
  order_count integer not null default 0,
  latest_order_items_preview jsonb not null default '[]'::jsonb,
  latest_order_summary_text text not null default '',
  original_amount integer,
  discount_total integer,
  discounts jsonb,
  payment_splits jsonb,
  internal_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  closed_at timestamptz
);

create table if not exists public.orders (
  id text primary key,
  order_sheet_id text not null,
  table_number text not null default '',
  display_name text not null default '',
  request_message text not null default '',
  items jsonb not null default '[]'::jsonb,
  total_count integer not null default 0,
  total_price integer not null default 0,
  status text not null default 'REQUESTED', -- REQUESTED | SERVED | CANCELLED
  -- gift orders: the row stays on the sender's sheet (sender pays) and records
  -- which table the item has to be delivered to
  is_gift boolean not null default false,
  gift_to_table_number text not null default '',
  gift_to_nickname text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checkout_requests (
  id text primary key,
  order_sheet_id text not null,
  table_number text not null default '',
  display_name text not null default '',
  status text not null default 'REQUESTED', -- REQUESTED | CONFIRMED | DONE | CANCELLED
  payment_method text not null default '',
  original_amount integer,
  discount_total integer,
  total_amount integer,
  discounts jsonb,
  payment_splits jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.active_order_sheets (
  id text primary key, -- canonical key: table_<normalized table number>
  table_number text not null,
  display_name text not null default '',
  order_sheet_id text not null,
  status text not null default 'OPEN',
  business_date timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id text primary key,
  message text not null default '',
  message_type text not null default 'USER', -- USER | ADMIN | SYSTEM
  table_number text not null default '',
  nickname text not null default '',
  sender_label text not null default '',
  is_deleted boolean not null default false,
  -- chat rooms: 'global' (all tables), 'staff_<table>' (table <-> staff),
  -- 'dm_<a>_<b>' (table <-> table, numbers sorted ascending)
  room_type text not null default 'GLOBAL', -- GLOBAL | STAFF | DIRECT
  room_key text not null default 'global',
  recipient_table_number text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.counters (
  id text primary key, -- e.g. 'orderSheet'
  last_sequence_no integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (query patterns used by the app)
-- ---------------------------------------------------------------------------

create index if not exists products_sort_order_idx
  on public.products (sort_order);

create index if not exists categories_sort_order_idx
  on public.categories (sort_order);

create index if not exists order_sheets_updated_at_idx
  on public.order_sheets (updated_at desc);

create index if not exists order_sheets_table_number_idx
  on public.order_sheets (table_number);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_order_sheet_id_idx
  on public.orders (order_sheet_id);

create index if not exists checkout_requests_status_created_at_idx
  on public.checkout_requests (status, created_at desc);

create index if not exists checkout_requests_order_sheet_id_idx
  on public.checkout_requests (order_sheet_id);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at);

create index if not exists chat_messages_room_key_created_at_idx
  on public.chat_messages (room_key, created_at);

create unique index if not exists active_order_sheets_table_number_idx
  on public.active_order_sheets (table_number);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.order_sheets enable row level security;
alter table public.orders enable row level security;
alter table public.checkout_requests enable row level security;
alter table public.active_order_sheets enable row level security;
alter table public.chat_messages enable row level security;
alter table public.counters enable row level security;

grant usage on schema public to anon, authenticated, service_role;

-- anon/authenticated: verbs the app actually uses (no delete where the app
-- never deletes; active_order_sheets needs delete for payment/close cleanup).
grant select, insert, update, delete on public.categories to anon, authenticated;
grant select, insert, update, delete on public.products to anon, authenticated;
grant select, insert, update on public.order_sheets to anon, authenticated;
grant select, insert, update on public.orders to anon, authenticated;
grant select, insert, update on public.checkout_requests to anon, authenticated;
grant select, insert, update, delete on public.active_order_sheets to anon, authenticated;
grant select, insert, update on public.chat_messages to anon, authenticated;
grant select, insert, update on public.counters to anon, authenticated;

-- service_role bypasses RLS; grant kept explicit for import scripts.
grant all on all tables in schema public to service_role;

create policy "categories: app all"
  on public.categories for all to anon, authenticated
  using (true) with check (true);

create policy "products: app all"
  on public.products for all to anon, authenticated
  using (true) with check (true);

create policy "order_sheets: app all"
  on public.order_sheets for all to anon, authenticated
  using (true) with check (true);

create policy "orders: app all"
  on public.orders for all to anon, authenticated
  using (true) with check (true);

create policy "checkout_requests: app all"
  on public.checkout_requests for all to anon, authenticated
  using (true) with check (true);

create policy "active_order_sheets: app all"
  on public.active_order_sheets for all to anon, authenticated
  using (true) with check (true);

create policy "chat_messages: app all"
  on public.chat_messages for all to anon, authenticated
  using (true) with check (true);

create policy "counters: app all"
  on public.counters for all to anon, authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes subscriptions used by every list view)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.order_sheets,
  public.orders,
  public.checkout_requests,
  public.active_order_sheets,
  public.chat_messages,
  public.products,
  public.categories,
  public.counters;

-- DELETE events only carry the filterable columns with replica identity full
alter table public.order_sheets replica identity full;
alter table public.orders replica identity full;
alter table public.checkout_requests replica identity full;
alter table public.active_order_sheets replica identity full;
alter table public.chat_messages replica identity full;
alter table public.products replica identity full;
alter table public.categories replica identity full;
alter table public.counters replica identity full;
