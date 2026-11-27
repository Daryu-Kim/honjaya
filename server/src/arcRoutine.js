// P14 — 응급안전관리센터 월간 운영 루틴(AS-CAL-001 「1년 업무달력」) 도메인 로직.
//
// 루틴의 원본은 이 파일의 템플릿이고, DB(arc_routine_log)에는 "끝낸 기록"만 남깁니다.
//   * 행이 없으면 = 아직 안 한 일
//   * 달이 바뀌면 새 체크리스트가 자동으로 생기고, 지난 달 기록은 그대로 보존됩니다.
//
// 항목 문구와 기한 창(1~3일, 4~7일 …)은 AS-CAL-001 / AS-KIT-001 / AS-GDE-001 원문을
// 그대로 옮겼습니다. 원문이 바뀌면 이 템플릿만 고치면 됩니다.
import { randomUUID } from "node:crypto";

import { pool } from "./db.js";
import { badRequest } from "./http/errors.js";

const SEOUL_TIME_ZONE = "Asia/Seoul";
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_ACTIONS = 30;
const MAX_NOTE_LENGTH = 1000;

/**
 * 월간 운영 루틴 템플릿.
 *   months 를 비워 두면 매달, 값을 넣으면 그 달에만 표시합니다.
 *   window 는 "그 달 며칠부터 며칠까지" 입니다.
 */
export const ARC_ROUTINE_STEPS = [
  {
    key: "OPEN",
    phase: "월초 준비",
    title: "월초 오픈 — 전월 미조치·미정산 확인",
    window: [1, 3],
    owner: "최윤희 총괄",
    outputs: "월간 업무폴더 · 점검표/장부 준비 · 증빙ID",
    link: "/admin/arc/incidents",
    items: [
      ["last_month", "전월 미조치·미정산·사건·직원 변경 확인"],
      ["folders", "이번 달 점검표·장부를 3개 Site 분량으로 준비"],
      ["evidence_id", "증빙ID 생성 후 월간 업무폴더 정리"],
      ["contact_card", "비상연락카드 게시 상태·연락처 최신 여부 확인"],
      ["signage", "구급상자 '사용 시 장부기록 필수' 표시 확인"],
      ["level_c", "Level C 제한관리품 분리·표시 확인"],
    ],
  },
  {
    key: "SITE_A",
    phase: "현장 점검",
    title: "Site A(쿠모랩스) 점검",
    window: [4, 7],
    owner: "최윤희 총괄 + 현장 확인자",
    outputs: "A 점검표 · 확인사진/영상 · 보완목록",
    link: "/admin/arc/stock",
    items: [
      ["kit", "구급 키트 수량·유효기간 확인"],
      ["device", "기기(혈압계·SpO₂·체온계·손전등) 작동 확인"],
      ["safety", "통로·전기·화재 위험 요소 확인"],
      ["address", "주소·출입구 정보 최신 여부 확인"],
      ["evidence", "확인 사진·영상 촬영 후 증빙ID 연결"],
      ["rn_review", "실제 확인자와 RN 검토를 구분해 기록"],
    ],
  },
  {
    key: "KIT_CHECK",
    phase: "현장 점검",
    title: "구급상자 월 1회 정기점검 (16항목)",
    window: [8, 12],
    owner: "최윤희 총괄",
    outputs: "정기점검표 · 보완·교체 필요품 · 대표 확인",
    link: "/admin/arc/stocktakes",
    requiresSignature: true,
    items: [
      ["stock", "재고 — 실물 수량과 마스터 대장 일치"],
      ["exp", "EXP — 멸균품·의료소모품 유효기간 확인"],
      ["pack", "포장 — 멸균포장·밴드·장갑 훼손/오염 없음"],
      ["adhesion", "접착 — 밴드·픽스·자가접착밴드 접착력"],
      ["device", "기기 — 혈압계·SpO₂·체온계 작동"],
      ["light", "조명 — USB-C 손전등 충전·점등"],
      ["level_c", "제한구역 — Level C 품목 분리·무단사용 없음"],
      ["ledger", "장부 — 사용/개봉/파손/분실 기록 누락 없음"],
      ["expense", "비용 — 보충·영수증·미정산 금액 확인"],
      ["storage", "보관 — 습기·열·세척제·식품과 분리"],
      ["reorder", "추가구매 — 90일/30일 이내 교체품 목록 작성"],
      ["hotpack", "보온품 — 핫팩 3개 수량·포장·EXP·파손 확인"],
      ["hand", "손위생 — 손소독제 80mL×2·알코올 60% 이상·화기 분리"],
      ["personal", "개인 상비약 — 본인점검·원포장·타인 제공 없음"],
      ["external", "외용품 — N/S 1L·솔트·포비돈·과산화수소·마데카솔 확인"],
      ["manual", "설명서 — 경구약·외용품·기기 설명서가 현품과 일치"],
    ],
  },
  {
    key: "SITE_BC",
    phase: "현장 점검",
    title: "Site B·C 현장점검",
    window: [8, 12],
    owner: "최윤희 총괄",
    outputs: "B/C 점검표(분리 작성) · 사진 · 장부 대조",
    link: "/admin/arc/stock",
    items: [
      ["site_b", "Site B — 배터리·액상·화재·계단 위험 확인"],
      ["site_c", "Site C — 주취·계단·유리·조리 물기·열원·칼·세척제 확인"],
      ["entry", "Site C — 119 진입 동선·출입구 확인"],
      ["tables", "B·C 점검표는 같은 방문이어도 표를 분리해 작성"],
      ["personal", "개인 상비약·외용품 보관·표시 확인"],
      ["ledger", "장부와 실물 대조(사용·개봉·파손 기록)"],
    ],
  },
  {
    key: "Q_DEVICE",
    phase: "현장 점검",
    title: "분기 기기 기능점검",
    window: [8, 12],
    months: [1, 4, 7, 9],
    owner: "최윤희 총괄",
    outputs: "기기 기능점검표 · 사용금지 표시",
    link: "/admin/arc/stock",
    items: [
      ["bp", "자동혈압계 — 전원/배터리·커프 손상·표시 이상"],
      ["spo2", "SpO₂ — 전원/배터리·센서 오염·표시 이상"],
      ["thermo", "체온계 — 전원/배터리·측정모드·오염/파손"],
      ["light", "USB-C 손전등 — 충전·점등·케이블"],
      ["isolate", "이상품은 '사용금지' 표시 후 즉시 분리"],
    ],
  },
  {
    key: "SUP",
    phase: "보충·정산",
    title: "보충·구매·실비정산",
    window: [13, 15],
    owner: "김원재 대표(승인) · 최윤희 총괄",
    outputs: "보충목록 · 영수증 · 정산 기록",
    link: "/admin/arc/purchases",
    items: [
      ["shortage", "기준수량 미달·30/90일 내 만료 품목 목록 작성"],
      ["damage", "파손·분실·오남용 건 확인 및 조치"],
      ["purchase", "구매·영수증 등록(구입처·금액·사유)"],
      ["usage", "사용대장 단가·소모 수량 확인"],
      ["settle", "실비정산 상태 확인(미정산 0건 또는 사유 기록)"],
      ["approval", "보충·비용 대표 승인 요청"],
    ],
  },
  {
    key: "Q_CONTACT",
    phase: "보충·정산",
    title: "119·사설구급차 연락망 검증",
    window: [13, 15],
    months: [1, 4, 7],
    owner: "최윤희 총괄 · 김원재 대표",
    outputs: "연락망 검증 메모",
    link: "",
    items: [
      ["call119", "119 신고 절차·주소·출입구 안내문 최신 확인"],
      ["blue", "코드블루 1544-4476 배차 가능범위·운영 여부 확인"],
      ["alt", "배차 불가 시 대체 허가업체 연락처 확인"],
      ["site_a", "Site A(인천) 이송 업체 연락처 확인"],
    ],
  },
  {
    key: "EDU",
    phase: "교육·훈련",
    title: "월간 교육·훈련",
    window: [16, 20],
    owner: "최윤희 총괄",
    outputs: "교육자료 · 교육일지 · 참석 서명 · 사진",
    link: "",
    items: [
      ["material", "이번 달 교육자료·퀴즈·시나리오를 교육 3일 전까지 준비"],
      ["attend", "참석자 서명·교육일지 작성"],
      ["photo", "교육 사진 1~2장 촬영 후 증빙ID 연결"],
      ["cpr", "구두평가 — 119 우선·반응/호흡 확인·CPR 시작 기준"],
      ["aed", "구두평가 — AED 기본순서·분석/충격 중 접촉 금지"],
      ["choke", "구두평가 — 기도폐쇄 구별·등 두드리기/복부 밀어내기"],
      ["bleed", "구두평가 — 심한 출혈 직접압박"],
      ["burn", "구두평가 — 화상 20분 냉각"],
      ["intox", "구두평가 — 주취·구토·머리외상 구별"],
      ["stroke", "구두평가 — 뇌졸중 FAST·아나필락시스 119 기준"],
      ["scope", "구두평가 — Level C 임의사용 금지·고객에게 약 제공 금지"],
      ["makeup", "불참자는 14일 이내 보충교육 일정 확정"],
    ],
  },
  {
    key: "Q_TRAINING",
    phase: "교육·훈련",
    title: "분기 모의훈련",
    window: [16, 20],
    months: [3, 6, 12],
    owner: "최윤희 총괄 주관",
    outputs: "모의훈련 시나리오 · 수행평가표 · 교육일지",
    link: "",
    items: [
      ["scenario", "12월 심정지 / 3월 CPR+기도폐쇄 / 6월 주취·낙상 복합 시나리오 준비"],
      ["rights", "훈련 전 10분 권한통제 리마인드(진단·투약 불가, 119 우선)"],
      ["run", "모의훈련 실행(가슴압박 2분 교대 포함)"],
      ["eval", "수행평가표 작성·참석자 서명"],
    ],
  },
  {
    key: "EVI",
    phase: "검토·마감",
    title: "증빙·사건 검토",
    window: [21, 24],
    owner: "최윤희 총괄",
    outputs: "증빙 인덱스 · 사건·비용 처리",
    link: "/admin/arc/incidents",
    items: [
      ["links", "활동일지·교육자료·사진·재고·사건 증빙ID 연결 확인"],
      ["incident", "사건 후속조치 7일 이내 완료·재교육 확인"],
      ["deviation", "권한일탈·무단열람·119 지연 여부 확인"],
      ["reads", "민감정보 열람 기록 검토(사유·증빙 누락 확인)"],
      ["capa", "Near Miss·CAPA 필요 건 등록"],
    ],
  },
  {
    key: "SECURITY",
    phase: "검토·마감",
    title: "NAVER WORKS 권한·감사로그 점검",
    window: [21, 24],
    owner: "최윤희 총괄",
    outputs: "권한·감사로그 관리대장(F29)",
    link: "/admin/arc/settings",
    items: [
      ["accounts", "접근 가능 계정이 3명 외 없는지 확인(퇴사·분실기기 포함)"],
      ["mfa", "2단계 인증·비밀번호 정책 확인"],
      ["share", "링크 공유·외부 그룹·파일 요청 비활성 확인"],
      ["logs", "감사·파일 로그 내보내기(월 1회, 2년 이상 별도 보관)"],
      ["history", "권한 부여·변경·말소 이력 기록(3년 이상 보관)"],
    ],
  },
  {
    key: "SIGN",
    phase: "검토·마감",
    title: "대표 확인·서명",
    window: [25, 27],
    owner: "김원재 대표",
    outputs: "대표 서명본 · 직원 참석 서명",
    link: "/admin/arc/expenses",
    requiresSignature: true,
    items: [
      ["check", "점검표 대표 확인·서명"],
      ["edu", "교육일지 대표 확인·서명"],
      ["expense", "비용정산 대표 확인·서명"],
      ["care", "대응기록(AS-CARE) 확인·서명"],
      ["gate", "월말 Gate — 미정산·미조치 0건 확인"],
    ],
  },
  {
    key: "CLOSE",
    phase: "검토·마감",
    title: "월말 마감·다음 달 준비",
    window: [28, 31],
    owner: "최윤희 총괄 → 김원재 대표 확인",
    outputs: "월말 운영요약 · 다음 달 작업지시",
    link: "/admin/arc",
    items: [
      ["count", "점검 횟수·교육·사진·비용·사건·보완조치 정리"],
      ["summary", "월말 운영요약 작성(상세 건강정보 제외)"],
      ["next", "다음 달 작업지시·교육 테마 확정"],
      ["ledger", "장부 미기록 사용 건 최종 확인"],
      ["archive", "증빙 파일 월간 폴더 아카이빙"],
    ],
  },
  {
    key: "HALF_AUDIT",
    phase: "연간 마감",
    title: "반기 증빙감사·재고실사",
    window: [1, 31],
    months: [6],
    owner: "최윤희 총괄 · 김원재 대표 확인",
    outputs: "반기 증빙팩 · 재고 차이 분석",
    link: "/admin/arc/stocktakes",
    items: [
      ["audit", "반기 증빙감사(교육일지·월간점검·위험개선·활동사진)"],
      ["stocktake", "반기 재고실사(최초재고 대비 사용·분실·보충 차이 분석)"],
      ["baseline", "차이 분석 후 기준수량 재설정"],
      ["pack", "반기 증빙팩 최신화 후 대표 확인"],
    ],
  },
  {
    key: "YEAR_CLOSE",
    phase: "연간 마감",
    title: "연간 마감 체크",
    window: [1, 31],
    months: [9],
    owner: "최윤희 총괄 · 김원재 대표 확인",
    outputs: "연간 마감 체크 · 차년도 계획",
    link: "/admin/arc",
    items: [
      ["ledger12", "12개월 사용장부·개인 상비약 월간점검 누락 없음"],
      ["exp0", "유효기간(EXP) 경과품 0개"],
      ["money", "미정산 비용 0건 또는 사유 기록"],
      ["damage", "미해결 파손·분실·오남용 0건 또는 조치계획"],
      ["device", "기기 정상작동 확인"],
      ["next_year", "차년도 기준수량·추가구매 목록 확정"],
      ["manual", "제품·장비 사용설명서 파일 최신성 확인"],
      ["asrec", "AS-REC 연계(사건·Near Miss·CAPA·이상반응) 누락 없음"],
    ],
  },
];

const STEP_BY_KEY = new Map(ARC_ROUTINE_STEPS.map((step) => [step.key, step]));

function seoulDateParts() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // en-CA 는 YYYY-MM-DD 형식입니다.
  const text = formatter.format(new Date());

  return {
    period: text.slice(0, 7),
    day: Number.parseInt(text.slice(8, 10), 10),
  };
}

export function currentArcRoutinePeriod() {
  return seoulDateParts().period;
}

function normalizePeriod(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return currentArcRoutinePeriod();
  }

  if (!PERIOD_PATTERN.test(text)) {
    throw badRequest("기간은 YYYY-MM 형식으로 보내 주세요.");
  }

  return text;
}

function daysInMonth(period) {
  const year = Number.parseInt(period.slice(0, 4), 10);
  const month = Number.parseInt(period.slice(5, 7), 10);

  return new Date(year, month, 0).getDate();
}

function isStepInMonth(step, month) {
  return !step.months || step.months.includes(month);
}

function resolveState({ log, start, end, period, todayPeriod, todayDay }) {
  if (log) {
    return log.status;
  }

  if (period < todayPeriod) {
    return "OVERDUE";
  }

  if (period > todayPeriod) {
    return "UPCOMING";
  }

  if (todayDay < start) {
    return "UPCOMING";
  }

  return todayDay > end ? "OVERDUE" : "ACTIVE";
}

function mapLogRow(row) {
  return {
    status: row.status,
    checklist: row.checklist && typeof row.checklist === "object" ? row.checklist : {},
    actions: Array.isArray(row.actions) ? row.actions : [],
    note: row.note ?? "",
    doneByName: row.done_by_name ?? "",
    doneAt: row.done_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function mapStep(step, log, context) {
  const end = Math.min(step.window[1], context.days);
  const start = Math.min(step.window[0], end);
  const items = step.items.map(([key, label]) => ({ key, label }));
  const checkedCount = items.filter((item) => log?.checklist?.[item.key]).length;

  return {
    key: step.key,
    phase: step.phase,
    title: step.title,
    owner: step.owner,
    outputs: step.outputs,
    link: step.link ?? "",
    requiresSignature: Boolean(step.requiresSignature),
    window: { start, end },
    windowLabel: `${start}일~${end}일`,
    items,
    checkedCount,
    status: log?.status ?? "PENDING",
    state: resolveState({
      log,
      start,
      end,
      period: context.period,
      todayPeriod: context.todayPeriod,
      todayDay: context.todayDay,
    }),
    checklist: log?.checklist ?? {},
    actions: log?.actions ?? [],
    note: log?.note ?? "",
    doneByName: log?.doneByName ?? "",
    doneAt: log?.doneAt ?? null,
  };
}

function buildAlerts(steps) {
  const alerts = [];
  const overdue = steps.filter((step) => step.state === "OVERDUE");
  const active = steps.filter((step) => step.state === "ACTIVE");
  const signature = steps.filter(
    (step) => step.requiresSignature && step.status === "PENDING"
  );

  if (overdue.length) {
    alerts.push({
      level: "CRITICAL",
      message: `기한이 지난 루틴 ${overdue.length}건 — ${overdue
        .map((step) => step.title)
        .join(", ")}`,
    });
  }

  if (signature.length) {
    alerts.push({
      level: "WARN",
      message: `대표 확인·서명이 필요한 루틴 ${signature.length}건 — ${signature
        .map((step) => step.title)
        .join(", ")}`,
    });
  }

  if (active.length) {
    alerts.push({
      level: "INFO",
      message: `지금 진행할 루틴 ${active.length}건 — ${active
        .map((step) => step.title)
        .join(", ")}`,
    });
  }

  return alerts;
}

function toSummaryStep(step) {
  return {
    key: step.key,
    title: step.title,
    windowLabel: step.windowLabel,
    owner: step.owner,
    state: step.state,
  };
}

/** 설정의 월말 서명 기준일·서명자를 「대표 확인·서명」 단계에 반영합니다. */
function applyGateSettings(step, settings) {
  if (step.key !== "SIGN" || !settings) return step;

  const span = step.window[1] - step.window[0];
  const gateDay = Number.parseInt(settings.stocktake_gate_day, 10);
  const start = Number.isFinite(gateDay)
    ? Math.min(Math.max(gateDay, 1), 31 - span)
    : step.window[0];
  const signer = String(settings.gate_signer_name ?? "").trim();

  return {
    ...step,
    window: [start, start + span],
    owner: signer ? `${signer} 확인·서명` : step.owner,
  };
}

async function loadGateSettings() {
  const { rows } = await pool.query(
    `select stocktake_gate_day, gate_signer_name from public.arc_settings where id = 1`
  );

  return rows[0] ?? null;
}

export async function listArcRoutine({ period } = {}) {
  const key = normalizePeriod(period);
  const month = Number.parseInt(key.slice(5, 7), 10);
  const days = daysInMonth(key);
  const today = seoulDateParts();
  const gateSettings = await loadGateSettings();
  const steps = ARC_ROUTINE_STEPS.filter((step) => isStepInMonth(step, month)).map(
    (step) => applyGateSettings(step, gateSettings)
  );

  const { rows } = await pool.query(
    `select * from public.arc_routine_log where period = $1`,
    [key]
  );

  const logs = new Map(rows.map((row) => [row.step_key, mapLogRow(row)]));
  const context = {
    period: key,
    days,
    todayPeriod: today.period,
    todayDay: today.day,
  };

  const mapped = steps.map((step) => mapStep(step, logs.get(step.key) ?? null, context));
  const done = mapped.filter((step) => step.status !== "PENDING").length;

  return {
    period: key,
    month,
    daysInMonth: days,
    today: {
      period: today.period,
      day: today.period === key ? today.day : null,
    },
    steps: mapped,
    progress: {
      done,
      total: mapped.length,
      percent: mapped.length ? Math.round((done / mapped.length) * 100) : 0,
    },
    alerts: buildAlerts(mapped),
  };
}

function sanitizeChecklist(step, input) {
  const source = input && typeof input === "object" ? input : {};
  const allowed = new Set(step.items.map(([key]) => key));
  const checklist = {};

  for (const key of Object.keys(source)) {
    if (allowed.has(key) && source[key]) {
      checklist[key] = true;
    }
  }

  return checklist;
}

function sanitizeActions(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .slice(0, MAX_ACTIONS)
    .map((row) => ({
      item: String(row?.item ?? "").trim().slice(0, 120),
      reason: String(row?.reason ?? "").trim().slice(0, 200),
      qty: String(row?.qty ?? "").trim().slice(0, 20),
      dueDate: String(row?.dueDate ?? "").trim().slice(0, 10),
      done: Boolean(row?.done),
    }))
    .filter((row) => row.item || row.reason);
}

export async function saveArcRoutineStep(input = {}, employee = null) {
  const period = normalizePeriod(input.period);
  const stepKey = String(input.stepKey ?? "").trim();
  const step = STEP_BY_KEY.get(stepKey);
  const month = Number.parseInt(period.slice(5, 7), 10);

  if (!step || !isStepInMonth(step, month)) {
    throw badRequest("이번 달에 해당하지 않는 루틴 항목이에요.");
  }

  const status = String(input.status ?? "DONE").trim().toUpperCase();

  if (!["PENDING", "DONE", "SKIPPED"].includes(status)) {
    throw badRequest("루틴 상태는 완료·건너뜀·미완료 중 하나여야 해요.");
  }

  if (status === "PENDING") {
    await pool.query(
      `delete from public.arc_routine_log where period = $1 and step_key = $2`,
      [period, stepKey]
    );
  } else {
    const checklist = sanitizeChecklist(step, input.checklist);
    const actions = sanitizeActions(input.actions);
    const note = String(input.note ?? "").trim().slice(0, MAX_NOTE_LENGTH);

    await pool.query(
      `insert into public.arc_routine_log
         (id, period, step_key, status, checklist, actions, note, done_by, done_by_name)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
       on conflict (period, step_key) do update
         set status = excluded.status,
             checklist = excluded.checklist,
             actions = excluded.actions,
             note = excluded.note,
             done_by = excluded.done_by,
             done_by_name = excluded.done_by_name,
             done_at = now(),
             updated_at = now()`,
      [
        randomUUID(),
        period,
        stepKey,
        status,
        JSON.stringify(checklist),
        JSON.stringify(actions),
        note,
        employee?.id ?? null,
        employee?.name ?? "",
      ]
    );
  }

  const routine = await listArcRoutine({ period });
  const saved = routine.steps.find((row) => row.key === stepKey) ?? null;

  return { period, step: saved, progress: routine.progress, alerts: routine.alerts };
}

/** 종합현황 카드용 요약. */
export async function arcRoutineSummary() {
  const routine = await listArcRoutine({ period: currentArcRoutinePeriod() });
  const overdue = routine.steps.filter((step) => step.state === "OVERDUE");
  const active = routine.steps.filter((step) => step.state === "ACTIVE");
  const upcoming = routine.steps.filter((step) => step.state === "UPCOMING");

  return {
    period: routine.period,
    day: routine.today.day,
    done: routine.progress.done,
    total: routine.progress.total,
    percent: routine.progress.percent,
    overdue: overdue.length,
    active: active.map(toSummaryStep),
    next: upcoming.slice(0, 3).map(toSummaryStep),
    alerts: routine.alerts,
  };
}
