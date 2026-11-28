// 사장 전용 직원 계정/권한 관리 API.
//
// 권한은 두 겹입니다.
//   * role  — 사장 / 매니저 / 직원 (기본 권한 묶음)
//   * permissions — 직원별로 직접 고른 권한 목록 (null 이면 역할 기본값 사용)
import { apiGet, apiPatch, apiPost } from "./api.js";

export const EMPLOYEE_MANAGE_PERMISSION = "employee.manage";

export const ROLE_OPTIONS = [
  { value: "OWNER", label: "사장", description: "모든 권한" },
  { value: "MANAGER", label: "매니저", description: "매출·환불·CRM" },
  { value: "STAFF", label: "직원", description: "주문·결제 기본" },
];

export function roleLabelOf(role) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
}

export async function fetchPermissionCatalog() {
  const data = await apiGet("/api/admin/permissions");

  return {
    roles: Array.isArray(data?.roles) ? data.roles : [],
    groups: Array.isArray(data?.groups) ? data.groups : [],
  };
}

export async function fetchEmployees() {
  const data = await apiGet("/api/admin/employees");

  return Array.isArray(data?.employees) ? data.employees : [];
}

export function createEmployee({
  loginId,
  name,
  title,
  password,
  role,
  permissions,
}) {
  return apiPost("/api/admin/employees", {
    loginId,
    name,
    title,
    password,
    role,
    permissions,
  });
}

export function updateEmployee(id, payload) {
  return apiPatch(`/api/admin/employees/${encodeURIComponent(id)}`, payload);
}

export function resetEmployeePassword(id, password) {
  return apiPost(`/api/admin/employees/${encodeURIComponent(id)}/password`, {
    password,
  });
}

export function formatEmployeeDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}.${month}.${day} ${hours}:${minutes}`;
}
