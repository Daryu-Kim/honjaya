// 역할별 권한 정의. 직원 3명(사장/매니저/알바) 운영을 전제로 합니다.
//
// 권한 문자열은 "영역.동작" 형태로 두고, 화면에서는 hasPermission() 만 확인합니다.
// DB 권한 테이블로 빼지 않은 이유: 역할이 3개로 고정이라 코드가 더 명확합니다.

import { pool } from "../db.js";

export const ROLES = ["OWNER", "MANAGER", "STAFF"];

export const ROLE_LABELS = {
  OWNER: "사장",
  MANAGER: "매니저",
  STAFF: "직원",
};

// 응급안전관리센터 총괄 계정.
// 역할(MANAGER)이 아니라 이 계정 자체가 총괄이라서, 로그인하면 ARC 를 첫 화면으로 엽니다.
// (2026-11-28 대표 지시: yoonhee1021 = 최윤희 총괄)
export const ARC_DIRECTOR_LOGIN_IDS = ["yoonhee1021"];

export function isArcDirector(loginId) {
  const normalized = String(loginId || "")
    .trim()
    .toLowerCase();

  return ARC_DIRECTOR_LOGIN_IDS.includes(normalized);
}

export const PERMISSIONS = {
  ORDER_VIEW: "order.view",
  ORDER_MANAGE: "order.manage",
  ORDER_CANCEL: "order.cancel",
  TABLE_VIEW: "table.view",
  TABLE_MANAGE: "table.manage",
  PAYMENT_VIEW: "payment.view",
  PAYMENT_MANAGE: "payment.manage",
  PAYMENT_REFUND: "payment.refund",
  POINT_USE: "point.use",
  POINT_ADJUST: "point.adjust",
  PREPAID_ISSUE: "prepaid.issue",
  PREPAID_VIEW: "prepaid.view",
  PREPAID_MANAGE: "prepaid.manage",
  GIFT_ISSUE: "gift.issue",
  GIFT_VIEW: "gift.view",
  GIFT_MANAGE: "gift.manage",
  CUSTOMER_VIEW: "customer.view",
  MENU_TOGGLE: "menu.toggle",
  MENU_PRICE: "menu.price",
  SALES_VIEW: "sales.view",
  CRM_VIEW: "crm.view",
  MARKETING_VIEW: "marketing.view",
  MARKETING_MANAGE: "marketing.manage",
  EMPLOYEE_MANAGE: "employee.manage",
  AUDIT_VIEW: "audit.view",
  SETTINGS_MANAGE: "settings.manage",
  DISCORD_VIEW: "discord.view",
  DISCORD_MEMBER: "discord.member",
  DISCORD_MANAGE: "discord.manage",
  DISCORD_BACKUP: "discord.backup",
  DISCORD_SETTINGS: "discord.settings",
  SHOP_VIEW: "shop.view",
  SHOP_MANAGE: "shop.manage",
  // P14 — 응급안전관리센터(ARC SAFETY) 공통/업무 구분
  ARC_VIEW: "arc.view",
  ARC_STOCK: "arc.stock",
  ARC_EXPENSE: "arc.expense",
  ARC_APPROVE: "arc.approve",
  ARC_CHECK: "arc.check",
  ARC_EDU: "arc.edu",
  ARC_CARE: "arc.care",
  ARC_SENSITIVE: "arc.sensitive",
  ARC_ADMIN: "arc.admin",
  // P14Q — 메뉴 단위 세분 권한 (사이드바 메뉴 1개 = 권한 1개)
  ARC_ASSISTANT: "arc.assistant",
  ARC_ROUTINE: "arc.routine",
  ARC_TRAINING: "arc.training",
  ARC_GUIDE: "arc.guide",
  ARC_SHIFT: "arc.shift",
  ARC_STOCKTAKE: "arc.stocktake",
  ARC_PURCHASE: "arc.purchase",
  ARC_OTC: "arc.otc",
  ARC_USAGE: "arc.usage",
  ARC_CONSENT: "arc.consent",
  ARC_QUALITY: "arc.quality",
  ARC_EVENT: "arc.event",
};

const STAFF_PERMISSIONS = [
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_MANAGE,
  PERMISSIONS.TABLE_VIEW,
  PERMISSIONS.TABLE_MANAGE,
  PERMISSIONS.PAYMENT_VIEW,
  PERMISSIONS.PAYMENT_MANAGE,
  PERMISSIONS.POINT_USE,
  PERMISSIONS.PREPAID_ISSUE,
  PERMISSIONS.GIFT_ISSUE,
  PERMISSIONS.MENU_TOGGLE,
  PERMISSIONS.DISCORD_VIEW,
  PERMISSIONS.SHOP_VIEW,
  // 응급안전관리센터(ARC)는 사장·매니저 전용이라 직원 기본 권한에 넣지 않습니다.
  // (2026-11-28 대표 지시: 등록·조회 모두 사장·매니저만)
];

const MANAGER_PERMISSIONS = [
  ...STAFF_PERMISSIONS,
  PERMISSIONS.ORDER_CANCEL,
  PERMISSIONS.PAYMENT_REFUND,
  PERMISSIONS.CUSTOMER_VIEW,
  PERMISSIONS.SALES_VIEW,
  PERMISSIONS.CRM_VIEW,
  PERMISSIONS.MARKETING_VIEW,
  PERMISSIONS.PREPAID_VIEW,
  PERMISSIONS.GIFT_VIEW,
  PERMISSIONS.AUDIT_VIEW,
  PERMISSIONS.DISCORD_MEMBER,
  // P14 — 매니저(최윤희 RN)는 응급안전 9종을 모두 씁니다.
  // 직원 기본 권한에서 ARC 를 뺐기 때문에(사장·매니저 전용) 여기서 다시 넣어 줍니다.
  PERMISSIONS.ARC_VIEW,
  PERMISSIONS.ARC_STOCK,
  PERMISSIONS.ARC_EXPENSE,
  PERMISSIONS.ARC_APPROVE,
  PERMISSIONS.ARC_CHECK,
  PERMISSIONS.ARC_EDU,
  PERMISSIONS.ARC_CARE,
  PERMISSIONS.ARC_SENSITIVE,
  PERMISSIONS.ARC_ADMIN,
];

const OWNER_PERMISSIONS = [
  ...MANAGER_PERMISSIONS,
  PERMISSIONS.MARKETING_MANAGE,
  PERMISSIONS.POINT_ADJUST,
  PERMISSIONS.PREPAID_MANAGE,
  PERMISSIONS.GIFT_MANAGE,
  PERMISSIONS.MENU_PRICE,
  PERMISSIONS.EMPLOYEE_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.DISCORD_MANAGE,
  PERMISSIONS.DISCORD_BACKUP,
  PERMISSIONS.DISCORD_SETTINGS,
  PERMISSIONS.SHOP_MANAGE,
];

const ROLE_PERMISSIONS = {
  OWNER: OWNER_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  STAFF: STAFF_PERMISSIONS,
};

// 화면(사장 전용 직원 관리)에서 체크박스로 보여줄 권한 이름/묶음입니다.
// 권한을 추가하면 여기에도 반드시 넣어 주세요. (누락 시 화면에서 조정 불가)
export const PERMISSION_LABELS = {
  [PERMISSIONS.ORDER_VIEW]: "주문 조회",
  [PERMISSIONS.ORDER_MANAGE]: "주문 접수·변경",
  [PERMISSIONS.ORDER_CANCEL]: "주문 취소",
  [PERMISSIONS.TABLE_VIEW]: "테이블 조회",
  [PERMISSIONS.TABLE_MANAGE]: "테이블 배정·정리",
  [PERMISSIONS.PAYMENT_VIEW]: "결제 내역 조회",
  [PERMISSIONS.PAYMENT_MANAGE]: "결제 처리",
  [PERMISSIONS.PAYMENT_REFUND]: "결제 취소·환불",
  [PERMISSIONS.POINT_USE]: "포인트 사용",
  [PERMISSIONS.POINT_ADJUST]: "포인트 수동 조정",
  [PERMISSIONS.PREPAID_ISSUE]: "선불권 판매·사용",
  [PERMISSIONS.PREPAID_VIEW]: "선불권 조회",
  [PERMISSIONS.PREPAID_MANAGE]: "선불권 설정·조정",
  [PERMISSIONS.GIFT_ISSUE]: "기프티콘 판매·사용",
  [PERMISSIONS.GIFT_VIEW]: "기프티콘 조회",
  [PERMISSIONS.GIFT_MANAGE]: "기프티콘 설정·취소",
  [PERMISSIONS.CUSTOMER_VIEW]: "고객 정보 조회",
  [PERMISSIONS.MENU_TOGGLE]: "메뉴 품절·노출 관리",
  [PERMISSIONS.MENU_PRICE]: "메뉴 가격 변경",
  [PERMISSIONS.SALES_VIEW]: "매출 통계 조회",
  [PERMISSIONS.CRM_VIEW]: "CRM 조회",
  [PERMISSIONS.MARKETING_VIEW]: "마케팅 조회",
  [PERMISSIONS.MARKETING_MANAGE]: "마케팅 발송·쿠폰 발급",
  [PERMISSIONS.EMPLOYEE_MANAGE]: "직원 계정·권한 관리",
  [PERMISSIONS.AUDIT_VIEW]: "감사 로그 조회",
  [PERMISSIONS.SETTINGS_MANAGE]: "매장 설정 변경",
  [PERMISSIONS.DISCORD_VIEW]: "Discord 현황 조회",
  [PERMISSIONS.DISCORD_MEMBER]: "Discord 멤버 제재",
  [PERMISSIONS.DISCORD_MANAGE]: "Discord 서버 구조 관리",
  [PERMISSIONS.DISCORD_BACKUP]: "Discord 백업·복원",
  [PERMISSIONS.DISCORD_SETTINGS]: "Discord 봇 설정 변경",
  [PERMISSIONS.SHOP_VIEW]: "전자담배 예약 조회·처리",
  [PERMISSIONS.SHOP_MANAGE]: "전자담배 상품·카테고리 관리",
  [PERMISSIONS.ARC_VIEW]: "응급안전 조회",
  [PERMISSIONS.ARC_STOCK]: "구급상자 재고·사용 등록",
  [PERMISSIONS.ARC_EXPENSE]: "응급안전 비용·정산",
  [PERMISSIONS.ARC_APPROVE]: "응급안전 승인·확인",
  [PERMISSIONS.ARC_CHECK]: "정기점검 수행",
  [PERMISSIONS.ARC_EDU]: "응급처치 교육 기록",
  [PERMISSIONS.ARC_CARE]: "사건·돌봄 기록 작성",
  [PERMISSIONS.ARC_SENSITIVE]: "민감 건강정보 열람",
  [PERMISSIONS.ARC_ADMIN]: "응급안전 문서·설정 관리",
};

export const PERMISSION_GROUPS = [
  {
    key: "order",
    label: "주문",
    permissions: [
      PERMISSIONS.ORDER_VIEW,
      PERMISSIONS.ORDER_MANAGE,
      PERMISSIONS.ORDER_CANCEL,
    ],
  },
  {
    key: "table",
    label: "테이블",
    permissions: [PERMISSIONS.TABLE_VIEW, PERMISSIONS.TABLE_MANAGE],
  },
  {
    key: "payment",
    label: "결제·포인트",
    permissions: [
      PERMISSIONS.PAYMENT_VIEW,
      PERMISSIONS.PAYMENT_MANAGE,
      PERMISSIONS.PAYMENT_REFUND,
      PERMISSIONS.POINT_USE,
      PERMISSIONS.POINT_ADJUST,
    ],
  },
  {
    key: "prepaid",
    label: "선불권",
    permissions: [
      PERMISSIONS.PREPAID_ISSUE,
      PERMISSIONS.PREPAID_VIEW,
      PERMISSIONS.PREPAID_MANAGE,
    ],
  },
  {
    key: "gift",
    label: "기프티콘",
    permissions: [
      PERMISSIONS.GIFT_ISSUE,
      PERMISSIONS.GIFT_VIEW,
      PERMISSIONS.GIFT_MANAGE,
    ],
  },
  {
    key: "customer",
    label: "고객·마케팅",
    permissions: [
      PERMISSIONS.CUSTOMER_VIEW,
      PERMISSIONS.CRM_VIEW,
      PERMISSIONS.MARKETING_VIEW,
      PERMISSIONS.MARKETING_MANAGE,
      PERMISSIONS.SALES_VIEW,
    ],
  },
  {
    key: "menu",
    label: "메뉴·매장",
    permissions: [
      PERMISSIONS.MENU_TOGGLE,
      PERMISSIONS.MENU_PRICE,
      PERMISSIONS.SETTINGS_MANAGE,
    ],
  },
  {
    key: "system",
    label: "직원·보안",
    permissions: [PERMISSIONS.EMPLOYEE_MANAGE, PERMISSIONS.AUDIT_VIEW],
  },
  {
    key: "discord",
    label: "Discord",
    permissions: [
      PERMISSIONS.DISCORD_VIEW,
      PERMISSIONS.DISCORD_MEMBER,
      PERMISSIONS.DISCORD_MANAGE,
      PERMISSIONS.DISCORD_BACKUP,
      PERMISSIONS.DISCORD_SETTINGS,
    ],
  },
  {
    key: "shop",
    label: "전자담배",
    permissions: [PERMISSIONS.SHOP_VIEW, PERMISSIONS.SHOP_MANAGE],
  },
  {
    key: "arc",
    // 이 그룹은 화면에서 잠깁니다. 응급안전 9종은 사장도 줄 수 없고,
    // ARC 대표(RN)가 /admin/arc/permissions 에서만 부여·회수합니다.
    label: "응급안전 (ARC 대표(RN) 전용)",
    permissions: [
      PERMISSIONS.ARC_VIEW,
      PERMISSIONS.ARC_STOCK,
      PERMISSIONS.ARC_EXPENSE,
      PERMISSIONS.ARC_APPROVE,
      PERMISSIONS.ARC_CHECK,
      PERMISSIONS.ARC_EDU,
      PERMISSIONS.ARC_CARE,
      PERMISSIONS.ARC_SENSITIVE,
      PERMISSIONS.ARC_ADMIN,
    ],
  },
];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export function isValidRole(role) {
  return ROLES.includes(String(role ?? ""));
}

export function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

export function roleHasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

// 알 수 없는 권한 문자열은 버리고 중복도 제거합니다.
export function normalizePermissions(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const unique = new Set();

  for (const item of value) {
    const permission = String(item ?? "").trim();

    if (ALL_PERMISSIONS.includes(permission)) {
      unique.add(permission);
    }
  }

  return ALL_PERMISSIONS.filter((permission) => unique.has(permission));
}

// 응급안전관리센터 권한. 역할 기본값은 사장·매니저가 전부 가지고, 직원은 없습니다.
// 총괄(yoonhee1021)은 언제든 arc_permissions 로 다른 직원의 권한을 조정할 수 있습니다.
// (2026-11-28 대표 지시: ARC 권한 부여·회수는 오직 총괄만)
// 2026-11-29 대표 지시: 메뉴 하나당 권한 하나로 아주 세세하게 조정할 수 있게 확장.
export const ARC_PERMISSION_LIST = [
  PERMISSIONS.ARC_VIEW,
  PERMISSIONS.ARC_ASSISTANT,
  PERMISSIONS.ARC_ROUTINE,
  PERMISSIONS.ARC_TRAINING,
  PERMISSIONS.ARC_GUIDE,
  PERMISSIONS.ARC_SHIFT,
  PERMISSIONS.ARC_STOCK,
  PERMISSIONS.ARC_STOCKTAKE,
  PERMISSIONS.ARC_PURCHASE,
  PERMISSIONS.ARC_OTC,
  PERMISSIONS.ARC_USAGE,
  PERMISSIONS.ARC_EXPENSE,
  PERMISSIONS.ARC_CARE,
  PERMISSIONS.ARC_CONSENT,
  PERMISSIONS.ARC_SENSITIVE,
  PERMISSIONS.ARC_QUALITY,
  PERMISSIONS.ARC_EVENT,
  PERMISSIONS.ARC_APPROVE,
  PERMISSIONS.ARC_CHECK,
  PERMISSIONS.ARC_EDU,
  PERMISSIONS.ARC_ADMIN,
];

// 메뉴 단위로만 존재하는 권한(과거 9종 체계에는 없던 것).
const ARC_MENU_ONLY_PERMISSIONS = [
  PERMISSIONS.ARC_ASSISTANT,
  PERMISSIONS.ARC_ROUTINE,
  PERMISSIONS.ARC_TRAINING,
  PERMISSIONS.ARC_GUIDE,
  PERMISSIONS.ARC_SHIFT,
  PERMISSIONS.ARC_STOCKTAKE,
  PERMISSIONS.ARC_PURCHASE,
  PERMISSIONS.ARC_OTC,
  PERMISSIONS.ARC_USAGE,
  PERMISSIONS.ARC_CONSENT,
  PERMISSIONS.ARC_QUALITY,
  PERMISSIONS.ARC_EVENT,
];

const ARC_PERMISSION_SET = new Set(ARC_PERMISSION_LIST);

// 일반 권한 목록에서 응급안전 9종을 걷어냅니다.
// 응급안전 권한은 오직 총괄의 arc_permissions 로만 정해지므로, 직원 관리 화면에서
// 들어온 응급안전 체크는 저장 자체를 막습니다.
export function stripArcPermissions(list) {
  if (!Array.isArray(list)) {
    return null;
  }

  return list.filter((permission) => !ARC_PERMISSION_SET.has(permission));
}

// 응급안전 권한만 따로 정규화합니다(다른 영역 권한은 버립니다).
export function normalizeArcPermissions(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const unique = new Set();

  for (const item of value) {
    const permission = String(item ?? "").trim();

    if (ARC_PERMISSION_SET.has(permission)) {
      unique.add(permission);
    }
  }

  return ARC_PERMISSION_LIST.filter((permission) => unique.has(permission));
}

function roleDefaultArcPermissions(role) {
  return role === "OWNER" || role === "MANAGER" ? [...ARC_PERMISSION_LIST] : [];
}

// 응급안전 21종(메뉴 단위)의 최종 권한.
//   * 총괄 계정 → 항상 전부
//   * arc_permissions 배열 → 그 목록만 (빈 배열 = 응급안전 접근 불가)
//       단, 예전 9종 체계로 저장된 배열이면 메뉴 권한을 전부 채워 넣습니다.
//       (구버전 화면에서 저장한 값 때문에 메뉴가 사라지는 사고를 막습니다.)
//   * arc_permissions null → 역할 기본값(사장·매니저 전부, 직원 없음)
export function arcPermissionsForEmployee(row) {
  if (!row) {
    return [];
  }

  if (isArcDirector(row.login_id ?? row.loginId)) {
    return [...ARC_PERMISSION_LIST];
  }

  // DB 행(arc_permissions)과 공개 직원 객체(arcPermissions)를 모두 받습니다.
  const overrides = normalizeArcPermissions(
    row.arc_permissions === undefined ? row.arcPermissions : row.arc_permissions
  );

  if (!overrides) {
    return roleDefaultArcPermissions(row.role);
  }

  return overrides;
}

/**
 * 예전 9종 체계 → 새 메뉴 단위(21종) 확장표.
 * 예전 화면은 "재고/교육" 같은 큰 묶음 하나로 여러 메뉴를 열어 줬기 때문에,
 * 그 권한을 가진 사람이 새 메뉴에서 갑자기 잠기지 않도록 자식 메뉴를 함께 켭니다.
 */
const ARC_LEGACY_EXPANSIONS = {
  [PERMISSIONS.ARC_VIEW]: [PERMISSIONS.ARC_VIEW],
  [PERMISSIONS.ARC_STOCK]: [
    PERMISSIONS.ARC_STOCK,
    PERMISSIONS.ARC_STOCKTAKE,
    PERMISSIONS.ARC_PURCHASE,
    PERMISSIONS.ARC_OTC,
    PERMISSIONS.ARC_USAGE,
  ],
  [PERMISSIONS.ARC_EXPENSE]: [PERMISSIONS.ARC_EXPENSE, PERMISSIONS.ARC_USAGE],
  [PERMISSIONS.ARC_APPROVE]: [PERMISSIONS.ARC_APPROVE],
  [PERMISSIONS.ARC_CHECK]: [PERMISSIONS.ARC_CHECK, PERMISSIONS.ARC_QUALITY],
  [PERMISSIONS.ARC_EDU]: [
    PERMISSIONS.ARC_EDU,
    PERMISSIONS.ARC_TRAINING,
    PERMISSIONS.ARC_GUIDE,
    PERMISSIONS.ARC_ROUTINE,
  ],
  [PERMISSIONS.ARC_CARE]: [PERMISSIONS.ARC_CARE, PERMISSIONS.ARC_CONSENT],
  [PERMISSIONS.ARC_SENSITIVE]: [PERMISSIONS.ARC_SENSITIVE],
  [PERMISSIONS.ARC_ADMIN]: [
    PERMISSIONS.ARC_ADMIN,
    PERMISSIONS.ARC_SHIFT,
    PERMISSIONS.ARC_ASSISTANT,
    PERMISSIONS.ARC_EVENT,
  ],
};

/**
 * 구버전 9종 체계로 저장된 arc_permissions 를 새 21종 체계로 한 번만 옮깁니다.
 *
 * 예전 화면은 메뉴 단위 권한을 저장하지 않았기 때문에, 그대로 두면 새로 쪼갠 메뉴가
 * 전부 사라진 것처럼 보입니다. 확장표(ARC_LEGACY_EXPANSIONS)로 자식 메뉴를 함께 켭니다.
 *
 * 이미 한 번 돌았는지는 schema_state 표의 표식으로 확인합니다. 매번 기동할 때 다시
 * 돌리면, 총괄이 일부러 좁혀 둔 권한까지 늘어나기 때문입니다.
 */
export async function migrateLegacyArcPermissions(log = console) {
  const MARKER = "arc_permissions_v2";

  const done = await pool.query(
    "select 1 from public.schema_state where id = $1",
    [MARKER]
  );

  if (done.rowCount > 0) {
    return { migrated: 0, skipped: true };
  }

  const { rows } = await pool.query(
    `select id, login_id, arc_permissions
       from public.employees
      where arc_permissions is not null
        and coalesce(array_length(arc_permissions, 1), 0) > 0
        and not (arc_permissions && $1::text[])`,
    [ARC_MENU_ONLY_PERMISSIONS]
  );

  for (const row of rows) {
    const expanded = [];

    for (const permission of row.arc_permissions) {
      expanded.push(...(ARC_LEGACY_EXPANSIONS[permission] ?? [permission]));
    }

    const next = normalizeArcPermissions(expanded);

    if (next.length > 0) {
      await pool.query(
        "update public.employees set arc_permissions = $1 where id = $2",
        [next, row.id]
      );
    }
  }

  await pool.query(
    `insert into public.schema_state (id, sql_hash, applied_at)
     values ($1, '', now())
     on conflict (id) do nothing`,
    [MARKER]
  );

  if (rows.length > 0) {
    log.info(
      `[auth] 예전 응급안전 권한 ${rows.length}건을 새 메뉴 체계로 옮겼습니다: ${rows
        .map((row) => row.login_id)
        .join(", ")}`
    );
  }

  return { migrated: rows.length, skipped: false };
}

// 직원별 권한은 두 가지 상태를 가집니다.
//   * permissions === null/undefined → 역할 기본값을 그대로 사용
//   * permissions 배열 → 그 직원만의 명시적 권한 목록 (빈 배열 = 권한 없음)
// 사장(OWNER)은 잠금 사고를 막기 위해 항상 역할 기본값을 씁니다.
// 응급안전 9종은 permissions 가 아니라 arc_permissions 로만 결정됩니다.
export function permissionsForEmployee(row) {
  if (!row) {
    return [];
  }

  const base =
    row.role === "OWNER"
      ? permissionsForRole("OWNER")
      : normalizePermissions(row.permissions) || permissionsForRole(row.role);
  const arc = arcPermissionsForEmployee(row);

  return ALL_PERMISSIONS.filter((permission) =>
    ARC_PERMISSION_SET.has(permission)
      ? arc.includes(permission)
      : base.includes(permission)
  );
}

export function permissionCatalog() {
  return {
    roles: ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role] || role,
      permissions: permissionsForRole(role),
    })),
    groups: PERMISSION_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      permissions: group.permissions.map((permission) => ({
        permission,
        label: PERMISSION_LABELS[permission] || permission,
      })),
    })),
  };
}
