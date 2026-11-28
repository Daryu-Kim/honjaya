// 응급안전관리센터 권한 관리 — ARC 총괄(최윤희) 전용 화면의 서버 로직.
//
// 원칙(2026-11-28 대표 지시):
//   * 일반 직원 관리(사장 전용)에서는 응급안전 9종을 절대 건드릴 수 없습니다.
//   * 응급안전 9종 부여·회수는 총괄 계정만 할 수 있습니다.
//   * 총괄 본인 권한은 잠금 사고를 막기 위해 바꿀 수 없습니다.
import { writeAuditLog } from "./auth/audit.js";
import {
  ARC_PERMISSION_LIST,
  PERMISSION_LABELS,
  ROLE_LABELS,
  arcPermissionsForEmployee,
  isArcDirector,
  normalizeArcPermissions,
} from "./auth/permissions.js";
import { revokeSessionsForEmployee } from "./auth/sessions.js";
import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";

// 권한별 의미를 화면에서 바로 이해할 수 있게 풀어 씁니다(교육 없이도 판단 가능).
const ARC_PERMISSION_NOTES = {
  "arc.view": {
    label: "응급안전 조회",
    plain: "응급안전관리센터 메뉴를 열고 현황·기록을 읽을 수 있어요.",
    caution: "보기만 하므로 대부분의 계정에 필요합니다.",
  },
  "arc.stock": {
    label: "구급상자 재고·사용 등록",
    plain:
      "구급상자 품목·수량·유효기간을 등록하고 사용/개봉 기록을 남길 수 있어요.",
    caution: "재고가 실제와 달라지면 안 되므로 신중히 부여하세요.",
  },
  "arc.expense": {
    label: "비용·실비정산",
    plain:
      "보충·구매 내역과 영수증 금액을 등록하고 정산 상태를 바꿀 수 있어요.",
    caution: "금액이 걸린 권한입니다. 정산 담당자에게만 주세요.",
  },
  "arc.approve": {
    label: "승인·확인(대표 확인)",
    plain: "점검표·정산·실사 결과에 대표 확인(서명) 처리를 할 수 있어요.",
    caution: "대표 서명이 필요한 자리라 보통 사장·총괄만 가집니다.",
  },
  "arc.check": {
    label: "정기점검·실사 수행",
    plain: "월 1회 실사와 정기점검표를 작성·저장할 수 있어요.",
    caution: "실사 기록은 감사 증빙이라 실제 확인자에게만 주세요.",
  },
  "arc.edu": {
    label: "교육·상황연습 기록",
    plain:
      "월간 OT·정기교육 일정을 만들고 출석·평가 결과를 남길 수 있어요.",
    caution: "교육 이수 증빙과 연결되므로 교육 담당자에게만 주세요.",
  },
  "arc.care": {
    label: "사건 접수·AS-CARE 작성",
    plain: "사건을 접수하고 응급기록(AS-CARE)을 작성·보관할 수 있어요.",
    caution: "민감정보가 아닌 기본 인적사항까지만 다룹니다.",
  },
  "arc.sensitive": {
    label: "민감 건강정보 열람",
    plain: "상세 건강기록을 작성·조회할 수 있어요(총괄 승인 절차 포함).",
    caution: "가장 민감한 권한입니다. 총괄 외에는 부여하지 않는 것을 권장합니다.",
  },
  "arc.admin": {
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
 * 총괄 화면용 명단. 누가 응급안전 9종 중 무엇을 갖고 있는지 한눈에 보여 줍니다.
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

  return {
    employees,
    catalog,
    totals,
    canWrite: true,
    note:
      "응급안전 9종 권한은 오직 ARC 대표(RN)만 부여·회수할 수 있어요. " +
      "일반 직원 관리 화면에서는 응급안전 권한이 잠겨 있습니다.",
  };
}

/**
 * 한 직원의 응급안전 9종 권한을 저장합니다.
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

  const nextValue =
    rawPermissions === null ? null : normalizeArcPermissions(rawPermissions);

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
