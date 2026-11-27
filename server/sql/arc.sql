-- P14 — ARC SAFETY 응급안전관리센터. P14A(기반) 범위만 담고, 이후 단계가 이 파일에 이어 붙습니다.
--
-- 규칙
--   * 이 테이블들은 /rest/v1 허용 목록(server/src/tables.js)에 넣지 않습니다.
--     직원 API(/api/arc)로만 접근합니다.
--   * 화면은 "혼자야" 단일 사업장만 다룹니다. 사업장 컬럼을 두지 않습니다.
--   * 민감 건강정보는 앱에서 암호화해 *_enc 컬럼(v1:... 봉투)에만 저장합니다.
--     DB 덤프·디스코드 백업에는 암호문만 남습니다(키는 server/.env 에만).
--   * 보존기간 만료는 알림만 하고 자동 삭제하지 않습니다(사장+최윤희 2인 승인 후 파기).
--   * 여러 번 실행해도 안전합니다(if not exists). 기존 데이터는 건드리지 않습니다.

-- ── 설정(단일 행) ────────────────────────────────────────────────────
create table if not exists public.arc_settings (
  id                         integer primary key default 1 check (id = 1),
  -- 디스코드 #응급안전 채널 id. 비어 있으면 디스코드 알림을 보내지 않습니다.
  alert_channel_id           text not null default '',
  discord_alert_enabled      boolean not null default true,
  app_alert_enabled          boolean not null default true,
  -- 보존기간(년). 만료 임박 알림 기준으로만 씁니다(자동 파기 없음).
  record_retention_years     integer not null default 3 check (record_retention_years between 1 and 30),
  sensitive_retention_years  integer not null default 2 check (sensitive_retention_years between 1 and 30),
  -- 민감정보 열람 승인 유효시간(분). 지나면 다시 승인받아야 합니다.
  access_ttl_minutes         integer not null default 480 check (access_ttl_minutes between 5 and 10080),
  -- 알림을 만들 때 디스코드로도 보낼지 여부의 기본값(화면에서 끌 수 있음).
  updated_by                 text,
  updated_by_name            text not null default '',
  updated_at                 timestamptz not null default now()
);

insert into public.arc_settings (id) values (1) on conflict (id) do nothing;

-- ── 알림함 ───────────────────────────────────────────────────────────
create table if not exists public.arc_notifications (
  id                 uuid primary key default gen_random_uuid(),
  -- EXPIRY / STOCK / OTC / CHECK / EDU / INCIDENT / USAGE / EXPENSE / PURGE / GENERAL
  kind               text not null default 'GENERAL',
  level              text not null default 'INFO' check (level in ('INFO', 'WARN', 'CRITICAL')),
  title              text not null default '',
  body               text not null default '',
  -- 눌렀을 때 이동할 앱 경로(예: /admin/arc/stock).
  link               text not null default '',
  incident_no        text not null default '',
  -- null = 전 직원 공용 알림.
  target_employee_id text references public.employees(id) on delete cascade,
  -- 같은 알림이 하루에 여러 번 쌓이지 않게 하는 키. 이미 있으면 무시됩니다.
  dedupe_key         text,
  read_at            timestamptz,
  read_by            text,
  created_by         text,
  created_at         timestamptz not null default now()
);

-- 같은 알림이 하루에 여러 번 쌓이지 않게 하는 키. 이미 있으면 무시됩니다.
-- null 은 서로 다른 값으로 취급되므로(Postgres) 키 없는 알림은 얼마든지 쌓입니다.
create unique index if not exists arc_notifications_dedupe_idx
  on public.arc_notifications (dedupe_key);

create index if not exists arc_notifications_feed_idx
  on public.arc_notifications (created_at desc);

create index if not exists arc_notifications_target_idx
  on public.arc_notifications (target_employee_id, read_at);

-- ── 동의서(종이 서명 → 직원이 앱에서 '동의 확인') ──────────────────────
create table if not exists public.arc_consents (
  id                 uuid primary key default gen_random_uuid(),
  incident_no        text not null default '',
  -- 화면·인쇄에 보이는 비식별 표시명(예: 동의서-20261127-01). 평문.
  subject_label      text not null default '',
  -- 성명·연락처는 암호화해서만 저장합니다.
  subject_name_enc   text not null default '',
  subject_phone_enc  text not null default '',
  kind               text not null default 'PAPER' check (kind in ('PAPER', 'ELECTRONIC')),
  purpose            text not null default '',
  scope              text not null default '',
  -- 서명본을 받은 직원이 앱에서 '동의 확인'을 누른 기록.
  confirmed_by       text references public.employees(id) on delete set null,
  confirmed_by_name  text not null default '',
  confirmed_at       timestamptz,
  -- 보존기간 만료일. 만료 임박 알림에만 씁니다.
  retention_until    date,
  status             text not null default 'PENDING' check (status in ('PENDING', 'ACTIVE', 'WITHDRAWN')),
  withdrawn_at       timestamptz,
  withdrawn_reason   text not null default '',
  created_by         text,
  created_by_name    text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists arc_consents_incident_idx
  on public.arc_consents (incident_no, status);

create index if not exists arc_consents_retention_idx
  on public.arc_consents (retention_until)
  where status = 'ACTIVE';

-- ── 민감정보 열람 승인 ────────────────────────────────────────────────
create table if not exists public.arc_sensitive_access (
  id                 uuid primary key default gen_random_uuid(),
  incident_no        text not null default '',
  -- 열람 사유(필수). 승인자와 감사로그가 이 값을 봅니다.
  purpose            text not null default '',
  status             text not null default 'PENDING'
                     check (status in ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED')),
  requested_by       text references public.employees(id) on delete set null,
  requested_by_name  text not null default '',
  requested_at       timestamptz not null default now(),
  decided_by         text references public.employees(id) on delete set null,
  decided_by_name    text not null default '',
  decided_at         timestamptz,
  decision_reason    text not null default '',
  -- 승인 시각 + arc_settings.access_ttl_minutes.
  expires_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists arc_sensitive_access_incident_idx
  on public.arc_sensitive_access (incident_no, status);

create index if not exists arc_sensitive_access_requester_idx
  on public.arc_sensitive_access (requested_by, expires_at desc);

-- ── 열람 로그(열람 1건당 1행, 2년 이상 보관) ──────────────────────────
create table if not exists public.arc_sensitive_reads (
  id            uuid primary key default gen_random_uuid(),
  access_id     uuid references public.arc_sensitive_access(id) on delete set null,
  incident_no   text not null default '',
  employee_id   text references public.employees(id) on delete set null,
  employee_name text not null default '',
  -- VIEW / CREATE / UPDATE / EXPORT
  action        text not null default 'VIEW',
  ip            text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists arc_sensitive_reads_incident_idx
  on public.arc_sensitive_reads (incident_no, created_at desc);

create index if not exists arc_sensitive_reads_employee_idx
  on public.arc_sensitive_reads (employee_id, created_at desc);
