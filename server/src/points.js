// P5 — 포인트 원장 서비스.
//
// 규칙
//   * 적립 = 결제 금액의 1% (원 단위 버림). 유효기간 3개월(한국시간 그날 끝).
//   * 사용 = 1,000P 이상 / 1,000P 단위 / 결제 금액 3만원 이상일 때만.
//   * 잔액 = point_ledger.points 합계. 어느 적립 건에서 빠졌는지는 point_allocations 에 남깁니다(FEFO).
//   * 만료는 조회/사용 시점에 EXPIRE 행으로 확정합니다. 크론이 없어도 잔액이 정확합니다.
//   * 금액/포인트 검증은 항상 서버에서 합니다.
import { randomUUID } from "node:crypto";

import { toBusinessDate } from "./businessDay.js";
import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";

export const POINT_RULES = {
  earnRate: 0.01,
  minRedeem: 1000,
  redeemStep: 1000,
  redeemMinPayment: 30000,
  expiryMonths: 3,
};

const MAX_REASON = 200;
const MAX_NAME = 30;
const MAX_MEMO = 200;
const MAX_HISTORY = 50;
const EXPIRING_SOON_DAYS = 30;

function trimText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

// 010-1234-5678 / 01012345678 / 1012345678 → 01012345678
export function normalizePhone(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");

  if (!digits) {
    throw new HttpError(400, "HJ400", "전화번호를 입력해 주세요.");
  }

  const phone = digits.length === 10 && digits.startsWith("10") ? `0${digits}` : digits;

  if (!/^01[016789]\d{7,8}$/.test(phone)) {
    throw new HttpError(400, "HJ400", "휴대폰 번호를 확인해 주세요.");
  }

  return phone;
}

export function formatPhone(value) {
  const phone = String(value ?? "").replace(/[^0-9]/g, "");

  if (phone.length === 11) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
  }

  if (phone.length === 10) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  }

  return phone;
}

export function pointsForAmount(amount) {
  const base = Number(amount || 0);

  if (!Number.isFinite(base) || base <= 0) return 0;

  return Math.floor(base * POINT_RULES.earnRate);
}

// 3개월 뒤 같은 날짜의 한국시간 23:59:59.999
export function expiryFor(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const target = new Date(
    Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth() + POINT_RULES.expiryMonths,
      kst.getUTCDate()
    )
  );

  return new Date(target.getTime() + 24 * 60 * 60 * 1000 - 1 - 9 * 60 * 60 * 1000);
}

// 이번 결제에서 쓸 수 있는 최대 포인트(1,000P 단위로 내림).
export function maxRedeemablePoints({ balance = 0, paymentAmount = 0 } = {}) {
  if (Number(paymentAmount || 0) < POINT_RULES.redeemMinPayment) return 0;

  const usable = Math.min(Number(balance || 0), Number(paymentAmount || 0));

  return Math.max(
    0,
    Math.floor(usable / POINT_RULES.redeemStep) * POINT_RULES.redeemStep
  );
}

function mapCustomer(row) {
  if (!row) return null;

  return {
    id: row.id,
    phone: row.phone,
    phoneText: formatPhone(row.phone),
    name: row.name || "",
    memo: row.memo || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapLedgerRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerPhone: row.phone || "",
    customerName: row.name || "",
    entryType: row.entry_type,
    points: Number(row.points || 0),
    balanceAfter: Number(row.balance_after || 0),
    orderSheetId: row.order_sheet_id || "",
    paymentId: row.payment_id || "",
    refundId: row.refund_id || "",
    reason: row.reason || "",
    expiresAt: row.expires_at || null,
    occurredAt: row.occurred_at || null,
    employeeName: row.employee_name || "",
  };
}

async function lockCustomer(client, customerId) {
  const { rows } = await client.query(
    `select id, phone, name, memo, created_at, updated_at
       from public.customers
      where id = $1
      for update`,
    [customerId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "고객 정보를 찾을 수 없어요.");
  }

  return rows[0];
}

export async function findCustomerByPhone(client, phone, { forUpdate = false } = {}) {
  const safePhone = normalizePhone(phone);
  const { rows } = await client.query(
    `select id, phone, name, memo, created_at, updated_at
       from public.customers
      where phone = $1${forUpdate ? " for update" : ""}`,
    [safePhone]
  );

  return rows[0] || null;
}

export async function ensureCustomer(client, { phone, name = "", memo = null }) {
  const safePhone = normalizePhone(phone);
  const safeName = trimText(name, MAX_NAME);
  const existing = await findCustomerByPhone(client, safePhone, { forUpdate: true });

  if (existing) {
    const nextName = safeName || existing.name;
    const nextMemo = memo === null ? existing.memo : trimText(memo, MAX_MEMO);

    if (nextName !== existing.name || nextMemo !== existing.memo) {
      await client.query(
        `update public.customers
            set name = $2, memo = $3, updated_at = now()
          where id = $1`,
        [existing.id, nextName, nextMemo]
      );
    }

    return { ...existing, name: nextName, memo: nextMemo };
  }

  const { rows } = await client.query(
    `insert into public.customers (id, phone, name, memo)
     values ($1, $2, $3, $4)
     returning id, phone, name, memo, created_at, updated_at`,
    [randomUUID(), safePhone, safeName, trimText(memo, MAX_MEMO)]
  );

  return rows[0];
}

// 적립 건별 남은 포인트. 먼저 만료되는 순서(FEFO)로 정렬합니다.
async function readLots(client, customerId) {
  const { rows } = await client.query(
    `select l.id, l.points, l.expires_at, l.occurred_at,
            coalesce(a.used, 0)::int as used
       from public.point_ledger l
       left join lateral (
         select sum(points)::int as used
           from public.point_allocations
          where earn_entry_id = l.id
       ) a on true
      where l.customer_id = $1
        and l.points > 0
      order by l.expires_at asc nulls last, l.occurred_at asc, l.id asc`,
    [customerId]
  );

  return rows.map((row) => ({
    id: row.id,
    points: Number(row.points || 0),
    remaining: Number(row.points || 0) - Number(row.used || 0),
    expiresAt: row.expires_at || null,
  }));
}

async function readBalance(client, customerId) {
  const { rows } = await client.query(
    `select coalesce(sum(points), 0)::int as balance
       from public.point_ledger
      where customer_id = $1`,
    [customerId]
  );

  return Number(rows[0]?.balance || 0);
}

async function insertLedgerEntry(
  client,
  {
    customerId,
    entryType,
    points,
    balanceAfter,
    orderSheetId = null,
    paymentId = null,
    refundId = null,
    reason = "",
    expiresAt = null,
    employee = null,
    occurredAt = new Date(),
  }
) {
  const id = randomUUID();

  await client.query(
    `insert into public.point_ledger
       (id, customer_id, entry_type, points, balance_after, order_sheet_id, payment_id,
        refund_id, reason, expires_at, business_date, employee_id, employee_name, occurred_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12, $13, $14)`,
    [
      id,
      customerId,
      entryType,
      points,
      balanceAfter,
      orderSheetId,
      paymentId,
      refundId,
      reason,
      expiresAt,
      toBusinessDate(occurredAt),
      employee?.id || null,
      employee?.name || "",
      occurredAt,
    ]
  );

  return id;
}

async function allocateDebit(client, { customerId, debitEntryId, amount, lots }) {
  let left = amount;

  for (const lot of lots) {
    if (left <= 0) break;
    if (lot.remaining <= 0) continue;

    const chunk = Math.min(lot.remaining, left);

    await client.query(
      `insert into public.point_allocations
         (id, customer_id, debit_entry_id, earn_entry_id, points)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), customerId, debitEntryId, lot.id, chunk]
    );

    lot.remaining -= chunk;
    left -= chunk;
  }

  return left;
}

// 만료된 적립 건을 EXPIRE 행으로 확정합니다.
async function materializeExpiry(client, customerId, lots, balance) {
  const now = Date.now();
  let current = balance;
  let expired = 0;

  for (const lot of lots) {
    if (lot.remaining <= 0 || !lot.expiresAt) continue;
    if (new Date(lot.expiresAt).getTime() > now) continue;

    const amount = lot.remaining;
    current -= amount;
    expired += amount;

    const entryId = await insertLedgerEntry(client, {
      customerId,
      entryType: "EXPIRE",
      points: -amount,
      balanceAfter: current,
      reason: "유효기간 만료",
    });

    await allocateDebit(client, {
      customerId,
      debitEntryId: entryId,
      amount,
      lots: [lot],
    });
  }

  return { balance: current, expired };
}

// 고객 행을 잠그고, 만료를 확정한 뒤 남은 적립 건과 잔액을 돌려줍니다.
async function loadState(client, customerId) {
  await lockCustomer(client, customerId);

  const lots = await readLots(client, customerId);
  const balanceBefore = await readBalance(client, customerId);
  const { balance, expired } = await materializeExpiry(
    client,
    customerId,
    lots,
    balanceBefore
  );

  return { lots, balance, expired };
}

export async function getCustomerPoints({
  phone = "",
  customerId = null,
  historyLimit = 20,
} = {}) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const customer = customerId
      ? await lockCustomer(client, customerId)
      : await findCustomerByPhone(client, phone, { forUpdate: true });

    if (!customer) {
      await client.query("rollback");

      return {
        customer: null,
        balance: 0,
        expiringSoon: [],
        history: [],
      };
    }

    const lots = await readLots(client, customer.id);
    const balanceBefore = await readBalance(client, customer.id);
    const { balance } = await materializeExpiry(
      client,
      customer.id,
      lots,
      balanceBefore
    );

    const limit = Math.min(Math.max(Number(historyLimit) || 20, 1), MAX_HISTORY);
    const { rows: history } = await client.query(
      `select * from public.point_ledger
        where customer_id = $1
        order by occurred_at desc, id desc
        limit $2`,
      [customer.id, limit]
    );

    await client.query("commit");

    const soonBase = Date.now();
    const soonLimit = soonBase + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
    const expiringSoon = lots
      .filter((lot) => {
        if (lot.remaining <= 0 || !lot.expiresAt) return false;

        const expiryMs = new Date(lot.expiresAt).getTime();

        // 이미 만료 처리된 적립 건은 "곧 소멸" 목록에서 뺍니다.
        return expiryMs > soonBase && expiryMs <= soonLimit;
      })
      .map((lot) => ({ points: lot.remaining, expiresAt: lot.expiresAt }));

    return {
      customer: mapCustomer(customer),
      balance,
      expiringSoon,
      history: history.map(mapLedgerRow),
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function earnPointsForPayment(
  client,
  {
    customerId,
    amount,
    orderSheetId = null,
    paymentId = null,
    employee = null,
    occurredAt = new Date(),
  }
) {
  const points = pointsForAmount(amount);

  if (!customerId || points <= 0) {
    return { points: 0, balanceAfter: null, expiresAt: null };
  }

  const { balance } = await loadState(client, customerId);
  const expiresAt = expiryFor(occurredAt);
  const balanceAfter = balance + points;

  await insertLedgerEntry(client, {
    customerId,
    entryType: "EARN",
    points,
    balanceAfter,
    orderSheetId,
    paymentId,
    reason: "결제 적립",
    expiresAt,
    employee,
    occurredAt,
  });

  return { points, balanceAfter, expiresAt };
}

export async function redeemPointsForPayment(
  client,
  {
    customerId,
    points,
    paymentAmount,
    orderSheetId = null,
    paymentId = null,
    employee = null,
    occurredAt = new Date(),
  }
) {
  const requested = Number(points || 0);

  if (!Number.isInteger(requested) || requested <= 0) {
    throw new HttpError(400, "HJ400", "사용할 포인트를 확인해 주세요.");
  }

  if (
    requested < POINT_RULES.minRedeem ||
    requested % POINT_RULES.redeemStep !== 0
  ) {
    throw new HttpError(
      400,
      "HJ400",
      `포인트는 ${formatNumber(POINT_RULES.minRedeem)}P 이상 ${formatNumber(
        POINT_RULES.redeemStep
      )}P 단위로 사용할 수 있어요.`
    );
  }

  if (Number(paymentAmount || 0) < POINT_RULES.redeemMinPayment) {
    throw new HttpError(
      400,
      "HJ400",
      `${formatNumber(POINT_RULES.redeemMinPayment)}원 이상 결제할 때만 포인트를 사용할 수 있어요.`
    );
  }

  if (requested > Number(paymentAmount || 0)) {
    throw new HttpError(400, "HJ400", "포인트는 결제 금액보다 많이 사용할 수 없어요.");
  }

  const { balance, lots } = await loadState(client, customerId);

  if (requested > balance) {
    throw new HttpError(
      400,
      "HJ400",
      `보유 포인트(${formatNumber(balance)}P)보다 많이 사용할 수 없어요.`
    );
  }

  const balanceAfter = balance - requested;
  const entryId = await insertLedgerEntry(client, {
    customerId,
    entryType: "REDEEM",
    points: -requested,
    balanceAfter,
    orderSheetId,
    paymentId,
    reason: "결제 사용",
    employee,
    occurredAt,
  });

  const leftover = await allocateDebit(client, {
    customerId,
    debitEntryId: entryId,
    amount: requested,
    lots,
  });

  if (leftover > 0) {
    throw new HttpError(409, "HJ409", "포인트 잔액이 부족해요.");
  }

  return { points: requested, balanceAfter };
}

export async function adjustPoints({
  phone = "",
  customerId = null,
  points,
  reason = "",
  employee = null,
}) {
  const amount = Number(points || 0);

  if (!Number.isInteger(amount) || amount === 0) {
    throw new HttpError(400, "HJ400", "조정할 포인트를 입력해 주세요.");
  }

  const safeReason = trimText(reason, MAX_REASON);

  if (!safeReason) {
    throw new HttpError(400, "HJ400", "조정 사유를 입력해 주세요.");
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const customer = customerId
      ? await lockCustomer(client, customerId)
      : await ensureCustomer(client, { phone });

    const { balance, lots } = await loadState(client, customer.id);

    if (amount < 0 && Math.abs(amount) > balance) {
      throw new HttpError(
        400,
        "HJ400",
        `보유 포인트(${formatNumber(balance)}P)보다 많이 차감할 수 없어요.`
      );
    }

    const balanceAfter = balance + amount;
    const entryId = await insertLedgerEntry(client, {
      customerId: customer.id,
      entryType: "ADJUST",
      points: amount,
      balanceAfter,
      reason: safeReason,
      employee,
    });

    if (amount < 0) {
      await allocateDebit(client, {
        customerId: customer.id,
        debitEntryId: entryId,
        amount: -amount,
        lots,
      });
    }

    await client.query("commit");

    return {
      customer: mapCustomer(customer),
      points: amount,
      balance: balanceAfter,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// 결제 환불 시 그 주문서로 적립된 포인트를 비례해서 회수합니다(잔액 밑으로는 내려가지 않음).
export async function clawbackForRefund(
  client,
  { orderSheetId, refundAmount, refundId = null, employee = null }
) {
  const points = pointsForAmount(refundAmount);

  if (points <= 0) return null;

  const { rows } = await client.query(
    `select distinct customer_id
       from public.point_ledger
      where order_sheet_id = $1
        and entry_type = 'EARN'`,
    [orderSheetId]
  );

  if (rows.length === 0) return null;

  const customerId = rows[0].customer_id;
  const { balance, lots } = await loadState(client, customerId);
  const amount = Math.min(points, balance);

  if (amount <= 0) return { customerId, points: 0, balanceAfter: balance };

  const balanceAfter = balance - amount;
  const entryId = await insertLedgerEntry(client, {
    customerId,
    entryType: "ADJUST",
    points: -amount,
    balanceAfter,
    orderSheetId,
    refundId,
    reason: "결제 환불 차감",
    employee,
  });

  await allocateDebit(client, {
    customerId,
    debitEntryId: entryId,
    amount,
    lots,
  });

  return { customerId, points: -amount, balanceAfter };
}

export async function listPointLedger({
  from = null,
  to = null,
  phone = "",
  customerId = null,
  limit = 200,
} = {}) {
  const conditions = [];
  const params = [];
  let customer = null;

  if (customerId) {
    customer = await lockCustomerReadOnly(customerId);
  } else if (phone) {
    const client = await pool.connect();

    try {
      const found = await findCustomerByPhone(client, phone);
      customer = found ? mapCustomer(found) : null;
    } finally {
      client.release();
    }
  }

  if ((customerId || phone) && !customer) {
    return { entries: [], totals: emptyTotals(), customer: null };
  }

  if (customer) {
    params.push(customer.id);
    conditions.push(`l.customer_id = $${params.length}`);
  }

  if (from) {
    params.push(from);
    conditions.push(`l.business_date >= $${params.length}::date`);
  }

  if (to) {
    params.push(to);
    conditions.push(`l.business_date <= $${params.length}::date`);
  }

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const { rows } = await pool.query(
    `select l.*, c.phone, c.name
       from public.point_ledger l
       join public.customers c on c.id = l.customer_id
       ${where}
      order by l.occurred_at desc, l.id desc
      limit $${params.length + 1}`,
    [...params, safeLimit]
  );

  const { rows: totalRows } = await pool.query(
    `select
       coalesce(sum(case when l.entry_type = 'EARN' then l.points else 0 end), 0)::int as earned,
       coalesce(sum(case when l.entry_type = 'REDEEM' then -l.points else 0 end), 0)::int as redeemed,
       coalesce(sum(case when l.entry_type = 'EXPIRE' then -l.points else 0 end), 0)::int as expired,
       coalesce(sum(case when l.entry_type = 'ADJUST' then l.points else 0 end), 0)::int as adjusted
       from public.point_ledger l
       ${where}`,
    params
  );

  const { rows: liabilityRows } = await pool.query(
    `select coalesce(sum(l.points - coalesce(a.used, 0)), 0)::int as liability
       from public.point_ledger l
       left join lateral (
         select sum(points)::int as used
           from public.point_allocations
          where earn_entry_id = l.id
       ) a on true
      where l.points > 0
        and (l.expires_at is null or l.expires_at > now())`
  );

  const totals = totalRows[0] || {};

  return {
    entries: rows.map(mapLedgerRow),
    customer,
    totals: {
      earned: Number(totals.earned || 0),
      redeemed: Number(totals.redeemed || 0),
      expired: Number(totals.expired || 0),
      adjusted: Number(totals.adjusted || 0),
      liability: Number(liabilityRows[0]?.liability || 0),
    },
  };
}

function emptyTotals() {
  return { earned: 0, redeemed: 0, expired: 0, adjusted: 0, liability: 0 };
}

async function lockCustomerReadOnly(customerId) {
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `select id, phone, name, memo, created_at, updated_at
         from public.customers
        where id = $1`,
      [customerId]
    );

    return rows[0] ? mapCustomer(rows[0]) : null;
  } finally {
    client.release();
  }
}
