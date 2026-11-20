-- P3 — 결제 원장 (payments / payment_allocations / refunds)
--
-- 이전에는 결제 1회 = order_sheets 한 행 덮어쓰기(payment_status, payment_splits)였습니다.
-- 이제 결제 건마다 payments 행을 남겨서
--   * 테이블 중간 부분 결제 (잔액 남기고 나중에 마감)
--   * 마감 시 여러 수단 분할 결제
--   * 인원별 나눠내기 (payer_label)
--   * 부분/전액 환불
-- 을 모두 기록합니다. order_sheets 의 payment_* 컬럼은 화면 호환용으로 계속 갱신합니다.
-- 재실행해도 안전합니다.

create table if not exists public.payments (
  id text primary key,
  order_sheet_id text not null,
  table_number text not null default '',
  -- 영업일 (15:00 KST 기준으로 넘어감). 매출 집계에 사용합니다.
  business_date date not null,
  amount integer not null check (amount > 0),
  method text not null default 'CARD',
  -- 인원별 나눠내기 라벨. 예: "손님1", "홍길동"
  payer_label text not null default '',
  guest_session_id uuid,
  employee_id text references public.employees(id) on delete set null,
  employee_name text not null default '',
  memo text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists payments_order_sheet_id_idx
  on public.payments (order_sheet_id);

create index if not exists payments_business_date_idx
  on public.payments (business_date desc);

create index if not exists payments_occurred_at_idx
  on public.payments (occurred_at desc);

-- 결제 금액을 주문 단위로 배분합니다 (주문별 환불/매출 분석용).
-- 특정 주문에 묶이지 않은 금액(팁, 반올림 차액 등)은 order_id 가 null 입니다.
create table if not exists public.payment_allocations (
  id text primary key,
  payment_id text not null references public.payments(id) on delete cascade,
  order_id text,
  amount integer not null,
  created_at timestamptz not null default now()
);

create index if not exists payment_allocations_payment_id_idx
  on public.payment_allocations (payment_id);

create index if not exists payment_allocations_order_id_idx
  on public.payment_allocations (order_id);

create table if not exists public.refunds (
  id text primary key,
  payment_id text not null references public.payments(id) on delete restrict,
  order_sheet_id text not null,
  business_date date not null,
  amount integer not null check (amount > 0),
  method text not null default '',
  reason text not null default '',
  employee_id text references public.employees(id) on delete set null,
  employee_name text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists refunds_payment_id_idx
  on public.refunds (payment_id);

create index if not exists refunds_order_sheet_id_idx
  on public.refunds (order_sheet_id);

create index if not exists refunds_business_date_idx
  on public.refunds (business_date desc);

-- 누적 결제 금액(환불 차감 후). 주문서 화면에서 잔액을 바로 계산하기 위해 보관합니다.
-- 값은 서버(/api/payments)만 갱신합니다.
alter table public.order_sheets
  add column if not exists paid_amount integer not null default 0;

-- ---------------------------------------------------------------------------
-- 기존 결제 데이터 이관 (payment_splits 스냅샷 → payments)
-- 같은 id 로는 다시 들어가지 않으므로 재실행해도 중복이 생기지 않습니다.
-- ---------------------------------------------------------------------------

insert into public.payments (
  id, order_sheet_id, table_number, business_date, amount, method,
  payer_label, employee_name, memo, occurred_at
)
select
  'legacy_' || s.id || '_' || lpad(split.ord::text, 2, '0'),
  s.id,
  coalesce(s.table_number, ''),
  ((coalesce(s.paid_at, s.updated_at) at time zone 'Asia/Seoul') - interval '15 hours')::date,
  split.amount,
  split.method,
  '',
  '',
  'P3 이관',
  coalesce(s.paid_at, s.updated_at, now())
from public.order_sheets s
cross join lateral (
  select
    item.ord,
    (item.value ->> 'method') as method,
    coalesce((item.value ->> 'amount')::int, 0) as amount
  from jsonb_array_elements(coalesce(s.payment_splits, '[]'::jsonb)) with ordinality as item(value, ord)
  where coalesce((item.value ->> 'amount')::int, 0) > 0
) as split
where s.payment_status = 'COMPLETED'
on conflict (id) do nothing;

-- payment_splits 가 비어 있는 예전 결제는 대표 수단 1건으로 남깁니다.
insert into public.payments (
  id, order_sheet_id, table_number, business_date, amount, method,
  payer_label, employee_name, memo, occurred_at
)
select
  'legacy_' || s.id,
  s.id,
  coalesce(s.table_number, ''),
  ((coalesce(s.paid_at, s.updated_at) at time zone 'Asia/Seoul') - interval '15 hours')::date,
  s.total_amount,
  coalesce(nullif(s.payment_method, ''), 'OTHER'),
  '',
  '',
  'P3 이관',
  coalesce(s.paid_at, s.updated_at, now())
from public.order_sheets s
where s.payment_status = 'COMPLETED'
  and s.total_amount > 0
  and not exists (select 1 from public.payments p where p.order_sheet_id = s.id)
on conflict (id) do nothing;

update public.order_sheets
   set paid_amount = total_amount
 where payment_status = 'COMPLETED'
   and paid_amount = 0
   and total_amount > 0;
