// P14 — 응급안전관리센터(ARC SAFETY) 프런트 도우미.
//
// 화면 공통 라벨과 API 호출만 모읍니다. 권한 판단은 항상 서버가 다시 합니다.
import { apiGet, apiPatch, apiPost } from "@/lib/api";

export const ARC_LEVEL_LABELS = {
  INFO: "안내",
  WARN: "주의",
  CRITICAL: "긴급",
};

export const ARC_LEVEL_TONES = {
  INFO: "info",
  WARN: "warn",
  CRITICAL: "critical",
};

export const ARC_KIND_LABELS = {
  EXPIRY: "유효기간",
  STOCK: "재고",
  OTC: "상비의약품",
  CHECK: "정기점검",
  EDU: "교육",
  INCIDENT: "사건",
  USAGE: "사용기록",
  EXPENSE: "비용",
  PURGE: "파기",
  GENERAL: "일반",
};

export const ARC_CONSENT_STATUS_LABELS = {
  PENDING: "확인 대기",
  ACTIVE: "동의 확인",
  WITHDRAWN: "철회",
};

export const ARC_CONSENT_KIND_LABELS = {
  PAPER: "종이 서명",
  ELECTRONIC: "전자 동의",
};

export const ARC_ACCESS_STATUS_LABELS = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  DENIED: "거부",
  EXPIRED: "만료",
};

const NOTIFICATIONS_PATH = "/api/arc/notifications";
const CONSENTS_PATH = "/api/arc/consents";
const ACCESS_PATH = "/api/arc/sensitive-access";
const READS_PATH = "/api/arc/sensitive-reads";

function queryString(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;

    search.set(key, String(value));
  });

  const text = search.toString();

  return text ? `?${text}` : "";
}

export function formatArcDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatArcDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 접근 승인 남은 시간을 "3시간 12분" 처럼 보여줍니다. */
export function formatArcRemaining(value) {
  if (!value) return "";

  const diff = new Date(value).getTime() - Date.now();

  if (Number.isNaN(diff) || diff <= 0) return "만료됨";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return hours ? `${hours}시간 ${rest}분 남음` : `${rest}분 남음`;
}

// ── 현황/설정 ──────────────────────────────────────────────────────────────

export async function fetchArcHealth() {
  const data = await apiGet("/api/arc/health");

  return data?.status ?? null;
}

export async function fetchArcDashboard() {
  const data = await apiGet("/api/arc/dashboard");

  return data?.summary ?? null;
}

export async function fetchArcSettings() {
  const data = await apiGet("/api/arc/settings");

  return data?.settings ?? null;
}

export async function saveArcSettings(payload) {
  const data = await apiPatch("/api/arc/settings", payload);

  return data?.settings ?? null;
}

// ── 알림함 ────────────────────────────────────────────────────────────────

export async function fetchArcNotifications({
  unreadOnly = false,
  limit = 30,
} = {}) {
  const data = await apiGet(
    `${NOTIFICATIONS_PATH}${queryString({
      unreadOnly: unreadOnly || undefined,
      limit,
    })}`
  );

  return Array.isArray(data?.notifications) ? data.notifications : [];
}

export async function markArcNotificationsRead(ids = []) {
  const data = await apiPost(`${NOTIFICATIONS_PATH}/read`, { ids });

  return data?.updated ?? 0;
}

// ── 동의서 ────────────────────────────────────────────────────────────────

export async function fetchArcConsents({
  incidentNo = "",
  includeInactive = false,
  revealSensitive = false,
  limit = 100,
} = {}) {
  const data = await apiGet(
    `${CONSENTS_PATH}${queryString({
      incidentNo,
      includeInactive: includeInactive || undefined,
      revealSensitive: revealSensitive || undefined,
      limit,
    })}`
  );

  return {
    consents: Array.isArray(data?.consents) ? data.consents : [],
    canRevealSensitive: Boolean(data?.canRevealSensitive),
    revealed: Boolean(data?.revealed),
  };
}

export async function createArcConsent(payload) {
  const data = await apiPost(CONSENTS_PATH, payload);

  return data?.consent ?? null;
}

export async function confirmArcConsent(consentId) {
  const data = await apiPatch(
    `${CONSENTS_PATH}/${encodeURIComponent(consentId)}/confirm`,
    {}
  );

  return data?.consent ?? null;
}

export async function withdrawArcConsent(consentId, reason = "") {
  const data = await apiPatch(
    `${CONSENTS_PATH}/${encodeURIComponent(consentId)}/withdraw`,
    { reason }
  );

  return data?.consent ?? null;
}

// ── 민감정보 접근 승인 ─────────────────────────────────────────────────────

export async function fetchArcAccessRequests({
  incidentNo = "",
  scopeAll = false,
  status = "",
  limit = 100,
} = {}) {
  const data = await apiGet(
    `${ACCESS_PATH}${queryString({
      incidentNo,
      scopeAll: scopeAll || undefined,
      status,
      limit,
    })}`
  );

  return {
    requests: Array.isArray(data?.requests) ? data.requests : [],
    canApprove: Boolean(data?.canApprove),
  };
}

export async function requestArcAccess({ incidentNo, purpose }) {
  const data = await apiPost(ACCESS_PATH, { incidentNo, purpose });

  return data?.request ?? null;
}

export async function decideArcAccess(accessId, { approve, reason = "" }) {
  const data = await apiPatch(
    `${ACCESS_PATH}/${encodeURIComponent(accessId)}`,
    {
      approve,
      reason,
    }
  );

  return data?.request ?? null;
}

export async function fetchArcAccessReads({
  incidentNo = "",
  limit = 200,
} = {}) {
  const data = await apiGet(
    `${READS_PATH}${queryString({
      incidentNo,
      limit,
    })}`
  );

  return Array.isArray(data?.reads) ? data.reads : [];
}
