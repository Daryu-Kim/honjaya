// 직원 로그인 상태를 앱 전역에서 공유합니다.
// 세션 자체는 HttpOnly 쿠키에 있으므로 자바스크립트로 토큰을 다루지 않습니다.
import { reactive } from "vue";

import { ApiError, apiGet, apiPost } from "./api.js";

const state = reactive({
  status: "unknown", // unknown | authenticated | anonymous
  employee: null,
  error: "",
});

export const staffAuthState = state;

let inflight = null;

// 만료된 쿠키를 정리하기 위해 401 이면 서버가 Set-Cookie 로 지워 줍니다.
export async function loadStaffSession({ force = false } = {}) {
  if (!force && state.status === "authenticated") {
    return state.employee;
  }

  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    try {
      const data = await apiGet("/api/staff/me");

      state.employee = data?.employee || null;
      state.status = state.employee ? "authenticated" : "anonymous";
      state.error = "";

      return state.employee;
    } catch (error) {
      // 401/403 은 "로그인 안 됨"이 정상 상태입니다.
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        state.employee = null;
        state.status = "anonymous";
        state.error = "";
        return null;
      }

      // 서버 장애/네트워크 문제도 로그인 화면에서 다시 시도할 수 있게 익명 처리합니다.
      state.employee = null;
      state.status = "anonymous";
      state.error = error?.message || "로그인 상태를 확인하지 못했어요.";

      return null;
    }
  })();

  inflight = request;

  try {
    return await request;
  } finally {
    inflight = null;
  }
}

export async function staffLogin({ loginId, password, remember = true }) {
  const data = await apiPost("/api/staff/login", {
    loginId,
    password,
    remember,
  });

  state.employee = data?.employee || null;
  state.status = state.employee ? "authenticated" : "anonymous";
  state.error = "";

  return state.employee;
}

export async function staffLogout() {
  try {
    await apiPost("/api/staff/logout");
  } catch {
    // 서버에 못 닿아도 화면 상태는 로그아웃으로 맞춥니다.
  }

  state.employee = null;
  state.status = "anonymous";
  state.error = "";
}

export function hasPermission(permission) {
  if (!permission) {
    return true;
  }

  return Boolean(state.employee?.permissions?.includes(permission));
}

export function hasAnyPermission(permissions = []) {
  if (!permissions || permissions.length === 0) {
    return true;
  }

  return permissions.some((permission) => hasPermission(permission));
}
