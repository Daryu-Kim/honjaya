// P14 — ARC SAFETY 사용대장(USE) · 단가·소모금액(P14D).
//
// 규칙
//   * 사용대장은 "품목·수량·대상자 구분·사유·시각"을 남기는 재고 차감의 업무 근거입니다
//     (AS-OPS-001 §06-B-4). 상세 건강정보는 여기에 쓰지 않고 사건(INC) 상세기록에만 둡니다.
//   * 단가·금액은 사용 시점 스냅샷입니다. 나중에 구매 단가가 바뀌어도 과거 금액은 그대로 둡니다.
//   * 내구재(is_device)는 정상 사용만으로 비용을 청구하지 않으므로 금액을 0으로 계산합니다
//     (AS-OPS-001 §21 제5조).
//   * 재고 부족이면 기록 자체를 만들지 않습니다. 취소는 역분개로 원래 로트에 되돌립니다.
//   * 정산서가 연결된 사용 기록은 취소할 수 없습니다(이중 청구·정산 불일치 방지).
import { randomUUID } from "node:crypto";

import {
  consumeStockInTransaction,
  restoreStockInTransaction,
} from "./arcStock.js";
import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";

export const ARC_USAGE_TARGETS = ["GUEST", "STAFF", "VISITOR", "CHECK", "ETC"];
export const ARC_USAGE_STATUSES = ["ACTIVE", "VOID"];

const TARGET_LABELS = {
  GUEST: "고객",
  STAFF: "직원",
  VISITOR: "방문객",
  CHECK: "점검·교육",
  ETC: "기타",
};

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// ── 공통 ────────────────────────────────────────────────────────────────────

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function toInt(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function oneOf(value, allowed, fallback) {
  const raw = String(value ?? "").toUpperCase();

  return allowed.includes(raw) ? raw : fallback;
}

function requireText(value, label, max = 200) {
  const body = text(value, max);

  if (!body) {
    throw badRequest(`${label}을(를) 입력해 주세요.`);
  }

  return body;
}

async function withTransaction(run) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const result = await run(client);

    await client.query("commit");

    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function uniqueViolation(error) {
  return error?.code === "23505";
}

/** 한국시간 기준 YYYYMMDD. 컨테이너 시간대와 무관하게 번호 규칙을 유지합니다. */
function kstStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const target = Number.isNaN(date.getTime()) ? new Date() : date;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(target)
    .replace(/-/g, "");
}

/** datetime-local 값은 한국시간으로 해석합니다. */
function parseKstDateTime(value) {
  if (value instanceof Date) {
    return value;
  }

  const raw = text(value, 40);

  if (!raw) {
    return new Date();
  }

  let iso = raw;

  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      iso = `${raw}T00:00:00`;
    } else if (/T\d{2}:\d{2}$/.test(raw)) {
      iso = `${raw}:00`;
    }

    iso = `${iso}+09:00`;
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    throw badRequest("사용 일시를 올바르게 입력해 주세요.");
  }

  return date;
}

function normalizePeriod(value) {
  const raw = text(value, 7);

  return PERIOD_PATTERN.test(raw) ? raw : "";
}

function currentKstPeriod() {
  const stamp = kstStamp();

  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}`;
}

// ── 매핑 ────────────────────────────────────────────────────────────────────

const USAGE_SELECT = `
  select u.*,
         coalesce(e.expense_no, '') as expense_no,
         coalesce(agg.item_count, 0) as item_count,
         coalesce(agg.item_text, '') as item_text
    from public.arc_usages u
    left join public.arc_expenses e on e.id = u.expense_id
    left join lateral (
      select count(*)::int as item_count,
             string_agg(
               i.item_name || ' × ' || trim(to_char(i.qty, 'FM999999990.##')),
               ', ' order by i.sort_order, i.created_at
             ) as item_text
        from public.arc_usage_items i
       where i.usage_id = u.id
    ) agg on true
`;

function mapUsage(row) {
  return {
    id: row.id,
    usageNo: row.usage_no,
    usedAt: row.used_at,
    targetKind: row.target_kind,
    targetLabel: TARGET_LABELS[row.target_kind] ?? row.target_kind,
    purpose: row.purpose,
    incidentNo: row.incident_no,
    place: row.place,
    note: row.note,
    totalAmount: toInt(row.total_amount),
    billable: Boolean(row.billable),
    expenseId: row.expense_id,
    expenseNo: row.expense_no ?? "",
    status: row.status,
    voidReason: row.void_reason,
    voidedAt: row.voided_at,
    voidedByName: row.voided_by_name,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    itemCount: toInt(row.item_count),
    itemText: row.item_text ?? "",
    createdAt: row.created_at,
  };
}

function mapUsageItem(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    itemUnit: row.item_unit,
    qty: Number(row.qty),
    unitPrice: toInt(row.unit_price),
    amount: toInt(row.amount),
    isDevice: Boolean(row.is_device),
    note: row.note,
  };
}
// ── 단가 ────────────────────────────────────────────────────────────────────

/** 품목별 최근 구매 단가. 사용대장 단가 기본값으로 씁니다. */
export async function latestArcUnitPriceMap(client = pool, itemIds = []) {
  const ids = (itemIds ?? []).filter(Boolean);
  const { rows } = await client.query(
    `select distinct on (item_id)
            item_id,
            unit_price
       from public.arc_purchases
      where item_id is not null
        and unit_price > 0
        and ($1::uuid[] is null or item_id = any($1::uuid[]))
      order by item_id, purchased_on desc, created_at desc`,
    [ids.length > 0 ? ids : null]
  );

  return rows.reduce((acc, row) => {
    acc[row.item_id] = toInt(row.unit_price);

    return acc;
  }, {});
}

// ── 조회 ────────────────────────────────────────────────────────────────────

export async function listArcUsages(query = {}) {
  const period = normalizePeriod(query.period);
  const incidentNo = text(query.incidentNo, 60);
  const status =
    text(query.status, 10).toUpperCase() === "VOID"
      ? "VOID"
      : text(query.status, 10).toUpperCase() === "ACTIVE"
        ? "ACTIVE"
        : "";
  const limit = Math.min(Math.max(toInt(query.limit, 100), 1), 300);

  const { rows } = await pool.query(
    `${USAGE_SELECT}
      where ($1::text is null
             or to_char(u.used_at at time zone 'Asia/Seoul', 'YYYY-MM') = $1)
        and ($2::text = '' or u.incident_no = $2)
        and ($3::text = '' or u.status = $3)
      order by u.used_at desc, u.created_at desc
      limit $4`,
    [period || null, incidentNo, status, limit]
  );

  return rows.map(mapUsage);
}

export async function getArcUsage(id) {
  const usageId = text(id, 40);

  if (!usageId) throw badRequest("사용 기록을 찾을 수 없어요.");

  const { rows } = await pool.query(`${USAGE_SELECT} where u.id = $1::uuid`, [
    usageId,
  ]);

  if (!rows[0]) {
    throw new HttpError(404, "HJ404", "사용 기록을 찾을 수 없어요.");
  }

  const { rows: itemRows } = await pool.query(
    `select *
       from public.arc_usage_items
      where usage_id = $1::uuid
      order by sort_order, created_at`,
    [usageId]
  );

  return {
    usage: mapUsage(rows[0]),
    items: itemRows.map(mapUsageItem),
  };
}

// ── 등록 ────────────────────────────────────────────────────────────────────

async function nextUsageNo(client, usedAt) {
  const prefix = `USE-${kstStamp(usedAt)}-`;
  const { rows } = await client.query(
    `select usage_no
       from public.arc_usages
      where usage_no like $1
      order by usage_no desc
      limit 1`,
    [`${prefix}%`]
  );
  const last = rows[0]?.usage_no ?? "";
  const seq = Number.parseInt(last.slice(prefix.length), 10);

  return `${prefix}${String((Number.isFinite(seq) ? seq : 0) + 1).padStart(2, "0")}`;
}

function normalizeLines(rawLines) {
  const list = Array.isArray(rawLines) ? rawLines : [];
  const lines = [];

  list.forEach((line, index) => {
    const itemId = text(line?.itemId, 40);

    if (!itemId) return;

    const qty = round2(Number(line?.qty));

    if (!Number.isFinite(qty) || qty <= 0) {
      throw badRequest(`${index + 1}번째 품목의 수량을 확인해 주세요.`);
    }

    lines.push({
      itemId,
      qty,
      unitPrice: Math.max(toInt(line?.unitPrice, 0), 0),
      note: text(line?.note, 200),
    });
  });

  if (lines.length === 0) {
    throw badRequest("사용한 품목을 한 개 이상 선택해 주세요.");
  }

  return lines;
}

export async function createArcUsage(input = {}, employee = null) {
  const usedAt = parseKstDateTime(input.usedAt);
  const targetKind = oneOf(input.targetKind, ARC_USAGE_TARGETS, "GUEST");
  const purpose = requireText(input.purpose, "사용 사유", 300);
  const incidentNo = text(input.incidentNo, 60);
  const place = text(input.place, 60);
  const note = text(input.note, 500);
  const lines = normalizeLines(input.items);

  const created = await withTransaction(async (client) => {
    const itemIds = [...new Set(lines.map((line) => line.itemId))];
    const { rows: itemRows } = await client.query(
      `select id, code, name, unit, is_device, active
         from public.arc_items
        where id = any($1::uuid[])
        for update`,
      [itemIds]
    );
    const items = new Map(itemRows.map((row) => [row.id, row]));

    for (const line of lines) {
      const item = items.get(line.itemId);

      if (!item) {
        throw new HttpError(404, "HJ404", "품목을 찾을 수 없어요.");
      }

      if (!item.active) {
        throw badRequest(`${item.name}은(는) 사용 중지된 품목이에요.`);
      }
    }

    // 사용 시점 스냅샷. 내구재는 금액을 계산하지 않고, 소모품은 최근 구매 단가를 씁니다.
    const priceMap = await latestArcUnitPriceMap(client, itemIds);
    const snapshot = lines.map((line, index) => {
      const item = items.get(line.itemId);
      const isDevice = Boolean(item.is_device);
      const unitPrice = isDevice
        ? 0
        : toInt(priceMap[line.itemId], 0) || line.unitPrice;
      const amount = isDevice
        ? 0
        : Math.max(Math.round(round2(line.qty * unitPrice)), 0);

      return { ...line, index, item, isDevice, unitPrice, amount };
    });
    const totalAmount = snapshot.reduce((sum, line) => sum + line.amount, 0);

    let usage = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const usageNo = await nextUsageNo(client, usedAt);

      try {
        const { rows } = await client.query(
          `insert into public.arc_usages
             (id, usage_no, used_at, target_kind, purpose, incident_no, place, note,
              total_amount, billable, employee_id, employee_name)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           returning id, usage_no`,
          [
            randomUUID(),
            usageNo,
            usedAt,
            targetKind,
            purpose,
            incidentNo,
            place,
            note,
            totalAmount,
            totalAmount > 0,
            employee?.id ?? null,
            text(employee?.name, 60),
          ]
        );

        usage = rows[0];
        break;
      } catch (error) {
        if (!uniqueViolation(error) || attempt === 4) {
          throw error;
        }
      }
    }

    if (!usage) {
      throw badRequest("사용 번호를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    }

    for (const line of snapshot) {
      await consumeStockInTransaction(client, line.itemId, line.qty, {
        reason: `${usage.usage_no} 사용`,
        refType: "ARC_USAGE",
        refId: usage.id,
        incidentNo,
        employee,
      });

      await client.query(
        `insert into public.arc_usage_items
           (id, usage_id, item_id, item_code, item_name, item_unit, qty, unit_price,
            amount, is_device, note, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          randomUUID(),
          usage.id,
          line.itemId,
          line.item.code,
          line.item.name,
          line.item.unit,
          line.qty,
          line.unitPrice,
          line.amount,
          line.isDevice,
          line.note,
          line.index,
        ]
      );
    }

    return usage;
  });

  return getArcUsage(created.id);
}

/** 사용 취소. 재고를 원래 로트로 되돌리고 기록은 이력으로 남깁니다. */
export async function voidArcUsage(id, { reason = "" } = {}, employee = null) {
  const usageId = text(id, 40);

  if (!usageId) {
    throw badRequest("사용 기록을 찾을 수 없어요.");
  }

  const voidReason = requireText(reason, "취소 사유", 300);

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `select * from public.arc_usages where id = $1::uuid for update`,
      [usageId]
    );

    if (!rows[0]) {
      throw new HttpError(404, "HJ404", "사용 기록을 찾을 수 없어요.");
    }

    if (rows[0].status === "VOID") {
      throw badRequest("이미 취소된 사용 기록이에요.");
    }

    if (rows[0].expense_id) {
      throw badRequest(
        "정산서에 연결된 사용 기록은 취소할 수 없어요. 정산서를 먼저 정리해 주세요."
      );
    }

    const restore = await restoreStockInTransaction(client, {
      refType: "ARC_USAGE",
      refId: usageId,
      reason: `사용 취소 — ${voidReason}`,
      employee,
      cancelRefType: "ARC_USAGE_VOID",
    });

    await client.query(
      `update public.arc_usages
          set status = 'VOID',
              void_reason = $2,
              voided_at = now(),
              voided_by_name = $3
        where id = $1::uuid`,
      [usageId, voidReason, text(employee?.name, 60)]
    );

    return { usageNo: rows[0].usage_no, restore };
  });

  return { ...(await getArcUsage(usageId)), restore: result.restore };
}

// ── 요약·정산 대상 ──────────────────────────────────────────────────────────

export async function arcUsageSummary() {
  const period = currentKstPeriod();

  const { rows } = await pool.query(
    `select
        count(*) filter (
          where status = 'ACTIVE'
            and to_char(used_at at time zone 'Asia/Seoul', 'YYYY-MM') = $1
        )::int as month_count,
        coalesce(sum(total_amount) filter (
          where status = 'ACTIVE'
            and to_char(used_at at time zone 'Asia/Seoul', 'YYYY-MM') = $1
        ), 0)::int as month_amount,
        count(*) filter (
          where status = 'ACTIVE' and billable and expense_id is null
        )::int as unbilled_count,
        coalesce(sum(total_amount) filter (
          where status = 'ACTIVE' and billable and expense_id is null
        ), 0)::int as unbilled_amount,
        max(created_at) as last_created_at
      from public.arc_usages`,
    [period]
  );

  return {
    period,
    monthCount: toInt(rows[0]?.month_count),
    monthAmount: toInt(rows[0]?.month_amount),
    unbilledCount: toInt(rows[0]?.unbilled_count),
    unbilledAmount: toInt(rows[0]?.unbilled_amount),
    lastCreatedAt: rows[0]?.last_created_at ?? null,
  };
}

/** 아직 정산서로 묶지 않은 청구대상 사용 기록. 월 일괄 정산에서 씁니다. */
export async function listBillableUsagesForPeriod(
  client = pool,
  period = currentKstPeriod()
) {
  const target = normalizePeriod(period) || currentKstPeriod();

  const { rows } = await client.query(
    `select id, usage_no, used_at, target_kind, total_amount
       from public.arc_usages
      where status = 'ACTIVE'
        and billable
        and expense_id is null
        and to_char(used_at at time zone 'Asia/Seoul', 'YYYY-MM') = $1
      order by used_at`,
    [target]
  );

  return rows;
}