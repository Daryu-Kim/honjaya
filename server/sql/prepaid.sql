-- P10 — 선불권(회원 귀속 잔액형).
--
-- 규칙
--   * 선불권은 전화번호 고객(customers) 에게 귀속됩니다. 양도/코드 전달은 없습니다(P11 기프티콘 담당).
--   * 판매가(price_paid)와 충전금액(face_value)을 따로 둡니다. 예: 10만원 결제 → 12만원 충전.
--   * 사용 조건(유효기간·최소 결제금액·1회 사용한도·사용 요일/시간)은 상품(prepaid_plans)에서 정하고,
--     발급 시점 값을 선불권에 복사(snapshot)합니다. 나중에 상품을 수정해도 이미 판 선불권은 그대로입니다.
--   * "구매 후 다음 방문부터 사용" — 구매 영업일의 다음 영업일부터 사용할 수 있습니다.
--     (영업일은 15:00 KST 기준이라 00:30 구매도 같은 영업일로 계산됩니다.)
--   * 사용은 결제 수단 PREPAID 로 처리합니다. 이미 돈을 받았으므로 할인이 아니라 결제입니다.
--   * 잔액/만료/조정 내역은 prepaid_transactions 원장에 남깁니다.
--   * /rest/v1 테이블 목록에는 넣지 않습니다 → 직원 API(/api/prepaid, /api/payments)로만 접근.
--
-- 여러 번 실행해도 안전합니다(if not exists). 기존 데이터는 건드리지 않습니다.

-- 선불권 상품(관리자가 화면에서 직접 세팅).
create table if not exists public.prepaid_plans (
  id                     text primary key,
  name                   text not null,
  -- 판매가: 손님이 실제로 내는 금액.
  price                  integer not null check (price > 0),
  -- 충전금액: 잔액으로 들어가는 금액(보너스 충전이면 판매가보다 큽니다).
  face_value             integer not null check (face_value > 0),
  -- 유효기간(개월). 0 = 무제한.
  validity_months        integer not null default 3 check (validity_months >= 0),
  -- 이 금액 이상 결제할 때만 사용 가능(0 = 제한 없음).
  min_payment_amount     integer not null default 0 check (min_payment_amount >= 0),
  -- 1회 최소 사용 금액(0 = 제한 없음).
  min_use_amount         integer not null default 0 check (min_use_amount >= 0),
  -- 1회 결제 금액의 최대 몇 %까지 사용할 수 있는지(100 = 제한 없음).
  max_use_percent        integer not null default 100
                           check (max_use_percent between 1 and 100),
  -- 사용 가능 요일(ISO: 1=월 … 7=일). 빈 배열 = 제한 없음.
  usable_days            smallint[] not null default '{}'::smallint[],
  -- 사용 가능 시간대(KST). 둘 다 null = 제한 없음. from > to 이면 자정을 넘는 구간입니다.
  usable_from_time       time,
  usable_to_time         time,
  -- 구매한 영업일의 다음 영업일부터 사용(손님이 그 자리에서 바로 쓰는 것 방지).
  usable_from_next_visit boolean not null default true,
  -- 같은 상품을 여러 번 구매할 수 있는지.
  allow_multiple         boolean not null default true,
  is_active              boolean not null default true,
  sort_order             integer not null default 0,
  memo                   text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists prepaid_plans_active_idx
  on public.prepaid_plans (is_active, sort_order, price);

-- 발급된 선불권. 상품 조건을 발급 시점 값으로 복사해 둡니다.
create table if not exists public.prepaid_passes (
  id                      text primary key,
  -- 직원이 화면에서 부를 수 있는 짧은 번호(P-XXXXXX).
  code                    text not null default '',
  customer_id             text not null references public.customers(id) on delete cascade,
  plan_id                 text references public.prepaid_plans(id) on delete set null,
  plan_name               text not null default '',
  price_paid              integer not null default 0 check (price_paid >= 0),
  face_value              integer not null check (face_value > 0),
  balance                 integer not null check (balance >= 0),
  purchased_at            timestamptz not null default now(),
  purchase_business_date  date not null,
  -- 이 날짜(영업일)부터 사용할 수 있습니다.
  usable_from_date        date not null,
  -- null = 무제한.
  expires_at              timestamptz,
  status                  text not null default 'ACTIVE'
                            check (status in ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'VOID')),
  -- 판매 결제 수단(CARD/CASH/BANK/...).
  payment_method          text not null default 'CARD',
  min_payment_amount      integer not null default 0 check (min_payment_amount >= 0),
  min_use_amount          integer not null default 0 check (min_use_amount >= 0),
  max_use_percent         integer not null default 100
                            check (max_use_percent between 1 and 100),
  usable_days             smallint[] not null default '{}'::smallint[],
  usable_from_time        time,
  usable_to_time          time,
  memo                    text not null default '',
  issued_by_employee_id   text references public.employees(id) on delete set null,
  issued_by_employee_name text not null default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists prepaid_passes_customer_idx
  on public.prepaid_passes (customer_id, purchased_at desc);

-- 결제 화면에서 쓸 수 있는 선불권만 빠르게 찾습니다.
create index if not exists prepaid_passes_usable_idx
  on public.prepaid_passes (customer_id, usable_from_date, expires_at)
  where status = 'ACTIVE';

create unique index if not exists prepaid_passes_code_key
  on public.prepaid_passes (code)
  where code <> '';

-- 잔액 원장. amount 는 부호 있는 잔액 변화입니다(+충전·복원 / −사용·조정·소멸).
create table if not exists public.prepaid_transactions (
  id             text primary key,
  pass_id        text not null references public.prepaid_passes(id) on delete cascade,
  customer_id    text not null references public.customers(id) on delete cascade,
  entry_type     text not null
                   check (entry_type in ('PURCHASE', 'USE', 'ADJUST', 'EXPIRE', 'RESTORE')),
  amount         integer not null,
  balance_after  integer not null check (balance_after >= 0),
  -- PURCHASE 일 때 실제로 받은 판매가(매출 집계용). 나머지는 0.
  paid_amount    integer not null default 0 check (paid_amount >= 0),
  payment_id     text,
  refund_id      text,
  order_sheet_id text,
  business_date  date,
  reason         text not null default '',
  employee_id    text references public.employees(id) on delete set null,
  employee_name  text not null default '',
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists prepaid_transactions_pass_idx
  on public.prepaid_transactions (pass_id, occurred_at desc);

create index if not exists prepaid_transactions_customer_idx
  on public.prepaid_transactions (customer_id, occurred_at desc);

create index if not exists prepaid_transactions_payment_idx
  on public.prepaid_transactions (payment_id)
  where payment_id is not null;

create index if not exists prepaid_transactions_date_idx
  on public.prepaid_transactions (business_date, entry_type);
