// 응급안전관리센터 권한 관리 — ARC 총괄(최윤희) 전용 화면의 서버 로직.
//
// 원칙(2026-11-28 대표 지시):
//   * 일반 직원 관리(사장 전용)에서는 응급안전 9종을 절대 건드릴 수 없습니다.
//   * 응급안전 9종 부여·회수는 총괄 계정만 할 수 있습니다.
//   * 총괄 본인 권한은 잠금 사고를 막기 위해 바꿀 수 없습니다.
import { writeAuditLog } from "./auth/audit.js";
import {
  ARC_PERMISSION_LIST,
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  arcPermissionsForEmployee,
  isArcDirector,
  normalizeArcPermissions,
} from "./auth/permissions.js";
import { revokeSessionsForEmployee } from "./auth/sessions.js";
import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";

// ── 메뉴 하나당 권한 하나 ──────────────────────────────────────────────
// 사이드바의 응급안전 메뉴와 1:1로 맞춘 목록입니다.
// 서버는 이 표를 기준으로 "이 메뉴 권한이 없으면 API도 막습니다".
// prefix 는 URL 세그먼트 경계까지 일치해야 하므로(/care vs /care-files) 긴 것부터 봅니다.
export const ARC_MENU_GATES = [
  { prefix: "/api/arc/training/guide", permission: PERMISSIONS.ARC_GUIDE },
  { prefix: "/api/arc/health", permission: PERMISSIONS.ARC_VIEW },
  { prefix: "/api/arc/dashboard", permission: PERMISSIONS.ARC_VIEW },
  { prefix: "/api/arc/assistant", permission: PERMISSIONS.ARC_ASSISTANT },
  { prefix: "/api/arc/routine", permission: PERMISSIONS.ARC_ROUTINE },
  { prefix: "/api/arc/training", permission: PERMISSIONS.ARC_TRAINING },
  { prefix: "/api/arc/shifts", permission: PERMISSIONS.ARC_SHIFT },
  { prefix: "/api/arc/stocktakes", permission: PERMISSIONS.ARC_STOCKTAKE },
  { prefix: "/api/arc/stock", permission: PERMISSIONS.ARC_STOCK },
  { prefix: "/api/arc/purchases", permission: PERMISSIONS.ARC_PURCHASE },
  { prefix: "/api/arc/otc", permission: PERMISSIONS.ARC_OTC },
  { prefix: "/api/arc/usages", permission: PERMISSIONS.ARC_USAGE },
  { prefix: "/api/arc/unit-prices", permission: PERMISSIONS.ARC_USAGE },
  { prefix: "/api/arc/expenses", permission: PERMISSIONS.ARC_EXPENSE },
  { prefix: "/api/arc/incidents", permission: PERMISSIONS.ARC_CARE },
  { prefix: "/api/arc/care-files", permission: PERMISSIONS.ARC_SENSITIVE },
  { prefix: "/api/arc/care", permission: PERMISSIONS.ARC_CARE },
  { prefix: "/api/arc/consents", permission: PERMISSIONS.ARC_CONSENT },
  { prefix: "/api/arc/sensitive-access", permission: PERMISSIONS.ARC_SENSITIVE },
  { prefix: "/api/arc/sensitive-reads", permission: PERMISSIONS.ARC_SENSITIVE },
  { prefix: "/api/arc/quality", permission: PERMISSIONS.ARC_QUALITY },
  { prefix: "/api/arc/events", permission: PERMISSIONS.ARC_EVENT },
  { prefix: "/api/arc/settings", permission: PERMISSIONS.ARC_ADMIN },
];

/** 요청 URL 에서 필요한 메뉴 권한을 찾습니다. 해당 없으면 null. */
export function arcMenuGateFor(url) {
  const path = String(url || "").split("?")[0];

  for (const gate of ARC_MENU_GATES) {
    if (path === gate.prefix || path.startsWith(`${gate.prefix}/`)) {
      return gate;
    }
  }

  return null;
}

/** 권한 코드 → 화면에 보여 줄 한국어 이름. */
export function arcPermissionLabel(permission) {
  const note = ARC_PERMISSION_NOTES[permission];

  return (
    note?.label || PERMISSION_LABELS[permission] || String(permission || "")
  );
}

// 권한별 의미를 화면에서 바로 이해할 수 있게 풀어 씁니다(교육 없이도 판단 가능).
// group 은 사이드바 메뉴 묶음 이름과 맞춥니다.
const ARC_PERMISSION_NOTES = {
  "arc.view": {
    group: "기본",
    label: "센터 입장·종합 현황",
    plain: "응급안전관리센터를 열고 종합 현황(재고·사건·동의·비용)을 볼 수 있어요.",
    caution: "다른 메뉴 권한을 주면 이 권한도 자동으로 함께 켜집니다.",
  },
  "arc.assistant": {
    group: "기본",
    label: "ARC 비서",
    plain: "오늘 할 일·기한 임박 항목·사장 보고용 요약을 볼 수 있어요.",
    caution: "읽기 전용이라 대부분의 계정에 켜 두어도 안전합니다.",
  },
  "arc.routine": {
    group: "기본",
    label: "월간 운영 루틴",
    plain: "1년 업무달력과 월간 점검 순서를 보고 완료 체크를 할 수 있어요.",
    caution: "체크 기록이 남으므로 실제 수행자에게만 주세요.",
  },
  "arc.training": {
    group: "교육",
    label: "월간 교육·OT (일정·출석·교육자료)",
    plain:
      "월간 OT·정기교육 일정을 만들고 출석과 교육자료 화면을 볼 수 있어요.",
    caution: "교육자료 '수정'은 권한과 상관없이 ARC 대표(RN)만 가능합니다.",
  },
  "arc.guide": {
    group: "교육",
    label: "교육자료·시험지 열람",
    plain: "교육자료 본문과 인쇄 화면을 볼 수 있어요.",
    caution: "구두시험 시험지·교육자 용지는 권한과 상관없이 ARC 대표(RN)만 봅니다.",
  },
  "arc.shift": {
    group: "교육",
    label: "근무 번표(최윤희 근무표)",
    plain:
      "ARC 대표의 병원 근무 번표(D/E/N/S)와 혼자야 방문 가능 시간을 볼 수 있어요.",
    caution:
      "끄면 번표 탭이 사라집니다. 근무 코드·메모는 사장과 총괄만 보이고, 그 외에는 시간만 보입니다.",
  },
  "arc.stock": {
    group: "재고·비용",
    label: "구급상자 재고",
    plain:
      "구급상자 품목·수량·유효기간을 등록하고 사용/개봉 기록을 남길 수 있어요.",
    caution: "재고가 실제와 달라지면 안 되므로 신중히 부여하세요.",
  },
  "arc.stocktake": {
    group: "재고·비용",
    label: "월 1회 실사",
    plain: "월 1회 실물 실사를 등록하고 수량 차이를 남길 수 있어요.",
    caution: "실사 기록은 감사 증빙이라 실제 확인자에게만 주세요.",
  },
  "arc.purchase": {
    group: "재고·비용",
    label: "보충·구매",
    plain: "보충 요청과 구매 내역(구매일·금액·영수증)을 등록할 수 있어요.",
    caution: "금액이 걸린 권한입니다. 구매 담당자에게만 주세요.",
  },
  "arc.otc": {
    group: "재고·비용",
    label: "개인 상비약",
    plain:
      "직원·사장 개인 상비약 사용을 기록하고 정산 요청 상태를 볼 수 있어요.",
    caution: "단가 등록과 정산 요청은 ARC 대표(RN)·사장 몫입니다.",
  },
  "arc.usage": {
    group: "재고·비용",
    label: "사용대장·기준단가",
    plain: "소모품 사용대장을 남기고 품목 기준단가를 등록할 수 있어요.",
    caution: "단가가 바뀌면 소모금액 합계가 달라집니다.",
  },
  "arc.expense": {
    group: "재고·비용",
    label: "실비정산",
    plain: "청구서를 만들고 입금·부분입금을 기록할 수 있어요.",
    caution: "금액이 걸린 권한입니다. 정산 담당자에게만 주세요.",
  },
  "arc.care": {
    group: "사건·기록",
    label: "사건 접수",
    plain: "사건을 접수하고 119 인계·경과를 남길 수 있어요.",
    caution: "민감정보가 아닌 기본 인적사항까지만 다룹니다.",
  },
  "arc.sensitive": {
    group: "사건·기록",
    label: "AS-CARE 기록·민감정보 열람",
    plain:
      "AS-CARE 서식과 원본 첨부를 작성·조회하고, 사장의 열람 요청을 검토할 수 있어요.",
    caution:
      "가장 민감한 권한입니다. 총괄 외에는 부여하지 않는 것을 권장합니다.",
  },
  "arc.consent": {
    group: "사건·기록",
    label: "응급안전 동의서",
    plain: "동의서 발급·확인·철회를 처리할 수 있어요.",
    caution: "동의가 없으면 상세 건강기록을 저장할 수 없습니다.",
  },
  "arc.quality": {
    group: "품질",
    label: "품질관리·사후검토",
    plain: "사건 사후검토(F11~F14)와 개선조치를 등록·완료할 수 있어요.",
    caution: "개선조치 완료 처리는 검토자만 하는 것을 권장합니다.",
  },
  "arc.event": {
    group: "행사",
    label: "행사·의료지원",
    plain: "행사별 ARC 의료지원 계획·체크리스트·인력 배치를 관리할 수 있어요.",
    caution: "행사 당일 인력이 걸린 권한이라 계획 담당자에게만 주세요.",
  },
  "arc.approve": {
    group: "기타",
    label: "대표 확인·서명",
    plain: "점검표·정산·실사 결과에 대표 확인(서명) 처리를 할 수 있어요.",
    caution: "서명 자리라 보통 사장·총괄만 가집니다.",
  },
  "arc.check": {
    group: "기타",
    label: "정기점검 수행",
    plain: "정기점검표를 작성·저장할 수 있어요.",
    caution: "점검 증빙이라 실제 점검자에게만 주세요.",
  },
  "arc.edu": {
    group: "기타",
    label: "교육 이수·평가 기록",
    plain: "교육 이수 결과와 평가 점수를 기록할 수 있어요.",
    caution: "교육 이수 증빙과 연결됩니다.",
  },
  "arc.admin": {
    group: "기타",
    label: "문서·설정 관리",
    plain: "기준단가·서식·알림 같은 응급안전 설정을 바꿀 수 있어요.",
    caution: "한 번 바꾸면 기록 전체에 영향을 줍니다.",
  },
};

export function arcPermissionCatalog() {
  return ARC_PERMISSION_LIST.map((permission) => {
    const note = ARC_PERMISSION_NOTES[permission] || {};

    return {
      permission,
      group: note.group || "기타",
      label: note.label || PERMISSION_LABELS[permission] || permission,
      plain: note.plain || "",
      caution: note.caution || "",
    };
  });
}

function mapRow(row) {
  return {
    id: row.id,
    loginId: row.login_id,
    name: row.name || "",
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    title: row.title || "",
    titleLabel: row.title || ROLE_LABELS[row.role] || row.role,
    isActive: row.is_active !== false,
    isArcDirector: isArcDirector(row.login_id),
    permissions: arcPermissionsForEmployee(row),
    permissionOverrides: Array.isArray(row.arc_permissions)
      ? [...row.arc_permissions]
      : null,
    lastLoginAt: row.last_login_at,
  };
}

/**
 * 총괄 화면용 명단. 누가 응급안전 메뉴 권한 중 무엇을 갖고 있는지 한눈에 보여 줍니다.
 */
export async function listArcPermissionBoard() {
  const { rows } = await pool.query(
    `select id, login_id, name, role, title, is_active, arc_permissions, last_login_at
       from public.employees
      order by
        case role when 'OWNER' then 0 when 'MANAGER' then 1 else 2 end,
        lower(login_id)`
  );

  const employees = rows.map(mapRow);
  const catalog = arcPermissionCatalog();
  const totals = Object.fromEntries(
    catalog.map((item) => [
      item.permission,
      employees.filter((employee) =>
        employee.permissions.includes(item.permission)
      ).length,
    ])
  );

  // 화면에서 묶어 보여 줄 그룹 순서
  const groups = [];
  for (const item of catalog) {
    let group = groups.find((entry) => entry.name === item.group);

    if (!group) {
      group = { name: item.group, items: [] };
      groups.push(group);
    }

    group.items.push(item);
  }

  return {
    employees,
    catalog,
    groups,
    totals,
    canWrite: true,
    note:
      "응급안전 메뉴별 권한은 오직 ARC 대표(RN)만 부여·회수할 수 있어요. " +
      "일반 직원 관리 화면에서는 응급안전 권한이 잠겨 있습니다.",
  };
}

/**
 * 한 직원의 응급안전 메뉴 권한을 저장합니다.
 *   permissions === null → 역할 기본값으로 되돌림
 *   permissions 배열     → 그 목록만 (빈 배열 = 응급안전 접근 불가)
 */
export async function saveArcEmployeePermissions(input, actor) {
  const employeeId = String(input?.employeeId ?? "").trim();

  if (!employeeId) {
    throw new HttpError(400, "HJ400", "권한을 바꿀 직원을 선택해 주세요.");
  }

  const found = await pool.query(
    `select id, login_id, name, role, title, arc_permissions
       from public.employees
      where id = $1
      limit 1`,
    [employeeId]
  );

  if (found.rowCount === 0) {
    throw new HttpError(404, "HJ404", "직원을 찾을 수 없어요.");
  }

  const target = found.rows[0];

  if (isArcDirector(target.login_id)) {
    throw new HttpError(
      403,
      "HJ403",
      "ARC 대표(RN) 본인 권한은 바꿀 수 없어요. 잠금 사고를 막기 위한 장치입니다."
    );
  }

  const rawPermissions = input?.permissions;

  if (rawPermissions !== null && !Array.isArray(rawPermissions)) {
    throw new HttpError(400, "HJ400", "권한 목록 형식이 올바르지 않아요.");
  }

  let nextValue =
    rawPermissions === null ? null : normalizeArcPermissions(rawPermissions);

  // 메뉴 권한을 하나라도 주면 입장 권한(arc.view)은 자동으로 함께 켭니다.
  // (입장 권한이 빠져 메뉴가 보이지 않는 사고를 막습니다.)
  if (nextValue && nextValue.length > 0) {
    nextValue = normalizeArcPermissions([...nextValue, PERMISSIONS.ARC_VIEW]);
  }

  const updated = await pool.query(
    `update public.employees
        set arc_permissions = $2, updated_at = now()
      where id = $1
      returning id, login_id, name, role, title, is_active, arc_permissions, last_login_at`,
    [employeeId, nextValue]
  );

  // 권한이 바뀌면 그 직원의 기존 세션을 끊어 즉시 반영합니다.
  await revokeSessionsForEmployee(employeeId);

  await writeAuditLog({
    employee: actor,
    action: "ARC_PERMISSION_UPDATE",
    targetType: "employee",
    targetId: employeeId,
    detail: {
      loginId: target.login_id,
      before: Array.isArray(target.arc_permissions)
        ? [...target.arc_permissions]
        : null,
      after: nextValue,
    },
    ip: input?.ip || "",
    log: input?.log || null,
  });

  return { employee: mapRow(updated.rows[0]) };
}
