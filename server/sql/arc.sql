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

-- P14C-fix(2026-11-28 대표 지시): 상세 건강기록 작성·조회는 ARC 총괄(최윤희) 전용이고,
-- 사장을 포함한 그 밖의 직원은 정당한 사유 + 증빙을 남긴 뒤 총괄의 승인을 받아야 합니다.
alter table public.arc_sensitive_access
  add column if not exists evidence text not null default '';
alter table public.arc_sensitive_access
  add column if not exists requested_by_role text not null default '';

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

-- ══════════════════════════════════════════════════════════════════════════
-- P14B — 재고·유효기간(EXP) 마스터 · 수불 · 실사 · 직원 개인 상비약
--
--   * 재고 수량은 항상 arc_item_lots(로트별 잔량)에만 있고, arc_stock_moves
--     (수불) 를 통해서만 바뀝니다. 다른 경로로 수량을 직접 고치지 않습니다.
--   * 품목 코드·기준수량·EXP·보관구역은 AS-KIT-001 v1.0 원본 마스터를 씁니다.
--   * 직원 개인 상비약은 사업주 재고가 아니므로 arc_items 와 분리합니다.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 품목 마스터(구급상자·외용품) ────────────────────────────────────────
create table if not exists public.arc_items (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  name             text not null,
  -- 원본 분류: 기구 / 보호구 / 기기 / 드레싱 / 위생 / 고정 / 붕대 / 거즈 / 면제품 / 면봉 ...
  category         text not null default '',
  spec             text not null default '',
  unit             text not null default '개',
  -- 접근등급 A=응급·SOP 승인사용 / B=교육·승인사용 / C=RN 제한관리
  access_level     text not null default 'A' check (access_level in ('A', 'B', 'C')),
  is_device        boolean not null default false,
  -- 원본 기준수량. 실사·부족 표시의 비교 기준입니다.
  baseline_qty     numeric(12, 2) not null default 0 check (baseline_qty >= 0),
  -- 0 이면 재고 부족 알림을 만들지 않습니다(품목별 선택).
  min_qty          numeric(12, 2) not null default 0 check (min_qty >= 0),
  storage_location text not null default '',
  -- SHOP=사업장 / RN=최윤희 RN / STAFF=직원 개인
  owner_kind       text not null default 'SHOP' check (owner_kind in ('SHOP', 'RN', 'STAFF')),
  check_note       text not null default '',
  note             text not null default '',
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists arc_items_code_idx on public.arc_items (code);

create index if not exists arc_items_active_idx
  on public.arc_items (active, sort_order, code);

-- ── 로트(유효기간·개봉) — 재고 수량의 유일한 저장 위치 ───────────────────
create table if not exists public.arc_item_lots (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.arc_items(id) on delete cascade,
  lot_no           text not null default '',
  qty              numeric(12, 2) not null default 0 check (qty >= 0),
  expires_on       date,
  opened_at        timestamptz,
  -- 개봉 후 사용 가능 시간(예: 멸균 생리식염수 1L = 24시간). null 이면 제한 없음.
  after_open_hours integer check (after_open_hours is null or after_open_hours between 1 and 8760),
  disposed_at      timestamptz,
  note             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists arc_item_lots_item_idx
  on public.arc_item_lots (item_id, expires_on);

create index if not exists arc_item_lots_expiry_idx
  on public.arc_item_lots (expires_on)
  where disposed_at is null and expires_on is not null;

-- ── 수불(입고·사용·개봉·폐기·정정) — 재고 변경의 유일한 통로 ──────────────
create table if not exists public.arc_stock_moves (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.arc_items(id) on delete cascade,
  lot_id        uuid references public.arc_item_lots(id) on delete set null,
  -- IN=입고/보충, OUT=사용, OPEN=개봉, DISPOSE=폐기, ADJUST=실사·정정
  kind          text not null check (kind in ('IN', 'OUT', 'OPEN', 'DISPOSE', 'ADJUST')),
  -- IN/OUT/DISPOSE 는 항상 양수, ADJUST 는 증감(±)입니다.
  qty           numeric(12, 2) not null default 0,
  reason        text not null default '',
  -- P14C 사건 / P14D 사용대장 / 실사 연결용.
  ref_type      text not null default '',
  ref_id        text not null default '',
  incident_no   text not null default '',
  employee_id   text references public.employees(id) on delete set null,
  employee_name text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists arc_stock_moves_item_idx
  on public.arc_stock_moves (item_id, created_at desc);

create index if not exists arc_stock_moves_ref_idx
  on public.arc_stock_moves (ref_type, ref_id);

-- ── 월 1회 실사(정기점검의 "실물 수량과 마스터 일치" 항목) ────────────────
create table if not exists public.arc_stocktakes (
  id              uuid primary key default gen_random_uuid(),
  -- YYYY-MM
  period          text not null,
  counted_on      date not null default current_date,
  counted_by      text references public.employees(id) on delete set null,
  counted_by_name text not null default '',
  -- DRAFT=입력중, APPLIED=확정(차이만큼 수불 생성)
  status          text not null default 'DRAFT' check (status in ('DRAFT', 'APPLIED')),
  applied_at      timestamptz,
  applied_by      text references public.employees(id) on delete set null,
  applied_by_name text not null default '',
  note            text not null default '',
  created_at      timestamptz not null default now()
);

create unique index if not exists arc_stocktakes_period_idx
  on public.arc_stocktakes (period);

create table if not exists public.arc_stocktake_items (
  id           uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references public.arc_stocktakes(id) on delete cascade,
  item_id      uuid not null references public.arc_items(id) on delete cascade,
  system_qty   numeric(12, 2) not null default 0,
  -- null = 아직 세지 않음.
  counted_qty  numeric(12, 2) check (counted_qty is null or counted_qty >= 0),
  reason       text not null default ''
);

create unique index if not exists arc_stocktake_items_uniq
  on public.arc_stocktake_items (stocktake_id, item_id);

-- ── 보충·구매·실비정산 대장(AS-KIT-001 §10) ──────────────────────────────
create table if not exists public.arc_purchases (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid references public.arc_items(id) on delete set null,
  item_code        text not null default '',
  item_name        text not null default '',
  qty              numeric(12, 2) not null default 0 check (qty >= 0),
  unit_price       integer not null default 0 check (unit_price >= 0),
  amount           integer not null default 0 check (amount >= 0),
  vendor           text not null default '',
  receipt_no       text not null default '',
  purchased_on     date not null default current_date,
  reason           text not null default '',
  -- 실제 결제 주체. 직원 개인 상비약은 이 대장에 넣지 않습니다(직원 본인 부담).
  paid_by          text not null default 'SHOP' check (paid_by in ('SHOP', 'RN', 'OWNER', 'OTHER')),
  settle_status    text not null default 'UNSETTLED'
                     check (settle_status in ('UNSETTLED', 'PARTIAL', 'SETTLED')),
  settled_amount   integer not null default 0 check (settled_amount >= 0),
  approved_by      text references public.employees(id) on delete set null,
  approved_by_name text not null default '',
  approved_at      timestamptz,
  employee_id      text references public.employees(id) on delete set null,
  employee_name    text not null default '',
  created_at       timestamptz not null default now()
);

create index if not exists arc_purchases_month_idx
  on public.arc_purchases (purchased_on desc);

-- ── 직원 개인 상비약(OTC-001~013) — 사업주 재고와 분리 ────────────────────
create table if not exists public.arc_otc_items (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  name              text not null,
  category          text not null default '',
  qty               numeric(12, 2) not null default 0 check (qty >= 0),
  unit              text not null default '정',
  expires_on        date,
  -- 소유 직원(본인). null 이면 아직 소유자가 지정되지 않은 상태입니다.
  owner_employee_id text references public.employees(id) on delete set null,
  owner_name        text not null default '',
  note              text not null default '',
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists arc_otc_items_code_idx on public.arc_otc_items (code);

-- ── 직원 개인 상비약 월간 자기점검(본인확인) ──────────────────────────────
-- 증상·복용시각 같은 건강 상세는 여기 적지 않고 AS-CARE(P14C)에만 기록합니다.
create table if not exists public.arc_otc_checks (
  id               uuid primary key default gen_random_uuid(),
  otc_item_id      uuid not null references public.arc_otc_items(id) on delete cascade,
  -- YYYY-MM
  period           text not null,
  checked_on       date not null default current_date,
  qty              numeric(12, 2) not null default 0 check (qty >= 0),
  expires_on       date,
  package_ok       boolean not null default true,
  storage_ok       boolean not null default true,
  no_sharing_ok    boolean not null default true,
  care_incident_no text not null default '',
  note             text not null default '',
  employee_id      text references public.employees(id) on delete set null,
  employee_name    text not null default '',
  created_at       timestamptz not null default now()
);

create unique index if not exists arc_otc_checks_period_idx
  on public.arc_otc_checks (otc_item_id, period);

-- ══════════════════════════════════════════════════════════════════════════
-- 원본 마스터 시드 (AS-KIT-001 v1.0 §02 / §02-1, 2026.10.01 운영개시 기준)
--
--   * 코드가 이미 있으면 아무 것도 바꾸지 않습니다(현장 수정 보존).
--   * 기준수량 → 기본 로트 1개로 만들고, 원본에 EXP 가 있는 품목만 EXP 를 채웁니다.
-- ══════════════════════════════════════════════════════════════════════════
insert into public.arc_items
  (code, name, category, spec, unit, access_level, baseline_qty, storage_location,
   check_note, is_device, sort_order)
values
  ('TOOL-001', '붕대가위', '기구', '일반형', '개', 'A', 1, '구급상자 본체', '월 1회 상태·녹·작동 확인', false, 10),
  ('PPE-001', '일회용 마스크', '보호구', '일회용', '개', 'A', 10, '구급상자 본체', '수량·오염·포장 확인', false, 20),
  ('DEV-001', '손전등', '기기', 'USB-C 충전형', '개', 'A', 1, '구급상자 본체', '충전·점등 확인', true, 30),
  ('DEV-002', '자동혈압계', '기기', '전자식', '대', 'B', 1, '구급상자 관찰·교육 구역', '작동·배터리·커프 확인', true, 40),
  ('DEV-003', '산소포화도계', '기기', 'SpO₂', '대', 'B', 1, '구급상자 관찰·교육 구역', '작동·배터리·센서 확인', true, 50),
  ('DEV-004', '비접촉 체온계', '기기', '비대면', '대', 'A', 1, '구급상자 본체', '작동·배터리 확인', true, 60),
  ('DRS-001', '혼합형 일반밴드', '드레싱', '혼합 규격', '매', 'A', 100, '구급상자 본체', '수량·접착·포장 확인', false, 70),
  ('DRS-002', '방수밴드', '드레싱', '혼합 규격', '매', 'A', 80, '구급상자 본체', '수량·접착·포장 확인', false, 80),
  ('EME-001', '쓰레기봉투 겸 구토봉투', '위생', '검정 비닐', '매', 'A', 10, '구급상자 본체', '수량·파손 확인', false, 90),
  ('PPE-002', '의료용 라텍스장갑', '보호구', '일회용', '켤레', 'A', 10, '구급상자 본체', '수량·포장·알레르기 주의', false, 100),
  ('FIX-001', '슈퍼픽스', '고정', '10cm × 2m', '롤', 'A', 1, '구급상자 본체', '수량·접착·포장 확인', false, 110),
  ('BAN-001', '탄력붕대', '붕대', '7.5cm', '개', 'A', 3, '구급상자 본체', '수량·오염·탄성 확인', false, 120),
  ('GAU-001', '멸균거즈', '거즈', '7.5×7.5cm, 8겹, 5매/팩', '팩', 'A', 5, '구급상자 본체', '멸균포장·EXP 확인(총 25매)', false, 130),
  ('COT-001', '탈지면', '면제품', '4×4, 20g', '팩', 'A', 1, '구급상자 본체', '청결·포장 확인', false, 140),
  ('BAN-002', '탄력붕대', '붕대', '15cm', '개', 'A', 1, '구급상자 본체', '수량·오염·탄성 확인', false, 150),
  ('SWB-001', '대형 면봉', '면봉', '대자', '개', 'A', 20, '구급상자 본체', '청결·수량 확인', false, 160),
  ('BAN-003', '거즈붕대', '붕대', '5cm', '개', 'A', 3, '구급상자 본체', '청결·수량 확인', false, 170),
  ('SWB-002', '일반 면봉', '면봉', '일반형', '개', 'A', 100, '구급상자 본체', '청결·수량 확인', false, 180),
  ('TOOL-002', '의료용 핀셋', '기구', '재사용', '개', 'B', 1, '구급상자 관찰·교육 구역', '오염·녹·변형 확인, 박힌 이물 제거 금지', false, 190),
  ('COT-002', '압축형 탈지면/코튼볼', '면제품', '총량 30g', '팩', 'A', 1, '구급상자 본체', '청결·수량 확인', false, 200),
  ('TOOL-003', '의료용 가위', '기구', '재사용', '개', 'B', 1, '구급상자 관찰·교육 구역', '오염·녹·변형 확인', false, 210),
  ('OTH-001', '의료용 바세린', '기타', '제품 규격 확인', '개', 'C', 1, '제한관리 파우치(최윤희 RN)', '제품 표시 목적만, 화상 응급처치용으로 사용하지 않음', false, 220),
  ('FIX-002', '방수픽스', '고정', '시트형', '매', 'A', 20, '구급상자 본체', '수량·접착·포장 확인', false, 230),
  ('TOOL-004', '설압자', '기구', '일회용', '개', 'C', 10, '제한관리 파우치(최윤희 RN)', '경련 시 입에 넣지 않음', false, 240),
  ('PPE-003', '비닐장갑', '보호구', '일회용', '개', 'A', 10, '구급상자 본체', '청결 유지, 혈액·체액용으로 대체 금지', false, 250),
  ('SYR-003', '비침습 보조 주사기', '비침습 보조', '3mL', '개', 'C', 5, '제한관리 파우치(최윤희 RN)', '주사침 미비치·주사 금지', false, 260),
  ('SYR-010', '비침습 보조 주사기', '비침습 보조', '10mL', '개', 'C', 3, '제한관리 파우치(최윤희 RN)', '주사침 미비치·주사 금지', false, 270),
  ('SYR-020', '비침습 보조 주사기', '비침습 보조', '20mL', '개', 'C', 2, '제한관리 파우치(최윤희 RN)', '주사침 미비치·주사 금지', false, 280),
  ('SYR-005', '비침습 보조 주사기', '비침습 보조', '5mL', '개', 'C', 3, '제한관리 파우치(최윤희 RN)', '주사침 미비치·주사 금지', false, 290),
  ('SYR-050', '비침습 보조 주사기', '비침습 보조', '50mL', '개', 'C', 1, '제한관리 파우치(최윤희 RN)', '주사침 미비치·주사 금지', false, 300),
  ('DRS-003', '드레싱밴드 M', '드레싱', 'M', '매', 'A', 6, '구급상자 본체', '수량·포장·EXP 확인', false, 310),
  ('DRS-004', '드레싱밴드 L', '드레싱', 'L', '매', 'A', 4, '구급상자 본체', '수량·포장·EXP 확인', false, 320),
  ('HYG-001', '휴지', '위생', '70매', '팩', 'A', 1, '구급상자 본체', '수량·오염 확인', false, 330),
  ('PPE-004', 'L사이즈 의료용 글러브', '보호구', 'L', '매', 'A', 2, '구급상자 본체', '수량·포장상태 확인', false, 340),
  ('DEV-006', '액와 체온계', '기기', '접촉식', '대', 'A', 1, '구급상자 본체', '작동·소독·배터리 확인', true, 350),
  ('BAN-004', '자가접착밴드', '고정', '10cm', '개', 'A', 1, '구급상자 본체', '수량·접착 확인', false, 360),
  ('BAN-005', '자가접착밴드', '고정', '7.5cm', '개', 'A', 1, '구급상자 본체', '수량·접착 확인', false, 370),
  ('BAN-006', '자가접착밴드', '고정', '5cm', '개', 'A', 1, '구급상자 본체', '수량·접착 확인', false, 380),
  ('BAN-007', '자가접착밴드', '고정', '1.5cm', '개', 'A', 2, '구급상자 본체', '수량·접착 확인', false, 390),
  ('ANT-001', '에탄올', '소독/청결', '250mL', '개', 'C', 1, '제한관리 파우치(최윤희 RN)', '제품 표시 용도 준수, 개방상처 직접 세척용 아님', false, 400),
  ('IRR-001', '멸균 생리식염수 주사기', '세척', '10mL', '개', 'C', 5, '제한관리 파우치(최윤희 RN)', '주사침 없음·외용 세척 보조, 주사·정맥로 사용 금지', false, 410),
  ('WARM-001', '일회용 핫팩', '보온', '일회용 화학식', '개', 'B', 3, '구급상자 관찰·교육 구역', '직접피부 금지, 주취·의식저하자 임의사용 금지', false, 420),
  ('HYG-002', '포터블 손소독제', '위생', '80mL', '개', 'A', 2, '구급상자 본체', '누액·EXP·라벨 확인, 화기·열원 분리, 완전 건조 후 화기 취급', false, 430),
  ('IRR-1000', '멸균 생리식염수', '멸균 외용 세척액', '1L', '개', 'A', 1, '구급상자 본체', 'EXP 2029-07-02, 개봉 후 24시간 이내 외용 세척·잔량 폐기, 주사·수액·정맥로 금지', false, 440),
  ('IRR-SPR-050', '솔트 에프액', '외용 세척/분무액', '50mL 분무용', '개', 'A', 1, '구급상자 본체', 'EXP 2028-05-13, 제품표시 허용 부위에만 외용, 주사·섭취 금지', false, 450),
  ('IRR-SOL-030', '솔트액', '외용 세척액', '30mL', '개', 'A', 1, '구급상자 본체', 'EXP 2028-09-11, 외용 표시범위만, 주사·섭취 금지', false, 460),
  ('ANT-PVP-025', '포비돈 요오드액', '외용 살균소독제', '25mL', '개', 'B', 1, '구급상자 관찰·교육 구역', 'EXP 2028-12-01, 먼저 물·생리식염수로 세척, 눈·점막·넓고 깊은 상처 임의사용 금지', false, 470),
  ('ANT-H2O2-060', '과산화수소수', '산화성 외용 살균소독제', '60mL', '개', 'C', 1, '제한관리 파우치(최윤희 RN)', 'EXP 2029-03-23, 일상 상처 기본 세척제로 지정하지 않음', false, 480),
  ('TOP-MAD-015', '마데카솔', '상처치유촉진 외용제', '15g', '개', 'B', 1, '구급상자 관찰·교육 구역', 'EXP 2028-06-02, 세척·지혈 후 직원 본인이 제품표시대로 사용, 고객 공용도포 금지', false, 490)
on conflict (code) do nothing;

-- 모든 품목에 기본 로트 1개(기준수량). 이미 로트가 있으면 건드리지 않습니다.
insert into public.arc_item_lots (item_id, qty, note)
select i.id, i.baseline_qty, '원본 마스터(AS-KIT-001)'
  from public.arc_items i
 where not exists (select 1 from public.arc_item_lots l where l.item_id = i.id);

-- 원본에 EXP 가 적힌 품목만 시드 로트에 EXP·개봉 후 사용시간을 채웁니다.
update public.arc_item_lots l
   set expires_on = v.expires_on,
       after_open_hours = v.after_open_hours
  from public.arc_items i,
       (values
          ('IRR-1000', date '2029-07-02', 24::integer),
          ('IRR-SPR-050', date '2028-05-13', null::integer),
          ('IRR-SOL-030', date '2028-09-11', null::integer),
          ('ANT-PVP-025', date '2028-12-01', null::integer),
          ('ANT-H2O2-060', date '2029-03-23', null::integer),
          ('TOP-MAD-015', date '2028-06-02', null::integer)
       ) as v(code, expires_on, after_open_hours)
 where l.item_id = i.id
   and i.code = v.code
   and l.note = '원본 마스터(AS-KIT-001)'
   and l.expires_on is null;

-- 직원 개인 상비약 마스터(OTC-001~013). 소유자는 직원이 직접 지정합니다.
insert into public.arc_otc_items (code, name, category, qty, unit, expires_on, sort_order)
values
  ('OTC-001', '파메딘정 10mg', 'H2 수용체 길항제·위산분비억제제(속쓰림·신트림 완화)', 20, '정', date '2028-07-30', 10),
  ('OTC-002', '레드코프-F 연질캡슐', '종합감기 복합제(해열진통·항히스타민·비충혈제거·진해)', 10, '캡슐', date '2029-03-19', 20),
  ('OTC-003', '이지엔6 이브 연질캡슐', 'NSAID+파마브롬 복합제(생리통·두통·발열)', 10, '캡슐', date '2029-09-30', 30),
  ('OTC-004', '로페라미드', '제·장운동억제제(묽은 설사 완화)', 10, '캡슐', date '2028-11-12', 40),
  ('OTC-005', '까스활명수 75mL', '건위소화제(체함·더부룩함·가스·소화불량)', 2, '병', date '2028-05-18', 50),
  ('OTC-006', '아노텍', '항히스타민제 운영분류(성분·용법은 현품 라벨로 확인)', 10, '정', date '2028-03-03', 60),
  ('OTC-007', '스카폴라', '골격근이완·진통 관련 일반의약품(성분·용법은 현품 라벨로 확인)', 10, '정', date '2029-03-11', 70),
  ('OTC-008', '이브400원큐에스연질캡슐', 'NSAID 이부프로펜 400mg 단일제(통증·염증·발열)', 10, '캡슐', date '2029-03-05', 80),
  ('OTC-009', '스피자임S', '소화효소·건위소화제(체함·소화불량)', 10, '정', date '2028-12-14', 90),
  ('OTC-010', '메카인정', '진토·항히스타민성 멀미약(멀미 어지럼·메스꺼움)', 2, '정', date '2029-04-29', 100),
  ('OTC-011', '블루콜엠연질캡슐', '진해거담제·기관지확장 복합제(기침·가래)', 10, '캡슐', date '2027-11-12', 110),
  ('OTC-012', '클리어딘(로라타딘)', '제2세대 H1 항히스타민제(콧물·재채기·두드러기)', 10, '정', date '2029-06-11', 120),
  ('OTC-013', '타이레놀정 500mg', '비마약성 중추성 해열진통제·아세트아미노펜제', 30, '정', date '2029-05-26', 130)
on conflict (code) do nothing;


-- ── P14C: 사건 접수(INC) + AS-CARE 상세 기록(암호화) ──────────────────
-- 사건 헤더(arc_incidents)는 비식별 운영정보만 담습니다. 성명·연락처·증상·처치 같은
-- 식별 가능한 건강정보는 arc_care_* 의 *_enc 컬럼에만 들어갑니다.
create table if not exists public.arc_incidents (
  id                uuid primary key default gen_random_uuid(),
  -- INC-YYYYMMDD-nn (한국시간 발생일 기준 일련번호)
  incident_no       text not null,
  occurred_at       timestamptz not null default now(),
  -- GUEST(비응급 고객) / STAFF_OTC(직원 상비약 자가복용) / EMERGENCY(응급·119 인계)
  kind              text not null default 'GUEST'
                    check (kind in ('GUEST', 'STAFF_OTC', 'EMERGENCY')),
  -- ON_SITE(현장 직접 사정) / OFF_SITE(비현장·사후 보고)
  record_mode       text not null default 'ON_SITE'
                    check (record_mode in ('ON_SITE', 'OFF_SITE')),
  status            text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  -- 비식별 표시명(예: 손님A, 직원1). 실명은 상세기록에만 암호화 저장합니다.
  subject_label     text not null default '',
  place             text not null default '',
  -- 비식별 요약. 서버가 6자리 이상 숫자·이메일 형태를 거부합니다.
  summary           text not null default '',
  -- 개인정보 처리근거: CONSENT_F25 / CONSENT_F27 / OTHER_LEGAL / NOT_APPLICABLE / DEIDENTIFIED
  legal_basis       text not null default 'NOT_APPLICABLE'
                    check (legal_basis in ('CONSENT_F25', 'CONSENT_F27', 'OTHER_LEGAL',
                                           'NOT_APPLICABLE', 'DEIDENTIFIED')),
  legal_basis_note  text not null default '',
  transferred_119   boolean not null default false,
  reporter_id       text references public.employees(id) on delete set null,
  reporter_name     text not null default '',
  handler_id        text references public.employees(id) on delete set null,
  handler_name      text not null default '',
  closed_at         timestamptz,
  closed_by_name    text not null default '',
  close_note        text not null default '',
  created_by        text references public.employees(id) on delete set null,
  created_by_name   text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists arc_incidents_no_idx
  on public.arc_incidents (incident_no);

create index if not exists arc_incidents_time_idx
  on public.arc_incidents (occurred_at desc);

create index if not exists arc_incidents_status_idx
  on public.arc_incidents (status, occurred_at desc);

-- 사건 1건당 상세기록 1건(AS-CARE-01). 정정은 arc_care_addenda 에 덧붙입니다
-- (원기록 임의 삭제 금지).
create table if not exists public.arc_care_records (
  id                    uuid primary key default gen_random_uuid(),
  incident_id           uuid not null unique
                        references public.arc_incidents(id) on delete cascade,
  incident_no           text not null default '',
  -- 01 사건 개요(대상자)
  subject_name_enc      text not null default '',
  subject_phone_enc     text not null default '',
  subject_birth_enc     text not null default '',
  subject_gender_enc    text not null default '',
  subject_age_enc       text not null default '',
  chief_complaint_enc   text not null default '',
  summary_enc           text not null default '',
  history_enc           text not null default '',
  -- 03 현장 조치·최종 계획
  treatment_enc         text not null default '',
  disposition_enc       text not null default '',
  followup_enc          text not null default '',
  -- OFF_SITE 서식 전용(보고 정보 출처 / 미확인 사항)
  report_source_enc     text not null default '',
  unconfirmed_enc       text not null default '',
  -- 기록 시점의 동의·법적근거 확인 상태(평문 색인). 그 자체는 개인정보가 아닙니다.
  legal_basis           text not null default 'NOT_APPLICABLE'
                        check (legal_basis in ('CONSENT_F25', 'CONSENT_F27', 'OTHER_LEGAL',
                                               'NOT_APPLICABLE', 'DEIDENTIFIED')),
  legal_basis_note      text not null default '',
  consent_id            uuid references public.arc_consents(id) on delete set null,
  recorded_by           text references public.employees(id) on delete set null,
  recorded_by_name      text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 활력징후·상태경과 타임라인(정보구분 DIRECT=직접 확인 / REPORT=보고받음).
create table if not exists public.arc_care_timeline (
  id             uuid primary key default gen_random_uuid(),
  care_id        uuid not null references public.arc_care_records(id) on delete cascade,
  source         text not null default 'DIRECT' check (source in ('DIRECT', 'REPORT')),
  -- HH:MM (사건 발생일 기준). 정렬만 되면 되므로 문자열로 둡니다.
  measured_at    text not null default '',
  temp_enc       text not null default '',
  bp_enc         text not null default '',
  pulse_enc      text not null default '',
  spo2_enc       text not null default '',
  condition_enc  text not null default '',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists arc_care_timeline_care_idx
  on public.arc_care_timeline (care_id, sort_order);

-- 02 약품·물품 사용 확인 + 복약·처치 교육.
create table if not exists public.arc_care_meds (
  id             uuid primary key default gen_random_uuid(),
  care_id        uuid not null references public.arc_care_records(id) on delete cascade,
  -- 구급상자/상비의약품 마스터 연결(선택). 마스터가 지워져도 기록 문구는 남습니다.
  item_id        uuid references public.arc_items(id) on delete set null,
  name_enc       text not null default '',
  qty_enc        text not null default '',
  category_enc   text not null default '',
  education_enc  text not null default '',
  note_enc       text not null default '',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists arc_care_meds_care_idx
  on public.arc_care_meds (care_id, sort_order);

-- 정정·추가 기록(append only). 원기록은 남기고 사유와 함께 덧붙입니다.
create table if not exists public.arc_care_addenda (
  id           uuid primary key default gen_random_uuid(),
  care_id      uuid not null references public.arc_care_records(id) on delete cascade,
  incident_no  text not null default '',
  body_enc     text not null default '',
  author_id    text references public.employees(id) on delete set null,
  author_name  text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists arc_care_addenda_care_idx
  on public.arc_care_addenda (care_id, created_at);
-- ══════════════════════════════════════════════════════════════════════════
-- P14D — 사용대장(USE) · 단가·소모금액 · 비용 실비정산(EXP, 부분입금)
--   AS-OPS-001 §06-B-4 "품목·수량·대상자 구분·사유·시각을 당일 장부에 기록"
--   AS-OPS-001 §20-2 비용 사전승인·실비정산서 / §21 제4조 소모품 사용정산
--   내구재(is_device)는 정상 사용만으로 비용을 청구하지 않으므로 정산 대상에서 뺍니다.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 비용·실비정산 대장(EXP) — 부분입금 이력을 별도 표로 남깁니다 ────────────
create table if not exists public.arc_expenses (
  id               uuid primary key default gen_random_uuid(),
  -- EXP-YYYYMMDD-nn
  expense_no       text not null,
  -- 정산기간(YYYY-MM). 월 소모금액 일괄 정산이면 그 달, 단건이면 빈 값/해당 월.
  period           text not null default '',
  spent_on         date not null default current_date,
  -- SUPPLY=소모품 / PRINT=인쇄·교구 / TRANSPORT=교통 / SERVICE=자문·활동비 / EQUIPMENT=장비·자재 / OTHER=기타
  category         text not null default 'SUPPLY'
                     check (category in ('SUPPLY', 'PRINT', 'TRANSPORT', 'SERVICE', 'EQUIPMENT', 'OTHER')),
  purpose          text not null default '',
  amount           integer not null default 0 check (amount >= 0),
  -- 청구인·부담 주체. 실제 결제한 사람 기준으로 정산합니다.
  claimant         text not null default '',
  paid_by          text not null default 'RN' check (paid_by in ('SHOP', 'RN', 'OWNER', 'OTHER')),
  vendor           text not null default '',
  receipt_no       text not null default '',
  pre_approved     boolean not null default false,
  approved_by      text references public.employees(id) on delete set null,
  approved_by_name text not null default '',
  approved_at      timestamptz,
  -- MANUAL=직접 등록 / USAGE_MONTH=월 소모금액 일괄 정산 / PURCHASE=구매대장 연결
  source_type      text not null default 'MANUAL'
                     check (source_type in ('MANUAL', 'USAGE_MONTH', 'PURCHASE')),
  source_ref       text not null default '',
  settle_status    text not null default 'UNSETTLED'
                     check (settle_status in ('UNSETTLED', 'PARTIAL', 'SETTLED')),
  settled_amount   integer not null default 0 check (settled_amount >= 0),
  -- 정산 원칙: 월말 또는 청구 후 14일 이내(AS-OPS 06-B-3).
  due_on           date,
  note             text not null default '',
  employee_id      text references public.employees(id) on delete set null,
  employee_name    text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists arc_expenses_no_idx
  on public.arc_expenses (expense_no);

create index if not exists arc_expenses_period_idx
  on public.arc_expenses (spent_on desc);

create index if not exists arc_expenses_status_idx
  on public.arc_expenses (settle_status, spent_on desc);

-- ── 입금 이력(부분입금) ───────────────────────────────────────────────────
create table if not exists public.arc_expense_payments (
  id            uuid primary key default gen_random_uuid(),
  expense_id    uuid not null references public.arc_expenses(id) on delete cascade,
  paid_on       date not null default current_date,
  amount        integer not null check (amount > 0),
  method        text not null default 'TRANSFER'
                  check (method in ('TRANSFER', 'CASH', 'CARD', 'ETC')),
  note          text not null default '',
  employee_id   text references public.employees(id) on delete set null,
  employee_name text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists arc_expense_payments_expense_idx
  on public.arc_expense_payments (expense_id, paid_on);

-- ── 사용대장(USE) — 재고 차감의 업무 근거. 취소 시 역분개로 재고를 되돌립니다. ──
create table if not exists public.arc_usages (
  id             uuid primary key default gen_random_uuid(),
  -- USE-YYYYMMDD-nn
  usage_no       text not null,
  used_at        timestamptz not null default now(),
  -- 대상자 구분(원본 요구): GUEST=고객 / STAFF=직원 / VISITOR=방문객 / CHECK=점검·교육 중 사용 / ETC=기타
  target_kind    text not null default 'GUEST'
                   check (target_kind in ('GUEST', 'STAFF', 'VISITOR', 'CHECK', 'ETC')),
  purpose        text not null default '',
  -- 사건(INC) 연결(선택). 상세 건강정보는 여기에 쓰지 않습니다.
  incident_no    text not null default '',
  place          text not null default '',
  note           text not null default '',
  -- 소모금액 합계(내구재는 0으로 계산되어 정산에서 빠집니다).
  total_amount   integer not null default 0 check (total_amount >= 0),
  -- 정산 대상 금액이 있는지. 내구재만 쓴 기록은 false.
  billable       boolean not null default true,
  -- 이 사용대장을 근거로 만든 정산서(중복 청구 방지).
  expense_id     uuid references public.arc_expenses(id) on delete set null,
  status         text not null default 'ACTIVE' check (status in ('ACTIVE', 'VOID')),
  void_reason    text not null default '',
  voided_at      timestamptz,
  voided_by_name text not null default '',
  employee_id    text references public.employees(id) on delete set null,
  employee_name  text not null default '',
  created_at     timestamptz not null default now()
);

create unique index if not exists arc_usages_no_idx
  on public.arc_usages (usage_no);

create index if not exists arc_usages_time_idx
  on public.arc_usages (used_at desc);

create index if not exists arc_usages_billing_idx
  on public.arc_usages (status, billable, expense_id);

-- ── 사용 품목 — 단가·금액은 사용 시점 스냅샷(나중에 단가가 바뀌어도 과거 금액 유지) ──
create table if not exists public.arc_usage_items (
  id         uuid primary key default gen_random_uuid(),
  usage_id   uuid not null references public.arc_usages(id) on delete cascade,
  item_id    uuid references public.arc_items(id) on delete set null,
  item_code  text not null default '',
  item_name  text not null default '',
  item_unit  text not null default '',
  qty        numeric(12, 2) not null check (qty > 0),
  unit_price integer not null default 0 check (unit_price >= 0),
  amount     integer not null default 0 check (amount >= 0),
  is_device  boolean not null default false,
  note       text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists arc_usage_items_usage_idx
  on public.arc_usage_items (usage_id, sort_order);

-- ── 운영 루틴(AS-CAL-001 1년 업무달력) ────────────────────────────────────
-- 루틴 항목 자체는 코드 템플릿(server/src/arcRoutine.js)이 원본이고,
-- 이 표에는 "이번 달에 실제로 끝낸 기록"만 남깁니다. (행 없음 = 미완료)
create table if not exists public.arc_routine_log (
  id             text primary key,
  -- 'YYYY-MM'
  period         text not null,
  step_key       text not null,
  status         text not null default 'DONE' check (status in ('DONE', 'SKIPPED')),
  -- 점검 체크리스트 상태(항목키 → true)
  checklist      jsonb not null default '{}'::jsonb,
  -- 보완·교체 필요품 / 후속조치 목록
  actions        jsonb not null default '[]'::jsonb,
  note           text not null default '',
  done_by        text references public.employees(id) on delete set null,
  done_by_name   text not null default '',
  done_at        timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint arc_routine_log_period_step unique (period, step_key)
);

create index if not exists arc_routine_log_period_idx
  on public.arc_routine_log (period);