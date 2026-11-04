-- Honjaya patch-012 — 영업일 시세 히스토리
--
-- 태블릿이 5분마다 "혼자야 지수" 샘플을 이 표에 남깁니다.
-- 한 영업일에 한 줄이고, samples 는 [{ t, i, c }] 형태의 jsonb 배열입니다.
-- (t = 시각 ms, i = 지수, c = 기준 대비 등락률 %)
-- 여러 번 실행해도 안전합니다.

create table if not exists public.market_history (
  id text primary key,
  samples jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.market_history is
  '영업일별 실시간 시세 히스토리. id 는 영업일(YYYY-MM-DD)입니다.';

alter table public.market_history enable row level security;

grant select, insert, update on public.market_history to anon, authenticated;

drop policy if exists "market_history: app read" on public.market_history;

create policy "market_history: app read"
  on public.market_history for select to anon, authenticated
  using (true);

drop policy if exists "market_history: app write" on public.market_history;

create policy "market_history: app write"
  on public.market_history for all to anon, authenticated
  using (true) with check (true);
