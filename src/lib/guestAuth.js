// 손님(테이블) 입장 상태를 앱 전역에서 공유합니다.
//
// 세션은 HttpOnly 쿠키(hj_guest)에만 있고, 자바스크립트는 토큰을 모릅니다.
// 입장/복구는 서버(/api/guest/session)가 주문서까지 함께 내려줍니다.
import { reactive } from "vue";

import { ApiError, apiGet, apiPatch, apiPost } from "./api.js";

const ENTRY_STORAGE_KEY = "userEntryInfo";

const state = reactive({
  status: "unknown", // unknown | ready | anonymous
  session: null,
  orderSheet: null,
  error: "",
});

export const guestAuthState = state;

let inflight = null;

function isUnauthorized(error) {
  return error instanceof ApiError && error.status === 401;
}

function applySession(data) {
  state.session = data?.session || null;
  state.orderSheet = data?.orderSheet || null;
  state.status = state.session ? "ready" : "anonymous";
  state.error = "";
}

// 다른 화면들이 기대하는 sessionStorage.userEntryInfo 형식으로 저장합니다.
export function saveEntryInfo(session, orderSheet) {
  if (typeof sessionStorage === "undefined" || !session || !orderSheet) {
    return;
  }

  sessionStorage.setItem(
    ENTRY_STORAGE_KEY,
    JSON.stringify({
      tableNumber: String(orderSheet.tableNumber || session.tableNumber || ""),
      displayName: String(orderSheet.displayName || ""),
      orderSheetId: String(orderSheet.orderSheetId || ""),
      tableNickname: String(orderSheet.tableNickname || ""),
      guestNickname: String(session.nickname || ""),
      guestSessionId: String(session.id || ""),
      enteredAt: Date.now(),
    })
  );
}

export function clearEntryInfo() {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.removeItem(ENTRY_STORAGE_KEY);
}

export async function loadGuestSession({ force = false } = {}) {
  if (!force && state.status === "ready") {
    return state.session;
  }

  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    try {
      const data = await apiGet("/api/guest/session");

      applySession(data);
      saveEntryInfo(state.session, state.orderSheet);

      return state.session;
    } catch (error) {
      if (isUnauthorized(error)) {
        state.session = null;
        state.orderSheet = null;
        state.status = "anonymous";
        state.error = "";

        return null;
      }

      state.status = "anonymous";
      state.error = error?.message || "입장 상태를 확인하지 못했어요.";

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

export async function loadGuestTableInfo(tableNumber) {
  const query = new URLSearchParams({
    tableNumber: String(tableNumber || "").trim(),
  });
  const data = await apiGet(`/api/guest/table?${query}`);

  return data?.table || null;
}

export async function startGuestSession({ tableNumber, nickname }) {
  const data = await apiPost("/api/guest/session", {
    tableNumber: String(tableNumber || "").trim(),
    nickname: String(nickname || "").trim(),
  });

  applySession(data);
  saveEntryInfo(state.session, state.orderSheet);

  return data;
}

export async function updateGuestNickname(nickname) {
  const data = await apiPatch("/api/guest/session", {
    nickname: String(nickname || "").trim(),
  });

  state.session = data?.session || state.session;

  if (state.session && state.orderSheet) {
    saveEntryInfo(state.session, state.orderSheet);
  }

  return state.session;
}

export async function endGuestSession() {
  try {
    await apiPost("/api/guest/logout");
  } catch {
    // 서버에 못 닿아도 화면 상태는 로그아웃으로 맞춥니다.
  }

  state.session = null;
  state.orderSheet = null;
  state.status = "anonymous";
  state.error = "";
  clearEntryInfo();
}
