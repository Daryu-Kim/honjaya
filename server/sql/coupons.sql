-- P8 — 재방문 쿠폰.
--
-- 설계
--   * 쿠폰은 전화번호 고객(customers) 에게만 발급합니다. 비회원 쿠폰은 없습니다.
--   * 사용은 결제 1건당 1장(서버가 검증). 사용하면 used_at / used_order_sheet_id 를 남깁니다.
--   * 할인은 AMOUNT(정액) · PERCENT(정률) 두 가지이고, 실제 할인 금액 계산은 서버가 합니다.
--   * /rest/v1 테이블 목록에는 넣지 않습니다 → 직원 API(/api/crm, /api/payments)로만 접근.
--
-- 여러 번 실행해도 안전합니다(if not exists). 기존 데이터는 건드리지 않습니다.

create table if not exists public.coupons (
  id                      text primary key,
  customer_id             text not null references public.customers(id) on delete cascade,
  title                   text not null default '재방문 쿠폰',
  discount_type           text not null default 'AMOUNT' check (discount_type in ('AMOUNT', 'PERCENT')),
  discount_value          integer not null check (discount_value > 0),
  -- 이 금액 이상 결제할 때만 사용할 수 있습니다(0 = 제한 없음).
  min_amount              integer not null default 0 check (min_amount >= 0),
  issued_at               timestamptz not null default now(),
  expires_at              timestamptz not null,
  used_at                 timestamptz,
  used_order_sheet_id     text,
  used_payment_id         text,
  voided_at               timestamptz,
  issued_by_employee_id   text references public.employees(id) on delete set null,
  issued_by_employee_name text not null default '',
  memo                    text not null default '',
  created_at              timestamptz not null default now()
);

create index if not exists coupons_customer_idx
  on public.coupons (customer_id, expires_at desc);

-- 아직 안 쓴 쿠폰만 빠르게 찾습니다(결제 화면 조회용).
create index if not exists coupons_active_idx
  on public.coupons (customer_id, expires_at)
  where used_at is null and voided_at is null;

create index if not exists coupons_order_sheet_idx
  on public.coupons (used_order_sheet_id)
  where used_order_sheet_id is not null;
