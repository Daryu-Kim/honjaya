// 혼자야 기프티콘(P11) API 호출 도우미.
//
// 규칙(사용 가능/액면가 한도)은 서버가 최종 검증하므로 화면에서는 서버가 내려주는
// status/blockedReason/faceValue 를 그대로 보여 줍니다.
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { normalizePhoneNumber } from "@/lib/points";

export const GIFT_KINDS = [
  { value: "ITEM", label: "메뉴 교환권" },
  { value: "AMOUNT", label: "금액권" },
];

export const GIFT_STATUS_LABELS = {
  ACTIVE: "사용 가능",
  USED: "사용 완료",
  EXPIRED: "기간 만료",
  VOID: "취소됨",
};

export const GIFT_THEMES = [
  { value: "SOLO_NIGHT", label: "혼자야의 밤" },
  { value: "CHEERS", label: "건배" },
  { value: "BIRTHDAY", label: "생일 축하" },
  { value: "THANKS", label: "고마워요" },
];

export const GIFT_PAYMENT_METHODS = [
  { value: "CARD", label: "카드" },
  { value: "CASH", label: "현금" },
  { value: "BANK", label: "계좌이체" },
  { value: "KAKAO_PAY", label: "카카오페이" },
  { value: "NAVER_PAY", label: "네이버페이" },
  { value: "OTHER", label: "기타" },
];

export function getGiftStatusLabel(status) {
  return GIFT_STATUS_LABELS[status] || status || "-";
}

export function getGiftKindLabel(kind) {
  const found = GIFT_KINDS.find((option) => option.value === kind);

  return found ? found.label : kind || "-";
}

export function getGiftThemeLabel(theme) {
  const found = GIFT_THEMES.find((option) => option.value === theme);

  return found ? found.label : theme || "-";
}

export function formatGiftWon(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

export function formatGiftDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatGiftDateTime(value) {
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

// "g-abcd1234", "GABCD1234", " g-abcd 1234 " 처럼 입력해도 찾을 수 있게 맞춥니다(서버와 동일 규칙).
export function normalizeGiftCodeInput(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[\s\-_]/g, "");

  if (!raw) return "";

  const body = raw.startsWith("G") ? raw.slice(1) : raw;

  return `G-${body}`;
}

// 손님에게 보여 줄 링크. 서버가 내려주는 link 와 같은 규칙입니다.
export function buildGiftLink(code) {
  if (!code) return "";

  if (typeof window === "undefined") {
    return `/gift/${encodeURIComponent(code)}`;
  }

  return `${window.location.origin}/gift/${encodeURIComponent(code)}`;
}

export function describeGiftProduct(product) {
  if (!product) return "";

  const parts = [
    getGiftKindLabel(product.kind),
    formatGiftWon(product.faceValue),
  ];

  if (product.kind === "ITEM" && product.productName) {
    parts.push(product.productName);
  }

  if (product.validityDays > 0) {
    parts.push(`유효 ${product.validityDays}일`);
  } else {
    parts.push("유효기간 없음");
  }

  return parts.join(" · ");
}

// 이번 결제에서 이 기프티콘으로 쓸 수 있는 금액(화면 표시용, 최종 검증은 서버).
// 액면가보다 결제 금액이 적으면 남은 차액은 소멸합니다.
export function computeGiftUsable(gift, paymentAmount = 0) {
  if (!gift || gift.status !== "ACTIVE" || gift.blockedReason) return 0;

  const faceValue = Math.max(0, Number(gift.faceValue || 0));
  const payment = Math.max(0, Number(paymentAmount || 0));

  if (payment <= 0) return faceValue;

  return Math.min(faceValue, payment);
}

export function fetchGiftProducts({ includeInactive = false } = {}) {
  const params = new URLSearchParams();

  if (includeInactive) params.set("includeInactive", "true");

  const query = params.toString();

  return apiGet(`/api/gifts/products${query ? `?${query}` : ""}`);
}

export function createGiftProduct(payload) {
  return apiPost("/api/gifts/products", payload);
}

export function updateGiftProduct(productId, payload) {
  return apiPatch(`/api/gifts/products/${productId}`, payload);
}

export function issueGift({
  productId,
  buyerName = "",
  buyerPhone = "",
  recipientName = "",
  recipientPhone = "",
  message = "",
  paymentMethod = "CARD",
  send = false,
  channel = "SMS",
}) {
  return apiPost("/api/gifts", {
    productId,
    buyerName,
    buyerPhone: buyerPhone ? normalizePhoneNumber(buyerPhone) : "",
    recipientName,
    recipientPhone: recipientPhone ? normalizePhoneNumber(recipientPhone) : "",
    message,
    paymentMethod,
    send,
    channel,
  });
}

export function lookupGiftCode(code) {
  const params = new URLSearchParams();

  if (code) params.set("code", code);

  return apiGet(`/api/gifts/lookup?${params.toString()}`);
}

export function fetchGifts({
  code = "",
  phone = "",
  status = "",
  from = "",
  to = "",
  limit = 200,
} = {}) {
  const params = new URLSearchParams();

  if (code) params.set("code", code);
  if (phone) params.set("phone", normalizePhoneNumber(phone));
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (limit) params.set("limit", String(limit));

  const query = params.toString();

  return apiGet(`/api/gifts${query ? `?${query}` : ""}`);
}

export function fetchCustomerGifts(customerId) {
  return apiGet(`/api/gifts/customer/${encodeURIComponent(customerId)}`);
}

export function resendGift(giftId) {
  return apiPost(`/api/gifts/${giftId}/resend`, {});
}

export function voidGift({ giftId, reason }) {
  return apiPost(`/api/gifts/${giftId}/void`, { reason });
}

export function fetchGiftSummary({ from = "", to = "" } = {}) {
  const params = new URLSearchParams();

  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const query = params.toString();

  return apiGet(`/api/gifts/summary${query ? `?${query}` : ""}`);
}

// 공개 카드 페이지용(직원 쿠키 없이 apikey 만으로 호출).
export function fetchPublicGift(code) {
  return apiGet(`/api/public/gifts/${encodeURIComponent(code)}`);
}
