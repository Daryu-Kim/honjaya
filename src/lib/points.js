// 포인트(적립/사용/소멸/조정) API 호출 도우미.
//
// 규칙 값(적립률, 최소 사용 단위, 유효기간)은 서버가 정답이므로
// 화면에서는 fetchPointRules() 로 받아 표시만 합니다.
import { apiGet, apiPost } from "@/lib/api";

export const POINT_ENTRY_LABELS = {
  EARN: "적립",
  REDEEM: "사용",
  EXPIRE: "소멸",
  ADJUST: "조정",
};

// 서버가 rules 를 못 내려주는 경우(구버전/오프라인)를 위한 기본값입니다.
export const DEFAULT_POINT_RULES = {
  earnRate: 0.01,
  minRedeem: 1000,
  redeemStep: 1000,
  redeemMinPayment: 30000,
  expiryMonths: 3,
};

export function getPointEntryLabel(entryType) {
  return POINT_ENTRY_LABELS[entryType] || entryType || "-";
}

export function formatPointValue(value) {
  const numeric = Number(value || 0);

  return `${Math.round(numeric).toLocaleString("ko-KR")}P`;
}

export function formatPointDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

// 010-1234-5678 형태로 보기 좋게 바꿔 줍니다(입력 중에도 사용).
export function formatPhoneInput(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function normalizePhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("10")) return `0${digits}`;

  return digits;
}

// 결제 금액 기준으로 사용 가능한 최대 포인트(1,000P 단위 내림).
export function maxUsablePoints({
  balance = 0,
  paymentAmount = 0,
  rules,
} = {}) {
  const activeRules = rules || DEFAULT_POINT_RULES;
  const step = Number(activeRules.redeemStep || 1000);
  const minRedeem = Number(activeRules.minRedeem || 1000);
  const minPayment = Number(activeRules.redeemMinPayment || 0);
  const affordable = Math.min(Number(balance || 0), Number(paymentAmount || 0));

  if (Number(paymentAmount || 0) < minPayment) return 0;
  if (affordable < minRedeem) return 0;

  return Math.floor(affordable / step) * step;
}

export function fetchPointRules() {
  return apiGet("/api/points/rules");
}

export function fetchCustomerPoints({
  phone = "",
  customerId = "",
  limit = 20,
} = {}) {
  const params = new URLSearchParams();

  if (phone) params.set("phone", normalizePhoneNumber(phone));
  if (customerId) params.set("customerId", customerId);
  if (limit) params.set("limit", String(limit));

  const query = params.toString();

  return apiGet(`/api/points/customer${query ? `?${query}` : ""}`);
}

// 고객 이름/메모 저장(없으면 새로 만들고, 있으면 갱신).
export function saveCustomer({ phone, name = "", memo = "" }) {
  return apiPost("/api/points/customer", {
    phone: normalizePhoneNumber(phone),
    name,
    memo,
  });
}

export function fetchPointLedger({
  from = "",
  to = "",
  phone = "",
  limit = 200,
} = {}) {
  const params = new URLSearchParams();

  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (phone) params.set("phone", normalizePhoneNumber(phone));
  if (limit) params.set("limit", String(limit));

  const query = params.toString();

  return apiGet(`/api/points/ledger${query ? `?${query}` : ""}`);
}

export function adjustCustomerPoints({
  phone = "",
  customerId = "",
  points,
  reason,
}) {
  return apiPost("/api/points/adjust", {
    phone: phone ? normalizePhoneNumber(phone) : "",
    customerId,
    points,
    reason,
  });
}
