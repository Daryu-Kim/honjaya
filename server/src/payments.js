// P3 — 결제 원장 서비스.
//
// 규칙
//   * 결제/환불 금액은 항상 서버가 계산합니다. 클라이언트가 보낸 최종 금액은 신뢰하지 않습니다.
//   * 결제 1건 = payments 1행. 한 번에 여러 수단/여러 명이 내면 그만큼 행이 늘어납니다.
//   * 주문서 상태(OPEN/PARTIAL/CLOSED, payment_status, payment_splits)는 화면 호환을 위해 함께 갱신합니다.
import { randomUUID } from "node:crypto";

import { revokeGuestSessionsForSheet } from "./auth/guestSessions.js";
import { toBusinessDate } from "./businessDay.js";
import { grantMarketingConsent } from "./crm.js";
import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";
import {
  clawbackForRefund,
  earnPointsForPayment,
  ensureCustomer,
  redeemPointsForPayment,
} from "./points.js";

export { toBusinessDate };

export const PAYMENT_METHODS = [
  "CARD",
  "CASH",
  "BANK",
  "KAKAO_PAY",
  "NAVER_PAY",
  "GIFT_CARD",
  "OTHER",
];

const METHOD_ALIASES = {
  TRANSFER: "BANK",
  ACCOUNT: "BANK",
  CARD_PAY: "CARD",
  KAKAO: "KAKAO_PAY",
  NAVER: "NAVER_PAY",
  GIFT: "GIFT_CARD",
};

const MAX_ENTRIES = 20;
const MAX_PAYER_LABEL = 24;
const MAX_MEMO = 200;
const MAX_REASON = 200;

function trimText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeMethod(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const method = METHOD_ALIASES[raw] || raw;

  if (!PAYMENT_METHODS.includes(method)) {
    throw new HttpError(400, "HJ400", "결제 수단을 확인해 주세요.");
  }

  return method;
}

function readNonNegativeInt(value, message) {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    throw new HttpError(400, "HJ400", message);
  }

  return number;
}

// 클라이언트가 보낸 할인 내역으로 할인 합계를 서버에서 다시 계산합니다.
function computeDiscountTotal(originalAmount, discounts) {
  const list = Array.isArray(discounts) ? discounts.slice(0, 10) : [];
  const normalized = [];
  let total = 0;

  for (const discount of list) {
    const type = discount?.type === "PERCENT" ? "PERCENT" : "AMOUNT";
    const value = Number(discount?.value ?? 0);

    if (!Number.isFinite(value) || value <= 0) continue;

    const amount =
      type === "PERCENT"
        ? Math.floor((originalAmount * Math.min(value, 100)) / 100)
        : Math.floor(value);

    if (amount <= 0) continue;

    total += amount;
    normalized.push({
      title: trimText(discount?.title, 40),
      type,
      value,
      amount,
    });
  }

  return { discounts: normalized, total: Math.min(originalAmount, total) };
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new HttpError(400, "HJ400", "결제 수단별 금액을 1개 이상 입력해 주세요.");
  }

  if (entries.length > MAX_ENTRIES) {
    throw new HttpError(400, "HJ400", "결제 수단은 20개까지 나눌 수 있어요.");
  }

  const normalized = entries
    .map((entry) => ({
      method: normalizeMethod(entry?.method),
      amount: readNonNegativeInt(entry?.amount, "결제 금액을 확인해 주세요."),
      payerLabel: trimText(entry?.payerLabel, MAX_PAYER_LABEL),
    }))
    .filter((entry) => entry.amount > 0);

  if (normalized.length === 0) {
    throw new HttpError(400, "HJ400", "결제 금액을 1원 이상 입력해 주세요.");
  }

  return normalized;
}

function mapPaymentRow(row) {
  const refundedAmount = Number(row.refunded_amount || 0);

  return {
    id: row.id,
    orderSheetId: row.order_sheet_id,
    tableNumber: row.table_number || "",
    businessDate: row.business_date,
    amount: Number(row.amount || 0),
    refundedAmount,
    netAmount: Number(row.amount || 0) - refundedAmount,
    method: row.method,
    payerLabel: row.payer_label || "",
    employeeName: row.employee_name || "",
    memo: row.memo || "",
    occurredAt: row.occurred_at,
  };
}

function mapRefundRow(row) {
  return {
    id: row.id,
    paymentId: row.payment_id,
    orderSheetId: row.order_sheet_id,
    businessDate: row.business_date,
    amount: Number(row.amount || 0),
    method: row.method || "",
    reason: row.reason || "",
    employeeName: row.employee_name || "",
    occurredAt: row.occurred_at,
  };
}

async function readSheetForUpdate(client, orderSheetId) {
  const { rows } = await client.query(
    `select id, table_number, display_name, status, payment_status,
            total_amount, original_amount, discount_total, paid_amount,
            paid_at, closed_at
       from public.order_sheets
      where id = $1
      for update`,
    [orderSheetId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "주문서를 찾을 수 없어요.");
  }

  return rows[0];
}

async function readSettledAmount(client, orderSheetId) {
  const { rows } = await client.query(
    `select
       coalesce((select sum(amount) from public.payments where order_sheet_id = $1), 0)::int as paid,
       coalesce((select sum(r.amount)
                   from public.refunds r
                   join public.payments p on p.id = r.payment_id
                  where p.order_sheet_id = $1), 0)::int as refunded`,
    [orderSheetId]
  );

  const paid = Number(rows[0]?.paid || 0);
  const refunded = Number(rows[0]?.refunded || 0);

  return { paid, refunded, settled: paid - refunded };
}

// 주문 단위 배분. 만든 순서대로 채웁니다(FIFO).
async function allocatePaymentAmount(client, { paymentId, orderSheetId, amount }) {
  const { rows: orders } = await client.query(
    `select id, total_price
       from public.orders
      where order_sheet_id = $1
      order by created_at asc, id asc`,
    [orderSheetId]
  );

  if (orders.length === 0) {
    await client.query(
      `insert into public.payment_allocations (id, payment_id, order_id, amount)
       values ($1, $2, null, $3)`,
      [randomUUID(), paymentId, amount]
    );
    return;
  }

  const { rows: allocatedRows } = await client.query(
    `select order_id, sum(amount)::int as amount
       from public.payment_allocations
      where order_id = any($1::text[])
      group by order_id`,
    [orders.map((order) => order.id)]
  );

  const allocatedByOrder = new Map(
    allocatedRows.map((row) => [row.order_id, Number(row.amount || 0)])
  );

  let left = amount;

  for (const order of orders) {
    if (left <= 0) break;

    const orderTotal = Number(order.total_price || 0);
    const alreadyAllocated = allocatedByOrder.get(order.id) || 0;
    const open = Math.max(0, orderTotal - alreadyAllocated);

    if (open <= 0) continue;

    const chunk = Math.min(open, left);

    await client.query(
      `insert into public.payment_allocations (id, payment_id, order_id, amount)
       values ($1, $2, $3, $4)`,
      [randomUUID(), paymentId, order.id, chunk]
    );

    left -= chunk;
  }

  if (left > 0) {
    await client.query(
      `insert into public.payment_allocations (id, payment_id, order_id, amount)
       values ($1, $2, null, $3)`,
      [randomUUID(), paymentId, left]
    );
  }
}

function paymentStatusFor(totalAmount, settled) {
  if (settled <= 0) return "UNPAID";
  if (settled >= totalAmount) return "COMPLETED";
  return "PARTIAL";
}

async function syncSheetPaymentState(client, { orderSheetId, totalAmount, settled }) {
  const { rows } = await client.query(
    `select method, sum(amount)::int as amount
       from public.payments
      where order_sheet_id = $1
      group by method
      order by method`,
    [orderSheetId]
  );

  const splits = rows
    .map((row) => ({ method: row.method, amount: Number(row.amount || 0) }))
    .filter((split) => split.amount > 0);

  const paymentMethod =
    splits.length === 0 ? "" : splits.length === 1 ? splits[0].method : "MIXED";

  const paymentStatus = paymentStatusFor(totalAmount, settled);

  await client.query(
    `update public.order_sheets
        set payment_status = $2,
            payment_method = $3,
            payment_splits = $4::jsonb,
            paid_amount = $5,
            paid_at = case when $2 = 'COMPLETED' then coalesce(paid_at, now()) else paid_at end,
            total_amount = $6,
            updated_at = now()
      where id = $1`,
    [orderSheetId, paymentStatus, paymentMethod, JSON.stringify(splits), settled, totalAmount]
  );

  return { paymentStatus, paymentMethod, splits };
}

export async function getSheetLedger(orderSheetId, { client = pool } = {}) {
  const safeId = trimText(orderSheetId, 100);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "주문서 번호가 필요해요.");
  }

  const { rows: sheetRows } = await client.query(
    `select id, table_number, display_name, status, payment_status, payment_method,
            total_amount, original_amount, discount_total, discounts, paid_amount,
            points_used, paid_at, closed_at
       from public.order_sheets
      where id = $1`,
    [safeId]
  );

  const sheet = sheetRows[0];

  if (!sheet) {
    throw new HttpError(404, "HJ404", "주문서를 찾을 수 없어요.");
  }

  const { rows: paymentRows } = await client.query(
    `select p.*,
            coalesce((select sum(r.amount) from public.refunds r where r.payment_id = p.id), 0)::int
              as refunded_amount
       from public.payments p
      where p.order_sheet_id = $1
      order by p.occurred_at asc, p.id asc`,
    [safeId]
  );

  const { rows: refundRows } = await client.query(
    `select * from public.refunds where order_sheet_id = $1 order by occurred_at asc, id asc`,
    [safeId]
  );

  const totalAmount = Number(sheet.total_amount || 0);
  const paid = paymentRows.reduce((acc, row) => acc + Number(row.amount || 0), 0);
  const refunded = refundRows.reduce((acc, row) => acc + Number(row.amount || 0), 0);
  const settled = paid - refunded;

  return {
    orderSheetId: sheet.id,
    tableNumber: sheet.table_number || "",
    displayName: sheet.display_name || "",
    status: sheet.status,
    isClosed: sheet.status === "CLOSED",
    totalAmount,
    originalAmount: Number(sheet.original_amount ?? totalAmount),
    discountTotal: Number(sheet.discount_total || 0),
    discounts: Array.isArray(sheet.discounts) ? sheet.discounts : [],
    pointsUsed: Number(sheet.points_used || 0),
    paidAmount: paid,
    refundedAmount: refunded,
    settledAmount: settled,
    remainingAmount: Math.max(0, totalAmount - settled),
    changeAmount: Math.max(0, settled - totalAmount),
    paymentStatus: sheet.payment_status,
    paymentMethod: sheet.payment_method || "",
    paidAt: sheet.paid_at,
    closedAt: sheet.closed_at,
    payments: paymentRows.map(mapPaymentRow),
    refunds: refundRows.map(mapRefundRow),
  };
}

export async function recordPayment({
  orderSheetId,
  originalAmount = null,
  discounts = null,
  entries,
  memo = "",
  close = true,
  customerPhone = "",
  customerName = "",
  marketingConsent = false,
  pointsUsed = 0,
  employee = null,
  ip = "",
  log = null,
}) {
  const safeId = trimText(orderSheetId, 100);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "주문서 번호가 필요해요.");
  }

  const normalizedEntries = normalizeEntries(entries);
  const entryTotal = normalizedEntries.reduce((acc, entry) => acc + entry.amount, 0);
  const safeMemo = trimText(memo, MAX_MEMO);
  const occurredAt = new Date();
  const businessDate = toBusinessDate(occurredAt);

  const client = await pool.connect();

  try {
    await client.query("begin");

    const sheet = await readSheetForUpdate(client, safeId);

    if (sheet.status === "CLOSED") {
      throw new HttpError(409, "HJ409", "이미 마감된 주문서예요.");
    }

    let totalAmount = Number(sheet.total_amount || 0);
    let grossAmount = null;

    if (originalAmount !== null && originalAmount !== undefined) {
      const base = readNonNegativeInt(originalAmount, "주문 금액을 확인해 주세요.");
      const computed = computeDiscountTotal(base, discounts);

      grossAmount = Math.max(0, base - computed.total);
      totalAmount = grossAmount;

      await client.query(
        `update public.order_sheets
            set original_amount = $2,
                discount_total = $3,
                discounts = $4::jsonb,
                total_amount = $5,
                updated_at = now()
          where id = $1`,
        [safeId, base, computed.total, JSON.stringify(computed.discounts), grossAmount]
      );
    }

    // 포인트는 할인 다음 단계에서 차감합니다(사용/적립 모두 서버가 검증).
    const requestedPoints = Number(pointsUsed || 0);
    const customerPhoneText = String(customerPhone || "").trim();
    let customer = null;

    if (requestedPoints > 0) {
      if (!customerPhoneText) {
        throw new HttpError(400, "HJ400", "포인트를 사용하려면 고객 전화번호가 필요해요.");
      }

      customer = await ensureCustomer(client, {
        phone: customerPhoneText,
        name: customerName,
      });

      const paymentBase = grossAmount ?? totalAmount + Number(sheet.points_used || 0);

      await redeemPointsForPayment(client, {
        customerId: customer.id,
        points: requestedPoints,
        paymentAmount: paymentBase,
        orderSheetId: safeId,
        employee,
        occurredAt,
      });

      totalAmount = Math.max(0, totalAmount - requestedPoints);

      await client.query(
        `update public.order_sheets
            set total_amount = $2,
                points_used = points_used + $3,
                updated_at = now()
          where id = $1`,
        [safeId, totalAmount, requestedPoints]
      );
    } else if (customerPhoneText) {
      customer = await ensureCustomer(client, {
        phone: customerPhoneText,
        name: customerName,
      });
    }

    if (totalAmount <= 0) {
      throw new HttpError(400, "HJ400", "결제할 금액이 없어요.");
    }

    // 손님이 화면에서 마케팅 수신에 동의한 경우에만 켭니다(철회는 관리자 화면에서).
    if (customer && marketingConsent === true) {
      await grantMarketingConsent(client, customer.id);
    }

    const { settled } = await readSettledAmount(client, safeId);
    const remainingBefore = totalAmount - settled;

    if (remainingBefore <= 0) {
      throw new HttpError(409, "HJ409", "이미 전액 결제된 주문서예요.");
    }

    if (entryTotal > remainingBefore) {
      throw new HttpError(
        400,
        "HJ400",
        `결제 금액이 남은 금액(${remainingBefore.toLocaleString("ko-KR")}원)을 넘었어요.`
      );
    }

    const insertedPaymentIds = [];

    for (const entry of normalizedEntries) {
      const paymentId = randomUUID();
      insertedPaymentIds.push(paymentId);

      await client.query(
        `insert into public.payments
           (id, order_sheet_id, table_number, business_date, amount, method,
            payer_label, guest_session_id, employee_id, employee_name, memo, occurred_at,
            customer_id)
         values ($1, $2, $3, $4::date, $5, $6, $7, null, $8, $9, $10, $11, $12)`,
        [
          paymentId,
          safeId,
          sheet.table_number || "",
          businessDate,
          entry.amount,
          entry.method,
          entry.payerLabel,
          employee?.id || null,
          employee?.name || "",
          safeMemo,
          occurredAt,
          customer?.id || null,
        ]
      );

      await allocatePaymentAmount(client, {
        paymentId,
        orderSheetId: safeId,
        amount: entry.amount,
      });
    }

    // 적립은 할인·포인트 차감 후 실제로 받은 금액 기준입니다.
    let pointsEarned = 0;
    let pointsBalanceAfter = null;

    if (customer) {
      const earned = await earnPointsForPayment(client, {
        customerId: customer.id,
        amount: entryTotal,
        orderSheetId: safeId,
        paymentId: insertedPaymentIds[0] || null,
        employee,
        occurredAt,
      });

      pointsEarned = earned.points;
      pointsBalanceAfter = earned.balanceAfter;
    }

    const settledAfter = settled + entryTotal;
    const remainingAfter = Math.max(0, totalAmount - settledAfter);
    const state = await syncSheetPaymentState(client, {
      orderSheetId: safeId,
      totalAmount,
      settled: settledAfter,
    });

    let closed = false;

    if (remainingAfter <= 0 && close !== false) {
      await client.query(
        `update public.order_sheets
            set status = 'CLOSED',
                closed_at = coalesce(closed_at, now()),
                updated_at = now()
          where id = $1`,
        [safeId]
      );

      await client.query(
        `delete from public.active_order_sheets where order_sheet_id = $1`,
        [safeId]
      );

      closed = true;
    }

    await client.query("commit");

    if (closed) {
      try {
        await revokeGuestSessionsForSheet(safeId);
      } catch (error) {
        log?.warn?.(`[payments] 손님 세션 정리 실패: ${error.message}`);
      }
    }

    const ledger = await getSheetLedger(safeId);

    return {
      ...ledger,
      justPaidAmount: entryTotal,
      remainingAfter,
      closed,
      paymentStatus: state.paymentStatus,
      paymentMethod: state.paymentMethod,
      pointsUsed: requestedPoints,
      pointsEarned,
      pointsBalance: pointsBalanceAfter,
      customer: customer
        ? {
            id: customer.id,
            phone: customer.phone,
            name: customer.name || "",
            marketingConsent: Boolean(customer.marketing_consent) || marketingConsent === true,
          }
        : null,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function refundPayment({
  paymentId,
  amount,
  reason = "",
  employee = null,
  log = null,
}) {
  const safePaymentId = trimText(paymentId, 100);
  const safeReason = trimText(reason, MAX_REASON);
  const refundAmount = readNonNegativeInt(amount, "환불 금액을 확인해 주세요.");
  const occurredAt = new Date();

  if (!safePaymentId) {
    throw new HttpError(400, "HJ400", "결제 번호가 필요해요.");
  }

  if (refundAmount <= 0) {
    throw new HttpError(400, "HJ400", "환불 금액을 1원 이상 입력해 주세요.");
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows: paymentRows } = await client.query(
      `select * from public.payments where id = $1 for update`,
      [safePaymentId]
    );

    const payment = paymentRows[0];

    if (!payment) {
      throw new HttpError(404, "HJ404", "결제 내역을 찾을 수 없어요.");
    }

    const { rows: refundedRows } = await client.query(
      `select coalesce(sum(amount), 0)::int as amount from public.refunds where payment_id = $1`,
      [safePaymentId]
    );

    const alreadyRefunded = Number(refundedRows[0]?.amount || 0);
    const available = Number(payment.amount || 0) - alreadyRefunded;

    if (refundAmount > available) {
      throw new HttpError(
        400,
        "HJ400",
        `환불 가능한 금액은 ${available.toLocaleString("ko-KR")}원이에요.`
      );
    }

    const refundId = randomUUID();

    await client.query(
      `insert into public.refunds
         (id, payment_id, order_sheet_id, business_date, amount, method, reason,
          employee_id, employee_name, occurred_at)
       values ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10)`,
      [
        refundId,
        safePaymentId,
        payment.order_sheet_id,
        toBusinessDate(occurredAt),
        refundAmount,
        payment.method,
        safeReason,
        employee?.id || null,
        employee?.name || "",
        occurredAt,
      ]
    );

    // 환불한 만큼 적립 포인트를 회수합니다(잔액 범위 안에서만).
    // 포인트 회수 실패가 환불 자체를 막지는 않도록 savepoint 로 분리합니다.
    let pointsReclaimed = 0;

    await client.query("savepoint points_clawback");

    try {
      const reclaimed = await clawbackForRefund(client, {
        orderSheetId: payment.order_sheet_id,
        refundAmount,
        refundId,
        employee,
        occurredAt,
      });

      pointsReclaimed = reclaimed ? Math.abs(Number(reclaimed.points || 0)) : 0;
      await client.query("release savepoint points_clawback");
    } catch (error) {
      await client.query("rollback to savepoint points_clawback").catch(() => {});
      log?.warn?.(`[payments] 포인트 회수 실패: ${error.message}`);
    }

    // 배분 내역도 되돌립니다(최근 것부터).
    let left = refundAmount;
    const { rows: allocationRows } = await client.query(
      `select id, amount from public.payment_allocations
        where payment_id = $1
        order by created_at desc, id desc`,
      [safePaymentId]
    );

    for (const allocation of allocationRows) {
      if (left <= 0) break;

      const allocationAmount = Number(allocation.amount || 0);

      if (allocationAmount <= left) {
        await client.query(`delete from public.payment_allocations where id = $1`, [
          allocation.id,
        ]);
        left -= allocationAmount;
      } else {
        await client.query(
          `update public.payment_allocations set amount = amount - $2 where id = $1`,
          [allocation.id, left]
        );
        left = 0;
      }
    }

    const sheet = await readSheetForUpdate(client, payment.order_sheet_id);
    const { settled } = await readSettledAmount(client, payment.order_sheet_id);

    await syncSheetPaymentState(client, {
      orderSheetId: payment.order_sheet_id,
      totalAmount: Number(sheet.total_amount || 0),
      settled,
    });

    await client.query("commit");

    const ledger = await getSheetLedger(payment.order_sheet_id);

    return { ...ledger, justRefundedAmount: refundAmount, pointsReclaimed };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// 관리자 결제 원장 목록(기간 조회).
export async function listPayments({ from = null, to = null, limit = 200 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const { rows: paymentRows } = await pool.query(
    `select p.*,
            coalesce((select sum(r.amount) from public.refunds r where r.payment_id = p.id), 0)::int
              as refunded_amount
       from public.payments p
      where ($1::date is null or p.business_date >= $1::date)
        and ($2::date is null or p.business_date <= $2::date)
      order by p.occurred_at desc, p.id desc
      limit $3`,
    [from, to, safeLimit]
  );

  const { rows: refundRows } = await pool.query(
    `select r.*, p.method as payment_method
       from public.refunds r
       join public.payments p on p.id = r.payment_id
      where ($1::date is null or r.business_date >= $1::date)
        and ($2::date is null or r.business_date <= $2::date)
      order by r.occurred_at desc, r.id desc
      limit $3`,
    [from, to, safeLimit]
  );

  const methodTotals = new Map();

  for (const row of paymentRows) {
    const method = row.method || "OTHER";
    const current = methodTotals.get(method) || { method, amount: 0, refunded: 0 };
    current.amount += Number(row.amount || 0);
    current.refunded += Number(row.refunded_amount || 0);
    methodTotals.set(method, current);
  }

  return {
    payments: paymentRows.map(mapPaymentRow),
    refunds: refundRows.map(mapRefundRow),
    methodTotals: [...methodTotals.values()].sort((a, b) => b.amount - a.amount),
    totalPaid: paymentRows.reduce((acc, row) => acc + Number(row.amount || 0), 0),
    totalRefunded: paymentRows.reduce(
      (acc, row) => acc + Number(row.refunded_amount || 0),
      0
    ),
  };
}
