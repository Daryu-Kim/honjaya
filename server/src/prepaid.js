// P10 — 선불권(회원 귀속 잔액형) 서비스.
//
// 규칙
//   * 선불권은 전화번호 고객(customers) 에 귀속됩니다. 양도/코드 전달은 없습니다(P11 기프티콘 담당).
//   * 판매가(price_paid)와 충전금액(face_value)이 다를 수 있습니다(보너스 충전).
//   * 사용 조건은 상품(prepaid_plans)에서 정하고, 발급 시점 값을 선불권에 복사해 둡니다.
//     → 상품을 나중에 수정해도 이미 판매한 선불권의 조건은 바뀌지 않습니다.
//   * 사용 금액 검증과 잔액 차감은 전부 서버에서 합니다(클라이언트 값을 믿지 않습니다).
//   * 만료는 조회 시점에 EXPIRE 원장 행으로 확정합니다(포인트와 같은 방식).
import { randomUUID } from "node:crypto";

import { toBusinessDate } from "./businessDay.js";
import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";
import {
  earnPointsForPayment,
  ensureCustomer,
  findCustomerByPhone,
  formatPhone,
  normalizePhone,
} from "./points.js";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const MAX_NAME = 40;
const MAX_MEMO = 200;
const MAX_REASON = 200;
const MAX_LIST = 200;
const MAX_VALIDITY_MONTHS = 120;
const MAX_PRICE = 100_000_000;

export const PASS_STATUSES = ["ACTIVE", "EXHAUSTED", "EXPIRED", "VOID"];

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

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

// KST 기준 요일/시각. 영업일 계산과 같은 규칙(UTC+9)을 씁니다.
function kstDate(date = new Date()) {
  return new Date(
    (date instanceof Date ? date.getTime() : Date.now()) + KST_OFFSET_MS
  );
}

// ISO 요일: 1=월 … 7=일
export function isoWeekday(date = new Date()) {
  const day = kstDate(date).getUTCDay();

  return day === 0 ? 7 : day;
}

function minutesOfDay(date = new Date()) {
  const kst = kstDate(date);

  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

function addDays(dateString, days) {
  const [year, month, day] = String(dateString || "")
    .split("-")
    .map((part) => Number(part));

  if (!year || !month || !day) return dateString;

  const base = new Date(Date.UTC(year, month - 1, day + days));

  return base.toISOString().slice(0, 10);
}

// months 개월 뒤 같은 날짜의 한국시간 23:59:59.999. 0 이면 무제한(null).
function expiryFromMonths(date, months) {
  const safeMonths = Math.max(0, toInt(months, 0));

  if (safeMonths === 0) return null;

  const kst = kstDate(date);
  const target = new Date(
    Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth() + safeMonths,
      kst.getUTCDate()
    )
  );

  return new Date(target.getTime() + 24 * 60 * 60 * 1000 - 1 - KST_OFFSET_MS);
}

// 'HH:MM' / 'HH:MM:SS' → 분 단위 정수. 형식이 틀리면 null.
function parseTimeToMinutes(value) {
  const text = String(value ?? "").trim();

  if (!text) return null;

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(text);

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

function timeText(value) {
  const minutes = parseTimeToMinutes(value);

  if (minutes === null) return "";

  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;
}

function normalizeUsableDays(value) {
  if (!Array.isArray(value)) return [];

  const days = new Set();

  for (const item of value) {
    const day = toInt(item, 0);

    if (day >= 1 && day <= 7) days.add(day);
  }

  return [...days].sort((a, b) => a - b);
}

function dateOnly(value) {
  if (!value) return "";

  if (value instanceof Date) return value.toISOString().slice(0, 10);

  return String(value).slice(0, 10);
}

export function mapPlan(row) {
  if (!row) return null;

  const faceValue = toInt(row.face_value);
  const price = toInt(row.price);

  return {
    id: row.id,
    name: row.name || "",
    price,
    faceValue,
    bonusAmount: Math.max(0, faceValue - price),
    validityMonths: toInt(row.validity_months, 0),
    minPaymentAmount: toInt(row.min_payment_amount, 0),
    minUseAmount: toInt(row.min_use_amount, 0),
    maxUsePercent: toInt(row.max_use_percent, 100),
    usableDays: normalizeUsableDays(row.usable_days),
    usableFromTime: timeText(row.usable_from_time),
    usableToTime: timeText(row.usable_to_time),
    usableFromNextVisit: row.usable_from_next_visit !== false,
    allowMultiple: row.allow_multiple !== false,
    isActive: row.is_active !== false,
    sortOrder: toInt(row.sort_order, 0),
    memo: row.memo || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

// 선불권이 지금 쓸 수 없는 이유. 쓸 수 있으면 빈 문자열입니다.
export function passBlockedReason(
  row,
  { now = new Date(), businessDate = toBusinessDate(now), paymentAmount = null } = {}
) {
  const balance = toInt(row.balance, 0);

  if (row.status === "VOID") return "취소된 선불권이에요.";
  if (row.status === "EXPIRED") return "유효기간이 지난 선불권이에요.";

  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) {
    return "유효기간이 지난 선불권이에요.";
  }

  if (balance <= 0) return "잔액이 없어요.";

  if (dateOnly(row.usable_from_date) > businessDate) {
    return `${dateOnly(row.usable_from_date)} 영업일부터 사용할 수 있어요.`;
  }

  const usableDays = normalizeUsableDays(row.usable_days);

  if (usableDays.length > 0 && !usableDays.includes(isoWeekday(now))) {
    return "오늘은 사용할 수 있는 요일이 아니에요.";
  }

  const fromMinutes = parseTimeToMinutes(row.usable_from_time);
  const toMinutes = parseTimeToMinutes(row.usable_to_time);

  if (fromMinutes !== null && toMinutes !== null) {
    const current = minutesOfDay(now);
    const inWindow =
      fromMinutes <= toMinutes
        ? current >= fromMinutes && current <= toMinutes
        : current >= fromMinutes || current <= toMinutes;

    if (!inWindow) {
      return `${timeText(row.usable_from_time)}~${timeText(
        row.usable_to_time
      )} 에만 사용할 수 있어요.`;
    }
  }

  const minPayment = toInt(row.min_payment_amount, 0);

  if (
    minPayment > 0 &&
    paymentAmount !== null &&
    toInt(paymentAmount, 0) < minPayment
  ) {
    return `${formatNumber(minPayment)}원 이상 결제할 때 사용할 수 있어요.`;
  }

  return "";
}

// 이 결제에서 실제로 쓸 수 있는 최대 금액.
export function maxUsableAmount(
  row,
  { now = new Date(), businessDate = toBusinessDate(now), paymentAmount = 0 } = {}
) {
  const reason = passBlockedReason(row, { now, businessDate, paymentAmount });

  if (reason) return 0;

  const balance = Math.max(0, toInt(row.balance, 0));
  const payment = Math.max(0, toInt(paymentAmount, 0));
  let usable = payment > 0 ? Math.min(balance, payment) : balance;
  const percent = Math.min(100, Math.max(1, toInt(row.max_use_percent, 100)));

  if (percent < 100) {
    if (payment <= 0) return 0;

    usable = Math.min(usable, Math.floor((payment * percent) / 100));
  }

  const minUse = toInt(row.min_use_amount, 0);

  if (minUse > 0 && usable < minUse) return 0;

  return Math.max(0, usable);
}

export function mapPass(row, options = {}) {
  if (!row) return null;

  const now = options.now || new Date();
  const businessDate = options.businessDate || toBusinessDate(now);
  const paymentAmount =
    options.paymentAmount === undefined || options.paymentAmount === null
      ? null
      : toInt(options.paymentAmount, 0);
  const balance = toInt(row.balance, 0);
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const expired = Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
  const status =
    row.status === "VOID" || row.status === "EXPIRED"
      ? row.status
      : expired && balance > 0
        ? "EXPIRED"
        : row.status;

  const blockedReason = passBlockedReason(
    { ...row, status },
    { now, businessDate, paymentAmount }
  );

  return {
    id: row.id,
    code: row.code || "",
    customerId: row.customer_id,
    customerPhone: row.customer_phone || "",
    customerPhoneText: row.customer_phone ? formatPhone(row.customer_phone) : "",
    customerName: row.customer_name || "",
    planId: row.plan_id || "",
    planName: row.plan_name || "",
    pricePaid: toInt(row.price_paid, 0),
    faceValue: toInt(row.face_value, 0),
    balance,
    purchasedAt: row.purchased_at || null,
    purchaseBusinessDate: dateOnly(row.purchase_business_date),
    usableFromDate: dateOnly(row.usable_from_date),
    expiresAt: row.expires_at || null,
    status,
    paymentMethod: row.payment_method || "",
    minPaymentAmount: toInt(row.min_payment_amount, 0),
    minUseAmount: toInt(row.min_use_amount, 0),
    maxUsePercent: toInt(row.max_use_percent, 100),
    usableDays: normalizeUsableDays(row.usable_days),
    usableFromTime: timeText(row.usable_from_time),
    usableToTime: timeText(row.usable_to_time),
    memo: row.memo || "",
    issuedByEmployeeName: row.issued_by_employee_name || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    usable: !blockedReason,
    blockedReason,
    maxUsableAmount: maxUsableAmount(
      { ...row, status },
      { now, businessDate, paymentAmount }
    ),
  };
}

function mapTransaction(row) {
  return {
    id: row.id,
    passId: row.pass_id,
    customerId: row.customer_id,
    customerPhone: row.customer_phone || "",
    customerName: row.customer_name || "",
    entryType: row.entry_type,
    amount: toInt(row.amount, 0),
    balanceAfter: toInt(row.balance_after, 0),
    paidAmount: toInt(row.paid_amount, 0),
    paymentId: row.payment_id || "",
    refundId: row.refund_id || "",
    orderSheetId: row.order_sheet_id || "",
    businessDate: dateOnly(row.business_date),
    reason: row.reason || "",
    employeeName: row.employee_name || "",
    occurredAt: row.occurred_at || null,
  };
}

// ── 상품(prepaid_plans) ────────────────────────────────────────────────

function normalizePlanInput(body = {}, { partial = false, current = null } = {}) {
  const base = current ? mapPlan(current) : null;

  const name = trimText(
    body.name === undefined && partial && base ? base.name : body.name,
    MAX_NAME
  );
  const price = toInt(
    body.price === undefined && partial && base ? base.price : body.price,
    0
  );
  const faceValue = toInt(
    body.faceValue === undefined && partial && base
      ? base.faceValue
      : body.faceValue,
    0
  );
  const validityMonths = Math.min(
    MAX_VALIDITY_MONTHS,
    Math.max(
      0,
      toInt(
        body.validityMonths === undefined && partial && base
          ? base.validityMonths
          : body.validityMonths,
        3
      )
    )
  );
  const minPaymentAmount = Math.max(
    0,
    toInt(
      body.minPaymentAmount === undefined && partial && base
        ? base.minPaymentAmount
        : body.minPaymentAmount,
      0
    )
  );
  const minUseAmount = Math.max(
    0,
    toInt(
      body.minUseAmount === undefined && partial && base
        ? base.minUseAmount
        : body.minUseAmount,
      0
    )
  );
  const maxUsePercent = Math.min(
    100,
    Math.max(
      1,
      toInt(
        body.maxUsePercent === undefined && partial && base
          ? base.maxUsePercent
          : body.maxUsePercent,
        100
      )
    )
  );
  const usableDays =
    body.usableDays === undefined && partial && base
      ? base.usableDays
      : normalizeUsableDays(body.usableDays);
  const rawFrom =
    body.usableFromTime === undefined && partial && base
      ? base.usableFromTime
      : body.usableFromTime;
  const rawTo =
    body.usableToTime === undefined && partial && base
      ? base.usableToTime
      : body.usableToTime;
  const usableFromTime = timeText(rawFrom);
  const usableToTime = timeText(rawTo);
  const usableFromNextVisit =
    body.usableFromNextVisit === undefined && partial && base
      ? base.usableFromNextVisit
      : body.usableFromNextVisit === undefined
        ? true
        : body.usableFromNextVisit === true;
  const allowMultiple =
    body.allowMultiple === undefined && partial && base
      ? base.allowMultiple
      : body.allowMultiple === undefined
        ? true
        : body.allowMultiple === true;
  const isActive =
    body.isActive === undefined && partial && base
      ? base.isActive
      : body.isActive === undefined
        ? true
        : body.isActive === true;
  const sortOrder = toInt(
    body.sortOrder === undefined && partial && base ? base.sortOrder : body.sortOrder,
    0
  );
  const memo = trimText(
    body.memo === undefined && partial && base ? base.memo : body.memo,
    MAX_MEMO
  );

  if (!name) {
    throw new HttpError(400, "HJ400", "선불권 이름을 입력해 주세요.");
  }

  if (price <= 0) {
    throw new HttpError(400, "HJ400", "판매가를 1원 이상 입력해 주세요.");
  }

  if (price > MAX_PRICE || faceValue > MAX_PRICE) {
    throw new HttpError(400, "HJ400", "금액이 너무 커요.");
  }

  if (faceValue <= 0) {
    throw new HttpError(400, "HJ400", "충전금액을 1원 이상 입력해 주세요.");
  }

  if ((usableFromTime && !usableToTime) || (!usableFromTime && usableToTime)) {
    throw new HttpError(
      400,
      "HJ400",
      "사용 가능 시간은 시작과 종료를 함께 입력해 주세요."
    );
  }

  if (minUseAmount > faceValue) {
    throw new HttpError(
      400,
      "HJ400",
      "1회 최소 사용 금액은 충전금액보다 클 수 없어요."
    );
  }

  return {
    name,
    price,
    faceValue,
    validityMonths,
    minPaymentAmount,
    minUseAmount,
    maxUsePercent,
    usableDays,
    usableFromTime: usableFromTime || null,
    usableToTime: usableToTime || null,
    usableFromNextVisit,
    allowMultiple,
    isActive,
    sortOrder,
    memo,
  };
}

export async function listPlans({ includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `select *
       from public.prepaid_plans
      where ($1::boolean or is_active)
      order by sort_order asc, price asc, created_at asc`,
    [includeInactive === true]
  );

  return rows.map(mapPlan);
}

export async function createPlan(body = {}) {
  const input = normalizePlanInput(body);
  const { rows } = await pool.query(
    `insert into public.prepaid_plans
       (id, name, price, face_value, validity_months, min_payment_amount,
        min_use_amount, max_use_percent, usable_days, usable_from_time,
        usable_to_time, usable_from_next_visit, allow_multiple, is_active,
        sort_order, memo)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::smallint[], $10::time,
             $11::time, $12, $13, $14, $15, $16)
     returning *`,
    [
      randomUUID(),
      input.name,
      input.price,
      input.faceValue,
      input.validityMonths,
      input.minPaymentAmount,
      input.minUseAmount,
      input.maxUsePercent,
      input.usableDays,
      input.usableFromTime,
      input.usableToTime,
      input.usableFromNextVisit,
      input.allowMultiple,
      input.isActive,
      input.sortOrder,
      input.memo,
    ]
  );

  return mapPlan(rows[0]);
}

export async function updatePlan({ planId, ...body } = {}) {
  const safeId = trimText(planId, 100);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "선불권 상품 번호가 필요해요.");
  }

  const { rows: currentRows } = await pool.query(
    `select * from public.prepaid_plans where id = $1`,
    [safeId]
  );

  if (!currentRows[0]) {
    throw new HttpError(404, "HJ404", "선불권 상품을 찾을 수 없어요.");
  }

  const input = normalizePlanInput(body, { partial: true, current: currentRows[0] });
  const { rows } = await pool.query(
    `update public.prepaid_plans
        set name = $2,
            price = $3,
            face_value = $4,
            validity_months = $5,
            min_payment_amount = $6,
            min_use_amount = $7,
            max_use_percent = $8,
            usable_days = $9::smallint[],
            usable_from_time = $10::time,
            usable_to_time = $11::time,
            usable_from_next_visit = $12,
            allow_multiple = $13,
            is_active = $14,
            sort_order = $15,
            memo = $16,
            updated_at = now()
      where id = $1
      returning *`,
    [
      safeId,
      input.name,
      input.price,
      input.faceValue,
      input.validityMonths,
      input.minPaymentAmount,
      input.minUseAmount,
      input.maxUsePercent,
      input.usableDays,
      input.usableFromTime,
      input.usableToTime,
      input.usableFromNextVisit,
      input.allowMultiple,
      input.isActive,
      input.sortOrder,
      input.memo,
    ]
  );

  return mapPlan(rows[0]);
}

// ── 만료 처리 ──────────────────────────────────────────────────────────

// expires_at 이 지난 선불권을 EXPIRED 로 확정하고 EXPIRE 원장 행을 남깁니다.
export async function expireDuePasses(
  client = pool,
  { customerId = null, now = new Date() } = {}
) {
  const { rows } = await client.query(
    `select id, customer_id, balance
       from public.prepaid_passes
      where status in ('ACTIVE', 'EXHAUSTED')
        and expires_at is not null
        and expires_at <= $1
        and ($2::text is null or customer_id = $2)`,
    [now, customerId]
  );

  if (rows.length === 0) return 0;

  const businessDate = toBusinessDate(now);

  for (const row of rows) {
    const balance = toInt(row.balance, 0);

    await client.query(
      `update public.prepaid_passes
          set status = 'EXPIRED', balance = 0, updated_at = now()
        where id = $1`,
      [row.id]
    );

    if (balance > 0) {
      await client.query(
        `insert into public.prepaid_transactions
           (id, pass_id, customer_id, entry_type, amount, balance_after,
            business_date, reason, occurred_at)
         values ($1, $2, $3, 'EXPIRE', $4, 0, $5::date, '유효기간 만료', $6)`,
        [randomUUID(), row.id, row.customer_id, -balance, businessDate, now]
      );
    }
  }

  return rows.length;
}

// ── 발급 ──────────────────────────────────────────────────────────────

function generatePassCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `P-${code}`;
}

export async function issuePass({
  phone = "",
  customerId = "",
  planId = "",
  paymentMethod = "CARD",
  memo = "",
  employee = null,
} = {}) {
  const safePlanId = trimText(planId, 100);

  if (!safePlanId) {
    throw new HttpError(400, "HJ400", "선불권 상품을 선택해 주세요.");
  }

  if (!trimText(phone, 30) && !trimText(customerId, 100)) {
    throw new HttpError(400, "HJ400", "선불권을 등록할 고객 전화번호를 입력해 주세요.");
  }

  const now = new Date();
  const businessDate = toBusinessDate(now);
  const client = await pool.connect();

  try {
    await client.query("begin");

    const customer =
      trimText(phone, 30) !== ""
        ? await ensureCustomer(client, { phone, name: "" })
        : (
            await client.query(
              `select id, phone, name
                 from public.customers
                where id = $1
                for update`,
              [trimText(customerId, 100)]
            )
          ).rows[0];

    if (!customer) {
      throw new HttpError(404, "HJ404", "고객 정보를 찾을 수 없어요.");
    }

    const { rows: planRows } = await client.query(
      `select * from public.prepaid_plans where id = $1`,
      [safePlanId]
    );
    const plan = planRows[0];

    if (!plan) {
      throw new HttpError(404, "HJ404", "선불권 상품을 찾을 수 없어요.");
    }

    if (plan.is_active === false) {
      throw new HttpError(409, "HJ409", "판매가 중지된 선불권 상품이에요.");
    }

    if (plan.allow_multiple === false) {
      const { rows: existingRows } = await client.query(
        `select id
           from public.prepaid_passes
          where customer_id = $1
            and plan_id = $2
            and status in ('ACTIVE', 'EXHAUSTED')
          limit 1`,
        [customer.id, plan.id]
      );

      if (existingRows[0]) {
        throw new HttpError(
          409,
          "HJ409",
          "이미 보유한 선불권이에요. 같은 상품은 한 번만 구매할 수 있어요."
        );
      }
    }

    const usableFromDate =
      plan.usable_from_next_visit === false
        ? businessDate
        : addDays(businessDate, 1);
    const expiresAt = expiryFromMonths(now, plan.validity_months);
    const faceValue = toInt(plan.face_value, 0);
    const passId = randomUUID();
    const method =
      trimText(paymentMethod, 20).toUpperCase() || "CARD";

    const { rows: passRows } = await client.query(
      `insert into public.prepaid_passes
         (id, code, customer_id, plan_id, plan_name, price_paid, face_value,
          balance, purchased_at, purchase_business_date, usable_from_date,
          expires_at, status, payment_method, min_payment_amount,
          min_use_amount, max_use_percent, usable_days, usable_from_time,
          usable_to_time, memo, issued_by_employee_id, issued_by_employee_name)
       values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9::date, $10::date, $11,
               'ACTIVE', $12, $13, $14, $15, $16::smallint[], $17::time,
               $18::time, $19, $20, $21)
       returning *`,
      [
        passId,
        generatePassCode(),
        customer.id,
        plan.id,
        plan.name,
        toInt(plan.price, 0),
        faceValue,
        now,
        businessDate,
        usableFromDate,
        expiresAt,
        method,
        toInt(plan.min_payment_amount, 0),
        toInt(plan.min_use_amount, 0),
        toInt(plan.max_use_percent, 100),
        normalizeUsableDays(plan.usable_days),
        plan.usable_from_time,
        plan.usable_to_time,
        trimText(memo, MAX_MEMO),
        employee?.id || null,
        employee?.name || "",
      ]
    );

    await client.query(
      `insert into public.prepaid_transactions
         (id, pass_id, customer_id, entry_type, amount, balance_after,
          paid_amount, business_date, reason, employee_id, employee_name,
          occurred_at)
       values ($1, $2, $3, 'PURCHASE', $4, $4, $5, $6::date, $7, $8, $9, $10)`,
      [
        randomUUID(),
        passId,
        customer.id,
        faceValue,
        toInt(plan.price, 0),
        businessDate,
        trimText(memo, MAX_MEMO) || "선불권 판매",
        employee?.id || null,
        employee?.name || "",
        now,
      ]
    );

    // 적립은 선불권 판매(실제 입금) 시점의 판매가 기준입니다.
    // 사용 시점에 또 적립하면 같은 돈으로 두 번 적립되므로 결제 화면에서는 제외합니다.
    const earned = await earnPointsForPayment(client, {
      customerId: customer.id,
      amount: toInt(plan.price, 0),
      orderSheetId: null,
      paymentId: null,
      employee,
      occurredAt: now,
    });
    const earnedPoints = toInt(earned.points, 0);

    await client.query("commit");

    return {
      ...mapPass(
        {
          ...passRows[0],
          customer_phone: customer.phone,
          customer_name: customer.name,
        },
        { now }
      ),
      customerPhoneText: formatPhone(customer.phone),
      pointsEarned: earnedPoints,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ── 조회 ──────────────────────────────────────────────────────────────

// 결제 화면·고객 화면용. 전화번호로 보유 선불권과 사용 가능 여부를 함께 내려 줍니다.
export async function listCustomerPasses({
  phone = "",
  customerId = "",
  paymentAmount = null,
  limit = MAX_LIST,
} = {}) {
  let customer = null;

  if (trimText(phone, 30)) {
    customer = await findCustomerByPhone(pool, phone);
  } else if (trimText(customerId, 100)) {
    const { rows } = await pool.query(
      `select id, phone, name from public.customers where id = $1`,
      [trimText(customerId, 100)]
    );
    customer = rows[0] || null;
  }

  if (!customer) {
    return { customer: null, passes: [] };
  }

  await expireDuePasses(pool, { customerId: customer.id });

  const { rows } = await pool.query(
    `select p.*, c.phone as customer_phone, c.name as customer_name
       from public.prepaid_passes p
       join public.customers c on c.id = p.customer_id
      where p.customer_id = $1
      order by
        case when p.status = 'ACTIVE' then 0 else 1 end asc,
        p.purchased_at desc,
        p.id desc
      limit $2`,
    [customer.id, Math.min(MAX_LIST, Math.max(1, toInt(limit, MAX_LIST)))]
  );

  const now = new Date();
  const businessDate = toBusinessDate(now);
  const amount = paymentAmount === null ? null : toInt(paymentAmount, 0);

  return {
    customer: {
      id: customer.id,
      phone: customer.phone,
      phoneText: formatPhone(customer.phone),
      name: customer.name || "",
    },
    passes: rows.map((row) => mapPass(row, { now, businessDate, paymentAmount: amount })),
  };
}

// 관리자 목록(검색 + 기간).
export async function listPasses({
  phone = "",
  status = "",
  from = null,
  to = null,
  limit = MAX_LIST,
} = {}) {
  await expireDuePasses(pool);

  const safePhone = trimText(phone, 30)
    ? normalizePhone(phone)
    : null;
  const safeStatus = PASS_STATUSES.includes(String(status || "").toUpperCase())
    ? String(status).toUpperCase()
    : null;

  const { rows } = await pool.query(
    `select p.*, c.phone as customer_phone, c.name as customer_name
       from public.prepaid_passes p
       join public.customers c on c.id = p.customer_id
      where ($1::text is null or c.phone = $1)
        and ($2::text is null or p.status = $2)
        and ($3::date is null or p.purchase_business_date >= $3::date)
        and ($4::date is null or p.purchase_business_date <= $4::date)
      order by p.purchased_at desc, p.id desc
      limit $5`,
    [
      safePhone,
      safeStatus,
      from || null,
      to || null,
      Math.min(MAX_LIST, Math.max(1, toInt(limit, MAX_LIST))),
    ]
  );

  const now = new Date();
  const businessDate = toBusinessDate(now);

  return rows.map((row) => mapPass(row, { now, businessDate }));
}

export async function getPassLedger({ passId, limit = MAX_LIST } = {}) {
  const safeId = trimText(passId, 100);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "선불권 번호가 필요해요.");
  }

  const { rows: passRows } = await pool.query(
    `select p.*, c.phone as customer_phone, c.name as customer_name
       from public.prepaid_passes p
       join public.customers c on c.id = p.customer_id
      where p.id = $1`,
    [safeId]
  );

  if (!passRows[0]) {
    throw new HttpError(404, "HJ404", "선불권을 찾을 수 없어요.");
  }

  await expireDuePasses(pool, { customerId: passRows[0].customer_id });

  const { rows } = await pool.query(
    `select t.*, c.phone as customer_phone, c.name as customer_name
       from public.prepaid_transactions t
       join public.customers c on c.id = t.customer_id
      where t.pass_id = $1
      order by t.occurred_at desc, t.id desc
      limit $2`,
    [safeId, Math.min(MAX_LIST, Math.max(1, toInt(limit, MAX_LIST)))]
  );

  const { rows: freshRows } = await pool.query(
    `select p.*, c.phone as customer_phone, c.name as customer_name
       from public.prepaid_passes p
       join public.customers c on c.id = p.customer_id
      where p.id = $1`,
    [safeId]
  );

  return {
    pass: mapPass(freshRows[0]),
    transactions: rows.map(mapTransaction),
  };
}

// ── 결제 연동 ──────────────────────────────────────────────────────────

// 결제 트랜잭션 안에서 선불권 사용 가능 여부를 검증합니다.
export async function readPassForPayment(
  client,
  { passId, customerId, amount, paymentAmount, now = new Date() }
) {
  const safeId = trimText(passId, 100);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "사용할 선불권을 선택해 주세요.");
  }

  const { rows } = await client.query(
    `select * from public.prepaid_passes where id = $1 for update`,
    [safeId]
  );
  const pass = rows[0];

  if (!pass) {
    throw new HttpError(404, "HJ404", "선불권을 찾을 수 없어요.");
  }

  if (pass.customer_id !== customerId) {
    throw new HttpError(403, "HJ403", "이 고객의 선불권이 아니에요.");
  }

  const businessDate = toBusinessDate(now);
  const reason = passBlockedReason(pass, {
    now,
    businessDate,
    paymentAmount: toInt(paymentAmount, 0),
  });

  if (reason) {
    throw new HttpError(409, "HJ409", reason);
  }

  const requested = toInt(amount, 0);
  const limit = maxUsableAmount(pass, {
    now,
    businessDate,
    paymentAmount: toInt(paymentAmount, 0),
  });

  if (requested <= 0) {
    throw new HttpError(400, "HJ400", "선불권 사용 금액을 입력해 주세요.");
  }

  if (requested > limit) {
    throw new HttpError(
      400,
      "HJ400",
      `이 선불권으로는 ${formatNumber(limit)}원까지 사용할 수 있어요.`
    );
  }

  return pass;
}

// 잔액 차감 + USE 원장 행.
export async function applyPassUse(
  client,
  { pass, amount, paymentId = null, orderSheetId = null, employee = null, occurredAt = new Date() }
) {
  const used = toInt(amount, 0);
  const balance = toInt(pass.balance, 0);

  if (used <= 0) {
    throw new HttpError(400, "HJ400", "선불권 사용 금액을 입력해 주세요.");
  }

  if (used > balance) {
    throw new HttpError(
      400,
      "HJ400",
      `선불권 잔액은 ${formatNumber(balance)}원이에요.`
    );
  }

  const nextBalance = balance - used;

  const { rows } = await client.query(
    `update public.prepaid_passes
        set balance = $2,
            status = case when $2 = 0 then 'EXHAUSTED' else 'ACTIVE' end,
            updated_at = now()
      where id = $1
      returning *`,
    [pass.id, nextBalance]
  );

  await client.query(
    `insert into public.prepaid_transactions
       (id, pass_id, customer_id, entry_type, amount, balance_after,
        payment_id, order_sheet_id, business_date, reason, employee_id,
        employee_name, occurred_at)
     values ($1, $2, $3, 'USE', $4, $5, $6, $7, $8::date, $9, $10, $11, $12)`,
    [
      randomUUID(),
      pass.id,
      pass.customer_id,
      -used,
      nextBalance,
      paymentId,
      orderSheetId,
      toBusinessDate(occurredAt),
      "결제 사용",
      employee?.id || null,
      employee?.name || "",
      occurredAt,
    ]
  );

  return { balanceAfter: nextBalance, used };
}

// 결제 환불 시 선불권 잔액을 되돌립니다.
export async function restorePassForRefund(
  client,
  { paymentId, amount, refundId = null, employee = null, occurredAt = new Date() }
) {
  if (!paymentId) return null;

  const { rows: useRows } = await client.query(
    `select pass_id, coalesce(sum(amount), 0)::int as net
       from public.prepaid_transactions
      where payment_id = $1
        and entry_type in ('USE', 'RESTORE')
      group by pass_id`,
    [paymentId]
  );

  let restored = 0;

  for (const row of useRows) {
    const consumed = -toInt(row.net, 0);
    const restore = Math.min(toInt(amount, 0) - restored, consumed);

    if (restore <= 0) continue;

    const { rows: passRows } = await client.query(
      `select * from public.prepaid_passes where id = $1 for update`,
      [row.pass_id]
    );
    const pass = passRows[0];

    if (!pass || pass.status === "VOID") continue;

    const nextBalance = toInt(pass.balance, 0) + restore;

    await client.query(
      `update public.prepaid_passes
          set balance = $2,
              status = case when status = 'EXPIRED' then status else 'ACTIVE' end,
              updated_at = now()
        where id = $1`,
      [pass.id, nextBalance]
    );

    await client.query(
      `insert into public.prepaid_transactions
         (id, pass_id, customer_id, entry_type, amount, balance_after,
          payment_id, refund_id, business_date, reason, employee_id,
          employee_name, occurred_at)
       values ($1, $2, $3, 'RESTORE', $4, $5, $6, $7, $8::date, $9, $10, $11, $12)`,
      [
        randomUUID(),
        pass.id,
        pass.customer_id,
        restore,
        nextBalance,
        paymentId,
        refundId,
        toBusinessDate(occurredAt),
        "결제 환불 복원",
        employee?.id || null,
        employee?.name || "",
        occurredAt,
      ]
    );

    restored += restore;
  }

  return restored > 0 ? { restored } : null;
}

// ── 수동 조정/취소 ────────────────────────────────────────────────────

export async function adjustPass({
  passId,
  amount,
  reason = "",
  employee = null,
} = {}) {
  const safeId = trimText(passId, 100);
  const safeReason = trimText(reason, MAX_REASON);
  const delta = toInt(amount, 0);

  if (!safeId) {
    throw new HttpError(400, "HJ400", "선불권 번호가 필요해요.");
  }

  if (delta === 0) {
    throw new HttpError(400, "HJ400", "조정할 금액을 0이 아닌 값으로 입력해 주세요.");
  }

  if (!safeReason) {
    throw new HttpError(400, "HJ400", "조정 사유를 입력해 주세요.");
  }

  const now = new Date();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows } = await client.query(
      `select * from public.prepaid_passes where id = $1 for update`,
      [safeId]
    );
    const pass = rows[0];

    if (!pass) {
      throw new HttpError(404, "HJ404", "선불권을 찾을 수 없어요.");
    }

    if (pass.status === "VOID") {
      throw new HttpError(409, "HJ409", "취소된 선불권이에요.");
    }

    const nextBalance = toInt(pass.balance, 0) + delta;

    if (nextBalance < 0) {
      throw new HttpError(
        400,
        "HJ400",
        `잔액(${formatNumber(pass.balance)}원)보다 많이 차감할 수 없어요.`
      );
    }

    await client.query(
      `update public.prepaid_passes
          set balance = $2,
              status = case
                         when $2 = 0 then 'EXHAUSTED'
                         when status = 'EXPIRED' then 'EXPIRED'
                         else 'ACTIVE'
                       end,
              updated_at = now()
        where id = $1`,
      [safeId, nextBalance]
    );

    await client.query(
      `insert into public.prepaid_transactions
         (id, pass_id, customer_id, entry_type, amount, balance_after,
          business_date, reason, employee_id, employee_name, occurred_at)
       values ($1, $2, $3, 'ADJUST', $4, $5, $6::date, $7, $8, $9, $10)`,
      [
        randomUUID(),
        safeId,
        pass.customer_id,
        delta,
        nextBalance,
        toBusinessDate(now),
        safeReason,
        employee?.id || null,
        employee?.name || "",
        now,
      ]
    );

    await client.query("commit");

    return { passId: safeId, balance: nextBalance, amount: delta };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function voidPass({ passId, reason = "", employee = null } = {}) {
  const safeId = trimText(passId, 100);
  const safeReason = trimText(reason, MAX_REASON) || "관리자 취소";

  if (!safeId) {
    throw new HttpError(400, "HJ400", "선불권 번호가 필요해요.");
  }

  const now = new Date();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows } = await client.query(
      `select * from public.prepaid_passes where id = $1 for update`,
      [safeId]
    );
    const pass = rows[0];

    if (!pass) {
      throw new HttpError(404, "HJ404", "선불권을 찾을 수 없어요.");
    }

    if (pass.status === "VOID") {
      throw new HttpError(409, "HJ409", "이미 취소된 선불권이에요.");
    }

    const balance = toInt(pass.balance, 0);

    await client.query(
      `update public.prepaid_passes
          set status = 'VOID', balance = 0, updated_at = now()
        where id = $1`,
      [safeId]
    );

    if (balance > 0) {
      await client.query(
        `insert into public.prepaid_transactions
           (id, pass_id, customer_id, entry_type, amount, balance_after,
            business_date, reason, employee_id, employee_name, occurred_at)
         values ($1, $2, $3, 'ADJUST', $4, 0, $5::date, $6, $7, $8, $9)`,
        [
          randomUUID(),
          safeId,
          pass.customer_id,
          -balance,
          toBusinessDate(now),
          `취소: ${safeReason}`,
          employee?.id || null,
          employee?.name || "",
          now,
        ]
      );
    }

    await client.query("commit");

    return { passId: safeId, balance: 0 };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ── 매출 요약 ─────────────────────────────────────────────────────────

export async function prepaidSummary({ from = null, to = null } = {}) {
  await expireDuePasses(pool);

  const { rows } = await pool.query(
    `select
        coalesce(sum(paid_amount) filter (where entry_type = 'PURCHASE'), 0)::int as sold,
        coalesce(sum(-amount) filter (where entry_type = 'USE'), 0)::int as used,
        coalesce(sum(-amount) filter (where entry_type = 'EXPIRE'), 0)::int as expired,
        coalesce(sum(amount) filter (where entry_type = 'ADJUST'), 0)::int as adjusted,
        coalesce(sum(-amount) filter (where entry_type = 'RESTORE'), 0)::int as restored,
        count(*) filter (where entry_type = 'PURCHASE')::int as issued_count
       from public.prepaid_transactions
      where ($1::date is null or business_date >= $1::date)
        and ($2::date is null or business_date <= $2::date)`,
    [from || null, to || null]
  );

  const { rows: liabilityRows } = await pool.query(
    `select coalesce(sum(balance), 0)::int as liability,
            count(*) filter (where balance > 0)::int as active_count
       from public.prepaid_passes
      where status in ('ACTIVE', 'EXHAUSTED')`
  );

  const row = rows[0] || {};

  return {
    totals: {
      sold: toInt(row.sold, 0),
      used: toInt(row.used, 0),
      expired: toInt(row.expired, 0),
      adjusted: toInt(row.adjusted, 0),
      restored: toInt(row.restored, 0),
      issuedCount: toInt(row.issued_count, 0),
      liability: toInt(liabilityRows[0]?.liability, 0),
      activeCount: toInt(liabilityRows[0]?.active_count, 0),
    },
  };
}
