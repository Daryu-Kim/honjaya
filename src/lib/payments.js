// 결제 원장 API 호출 도우미.
//
// 금액 계산/검증은 모두 서버에서 합니다. 여기서는 요청 형태만 맞춰 보냅니다.
import { apiGet, apiPost } from "@/lib/api";

export const PAYMENT_METHOD_OPTIONS = [
  { value: "CARD", label: "카드" },
  { value: "CASH", label: "현금" },
  { value: "BANK", label: "계좌이체" },
  { value: "KAKAO_PAY", label: "카카오페이" },
  { value: "NAVER_PAY", label: "네이버페이" },
  { value: "GIFT_CARD", label: "상품권" },
  { value: "OTHER", label: "기타" },
];

export function getPaymentMethodLabel(method) {
  const found = PAYMENT_METHOD_OPTIONS.find(
    (option) => option.value === method
  );

  if (found) return found.label;
  if (method === "MIXED") return "여러 수단";
  if (method === "DISCOUNT") return "할인 처리";

  return method || "-";
}

export function fetchSheetLedger(orderSheetId) {
  return apiGet(
    `/api/payments/sheet/${encodeURIComponent(String(orderSheetId || ""))}`
  );
}

export function fetchPaymentLedger({ from = "", to = "", limit = 200 } = {}) {
  const params = new URLSearchParams();

  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (limit) params.set("limit", String(limit));

  const query = params.toString();

  return apiGet(`/api/payments${query ? `?${query}` : ""}`);
}

// entries: [{ method, amount, payerLabel }]
// customerPhone/pointsUsed 를 넘기면 서버가 포인트 사용·적립까지 함께 처리합니다.
export function recordSheetPayment({
  orderSheetId,
  originalAmount,
  discounts = [],
  entries = [],
  memo = "",
  close = true,
  customerPhone = "",
  customerName = "",
  marketingConsent = false,
  pointsUsed = 0,
}) {
  return apiPost("/api/payments", {
    orderSheetId,
    originalAmount,
    discounts,
    entries,
    memo,
    close,
    customerPhone,
    customerName,
    marketingConsent,
    pointsUsed,
  });
}

export function refundSheetPayment({ paymentId, amount, reason = "" }) {
  return apiPost(
    `/api/payments/${encodeURIComponent(String(paymentId || ""))}/refund`,
    { amount, reason }
  );
}
