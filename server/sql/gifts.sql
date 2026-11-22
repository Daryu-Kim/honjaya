-- P11 — 혼자야 기프티콘(코드 기반 1회용 교환권).
--
-- 규칙
--   * 코드를 가진 사람이 사용합니다. 구매자/받는 분은 기록용 정보일 뿐입니다(선불권과 반대).
--     → 선불권은 회원 귀속 잔액형, 기프티콘은 코드 기반 1회용입니다.
--   * 한 번 쓰면 끝입니다. 액면가가 결제 금액보다 크면 남은 차액은 소멸합니다(기프티콘 관례).
--     차액은 forfeited_amount 에 기록만 남깁니다. 잔액 개념이 없으므로 이월하지 않습니다.
--   * 두 종류를 한 테이블로 다룹니다.
--       ITEM   — 특정 메뉴 교환권. 액면가 = 발급 시점 메뉴 가격 snapshot.
--       AMOUNT — 금액권.
--     결제에서는 둘 다 액면가만큼 결제된 것으로 처리합니다(교환할 메뉴가 실제 주문에 있는지는
--     직원이 화면에서 확인합니다).
--   * 즉시 사용 가능합니다(선불권의 "다음 방문부터" 규칙 없음). expires_at 까지만 유효.
--   * 만료는 조회 시점에 EXPIRED 로 확정합니다(포인트·선불권과 같은 lazy 방식).
--   * 사용은 결제 수단 GIFT_CERT 로 처리합니다. 기존 외부 상품권 GIFT_CARD 와 다른 값입니다.
--   * /rest/v1 테이블 목록에는 넣지 않습니다 → 직원 API(/api/gifts, /api/payments)로만 접근.
--     공개 조회는 /api/public/gifts/:code 하나뿐입니다.
--
-- 여러 번 실행해도 안전합니다(if not exists). 기존 데이터는 건드리지 않습니다.

-- 기프티콘 상품(관리자가 화면에서 직접 세팅).
create table if not exists public.gift_products (
  id                  text primary key,
  name                text not null,
  kind                text not null default 'AMOUNT' check (kind in ('ITEM', 'AMOUNT')),
  -- ITEM 일 때 교환할 메뉴. 메뉴가 삭제되어도 발급 내역은 남아야 하므로 set null.
  product_id          text references public.products(id) on delete set null,
  product_name        text not null default '',
  -- 액면가: 결제에서 인정되는 금액. ITEM 이면 발급 시점 메뉴 가격이 기본값입니다.
  face_value          integer not null check (face_value > 0),
  -- 판매가: 손님이 실제로 내는 금액.
  price               integer not null check (price > 0),
  -- 유효기간(일). 0 = 무제한.
  validity_days       integer not null default 90 check (validity_days >= 0),
  theme               text not null default 'SOLO_NIGHT',
  -- 받는 분에게 남길 수 있는 메시지 길이.
  message_max_length  integer not null default 100
                        check (message_max_length between 0 and 500),
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  memo                text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists gift_products_active_idx
  on public.gift_products (is_active, sort_order, price);

-- 발급된 기프티콘. 상품 정보를 발급 시점 값으로 복사(snapshot)해 둡니다.
create table if not exists public.gift_certificates (
  id                      text primary key,
  -- 손님이 보여주는 코드(G-XXXXXXXX). 대소문자 구분 없이 조회합니다(저장은 대문자).
  code                    text not null,
  gift_product_id         text references public.gift_products(id) on delete set null,
  product_name            text not null default '',
  kind                    text not null default 'AMOUNT' check (kind in ('ITEM', 'AMOUNT')),
  face_value              integer not null check (face_value > 0),
  theme                   text not null default 'SOLO_NIGHT',
  status                  text not null default 'ACTIVE'
                            check (status in ('ACTIVE', 'USED', 'EXPIRED', 'VOID')),
  price_paid              integer not null default 0 check (price_paid >= 0),
  -- 판매 대금을 받은 수단(CARD / CASH / BANK / OTHER). 매출 대사용.
  payment_method          text not null default 'CARD',
  -- 구매자(선택). 회원이 아니어도 됩니다.
  buyer_customer_id       text references public.customers(id) on delete set null,
  buyer_name              text not null default '',
  buyer_phone             text not null default '',
  recipient_name          text not null default '',
  recipient_phone         text not null default '',
  message                 text not null default '',
  purchased_at            timestamptz not null default now(),
  purchase_business_date  date not null,
  -- null = 무제한.
  expires_at              timestamptz,
  used_at                 timestamptz,
  used_order_sheet_id     text,
  used_payment_id         text,
  -- 액면가 - 실제 사용 금액. 차액은 소멸하며 여기에 기록만 남깁니다.
  forfeited_amount        integer not null default 0 check (forfeited_amount >= 0),
  redeemed_by_employee_id   text references public.employees(id) on delete set null,
  redeemed_by_employee_name text not null default '',
  -- 전달(문자 발송) 기록.
  sent_at                 timestamptz,
  sent_channel            text not null default '',
  voided_at               timestamptz,
  voided_reason           text not null default '',
  sold_by_employee_id     text references public.employees(id) on delete set null,
  sold_by_employee_name   text not null default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists gift_certificates_code_key
  on public.gift_certificates (code);

-- 이미 만들어진 테이블에도 안전하게 컬럼을 더합니다.
alter table public.gift_certificates
  add column if not exists payment_method text not null default 'CARD';

create index if not exists gift_certificates_status_idx
  on public.gift_certificates (status, expires_at);

create index if not exists gift_certificates_purchased_idx
  on public.gift_certificates (purchase_business_date, status);

create index if not exists gift_certificates_buyer_idx
  on public.gift_certificates (buyer_customer_id, purchased_at desc)
  where buyer_customer_id is not null;

create index if not exists gift_certificates_payment_idx
  on public.gift_certificates (used_payment_id)
  where used_payment_id is not null;
