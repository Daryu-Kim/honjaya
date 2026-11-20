-- 손님 테이블 세션.
--
-- QR/테이블 카드로 입장한 손님 기기마다 하나씩 발급됩니다. 쿠키에는 임의 토큰이,
-- DB 에는 sha256 해시만 저장합니다. 세션은 테이블 번호와 현재 열려 있는 주문서에 묶이고,
-- /rest/v1 의 주문 데이터 접근 범위를 이 세션으로 제한합니다.
-- 재실행해도 안전합니다.

create table if not exists public.guest_sessions (
  id uuid primary key,
  table_number text not null,
  order_sheet_id text,
  nickname text not null default '',
  token_hash text not null unique,
  user_agent text not null default '',
  ip text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists guest_sessions_table_number_idx
  on public.guest_sessions (table_number);

create index if not exists guest_sessions_order_sheet_id_idx
  on public.guest_sessions (order_sheet_id);

create index if not exists guest_sessions_expires_at_idx
  on public.guest_sessions (expires_at);

-- '누가 시킨 주문인지' 표시용. 세션이 없으면(직원 입력) null/''
alter table public.orders add column if not exists guest_session_id uuid;

alter table public.orders add column if not exists guest_nickname text not null default '';

create index if not exists orders_guest_session_id_idx
  on public.orders (guest_session_id);
