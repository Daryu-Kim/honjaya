-- P6 — CRM 기반: 고객 프로필 확장 + 결제-고객 연결 + 마케팅 수신 동의.
--
-- 설계
--   * customers 는 P5 에서 만든 최소 테이블을 그대로 확장합니다(전화번호가 키).
--   * 방문 이력/누적 결제는 payments.customer_id 로 계산합니다(집계 컬럼을 두지 않아 어긋날 일이 없습니다).
--   * marketing_consent 는 손님에게서 받은 동의만 저장합니다(철회는 관리자 화면에서 끕니다).
--   * kakao_id / nickname 은 P6 후속(카카오 로그인)에서 쓸 자리만 미리 비워 둡니다(지금은 항상 null).
--
-- 여러 번 실행해도 안전합니다(if not exists). 기존 데이터는 지우지 않습니다.

alter table public.customers
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists nickname text not null default '',
  add column if not exists kakao_id text;

create unique index if not exists customers_kakao_id_key
  on public.customers (kakao_id)
  where kakao_id is not null;

create index if not exists customers_consent_idx
  on public.customers (marketing_consent)
  where marketing_consent;

-- 결제 1건이 어느 고객의 것인지 남깁니다(방문 이력·누적 결제 계산용).
alter table public.payments
  add column if not exists customer_id text references public.customers(id) on delete set null;

create index if not exists payments_customer_idx
  on public.payments (customer_id, occurred_at desc);

-- P5 에서 이미 적립된 결제는 포인트 원장을 통해 고객을 한 번만 채워 넣습니다.
update public.payments p
   set customer_id = l.customer_id
  from public.point_ledger l
 where l.payment_id = p.id
   and p.customer_id is null;
