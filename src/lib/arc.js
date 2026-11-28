// P14 — 응급안전관리센터(ARC SAFETY) 프런트 도우미.
//
// 화면 공통 라벨과 API 호출만 모읍니다. 권한 판단은 항상 서버가 다시 합니다.
import { apiBlob, apiGet, apiPatch, apiPost, apiRequest } from "@/lib/api";

// 응급안전관리센터는 사장(대표)·매니저만 씁니다.
// 메뉴·라우터에서 먼저 숨기고, 최종 차단은 서버(/api/arc/*)가 다시 합니다.
export const ARC_ALLOWED_ROLES = ["OWNER", "MANAGER"];

export function canUseArc(role) {
  return ARC_ALLOWED_ROLES.includes(String(role || ""));
}

// 화면·라우터는 역할이 아니라 "직원 정보"로 판단합니다.
// ARC 총괄 계정(yoonhee1021)은 역할과 상관없이 통과시킵니다.
export function canAccessArc(employee) {
  return Boolean(employee?.isArcDirector) || canUseArc(employee?.role);
}

// 응급안전관리센터 총괄(yoonhee1021) 계정의 첫 화면입니다.
// 서버가 직원 정보에 isArcDirector 를 내려 주면 그 계정은 로그인 직후 ARC 로 들어갑니다.
export const ARC_HOME_PATH = "/admin/arc";

export function arcHomePath(employee) {
  return employee?.isArcDirector ? ARC_HOME_PATH : "";
}

// 첫 화면 이동은 브라우저 탭당 1회만 적용합니다.
// (새 탭 = 다시 ARC 로, 같은 탭에서 새로고침 = 보던 화면 유지)
const ARC_LANDING_STORAGE_KEY = "honjaya.arcLandingDone";
let arcLandingDoneInMemory = false;

export function hasArcLanded() {
  if (arcLandingDoneInMemory) {
    return true;
  }

  if (typeof sessionStorage === "undefined") {
    return false;
  }

  return sessionStorage.getItem(ARC_LANDING_STORAGE_KEY) === "1";
}

export function markArcLanded() {
  arcLandingDoneInMemory = true;

  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(ARC_LANDING_STORAGE_KEY, "1");
}

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

export const ARC_STOCKTAKE_METHOD_LABELS = {
  FULL: "전수 실사",
  SAMPLE: "표본 실사",
  PARTIAL: "부분 실사",
};

export const ARC_STOCKTAKE_STATE_LABELS = {
  OK: "정상",
  LOW: "수량 부족",
  DAMAGED: "손상·오염",
  EXPIRING: "유효기간 임박",
  DISPOSE: "폐기 대상",
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

export const ARC_EVIDENCE_KIND_LABELS = {
  RECEIPT: "영수증",
  CARD: "카드전표",
  TAX_INVOICE: "세금계산서",
  CASH_RECEIPT: "현금영수증",
  NONE: "증빙 없음",
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

export const ARC_CARE_FILE_KIND_LABELS = {
  CARE_SHEET: "AS-CARE 서식 원본",
  SIGNATURE: "서명·확인본",
  PHOTO: "현장 사진",
  ETC: "그 외 자료",
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
const USAGES_PATH = "/api/arc/usages";
const EXPENSES_PATH = "/api/arc/expenses";
const UNIT_PRICES_PATH = "/api/arc/unit-prices";
const ROUTINE_PATH = "/api/arc/routine";
const CARE_PATH = "/api/arc/care";

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

// ── ARC 비서(오늘 할 일 브리핑) ────────────────────────────────────────────

export async function fetchArcAssistant() {
  return apiGet("/api/arc/assistant");
}

// ── 응급안전 권한 관리(ARC 대표·RN 전용) ───────────────────────────────────
// 사장·매니저도 이 화면에서는 아무것도 바꿀 수 없습니다. 서버가 다시 막습니다.

export async function fetchArcPermissions() {
  return apiGet("/api/arc/permissions");
}

export async function saveArcEmployeePermissions(employeeId, permissions = []) {
  return apiPatch(`/api/arc/permissions/${encodeURIComponent(employeeId)}`, {
    permissions,
  });
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
    canRequest: Boolean(data?.canRequest),
  };
}

export async function requestArcAccess({
  incidentNo,
  purpose,
  evidence,
  careRecordId = "",
}) {
  const data = await apiPost(ACCESS_PATH, {
    incidentNo,
    purpose,
    evidence,
    careRecordId: careRecordId || null,
  });

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
  witnessName = "",
  method = "FULL",
  issuesNote = "",
} = {}) {
  const data = await apiPost(STOCKTAKES_PATH, {
    period,
    countedOn,
    note,
    witnessName,
    method,
    issuesNote,
  });

  return {
    stocktake: data?.stocktake ?? null,
    items: Array.isArray(data?.items) ? data.items : [],
    reused: Boolean(data?.reused),
  };
}

export async function updateArcStocktake(stocktakeId, payload) {
  const data = await apiPatch(
    `${STOCKTAKES_PATH}/${encodeURIComponent(stocktakeId)}`,
    payload
  );

  return { stocktake: data?.stocktake ?? null, items: data?.items ?? [] };
}

export async function saveArcStocktakeItem(
  stocktakeId,
  itemId,
  { countedQty, reason = "", state, action }
) {
  const data = await apiPatch(
    `${STOCKTAKES_PATH}/${encodeURIComponent(
      stocktakeId
    )}/items/${encodeURIComponent(itemId)}`,
    { countedQty, reason, state, action }
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
    owners: Array.isArray(data?.owners) ? data.owners : [],
    canManageAll: Boolean(data?.canManageAll),
    viewerIsDirector: Boolean(data?.viewerIsDirector),
    viewerId: data?.viewerId ?? null,
    viewerName: data?.viewerName ?? "",
  };
}

export async function claimArcOtcItems() {
  const data = await apiPost(`${OTC_PATH}/claim`, {});

  return data?.claimed ?? 0;
}

export async function createArcOtcItem(payload) {
  const data = await apiPost(`${OTC_PATH}/items`, payload);

  return data?.item ?? null;
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
    careRecordId: data?.careRecordId ?? "",
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

// ── AS-CARE 서식 목록 · 첨부 파일(HWP·DOCX·PDF·사진) ──────────────────────

export async function fetchArcCareRecords({
  search = "",
  from = "",
  to = "",
  hasFiles = false,
  limit = 100,
} = {}) {
  const data = await apiGet(
    `${CARE_PATH}${queryString({
      search,
      from,
      to,
      hasFiles: hasFiles || undefined,
      limit,
    })}`
  );

  return {
    records: Array.isArray(data?.records) ? data.records : [],
    canWriteCare: Boolean(data?.canWriteCare),
    isArcDirector: Boolean(data?.isArcDirector),
  };
}

export async function fetchArcCareFiles(incidentId) {
  const data = await apiGet(
    `${INCIDENTS_PATH}/${encodeURIComponent(incidentId)}/care-files`
  );

  return {
    files: Array.isArray(data?.files) ? data.files : [],
    canUpload: Boolean(data?.canUpload),
    kinds: Array.isArray(data?.kinds) ? data.kinds : [],
    maxBytes: Number(data?.maxBytes ?? 0),
    extensions: Array.isArray(data?.extensions) ? data.extensions : [],
  };
}

// FileReader 가 없는 환경(SSR)도 있어 업로드 시점에만 호출합니다.
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했어요."));
    reader.readAsDataURL(file);
  });
}

export async function uploadArcCareFile(
  incidentId,
  { file, kind = "CARE_SHEET", note = "" } = {}
) {
  if (!file) {
    throw new Error("올릴 파일을 선택해 주세요.");
  }

  const dataBase64 = await readFileAsBase64(file);
  const data = await apiPost(
    `${INCIDENTS_PATH}/${encodeURIComponent(incidentId)}/care-files`,
    {
      fileName: file.name,
      mime: file.type || "application/octet-stream",
      kind,
      note,
      dataBase64,
    }
  );

  return {
    file: data?.file ?? null,
    duplicated: Boolean(data?.duplicated),
  };
}

export async function deleteArcCareFile(fileId) {
  await apiRequest(`/api/arc/care-files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  });
}

/** 인증 헤더가 필요해 <a href> 로는 받을 수 없습니다. Blob 으로 받아 저장합니다. */
export async function downloadArcCareFile({ id, fileName }) {
  const blob = await apiBlob(
    `/api/arc/care-files/${encodeURIComponent(id)}/download`
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName || "AS-CARE";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ── 사용대장(USE) · 비용·실비정산(EXP) ─────────────────────────────────────

export const ARC_USAGE_TARGET_LABELS = {
  GUEST: "고객",
  STAFF: "직원",
  VISITOR: "방문객",
  CHECK: "점검·교육",
  ETC: "기타",
};

export const ARC_USAGE_STATUS_LABELS = {
  ACTIVE: "유효",
  VOID: "취소",
};

export const ARC_EXPENSE_CATEGORY_LABELS = {
  SUPPLY: "소모품",
  PRINT: "인쇄·교구",
  TRANSPORT: "교통",
  SERVICE: "자문·활동비",
  EQUIPMENT: "장비·자재",
  OTHER: "기타",
};

export const ARC_EXPENSE_SOURCE_LABELS = {
  MANUAL: "직접 등록",
  USAGE_MONTH: "월 소모금액 정산",
  PURCHASE: "구매대장 연결",
};

export const ARC_PAYMENT_METHOD_LABELS = {
  TRANSFER: "계좌이체",
  CASH: "현금",
  CARD: "카드",
  ETC: "기타",
};

export function formatArcMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "0원";

  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

export async function fetchArcUsages({
  period = "",
  incidentNo = "",
  status = "",
  limit = 100,
} = {}) {
  const data = await apiGet(
    `${USAGES_PATH}${queryString({ period, incidentNo, status, limit })}`
  );

  return {
    usages: Array.isArray(data?.usages) ? data.usages : [],
    priceMap:
      data?.priceMap && typeof data.priceMap === "object" ? data.priceMap : {},
    prices: Array.isArray(data?.prices) ? data.prices : [],
    pendingUsage: data?.pendingUsage ?? null,
    summary: data?.summary ?? null,
    canCreate: Boolean(data?.canCreate),
    canExpense: Boolean(data?.canExpense),
    canApprove: Boolean(data?.canApprove),
    canManagePrices: Boolean(data?.canManagePrices),
    viewerName: data?.viewerName ?? "",
  };
}

export async function fetchArcUnitPrices() {
  const data = await apiGet(UNIT_PRICES_PATH);

  return {
    prices: Array.isArray(data?.prices) ? data.prices : [],
    priceMap:
      data?.priceMap && typeof data.priceMap === "object" ? data.priceMap : {},
    canManage: Boolean(data?.canManage),
  };
}

export async function createArcUnitPrice(payload) {
  const data = await apiPost(UNIT_PRICES_PATH, payload);

  return data?.price ?? null;
}

export async function deleteArcUnitPrice(priceId) {
  return apiRequest(`${UNIT_PRICES_PATH}/${encodeURIComponent(priceId)}`, {
    method: "DELETE",
  });
}

export async function createArcUsage(payload) {
  const data = await apiPost(USAGES_PATH, payload);

  return {
    usage: data?.usage ?? null,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

export async function fetchArcUsage(usageId) {
  const data = await apiGet(`${USAGES_PATH}/${encodeURIComponent(usageId)}`);

  return {
    usage: data?.usage ?? null,
    items: Array.isArray(data?.items) ? data.items : [],
    canCreate: Boolean(data?.canCreate),
  };
}

export async function voidArcUsage(usageId, reason) {
  const data = await apiPost(
    `${USAGES_PATH}/${encodeURIComponent(usageId)}/void`,
    { reason }
  );

  return {
    usage: data?.usage ?? null,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

export async function fetchArcExpenses({
  period = "",
  status = "",
  limit = 100,
} = {}) {
  const data = await apiGet(
    `${EXPENSES_PATH}${queryString({ period, status, limit })}`
  );

  return {
    expenses: Array.isArray(data?.expenses) ? data.expenses : [],
    summary: data?.summary ?? null,
    pendingUsage: data?.pendingUsage ?? null,
    canCreate: Boolean(data?.canCreate),
    canApprove: Boolean(data?.canApprove),
    viewerName: data?.viewerName ?? "",
  };
}

export async function fetchArcExpense(expenseId) {
  const data = await apiGet(
    `${EXPENSES_PATH}/${encodeURIComponent(expenseId)}`
  );

  return {
    expense: data?.expense ?? null,
    payments: Array.isArray(data?.payments) ? data.payments : [],
    canCreate: Boolean(data?.canCreate),
    canApprove: Boolean(data?.canApprove),
  };
}

export async function createArcExpense(payload) {
  const data = await apiPost(EXPENSES_PATH, payload);

  return {
    expense: data?.expense ?? null,
    payments: Array.isArray(data?.payments) ? data.payments : [],
  };
}

export async function updateArcExpense(expenseId, payload) {
  const data = await apiPatch(
    `${EXPENSES_PATH}/${encodeURIComponent(expenseId)}`,
    payload
  );

  return {
    expense: data?.expense ?? null,
    payments: Array.isArray(data?.payments) ? data.payments : [],
  };
}

export async function addArcExpensePayment(expenseId, payload) {
  const data = await apiPost(
    `${EXPENSES_PATH}/${encodeURIComponent(expenseId)}/payments`,
    payload
  );

  return {
    expense: data?.expense ?? null,
    payments: Array.isArray(data?.payments) ? data.payments : [],
  };
}

/** 대표확인(승인). arc.approve 권한이 있는 계정만 호출할 수 있어요. */
export async function approveArcExpense(expenseId) {
  const data = await apiPost(
    `${EXPENSES_PATH}/${encodeURIComponent(expenseId)}/approve`,
    {}
  );

  return {
    expense: data?.expense ?? null,
    payments: Array.isArray(data?.payments) ? data.payments : [],
  };
}

export async function removeArcExpensePayment(expenseId, paymentId) {
  const data = await apiPost(
    `${EXPENSES_PATH}/${encodeURIComponent(
      expenseId
    )}/payments/${encodeURIComponent(paymentId)}/remove`,
    {}
  );

  return {
    expense: data?.expense ?? null,
    payments: Array.isArray(data?.payments) ? data.payments : [],
  };
}

export async function createArcExpenseFromUsageMonth(payload) {
  const data = await apiPost(`${EXPENSES_PATH}/from-usage-month`, payload);

  return {
    expense: data?.expense ?? null,
    payments: Array.isArray(data?.payments) ? data.payments : [],
    applied: data?.applied ?? null,
  };
}

// ── 월간 운영 루틴(AS-CAL-001) ─────────────────────────────────────────────

export const ARC_ROUTINE_STATE_LABELS = {
  PENDING: "미완료",
  DONE: "완료",
  SKIPPED: "건너뜀",
  ACTIVE: "진행 기간",
  OVERDUE: "기한 지남",
  UPCOMING: "예정",
};

// 서버가 이번 달(Asia/Seoul) 기준으로 기간을 정해 줍니다.
export async function fetchArcRoutine(period = "") {
  return apiGet(`${ROUTINE_PATH}${queryString({ period })}`);
}

export async function saveArcRoutineStep(stepKey, payload = {}) {
  return apiPatch(`${ROUTINE_PATH}/${encodeURIComponent(stepKey)}`, payload);
}

// ── 월간 교육·OT ────────────────────────────────────────────────────────
// 등록·수정은 ARC 총괄(최윤희)만 가능합니다. 화면은 canWrite 로 버튼만 숨기고,
// 최종 차단은 서버(POST/PATCH /api/arc/training)가 다시 합니다.

const TRAINING_PATH = "/api/arc/training";

export const ARC_TRAINING_KIND_LABELS = {
  OT: "월간 OT",
  REGULAR: "정기교육",
  NEWBIE: "신규직원 기본교육",
  DRILL: "상황연습",
  REFRESH: "보수·재교육",
  ROUTINE: "월간 운영 루틴",
  VERBAL: "정기 구두테스트",
  VERBAL_SURPRISE: "불시 구두테스트",
  PERSONAL: "개인 일정",
};

/** 달력·필터에 쓰는 분류 순서(개인 일정·구두테스트는 총괄 본인만 조회). */
export const ARC_TRAINING_KIND_ORDER = [
  "OT",
  "REGULAR",
  "NEWBIE",
  "DRILL",
  "REFRESH",
  "ROUTINE",
  "VERBAL",
  "VERBAL_SURPRISE",
  "PERSONAL",
];

export const ARC_TRAINING_STATUS_LABELS = {
  PLANNED: "예정",
  DONE: "완료",
  CANCELED: "취소",
};

export const ARC_TRAINING_RESULT_LABELS = {
  PENDING: "미평가",
  PASS: "통과",
  MAKEUP: "보충 필요",
  FAIL: "재교육",
  EXCUSED: "사유 불참",
};

export async function fetchArcTraining(period = "") {
  return apiGet(`${TRAINING_PATH}${queryString({ period })}`);
}

export async function fetchArcTrainingGuide() {
  return apiGet(`${TRAINING_PATH}/guide`);
}

export async function createArcTrainingSession(payload) {
  return apiPost(TRAINING_PATH, payload);
}

export async function updateArcTrainingSession(sessionId, payload) {
  return apiPatch(`${TRAINING_PATH}/${encodeURIComponent(sessionId)}`, payload);
}

export async function saveArcTrainingAttendees(sessionId, attendees = []) {
  return apiPost(
    `${TRAINING_PATH}/${encodeURIComponent(sessionId)}/attendees`,
    { attendees }
  );
}

export async function deleteArcTrainingSession(sessionId) {
  return apiPost(
    `${TRAINING_PATH}/${encodeURIComponent(sessionId)}/delete`,
    {}
  );
}

// ── 교육자료 총괄 수정 + 작성 도우미 ────────────────────────────────────
// 교육자료 원문은 코드가 원본이고, 총괄이 고친 부분만 서버에 저장합니다.
// 저장·되돌리기·도우미는 ARC 대표(RN)만 쓸 수 있습니다.

export async function fetchArcTrainingContent() {
  return apiGet(`${TRAINING_PATH}/content`);
}

export async function saveArcTrainingContent(payload) {
  return apiRequest(`${TRAINING_PATH}/content`, {
    method: "PUT",
    body: payload,
  });
}

export async function resetArcTrainingContent(scope, key) {
  return apiPost(`${TRAINING_PATH}/content/delete`, { scope, key });
}

export async function buildArcTrainingHelper(payload) {
  return apiPost(`${TRAINING_PATH}/content/helper`, payload);
}

// ── 구두테스트(ARC 대표 전용) ───────────────────────────────────────────

const VERBAL_PATH = "/api/arc/verbal";

export const ARC_VERBAL_RESULT_LABELS = {
  PERFORM: "수행",
  PARTIAL: "부분수행",
  NONE: "미수행",
};

export const ARC_VERBAL_VERDICT_LABELS = {
  PENDING: "채점 전",
  PASS: "통과",
  RETAKE: "재시험",
  FAIL: "재교육",
};

export const ARC_VERBAL_VERDICT_TONES = {
  PENDING: "muted",
  PASS: "ok",
  RETAKE: "warn",
  FAIL: "danger",
};

export const ARC_VERBAL_KIND_LABELS = {
  REGULAR: "정기 구두테스트",
  SURPRISE: "불시 구두테스트",
};

export async function fetchArcVerbal(params = {}) {
  return apiGet(`${VERBAL_PATH}${queryString(params)}`);
}

export async function fetchArcVerbalExam(examId) {
  return apiGet(`${VERBAL_PATH}/${encodeURIComponent(examId)}`);
}

export async function createArcVerbalExam(payload) {
  return apiPost(VERBAL_PATH, payload);
}

export async function gradeArcVerbalExam(examId, payload) {
  return apiPost(`${VERBAL_PATH}/${encodeURIComponent(examId)}/grade`, payload);
}

export async function deleteArcVerbalExam(examId) {
  return apiPost(`${VERBAL_PATH}/${encodeURIComponent(examId)}/delete`, {});
}

// ── 요청 게시판(전 직원 → ARC 대표) ─────────────────────────────────────
// 직원·사장 모두 글을 남길 수 있고, 열람·답글·완료는 총괄이 처리합니다.

const REQUESTS_PATH = "/api/arc/requests";

export const ARC_REQUEST_STATUS_LABELS = {
  PENDING: "대기중",
  READ: "읽음",
  DONE: "완료",
};

export const ARC_REQUEST_STATUS_TONES = {
  PENDING: "warn",
  READ: "info",
  DONE: "ok",
};

export const ARC_REQUEST_CATEGORY_LABELS = {
  QUESTION: "질문",
  COMPLAINT: "불만·건의",
  SUPPLY: "비품·약품 요청",
  EDUCATION: "교육 요청",
  FACILITY: "시설·환경",
  HEALTH: "건강·컨디션",
  ETC: "기타",
};

export async function fetchArcRequests(params = {}) {
  return apiGet(`${REQUESTS_PATH}${queryString(params)}`);
}

export async function fetchArcRequest(requestId) {
  return apiGet(`${REQUESTS_PATH}/${encodeURIComponent(requestId)}`);
}

export async function createArcRequest(payload) {
  return apiPost(REQUESTS_PATH, payload);
}

export async function replyArcRequest(requestId, payload) {
  return apiPost(
    `${REQUESTS_PATH}/${encodeURIComponent(requestId)}/replies`,
    payload
  );
}

export async function completeArcRequest(requestId, payload) {
  return apiPost(
    `${REQUESTS_PATH}/${encodeURIComponent(requestId)}/complete`,
    payload
  );
}

export async function reopenArcRequest(requestId, payload = {}) {
  return apiPost(
    `${REQUESTS_PATH}/${encodeURIComponent(requestId)}/reopen`,
    payload
  );
}

export async function deleteArcRequest(requestId) {
  return apiPost(
    `${REQUESTS_PATH}/${encodeURIComponent(requestId)}/delete`,
    {}
  );
}

// ── 직원 개인 상비약 사용대장 · 단가 · 정산 ─────────────────────────────

const OTC_LEDGER_PATH = "/api/arc/otc";

export const ARC_OTC_LEDGER_STATUS_LABELS = {
  ACTIVE: "사용",
  VOID: "취소",
};

export const ARC_OTC_SETTLEMENT_STATUS_LABELS = {
  REQUESTED: "정산 요청",
  PAID: "지급 완료",
  CANCELED: "요청 취소",
};

export const ARC_OTC_SETTLEMENT_TONES = {
  REQUESTED: "warn",
  PAID: "ok",
  CANCELED: "muted",
};

export async function fetchArcOtcLedger(params = {}) {
  return apiGet(`${OTC_LEDGER_PATH}/ledger${queryString(params)}`);
}

export async function createArcOtcUsage(payload) {
  return apiPost(`${OTC_LEDGER_PATH}/usages`, payload);
}

export async function voidArcOtcUsage(usageId, payload = {}) {
  return apiPost(
    `${OTC_LEDGER_PATH}/usages/${encodeURIComponent(usageId)}/void`,
    payload
  );
}

export async function saveArcOtcPrice(payload) {
  return apiPost(`${OTC_LEDGER_PATH}/prices`, payload);
}

export async function deleteArcOtcPrice(priceId) {
  return apiPost(
    `${OTC_LEDGER_PATH}/prices/${encodeURIComponent(priceId)}/delete`,
    {}
  );
}

export async function requestArcOtcSettlement(payload) {
  return apiPost(`${OTC_LEDGER_PATH}/settlements/request`, payload);
}

export async function payArcOtcSettlement(settlementId, payload = {}) {
  return apiPost(
    `${OTC_LEDGER_PATH}/settlements/${encodeURIComponent(settlementId)}/pay`,
    payload
  );
}

export async function cancelArcOtcSettlement(settlementId, payload = {}) {
  return apiPost(
    `${OTC_LEDGER_PATH}/settlements/${encodeURIComponent(settlementId)}/cancel`,
    payload
  );
}

// ── 품질관리(AS-REC-001 F11·F12·F13·F14) ────────────────────────────────
// 사후검토 / Near Miss / CAPA / 재고이상. 작성·수정은 사장·매니저(ARC 총괄)만 가능합니다.

const QUALITY_PATH = "/api/arc/quality";

export const ARC_QUALITY_STATUS_LABELS = {
  OPEN: "접수",
  IN_PROGRESS: "조치 중",
  VERIFIED: "효과 확인",
  CLOSED: "종결",
};

export const ARC_QUALITY_STATUS_TONES = {
  OPEN: "warn",
  IN_PROGRESS: "info",
  VERIFIED: "ok",
  CLOSED: "muted",
};

export const ARC_QUALITY_VERDICT_LABELS = {
  EFFECTIVE: "효과 있음 · 종결",
  PARTIAL: "일부 효과 · 보완",
  MORE: "효과 미흡 · 추가조치",
};

export const ARC_QUALITY_KIND_TONES = {
  REVIEW: "info",
  NEAR_MISS: "warn",
  CAPA: "alert",
  STOCK_ISSUE: "muted",
};

export async function fetchArcQuality(params = {}) {
  return apiGet(`${QUALITY_PATH}${queryString(params)}`);
}

export async function fetchArcQualitySummary(limit = "") {
  return apiGet(`${QUALITY_PATH}/summary${queryString({ limit })}`);
}

export async function fetchArcQualityRecord(recordId) {
  return apiGet(`${QUALITY_PATH}/${encodeURIComponent(recordId)}`);
}

export async function createArcQuality(payload) {
  return apiPost(QUALITY_PATH, payload);
}

export async function updateArcQuality(recordId, payload) {
  return apiPatch(`${QUALITY_PATH}/${encodeURIComponent(recordId)}`, payload);
}

export async function toggleArcQualityAction(recordId, actionId, payload = {}) {
  return apiPatch(
    `${QUALITY_PATH}/${encodeURIComponent(
      recordId
    )}/actions/${encodeURIComponent(actionId)}`,
    payload
  );
}

export async function deleteArcQualityAction(recordId, actionId) {
  return apiPost(
    `${QUALITY_PATH}/${encodeURIComponent(
      recordId
    )}/actions/${encodeURIComponent(actionId)}/delete`,
    {}
  );
}

// ── 행사·의료지원(P14J · AS-OPS-001 06-B-3 · AS-NOT-001) ─────────────────

const EVENTS_PATH = "/api/arc/events";

export const ARC_EVENT_STATUS_LABELS = {
  PLANNING: "준비 중",
  READY: "준비 완료",
  DONE: "종료",
  CANCELED: "취소",
};

export const ARC_EVENT_STATUS_TONES = {
  PLANNING: "warn",
  READY: "info",
  DONE: "ok",
  CANCELED: "muted",
};

export const ARC_EVENT_PHASE_LABELS = {
  BEFORE: "행사 전",
  DURING: "당일",
  AFTER: "종료 후",
};

export async function fetchArcEvents(params = {}) {
  return apiGet(`${EVENTS_PATH}${queryString(params)}`);
}

export async function fetchArcEventSummary(limit = "") {
  return apiGet(`${EVENTS_PATH}/summary${queryString({ limit })}`);
}

export async function fetchArcEvent(eventId) {
  return apiGet(`${EVENTS_PATH}/${encodeURIComponent(eventId)}`);
}

export async function createArcEvent(payload) {
  return apiPost(EVENTS_PATH, payload);
}

export async function updateArcEvent(eventId, payload) {
  return apiPatch(`${EVENTS_PATH}/${encodeURIComponent(eventId)}`, payload);
}

export async function deleteArcEvent(eventId) {
  return apiPost(`${EVENTS_PATH}/${encodeURIComponent(eventId)}/delete`, {});
}

export async function toggleArcEventTask(eventId, taskId, payload = {}) {
  return apiPatch(
    `${EVENTS_PATH}/${encodeURIComponent(eventId)}/tasks/${encodeURIComponent(
      taskId
    )}`,
    payload
  );
}

export async function addArcEventTask(eventId, payload) {
  return apiPost(
    `${EVENTS_PATH}/${encodeURIComponent(eventId)}/tasks`,
    payload
  );
}

export async function deleteArcEventTask(eventId, taskId) {
  return apiPost(
    `${EVENTS_PATH}/${encodeURIComponent(eventId)}/tasks/${encodeURIComponent(
      taskId
    )}/delete`,
    {}
  );
}

export async function saveArcEventStaff(eventId, payload) {
  return apiPost(
    `${EVENTS_PATH}/${encodeURIComponent(eventId)}/staff`,
    payload
  );
}

export async function deleteArcEventStaff(eventId, staffId) {
  return apiPost(
    `${EVENTS_PATH}/${encodeURIComponent(eventId)}/staff/${encodeURIComponent(
      staffId
    )}/delete`,
    {}
  );
}
