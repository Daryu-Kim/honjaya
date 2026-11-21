-- P7 — 휴대폰 번호 회원 기반 마케팅 발송 준비.
--
-- 회원 식별자는 휴대폰 번호(customers.phone) 하나입니다. 카카오 로그인은 쓰지 않습니다.
-- 발송 자체는 문자/알림톡 업체 API 로 나가므로 손님이 카카오 가입을 하지 않아도 됩니다.
-- 수신거부 링크에 쓰는 추측 불가능한 토큰. 동의를 받을 때 함께 발급합니다.
alter table public.customers
  add column if not exists marketing_opt_out_token text,
  add column if not exists marketing_consent_source text not null default '';

create unique index if not exists customers_opt_out_token_key
  on public.customers (marketing_opt_out_token)
  where marketing_opt_out_token is not null;

-- 이미 동의한 고객도 수신거부 링크를 가질 수 있도록 한 번 채워 둡니다(이후에는 앱이 발급).
update public.customers
   set marketing_opt_out_token = md5(id || clock_timestamp()::text || random()::text)
 where marketing_opt_out_token is null;

create table if not exists public.message_campaigns (
  id text primary key,
  title text not null default '',
  body text not null default '',
  -- SMS | LMS | ALIMTALK
  channel text not null default 'SMS',
  -- CONSENTED | DORMANT | NEW | POINTS
  segment text not null default 'CONSENTED',
  target_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  -- DRAFT | SENT | CANCELED
  status text not null default 'DRAFT',
  provider text not null default '',
  provider_note text not null default '',
  created_by text references public.employees(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists message_campaigns_created_at_idx
  on public.message_campaigns (created_at desc);

create table if not exists public.message_logs (
  id text primary key,
  campaign_id text not null references public.message_campaigns(id) on delete cascade,
  customer_id text references public.customers(id) on delete set null,
  phone text not null default '',
  -- PENDING | SENT | FAILED | SKIPPED
  status text not null default 'PENDING',
  attempts int not null default 0,
  error text not null default '',
  provider_message_id text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists message_logs_campaign_idx
  on public.message_logs (campaign_id, status);

-- 같은 캠페인에서 같은 고객에게 두 번 쌓이지 않게 합니다(재발송은 상태만 갱신).
create unique index if not exists message_logs_campaign_customer_key
  on public.message_logs (campaign_id, customer_id)
  where customer_id is not null;
