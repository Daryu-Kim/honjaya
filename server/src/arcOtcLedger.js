// P14O — 직원 개인 상비약 사용대장 · 단가 · 정산.
//
// 흐름
//   ① 총괄(ARC 대표 RN)이 품목별 단가를 미리 등록합니다(단가 이력 관리).
//   ② 사장·직원이 상비약을 쓰면 육하원칙(언제·누가·어디서·무엇을·얼마나·왜)으로 남깁니다.
//      단가가 있으면 소모금액이 즉시 계산됩니다.
//   ③ 총괄이 월 단위로 사장에게 정산(지급)을 요청하고, 사장이 지급하면 PAID 가 됩니다.
//   ④ 화면에는 사용액·지급액·미지급액이 함께 보입니다.
//
// 원칙
//   * 금액은 항상 서버가 계산합니다(클라이언트가 보낸 금액은 쓰지 않음).
//   * 단가는 "사용 시점" 단가를 스냅샷으로 복사합니다 → 나중에 단가를 올려도 과거 금액은 그대로.
//   * 사용 기록은 지우지 않고 VOID 처리합니다(재고는 되돌림).

import { randomUUID } from "node:crypto";

import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TARGET_KINDS = new Set(["SELF", "STAFF", "OWNER", "ETC"]);
const SETTLEMENT_STATUSES = new Set(["REQUESTED", "PAID", "CANCELED"]);
const PAY_METHODS = new Set(["TRANSFER", "CASH", "CARD", "ETC"]);

export const ARC_OTC_TARGET_KINDS = [
  { key: "SELF", label: "본인" },
  { key: "STAFF", label: "다른 직원" },
  { key: "OWNER", label: "사장" },
  { key: "ETC", label: "기타" },
];

export const ARC_OTC_PAY_METHODS = [
  { key: "TRANSFER", label: "계좌이체" },
  { key: "CASH", label: "현금" },
  { key: "CARD", label: "카드" },
  { key: "ETC", label: "기타" },
];

export const ARC_OTC_SETTLEMENT_STATUSES = [
  { key: "REQUESTED", label: "지급 요청", desc: "총괄이 사장에게 정산을 요청한 상태." },
  { key: "PAID", label: "지급 완료", desc: "사장이 지급하고 금액·방법을 남긴 상태." },
  { key: "CANCELED", label: "요청 취소", desc: "요청을 취소했습니다. 사용 기록은 다시 미정산으로 돌아갑니다." },
];

export const ARC_OTC_LEDGER_GUIDE = [
  "상비약은 본인 판단으로 본인만 복용합니다. 다른 사람에게 약 이름·용량을 정해 주면 안 됩니다.",
  "사용하면 그 자리에서 육하원칙으로 남기세요. 나중에 기억해서 적으면 금액이 어긋납니다.",
  "단가는 총괄만 등록합니다. 단가가 없으면 사용 기록은 남지만 금액은 0원으로 표시됩니다.",
  "정산은 월 단위로 묶습니다. 같은 사용 기록이 두 번 정산되지 않습니다.",
];

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function round2(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoDateTime(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function todayIso() {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  return new Date(now.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function arcOtcLedgerCatalog() {
  return {
    targetKinds: ARC_OTC_TARGET_KINDS,
    payMethods: ARC_OTC_PAY_METHODS,
    settlementStatuses: ARC_OTC_SETTLEMENT_STATUSES,
    guide: ARC_OTC_LEDGER_GUIDE,
  };
}

function mapPrice(row) {
  return {
    id: row.id,
    otcItemId: row.otc_item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    unitPrice: Number(row.unit_price ?? 0),
    effectiveFrom: isoDate(row.effective_from),
    note: row.note,
    employeeName: row.employee_name,
    createdAt: isoDateTime(row.created_at),
  };
}

function mapUsage(row) {
  return {
    id: row.id,
    usageNo: row.usage_no,
    otcItemId: row.otc_item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    itemUnit: row.item_unit,
    period: row.period,
    usedOn: isoDate(row.used_on),
    usedTime: row.used_time,
    place: row.place,
    targetKind: row.target_kind,
    targetEmployeeId: row.target_employee_id,
    targetName: row.target_name,
    reason: row.reason,
    symptom: row.symptom,
    qty: round2(row.qty),
    unitPrice: Number(row.unit_price ?? 0),
    amount: Number(row.amount ?? 0),
    careIncidentNo: row.care_incident_no,
    settlementId: row.settlement_id,
    note: row.note,
    status: row.status,
    voidReason: row.void_reason,
    voidedAt: isoDateTime(row.voided_at),
    voidedByName: row.voided_by_name,
    employeeName: row.employee_name,
    createdAt: isoDateTime(row.created_at),
  };
}

function mapSettlement(row) {
  return {
    id: row.id,
    settlementNo: row.settlement_no,
    period: row.period,
    requestedOn: isoDate(row.requested_on),
    usageCount: Number(row.usage_count ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    status: row.status,
    requestedBy: row.requested_by,
    requestNote: row.request_note,
    paidOn: isoDate(row.paid_on),
    paidAmount: Number(row.paid_amount ?? 0),
    paidMethod: row.paid_method,
    paidNote: row.paid_note,
    paidBy: row.paid_by,
    detail: Array.isArray(row.detail) ? row.detail : [],
    createdAt: isoDateTime(row.created_at),
  };
}

/* ── 단가 ───────────────────────────────────────────────────────────── */

export async function listArcOtcPrices({ otcItemId = "", limit = 200 } = {}) {
  const { rows } = await pool.query(
    `select *
       from public.arc_otc_prices
      where ($1::uuid is null or otc_item_id = $1)
      order by otc_item_id, effective_from desc, created_at desc
      limit $2`,
    [otcItemId || null, Math.min(Math.max(Number(limit) || 200, 1), 500)]
  );

  const prices = rows.map(mapPrice);
  // 품목별 최신 단가(화면에서 바로 쓰는 값)
  const latest = new Map();
  for (const price of prices) {
    if (!latest.has(price.otcItemId)) latest.set(price.otcItemId, price);
  }

  return { prices, latest: [...latest.values()] };
}

/** 특정 날짜에 유효한 단가. 없으면 0. */
async function effectivePrice(otcItemId, onDate) {
  const { rows } = await pool.query(
    `select unit_price
       from public.arc_otc_prices
      where otc_item_id = $1 and effective_from <= $2
      order by effective_from desc, created_at desc
      limit 1`,
    [otcItemId, onDate]
  );

  return Number(rows[0]?.unit_price ?? 0);
}

export async function saveArcOtcPrice(input = {}, employee = null) {
  const otcItemId = text(input.otcItemId, 60);

  if (!otcItemId) {
    throw badRequest("단가를 등록할 상비약을 선택해 주세요.");
  }

  const unitPrice = Math.round(Number(input.unitPrice));

  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw badRequest("단가는 0원 이상 숫자로 입력해 주세요.");
  }

  const effectiveFrom = text(input.effectiveFrom, 10) || todayIso();

  if (!DATE_PATTERN.test(effectiveFrom)) {
    throw badRequest("적용일은 YYYY-MM-DD 형식으로 입력해 주세요.");
  }

  const { rows: itemRows } = await pool.query(
    `select id, code, name from public.arc_otc_items where id = $1`,
    [otcItemId]
  );

  if (itemRows.length === 0) {
    throw new HttpError(404, "HJ404", "상비약 품목을 찾을 수 없어요.");
  }

  const { rows } = await pool.query(
    `insert into public.arc_otc_prices
       (otc_item_id, item_code, item_name, unit_price, effective_from, note,
        employee_id, employee_name)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      otcItemId,
      itemRows[0].code,
      itemRows[0].name,
      unitPrice,
      effectiveFrom,
      text(input.note, 400),
      text(employee?.id, 60) || null,
      text(employee?.name, 60) || text(employee?.loginId, 60),
    ]
  );

  return mapPrice(rows[0]);
}

export async function deleteArcOtcPrice(priceId) {
  const { rowCount } = await pool.query(
    `delete from public.arc_otc_prices where id = $1`,
    [priceId]
  );

  if (rowCount === 0) {
    throw new HttpError(404, "HJ404", "단가 기록을 찾을 수 없어요.");
  }

  return { deleted: true };
}

/* ── 사용대장 ───────────────────────────────────────────────────────── */

async function nextUsageNo(usedOn) {
  const stamp = usedOn.replaceAll("-", "");
  const { rows } = await pool.query(
    `select count(*)::int as used
       from public.arc_otc_usages
      where usage_no like $1`,
    [`OTCU-${stamp}-%`]
  );
  const used = Number(rows[0]?.used ?? 0);

  return `OTCU-${stamp}-${String(used + 1).padStart(2, "0")}`;
}

export async function createArcOtcUsage(input = {}, employee = null) {
  const otcItemId = text(input.otcItemId, 60);

  if (!otcItemId) {
    throw badRequest("어떤 상비약을 썼는지 선택해 주세요.");
  }

  const usedOn = text(input.usedOn, 10) || todayIso();

  if (!DATE_PATTERN.test(usedOn)) {
    throw badRequest("사용일은 YYYY-MM-DD 형식으로 입력해 주세요.");
  }

  const qty = round2(input.qty);

  if (!(qty > 0)) {
    throw badRequest("사용 수량은 0보다 커야 합니다.");
  }

  const reason = text(input.reason, 600);

  if (!reason) {
    throw badRequest("왜 사용했는지(증상·상황)를 적어 주세요. 육하원칙 기록의 핵심입니다.");
  }

  const targetKind = TARGET_KINDS.has(text(input.targetKind, 20).toUpperCase())
    ? text(input.targetKind, 20).toUpperCase()
    : "SELF";

  const { rows: itemRows } = await pool.query(
    `select id, code, name, unit, qty from public.arc_otc_items where id = $1`,
    [otcItemId]
  );

  if (itemRows.length === 0) {
    throw new HttpError(404, "HJ404", "상비약 품목을 찾을 수 없어요.");
  }

  const item = itemRows[0];
  // 단가는 항상 서버가 사용일에 유효한 값으로 계산합니다.
  const unitPrice = await effectivePrice(otcItemId, usedOn);
  const amount = Math.round(qty * unitPrice);
  const client = await pool.connect();

  try {
    await client.query("begin");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const usageNo = await nextUsageNo(usedOn);
        const { rows } = await client.query(
          `insert into public.arc_otc_usages
             (id, usage_no, otc_item_id, item_code, item_name, item_unit, period,
              used_on, used_time, place, target_kind, target_employee_id, target_name,
              reason, symptom, qty, unit_price, amount, care_incident_no, note,
              employee_id, employee_name)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   $14, $15, $16, $17, $18, $19, $20, $21, $22)
           returning *`,
          [
            randomUUID(),
            usageNo,
            otcItemId,
            item.code,
            item.name,
            item.unit,
            usedOn.slice(0, 7),
            usedOn,
            text(input.usedTime, 10),
            text(input.place, 120),
            targetKind,
            text(input.targetEmployeeId, 60) || null,
            text(input.targetName, 60) ||
              text(employee?.name, 60) ||
              text(employee?.loginId, 60),
            reason,
            text(input.symptom, 400),
            qty,
            unitPrice,
            amount,
            text(input.careIncidentNo, 40),
            text(input.note, 1000),
            text(employee?.id, 60) || null,
            text(employee?.name, 60) || text(employee?.loginId, 60),
          ]
        );

        // 재고에서 사용 수량만큼 뺍니다(0 미만으로 내려가지 않게).
        await client.query(
          `update public.arc_otc_items
              set qty = greatest(qty - $2, 0), updated_at = now()
            where id = $1`,
          [otcItemId, qty]
        );

        await client.query("commit");

        return mapUsage(rows[0]);
      } catch (error) {
        if (error?.code === "23505") continue;
        throw error;
      }
    }

    throw badRequest("사용대장 번호를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listArcOtcUsages({
  period = "",
  employeeId = "",
  status = "",
  limit = 200,
} = {}) {
  const safePeriod = PERIOD_PATTERN.test(text(period, 7)) ? text(period, 7) : "";
  const safeStatus = ["ACTIVE", "VOID"].includes(text(status, 10).toUpperCase())
    ? text(status, 10).toUpperCase()
    : "";

  const { rows } = await pool.query(
    `select *
       from public.arc_otc_usages
      where ($1::text = '' or period = $1)
        and ($2::text = '' or employee_id = $2)
        and ($3::text = '' or status = $3)
      order by used_on desc, created_at desc
      limit $4`,
    [safePeriod, text(employeeId, 60), safeStatus, Math.min(Math.max(Number(limit) || 200, 1), 500)]
  );

  return rows.map(mapUsage);
}

export async function voidArcOtcUsage(usageId, input = {}, employee = null) {
  const reason = text(input.reason, 400);

  if (reason.length < 3) {
    throw badRequest("취소 사유를 적어 주세요.");
  }

  const { rows } = await pool.query(
    `select * from public.arc_otc_usages where id = $1`,
    [usageId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "사용 기록을 찾을 수 없어요.");
  }

  const usage = rows[0];

  if (usage.status === "VOID") {
    throw badRequest("이미 취소된 기록입니다.");
  }

  if (usage.settlement_id) {
    throw badRequest("정산이 요청된 기록은 취소할 수 없어요. 정산을 먼저 취소해 주세요.");
  }

  const client = await pool.connect();

  try {
    await client.query("begin");
    const { rows: updated } = await client.query(
      `update public.arc_otc_usages
          set status = 'VOID',
              void_reason = $2,
              voided_at = now(),
              voided_by_name = $3,
              updated_at = now()
        where id = $1
        returning *`,
      [usageId, reason, text(employee?.name, 60) || text(employee?.loginId, 60)]
    );

    if (usage.otc_item_id) {
      await client.query(
        `update public.arc_otc_items
            set qty = qty + $2, updated_at = now()
          where id = $1`,
        [usage.otc_item_id, usage.qty]
      );
    }

    await client.query("commit");

    return mapUsage(updated[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/* ── 정산 ───────────────────────────────────────────────────────────── */

async function nextSettlementNo(period) {
  const { rows } = await pool.query(
    `select count(*)::int as used
       from public.arc_otc_settlements
      where settlement_no like $1`,
    [`OTCS-${period}-%`]
  );
  const used = Number(rows[0]?.used ?? 0);

  return `OTCS-${period}-${String(used + 1).padStart(2, "0")}`;
}

/** 아직 정산에 묶이지 않은 사용 기록으로 지급 요청을 만듭니다. */
export async function requestArcOtcSettlement(input = {}, employee = null) {
  const period = text(input.period, 7) || todayIso().slice(0, 7);

  if (!PERIOD_PATTERN.test(period)) {
    throw badRequest("정산 기간은 YYYY-MM 형식으로 입력해 주세요.");
  }

  // 검증을 먼저 합니다(트랜잭션 안에서 실패하면 롤백 처리만 남기 때문).
  const { rows: preview } = await pool.query(
    `select count(*)::int as usage_count, coalesce(sum(amount), 0)::int as total_amount
       from public.arc_otc_usages
      where period = $1 and status = 'ACTIVE' and settlement_id is null`,
    [period]
  );

  if (Number(preview[0]?.usage_count ?? 0) === 0) {
    throw badRequest("이 기간에 정산할 사용 기록이 없어요.");
  }

  if (Number(preview[0]?.total_amount ?? 0) === 0) {
    throw badRequest(
      "이 기간 사용 기록의 금액이 0원입니다. 먼저 상비약 단가를 등록해 주세요."
    );
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows: usageRows } = await client.query(
      `select id, usage_no, used_on, item_name, qty, unit_price, amount,
              target_name, reason, employee_name
         from public.arc_otc_usages
        where period = $1
          and status = 'ACTIVE'
          and settlement_id is null
        order by used_on, usage_no
        for update`,
      [period]
    );

    if (usageRows.length === 0) {
      throw badRequest("이 기간에 정산할 사용 기록이 없어요.");
    }

    const totalAmount = usageRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    const detail = usageRows.map((row) => ({
      usageNo: row.usage_no,
      usedOn: isoDate(row.used_on),
      itemName: row.item_name,
      qty: round2(row.qty),
      unitPrice: Number(row.unit_price ?? 0),
      amount: Number(row.amount ?? 0),
      targetName: row.target_name,
      reason: row.reason,
      employeeName: row.employee_name,
    }));

    const settlementNo = await nextSettlementNo(period);
    const { rows } = await client.query(
      `insert into public.arc_otc_settlements
         (id, settlement_no, period, requested_on, usage_count, total_amount,
          status, requested_by, request_note, detail)
       values ($1, $2, $3, $4, $5, $6, 'REQUESTED', $7, $8, $9::jsonb)
       returning *`,
      [
        randomUUID(),
        settlementNo,
        period,
        todayIso(),
        usageRows.length,
        totalAmount,
        text(employee?.name, 60) || text(employee?.loginId, 60),
        text(input.note, 1000),
        JSON.stringify(detail),
      ]
    );

    await client.query(
      `update public.arc_otc_usages
          set settlement_id = $2, updated_at = now()
        where id = any($1::uuid[])`,
      [usageRows.map((row) => row.id), rows[0].id]
    );

    await client.query("commit");

    return mapSettlement(rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listArcOtcSettlements({ period = "", status = "", limit = 60 } = {}) {
  const safePeriod = PERIOD_PATTERN.test(text(period, 7)) ? text(period, 7) : "";
  const safeStatus = SETTLEMENT_STATUSES.has(text(status, 20).toUpperCase())
    ? text(status, 20).toUpperCase()
    : "";

  const { rows } = await pool.query(
    `select *
       from public.arc_otc_settlements
      where ($1::text = '' or period = $1)
        and ($2::text = '' or status = $2)
      order by period desc, created_at desc
      limit $3`,
    [safePeriod, safeStatus, Math.min(Math.max(Number(limit) || 60, 1), 200)]
  );

  return rows.map(mapSettlement);
}

/** 사장이 지급을 확인합니다(금액·방법·메모). */
export async function payArcOtcSettlement(settlementId, input = {}, employee = null) {
  const { rows: currentRows } = await pool.query(
    `select * from public.arc_otc_settlements where id = $1`,
    [settlementId]
  );

  if (currentRows.length === 0) {
    throw new HttpError(404, "HJ404", "정산 기록을 찾을 수 없어요.");
  }

  if (currentRows[0].status === "PAID") {
    throw badRequest("이미 지급 완료된 정산입니다.");
  }

  const paidOn = text(input.paidOn, 10) || todayIso();

  if (!DATE_PATTERN.test(paidOn)) {
    throw badRequest("지급일은 YYYY-MM-DD 형식으로 입력해 주세요.");
  }

  const paidAmount = Math.round(Number(input.paidAmount ?? currentRows[0].total_amount));

  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw badRequest("지급 금액은 0원 이상 숫자로 입력해 주세요.");
  }

  const paidMethod = PAY_METHODS.has(text(input.paidMethod, 20).toUpperCase())
    ? text(input.paidMethod, 20).toUpperCase()
    : "TRANSFER";

  const { rows } = await pool.query(
    `update public.arc_otc_settlements
        set status = 'PAID',
            paid_on = $2,
            paid_amount = $3,
            paid_method = $4,
            paid_note = $5,
            paid_by = $6,
            updated_at = now()
      where id = $1
      returning *`,
    [
      settlementId,
      paidOn,
      paidAmount,
      paidMethod,
      text(input.paidNote, 1000),
      text(employee?.name, 60) || text(employee?.loginId, 60),
    ]
  );

  return mapSettlement(rows[0]);
}

export async function cancelArcOtcSettlement(settlementId, input = {}) {
  const { rows: currentRows } = await pool.query(
    `select * from public.arc_otc_settlements where id = $1`,
    [settlementId]
  );

  if (currentRows.length === 0) {
    throw new HttpError(404, "HJ404", "정산 기록을 찾을 수 없어요.");
  }

  if (currentRows[0].status === "PAID") {
    throw badRequest("지급 완료된 정산은 취소할 수 없어요.");
  }

  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `update public.arc_otc_usages
          set settlement_id = null, updated_at = now()
        where settlement_id = $1`,
      [settlementId]
    );

    const { rows } = await client.query(
      `update public.arc_otc_settlements
          set status = 'CANCELED',
              request_note = case when request_note = '' then $2 else request_note || ' / ' || $2 end,
              updated_at = now()
        where id = $1
        returning *`,
      [settlementId, text(input.note, 400) || "요청 취소"]
    );

    await client.query("commit");

    return mapSettlement(rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 화면 상단 카드 — 사용액·지급액·미지급액.
 * period 를 주면 그 달, 없으면 전체 기간입니다.
 */
export async function arcOtcLedgerSummary({ period = "" } = {}) {
  const safePeriod = PERIOD_PATTERN.test(text(period, 7)) ? text(period, 7) : "";

  const { rows } = await pool.query(
    `select
        coalesce(sum(amount) filter (where status = 'ACTIVE'), 0)::int as used_amount,
        coalesce(sum(qty) filter (where status = 'ACTIVE'), 0)::numeric as used_qty,
        count(*) filter (where status = 'ACTIVE')::int as usage_count,
        count(*) filter (where status = 'VOID')::int as void_count,
        coalesce(sum(amount) filter (where status = 'ACTIVE' and settlement_id is null), 0)::int
          as unsettled_amount
       from public.arc_otc_usages
      where ($1::text = '' or period = $1)`,
    [safePeriod]
  );

  const { rows: paidRows } = await pool.query(
    `select
        coalesce(sum(paid_amount) filter (where status = 'PAID'), 0)::int as paid_amount,
        coalesce(sum(total_amount) filter (where status = 'REQUESTED'), 0)::int as requested_amount,
        count(*) filter (where status = 'REQUESTED')::int as requested_count
       from public.arc_otc_settlements
      where ($1::text = '' or period = $1)`,
    [safePeriod]
  );

  const { rows: itemRows } = await pool.query(
    `select item_name, sum(qty)::numeric as qty, sum(amount)::int as amount
       from public.arc_otc_usages
      where status = 'ACTIVE' and ($1::text = '' or period = $1)
      group by item_name
      order by amount desc, qty desc
      limit 10`,
    [safePeriod]
  );

  const usedAmount = Number(rows[0]?.used_amount ?? 0);
  const paidAmount = Number(paidRows[0]?.paid_amount ?? 0);

  return {
    period: safePeriod || null,
    today: todayIso(),
    usedAmount,
    usedQty: round2(rows[0]?.used_qty ?? 0),
    usageCount: Number(rows[0]?.usage_count ?? 0),
    voidCount: Number(rows[0]?.void_count ?? 0),
    unsettledAmount: Number(rows[0]?.unsettled_amount ?? 0),
    requestedAmount: Number(paidRows[0]?.requested_amount ?? 0),
    requestedCount: Number(paidRows[0]?.requested_count ?? 0),
    paidAmount,
    // 전체 기간 기준 미지급(사용액 - 지급액). 음수는 남은 선지급으로 봅니다.
    outstanding: usedAmount - paidAmount,
    topItems: itemRows.map((row) => ({
      itemName: row.item_name,
      qty: round2(row.qty),
      amount: Number(row.amount ?? 0),
    })),
  };
}
