-- 매장 테이블(홀) 마스터. 실제로 존재하는 테이블 목록을 여기서 관리합니다.
-- 주문서(order_sheets)는 "손님이 입장한 테이블"에만 생기므로, 빈 테이블까지 보여주려면
-- 이 마스터 표가 필요합니다. 재실행해도 안전합니다(기존 행은 건드리지 않음).

create table if not exists public.bar_tables (
  table_number integer primary key,
  zone text not null default 'BAR', -- BAR | LARGE
  seat_capacity integer not null default 4,
  display_name text not null default '', -- 비우면 앱이 "N번 테이블" 로 표시
  is_active boolean not null default true,
  sort_order integer not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bar_tables_zone_check'
  ) then
    alter table public.bar_tables
      add constraint bar_tables_zone_check check (zone in ('BAR', 'LARGE'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bar_tables_table_number_check'
  ) then
    alter table public.bar_tables
      add constraint bar_tables_table_number_check
      check (table_number between 1 and 999);
  end if;
end $$;

create index if not exists bar_tables_order_idx
  on public.bar_tables (is_active, sort_order, table_number);

-- 기본 배치: 1~10번 = 바 좌석, 11~30번 = 큰 테이블.
-- 좌석 수는 초기값일 뿐이며 관리자 화면에서 바꿀 수 있습니다.
insert into public.bar_tables (table_number, zone, seat_capacity, sort_order)
select
  n,
  case when n <= 10 then 'BAR' else 'LARGE' end,
  case when n <= 10 then 4 else 8 end,
  n
from generate_series(1, 30) as n
on conflict (table_number) do nothing;
