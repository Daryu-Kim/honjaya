-- P13 전자담배 예약(픽업) 판매.
--
-- 규칙
--   * 기존 products / categories(메뉴판)와 완전히 분리합니다.
--     scripts/menu/import-menu.mjs 가 menu.json 기준으로 미등록 상품을 soft delete 하므로
--     같은 테이블에 담으면 메뉴 동기화 한 번에 사라집니다.
--   * 온라인 결제는 하지 않습니다. 예약만 받고 매장 픽업 시 결제·신분증 확인을 합니다.
--   * 가격은 항상 서버에서 다시 계산합니다. reservation_items 는 예약 시점 스냅샷입니다.
--   * 재고는 stock - (진행중 예약 수량) 으로 계산합니다. 진행중 = REQUESTED / CONFIRMED / READY.
--     재고를 실제로 깎는 시점은 PICKED_UP 입니다.
--   * /rest/v1 테이블 목록에는 넣지 않습니다 → /api/shop, /api/public/shop 으로만 접근.
--
-- 여러 번 실행해도 안전합니다(if not exists). 기존 데이터는 건드리지 않습니다.

create table if not exists public.shop_categories (
  id          text primary key,
  name        text not null default '',
  memo        text not null default '',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shop_categories_active_idx
  on public.shop_categories (is_active, sort_order);

create table if not exists public.shop_products (
  id                text primary key,
  category_id       text not null default '',
  name              text not null default '',
  brand             text not null default '',
  description       text not null default '',
  -- 판매가(원). 옵션 추가금은 예약 시점에 더해집니다.
  price             integer not null default 0 check (price >= 0),
  stock             integer not null default 0 check (stock >= 0),
  image_url         text not null default '',
  -- products.option_groups 와 같은 모양(camelCase)을 그대로 씁니다.
  -- [{ groupId, groupName, isRequired, isMultiple, minSelectCount, maxSelectCount, sortOrder,
  --    options: [{ optionId, optionName, additionalPrice, isActive, isSoldOut, isDefault, sortOrder }] }]
  option_groups     jsonb not null default '[]'::jsonb,
  -- 액상 정보. 기기·악세서리는 비워 둡니다.
  flavor_profile    text not null default '',
  nicotine_type     text not null default '',
  is_nicotine_free  boolean not null default false,
  -- 성인 상품이면 픽업 시 신분증 확인을 강제합니다.
  is_adult_only     boolean not null default true,
  is_active         boolean not null default true,
  is_sold_out       boolean not null default false,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz -- soft delete: rows stay, the app filters deleted_at is null
);

create index if not exists shop_products_listing_idx
  on public.shop_products (is_active, category_id, sort_order);

create index if not exists shop_products_name_idx
  on public.shop_products (name);

create table if not exists public.reservations (
  id                text primary key,
  -- 손님에게 보여주는 예약번호(R260126-A7K2). 조회는 예약번호 + 연락처 둘 다 필요합니다.
  reservation_no    text not null,
  customer_id       text references public.customers(id) on delete set null,
  customer_name     text not null default '',
  phone             text not null default '',
  pickup_at         timestamptz not null,
  status            text not null default 'REQUESTED'
                      check (status in ('REQUESTED', 'CONFIRMED', 'READY', 'PICKED_UP', 'CANCELED', 'NO_SHOW')),
  total_amount      integer not null default 0 check (total_amount >= 0),
  item_count        integer not null default 0 check (item_count >= 0),
  -- 성인 상품이 하나라도 있으면 픽업 전에 adult_checked_at 이 필요합니다.
  is_adult_order    boolean not null default false,
  adult_checked_at  timestamptz,
  adult_checked_by  text not null default '',
  memo              text not null default '',
  status_memo       text not null default '',
  picked_up_at      timestamptz,
  canceled_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists reservations_no_key
  on public.reservations (reservation_no);

create index if not exists reservations_phone_idx
  on public.reservations (phone, created_at desc);

create index if not exists reservations_pickup_idx
  on public.reservations (pickup_at);

create index if not exists reservations_status_idx
  on public.reservations (status, pickup_at);

create table if not exists public.reservation_items (
  id              text primary key,
  reservation_id  text not null references public.reservations(id) on delete cascade,
  product_id      text references public.shop_products(id) on delete set null,
  -- 예약 시점 스냅샷. 상품이 나중에 바뀌어도 예약 내역은 그대로 남습니다.
  product_name    text not null default '',
  brand           text not null default '',
  option_text     text not null default '',
  unit_price      integer not null default 0 check (unit_price >= 0),
  quantity        integer not null default 1 check (quantity > 0),
  line_amount     integer not null default 0 check (line_amount >= 0),
  is_adult_only   boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists reservation_items_reservation_idx
  on public.reservation_items (reservation_id);

create index if not exists reservation_items_product_idx
  on public.reservation_items (product_id);
