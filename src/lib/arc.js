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

export const ARC_ACCESS_LEVEL_LABELS = {
  A: "A · 응급·SOP 승인사용",
  B: "B · 교육·승인사용",
  C: "C · RN 제한관리",
};

export const ARC_MOVE_KIND_LABELS = {
  IN: "입고·보충",
  OUT: "사용",
  OPEN: "개봉",
  DISPOSE: "폐기",
  ADJUST: "실사·정정",
};

export const ARC_EXPIRY_BUCKET_LABELS = {
  EXPIRED: "유효기간 지남",
  D7: "7일 이내",
  D30: "30일 이내",
  D90: "90일 이내",
  OK: "정상",
};

export const ARC_STOCKTAKE_STATUS_LABELS = {
  DRAFT: "입력중",
  APPLIED: "확정",
};

export const ARC_PAID_BY_LABELS = {
  SHOP: "사업장 법인카드",
  RN: "최윤희 RN 개인결제",
  OWNER: "대표 개인결제",
  OTHER: "기타",
};

export const ARC_SETTLE_STATUS_LABELS = {
  UNSETTLED: "미정산",
  PARTIAL: "일부정산",
  SETTLED: "정산완료",
};

export const ARC_INCIDENT_KIND_LABELS = {
  GUEST: "비응급 고객",
  STAFF_OTC: "직원 상비약 자가복용",
  EMERGENCY: "응급·119 인계",
};

export const ARC_INCIDENT_STATUS_LABELS = {
  OPEN: "진행 중",
  CLOSED: "종결",
};

export const ARC_RECORD_MODE_LABELS = {
  ON_SITE: "현장 직접 사정",
  OFF_SITE: "비현장·사후 보고",
};

export const ARC_LEGAL_BASIS_LABELS = {
  CONSENT_F25: "F25 · 직원 민감정보 동의 확인",
  CONSENT_F27: "F27 · 비응급 고객 개인정보 동의 확인",
  OTHER_LEGAL: "그 외 적법근거(사유 필수)",
  NOT_APPLICABLE: "해당없음 · 응급·119 인계",
  DEIDENTIFIED: "비식별 전환(상세기록 미저장)",
};

export const ARC_TIMELINE_SOURCE_LABELS = {
  DIRECT: "직접 확인",
  REPORT: "보고받음",
};

const NOTIFICATIONS_PATH = "/api/arc/notifications";
const CONSENTS_PATH = "/api/arc/consents";
const ACCESS_PATH = "/api/arc/sensitive-access";
const READS_PATH = "/api/arc/sensitive-reads";
const STOCK_PATH = "/api/arc/stock";
const STOCKTAKES_PATH = "/api/arc/stocktakes";
const PURCHASES_PATH = "/api/arc/purchases";
const OTC_PATH = "/api/arc/otc";
const INCIDENTS_PATH = "/api/arc/incidents";

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

  return {
    summary: data?.summary ?? null,
    stock: data?.stock ?? null,
    incidents: data?.incidents ?? null,
  };
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

// ── 재고·유효기간 ──────────────────────────────────────────────────────────

export async function fetchArcStock({
  category = "",
  accessLevel = "",
  search = "",
  includeInactive = false,
  lowOnly = false,
  expiringWithinDays = "",
} = {}) {
  const data = await apiGet(
    `${STOCK_PATH}${queryString({
      category,
      accessLevel,
      search,
      includeInactive: includeInactive || undefined,
      lowOnly: lowOnly || undefined,
      expiringWithinDays,
    })}`
  );

  return {
    items: Array.isArray(data?.items) ? data.items : [],
    summary: data?.summary ?? null,
    canManage: Boolean(data?.canManage),
    canStock: Boolean(data?.canStock),
  };
}

export async function fetchArcStockItem(itemId) {
  const data = await apiGet(
    `${STOCK_PATH}/items/${encodeURIComponent(itemId)}`
  );

  return {
    item: data?.item ?? null,
    lots: Array.isArray(data?.lots) ? data.lots : [],
    moves: Array.isArray(data?.moves) ? data.moves : [],
  };
}

export async function createArcStockItem(payload) {
  const data = await apiPost(`${STOCK_PATH}/items`, payload);

  return data?.item ?? null;
}

export async function updateArcStockItem(itemId, payload) {
  const data = await apiPatch(
    `${STOCK_PATH}/items/${encodeURIComponent(itemId)}`,
    payload
  );

  return data?.item ?? null;
}

export async function fetchArcStockMoves({ itemId = "", limit = 60 } = {}) {
  const data = await apiGet(
    `${STOCK_PATH}/moves${queryString({ itemId, limit })}`
  );

  return Array.isArray(data?.moves) ? data.moves : [];
}

/** 입고·사용·개봉·폐기·정정. 재고가 바뀌는 유일한 호출입니다. */
export async function recordArcStockMove(payload) {
  return apiPost(`${STOCK_PATH}/moves`, payload);
}

export async function runArcExpiryScan({ force = false } = {}) {
  const data = await apiGet(
    `${STOCK_PATH}/expiry-scan${queryString({ force: force || undefined })}`
  );

  return data?.result ?? null;
}

// ── 월 1회 실사 ────────────────────────────────────────────────────────────

export async function fetchArcStocktakes({ limit = 24 } = {}) {
  const data = await apiGet(`${STOCKTAKES_PATH}${queryString({ limit })}`);

  return {
    stocktakes: Array.isArray(data?.stocktakes) ? data.stocktakes : [],
    canCount: Boolean(data?.canCount),
    canApply: Boolean(data?.canApply),
  };
}

export async function fetchArcStocktake(stocktakeId) {
  const data = await apiGet(
    `${STOCKTAKES_PATH}/${encodeURIComponent(stocktakeId)}`
  );

  return {
    stocktake: data?.stocktake ?? null,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

export async function createArcStocktake({
  period = "",
  countedOn = "",
  note = "",
} = {}) {
  const data = await apiPost(STOCKTAKES_PATH, { period, countedOn, note });

  return data?.stocktake ?? null;
}

export async function saveArcStocktakeItem(
  stocktakeId,
  itemId,
  { countedQty, reason = "" }
) {
  const data = await apiPatch(
    `${STOCKTAKES_PATH}/${encodeURIComponent(
      stocktakeId
    )}/items/${encodeURIComponent(itemId)}`,
    { countedQty, reason }
  );

  return {
    stocktake: data?.stocktake ?? null,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

export async function applyArcStocktake(stocktakeId) {
  const data = await apiPost(
    `${STOCKTAKES_PATH}/${encodeURIComponent(stocktakeId)}/apply`,
    {}
  );

  return {
    stocktake: data?.stocktake ?? null,
    adjusted: Array.isArray(data?.adjusted) ? data.adjusted : [],
  };
}

// ── 보충·구매·실비정산 ─────────────────────────────────────────────────────

export async function fetchArcPurchases({ period = "", limit = 100 } = {}) {
  const data = await apiGet(
    `${PURCHASES_PATH}${queryString({ period, limit })}`
  );

  return {
    purchases: Array.isArray(data?.purchases) ? data.purchases : [],
    canCreate: Boolean(data?.canCreate),
    canSettle: Boolean(data?.canSettle),
    viewer: data?.viewer ?? "",
  };
}

export async function createArcPurchase(payload) {
  const data = await apiPost(PURCHASES_PATH, payload);

  return data?.purchase ?? null;
}

export async function settleArcPurchase(
  purchaseId,
  { settledAmount, approve = false }
) {
  const data = await apiPatch(
    `${PURCHASES_PATH}/${encodeURIComponent(purchaseId)}`,
    { settledAmount, approve }
  );

  return data?.purchase ?? null;
}

// ── 직원 개인 상비약(OTC) ──────────────────────────────────────────────────

export async function fetchArcOtc({ period = "", scopeAll = false } = {}) {
  const data = await apiGet(
    `${OTC_PATH}${queryString({ period, scopeAll: scopeAll || undefined })}`
  );

  return {
    items: Array.isArray(data?.items) ? data.items : [],
    checks: Array.isArray(data?.checks) ? data.checks : [],
    canManageAll: Boolean(data?.canManageAll),
    viewerId: data?.viewerId ?? null,
    viewerName: data?.viewerName ?? "",
  };
}

export async function claimArcOtcItems() {
  const data = await apiPost(`${OTC_PATH}/claim`, {});

  return data?.claimed ?? 0;
}

export async function updateArcOtcItem(otcItemId, payload) {
  const data = await apiPatch(
    `${OTC_PATH}/items/${encodeURIComponent(otcItemId)}`,
    payload
  );

  return data?.item ?? null;
}

export async function createArcOtcCheck(otcItemId, payload) {
  const data = await apiPost(
    `${OTC_PATH}/items/${encodeURIComponent(otcItemId)}/checks`,
    payload
  );

  return data?.check ?? null;
}

// ── 사건 접수(INC) · AS-CARE 상세기록 ──────────────────────────────────────

export async function fetchArcIncidents({
  kind = "",
  status = "",
  search = "",
  from = "",
  to = "",
  limit = 100,
} = {}) {
  const data = await apiGet(
    `${INCIDENTS_PATH}${queryString({
      kind,
      status,
      search,
      from,
      to,
      limit,
    })}`
  );

  return {
    incidents: Array.isArray(data?.incidents) ? data.incidents : [],
    canCare: Boolean(data?.canCare),
    canSensitive: Boolean(data?.canSensitive),
    canApprove: Boolean(data?.canApprove),
    viewerName: data?.viewerName ?? "",
  };
}

export async function createArcIncident(payload) {
  const data = await apiPost(INCIDENTS_PATH, payload);

  return data?.incident ?? null;
}

export async function fetchArcIncident(incidentId) {
  const data = await apiGet(
    `${INCIDENTS_PATH}/${encodeURIComponent(incidentId)}`
  );

  return {
    exists: Boolean(data?.exists),
    legalBasis: data?.legalBasis ?? null,
    recordedByName: data?.recordedByName ?? "",
    updatedAt: data?.updatedAt ?? null,
    addendaCount: data?.addendaCount ?? 0,
    incident: data?.incident ?? null,
    canCare: Boolean(data?.canCare),
    canSensitive: Boolean(data?.canSensitive),
    canApprove: Boolean(data?.canApprove),
    viewerName: data?.viewerName ?? "",
  };
}

export async function updateArcIncident(incidentId, payload) {
  const data = await apiPatch(
    `${INCIDENTS_PATH}/${encodeURIComponent(incidentId)}`,
    payload
  );

  return data?.incident ?? null;
}

/** 상세 건강기록. 403 이면 사건별 열람 승인이 필요합니다. */
export async function fetchArcCare(incidentId) {
  const data = await apiGet(
    `${INCIDENTS_PATH}/${encodeURIComponent(incidentId)}/care`
  );

  return {
    incident: data?.incident ?? null,
    care: data?.care ?? null,
    timeline: Array.isArray(data?.timeline) ? data.timeline : [],
    meds: Array.isArray(data?.meds) ? data.meds : [],
    addenda: Array.isArray(data?.addenda) ? data.addenda : [],
    access: data?.access ?? null,
  };
}

export async function saveArcCare(incidentId, payload) {
  const data = await apiPatch(
    `${INCIDENTS_PATH}/${encodeURIComponent(incidentId)}/care`,
    payload
  );

  return {
    care: data?.care ?? null,
    timeline: Array.isArray(data?.timeline) ? data.timeline : [],
    meds: Array.isArray(data?.meds) ? data.meds : [],
    addenda: Array.isArray(data?.addenda) ? data.addenda : [],
    access: data?.access ?? null,
  };
}

export async function addArcCareAddendum(incidentId, body) {
  const data = await apiPost(
    `${INCIDENTS_PATH}/${encodeURIComponent(incidentId)}/addenda`,
    { body }
  );

  return data?.addendum ?? null;
}
