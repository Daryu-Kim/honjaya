// 선불권(P10) API 호출 도우미.
//
// 규칙(사용 가능일/최소 결제 금액/사용 한도)은 서버가 최종 검증하므로
// 화면에서는 서버가 내려주는 usable/blockedReason/maxUsableAmount 를 그대로 보여 줍니다.
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { normalizePhoneNumber } from "@/lib/points";

export const PREPAID_STATUS_LABELS = {
  ACTIVE: "사용 가능",
  EXHAUSTED: "잔액 소진",
  EXPIRED: "기간 만료",
  VOID: "취소됨",
};

export const PREPAID_ENTRY_LABELS = {
  PURCHASE: "판매",
  USE: "사용",
  ADJUST: "조정",
  EXPIRE: "만료",
  RESTORE: "복원",
};

export const PREPAID_PAYMENT_METHODS = [
  { value: "CARD", label: "카드" },
  { value: "CASH", label: "현금" },
  { value: "BANK", label: "계좌이체" },
  { value: "KAKAO_PAY", label: "카카오페이" },
  { value: "NAVER_PAY", label: "네이버페이" },
  { value: "OTHER", label: "기타" },
];

// ISO 요일(1=월 … 7=일) — 관리자 설정에서 체크박스로 씁니다.
export const PREPAID_WEEKDAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 7, label: "일" },
];

export function getPrepaidStatusLabel(status) {
  return PREPAID_STATUS_LABELS[status] || status || "-";
}

export function getPrepaidEntryLabel(entryType) {
  return PREPAID_ENTRY_LABELS[entryType] || entryType || "-";
}

export function formatWon(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

export function formatPrepaidDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatPrepaidDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 상품 조건 요약 문구(목록/선택 박스에서 공통 사용).
export function describePlanRule(plan) {
  if (!plan) return "";

  const parts = [];

  if (plan.validityMonths > 0) {
    parts.push(`유효 ${plan.validityMonths}개월`);
  } else {
    parts.push("유효기간 없음");
  }

  if (plan.minPaymentAmount > 0) {
    parts.push(`결제 ${formatWon(plan.minPaymentAmount)} 이상`);
  }

  if (plan.minUseAmount > 0) {
    parts.push(`최소 ${formatWon(plan.minUseAmount)}`);
  }

  if (plan.maxUsePercent < 100) {
    parts.push(`결제액의 ${plan.maxUsePercent}%까지`);
  }

  if (Array.isArray(plan.usableDays) && plan.usableDays.length > 0) {
    const labels = PREPAID_WEEKDAYS.filter((day) =>
      plan.usableDays.includes(day.value)
    ).map((day) => day.label);

    parts.push(`${labels.join("·")}요일만`);
  }

  if (plan.usableFromTime && plan.usableToTime) {
    parts.push(`${plan.usableFromTime}~${plan.usableToTime}`);
  }

  return parts.join(" · ");
}

// 이번 결제에서 해당 선불권으로 쓸 수 있는 최대 금액(화면 표시용, 최종 검증은 서버).
// 서버 prepaid.js#maxUsableAmount 와 같은 규칙입니다.
export function computePassMaxUsable(pass, paymentAmount = 0) {
  if (!pass || !pass.usable) return 0;

  const balance = Math.max(0, Number(pass.balance || 0));
  const payment = Math.max(0, Number(paymentAmount || 0));
  const percent = Math.min(100, Math.max(1, Number(pass.maxUsePercent ?? 100)));
  let usable = payment > 0 ? Math.min(balance, payment) : balance;

  if (percent < 100) {
    if (payment <= 0) return 0;

    usable = Math.min(usable, Math.floor((payment * percent) / 100));
  }

  const minUse = Number(pass.minUseAmount || 0);

  if (minUse > 0 && usable < minUse) return 0;

  return Math.max(0, usable);
}

export function fetchPrepaidPlans({ includeInactive = false } = {}) {
  const params = new URLSearchParams();

  if (includeInactive) params.set("includeInactive", "true");

  const query = params.toString();

  return apiGet(`/api/prepaid/plans${query ? `?${query}` : ""}`);
}

export function createPrepaidPlan(payload) {
  return apiPost("/api/prepaid/plans", payload);
}

export function updatePrepaidPlan(planId, payload) {
  return apiPatch(`/api/prepaid/plans/${planId}`, payload);
}

export function issuePrepaidPass({
  phone = "",
  customerId = "",
  planId,
  paymentMethod = "CARD",
  memo = "",
}) {
  return apiPost("/api/prepaid/passes", {
    phone: phone ? normalizePhoneNumber(phone) : "",
    customerId,
    planId,
    paymentMethod,
    memo,
  });
}

// 결제 화면에서 쓸 보유 선불권 목록(usable/maxUsableAmount 포함).
export function fetchCustomerPrepaidPasses({
  phone = "",
  customerId = "",
  paymentAmount = null,
} = {}) {
  const params = new URLSearchParams();

  if (phone) params.set("phone", normalizePhoneNumber(phone));
  if (customerId) params.set("customerId", customerId);
  if (paymentAmount !== null && paymentAmount !== undefined) {
    params.set("paymentAmount", String(paymentAmount));
  }

  const query = params.toString();

  return apiGet(`/api/prepaid/customer${query ? `?${query}` : ""}`);
}

export function fetchPrepaidPasses({
  phone = "",
  status = "",
  from = "",
  to = "",
  limit = 200,
} = {}) {
  const params = new URLSearchParams();

  if (phone) params.set("phone", normalizePhoneNumber(phone));
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (limit) params.set("limit", String(limit));

  const query = params.toString();

  return apiGet(`/api/prepaid/passes${query ? `?${query}` : ""}`);
}

export function fetchPrepaidPassLedger(passId, { limit = 100 } = {}) {
  const params = new URLSearchParams();

  if (limit) params.set("limit", String(limit));

  const query = params.toString();

  return apiGet(
    `/api/prepaid/passes/${passId}/ledger${query ? `?${query}` : ""}`
  );
}

export function adjustPrepaidPass({ passId, amount, reason }) {
  return apiPost(`/api/prepaid/passes/${passId}/adjust`, { amount, reason });
}

export function voidPrepaidPass({ passId, reason }) {
  return apiPost(`/api/prepaid/passes/${passId}/void`, { reason });
}

export function fetchPrepaidSummary({ from = "", to = "" } = {}) {
  const params = new URLSearchParams();

  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const query = params.toString();

  return apiGet(`/api/prepaid/summary${query ? `?${query}` : ""}`);
}
