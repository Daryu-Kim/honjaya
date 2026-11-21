// P7 — 마케팅(문자/알림톡) API 호출 도우미.
//
// 회원 식별자는 휴대폰 번호입니다. 카카오 로그인은 쓰지 않습니다.
import { apiGet, apiPost, apiText } from "@/lib/api";

export const CAMPAIGN_STATUS_LABELS = {
  DRAFT: "작성 중",
  SENT: "발송함",
  CANCELED: "취소",
};

export const LOG_STATUS_LABELS = {
  PENDING: "대기",
  SENT: "발송 완료",
  FAILED: "실패",
  SKIPPED: "건너뜀",
};

export function formatNumber(value) {
  return Math.round(Number(value || 0)).toLocaleString("ko-KR");
}

export function formatDateTime(value) {
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

export function fetchMarketingSettings() {
  return apiGet("/api/marketing/settings");
}

export function fetchSegments() {
  return apiGet("/api/marketing/segments");
}

export function fetchAudience(segment) {
  const params = new URLSearchParams({ segment: segment || "CONSENTED" });

  return apiGet(`/api/marketing/audience?${params.toString()}`);
}

export function exportAudienceCsv(segment) {
  const params = new URLSearchParams({ segment: segment || "CONSENTED" });

  return apiText(`/api/marketing/audience/export?${params.toString()}`);
}

export function fetchCampaigns({ limit = 30, offset = 0 } = {}) {
  const params = new URLSearchParams();

  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));

  const query = params.toString();

  return apiGet(`/api/marketing/campaigns${query ? `?${query}` : ""}`);
}

export function fetchCampaign(campaignId) {
  return apiGet(`/api/marketing/campaigns/${encodeURIComponent(campaignId)}`);
}

export function createCampaign({ title, body, channel, segment }) {
  return apiPost("/api/marketing/campaigns", { title, body, channel, segment });
}

export function sendCampaign(campaignId) {
  return apiPost(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/send`,
    {}
  );
}

export function retryCampaign(campaignId) {
  return apiPost(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/retry`,
    {}
  );
}

export function fetchUnsubscribeInfo(token) {
  const params = new URLSearchParams({ token: token || "" });

  return apiGet(`/api/marketing/unsubscribe?${params.toString()}`);
}

export function requestUnsubscribe(token) {
  return apiPost("/api/marketing/unsubscribe", { token });
}

// 문자 본문에 넣을 수신거부 링크. 실제 발송 시에도 같은 형식을 씁니다.
export function buildUnsubscribeUrl(origin, token) {
  const base = String(origin || "").replace(/\/+$/, "");

  return `${base}/unsubscribe?token=${encodeURIComponent(token || "")}`;
}
