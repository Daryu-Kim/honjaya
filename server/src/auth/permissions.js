// 역할별 권한 정의. 직원 3명(사장/매니저/알바) 운영을 전제로 합니다.
//
// 권한 문자열은 "영역.동작" 형태로 두고, 화면에서는 hasPermission() 만 확인합니다.
// DB 권한 테이블로 빼지 않은 이유: 역할이 3개로 고정이라 코드가 더 명확합니다.

export const ROLES = ["OWNER", "MANAGER", "STAFF"];

export const ROLE_LABELS = {
  OWNER: "사장",
  MANAGER: "매니저",
  STAFF: "직원",
};

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

// 직원별 권한은 두 가지 상태를 가집니다.
//   * permissions === null/undefined → 역할 기본값을 그대로 사용
//   * permissions 배열 → 그 직원만의 명시적 권한 목록 (빈 배열 = 권한 없음)
// 사장(OWNER)은 잠금 사고를 막기 위해 항상 역할 기본값을 씁니다.
export function permissionsForEmployee(row) {
  if (!row) {
    return [];
  }

  if (row.role === "OWNER") {
    return permissionsForRole("OWNER");
  }

  const overrides = normalizePermissions(row.permissions);

  if (overrides) {
    return overrides;
  }

  return permissionsForRole(row.role);
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
