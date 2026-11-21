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
  PERMISSIONS.AUDIT_VIEW,
];

const OWNER_PERMISSIONS = [
  ...MANAGER_PERMISSIONS,
  PERMISSIONS.MARKETING_MANAGE,
  PERMISSIONS.POINT_ADJUST,
  PERMISSIONS.MENU_PRICE,
  PERMISSIONS.EMPLOYEE_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
];

const ROLE_PERMISSIONS = {
  OWNER: OWNER_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  STAFF: STAFF_PERMISSIONS,
};

export function isValidRole(role) {
  return ROLES.includes(String(role ?? ""));
}

export function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

export function roleHasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}
