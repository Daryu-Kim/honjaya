-- P12 — Discord 통합 관리 시스템 기반 스키마.
--
-- 규칙
--   * 이 테이블들은 /rest/v1 허용 목록(server/src/tables.js)에 넣지 않습니다.
--     직원 API(/api/discord)와 bot 컨테이너만 접근합니다.
--   * Discord snowflake 는 반드시 text 입니다(JS number 정밀도 손실 방지).
--   * 여러 번 실행해도 안전합니다(if not exists). 기존 데이터는 건드리지 않습니다.
--   * 봇은 읽기(P12A~)와 쓰기(P12D~)를 모두 이 스키마 위에서 수행합니다.

-- 관리 대상 길드(1개). 봇이 접속할 때마다 upsert 합니다.
create table if not exists public.discord_guilds (
  id             text primary key,
  name           text not null default '',
  icon_url       text not null default '',
  owner_user_id  text not null default '',
  bot_role_id    text not null default '',
  member_count   integer,
  joined_at      timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- 봇 설정(단일 행). 관리자 화면에서 수정합니다.
create table if not exists public.discord_settings (
  id                  integer primary key default 1 check (id = 1),
  backup_channel_id   text not null default '',
  announce_channel_id text not null default '',
  log_channel_id      text not null default '',
  owner_discord_id    text not null default '',
  backup_cron         text not null default '0 5 * * *',
  keep_daily          integer not null default 14 check (keep_daily >= 0),
  keep_weekly         integer not null default 8 check (keep_weekly >= 0),
  keep_monthly        integer not null default 12 check (keep_monthly >= 0),
  max_upload_mb       integer not null default 20 check (max_upload_mb between 1 and 500),
  max_ops_per_run     integer not null default 60 check (max_ops_per_run between 1 and 500),
  next_backup_at      timestamptz,
  updated_at          timestamptz not null default now()
);

insert into public.discord_settings (id) values (1) on conflict (id) do nothing;

-- 길드 구조 스냅샷(역할/채널/권한/이모지/AutoMod/예약 이벤트).
-- 채널·역할을 자식 테이블로 나누지 않고 jsonb 한 덩어리로 둡니다: 두 스냅샷 비교는 JS 로 충분합니다.
create table if not exists public.discord_snapshots (
  id             uuid primary key default gen_random_uuid(),
  guild_id       text not null,
  reason         text not null default 'MANUAL'
                   check (reason in ('MANUAL', 'PRE_APPLY', 'SCHEDULED', 'STARTUP')),
  structure      jsonb not null,
  structure_hash text not null,
  channel_count  integer not null default 0,
  role_count     integer not null default 0,
  member_count   integer,
  created_by     text not null default 'system',
  captured_at    timestamptz not null default now()
);

create index if not exists discord_snapshots_guild_time_idx
  on public.discord_snapshots (guild_id, captured_at desc);

-- 구조 편집 "초안". 실제 Discord 는 적용(apply) 시점에만 바뀝니다(P12E).
create table if not exists public.discord_struct_docs (
  id         uuid primary key default gen_random_uuid(),
  guild_id   text not null,
  version    integer not null default 1,
  desired    jsonb not null,
  note       text not null default '',
  updated_by text not null default 'system',
  updated_at timestamptz not null default now()
);

create index if not exists discord_struct_docs_guild_idx
  on public.discord_struct_docs (guild_id, updated_at desc);

-- 적용(apply) 실행 단위. 사전 스냅샷을 항상 함께 남깁니다.
create table if not exists public.discord_apply_runs (
  id              uuid primary key default gen_random_uuid(),
  guild_id        text not null,
  doc_version     integer,
  status          text not null default 'QUEUED'
                    check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'CANCELLED')),
  op_total        integer not null default 0,
  op_ok           integer not null default 0,
  op_failed       integer not null default 0,
  pre_snapshot_id uuid references public.discord_snapshots(id) on delete set null,
  rollback_of     uuid references public.discord_apply_runs(id) on delete set null,
  error           text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_by      text not null default 'system',
  created_at      timestamptz not null default now()
);

-- 적용 작업 1건. before/after 를 남겨야 롤백과 감사가 가능합니다.
create table if not exists public.discord_apply_ops (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.discord_apply_runs(id) on delete cascade,
  seq          integer not null,
  op           text not null,
  target_type  text not null default '',
  target_id    text not null default '',
  before       jsonb,
  after        jsonb,
  status       text not null default 'QUEUED'
                 check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
  http_status  integer,
  discord_code integer,
  error        text,
  started_at   timestamptz,
  finished_at  timestamptz
);

create index if not exists discord_apply_ops_run_idx
  on public.discord_apply_ops (run_id, seq);

-- 봇 작업 큐. Redis 없이 SKIP LOCKED 로 처리합니다(동시성 1).
create table if not exists public.discord_jobs (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'QUEUED'
                 check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  attempts     integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts >= 1),
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  last_error   text,
  result       jsonb,
  created_by   text not null default 'system',
  created_at   timestamptz not null default now()
);

create index if not exists discord_jobs_queue_idx
  on public.discord_jobs (status, run_after);

-- 봇이 올린 공지/메시지 기록.
create table if not exists public.discord_messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id text not null,
  message_id text not null,
  kind       text not null default 'ANNOUNCE',
  embed      jsonb,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 멤버 제재 이력(타임아웃/킥/밴/닉네임/역할). Discord 감사 로그와 별개로 우리 쪽 기록입니다.
create table if not exists public.discord_mod_actions (
  id                uuid primary key default gen_random_uuid(),
  guild_id          text not null,
  target_user_id    text not null,
  target_user_name  text not null default '',
  action            text not null
                      check (action in ('TIMEOUT', 'TIMEOUT_CLEAR', 'KICK', 'BAN', 'UNBAN', 'NICK', 'ROLE_ADD', 'ROLE_REMOVE')),
  reason            text not null default '',
  detail            jsonb,
  expires_at        timestamptz,
  actor_employee_id uuid,
  actor_name        text not null default '',
  created_at        timestamptz not null default now()
);

create index if not exists discord_mod_actions_target_idx
  on public.discord_mod_actions (target_user_id, created_at desc);

-- ── 백업(P12B) ────────────────────────────────────────────────────────────
-- 덤프 1회 = 1행. Discord 업로드가 실패해도 이 행은 남습니다.
create table if not exists public.backup_runs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'FULL' check (kind in ('FULL', 'SCHEMA', 'DATA')),
  status      text not null default 'RUNNING'
                check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  db_name     text not null default 'honjaya',
  filename    text not null default '',
  size_bytes  bigint not null default 0,
  sha256      text not null default '',
  key_id      text not null default 'v1',
  encrypted   boolean not null default true,
  part_count  integer not null default 0,
  local_path  text not null default '',
  row_counts  jsonb,
  app_version text not null default '',
  app_commit  text not null default '',
  error       text,
  triggered_by text not null default 'system',
  job_id      uuid references public.discord_jobs(id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists backup_runs_time_idx
  on public.backup_runs (started_at desc);

-- 분할 업로드된 조각. part_no 순서로 재조립합니다.
create table if not exists public.backup_files (
  id                   uuid primary key default gen_random_uuid(),
  run_id               uuid not null references public.backup_runs(id) on delete cascade,
  part_no              integer not null default 1 check (part_no >= 1),
  part_count           integer not null default 1 check (part_count >= 1),
  filename             text not null,
  size_bytes           bigint not null default 0,
  sha256               text not null default '',
  discord_channel_id   text not null default '',
  discord_message_id   text not null default '',
  discord_attachment_id text not null default '',
  upload_status        text not null default 'PENDING'
                         check (upload_status in ('PENDING', 'UPLOADED', 'FAILED')),
  uploaded_at          timestamptz,
  error                text,
  created_at           timestamptz not null default now(),
  unique (run_id, part_no)
);

create index if not exists backup_files_run_idx
  on public.backup_files (run_id, part_no);

-- 복원/검증 이력. 운영 DB 덮어쓰기는 자동화하지 않습니다(수동 런북 전용).
create table if not exists public.backup_restores (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.backup_runs(id) on delete cascade,
  mode         text not null default 'VERIFY' check (mode in ('VERIFY', 'PROD')),
  target_db    text not null default 'honjaya_verify',
  status       text not null default 'RUNNING'
                 check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  verification jsonb,
  error        text,
  triggered_by text not null default 'system',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists backup_restores_run_idx
  on public.backup_restores (run_id, started_at desc);
