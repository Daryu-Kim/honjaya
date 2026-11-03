-- P2-B Web Push: customer push subscriptions + runtime public settings.
-- Run this in Supabase → SQL Editor before deploying the Edge Function.

create table if not exists public.push_subscriptions (
  id text primary key,
  table_number text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_idx
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_table_idx
  on public.push_subscriptions (table_number);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions anon all" on public.push_subscriptions;

create policy "push_subscriptions anon all" on public.push_subscriptions
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.push_subscriptions to anon, authenticated;

-- Public runtime config (the VAPID public key is not a secret).
-- Keeping it in the DB means the key can be rotated without rebuilding the app.
create table if not exists public.app_settings (
  id text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings anon read" on public.app_settings;

create policy "app_settings anon read" on public.app_settings
  for select to anon, authenticated using (true);

grant select on public.app_settings to anon, authenticated;

insert into public.app_settings (id, value)
values (
  'web_push',
  '{"vapidPublicKey": "", "pushEndpoint": "", "anonKey": ""}'::jsonb
)
on conflict (id) do nothing;
