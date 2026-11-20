-- P5 — 포인트 원장(적립/사용/소멸/조정) + 최소 고객 테이블.
--
-- 규칙
--   * 적립 1% (결제 금액 기준, 원 단위 버림), 유효기간 3개월(한국시간 일 끝).
--   * 사용은 1,000P 이상 + 1,000P 단위, 결제 금액 3만원 이상일 때만.
--   * 잔액은 point_ledger.points 의 합계입니다(적립 +, 사용/소멸/차감 −).
--   * 어떤 적립 건에서 얼마를 썼는지는 point_allocations 에 남깁니다(FEFO: 먼저 만료되는 것부터).
--   * 만료는 조회/사용 시점에 EXPIRE 행으로 확정합니다(별도 크론 없음).
--
-- 여러 번 실행해도 안전합니다(if not exists). 기존 데이터는 건드리지 않습니다.

create table if not exists public.customers (
  id         text primary key,
  phone      text not null,
  name       text not null default '',
  memo       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_phone_key
  on public.customers (phone);

create index if not exists customers_created_idx
  on public.customers (created_at desc);

-- 포인트 원장. points 는 부호 있는 값입니다(+적립 / −사용·소멸·차감).
create table if not exists public.point_ledger (
  id            text primary key,
  customer_id   text not null references public.customers(id) on delete cascade,
  entry_type    text not null check (entry_type in ('EARN', 'REDEEM', 'EXPIRE', 'ADJUST')),
  points        integer not null check (points <> 0),
  balance_after integer not null check (balance_after >= 0),
  order_sheet_id text,
  payment_id    text,
  refund_id     text,
  reason        text not null default '',
  -- 적립 건(EARN)만 만료일이 있습니다. ADJUST(+) 는 만료 없음(null).
  expires_at    timestamptz,
  business_date date,
  employee_id   text references public.employees(id) on delete set null,
  employee_name text not null default '',
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists point_ledger_customer_idx
  on public.point_ledger (customer_id, occurred_at desc);

create index if not exists point_ledger_sheet_idx
  on public.point_ledger (order_sheet_id);

-- 만료 대상을 빨리 찾기 위한 인덱스(적립 + 남은 수량 계산용)
create index if not exists point_ledger_earn_idx
  on public.point_ledger (customer_id, expires_at)
  where points > 0;

-- 사용/소멸이 어떤 적립 건에서 빠졌는지 기록합니다.
create table if not exists public.point_allocations (
  id            text primary key,
  customer_id   text not null references public.customers(id) on delete cascade,
  debit_entry_id text not null references public.point_ledger(id) on delete cascade,
  earn_entry_id  text not null references public.point_ledger(id) on delete cascade,
  points        integer not null check (points > 0),
  created_at    timestamptz not null default now()
);

create unique index if not exists point_allocations_pair_key
  on public.point_allocations (debit_entry_id, earn_entry_id);

create index if not exists point_allocations_earn_idx
  on public.point_allocations (earn_entry_id);

create index if not exists point_allocations_debit_idx
  on public.point_allocations (debit_entry_id);

-- 주문서에 이번 결제에서 사용한 포인트를 남깁니다(할인과 구분해서 표시).
alter table public.order_sheets
  add column if not exists points_used integer not null default 0;
