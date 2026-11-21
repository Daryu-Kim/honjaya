// P6 — 고객 관리(CRM) API 호출 도우미.
//
// 보유 포인트/방문 이력/누적 결제는 서버가 계산한 값을 그대로 보여 줍니다.
import { apiGet, apiPatch, apiPost } from "@/lib/api";

export const CONSENT_FILTERS = [
  { value: "", label: "전체" },
  { value: "yes", label: "동의" },
  { value: "no", label: "미동의" },
];

export const CUSTOMER_SORTS = [
  { value: "recent", label: "최근 방문순" },
  { value: "spent", label: "누적 결제순" },
  { value: "balance", label: "보유 포인트순" },
  { value: "name", label: "이름순" },
];

export function formatWon(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

export function formatVisitDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatVisitDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fetchCustomerList({
  q = "",
  consent = "",
  sort = "recent",
  limit = 100,
  offset = 0,
} = {}) {
  const params = new URLSearchParams();

  if (q) params.set("q", q);
  if (consent) params.set("consent", consent);
  if (sort) params.set("sort", sort);
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));

  const query = params.toString();

  return apiGet(`/api/crm/customers${query ? `?${query}` : ""}`);
}

export function fetchCustomerProfile(customerId, { visitLimit = 20 } = {}) {
  const params = new URLSearchParams();

  if (visitLimit) params.set("visitLimit", String(visitLimit));

  const query = params.toString();

  return apiGet(
    `/api/crm/customers/${encodeURIComponent(customerId)}${
      query ? `?${query}` : ""
    }`
  );
}

export function updateCustomerProfile(
  customerId,
  { name, nickname, memo, marketingConsent } = {}
) {
  const body = {};

  if (name !== undefined) body.name = name;
  if (nickname !== undefined) body.nickname = nickname;
  if (memo !== undefined) body.memo = memo;
  if (marketingConsent !== undefined) body.marketingConsent = marketingConsent;

  return apiPatch(`/api/crm/customers/${encodeURIComponent(customerId)}`, body);
}

// P8 — 재방문 쿠폰. 발급/취소는 사장(마케팅 관리)만, 조회는 매니저 이상 가능합니다.
export const COUPON_DISCOUNT_TYPES = [
  { value: "AMOUNT", label: "정액 할인" },
  { value: "PERCENT", label: "정률 할인" },
];

export const COUPON_STATUS_LABELS = {
  ACTIVE: "사용 가능",
  USED: "사용 완료",
  EXPIRED: "기간 만료",
  VOID: "취소됨",
};

export function formatCouponDiscount(coupon) {
  const value = Number(coupon?.discountValue || 0);

  if (coupon?.discountType === "PERCENT") return `${value}% 할인`;

  return `${value.toLocaleString("ko-KR")}원 할인`;
}

export function fetchCustomerCoupons(customerId) {
  return apiGet(
    `/api/crm/customers/${encodeURIComponent(String(customerId || ""))}/coupons`
  );
}

export function issueCustomerCoupon(
  customerId,
  {
    title,
    discountType,
    discountValue,
    minAmount = 0,
    expiresInDays = 90,
    memo = "",
  }
) {
  return apiPost(
    `/api/crm/customers/${encodeURIComponent(
      String(customerId || "")
    )}/coupons`,
    { title, discountType, discountValue, minAmount, expiresInDays, memo }
  );
}

export function voidCustomerCoupon(couponId) {
  return apiPost(
    `/api/crm/coupons/${encodeURIComponent(String(couponId || ""))}/void`
  );
}
