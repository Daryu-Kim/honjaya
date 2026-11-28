// P14J — 응급안전관리센터 「행사·의료지원」 도메인 로직.
//
// 혼자야에서 여는 행사(파티·공연·팝업·단체대관·시즌·중계)마다
// "이 행사에서 ARC가 무엇을 하는지"를 한 장으로 남깁니다.
//
// 근거 문서
//   * AS-OPS-001 06-B-3 : 대규모 행사 현장지원·장시간 현장대기는 범위초과 업무
//     → 사전합의 없이 현장대기/의료진 배치를 잡으면 안 됩니다. (blockers 로 경고)
//   * AS-OPS-001 06-B-1 : "상주 의료진 / 24시간 의료진 대기 / 진료 가능 /
//     의료기관 수준 처치 / 안전보장 인증" 표현 금지 → 홍보물 검수 항목.
//   * AS-NOT-001        : 외부 의료인·응급구조사·구급대가 행사에 들어오면
//     1인당 고지서를 교부해야 합니다. (staff 표의 notice_* 컬럼)
//   * AS-KIT-001        : 행사용 이동 키트·소모품 확인, 사용 시 기록.
//   * AS-REC-001 F11    : 행사 중 사건이 생기면 사후검토로 이어집니다.
//
// 체크리스트 항목의 원본은 이 파일의 ARC_EVENT_TASK_TEMPLATES /
// ARC_EVENT_KIND_TASKS 이고, 화면은 서버가 준 카탈로그를 그대로 그립니다.
import { randomUUID } from "node:crypto";

import { pool } from "./db.js";
import { badRequest } from "./http/errors.js";

const MAX_TITLE = 160;
const MAX_LINE = 200;
const MAX_TEXT = 2000;
const MAX_LIMIT = 200;
const MAX_TASKS = 80;
const MAX_STAFF = 30;

// ── 카탈로그(서버가 단일 출처) ────────────────────────────────────────────

export const ARC_EVENT_KINDS = [
  {
    key: "PARTY",
    label: "파티·공연",
    tone: "alert",
    guidance:
      "주류·군중·소음이 겹치는 유형이에요. 실신·주취·낙상·과호흡을 먼저 봅니다.",
    risks: ["주취·실신", "군중 밀집", "낙상·충돌", "큰 소음·과호흡", "야간 이동"],
    kit: ["구토봉투", "생수·얼음", "경추 고정 보조", "휴대 손전등"],
  },
  {
    key: "LIVE",
    label: "공연 중심",
    tone: "alert",
    guidance:
      "무대·음향 장비와 관객 밀집이 핵심 위험이에요. 감전·낙상·이물을 봅니다.",
    risks: ["무대 전원·케이블", "관객 밀집", "낙상·추락", "청각 자극", "야간 조명"],
    kit: ["화상 키트", "전원 차단 확인표", "휴대 손전등", "이물 제거 기구"],
  },
  {
    key: "POPUP",
    label: "팝업·마켓",
    tone: "info",
    guidance: "야외·장시간 운영이 많아 폭염·한파·화상·알레르기 위험이 커요.",
    risks: ["폭염·한파", "야외 전원", "화상·데움", "음식 알레르기", "장시간 서서 운영"],
    kit: ["정제소금·이온음료", "냉온 찜질팩", "화상 키트", "손 소독·장갑"],
  },
  {
    key: "PRIVATE",
    label: "단체 대관",
    tone: "neutral",
    guidance:
      "주최 측과 인원·음주·외부 케이터링 기준을 서면으로 맞춰 두면 사고가 줄어요.",
    risks: ["인원 초과", "주류 무제한", "외부 음식 반입", "미성년자", "귀가 동선"],
    kit: ["구토봉투", "생수", "알레르기 안내문"],
  },
  {
    key: "SEASON",
    label: "시즌 행사",
    tone: "warn",
    guidance:
      "장식·조명·특수효과(연기·드라이아이스)로 인한 사고가 늘어나는 시기예요.",
    risks: ["장식 조명 전원", "미끄럼", "연기·분진", "혼잡", "저체온"],
    kit: ["미끄럼 방지 매트", "휴대 손전등", "담요", "화상 키트"],
  },
  {
    key: "WATCH",
    label: "스포츠 중계",
    tone: "warn",
    guidance:
      "경기 시작·종료 시각에 음주와 환호가 몰려요. 응원 도구·유리병을 먼저 봅니다.",
    risks: ["과음", "유리병·응원도구", "경기 종료 후 혼잡", "고성·다툼"],
    kit: ["구토봉투", "생수", "유리 조각 수거 도구"],
  },
  {
    key: "OTHER",
    label: "기타",
    tone: "neutral",
    guidance: "위 유형에 없으면 위험요인을 직접 적고 체크리스트를 조정하세요.",
    risks: [],
    kit: [],
  },
];

export const ARC_ARC_LEVELS = [
  {
    key: "NONE",
    label: "미지원",
    tone: "neutral",
    description: "ARC 개입 없이 정보만 남겨요.",
    requiresAgreement: false,
  },
  {
    key: "ADVISE",
    label: "사전 자문",
    tone: "info",
    description: "체크리스트·물품 준비·직원 브리핑까지 도와요. (기본)",
    requiresAgreement: false,
  },
  {
    key: "STANDBY",
    label: "현장 대기(비상주)",
    tone: "warn",
    description:
      "행사 시간대에 최윤희 RN이 현장에 대기해요. 범위초과 업무라 사전합의가 필요해요.",
    requiresAgreement: true,
  },
  {
    key: "MEDIC",
    label: "행사의료진 배치",
    tone: "alert",
    description:
      "외부 의료인·구급대를 포함해 의료지원 체계를 운영해요. 사전합의·고지서·역할 문서가 필요해요.",
    requiresAgreement: true,
  },
];

export const ARC_MEDIC_MODES = [
  { key: "NONE", label: "미배치", description: "행사에 의료 인력을 따로 두지 않아요." },
  {
    key: "ARC_RN",
    label: "최윤희 RN(비상주)",
    description: "ARC 총괄이 비상주 메딕으로 참여해요. 상주 의료진이 아니에요.",
  },
  {
    key: "EXTERNAL",
    label: "외부 의료인·응급구조사",
    description: "외부 인력은 AS-NOT-001 고지서 교부와 면허 확인이 필요해요.",
  },
  {
    key: "EMS_LIAISON",
    label: "119·구급대 사전연계",
    description: "현장 상주 없이 신고·이송 동선만 미리 맞춰 둬요.",
  },
];

export const ARC_EVENT_STATUSES = [
  { key: "PLANNING", label: "준비 중", tone: "warn" },
  { key: "READY", label: "준비 완료", tone: "info" },
  { key: "DONE", label: "종료", tone: "ok" },
  { key: "CANCELED", label: "취소", tone: "muted" },
];

export const ARC_EVENT_STAFF_ROLES = [
  { key: "DIRECTOR", label: "총괄", tone: "info" },
  { key: "MEDIC_RN", label: "메딕(최윤희 RN)", tone: "ok" },
  { key: "ONSITE_LEAD", label: "현장 책임", tone: "info" },
  { key: "EMPLOYEE", label: "직원", tone: "neutral" },
  { key: "EXTERNAL_MEDIC", label: "외부 의료인·응급구조사", tone: "warn" },
  { key: "EMS", label: "구급대·119", tone: "alert" },
];

export const ARC_EVENT_LICENSE_STATES = [
  { key: "NA", label: "해당 없음" },
  { key: "VALID", label: "유효 확인" },
  { key: "UNKNOWN", label: "미확인" },
  { key: "EXPIRED", label: "정지·취소·만료" },
];

// 위험평가 R = L × S. 밴드는 AS-OPS-001 위험평가 기준을 그대로 씁니다.
export const ARC_EVENT_RISK_BANDS = [
  { key: "LOW", label: "낮음", min: 1, max: 4, tone: "ok" },
  { key: "MANAGED", label: "관리", min: 5, max: 9, tone: "info" },
  { key: "PRIORITY", label: "우선관리", min: 10, max: 15, tone: "warn" },
  { key: "IMMEDIATE", label: "즉시개선", min: 16, max: 25, tone: "alert" },
];

// ── 체크리스트 템플릿 ────────────────────────────────────────────────────
// required = true 인 항목은 상태 변경(준비 완료/종료) 시 서버가 막습니다.
export const ARC_EVENT_TASK_TEMPLATES = [
  {
    phase: "BEFORE",
    label: "행사 개요 확정(일시·장소·예상 인원·주류 여부)",
    hint: "인원·음주·야외 여부가 위험도와 지원 수준을 바꿔요.",
    required: true,
  },
  {
    phase: "BEFORE",
    label: "위험평가(R=L×S)와 ARC 지원 수준 확정",
    hint: "위험도가 높으면 지원 수준을 올리고 사전합의를 먼저 확인하세요.",
    required: true,
  },
  {
    phase: "BEFORE",
    label: "범위초과 업무 사전합의 확인",
    hint: "현장대기·행사의료진 배치는 무상범위 밖이에요(AS-OPS-001 06-B-3).",
    required: false,
  },
  {
    phase: "BEFORE",
    label: "행사용 응급행동계획(EAP) 갱신",
    hint: "119 신고 담당·집결지·구급대 진입 동선·인계 병원을 정해요.",
    required: true,
  },
  {
    phase: "BEFORE",
    label: "현장 키트 구성·수량 확인",
    hint: "이동 구급상자 + 행사 유형별 추가 품목.",
    required: true,
  },
  {
    phase: "BEFORE",
    label: "소모품·상비약 재고 확인 및 보충",
    hint: "AS-KIT-001 안전재고 미만이면 행사 전에 채워요.",
    required: true,
  },
  {
    phase: "BEFORE",
    label: "구급대 진입 동선·집결지 확인",
    hint: "차량 진입 위치와 들것이 지나갈 폭을 미리 봐 둡니다.",
    required: true,
  },
  {
    phase: "BEFORE",
    label: "직원 역할분담 브리핑(신고·안내·기록·물품)",
    hint: "행사 당일 처음 정하지 않도록 사전에 이름을 정해요.",
    required: true,
  },
  {
    phase: "BEFORE",
    label: "홍보물·안내문 금지표현 검수",
    hint: "상주 의료진·24시간 대기·진료 가능·안전보장 인증 표현은 금지예요.",
    required: true,
  },
  {
    phase: "BEFORE",
    label: "외부 의료인·구급대 AS-NOT-001 고지서 교부",
    hint: "외부 인력이 있으면 1인당 1부 교부하고 배정 인력 표에 남겨요.",
    required: false,
  },
  {
    phase: "BEFORE",
    label: "주최 측과 인원·음주·미성년자 기준 확인",
    hint: "단체 대관·외부 기획 행사에서 특히 필요해요.",
    required: false,
  },
  {
    phase: "BEFORE",
    label: "사건 접수·기록 방법(AS-CARE) 사전 안내",
    hint: "행사 중 사건은 발생 즉시 INC로 접수하고 24시간 안에 기록해요.",
    required: false,
  },
  {
    phase: "BEFORE",
    label: "행사 전날 최종 리마인드(시간·연락망·인원)",
    hint: "담당자·주최 측에 문자로 한 번 더 확인해요.",
    required: false,
  },
  {
    phase: "DURING",
    label: "시작 전 키트 위치·수량 최종 확인",
    hint: "직원 전원이 위치를 아는지 확인해요.",
    required: true,
  },
  {
    phase: "DURING",
    label: "응급 연락망 재확인(119·ARC 총괄·가까운 응급실)",
    hint: "연락이 안 될 때를 대비해 두 곳 이상 적어 둬요.",
    required: true,
  },
  {
    phase: "DURING",
    label: "직원 출근·역할 재확인",
    hint: "사전 브리핑대로 배치됐는지 봐요.",
    required: true,
  },
  {
    phase: "DURING",
    label: "물·얼음·구토봉투·휴지 비치 확인",
    hint: "주류 행사에서 가장 먼저 소진되는 품목이에요.",
    required: false,
  },
  {
    phase: "DURING",
    label: "과음·실신 위험 구역 순회 점검",
    hint: "화장실·계단·출입구는 주기적으로 봐요.",
    required: false,
  },
  {
    phase: "DURING",
    label: "사건 발생 시 즉시 접수(INC) 후 119 우선",
    hint: "ARC 총괄 연락을 기다리느라 신고를 늦추지 않아요.",
    required: true,
  },
  {
    phase: "DURING",
    label: "구급상자 사용 시 품목·수량·시각 기록",
    hint: "당일 영업 종료 전, 늦어도 24시간 안에 사용대장에 등록해요.",
    required: true,
  },
  {
    phase: "AFTER",
    label: "키트 회수·잔량·파손 확인",
    hint: "부족분은 다음 행사 전에 채울 수 있게 수량을 적어 둬요.",
    required: true,
  },
  {
    phase: "AFTER",
    label: "사용 물품 사용대장 등록",
    hint: "소모품은 사용대장, 구매·보충은 구매·실비정산으로 넘어가요.",
    required: true,
  },
  {
    phase: "AFTER",
    label: "사건 발생 시 AS-CARE 작성·사후검토(F11)",
    hint: "사건이 없으면 건너뛰어도 돼요.",
    required: false,
  },
  {
    phase: "AFTER",
    label: "실비정산·보충 요청",
    hint: "영수증·구매내역을 붙여 월말 또는 청구 후 14일 안에 정산해요.",
    required: false,
  },
  {
    phase: "AFTER",
    label: "다음 행사 개선사항 기록",
    hint: "Near Miss(거의 사고)도 여기에 남겨요.",
    required: true,
  },
  {
    phase: "AFTER",
    label: "외부 인력 고지서·기록 보관 확인",
    hint: "교부일·수령 확인을 배정 인력 표에서 마무리해요.",
    required: false,
  },
];

// 행사 유형별 추가 항목. 기본 템플릿 뒤에 붙습니다.
export const ARC_EVENT_KIND_TASKS = {
  PARTY: [
    {
      phase: "BEFORE",
      label: "군중 밀집 구역 동선·비상구 확보",
      hint: "테이블 배치를 바꿔 통로를 먼저 확보해요.",
      required: true,
    },
    {
      phase: "DURING",
      label: "주취자 분리·이동 계획 확인",
      hint: "귀가 동선·택시 연락을 미리 정해 둬요.",
      required: false,
    },
  ],
  LIVE: [
    {
      phase: "BEFORE",
      label: "무대 전원·케이블 정리 상태 확인",
      hint: "감전·낙상 위험은 공연 전에만 줄일 수 있어요.",
      required: true,
    },
    {
      phase: "BEFORE",
      label: "무대 추락·낙하물 위험 확인",
      hint: "스피커·조명 고정 상태를 직접 봐요.",
      required: true,
    },
  ],
  POPUP: [
    {
      phase: "BEFORE",
      label: "야외 텐트·전원 방수·연장선 확인",
      hint: "비·바람 예보가 있으면 고정 상태를 다시 봐요.",
      required: true,
    },
    {
      phase: "BEFORE",
      label: "폭염·한파 대비 쉼터·음수대 확인",
      hint: "기상 특보가 있으면 운영 시간을 조정해요.",
      required: true,
    },
  ],
  PRIVATE: [
    {
      phase: "BEFORE",
      label: "대관 인원·음주 기준 주최 측과 서면 확인",
      hint: "구두 약속은 사고 뒤에 남지 않아요.",
      required: true,
    },
    {
      phase: "BEFORE",
      label: "외부 케이터링 알레르기 정보 확인",
      hint: "제공 음식과 알레르기 유발 성분을 직원이 알아야 해요.",
      required: false,
    },
  ],
  SEASON: [
    {
      phase: "BEFORE",
      label: "장식 조명 전원·미끄럼·연기 효과 확인",
      hint: "드라이아이스·분사 연기는 밀폐 공간에서 특히 위험해요.",
      required: true,
    },
    {
      phase: "DURING",
      label: "혼잡 시간대 입장 인원 조절",
      hint: "정원의 80%를 넘으면 입장을 잠시 멈춰요.",
      required: false,
    },
  ],
  WATCH: [
    {
      phase: "BEFORE",
      label: "유리병·응원 도구 반입 제한 안내",
      hint: "입구 안내문과 직원 구두 안내를 함께 써요.",
      required: true,
    },
    {
      phase: "AFTER",
      label: "경기 종료 후 귀가 동선·혼잡 관리",
      hint: "종료 직후 20분이 가장 위험해요.",
      required: false,
    },
  ],
  OTHER: [],
};

const KIND_MAP = new Map(ARC_EVENT_KINDS.map((item) => [item.key, item]));
const LEVEL_MAP = new Map(ARC_ARC_LEVELS.map((item) => [item.key, item]));
const MEDIC_MAP = new Map(ARC_MEDIC_MODES.map((item) => [item.key, item]));
const STATUS_MAP = new Map(ARC_EVENT_STATUSES.map((item) => [item.key, item]));
const ROLE_MAP = new Map(ARC_EVENT_STAFF_ROLES.map((item) => [item.key, item]));
const LICENSE_MAP = new Map(ARC_EVENT_LICENSE_STATES.map((item) => [item.key, item]));

const NOTICE_ROLES = ["EXTERNAL_MEDIC", "EMS"];
const PHASES = ["BEFORE", "DURING", "AFTER"];

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────

function text(value, max = MAX_LINE) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function longText(value, max = MAX_TEXT) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

function requireText(value, label, max = MAX_LINE) {
  const parsed = text(value, max);

  if (!parsed) {
    throw badRequest(`${label}을(를) 입력해 주세요.`);
  }

  return parsed;
}

function parseKstDate(value, fallback = new Date()) {
  const raw = text(value, 20);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return fallback;
  }

  const date = new Date(`${raw}T00:00:00+09:00`);

  return Number.isNaN(date.getTime()) ? fallback : date;
}

function kstDateString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const target = Number.isNaN(date.getTime()) ? new Date() : date;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(target);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

// "HH:MM" 또는 "HH:MM:SS" → "HH:MM:SS" / 빈 값은 null
function parseTime(value) {
  const raw = text(value, 8);

  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    return null;
  }

  const [hour, minute] = raw.split(":");
  const h = clampInt(hour, 0, 23, 0);
  const m = clampInt(minute, 0, 59, 0);

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function timeLabel(value) {
  const raw = text(value, 8);

  return raw ? raw.slice(0, 5) : "";
}

function dayDiff(target, base = new Date()) {
  const one = new Date(`${kstDateString(target)}T00:00:00+09:00`);
  const two = new Date(`${kstDateString(base)}T00:00:00+09:00`);

  return Math.round((one.getTime() - two.getTime()) / 86400000);
}

function dayLabel(diff) {
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;

  return `D+${Math.abs(diff)}`;
}

export function riskBandOf(l, s) {
  const score = clampInt(l, 1, 5, 2) * clampInt(s, 1, 5, 2);

  return (
    ARC_EVENT_RISK_BANDS.find((band) => score >= band.min && score <= band.max) ??
    ARC_EVENT_RISK_BANDS[0]
  );
}

async function withTransaction(run) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const result = await run(client);

    await client.query("commit");

    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function uniqueViolation(error) {
  return error?.code === "23505";
}

export function arcEventCatalogs() {
  return {
    kinds: ARC_EVENT_KINDS,
    levels: ARC_ARC_LEVELS,
    medicModes: ARC_MEDIC_MODES,
    statuses: ARC_EVENT_STATUSES,
    staffRoles: ARC_EVENT_STAFF_ROLES,
    licenseStates: ARC_EVENT_LICENSE_STATES,
    riskBands: ARC_EVENT_RISK_BANDS,
    phases: [
      { key: "BEFORE", label: "행사 전" },
      { key: "DURING", label: "당일" },
      { key: "AFTER", label: "종료 후" },
    ],
    templates: ARC_EVENT_TASK_TEMPLATES,
    kindTasks: ARC_EVENT_KIND_TASKS,
  };
}

function tasksForKind(kind) {
  return [...ARC_EVENT_TASK_TEMPLATES, ...(ARC_EVENT_KIND_TASKS[kind] ?? [])].slice(
    0,
    MAX_TASKS
  );
}

// ── 매핑 ──────────────────────────────────────────────────────────────────

function mapTask(row) {
  return {
    id: row.id,
    phase: row.phase,
    seq: row.seq,
    label: row.label,
    hint: row.hint ?? "",
    required: Boolean(row.required),
    doneOn: row.done_on ? kstDateString(row.done_on) : "",
    doneByName: row.done_by_name ?? "",
    note: row.note ?? "",
    done: Boolean(row.done_on),
  };
}

function mapStaff(row) {
  const role = ROLE_MAP.get(row.role);

  return {
    id: row.id,
    seq: row.seq,
    name: row.name,
    role: row.role,
    roleLabel: role?.label ?? row.role,
    roleTone: role?.tone ?? "neutral",
    org: row.org ?? "",
    licenseType: row.license_type ?? "",
    licenseState: row.license_state ?? "NA",
    licenseStateLabel: LICENSE_MAP.get(row.license_state)?.label ?? "해당 없음",
    noticeGiven: Boolean(row.notice_given),
    noticeOn: row.notice_on ? kstDateString(row.notice_on) : "",
    noticeNo: row.notice_no ?? "",
    signed: Boolean(row.signed),
    fromTime: timeLabel(row.from_time),
    toTime: timeLabel(row.to_time),
    note: row.note ?? "",
    needsNotice: NOTICE_ROLES.includes(row.role),
  };
}

function taskStatsOf(tasks) {
  const stats = { total: tasks.length, done: 0, requiredOpen: 0 };

  stats.done = tasks.filter((task) => task.done).length;

  for (const phase of PHASES) {
    const scoped = tasks.filter((task) => task.phase === phase);

    stats[phase] = {
      total: scoped.length,
      done: scoped.filter((task) => task.done).length,
      required: scoped.filter((task) => task.required).length,
      requiredOpen: scoped.filter((task) => task.required && !task.done).length,
    };
  }

  stats.requiredOpen = tasks.filter((task) => task.required && !task.done).length;
  stats.readyOpen = tasks.filter(
    (task) =>
      task.required && !task.done && (task.phase === "BEFORE" || task.phase === "DURING")
  ).length;
  stats.closingOpen = tasks.filter((task) => task.required && !task.done).length;

  return stats;
}

function staffStatsOf(staff) {
  return {
    total: staff.length,
    noticeMissing: staff.filter((item) => item.needsNotice && !item.noticeGiven).length,
    licenseUnchecked: staff.filter(
      (item) => item.role === "EXTERNAL_MEDIC" && item.licenseState !== "VALID"
    ).length,
    medics: staff.filter(
      (item) => item.role === "MEDIC_RN" || item.role === "EXTERNAL_MEDIC"
    ).length,
  };
}

// 준비를 막는 항목들. 화면에서는 빨간 체크리스트로 보여 줍니다.
function blockersOf(event, taskStats, staffStats) {
  const items = [];

  if (event.status === "CANCELED" || event.status === "DONE") {
    return items;
  }

  const level = LEVEL_MAP.get(event.arcLevel);

  if (level?.requiresAgreement && !event.scopeAgreed) {
    items.push({
      key: "scope",
      label: "범위초과 업무 사전합의가 없어요",
      hint: "현장대기·행사의료진 배치는 무상범위 밖이에요. 사전합의 후 진행하세요.",
      severity: "high",
    });
  }

  if (
    event.medicMode !== "NONE" &&
    (event.arcLevel === "NONE" || event.arcLevel === "ADVISE")
  ) {
    items.push({
      key: "medicLevel",
      label: "의료진 구성과 지원 수준이 맞지 않아요",
      hint: "의료진을 두는 행사는 지원 수준을 「현장 대기」 이상으로 올려 주세요.",
      severity: "high",
    });
  }

  if (event.arcLevel !== "NONE" && !event.eapNote) {
    items.push({
      key: "eap",
      label: "행사용 응급행동계획(EAP)이 비어 있어요",
      hint: "119 신고 담당·집결지·인계 병원을 적어 주세요.",
      severity: "high",
    });
  }

  if (event.arcLevel !== "NONE" && !event.promoChecked) {
    items.push({
      key: "promo",
      label: "홍보물 금지표현 검수가 안 됐어요",
      hint: "상주 의료진·진료 가능·안전보장 인증 표현은 사용할 수 없어요.",
      severity: "normal",
    });
  }

  if (staffStats.noticeMissing > 0) {
    items.push({
      key: "notice",
      label: `외부 인력 AS-NOT-001 고지서 ${staffStats.noticeMissing}명 미교부`,
      hint: "외부 의료인·구급대는 1인당 1부 교부하고 배정 인력 표에 남겨 주세요.",
      severity: "high",
    });
  }

  if (staffStats.licenseUnchecked > 0) {
    items.push({
      key: "license",
      label: `외부 의료인 면허·자격 확인 ${staffStats.licenseUnchecked}명 필요`,
      hint: "정지·취소 상태면 그 범위의 행사는 할 수 없어요(AS-NOT-001).",
      severity: "high",
    });
  }

  if (!event.expectedGuests) {
    items.push({
      key: "guests",
      label: "예상 인원이 비어 있어요",
      hint: "인원에 따라 위험도와 물품 수량이 달라져요.",
      severity: "normal",
    });
  }

  if (taskStats.readyOpen > 0) {
    items.push({
      key: "tasks",
      label: `행사 전·당일 필수 항목 ${taskStats.readyOpen}개 미완료`,
      hint: "체크리스트에서 마저 확인해 주세요.",
      severity: "high",
    });
  }

  return items;
}

function mapEvent(row, tasks = [], staff = []) {
  const kind = KIND_MAP.get(row.kind);
  const level = LEVEL_MAP.get(row.arc_level);
  const medic = MEDIC_MAP.get(row.medic_mode);
  const status = STATUS_MAP.get(row.status);
  const riskL = clampInt(row.risk_l, 1, 5, 2);
  const riskS = clampInt(row.risk_s, 1, 5, 2);
  const riskBand = riskBandOf(riskL, riskS);
  const startsOn = row.starts_on ? kstDateString(row.starts_on) : "";
  const endsOn = row.ends_on ? kstDateString(row.ends_on) : "";
  const taskStats = taskStatsOf(tasks);
  const staffStats = staffStatsOf(staff);
  const dayRange =
    endsOn && endsOn !== startsOn ? `${startsOn}~${endsOn}` : `${startsOn}`;
  const timeRange =
    row.start_time
      ? `${timeLabel(row.start_time)}${
          row.end_time ? `~${timeLabel(row.end_time)}` : ""
        }`
      : "";

  const event = {
    id: row.id,
    eventNo: row.event_no,
    title: row.title,
    kind: row.kind,
    kindLabel: kind?.label ?? row.kind,
    kindTone: kind?.tone ?? "neutral",
    startsOn,
    startTime: timeLabel(row.start_time),
    endsOn,
    endTime: timeLabel(row.end_time),
    scheduleLabel: [dayRange, timeRange].filter(Boolean).join(" "),
    venue: row.venue ?? "",
    outdoor: Boolean(row.outdoor),
    expectedGuests: row.expected_guests ?? 0,
    servesAlcohol: Boolean(row.serves_alcohol),
    servesFood: Boolean(row.serves_food),
    organizer: row.organizer ?? "",
    hostName: row.host_name ?? "",
    hostContact: row.host_contact ?? "",
    arcLevel: row.arc_level,
    arcLevelLabel: level?.label ?? row.arc_level,
    arcLevelTone: level?.tone ?? "neutral",
    medicMode: row.medic_mode,
    medicModeLabel: medic?.label ?? row.medic_mode,
    riskL,
    riskS,
    riskScore: riskL * riskS,
    riskBand: riskBand.key,
    riskBandLabel: riskBand.label,
    riskBandTone: riskBand.tone,
    scopeAgreed: Boolean(row.scope_agreed),
    scopeNote: row.scope_note ?? "",
    billing: row.billing ?? "NONE",
    assemblyPoint: row.assembly_point ?? "",
    nearestEr: row.nearest_er ?? "",
    eapNote: row.eap_note ?? "",
    promoChecked: Boolean(row.promo_checked),
    notes: row.notes ?? "",
    drinkProfile: row.drink_profile ?? "",
    peakGuests: row.peak_guests ?? null,
    lastOrderTime: timeLabel(row.last_order_time),
    stationNote: row.station_note ?? "",
    briefingNote: row.briefing_note ?? "",
    reviewNote: row.review_note ?? "",
    status: row.status,
    statusLabel: status?.label ?? row.status,
    statusTone: status?.tone ?? "neutral",
    cancelReason: row.cancel_reason ?? "",
    createdByName: row.created_by_name ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dDay: startsOn ? dayDiff(startsOn) : 0,
    taskStats,
    staffStats,
    prepPercent: taskStats.total
      ? Math.round((taskStats.done / taskStats.total) * 100)
      : 0,
  };

  event.dayLabel = dayLabel(event.dDay);
  event.blockers = blockersOf(event, taskStats, staffStats);
  event.tasks = tasks;
  event.staff = staff;

  return event;
}

// 목록·요약에서 함께 쓰는 집계 조회.
const EVENT_SELECT = `
  select e.*,
         coalesce(t.total, 0) as task_total,
         coalesce(t.done, 0) as task_done,
         coalesce(s.total, 0) as staff_total
    from public.arc_events e
    left join (
      select event_id,
             count(*)::int as total,
             count(*) filter (where done_on is not null)::int as done
        from public.arc_event_tasks
       group by event_id
    ) t on t.event_id = e.id
    left join (
      select event_id, count(*)::int as total
        from public.arc_event_staff
       group by event_id
    ) s on s.event_id = e.id
`;

async function loadTasks(eventId, runner = pool) {
  const { rows } = await runner.query(
    `select * from public.arc_event_tasks where event_id = $1::uuid
      order by array_position(array['BEFORE','DURING','AFTER'], phase), seq asc, created_at asc`,
    [eventId]
  );

  return rows.map(mapTask);
}

async function loadStaff(eventId, runner = pool) {
  const { rows } = await runner.query(
    `select * from public.arc_event_staff where event_id = $1::uuid
      order by seq asc, created_at asc`,
    [eventId]
  );

  return rows.map(mapStaff);
}

// ── 번호 발급 ────────────────────────────────────────────────────────────

async function nextEventNo(runner, startsOn) {
  const day = (startsOn || kstDateString()).replace(/-/g, "");

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { rows } = await runner.query(
      `select count(*)::int as used from public.arc_events where event_no like $1`,
      [`EVT-${day}-%`]
    );
    const seq = (rows[0]?.used ?? 0) + 1 + attempt;
    const candidate = `EVT-${day}-${String(seq).padStart(2, "0")}`;
    const { rows: taken } = await runner.query(
      `select 1 from public.arc_events where event_no = $1 limit 1`,
      [candidate]
    );

    if (!taken.length) {
      return candidate;
    }
  }

  return `EVT-${day}-${String(Date.now()).slice(-4)}`;
}

async function insertTasks(runner, eventId, kind) {
  const templates = tasksForKind(kind);

  if (!templates.length) {
    return;
  }

  const values = [];
  const params = [];

  templates.forEach((item, index) => {
    const offset = index * 5;

    values.push(
      `($1::uuid, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${
        offset + 6
      })`
    );
    params.push(item.phase, index + 1, item.label, item.hint ?? "", Boolean(item.required));
  });

  await runner.query(
    `insert into public.arc_event_tasks (event_id, phase, seq, label, hint, required)
     values ${values.join(", ")}`,
    [eventId, ...params]
  );
}

// ── 조회 ──────────────────────────────────────────────────────────────────

export async function listArcEvents(query = {}) {
  const scope = text(query.scope, 20) || "upcoming";
  const kind = KIND_MAP.has(query.kind) ? query.kind : "";
  const status = STATUS_MAP.has(query.status) ? query.status : "";
  const term = text(query.q, 80);
  const limit = clampInt(query.limit, 1, MAX_LIMIT, 60);

  const params = [];
  const where = [];

  if (scope === "upcoming") {
    // 아직 종료 처리하지 않은 "어제" 행사도 정리 대상이라 하루 여유를 둡니다.
    where.push(
      `e.status not in ('DONE','CANCELED')
       and coalesce(e.ends_on, e.starts_on) >= (now() at time zone 'Asia/Seoul')::date - 1`
    );
  } else if (scope === "past") {
    where.push(
      `(e.status in ('DONE','CANCELED')
        or coalesce(e.ends_on, e.starts_on) < (now() at time zone 'Asia/Seoul')::date)`
    );
  }

  if (kind) {
    params.push(kind);
    where.push(`e.kind = $${params.length}`);
  }

  if (status) {
    params.push(status);
    where.push(`e.status = $${params.length}`);
  }

  if (term) {
    params.push(`%${term}%`);
    where.push(
      `(e.event_no ilike $${params.length} or e.title ilike $${params.length}
        or coalesce(e.venue,'') ilike $${params.length}
        or coalesce(e.organizer,'') ilike $${params.length}
        or coalesce(e.host_name,'') ilike $${params.length}
        or coalesce(e.notes,'') ilike $${params.length})`
    );
  }

  params.push(limit);

  const { rows } = await pool.query(
    `${EVENT_SELECT}
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by e.starts_on ${scope === "past" ? "desc" : "asc"}, e.start_time asc nulls last
     limit $${params.length}`,
    params
  );

  return { events: rows.map((row) => mapEvent(row)), catalogs: arcEventCatalogs() };
}

export async function getArcEvent(eventId) {
  const { rows } = await pool.query(`${EVENT_SELECT} where e.id = $1::uuid limit 1`, [
    eventId,
  ]);

  if (!rows.length) {
    throw badRequest("행사를 찾을 수 없어요.");
  }

  const [tasks, staff] = await Promise.all([loadTasks(eventId), loadStaff(eventId)]);
  const event = mapEvent(rows[0], tasks, staff);

  const { rows: incidents } = await pool.query(
    `select i.id, i.incident_no, i.occurred_at, i.kind, i.place, i.summary,
            i.status, i.transferred_119
       from public.arc_incidents i
      where i.event_id = $1::uuid
      order by i.occurred_at desc
      limit 50`,
    [eventId]
  );

  return {
    event,
    incidents: incidents.map((row) => ({
      id: row.id,
      incidentNo: row.incident_no,
      occurredAt: row.occurred_at,
      occurredOn: row.occurred_at ? kstDateString(new Date(row.occurred_at)) : "",
      kind: row.kind ?? "",
      place: row.place ?? "",
      summary: row.summary ?? "",
      status: row.status ?? "",
      transferred119: Boolean(row.transferred_119),
    })),
    catalogs: arcEventCatalogs(),
  };
}

// ── 등록·수정 ────────────────────────────────────────────────────────────

function eventPayload(body = {}) {
  const kind = KIND_MAP.has(body.kind) ? body.kind : "PARTY";
  const arcLevel = LEVEL_MAP.has(body.arcLevel) ? body.arcLevel : "ADVISE";
  const medicMode = MEDIC_MAP.has(body.medicMode) ? body.medicMode : "NONE";

  return {
    title: requireText(body.title, "행사명", MAX_TITLE),
    kind,
    startsOn: kstDateString(parseKstDate(body.startsOn)),
    startTime: parseTime(body.startTime),
    endsOn: body.endsOn ? kstDateString(parseKstDate(body.endsOn)) : null,
    endTime: parseTime(body.endTime),
    venue: text(body.venue),
    outdoor: bool(body.outdoor),
    expectedGuests: clampInt(body.expectedGuests, 0, 100000, 0),
    servesAlcohol: bool(body.servesAlcohol),
    servesFood: bool(body.servesFood),
    organizer: text(body.organizer),
    hostName: text(body.hostName),
    hostContact: text(body.hostContact, 40),
    arcLevel,
    medicMode,
    riskL: clampInt(body.riskL, 1, 5, 2),
    riskS: clampInt(body.riskS, 1, 5, 2),
    scopeAgreed: bool(body.scopeAgreed),
    scopeNote: longText(body.scopeNote, 1000),
    billing: ["NONE", "EXPENSE", "CONTRACT"].includes(body.billing)
      ? body.billing
      : "NONE",
    // aed_location 컬럼은 레거시로 남겨 두고 값은 항상 비웁니다(매장에 장비 없음).
    aedLocation: "",
    assemblyPoint: text(body.assemblyPoint),
    nearestEr: text(body.nearestEr),
    eapNote: longText(body.eapNote, 1000),
    promoChecked: bool(body.promoChecked),
    notes: longText(body.notes),
    drinkProfile: longText(body.drinkProfile, 500),
    peakGuests:
      body.peakGuests === "" || body.peakGuests == null
        ? null
        : clampInt(body.peakGuests, 0, 100000, 0),
    lastOrderTime: parseTime(body.lastOrderTime),
    stationNote: longText(body.stationNote, 500),
    briefingNote: longText(body.briefingNote, 1000),
    reviewNote: longText(body.reviewNote, 1000),
  };
}

export async function createArcEvent(body = {}, actor = {}) {
  const data = eventPayload(body);

  if (data.endsOn && data.endsOn < data.startsOn) {
    throw badRequest("종료일이 시작일보다 빨라요.");
  }

  return withTransaction(async (client) => {
    const eventNo = await nextEventNo(client, data.startsOn);
    const id = randomUUID();

    await client.query(
      `insert into public.arc_events
         (id, event_no, title, kind, starts_on, start_time, ends_on, end_time,
          venue, outdoor, expected_guests, serves_alcohol, serves_food,
          organizer, host_name, host_contact, arc_level, medic_mode,
          risk_l, risk_s, scope_agreed, scope_note, billing,
          aed_location, assembly_point, nearest_er, eap_note,
          promo_checked, notes, status, created_by, created_by_name,
          drink_profile, peak_guests, last_order_time, station_note,
          briefing_note, review_note)
       values ($1::uuid, $2, $3, $4, $5::date, $6::time, $7::date, $8::time,
               $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
               'PLANNING', $30, $31, $32, $33, $34::time, $35, $36, $37)`,
      [
        id,
        eventNo,
        data.title,
        data.kind,
        data.startsOn,
        data.startTime,
        data.endsOn,
        data.endTime,
        data.venue,
        data.outdoor,
        data.expectedGuests,
        data.servesAlcohol,
        data.servesFood,
        data.organizer,
        data.hostName,
        data.hostContact,
        data.arcLevel,
        data.medicMode,
        data.riskL,
        data.riskS,
        data.scopeAgreed,
        data.scopeNote,
        data.billing,
        data.aedLocation,
        data.assemblyPoint,
        data.nearestEr,
        data.eapNote,
        data.promoChecked,
        data.notes,
        actor.id ?? null,
        text(actor.name, 60),
        data.drinkProfile,
        data.peakGuests,
        data.lastOrderTime,
        data.stationNote,
        data.briefingNote,
        data.reviewNote,
      ]
    );

    await insertTasks(client, id, data.kind);

    return { eventId: id, eventNo };
  });
}

export async function updateArcEvent(eventId, body = {}) {
  const { rows: currentRows } = await pool.query(
    `select * from public.arc_events where id = $1::uuid limit 1`,
    [eventId]
  );

  if (!currentRows.length) {
    throw badRequest("행사를 찾을 수 없어요.");
  }

  const current = currentRows[0];

  // 부분 수정(PATCH)을 그대로 반영하기 위해 현재 행을 camelCase 로 펼친 뒤 덮어씁니다.
  const base = {
    title: current.title,
    kind: current.kind,
    startsOn: kstDateString(current.starts_on),
    startTime: timeLabel(current.start_time),
    endsOn: current.ends_on ? kstDateString(current.ends_on) : "",
    endTime: timeLabel(current.end_time),
    venue: current.venue ?? "",
    outdoor: current.outdoor,
    expectedGuests: current.expected_guests,
    servesAlcohol: current.serves_alcohol,
    servesFood: current.serves_food,
    organizer: current.organizer ?? "",
    hostName: current.host_name ?? "",
    hostContact: current.host_contact ?? "",
    arcLevel: current.arc_level,
    medicMode: current.medic_mode,
    riskL: current.risk_l,
    riskS: current.risk_s,
    scopeAgreed: current.scope_agreed,
    scopeNote: current.scope_note ?? "",
    billing: current.billing ?? "NONE",
    assemblyPoint: current.assembly_point ?? "",
    nearestEr: current.nearest_er ?? "",
    eapNote: current.eap_note ?? "",
    promoChecked: current.promo_checked,
    notes: current.notes ?? "",
    drinkProfile: current.drink_profile ?? "",
    peakGuests: current.peak_guests ?? "",
    lastOrderTime: timeLabel(current.last_order_time),
    stationNote: current.station_note ?? "",
    briefingNote: current.briefing_note ?? "",
    reviewNote: current.review_note ?? "",
  };

  const data = eventPayload({ ...base, ...body });

  if (data.endsOn && data.endsOn < data.startsOn) {
    throw badRequest("종료일이 시작일보다 빨라요.");
  }

  const status = STATUS_MAP.has(body.status) ? body.status : current.status;
  const cancelReason = longText(body.cancelReason ?? current.cancel_reason, 500);

  const tasks = await loadTasks(eventId);
  const staff = await loadStaff(eventId);
  const stats = taskStatsOf(tasks);
  const staffStats = staffStatsOf(staff);

  if (status === "READY" && current.status !== "READY" && stats.readyOpen > 0) {
    throw badRequest(
      `행사 전·당일 필수 항목 ${stats.readyOpen}개가 남아 준비 완료로 바꿀 수 없어요.`
    );
  }

  if (status === "DONE" && current.status !== "DONE" && stats.closingOpen > 0) {
    throw badRequest(
      `필수 항목 ${stats.closingOpen}개가 남아 종료 처리할 수 없어요. 마저 확인해 주세요.`
    );
  }

  if (status === "CANCELED" && !cancelReason) {
    throw badRequest("취소 사유를 적어 주세요.");
  }

  const level = LEVEL_MAP.get(data.arcLevel);

  if (
    (status === "READY" || status === "DONE") &&
    level?.requiresAgreement &&
    !data.scopeAgreed
  ) {
    throw badRequest("범위초과 업무 사전합의를 먼저 확인해 주세요.");
  }

  if ((status === "READY" || status === "DONE") && staffStats.noticeMissing > 0) {
    throw badRequest(
      `외부 인력 ${staffStats.noticeMissing}명의 AS-NOT-001 고지서 교부를 먼저 기록해 주세요.`
    );
  }

  if ((status === "READY" || status === "DONE") && staffStats.licenseUnchecked > 0) {
    throw badRequest(
      `외부 의료인 ${staffStats.licenseUnchecked}명의 면허·자격 확인을 먼저 마쳐 주세요.`
    );
  }

  await withTransaction(async (client) => {
    await client.query(
      `update public.arc_events
          set title = $2, kind = $3, starts_on = $4::date, start_time = $5::time,
              ends_on = $6::date, end_time = $7::time, venue = $8, outdoor = $9,
              expected_guests = $10, serves_alcohol = $11, serves_food = $12,
              organizer = $13, host_name = $14, host_contact = $15,
              arc_level = $16, medic_mode = $17, risk_l = $18, risk_s = $19,
              scope_agreed = $20, scope_note = $21, billing = $22,
              aed_location = $23, assembly_point = $24, nearest_er = $25,
              eap_note = $26, promo_checked = $27, notes = $28,
              status = $29, cancel_reason = $30, updated_at = now(),
              drink_profile = $31, peak_guests = $32, last_order_time = $33::time,
              station_note = $34, briefing_note = $35, review_note = $36
        where id = $1::uuid`,
      [
        eventId,
        data.title,
        data.kind,
        data.startsOn,
        data.startTime,
        data.endsOn,
        data.endTime,
        data.venue,
        data.outdoor,
        data.expectedGuests,
        data.servesAlcohol,
        data.servesFood,
        data.organizer,
        data.hostName,
        data.hostContact,
        data.arcLevel,
        data.medicMode,
        data.riskL,
        data.riskS,
        data.scopeAgreed,
        data.scopeNote,
        data.billing,
        data.aedLocation,
        data.assemblyPoint,
        data.nearestEr,
        data.eapNote,
        data.promoChecked,
        data.notes,
        status,
        status === "CANCELED" ? cancelReason : "",
        data.drinkProfile,
        data.peakGuests,
        data.lastOrderTime,
        data.stationNote,
        data.briefingNote,
        data.reviewNote,
      ]
    );

    // 행사 유형이 바뀌면 기본 템플릿을 다시 맞춥니다. 이미 체크한 항목은 유지.
    if (data.kind !== current.kind) {
      const existing = new Set(tasks.map((task) => `${task.phase}:${task.label}`));
      const templates = tasksForKind(data.kind);

      for (const [index, item] of templates.entries()) {
        if (existing.has(`${item.phase}:${item.label}`)) {
          continue;
        }

        await client.query(
          `insert into public.arc_event_tasks (event_id, phase, seq, label, hint, required)
           values ($1::uuid, $2, $3, $4, $5, $6)`,
          [eventId, item.phase, index + 1, item.label, item.hint ?? "", Boolean(item.required)]
        );
      }

      await client.query(
        `delete from public.arc_event_tasks
          where event_id = $1::uuid and required = false and done_on is null
            and label not in (
              select unnest($2::text[])
            )`,
        [eventId, templates.map((item) => item.label)]
      );
    }
  });

  return { eventId, status };
}

export async function deleteArcEvent(eventId) {
  const { rowCount } = await pool.query(
    `delete from public.arc_events where id = $1::uuid`,
    [eventId]
  );

  if (!rowCount) {
    throw badRequest("행사를 찾을 수 없어요.");
  }

  return { eventId };
}

// ── 체크리스트 ────────────────────────────────────────────────────────────

export async function toggleArcEventTask(eventId, taskId, body = {}, actor = {}) {
  const done = body.done === undefined ? true : bool(body.done);

  const { rowCount } = await pool.query(
    `update public.arc_event_tasks
        set done_on = case when $3 then (now() at time zone 'Asia/Seoul')::date else null end,
            done_by_name = case when $3 then $4 else '' end,
            note = coalesce(nullif($5, ''), note)
      where id = $2::uuid and event_id = $1::uuid`,
    [eventId, taskId, done, text(actor.name, 60), text(body.note, 500)]
  );

  if (!rowCount) {
    throw badRequest("체크리스트 항목을 찾을 수 없어요.");
  }

  await pool.query(`update public.arc_events set updated_at = now() where id = $1::uuid`, [
    eventId,
  ]);

  return { taskId, done };
}

export async function addArcEventTask(eventId, body = {}) {
  const phase = PHASES.includes(body.phase) ? body.phase : "BEFORE";
  const label = requireText(body.label, "항목 이름", MAX_LINE);

  const { rows: countRows } = await pool.query(
    `select count(*)::int as used from public.arc_event_tasks where event_id = $1::uuid`,
    [eventId]
  );

  if ((countRows[0]?.used ?? 0) >= MAX_TASKS) {
    throw badRequest(`체크리스트는 ${MAX_TASKS}개까지 만들 수 있어요.`);
  }

  const id = randomUUID();

  await pool.query(
    `insert into public.arc_event_tasks (id, event_id, phase, seq, label, hint, required)
     values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
    [
      id,
      eventId,
      phase,
      (countRows[0]?.used ?? 0) + 1,
      label,
      text(body.hint, 300),
      Boolean(body.required),
    ]
  );

  return { taskId: id };
}

export async function deleteArcEventTask(eventId, taskId) {
  const { rows } = await pool.query(
    `select required, done_on from public.arc_event_tasks
      where id = $2::uuid and event_id = $1::uuid limit 1`,
    [eventId, taskId]
  );

  if (!rows.length) {
    throw badRequest("체크리스트 항목을 찾을 수 없어요.");
  }

  if (rows[0].required) {
    throw badRequest("필수 항목은 삭제할 수 없어요. 완료 처리만 해 주세요.");
  }

  await pool.query(
    `delete from public.arc_event_tasks where id = $2::uuid and event_id = $1::uuid`,
    [eventId, taskId]
  );

  return { taskId };
}

// ── 배정 인력 ────────────────────────────────────────────────────────────

export async function saveArcEventStaff(eventId, body = {}) {
  const role = ROLE_MAP.has(body.role) ? body.role : "EMPLOYEE";
  const name = requireText(body.name, "이름", 60);
  const licenseState = LICENSE_MAP.has(body.licenseState) ? body.licenseState : "NA";
  const noticeGiven = bool(body.noticeGiven);
  const staffId = text(body.id, 40);

  const payload = [
    name,
    role,
    text(body.org, 80),
    text(body.licenseType, 60),
    licenseState,
    noticeGiven,
    noticeGiven ? kstDateString(parseKstDate(body.noticeOn)) : null,
    text(body.noticeNo, 40),
    bool(body.signed),
    parseTime(body.fromTime),
    parseTime(body.toTime),
    text(body.note, 300),
  ];

  if (staffId) {
    const { rowCount } = await pool.query(
      `update public.arc_event_staff
          set name = $3, role = $4, org = $5, license_type = $6, license_state = $7,
              notice_given = $8, notice_on = $9::date, notice_no = $10, signed = $11,
              from_time = $12::time, to_time = $13::time, note = $14, updated_at = now()
        where id = $2::uuid and event_id = $1::uuid`,
      [eventId, staffId, ...payload]
    );

    if (!rowCount) {
      throw badRequest("배정 인력을 찾을 수 없어요.");
    }

    return { staffId };
  }

  const { rows: countRows } = await pool.query(
    `select count(*)::int as used from public.arc_event_staff where event_id = $1::uuid`,
    [eventId]
  );

  if ((countRows[0]?.used ?? 0) >= MAX_STAFF) {
    throw badRequest(`배정 인력은 ${MAX_STAFF}명까지 등록할 수 있어요.`);
  }

  const id = randomUUID();

  await pool.query(
    `insert into public.arc_event_staff
       (id, event_id, seq, name, role, org, license_type, license_state,
        notice_given, notice_on, notice_no, signed, from_time, to_time, note)
     values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12,
             $13::time, $14::time, $15)`,
    [id, eventId, (countRows[0]?.used ?? 0) + 1, ...payload]
  );

  return { staffId: id };
}

export async function deleteArcEventStaff(eventId, staffId) {
  const { rowCount } = await pool.query(
    `delete from public.arc_event_staff where id = $2::uuid and event_id = $1::uuid`,
    [eventId, staffId]
  );

  if (!rowCount) {
    throw badRequest("배정 인력을 찾을 수 없어요.");
  }

  return { staffId };
}

// ── 요약(대시보드·화면 상단) ──────────────────────────────────────────────

export async function arcEventSummary(limit = 12) {
  const max = clampInt(limit, 1, 40, 12);

  const { rows } = await pool.query(
    `${EVENT_SELECT}
      where e.status not in ('DONE','CANCELED')
        and coalesce(e.ends_on, e.starts_on) >= (now() at time zone 'Asia/Seoul')::date
      order by e.starts_on asc, e.start_time asc nulls last
      limit $1`,
    [max]
  );

  const upcoming = [];

  for (const row of rows) {
    const tasks = await loadTasks(row.id);
    const staff = await loadStaff(row.id);

    upcoming.push(mapEvent(row, tasks, staff));
  }

  const { rows: counts } = await pool.query(
    `select
       count(*) filter (
         where e.status not in ('DONE','CANCELED')
           and coalesce(e.ends_on, e.starts_on) >= (now() at time zone 'Asia/Seoul')::date
       )::int as upcoming_all,
       count(*) filter (
         where e.status not in ('DONE','CANCELED')
           and coalesce(e.ends_on, e.starts_on)
               between (now() at time zone 'Asia/Seoul')::date
                   and (now() at time zone 'Asia/Seoul')::date + 30
       )::int as upcoming_30,
       count(*) filter (
         where e.status not in ('DONE','CANCELED')
           and coalesce(e.ends_on, e.starts_on)
               between (now() at time zone 'Asia/Seoul')::date
                   and (now() at time zone 'Asia/Seoul')::date + 7
       )::int as upcoming_week,
       count(*) filter (
         where e.status in ('PLANNING')
           and coalesce(e.ends_on, e.starts_on) < (now() at time zone 'Asia/Seoul')::date
       )::int as past_open,
       count(*) filter (
         where e.status in ('READY','DONE')
           and (e.arc_level in ('STANDBY','MEDIC') and e.scope_agreed = false)
       )::int as scope_missing
       from public.arc_events e`
  );

  const { rows: staffRows } = await pool.query(
    `select e.id, count(*) filter (
              where s.role in ('EXTERNAL_MEDIC','EMS') and s.notice_given = false
            )::int as notice_missing
       from public.arc_events e
       join public.arc_event_staff s on s.event_id = e.id
      where e.status not in ('DONE','CANCELED')
        and coalesce(e.ends_on, e.starts_on) >= (now() at time zone 'Asia/Seoul')::date
      group by e.id`
  );

  const noticeMissingTotal = staffRows.reduce(
    (sum, row) => sum + (row.notice_missing ?? 0),
    0
  );

  const noticeByEvent = new Map(staffRows.map((row) => [row.id, row.notice_missing ?? 0]));

  for (const event of upcoming) {
    if ((noticeByEvent.get(event.id) ?? 0) > 0) {
      event.noticeMissing = noticeByEvent.get(event.id);
    }
  }

  const { rows: kpiRows } = await pool.query(
    `select
       count(*)::int as records,
       count(*) filter (where arc_level in ('STANDBY','MEDIC'))::int as medics,
       count(*) filter (
         where arc_level in ('STANDBY','MEDIC') and scope_agreed = true
       )::int as agreed,
       (select count(distinct event_id)::int from public.arc_incidents
         where event_id is not null
           and occurred_at >= now() - interval '365 days')::int as incidents
       from public.arc_events
      where starts_on >= (now() at time zone 'Asia/Seoul')::date - 365`
  );

  const kpiRow = kpiRows[0] ?? {};
  const agreedRate = kpiRow.medics
    ? Math.round(((kpiRow.agreed ?? 0) / kpiRow.medics) * 100)
    : 0;

  const countsRow = counts[0] ?? {};

  return {
    upcomingEvents: upcoming,
    needsAttention: upcoming.filter((event) => event.blockers.length > 0).length,
    upcoming: countsRow.upcoming_all ?? 0,
    upcoming30Days: countsRow.upcoming_30 ?? 0,
    thisWeek: countsRow.upcoming_week ?? 0,
    pastOpen: countsRow.past_open ?? 0,
    scopeMissing: countsRow.scope_missing ?? 0,
    noticeMissing: noticeMissingTotal,
    kpi: {
      windowLabel: "최근 12개월",
      items: [
        { key: "records", label: "행사 기록", value: kpiRow.records ?? 0 },
        { key: "medics", label: "의료지원 행사", value: kpiRow.medics ?? 0 },
        { key: "agreed", label: "사전합의 완료", value: `${agreedRate}%` },
        { key: "incidents", label: "사건 발생 행사", value: kpiRows[0]?.incidents ?? 0 },
      ],
    },
  };
}
