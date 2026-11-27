// P13 — 전자담배 예약(픽업) 프런트 도우미.
//
// 손님 화면과 관리자 화면이 함께 씁니다. 가격은 항상 서버가 다시 계산하므로
// 여기서는 표시용 포맷과 라벨만 다룹니다.
import { shallowRef } from "vue";

import { apiGet, apiPatch, apiPost, apiRequest } from "@/lib/api";

// 예약 완료 화면으로 넘길 직전 응답. 새로고침하면 사라지므로
// 완료 화면에서는 값이 없으면 예약번호 조회를 안내합니다.
export const lastReservation = shallowRef(null);

export const RESERVATION_STATUS_LABELS = {
  REQUESTED: "접수",
  CONFIRMED: "확정",
  READY: "준비완료",
  PICKED_UP: "픽업완료",
  CANCELED: "취소",
  NO_SHOW: "노쇼",
};

export const RESERVATION_STATUS_TONES = {
  REQUESTED: "pending",
  CONFIRMED: "active",
  READY: "ready",
  PICKED_UP: "done",
  CANCELED: "muted",
  NO_SHOW: "warn",
};

export const RESERVATION_STATUSES = Object.keys(RESERVATION_STATUS_LABELS);

// 손님이 스스로 취소할 수 있는 상태.
export const CUSTOMER_CANCELABLE_STATUSES = ["REQUESTED", "CONFIRMED"];

export function formatShopWon(value) {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number)) return "0원";

  return `${Math.round(number).toLocaleString("ko-KR")}원`;
}

export function formatShopDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatShopDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

// 픽업 희망 시각을 "오늘 19:30" 처럼 짧게 보여줍니다.
export function formatShopPickup(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  const now = new Date();
  const dayKey = (target) =>
    `${target.getFullYear()}-${target.getMonth()}-${target.getDate()}`;
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const time = date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (dayKey(date) === dayKey(now)) return `오늘 ${time}`;
  if (dayKey(date) === dayKey(tomorrow)) return `내일 ${time}`;

  return `${date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  })} ${time}`;
}

// <input type="datetime-local"> 에 넣을 수 있는 문자열로 바꿉니다.
export function toDateTimeLocalValue(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 영업 기준(15:00 ~ 익일 05:00)에 맞춰 픽업 시간 후보를 30분 간격으로 만듭니다.
// 서버는 20분 이후 ~ 60일 이내만 검사하므로, 여기서는 손님이 고르기 편한 값만 제공합니다.
export function buildPickupSlots({ days = 3, from = new Date() } = {}) {
  const slots = [];
  const minTime = from.getTime() + 30 * 60 * 1000;
  const base = new Date(from.getTime());

  base.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const day = new Date(base.getTime() + dayOffset * 24 * 60 * 60 * 1000);

    // 15:00 ~ 23:30, 00:00 ~ 05:00(익일) 슬롯을 하루 단위로 만듭니다.
    for (let minutes = 15 * 60; minutes <= 24 * 60 + 5 * 60; minutes += 30) {
      const slot = new Date(day.getTime() + minutes * 60 * 1000);

      if (slot.getTime() < minTime) continue;

      slots.push(slot);
    }
  }

  return slots.slice(0, 48);
}

// ── 손님용 ────────────────────────────────────────────────────────────────

export async function fetchShopCatalog(params = {}) {
  const query = new URLSearchParams();

  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.q) query.set("q", params.q);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await apiGet(`/api/public/shop/products${suffix}`);

  return {
    categories: Array.isArray(data?.categories) ? data.categories : [],
    products: Array.isArray(data?.products) ? data.products : [],
  };
}

export async function fetchShopProduct(productId) {
  const data = await apiGet(
    `/api/public/shop/products/${encodeURIComponent(productId)}`
  );

  return data?.product ?? null;
}

export async function createReservation(payload) {
  const data = await apiPost("/api/public/reservations", payload);

  return data?.reservation ?? null;
}

export async function lookupReservation({ reservationNo, phone }) {
  const data = await apiPost("/api/public/reservations/lookup", {
    reservationNo: String(reservationNo ?? "").trim(),
    phone: String(phone ?? "").trim(),
  });

  return data?.reservation ?? null;
}

export async function cancelReservation({ reservationNo, phone, reason = "" }) {
  const data = await apiPost("/api/public/reservations/cancel", {
    reservationNo,
    phone,
    reason,
  });

  return data?.reservation ?? null;
}

// ── 관리자용 ──────────────────────────────────────────────────────────────

export async function fetchShopCategories({ includeInactive = false } = {}) {
  const data = await apiGet(
    `/api/shop/categories${includeInactive ? "?includeInactive=true" : ""}`
  );

  return Array.isArray(data?.categories) ? data.categories : [];
}

export async function saveShopCategory(categoryId, payload) {
  const data = categoryId
    ? await apiPatch(
        `/api/shop/categories/${encodeURIComponent(categoryId)}`,
        payload
      )
    : await apiPost("/api/shop/categories", payload);

  return data?.category ?? null;
}

export async function deleteShopCategory(categoryId) {
  return apiRequest(`/api/shop/categories/${encodeURIComponent(categoryId)}`, {
    method: "DELETE",
  });
}

export async function fetchShopProducts({
  includeInactive = true,
  categoryId = "",
  q = "",
} = {}) {
  const query = new URLSearchParams();

  if (includeInactive) query.set("includeInactive", "true");
  if (categoryId) query.set("categoryId", categoryId);
  if (q) query.set("q", q);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await apiGet(`/api/shop/products${suffix}`);

  return Array.isArray(data?.products) ? data.products : [];
}

export async function saveShopProduct(productId, payload) {
  const data = productId
    ? await apiPatch(
        `/api/shop/products/${encodeURIComponent(productId)}`,
        payload
      )
    : await apiPost("/api/shop/products", payload);

  return data?.product ?? null;
}

export async function deleteShopProduct(productId) {
  return apiRequest(`/api/shop/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
}

export async function fetchReservations({
  status = "",
  from = "",
  to = "",
  q = "",
} = {}) {
  const query = new URLSearchParams();

  if (status) query.set("status", status);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (q) query.set("q", q);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await apiGet(`/api/shop/reservations${suffix}`);

  return Array.isArray(data?.reservations) ? data.reservations : [];
}

export async function fetchReservationSummary(date = "") {
  const data = await apiGet(
    `/api/shop/summary${date ? `?date=${encodeURIComponent(date)}` : ""}`
  );

  return data?.summary ?? { date, counts: {}, total: 0, adultCheckPending: 0 };
}

export async function updateReservation(reservationId, payload) {
  const data = await apiPatch(
    `/api/shop/reservations/${encodeURIComponent(reservationId)}`,
    payload
  );

  return data?.reservation ?? null;
}
