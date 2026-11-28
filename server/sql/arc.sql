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

-- 운영 기준값(문서 버전·협력사·알림 임계값·월말 Gate 서명자)은 이후 단계에서 붙였습니다.
alter table public.arc_settings
  add column if not exists doc_version text not null default 'AS-KIT-001 v1.0';

alter table public.arc_settings
  add column if not exists partner_org text not null default '';

alter table public.arc_settings
  add column if not exists partner_contact text not null default '';

-- 유효기간 임박 알림 기준일(기본 30일).
alter table public.arc_settings
  add column if not exists expiry_alert_days integer not null default 30;

-- 월말 Gate(대표 서명) 기준일. 이 날부터 서명 대기 알림을 띄웁니다.
alter table public.arc_settings
  add column if not exists stocktake_gate_day integer not null default 25;

alter table public.arc_settings
  add column if not exists gate_signer_name text not null default '';

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

-- 실제로 받은 동의서 서식 코드(AS-REC-F25 / F27 / F26 등).
alter table public.arc_consents
  add column if not exists form_code text not null default '';

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

-- ── 육하원칙 보강(누구에게·어떻게·확인자) ────────────────────────────────────
-- 원본 사용대장은 대상자 '구분'만 있어서, 실제로 누구에게 썼는지·어떻게 썼는지·
-- 누가 옆에서 봤는지가 남지 않았습니다. 재고 차감의 업무 근거를 더 단단히
-- 만들기 위해 세 항목을 추가합니다. (상세 건강정보는 여기에 쓰지 않습니다)
alter table public.arc_usages
  add column if not exists target_name text not null default '';

alter table public.arc_usages
  add column if not exists how_used text not null default '';

alter table public.arc_usages
  add column if not exists witness_name text not null default '';

-- ── 품목 기준단가 사전 등록(ARC 총괄이 미리 정하는 단가) ────────────────────
-- 구매 전에도 사용대장 금액이 바로 계산되도록, 품목별 기준단가를 미리 등록합니다.
-- 사용 시점에 이 표의 최신 단가(적용일 <= 오늘)를 스냅샷으로 복사하고,
-- 등록된 단가가 없으면 기존처럼 최근 구매 단가를 씁니다.
create table if not exists public.arc_item_prices (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.arc_items(id) on delete cascade,
  item_code      text not null default '',
  item_name      text not null default '',
  unit_price     integer not null default 0 check (unit_price >= 0),
  effective_from date not null default current_date,
  note           text not null default '',
  employee_id    text references public.employees(id) on delete set null,
  employee_name  text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists arc_item_prices_item_idx
  on public.arc_item_prices (item_id, effective_from desc, created_at desc);

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

-- ── AS-CARE 외부 서식 파일(HWP·DOCX·PDF 등) ───────────────────────────────
-- 실물 서식(AS-CARE)에 손으로 적고 서명한 원본을 스캔해 올리는 자리입니다.
-- 파일 본문은 DB에 넣지 않고 ARC_FILES_DIR 아래에만 두며, DB에는 색인만 남깁니다.
create table if not exists public.arc_care_files (
  id               uuid primary key default gen_random_uuid(),
  incident_id      uuid not null references public.arc_incidents(id) on delete cascade,
  care_record_id   uuid references public.arc_care_records(id) on delete cascade,
  -- CARE_SHEET=AS-CARE 서식, SIGNATURE=서명본, PHOTO=현장 사진, ETC=기타 증빙
  kind             text not null default 'CARE_SHEET'
                     check (kind in ('CARE_SHEET', 'SIGNATURE', 'PHOTO', 'ETC')),
  file_name        text not null,
  ext              text not null default '',
  mime             text not null default 'application/octet-stream',
  bytes            bigint not null default 0 check (bytes >= 0),
  sha256           text not null default '',
  storage_name     text not null,
  note             text not null default '',
  uploaded_by      text references public.employees(id) on delete set null,
  uploaded_by_name text not null default '',
  created_at       timestamptz not null default now()
);

create index if not exists arc_care_files_incident_idx
  on public.arc_care_files (incident_id, created_at desc);

create index if not exists arc_care_files_record_idx
  on public.arc_care_files (care_record_id);

-- 열람 승인을 "사건" 단위가 아니라 "특정 AS-CARE 기록" 단위로도 묶을 수 있게 합니다.
-- (사장이 사유를 올리면 총괄이 그 AS-CARE 1건만 승인 → 그 기록만 열람)
alter table public.arc_sensitive_access
  add column if not exists care_record_id uuid
    references public.arc_care_records(id) on delete set null;

alter table public.arc_sensitive_access
  add column if not exists target_label text not null default '';

-- ── 실사 헤더·품목 상세(AS-KIT-001 §06 정기점검 16항목) ──────────────────────
-- 실사는 실사자 혼자 끝내지 않고 참관자(입회자)를 남깁니다. 방법은 전수/표본/부분.
alter table public.arc_stocktakes
  add column if not exists witness_name text not null default '';

alter table public.arc_stocktakes
  add column if not exists method text not null default 'FULL';

alter table public.arc_stocktakes
  add column if not exists issues_note text not null default '';

-- 품목별 외관·유효기간 상태와 그에 대한 조치(교체·폐기·구매요청 등).
-- OK=정상 / LOW=수량부족 / DAMAGED=손상·오염 / EXPIRING=유효기간 임박 / DISPOSE=폐기대상
alter table public.arc_stocktake_items
  add column if not exists state text not null default 'OK';

alter table public.arc_stocktake_items
  add column if not exists action text not null default '';

-- 구매 증빙 종류와 정산 예정일(AS-KIT-001 §10 — 실비정산은 증빙·지급일이 핵심).
-- RECEIPT=영수증 / CARD=카드전표 / TAX_INVOICE=세금계산서 / CASH_RECEIPT=현금영수증 / NONE=증빙없음
alter table public.arc_purchases
  add column if not exists evidence_kind text not null default 'RECEIPT';

alter table public.arc_purchases
  add column if not exists settle_due_on date;

-- ── P14G: 재고 안전선 미리 세팅(구급상자·직원 상비약) ─────────────────────────
-- 원본(AS-KIT-001)은 기준수량만 있어서 '재고 부족' 알림이 실제로는 한 번도 뜨지
-- 않았습니다. 안전재고(min_qty)와 보충 권장량(reorder_qty)을 함께 두어 실사 때
-- "몇 개 더 채워야 하는지"까지 바로 보이게 합니다.
-- 현장에서 손으로 넣은 값(0 이 아닌 값)은 덮어쓰지 않습니다.
alter table public.arc_items
  add column if not exists reorder_qty numeric(12, 2) not null default 0;

alter table public.arc_otc_items
  add column if not exists min_qty numeric(12, 2) not null default 0;

alter table public.arc_otc_items
  add column if not exists reorder_qty numeric(12, 2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'arc_items_reorder_qty_check') then
    alter table public.arc_items
      add constraint arc_items_reorder_qty_check check (reorder_qty >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'arc_otc_items_par_check') then
    alter table public.arc_otc_items
      add constraint arc_otc_items_par_check check (min_qty >= 0 and reorder_qty >= 0);
  end if;
end $$;

-- 구급상자: 안전재고 = 기준수량의 50%(최소 1, 기준수량 상한), 보충 권장 = 75%.
-- 아직 한 번도 설정하지 않은 품목만 채웁니다.
update public.arc_items
   set min_qty = least(baseline_qty, greatest(1, ceil(baseline_qty * 0.5))),
       reorder_qty = least(baseline_qty, greatest(1, ceil(baseline_qty * 0.75)))
 where baseline_qty > 0
   and min_qty = 0
   and reorder_qty = 0;

update public.arc_items
   set reorder_qty = least(baseline_qty, greatest(1, ceil(baseline_qty * 0.75)))
 where baseline_qty > 0
   and reorder_qty = 0;

-- 직원 개인 상비약 13종은 포장 단위를 감안해 안전선을 직접 지정합니다.
update public.arc_otc_items o
   set min_qty = v.min_qty,
       reorder_qty = v.reorder_qty
  from (values
         ('OTC-001', 6::numeric, 10::numeric),
         ('OTC-002', 3::numeric, 5::numeric),
         ('OTC-003', 3::numeric, 5::numeric),
         ('OTC-004', 3::numeric, 5::numeric),
         ('OTC-005', 1::numeric, 1::numeric),
         ('OTC-006', 3::numeric, 5::numeric),
         ('OTC-007', 3::numeric, 5::numeric),
         ('OTC-008', 3::numeric, 5::numeric),
         ('OTC-009', 3::numeric, 5::numeric),
         ('OTC-010', 1::numeric, 1::numeric),
         ('OTC-011', 3::numeric, 5::numeric),
         ('OTC-012', 3::numeric, 5::numeric),
         ('OTC-013', 6::numeric, 10::numeric)
       ) as v(code, min_qty, reorder_qty)
 where o.code = v.code
   and o.min_qty = 0
   and o.reorder_qty = 0;

-- ── P14G: 월간 교육·OT ────────────────────────────────────────────────────────
-- AS-CAL-001(월 1회 정기교육·OT) + AS-KIT-001(직원 정기교육·신규직원 7일 기본교육,
-- 30일 실습형) + AS-GDE-001(상황연습·절대금지)을 한 화면에서 관리합니다.
-- 세션을 먼저 잡고(계획) 참석자를 붙인 뒤(출석) 교육자료·사진을 증빙으로 남깁니다.
create table if not exists public.arc_training_sessions (
  id            uuid primary key default gen_random_uuid(),
  -- EDU-YYYYMMDD-nn (한국시간 교육일 기준 일련번호)
  session_no    text not null,
  -- 달력 배치용 YYYY-MM
  period        text not null,
  -- OT=월간 OT·운영회의 / REGULAR=월 1회 정기교육 / NEWBIE=신규직원 기본교육
  -- DRILL=상황연습·모의훈련 / REFRESH=보수·재교육
  kind          text not null default 'REGULAR'
                check (kind in ('OT', 'REGULAR', 'NEWBIE', 'DRILL', 'REFRESH')),
  title         text not null default '',
  scheduled_on  date not null,
  start_time    text not null default '15:00',
  duration_min  integer not null default 30 check (duration_min between 5 and 480),
  place         text not null default '',
  instructor    text not null default '',
  -- arcTraining.js 의 모듈키 배열(교육 커리큘럼)과 상황연습 키 배열
  module_keys   jsonb not null default '[]'::jsonb,
  scenario_keys jsonb not null default '[]'::jsonb,
  -- 자료·사진·서명본 등 준비물 체크리스트
  materials     jsonb not null default '[]'::jsonb,
  status        text not null default 'PLANNED'
                check (status in ('PLANNED', 'DONE', 'CANCELED')),
  -- AS-CARE/사건 기록 연결(선택). 증빙 사진·서명 사본을 파일로 붙일 때 씁니다.
  evidence_id   text not null default '',
  note          text not null default '',
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (session_no)
);

create index if not exists arc_training_sessions_period_idx
  on public.arc_training_sessions (period, scheduled_on);

-- P14N — 달력 분류 확장: 월간 운영 루틴(ROUTINE) + 개인 일정(PERSONAL).
-- PERSONAL 은 owner_login_id 본인에게만 보입니다(총괄 개인 달력).
alter table public.arc_training_sessions
  add column if not exists owner_login_id text not null default '';

alter table public.arc_training_sessions
  drop constraint if exists arc_training_sessions_kind_check;

alter table public.arc_training_sessions
  add constraint arc_training_sessions_kind_check
  check (kind in ('OT', 'REGULAR', 'NEWBIE', 'DRILL', 'REFRESH', 'ROUTINE',
                  'PERSONAL', 'VERBAL', 'VERBAL_SURPRISE'));

create index if not exists arc_training_sessions_owner_idx
  on public.arc_training_sessions (owner_login_id, scheduled_on);

create table if not exists public.arc_training_attendees (
  session_id    uuid not null
                references public.arc_training_sessions (id) on delete cascade,
  employee_id   text not null,
  employee_name text not null default '',
  attended      boolean not null default false,
  signed_at     timestamptz,
  -- 구두평가 점수(100점 만점)와 결과
  score         numeric(5, 2),
  -- PENDING=미평가 / PASS=통과 / MAKEUP=보충교육 필요 / FAIL=재교육 / EXCUSED=사유 불참
  result        text not null default 'PENDING'
                check (result in ('PENDING', 'PASS', 'MAKEUP', 'FAIL', 'EXCUSED')),
  -- 불참·보충은 14일 이내 재교육(AS-KIT-001)
  makeup_due_on date,
  note          text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (session_id, employee_id)
);

create index if not exists arc_training_attendees_employee_idx
  on public.arc_training_attendees (employee_id, result);
-- ══════════════════════════════════════════════════════════════════════════
-- P14H — AS-CARE 서식 원본(외부 파일) · 비현장 보고 정보 · 기록자 확인
--   AS-REC-001 별첨 A ② 「비현장·사후 보고」 항목(보고정보 발생시각·보고받은
--   시각·보고자·보고수단·보고 범위)과 기록자 서명란을 그대로 담습니다.
--   파일 본문은 DB가 아니라 ARC_FILES_DIR 아래에 두고, 여기에는 서식 목록만 둡니다.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.arc_care_records
  add column if not exists report_occurred_at text not null default '',
  add column if not exists report_received_at text not null default '',
  add column if not exists report_channel     text not null default '',
  add column if not exists reporter_enc       text not null default '',
  add column if not exists report_scope_enc   text not null default '',
  add column if not exists recorder_sign_enc  text not null default '';

-- 서식 원본 보관 위치(ARC_FILES_DIR) 안내용 색인. 사건·기록별 최근 첨부를 빠르게 찾습니다.
create index if not exists arc_care_files_record_time_idx
  on public.arc_care_files (care_record_id, created_at desc);

-- ══════════════════════════════════════════════════════════════════════════
-- P14I — 품질관리: 사후검토·개선 (AS-REC-001 F11·F12·F13·F14)
--   "사건이 끝난 뒤 다시 같은 일이 생기지 않게" 남기는 기록입니다.
--   F11 사후검토회의록 / F12 Near Miss / F13 CAPA / F14 재고·AS-CARE 연계 이상.
--   네 서식은 공통 골격(작성일·참석자·장소/방법·관련 사건·조치사항)이 같고
--   본문 항목만 달라서 kind + detail(jsonb) 한 쌍으로 함께 보관합니다.
--   본문 항목 정의의 원본은 server/src/arcQuality.js 의 ARC_QUALITY_FORMS 입니다.
-- ══════════════════════════════════════════════════════════════════════════
create table if not exists public.arc_quality_records (
  id               uuid primary key default gen_random_uuid(),
  -- F11-YYYYMMDD-nn / F12-… / F13-… / F14-… (한국시간 작성일 기준 일련번호)
  record_no        text not null,
  -- REVIEW=F11 사후검토 / NEAR_MISS=F12 근접오류 / CAPA=F13 시정·예방 /
  -- STOCK_ISSUE=F14 재고·AS-CARE 연계 이상
  kind             text not null
                   check (kind in ('REVIEW', 'NEAR_MISS', 'CAPA', 'STOCK_ISSUE')),
  title            text not null default '',
  held_on          date not null default (now() at time zone 'Asia/Seoul')::date,
  author_id        text references public.employees(id) on delete set null,
  author_name      text not null default '',
  -- 서식 공통: 참석자·상담대상 / 장소·방법
  attendees        text not null default '',
  location_method  text not null default '',
  -- 관련 사건. 사건 원본은 지우지 않으므로 느슨하게 연결합니다.
  incident_id      uuid references public.arc_incidents(id) on delete set null,
  incident_no      text not null default '',
  -- 관련 증빙·연계 ID(F9 점검표·SUP 구매·PHO 사진·EXP·EDU 교육·INC 사건)
  related_docs     text not null default '',
  -- 서식별 본문. arcQuality.js 의 항목 키만 저장합니다.
  detail           jsonb not null default '{}'::jsonb,
  -- OPEN=작성됨 / IN_PROGRESS=조치 진행 / VERIFIED=검증 완료 / CLOSED=종결
  status           text not null default 'OPEN'
                   check (status in ('OPEN', 'IN_PROGRESS', 'VERIFIED', 'CLOSED')),
  -- CAPA 효과 검증 결과: EFFECTIVE 효과 있음 / PARTIAL 부분 효과 / MORE 추가조치 필요
  verdict          text not null default ''
                   check (verdict in ('', 'EFFECTIVE', 'PARTIAL', 'MORE')),
  -- 조치 완료 목표일(사후검토는 사건 종료 후 7일 안에 여는 것을 권장)
  due_on           date,
  verified_on      date,
  verified_by_name text not null default '',
  created_by       text references public.employees(id) on delete set null,
  created_by_name  text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (record_no)
);

create index if not exists arc_quality_kind_idx
  on public.arc_quality_records (kind, held_on desc);

create index if not exists arc_quality_status_idx
  on public.arc_quality_records (status, due_on);

create index if not exists arc_quality_incident_idx
  on public.arc_quality_records (incident_no);

-- 서식 안의 Action-Item 표(조치사항·담당자·기한·완료/확인)를 한 줄씩 저장합니다.
create table if not exists public.arc_quality_actions (
  id         uuid primary key default gen_random_uuid(),
  record_id  uuid not null
             references public.arc_quality_records (id) on delete cascade,
  seq        integer not null default 1,
  action     text not null default '',
  owner      text not null default '',
  due_on     date,
  done_on    date,
  done_note  text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists arc_quality_actions_record_idx
  on public.arc_quality_actions (record_id, seq);

-- 기한 지난 미완료 조치를 빠르게 세기 위한 부분 인덱스
create index if not exists arc_quality_actions_open_idx
  on public.arc_quality_actions (due_on)
  where done_on is null;

-- ══════════════════════════════════════════════════════════════════════════
-- P14J — 행사·의료지원 관리 (EVT)
--   혼자야에서 여는 행사(파티·공연·팝업·단체대관·시즌·중계)마다
--   "ARC가 무엇을 하는지"를 한 장으로 남깁니다.
--     · 지원 수준(미지원/사전자문/현장대기/행사의료진)과 행사의료진 구성
--     · 위험평가 R = 가능성(L) × 중대성(S)  ※ AS-OPS-001 위험평가 방식
--     · 행사 전 / 당일 / 종료 후 체크리스트(필수 항목 포함)
--     · 배정 인력 + 외부 의료인 AS-NOT-001 고지서 교부 여부
--   체크리스트 항목 원본은 server/src/arcEvents.js 의
--   ARC_EVENT_TASK_TEMPLATES 이고, 표에는 행사 시점에 복사해 둡니다.
--   (템플릿을 나중에 고쳐도 지난 행사 기록은 그대로 남아야 하므로)
-- ══════════════════════════════════════════════════════════════════════════
create table if not exists public.arc_events (
  id               uuid primary key default gen_random_uuid(),
  -- EVT-YYYYMMDD-nn (행사 시작일 기준 일련번호)
  event_no         text not null,
  title            text not null,
  -- PARTY 파티·공연 / LIVE 공연중심 / POPUP 팝업·마켓 / PRIVATE 단체대관
  -- SEASON 시즌행사 / WATCH 스포츠 중계 / OTHER 기타
  kind             text not null default 'PARTY'
                   check (kind in ('PARTY', 'LIVE', 'POPUP', 'PRIVATE', 'SEASON',
                                   'WATCH', 'OTHER')),
  starts_on        date not null default (now() at time zone 'Asia/Seoul')::date,
  start_time       time,
  ends_on          date,
  end_time         time,
  -- 장소·환경. 야외 여부는 폭염·한파·전원 체크를 추가로 요구합니다.
  venue            text not null default '',
  outdoor          boolean not null default false,
  expected_guests  integer not null default 0,
  serves_alcohol   boolean not null default true,
  serves_food      boolean not null default false,
  -- 주최·기획(외부 업체/아티스트), 혼자야 담당자
  organizer        text not null default '',
  host_name        text not null default '',
  host_contact     text not null default '',
  -- ARC 지원 수준. NONE 미지원 / ADVISE 사전자문 / STANDBY 현장대기 /
  -- MEDIC 행사의료진 배치. STANDBY·MEDIC 은 AS-OPS-001 06-B-3 의
  -- "범위초과 업무"라 사전합의가 필요합니다.
  arc_level        text not null default 'ADVISE'
                   check (arc_level in ('NONE', 'ADVISE', 'STANDBY', 'MEDIC')),
  -- 행사의료진 구성: NONE 미배치 / ARC_RN 최윤희 RN(비상주) /
  -- EXTERNAL 외부 의료인·응급구조사 / EMS_LIAISON 119·구급대 사전연계만
  medic_mode       text not null default 'NONE'
                   check (medic_mode in ('NONE', 'ARC_RN', 'EXTERNAL', 'EMS_LIAISON')),
  -- 위험평가: R = L × S (1~4 낮음 / 5~9 관리 / 10~15 우선관리 / 16~25 즉시개선)
  risk_l           smallint not null default 2 check (risk_l between 1 and 5),
  risk_s           smallint not null default 2 check (risk_s between 1 and 5),
  -- 범위초과 업무 사전합의 여부와 근거(구두/서면/견적)
  scope_agreed     boolean not null default false,
  scope_note       text not null default '',
  -- 비용 처리: NONE 없음 / EXPENSE 실비정산 / CONTRACT 별도 계약
  billing          text not null default 'NONE'
                   check (billing in ('NONE', 'EXPENSE', 'CONTRACT')),
  -- 현장 정보(행사용 EAP 요약)
  aed_location     text not null default '',
  assembly_point   text not null default '',
  nearest_er       text not null default '',
  eap_note         text not null default '',
  -- 홍보물·안내문 금지표현 검수(상주 의료진·진료 가능·안전보장 인증 등)
  promo_checked    boolean not null default false,
  notes            text not null default '',
  -- PLANNING 준비중 / READY 준비완료 / DONE 종료 / CANCELED 취소
  status           text not null default 'PLANNING'
                   check (status in ('PLANNING', 'READY', 'DONE', 'CANCELED')),
  cancel_reason    text not null default '',
  created_by       text references public.employees(id) on delete set null,
  created_by_name  text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (event_no)
);

create index if not exists arc_events_start_idx
  on public.arc_events (starts_on desc);

create index if not exists arc_events_status_idx
  on public.arc_events (status, starts_on);

-- 칵테일바 특화 안전 정보(2026-11-28 추가).
-- 주류 구성·혼잡도·라스트오더·응급처치 스테이션·사전 브리핑·종료 리뷰.
alter table public.arc_events
  add column if not exists drink_profile text not null default '',
  add column if not exists peak_guests integer,
  add column if not exists last_order_time time,
  add column if not exists station_note text not null default '',
  add column if not exists briefing_note text not null default '',
  add column if not exists review_note text not null default '';

-- 행사 체크리스트. phase = BEFORE(행사 전) / DURING(당일) / AFTER(종료 후)
create table if not exists public.arc_event_tasks (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null
                references public.arc_events (id) on delete cascade,
  phase         text not null default 'BEFORE'
                check (phase in ('BEFORE', 'DURING', 'AFTER')),
  seq           integer not null default 1,
  label         text not null,
  hint          text not null default '',
  required      boolean not null default false,
  done_on       date,
  done_by_name  text not null default '',
  note          text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists arc_event_tasks_event_idx
  on public.arc_event_tasks (event_id, phase, seq);

create index if not exists arc_event_tasks_open_idx
  on public.arc_event_tasks (event_id)
  where done_on is null and required;

-- 행사 배정 인력. 외부 의료인은 AS-NOT-001 고지서 교부 여부를 함께 남깁니다.
create table if not exists public.arc_event_staff (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null
                 references public.arc_events (id) on delete cascade,
  seq            integer not null default 1,
  name           text not null,
  -- DIRECTOR 총괄 / MEDIC_RN 최윤희 RN / ONSITE_LEAD 현장책임 /
  -- EMPLOYEE 직원 / EXTERNAL_MEDIC 외부 의료인·응급구조사 / EMS 구급대
  role           text not null default 'EMPLOYEE'
                 check (role in ('DIRECTOR', 'MEDIC_RN', 'ONSITE_LEAD', 'EMPLOYEE',
                                 'EXTERNAL_MEDIC', 'EMS')),
  org            text not null default '',
  license_type   text not null default '',
  -- NA 해당없음 / VALID 유효 확인 / UNKNOWN 미확인 / EXPIRED 정지·취소·만료
  license_state  text not null default 'NA'
                 check (license_state in ('NA', 'VALID', 'UNKNOWN', 'EXPIRED')),
  notice_given   boolean not null default false,
  notice_on      date,
  notice_no      text not null default '',
  signed         boolean not null default false,
  from_time      time,
  to_time        time,
  note           text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 고지서 교부 여부를 나중에 고칠 수 있어야 해서 수정 시각을 함께 남깁니다.
alter table public.arc_event_staff
  add column if not exists updated_at timestamptz not null default now();

create index if not exists arc_event_staff_event_idx
  on public.arc_event_staff (event_id, seq);

-- 행사 중 발생한 사건을 AS-CARE(arc_incidents)와 연결합니다.
-- 사건 접수 화면에서 행사를 고르면 event_id / event_no 가 함께 남아
-- 행사 상세에서 "이 행사에서 생긴 사건"을 바로 볼 수 있습니다.
alter table public.arc_incidents
  add column if not exists event_id uuid references public.arc_events (id) on delete set null,
  add column if not exists event_no text not null default '';

create index if not exists arc_incidents_event_idx
  on public.arc_incidents (event_id)
  where event_id is not null;

create index if not exists arc_incidents_event_no_idx
  on public.arc_incidents (event_no)
  where event_no <> '';

-- ══════════════════════════════════════════════════════════════════════════
-- P14O — 교육자료 총괄 수정 · 구두테스트 · 요청 게시판 · 상비약 사용/정산
-- ══════════════════════════════════════════════════════════════════════════

-- ── 교육자료 총괄 수정(override) ────────────────────────────────────────────
-- 교육자료 원문은 코드(arcTraining.js / arcTrainingDeep.js)가 원본입니다.
-- ARC 대표(RN)가 화면에서 고친 부분만 여기에 남기고, 조회할 때 원문 위에 덮어
-- 씁니다. 그래서 원문이 개선되면 고치지 않은 항목은 자동으로 따라옵니다.
create table if not exists public.arc_training_content (
  id           uuid primary key default gen_random_uuid(),
  -- MODULE=교육 모듈 / SCENARIO=상황연습 / FORBIDDEN=절대금지
  scope        text not null check (scope in ('MODULE', 'SCENARIO', 'FORBIDDEN')),
  -- 모듈키(ROLE)·상황키(S01)·절대금지키(F01)
  content_key  text not null,
  -- 덮어쓸 필드만 담습니다(예: {"summary": "...", "goal": "..."}).
  payload      jsonb not null default '{}'::jsonb,
  -- '도우미'에 입력한 이번 달 보강 메모(자동 문장 생성의 근거).
  helper_input jsonb not null default '{}'::jsonb,
  updated_by   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (scope, content_key)
);

-- ── 구두테스트(정기·불시) 응시 기록 ─────────────────────────────────────────
-- 문항·배점 원본은 코드(arcVerbal.js)가 원본이고, 여기에는 "누가 언제 어떤
-- 항목을 수행/부분수행/미수행 했는지"만 남깁니다.
create table if not exists public.arc_verbal_exams (
  id            uuid primary key default gen_random_uuid(),
  -- VB-YYYYMMDD-nn
  exam_no       text not null,
  -- 달력에 잡은 교육 세션과 연결(선택). 불시 테스트도 세션을 만들어 두고 붙입니다.
  session_id    uuid references public.arc_training_sessions (id) on delete set null,
  -- REGULAR=정기 구두테스트 / SURPRISE=사전예고 없는 불시 테스트
  kind          text not null default 'REGULAR'
                  check (kind in ('REGULAR', 'SURPRISE')),
  scheduled_on  date not null,
  employee_id   text references public.employees (id) on delete set null,
  employee_name text not null default '',
  examiner_name text not null default '',
  -- 채점 합계(수행 1.0 · 부분수행 0.5 · 미수행 0 배점 합산)
  total_score   numeric(6, 2) not null default 0 check (total_score >= 0),
  max_score     numeric(6, 2) not null default 0 check (max_score >= 0),
  -- PENDING=미채점 / PASS=통과 / RETAKE=재평가 / FAIL=재교육
  verdict       text not null default 'PENDING'
                  check (verdict in ('PENDING', 'PASS', 'RETAKE', 'FAIL')),
  feedback      text not null default '',
  retest_on     date,
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (exam_no)
);

create index if not exists arc_verbal_exams_employee_idx
  on public.arc_verbal_exams (employee_id, scheduled_on desc);

create index if not exists arc_verbal_exams_date_idx
  on public.arc_verbal_exams (scheduled_on desc, kind);

create table if not exists public.arc_verbal_scores (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references public.arc_verbal_exams (id) on delete cascade,
  section_key text not null default '',
  item_key    text not null default '',
  -- PERFORM=수행 / PARTIAL=부분수행 / NONE=미수행
  result      text not null default 'NONE'
                check (result in ('PERFORM', 'PARTIAL', 'NONE')),
  score       numeric(6, 2) not null default 0 check (score >= 0),
  note        text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists arc_verbal_scores_exam_idx
  on public.arc_verbal_scores (exam_id, sort_order);

-- 구두테스트도 달력(arc_training_sessions)에 잡히므로 kind 허용값을 늘립니다.
-- 두 구분은 ARC 대표(RN)에게만 보입니다(불시 테스트가 미리 새면 안 됨).
alter table public.arc_training_sessions
  drop constraint if exists arc_training_sessions_kind_check;

alter table public.arc_training_sessions
  add constraint arc_training_sessions_kind_check
  check (kind in ('OT', 'REGULAR', 'NEWBIE', 'DRILL', 'REFRESH', 'ROUTINE',
                  'PERSONAL', 'VERBAL', 'VERBAL_SURPRISE'));

-- ── 요청 게시판(직원·사장 → ARC 대표) ──────────────────────────────────────
-- 모든 재직 직원이 ARC 화면에서 글을 남깁니다. 총괄이 열어 보면 READ,
-- 완료 처리는 반드시 완료 사유(done_note)를 적어야 합니다.
create table if not exists public.arc_requests (
  id                 uuid primary key default gen_random_uuid(),
  -- REQ-YYYYMMDD-nn
  request_no         text not null,
  -- QUESTION=질문 / COMPLAINT=불만·건의 / SUPPLY=응급물품·비품 /
  -- EDUCATION=교육·훈련 / FACILITY=안전시설·환경 / HEALTH=건강·컨디션 / ETC=기타
  category           text not null default 'QUESTION'
                       check (category in ('QUESTION', 'COMPLAINT', 'SUPPLY',
                                           'EDUCATION', 'FACILITY', 'HEALTH', 'ETC')),
  title              text not null default '',
  body               text not null default '',
  urgent             boolean not null default false,
  -- PENDING=대기중 / READ=읽음 / DONE=완료
  status             text not null default 'PENDING'
                       check (status in ('PENDING', 'READ', 'DONE')),
  author_employee_id text references public.employees (id) on delete set null,
  author_name        text not null default '',
  author_role        text not null default '',
  read_at            timestamptz,
  read_by            text not null default '',
  done_at            timestamptz,
  done_by            text not null default '',
  -- 완료 처리는 이 사유가 있어야만 가능합니다.
  done_note          text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (request_no)
);

create index if not exists arc_requests_status_idx
  on public.arc_requests (status, created_at desc);

create index if not exists arc_requests_author_idx
  on public.arc_requests (author_employee_id, created_at desc);

create table if not exists public.arc_request_replies (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.arc_requests (id) on delete cascade,
  author_employee_id text references public.employees (id) on delete set null,
  author_name        text not null default '',
  author_role        text not null default '',
  is_director        boolean not null default false,
  body               text not null default '',
  created_at         timestamptz not null default now()
);

create index if not exists arc_request_replies_request_idx
  on public.arc_request_replies (request_id, created_at);

-- ── 직원 개인 상비약 단가 이력 ─────────────────────────────────────────────
-- 총괄이 단가를 미리 등록해 두면 사용 기록에서 금액이 바로 계산됩니다.
-- 적용일이 지난 가장 최근 단가를 스냅샷으로 복사합니다(과거 금액은 안 바뀜).
create table if not exists public.arc_otc_prices (
  id             uuid primary key default gen_random_uuid(),
  otc_item_id    uuid not null references public.arc_otc_items (id) on delete cascade,
  item_code      text not null default '',
  item_name      text not null default '',
  unit_price     integer not null default 0 check (unit_price >= 0),
  effective_from date not null default current_date,
  note           text not null default '',
  employee_id    text references public.employees (id) on delete set null,
  employee_name  text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists arc_otc_prices_item_idx
  on public.arc_otc_prices (otc_item_id, effective_from desc, created_at desc);

-- ── 직원 개인 상비약 사용 기록(육하원칙) ───────────────────────────────────
-- 언제·누가·어디서·무엇을·얼마나·왜. 건강 상세는 AS-CARE 에만 적습니다.
create table if not exists public.arc_otc_usages (
  id                uuid primary key default gen_random_uuid(),
  -- OTCU-YYYYMMDD-nn
  usage_no          text not null,
  otc_item_id       uuid references public.arc_otc_items (id) on delete set null,
  item_code         text not null default '',
  item_name         text not null default '',
  item_unit         text not null default '',
  -- 'YYYY-MM' (정산 기간 묶음)
  period            text not null default '',
  used_on           date not null default current_date,
  used_time         text not null default '',
  place             text not null default '',
  -- SELF=본인 복용 / STAFF=다른 직원 / OWNER=사장 / ETC=기타
  target_kind       text not null default 'SELF'
                      check (target_kind in ('SELF', 'STAFF', 'OWNER', 'ETC')),
  target_employee_id text references public.employees (id) on delete set null,
  target_name       text not null default '',
  reason            text not null default '',
  symptom           text not null default '',
  qty               numeric(12, 2) not null check (qty > 0),
  unit_price        integer not null default 0 check (unit_price >= 0),
  amount            integer not null default 0 check (amount >= 0),
  care_incident_no  text not null default '',
  -- 지급 확인(정산) 연결. 취소된 사용 기록은 정산에서 빠집니다.
  settlement_id     uuid,
  note              text not null default '',
  status            text not null default 'ACTIVE'
                      check (status in ('ACTIVE', 'VOID')),
  void_reason       text not null default '',
  voided_at         timestamptz,
  voided_by_name    text not null default '',
  employee_id       text references public.employees (id) on delete set null,
  employee_name     text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (usage_no)
);

create index if not exists arc_otc_usages_period_idx
  on public.arc_otc_usages (period, used_on desc);

create index if not exists arc_otc_usages_item_idx
  on public.arc_otc_usages (otc_item_id, used_on desc);

-- ── 직원 개인 상비약 정산(총괄 요청 → 사장 지급) ────────────────────────────
-- 월 단위로 묶어 지급을 요청하고, 사장이 지급하면 PAID 로 바뀝니다.
create table if not exists public.arc_otc_settlements (
  id             uuid primary key default gen_random_uuid(),
  -- OTCS-YYYYMM-nn
  settlement_no  text not null,
  period         text not null,
  requested_on   date not null default current_date,
  usage_count    integer not null default 0 check (usage_count >= 0),
  total_amount   integer not null default 0 check (total_amount >= 0),
  -- REQUESTED=지급 요청 / PAID=지급 완료 / CANCELED=요청 취소
  status         text not null default 'REQUESTED'
                   check (status in ('REQUESTED', 'PAID', 'CANCELED')),
  requested_by   text not null default '',
  request_note   text not null default '',
  paid_on        date,
  paid_amount    integer not null default 0 check (paid_amount >= 0),
  paid_method    text not null default 'TRANSFER'
                   check (paid_method in ('TRANSFER', 'CASH', 'CARD', 'ETC')),
  paid_note      text not null default '',
  paid_by        text not null default '',
  -- 지급 요청에 포함된 사용 기록 스냅샷(나중에 내역이 바뀌어도 금액 근거 유지)
  detail         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (settlement_no)
);

create index if not exists arc_otc_settlements_period_idx
  on public.arc_otc_settlements (period, status);

alter table public.arc_otc_usages
  drop constraint if exists arc_otc_usages_settlement_fk;

alter table public.arc_otc_usages
  add constraint arc_otc_usages_settlement_fk
  foreign key (settlement_id) references public.arc_otc_settlements (id) on delete set null;
