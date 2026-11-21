// P8 — 재방문 쿠폰 서비스.
//
// 쿠폰은 전화번호 고객에게 발급하고, 태블릿 결제 화면에서 사용합니다.
// 할인 금액 계산과 사용 검증은 전부 서버에서 합니다(클라이언트 값을 믿지 않습니다).
import { randomUUID } from "node:crypto";

import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";

const MAX_TITLE = 40;
const MAX_MEMO = 200;
const MAX_LIST = 100;
const MAX_DAYS = 365;
const DEFAULT_TITLE = "재방문 쿠폰";

function trimText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function toInt(value, fallback = 0) {
  const number = Number(value ?? fallback);

  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function normalizeDiscountType(value) {
  return String(value ?? "").toUpperCase() === "PERCENT" ? "PERCENT" : "AMOUNT";
}

export function mapCoupon(row) {
  if (!row) return null;

  const now = Date.now();
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const usedAt = row.used_at ? new Date(row.used_at) : null;
  const voidedAt = row.voided_at ? new Date(row.voided_at) : null;
  const expired = Boolean(expiresAt && expiresAt.getTime() <= now);

  return {
    id: row.id,
    customerId: row.customer_id,
    title: row.title || DEFAULT_TITLE,
    discountType: normalizeDiscountType(row.discount_type),
    discountValue: toInt(row.discount_value),
    minAmount: toInt(row.min_amount),
    issuedAt: row.issued_at || null,
    expiresAt: row.expires_at || null,
    usedAt: row.used_at || null,
    usedOrderSheetId: row.used_order_sheet_id || "",
    voidedAt: row.voided_at || null,
    issuedByEmployeeName: row.issued_by_employee_name || "",
    memo: row.memo || "",
    status: voidedAt ? "VOID" : usedAt ? "USED" : expired ? "EXPIRED" : "ACTIVE",
    usable: !voidedAt && !usedAt && !expired,
  };
}

// 정액은 그대로, 정률은 기준 금액의 %(내림)로 계산합니다.
function discountAmountOf({ type, value, baseAmount }) {
  const safeBase = Math.max(0, toInt(baseAmount));
  const safeValue = Math.max(0, toInt(value));

  if (safeBase <= 0 || safeValue <= 0) return 0;

  return type === "PERCENT"
    ? Math.min(safeBase, Math.floor((safeBase * Math.min(safeValue, 100)) / 100))
    : Math.min(safeBase, safeValue);
}

function normalizeIssueInput({ title, discountType, discountValue, minAmount, expiresInDays, expiresAt, memo }) {
  const type = normalizeDiscountType(discountType);
  const value = toInt(discountValue);

  if (value <= 0) {
    throw new HttpError(400, "HJ400", "쿠폰 할인 값을 1 이상으로 입력해 주세요.");
  }

  if (type === "PERCENT" && value > 100) {
    throw new HttpError(400, "HJ400", "정률 할인은 100%까지만 설정할 수 있어요.");
  }

  const safeMinAmount = Math.max(0, toInt(minAmount));

  let expiry = expiresAt ? new Date(expiresAt) : null;

  if (expiry && Number.isNaN(expiry.getTime())) {
    throw new HttpError(400, "HJ400", "쿠폰 만료일을 확인해 주세요.");
  }

  if (!expiry) {
    const days = Math.min(MAX_DAYS, Math.max(1, toInt(expiresInDays, 30)));

    expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  if (expiry.getTime() <= Date.now()) {
    throw new HttpError(400, "HJ400", "쿠폰 만료일은 지금보다 뒤여야 해요.");
  }

  return {
    title: trimText(title, MAX_TITLE) || DEFAULT_TITLE,
    type,
    value,
    minAmount: safeMinAmount,
    expiresAt: expiry,
    memo: trimText(memo, MAX_MEMO),
  };
}

export async function issueCoupon({
  customerId,
  title,
  discountType,
  discountValue,
  minAmount,
  expiresInDays,
  expiresAt,
  memo,
  employee = null,
} = {}) {
  const safeCustomerId = trimText(customerId, 100);

  if (!safeCustomerId) {
    throw new HttpError(400, "HJ400", "쿠폰을 발급할 고객을 선택해 주세요.");
  }

  const input = normalizeIssueInput({
    title,
    discountType,
    discountValue,
    minAmount,
    expiresInDays,
    expiresAt,
    memo,
  });

  const customerResult = await pool.query(
    `select id from public.customers where id = $1`,
    [safeCustomerId]
  );

  if (!customerResult.rows[0]) {
    throw new HttpError(404, "HJ404", "고객 정보를 찾을 수 없어요.");
  }

  const { rows } = await pool.query(
    `insert into public.coupons
       (id, customer_id, title, discount_type, discount_value, min_amount,
        expires_at, issued_by_employee_id, issued_by_employee_name, memo)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      randomUUID(),
      safeCustomerId,
      input.title,
      input.type,
      input.value,
      input.minAmount,
      input.expiresAt,
      employee?.id || null,
      employee?.name || "",
      input.memo,
    ]
  );

  return mapCoupon(rows[0]);
}

export async function voidCoupon({ couponId } = {}) {
  const safeId = trimText(couponId, 100);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "쿠폰 번호가 필요해요.");
  }

  const { rows } = await pool.query(
    `update public.coupons
        set voided_at = now()
      where id = $1
        and used_at is null
        and voided_at is null
      returning *`,
    [safeId]
  );

  if (!rows[0]) {
    throw new HttpError(409, "HJ409", "이미 사용했거나 취소된 쿠폰이에요.");
  }

  return mapCoupon(rows[0]);
}

export async function listCustomerCoupons({ customerId, limit = MAX_LIST } = {}) {
  const safeId = trimText(customerId, 100);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "고객 번호가 필요해요.");
  }

  const { rows } = await pool.query(
    `select *
       from public.coupons
      where customer_id = $1
      order by coalesce(voided_at, used_at) desc nulls first, expires_at asc
      limit $2`,
    [safeId, Math.min(MAX_LIST, Math.max(1, toInt(limit, MAX_LIST)))]
  );

  return rows.map(mapCoupon);
}

// 결제 화면에서 손님 전화번호로 사용 가능한 쿠폰을 찾습니다(만료/사용/취소 제외).
export async function listUsableCouponsByPhone({ phone, baseAmount = 0 } = {}) {
  const safePhone = String(phone ?? "").replace(/[^0-9]/g, "");

  if (!safePhone) return [];

  const { rows } = await pool.query(
    `select c.*
       from public.coupons c
       join public.customers cu on cu.id = c.customer_id
      where cu.phone = $1
        and c.used_at is null
        and c.voided_at is null
        and c.expires_at > now()
      order by c.expires_at asc
      limit $2`,
    [safePhone, MAX_LIST]
  );

  const base = Math.max(0, toInt(baseAmount));

  return rows.map(mapCoupon).map((coupon) => ({
    ...coupon,
    discountAmount: discountAmountOf({
      type: coupon.discountType,
      value: coupon.discountValue,
      baseAmount: base,
    }),
  }));
}

// 결제 트랜잭션 안에서 쿠폰을 검증하고 사용 처리합니다.
// 반환값의 discounts 는 기존 할인 목록 뒤에 붙일 수 있는 형태입니다.
export async function redeemCouponsForPayment(client, {
  couponIds,
  customerId,
  baseAmount,
  orderSheetId,
  paymentId = null,
} = {}) {
  const ids = Array.isArray(couponIds)
    ? [...new Set(couponIds.map((id) => trimText(id, 100)).filter(Boolean))].slice(0, 5)
    : [];

  if (ids.length === 0) {
    return { discounts: [], coupons: [], total: 0 };
  }

  if (!customerId) {
    throw new HttpError(
      400,
      "HJ400",
      "쿠폰을 사용하려면 고객 전화번호를 먼저 입력해 주세요."
    );
  }

  const { rows } = await client.query(
    `select *
       from public.coupons
      where id = any($1::text[])
      order by expires_at asc
      for update`,
    [ids]
  );

  if (rows.length !== ids.length) {
    throw new HttpError(404, "HJ404", "사용할 수 없는 쿠폰이 있어요.");
  }

  const base = Math.max(0, toInt(baseAmount));

  if (base <= 0) {
    throw new HttpError(400, "HJ400", "쿠폰을 적용할 결제 금액이 없어요.");
  }

  const coupons = [];
  const discounts = [];
  let total = 0;

  for (const row of rows) {
    const coupon = mapCoupon(row);

    if (coupon.customerId !== customerId) {
      throw new HttpError(403, "HJ403", "이 고객의 쿠폰이 아니에요.");
    }

    if (!coupon.usable) {
      throw new HttpError(409, "HJ409", "이미 사용했거나 만료된 쿠폰이에요.");
    }

    if (coupon.minAmount > 0 && base < coupon.minAmount) {
      throw new HttpError(
        400,
        "HJ400",
        `${coupon.minAmount.toLocaleString("ko-KR")}원 이상 결제할 때 쓸 수 있는 쿠폰이에요.`
      );
    }

    const amount = discountAmountOf({
      type: coupon.discountType,
      value: coupon.discountValue,
      baseAmount: base,
    });

    if (amount <= 0) continue;

    total += amount;
    coupons.push({ ...coupon, amount });
    discounts.push({
      title: coupon.title,
      type: coupon.discountType,
      value: coupon.discountValue,
    });
  }

  if (coupons.length === 0) {
    return { discounts: [], coupons: [], total: 0 };
  }

  await client.query(
    `update public.coupons
        set used_at = now(),
            used_order_sheet_id = $2,
            used_payment_id = $3
      where id = any($1::text[])`,
    [coupons.map((coupon) => coupon.id), orderSheetId || null, paymentId || null]
  );

  return {
    discounts,
    coupons: coupons.map((coupon) => ({
      id: coupon.id,
      title: coupon.title,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      amount: coupon.amount,
    })),
    total: Math.min(base, total),
  };
}
