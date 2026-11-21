-- P0 — 직원 인증 / 세션 / 감사 로그
--
-- 이 테이블들은 /rest/v1 화이트리스트(src/tables.js)에 넣지 않습니다.
-- 직원 정보와 세션은 오직 /api/staff, /api/admin 경로로만 접근합니다.
-- 재실행해도 안전합니다.

create table if not exists public.employees (
  id text primary key,
  login_id text not null,
  password_hash text not null,
  name text not null default '',
  role text not null default 'STAFF',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- login_id 는 대소문자 구분 없이 유일해야 합니다(입력 편의).
create unique index if not exists employees_login_id_lower_idx
  on public.employees (lower(login_id));

-- P9 — 직원별 세부 권한.
-- null 이면 역할(role) 기본 권한을 그대로 쓰고, 값이 있으면 그 직원만의 권한 목록입니다.
-- (빈 배열 = 권한 없음, 사장 계정은 항상 역할 기본값을 씁니다)
alter table public.employees
  add column if not exists permissions text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_role_check'
  ) then
    alter table public.employees
      add constraint employees_role_check
      check (role in ('OWNER', 'MANAGER', 'STAFF'));
  end if;
end
$$;

create table if not exists public.staff_sessions (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  -- 쿠키에 담기는 원문 토큰은 저장하지 않고 sha256 해시만 보관합니다.
  token_hash text not null unique,
  user_agent text not null default '',
  ip text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists staff_sessions_employee_id_idx
  on public.staff_sessions (employee_id);

create index if not exists staff_sessions_expires_at_idx
  on public.staff_sessions (expires_at);

create table if not exists public.admin_audit_logs (
  id text primary key,
  employee_id text references public.employees(id) on delete set null,
  -- 직원이 삭제되어도 누가 했는지 남도록 이름을 함께 저장합니다.
  employee_name text not null default '',
  action text not null,
  target_type text not null default '',
  target_id text not null default '',
  detail jsonb not null default '{}'::jsonb,
  ip text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_employee_id_idx
  on public.admin_audit_logs (employee_id);
