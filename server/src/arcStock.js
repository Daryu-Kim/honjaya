// P14 — ARC SAFETY 재고·유효기간(EXP)·직원 개인 상비약(P14B) 도메인 로직.
//
// 규칙
//   * 재고 수량은 arc_item_lots 에만 있고, arc_stock_moves 를 통해서만 바뀝니다.
//     다른 코드에서 lot.qty 를 직접 고치지 않습니다.
//   * 수량을 바꾸는 모든 경로는 트랜잭션 안에서 lot 을 잠그고 처리합니다.
//   * 직원 개인 상비약(OTC)은 사업주 재고와 섞지 않습니다(별도 테이블).
//   * 만료·부족 알림은 dedupeKey 로 같은 조건이 하루에 한 번만 쌓입니다.
import { randomUUID } from "node:crypto";

import { createArcNotification, getArcSettings } from "./arc.js";
import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";

export const ARC_MOVE_KINDS = ["IN", "OUT", "OPEN", "DISPOSE", "ADJUST"];
export const ARC_ACCESS_LEVELS = ["A", "B", "C"];
export const ARC_EXPIRY_BUCKETS = [90, 30, 7];
export const ARC_OTC_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const ALERT_SCAN_COOLDOWN_MS = 30 * 60 * 1000;
let lastAlertScanAt = 0;

// ── 공통 ────────────────────────────────────────────────────────────────────

function num(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function requireQty(value, field = "수량", { allowZero = false, allowNegative = false } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw badRequest(`${field}을(를) 숫자로 입력해 주세요.`);
  }

  if (!allowNegative && parsed < 0) {
    throw badRequest(`${field}은(는) 0 이상이어야 해요.`);
  }

  if (!allowZero && parsed === 0) {
    throw badRequest(`${field}은(는) 0이 아닌 값이어야 해요.`);
  }

  if (Math.abs(parsed) > 1_000_000) {
    throw badRequest(`${field}이 너무 커요.`);
  }

  return round2(parsed);
}

// 비어 있으면 기본값으로 채우고, 값이 있으면 0 이상 숫자로 검증합니다.
function optionalQty(value, fallback, field) {
  if (value === undefined || value === null || value === "") {
    return round2(Math.max(num(fallback), 0));
  }

  return requireQty(value, field, { allowZero: true });
}

function requireDate(value, field) {
  const raw = text(value, 20);

  if (!raw) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw badRequest(`${field}은(는) YYYY-MM-DD 형식으로 입력해 주세요.`);
  }

  return raw;
}

function todayIso() {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();

  return new Date(now.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function currentArcPeriod(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const local = new Date(date.getTime() + offsetMinutes * 60_000);

  return local.toISOString().slice(0, 7);
}

function normalizePeriod(value, fallback = currentArcPeriod()) {
  const raw = text(value, 7);

  if (!raw) return fallback;

  if (!ARC_OTC_PERIOD_PATTERN.test(raw)) {
    throw badRequest("기간은 YYYY-MM 형식으로 입력해 주세요.");
  }

  return raw;
}

/** 오늘 기준 남은 일수. 지난 날짜면 음수. */
function daysUntil(value) {
  if (!value) return null;

  const target = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);

  if (Number.isNaN(target.getTime())) return null;

  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** 만료 등급: EXPIRED / D7 / D30 / D90 / OK */
function expiryBucket(daysLeft) {
  if (daysLeft === null) return "OK";
  if (daysLeft < 0) return "EXPIRED";
  if (daysLeft <= 7) return "D7";
  if (daysLeft <= 30) return "D30";
  if (daysLeft <= 90) return "D90";

  return "OK";
}

export function expiryBucketForDays(daysLeft) {
  return expiryBucket(daysLeft);
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

// ── 품목 마스터 ─────────────────────────────────────────────────────────────

const ITEM_AGGREGATE = `
  select i.*,
         coalesce(sum(l.qty) filter (where l.disposed_at is null), 0) as qty,
         count(l.id) filter (where l.disposed_at is null and l.qty > 0) as lot_count,
         min(l.expires_on) filter (where l.disposed_at is null and l.qty > 0) as expires_on,
         min(
           case
             when l.opened_at is not null and l.after_open_hours is not null
               then l.opened_at + make_interval(hours => l.after_open_hours)
           end
         ) filter (where l.disposed_at is null and l.qty > 0) as use_by_at
    from public.arc_items i
    left join public.arc_item_lots l on l.item_id = i.id
`;

function mapItem(row) {
  const daysLeft = daysUntil(row.expires_on);
  const useByAt = row.use_by_at ? new Date(row.use_by_at) : null;
  const useByDaysLeft = useByAt
    ? Math.round((useByAt.getTime() - Date.now()) / 86_400_000)
    : null;
  const qty = round2(row.qty);
  const baselineQty = round2(row.baseline_qty);
  const minQty = round2(row.min_qty);
  const reorderQty = round2(row.reorder_qty);
  const lowStock = minQty > 0 && qty < minQty;
  const openedOverdue = useByAt !== null && useByAt.getTime() <= Date.now();

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    spec: row.spec,
    unit: row.unit,
    accessLevel: row.access_level,
    isDevice: Boolean(row.is_device),
    baselineQty,
    minQty,
    reorderQty,
    // 부족하거나 기준 미달일 때 "몇 개 채우면 되는지"를 한 번에 보여줍니다.
    suggestedOrderQty:
      lowStock || qty < baselineQty
        ? round2(Math.max(reorderQty, baselineQty - qty, 1))
        : 0,
    storageLocation: row.storage_location,
    ownerKind: row.owner_kind,
    checkNote: row.check_note,
    note: row.note,
    active: Boolean(row.active),
    sortOrder: row.sort_order,
    qty,
    lotCount: Number(row.lot_count ?? 0),
    expiresOn: row.expires_on ? String(row.expires_on).slice(0, 10) : null,
    daysLeft,
    expiryBucket: expiryBucket(daysLeft),
    useByAt: useByAt ? useByAt.toISOString() : null,
    useByDaysLeft,
    openedOverdue,
    belowBaseline: qty < baselineQty,
    lowStock,
    updatedAt: row.updated_at,
  };
}

export async function listArcItems({
  category = null,
  accessLevel = null,
  search = "",
  includeInactive = false,
  lowOnly = false,
  expiringWithinDays = null,
} = {}) {
  const { rows } = await pool.query(
    `${ITEM_AGGREGATE}
      where ($1::boolean is true or i.active)
        and ($2::text is null or i.category = $2)
        and ($3::text is null or i.access_level = $3)
        and ($4::text = '' or i.code ilike '%' || $4 || '%' or i.name ilike '%' || $4 || '%')
      group by i.id
      order by i.sort_order, i.code`,
    [Boolean(includeInactive), category || null, accessLevel || null, text(search, 60)]
  );

  const items = rows.map(mapItem);

  if (!lowOnly && expiringWithinDays === null) {
    return items;
  }

  return items.filter((item) => {
    if (lowOnly && !(item.lowStock || item.belowBaseline || item.openedOverdue)) {
      return false;
    }

    if (expiringWithinDays !== null) {
      if (item.daysLeft === null) return false;

      return item.daysLeft <= Number(expiringWithinDays);
    }

    return true;
  });
}

export async function getArcItem(itemId) {
  const { rows } = await pool.query(
    `${ITEM_AGGREGATE}
      where i.id = $1
      group by i.id`,
    [itemId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "품목을 찾을 수 없어요.");
  }

  return mapItem(rows[0]);
}

function normalizeItemInput(input = {}, current = null) {
  const code = text(input.code ?? current?.code, 40).toUpperCase();
  const name = text(input.name ?? current?.name, 120);
  const accessLevel = text(input.accessLevel ?? current?.accessLevel ?? "A", 1).toUpperCase();
  const ownerKind = text(input.ownerKind ?? current?.ownerKind ?? "SHOP", 10).toUpperCase();

  if (!code) throw badRequest("품목 코드를 입력해 주세요.");
  if (!name) throw badRequest("품목명을 입력해 주세요.");
  if (!ARC_ACCESS_LEVELS.includes(accessLevel)) {
    throw badRequest("접근등급은 A·B·C 중 하나예요.");
  }
  if (!["SHOP", "RN", "STAFF"].includes(ownerKind)) {
    throw badRequest("소유 구분이 올바르지 않아요.");
  }

  return {
    code,
    name,
    category: text(input.category ?? current?.category, 40),
    spec: text(input.spec ?? current?.spec, 120),
    unit: text(input.unit ?? current?.unit ?? "개", 10) || "개",
    accessLevel,
    isDevice: Boolean(input.isDevice ?? current?.isDevice ?? false),
    baselineQty: round2(input.baselineQty ?? current?.baselineQty ?? 0),
    minQty: round2(input.minQty ?? current?.minQty ?? 0),
    reorderQty: round2(input.reorderQty ?? current?.reorderQty ?? 0),
    storageLocation: text(input.storageLocation ?? current?.storageLocation, 120),
    ownerKind,
    checkNote: text(input.checkNote ?? current?.checkNote, 400),
    note: text(input.note ?? current?.note, 400),
    active: input.active === undefined ? current?.active ?? true : Boolean(input.active),
  };
}

export async function createArcItem(input = {}, employee = null) {
  const item = normalizeItemInput(input);

  if (item.baselineQty < 0 || item.minQty < 0) {
    throw badRequest("기준수량과 알림 기준은 0 이상이어야 해요.");
  }

  const { rows: maxRows } = await pool.query(
    `select coalesce(max(sort_order), 0) + 10 as next_sort from public.arc_items`
  );

  try {
    const { rows } = await pool.query(
      `insert into public.arc_items
         (id, code, name, category, spec, unit, access_level, is_device, baseline_qty, min_qty,
          reorder_qty, storage_location, owner_kind, check_note, note, active, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       returning id`,
      [
        randomUUID(),
        item.code,
        item.name,
        item.category,
        item.spec,
        item.unit,
        item.accessLevel,
        item.isDevice,
        item.baselineQty,
        item.minQty,
        item.reorderQty,
        item.storageLocation,
        item.ownerKind,
        item.checkNote,
        item.note,
        item.active,
        Number(maxRows[0]?.next_sort ?? 10),
      ]
    );

    return getArcItem(rows[0].id);
  } catch (error) {
    if (uniqueViolation(error)) {
      throw badRequest(`품목 코드 ${item.code} 는 이미 등록되어 있어요.`);
    }

    throw error;
  }
}

export async function updateArcItem(itemId, patch = {}, employee = null) {
  const current = await getArcItem(itemId);
  const item = normalizeItemInput({ ...patch, code: patch.code ?? current.code }, current);

  if (item.baselineQty < 0 || item.minQty < 0) {
    throw badRequest("기준수량과 알림 기준은 0 이상이어야 해요.");
  }

  try {
    await pool.query(
      `update public.arc_items
          set code = $2,
              name = $3,
              category = $4,
              spec = $5,
              unit = $6,
              access_level = $7,
              is_device = $8,
              baseline_qty = $9,
              min_qty = $10,
              reorder_qty = $11,
              storage_location = $12,
              owner_kind = $13,
              check_note = $14,
              note = $15,
              active = $16,
              updated_at = now()
        where id = $1`,
      [
        itemId,
        item.code,
        item.name,
        item.category,
        item.spec,
        item.unit,
        item.accessLevel,
        item.isDevice,
        item.baselineQty,
        item.minQty,
        item.reorderQty,
        item.storageLocation,
        item.ownerKind,
        item.checkNote,
        item.note,
        item.active,
      ]
    );
  } catch (error) {
    if (uniqueViolation(error)) {
      throw badRequest(`품목 코드 ${item.code} 는 다른 품목이 쓰고 있어요.`);
    }

    throw error;
  }

  return getArcItem(itemId);
}

// ── 로트 ────────────────────────────────────────────────────────────────────

function mapLot(row) {
  const daysLeft = daysUntil(row.expires_on);
  const useByAt =
    row.opened_at && row.after_open_hours
      ? new Date(new Date(row.opened_at).getTime() + Number(row.after_open_hours) * 3_600_000)
      : null;

  return {
    id: row.id,
    itemId: row.item_id,
    lotNo: row.lot_no,
    qty: round2(row.qty),
    expiresOn: row.expires_on ? String(row.expires_on).slice(0, 10) : null,
    daysLeft,
    expiryBucket: expiryBucket(daysLeft),
    openedAt: row.opened_at,
    afterOpenHours: row.after_open_hours === null ? null : Number(row.after_open_hours),
    useByAt: useByAt ? useByAt.toISOString() : null,
    useByOverdue: useByAt ? useByAt.getTime() <= Date.now() : false,
    disposedAt: row.disposed_at,
    note: row.note,
    createdAt: row.created_at,
  };
}

export async function listArcItemLots(itemId, { includeEmptied = false } = {}) {
  const { rows } = await pool.query(
    `select *
       from public.arc_item_lots
      where item_id = $1
        and ($2::boolean is true or (disposed_at is null and qty > 0))
      order by expires_on nulls last, created_at`,
    [itemId, Boolean(includeEmptied)]
  );

  return rows.map(mapLot);
}

/** 입고·실사 증가분을 담을 로트. 없으면 새 로트를 만듭니다. */
async function pickIntakeLot(client, itemId, lotId, { expiresOn = null } = {}) {
  if (lotId) {
    const { rows } = await client.query(
      `select * from public.arc_item_lots where id = $1 and item_id = $2 for update`,
      [lotId, itemId]
    );

    if (rows.length === 0) {
      throw new HttpError(404, "HJ404", "로트를 찾을 수 없어요.");
    }

    if (rows[0].disposed_at) {
      throw badRequest("이미 폐기된 로트예요. 새 로트로 입고해 주세요.");
    }

    return rows[0];
  }

  const { rows } = await client.query(
    `select *
       from public.arc_item_lots
      where item_id = $1
        and disposed_at is null
        and ($2::date is null or expires_on is not distinct from $2::date)
      order by created_at
      limit 1
      for update`,
    [itemId, expiresOn]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  const { rows: created } = await client.query(
    `insert into public.arc_item_lots (id, item_id, qty, expires_on)
     values ($1, $2, 0, $3)
     returning *`,
    [randomUUID(), itemId, expiresOn]
  );

  return created[0];
}

/** 유효기간이 짧은 로트부터 차감합니다. */
async function consumeLots(client, itemId, qty) {
  const { rows } = await client.query(
    `select *
       from public.arc_item_lots
      where item_id = $1
        and disposed_at is null
        and qty > 0
      order by expires_on nulls last, created_at
      for update`,
    [itemId]
  );

  const available = round2(rows.reduce((sum, row) => sum + num(row.qty), 0));

  if (available < qty) {
    throw badRequest(`재고가 부족해요. 현재 ${available} 남았어요.`);
  }

  let remaining = qty;
  const taken = [];

  for (const row of rows) {
    if (remaining <= 0) break;

    const take = Math.min(num(row.qty), remaining);
    const nextQty = round2(num(row.qty) - take);

    await client.query(
      `update public.arc_item_lots
          set qty = $2,
              disposed_at = case when $2 <= 0 then coalesce(disposed_at, now()) else disposed_at end,
              updated_at = now()
        where id = $1`,
      [row.id, nextQty]
    );

    taken.push({ lotId: row.id, qty: round2(take) });
    remaining = round2(remaining - take);
  }

  return taken;
}

async function insertMove(client, {
  itemId,
  lotId,
  kind,
  qty,
  reason,
  refType = "",
  refId = "",
  incidentNo = "",
  employee = null,
}) {
  const { rows } = await client.query(
    `insert into public.arc_stock_moves
       (id, item_id, lot_id, kind, qty, reason, ref_type, ref_id, incident_no,
        employee_id, employee_name)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [
      randomUUID(),
      itemId,
      lotId || null,
      kind,
      qty,
      text(reason, 300),
      text(refType, 40),
      text(refId, 80),
      text(incidentNo, 60),
      employee?.id ?? null,
      text(employee?.name, 60),
    ]
  );

  return rows[0];
}

/**
 * 한 트랜잭션 안에서 여러 품목을 차감할 때 쓰는 하위 함수입니다.
 * 사용대장(arcUsage)처럼 헤더 1건 + 품목 N건을 한 번에 기록하면서
 * 재고까지 함께 빼야 하는 경우에 사용합니다.
 */
export async function consumeStockInTransaction(
  client,
  itemId,
  qty,
  { reason = "", refType = "", refId = "", incidentNo = "", employee = null } = {}
) {
  const { rows } = await client.query(
    `select * from public.arc_items where id = $1 for update`,
    [itemId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "품목을 찾을 수 없어요.");
  }

  if (!rows[0].active) {
    throw badRequest("사용 중지된 품목이에요. 품목 설정에서 다시 사용으로 바꿔 주세요.");
  }

  const taken = await consumeLots(client, itemId, qty);
  const moves = [];

  for (const part of taken) {
    moves.push(
      await insertMove(client, {
        itemId,
        lotId: part.lotId,
        kind: "OUT",
        qty: part.qty,
        reason,
        refType,
        refId,
        incidentNo,
        employee,
      })
    );
  }

  return { item: rows[0], moves };
}

/**
 * 차감된 재고를 원래 로트로 되돌립니다(사용 취소).
 * 같은 참조로 이미 되돌린 기록이 있으면 두 번 되돌리지 않고 막습니다.
 */
export async function restoreStockInTransaction(
  client,
  { refType, refId, reason = "", employee = null, cancelRefType = "" } = {}
) {
  const sourceType = text(refType, 40);
  const targetId = text(refId, 80);

  if (!sourceType || !targetId) {
    throw badRequest("되돌릴 출고 기록을 찾지 못했어요.");
  }

  const backType = text(cancelRefType, 40) || `${sourceType}_VOID`;

  const { rows: done } = await client.query(
    `select 1
       from public.arc_stock_moves
      where ref_type = $1
        and ref_id = $2
      limit 1`,
    [backType, targetId]
  );

  if (done.length > 0) {
    throw badRequest("이미 재고가 되돌려진 기록이에요.");
  }

  const { rows: moves } = await client.query(
    `select *
       from public.arc_stock_moves
      where ref_type = $1
        and ref_id = $2
        and qty > 0
        and kind in ('OUT', 'DISPOSE')
      order by created_at`,
    [sourceType, targetId]
  );

  let total = 0;

  for (const move of moves) {
    const partQty = num(move.qty);

    total = round2(total + partQty);

    if (move.lot_id) {
      await client.query(
        `update public.arc_item_lots
            set qty = qty + $2,
                disposed_at = null,
                updated_at = now()
          where id = $1`,
        [move.lot_id, partQty]
      );
    }

    await insertMove(client, {
      itemId: move.item_id,
      lotId: move.lot_id,
      kind: "IN",
      qty: partQty,
      reason: reason || "사용 취소로 재고 복원",
      refType: backType,
      refId: targetId,
      incidentNo: move.incident_no,
      employee,
    });
  }

  return { restored: moves.length, qty: total };
}

export async function recordArcStockMove(input = {}, employee = null) {
  const kind = text(input.kind, 10).toUpperCase();

  if (!ARC_MOVE_KINDS.includes(kind)) {
    throw badRequest("수불 종류는 입고·사용·개봉·폐기·정정 중 하나예요.");
  }

  const itemId = text(input.itemId, 40);

  if (!itemId) throw badRequest("품목을 선택해 주세요.");

  const isAdjust = kind === "ADJUST";
  const isOpen = kind === "OPEN";
  const qty = isOpen
    ? 0
    : requireQty(input.qty, "수량", { allowNegative: isAdjust });

  return withTransaction(async (client) => {
    const { rows: itemRows } = await client.query(
      `select * from public.arc_items where id = $1 for update`,
      [itemId]
    );

    if (itemRows.length === 0) {
      throw new HttpError(404, "HJ404", "품목을 찾을 수 없어요.");
    }

    const item = itemRows[0];

    if (!item.active) {
      throw badRequest("사용 중지된 품목이에요. 품목 설정에서 다시 사용으로 바꿔 주세요.");
    }

    const base = {
      itemId,
      reason: input.reason,
      refType: input.refType,
      refId: input.refId,
      incidentNo: input.incidentNo,
      employee,
    };

    if (isOpen) {
      const lotId = text(input.lotId, 40);
      const { rows: candidates } = await client.query(
        `select *
           from public.arc_item_lots
          where item_id = $1
            and disposed_at is null
            and qty > 0
            and ($2::uuid is null or id = $2::uuid)
          order by (opened_at is not null), expires_on nulls last, created_at
          limit 1
          for update`,
        [itemId, lotId || null]
      );

      if (candidates.length === 0) {
        throw badRequest("개봉할 재고가 없어요. 먼저 입고해 주세요.");
      }

      const lot = candidates[0];

      if (lot.opened_at) {
        throw badRequest("이미 개봉된 로트예요. 개봉일시를 확인해 주세요.");
      }

      await client.query(
        `update public.arc_item_lots
            set opened_at = now(), updated_at = now()
          where id = $1`,
        [lot.id]
      );

      const move = await insertMove(client, { ...base, lotId: lot.id, kind, qty: 0 });

      return {
        move: mapMove(move),
        item: await getArcItem(itemId),
        lot: mapLot({ ...lot, opened_at: new Date(), qty: num(lot.qty) }),
      };
    }

    if (kind === "IN") {
      const lot = await pickIntakeLot(client, itemId, text(input.lotId, 40), {
        expiresOn: requireDate(input.expiresOn, "유효기간"),
      });

      await client.query(
        `update public.arc_item_lots
            set qty = qty + $2, updated_at = now()
          where id = $1`,
        [lot.id, qty]
      );

      const move = await insertMove(client, { ...base, lotId: lot.id, kind, qty });

      return { move: mapMove(move), item: await getArcItem(itemId) };
    }

    if (kind === "OUT" || kind === "DISPOSE") {
      const taken = await consumeLots(client, itemId, qty);
      const moves = [];

      for (const part of taken) {
        const move = await insertMove(client, {
          ...base,
          lotId: part.lotId,
          kind,
          qty: part.qty,
        });

        moves.push(mapMove(move));
      }

      return { moves, item: await getArcItem(itemId) };
    }

    // ADJUST — 실사·정정. 증가는 로트에 더하고, 감소는 짧은 유효기간부터 차감합니다.
    if (qty > 0) {
      const lot = await pickIntakeLot(client, itemId, text(input.lotId, 40));

      await client.query(
        `update public.arc_item_lots
            set qty = qty + $2, updated_at = now()
          where id = $1`,
        [lot.id, qty]
      );

      const move = await insertMove(client, { ...base, lotId: lot.id, kind, qty });

      return { move: mapMove(move), item: await getArcItem(itemId) };
    }

    const taken = await consumeLots(client, itemId, Math.abs(qty));
    const moves = [];

    for (const part of taken) {
      const move = await insertMove(client, {
        ...base,
        lotId: part.lotId,
        kind,
        qty: -part.qty,
      });

      moves.push(mapMove(move));
    }

    return { moves, item: await getArcItem(itemId) };
  });
}

function mapMove(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    lotId: row.lot_id,
    kind: row.kind,
    qty: round2(row.qty),
    reason: row.reason,
    refType: row.ref_type,
    refId: row.ref_id,
    incidentNo: row.incident_no,
    employeeName: row.employee_name,
    createdAt: row.created_at,
  };
}

export async function listArcStockMoves({ itemId = null, limit = 50 } = {}) {
  const { rows } = await pool.query(
    `select m.*, i.code as item_code, i.name as item_name, i.unit as item_unit
       from public.arc_stock_moves m
       join public.arc_items i on i.id = m.item_id
      where ($1::uuid is null or m.item_id = $1::uuid)
      order by m.created_at desc
      limit $2`,
    [itemId || null, Math.min(Math.max(Number(limit) || 50, 1), 300)]
  );

  return rows.map((row) => ({
    ...mapMove(row),
    itemCode: row.item_code,
    itemName: row.item_name,
    itemUnit: row.item_unit,
  }));
}

// ── 만료·부족 알림 ──────────────────────────────────────────────────────────

function levelForDays(daysLeft, warnDays) {
  if (daysLeft < 0 || daysLeft <= 7) return "CRITICAL";
  if (daysLeft <= warnDays) return "WARN";

  return "INFO";
}

function bucketKey(daysLeft) {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 7) return "7";
  if (daysLeft <= 30) return "30";

  return "90";
}

/**
 * 유효기간 90/30/7일·개봉 후 사용기한 초과·재고 부족·상비약 EXP 를 점검해
 * 알림함에 쌓습니다. 같은 조건은 dedupeKey 로 한 번만 만들어집니다.
 */
export async function scanArcStockAlerts({ force = false } = {}) {
  const now = Date.now();

  if (!force && now - lastAlertScanAt < ALERT_SCAN_COOLDOWN_MS) {
    return { skipped: true, created: 0 };
  }

  lastAlertScanAt = now;

  const created = [];

  const settings = await getArcSettings();
  const warnDays = Math.max(Number.parseInt(settings.expiryAlertDays, 10) || 30, 1);
  const windowDays = Math.max(90, warnDays);

  const { rows: expiring } = await pool.query(
    `select l.id as lot_id, l.qty, l.expires_on, i.id as item_id, i.code, i.name, i.unit
       from public.arc_item_lots l
       join public.arc_items i on i.id = l.item_id
      where i.active
        and l.disposed_at is null
        and l.qty > 0
        and l.expires_on is not null
        and l.expires_on <= current_date + $1::int
      order by l.expires_on`,
    [windowDays]
  );

  for (const row of expiring) {
    const daysLeft = daysUntil(row.expires_on);
    const level = levelForDays(daysLeft, warnDays);
    const label =
      daysLeft < 0 ? `유효기간이 ${Math.abs(daysLeft)}일 지났어요` : `유효기간 ${daysLeft}일 남았어요`;
    const notification = await createArcNotification({
      kind: "EXPIRY",
      level,
      title: `[유효기간] ${row.code} ${row.name} — ${label}`,
      body: `잔량 ${round2(row.qty)}${row.unit} · EXP ${String(row.expires_on).slice(0, 10)}`,
      link: "/admin/arc/stock",
      dedupeKey: `arc:exp:${row.lot_id}:${bucketKey(daysLeft)}`,
      createdBy: "arc-stock",
    });

    if (notification) created.push(notification);
  }

  const { rows: openedOverdue } = await pool.query(
    `select l.id as lot_id, l.opened_at, l.after_open_hours, l.qty, i.code, i.name, i.unit
       from public.arc_item_lots l
       join public.arc_items i on i.id = l.item_id
      where i.active
        and l.disposed_at is null
        and l.qty > 0
        and l.opened_at is not null
        and l.after_open_hours is not null
        and l.opened_at + make_interval(hours => l.after_open_hours) <= now()`
  );

  for (const row of openedOverdue) {
    const notification = await createArcNotification({
      kind: "EXPIRY",
      level: "CRITICAL",
      title: `[개봉 후 기한 초과] ${row.code} ${row.name}`,
      body: `개봉 후 ${row.after_open_hours}시간이 지났어요. 잔량 ${round2(row.qty)}${row.unit}은 폐기 대상이에요.`,
      link: "/admin/arc/stock",
      dedupeKey: `arc:open:${row.lot_id}`,
      createdBy: "arc-stock",
    });

    if (notification) created.push(notification);
  }

  const lowStock = await listArcItems({ lowOnly: false });

  for (const item of lowStock) {
    if (!item.lowStock) continue;

    const notification = await createArcNotification({
      kind: "STOCK",
      level: "WARN",
      title: `[재고 부족] ${item.code} ${item.name}`,
      body: `현재 ${item.qty}${item.unit} · 알림 기준 ${item.minQty}${item.unit}`,
      link: "/admin/arc/stock",
      dedupeKey: `arc:stock:${item.id}:${todayIso()}`,
      createdBy: "arc-stock",
    });

    if (notification) created.push(notification);
  }

  const { rows: otcExpiring } = await pool.query(
    `select id, code, name, qty, unit, expires_on, owner_employee_id
       from public.arc_otc_items
      where active
        and expires_on is not null
        and expires_on <= current_date + $1::int`,
    [windowDays]
  );

  for (const row of otcExpiring) {
    const daysLeft = daysUntil(row.expires_on);
    const notification = await createArcNotification({
      kind: "OTC",
      level: daysLeft <= warnDays ? "WARN" : "INFO",
      title: `[개인 상비약 EXP] ${row.code} ${row.name}`,
      body: `유효기간 ${String(row.expires_on).slice(0, 10)} · 잔량 ${round2(row.qty)}${row.unit}. 소유 직원이 직접 교체해 주세요.`,
      link: "/admin/arc/otc",
      targetEmployeeId: row.owner_employee_id,
      dedupeKey: `arc:otc:${row.id}:${bucketKey(daysLeft)}`,
      createdBy: "arc-stock",
    });

    if (notification) created.push(notification);
  }

  // 직원 개인 상비약이 안전재고 아래로 내려가면 소유 직원에게 바로 알립니다.
  const { rows: otcLow } = await pool.query(
    `select id, code, name, qty, unit, min_qty, reorder_qty, owner_employee_id
       from public.arc_otc_items
      where active
        and min_qty > 0
        and qty < min_qty`
  );

  for (const row of otcLow) {
    const reorderQty = round2(row.reorder_qty) || 1;
    const notification = await createArcNotification({
      kind: "OTC",
      level: "WARN",
      title: `[개인 상비약 부족] ${row.code} ${row.name}`,
      body: `현재 ${round2(row.qty)}${row.unit} · 안전재고 ${round2(row.min_qty)}${row.unit}. ${reorderQty}${row.unit} 이상 채워 주세요.`,
      link: "/admin/arc/otc",
      targetEmployeeId: row.owner_employee_id,
      dedupeKey: `arc:otc-low:${row.id}:${todayIso()}`,
      createdBy: "arc-stock",
    });

    if (notification) created.push(notification);
  }

  return { skipped: false, created: created.length, notifications: created };
}

// ── 실사(월 1회) ────────────────────────────────────────────────────────────

const ARC_STOCKTAKE_METHODS = ["FULL", "SAMPLE", "PARTIAL"];
const ARC_STOCKTAKE_STATES = ["OK", "LOW", "DAMAGED", "EXPIRING", "DISPOSE"];

function mapStocktake(row) {
  return {
    id: row.id,
    period: row.period,
    countedOn: row.counted_on ? String(row.counted_on).slice(0, 10) : null,
    countedByName: row.counted_by_name,
    witnessName: row.witness_name ?? "",
    method: row.method ?? "FULL",
    issuesNote: row.issues_note ?? "",
    status: row.status,
    appliedAt: row.applied_at,
    appliedByName: row.applied_by_name,
    note: row.note,
    createdAt: row.created_at,
    totalItems: Number(row.total_items ?? 0),
    countedItems: Number(row.counted_items ?? 0),
    diffItems: Number(row.diff_items ?? 0),
  };
}

export async function listArcStocktakes({ limit = 24 } = {}) {
  const { rows } = await pool.query(
    `select s.*,
            (select count(*)::int from public.arc_stocktake_items t where t.stocktake_id = s.id)
              as total_items,
            (select count(*)::int from public.arc_stocktake_items t
              where t.stocktake_id = s.id and t.counted_qty is not null) as counted_items,
            (select count(*)::int from public.arc_stocktake_items t
              where t.stocktake_id = s.id and t.counted_qty is not null
                and t.counted_qty <> t.system_qty) as diff_items
       from public.arc_stocktakes s
      order by s.period desc
      limit $1`,
    [Math.min(Math.max(Number(limit) || 24, 1), 120)]
  );

  return rows.map(mapStocktake);
}

export async function getArcStocktake(stocktakeId) {
  const { rows } = await pool.query(
    `select s.*,
            (select count(*)::int from public.arc_stocktake_items t where t.stocktake_id = s.id)
              as total_items,
            (select count(*)::int from public.arc_stocktake_items t
              where t.stocktake_id = s.id and t.counted_qty is not null) as counted_items,
            (select count(*)::int from public.arc_stocktake_items t
              where t.stocktake_id = s.id and t.counted_qty is not null
                and t.counted_qty <> t.system_qty) as diff_items
       from public.arc_stocktakes s
      where s.id = $1`,
    [stocktakeId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "실사를 찾을 수 없어요.");
  }

  const { rows: items } = await pool.query(
    `select t.*, i.code, i.name, i.unit, i.category, i.baseline_qty, i.access_level
       from public.arc_stocktake_items t
       join public.arc_items i on i.id = t.item_id
      where t.stocktake_id = $1
      order by i.sort_order, i.code`,
    [stocktakeId]
  );

  return {
    stocktake: mapStocktake(rows[0]),
    items: items.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      code: row.code,
      name: row.name,
      unit: row.unit,
      category: row.category,
      accessLevel: row.access_level,
      baselineQty: round2(row.baseline_qty),
      systemQty: round2(row.system_qty),
      countedQty: row.counted_qty === null ? null : round2(row.counted_qty),
      diffQty:
        row.counted_qty === null ? null : round2(num(row.counted_qty) - num(row.system_qty)),
      reason: row.reason,
      state: row.state ?? "OK",
      action: row.action ?? "",
    })),
  };
}

export async function createArcStocktake(
  {
    period = "",
    countedOn = "",
    note = "",
    witnessName = "",
    method = "FULL",
    issuesNote = "",
  } = {},
  employee = null
) {
  const safePeriod = normalizePeriod(period);
  const safeMethod = text(method || "FULL", 10).toUpperCase();

  if (!ARC_STOCKTAKE_METHODS.includes(safeMethod)) {
    throw badRequest("실사 방법은 전수·표본·부분 중 하나예요.");
  }

  return withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      `select id from public.arc_stocktakes where period = $1`,
      [safePeriod]
    );

    if (existing.length > 0) {
      // 같은 달 실사가 이미 있으면 새로 만들지 않고 그 실사를 그대로 돌려줍니다.
      // (등록을 두 번 누르거나 지난 기록을 이어서 쓸 때 막히지 않도록)
      return { ...(await getArcStocktake(existing[0].id)), reused: true };
    }

    const { rows } = await client.query(
      `insert into public.arc_stocktakes
         (id, period, counted_on, counted_by, counted_by_name, note,
          witness_name, method, issues_note)
       values ($1, $2, coalesce($3::date, current_date), $4, $5, $6, $7, $8, $9)
       returning *`,
      [
        randomUUID(),
        safePeriod,
        requireDate(countedOn, "실사일"),
        employee?.id ?? null,
        text(employee?.name, 60),
        text(note, 300),
        text(witnessName, 60),
        safeMethod,
        text(issuesNote, 500),
      ]
    );

    const stocktakeId = rows[0].id;

    // 기준수량이 있는 사용 중 품목을 현재고와 함께 미리 채웁니다.
    await client.query(
      `insert into public.arc_stocktake_items (stocktake_id, item_id, system_qty)
       select $1, i.id, coalesce(sum(l.qty) filter (where l.disposed_at is null), 0)
         from public.arc_items i
         left join public.arc_item_lots l on l.item_id = i.id
        where i.active
        group by i.id
       on conflict (stocktake_id, item_id) do nothing`,
      [stocktakeId]
    );

    return { ...(await getArcStocktake(stocktakeId)), reused: false };
  });
}

export async function updateArcStocktake(
  stocktakeId,
  { countedOn, note, witnessName, method, issuesNote } = {}
) {
  const { rows: header } = await pool.query(
    `select * from public.arc_stocktakes where id = $1`,
    [stocktakeId]
  );

  if (header.length === 0) {
    throw new HttpError(404, "HJ404", "실사를 찾을 수 없어요.");
  }

  const current = header[0];

  if (current.status === "APPLIED") {
    throw badRequest("이미 확정된 실사는 수정할 수 없어요.");
  }

  const safeMethod = text(method ?? current.method ?? "FULL", 10).toUpperCase();

  if (!ARC_STOCKTAKE_METHODS.includes(safeMethod)) {
    throw badRequest("실사 방법은 전수·표본·부분 중 하나예요.");
  }

  await pool.query(
    `update public.arc_stocktakes
        set counted_on = $2,
            note = $3,
            witness_name = $4,
            method = $5,
            issues_note = $6
      where id = $1`,
    [
      stocktakeId,
      countedOn === undefined || countedOn === ""
        ? current.counted_on
        : requireDate(countedOn, "실사일"),
      text(note ?? current.note, 300),
      text(witnessName ?? current.witness_name, 60),
      safeMethod,
      text(issuesNote ?? current.issues_note, 500),
    ]
  );

  return getArcStocktake(stocktakeId);
}

export async function saveArcStocktakeItem(
  stocktakeId,
  itemId,
  { countedQty, reason = "", state, action } = {}
) {
  const { rows: header } = await pool.query(
    `select * from public.arc_stocktakes where id = $1`,
    [stocktakeId]
  );

  if (header.length === 0) {
    throw new HttpError(404, "HJ404", "실사를 찾을 수 없어요.");
  }

  if (header[0].status === "APPLIED") {
    throw badRequest("이미 확정된 실사는 수정할 수 없어요.");
  }

  const counted =
    countedQty === null || countedQty === undefined || countedQty === ""
      ? null
      : requireQty(countedQty, "실사 수량", { allowZero: true });

  const { rows: found } = await pool.query(
    `select state, action
       from public.arc_stocktake_items
      where stocktake_id = $1 and item_id = $2`,
    [stocktakeId, itemId]
  );

  if (found.length === 0) {
    throw new HttpError(404, "HJ404", "실사 품목을 찾을 수 없어요.");
  }

  const safeState = text(state ?? found[0].state ?? "OK", 20).toUpperCase();

  if (!ARC_STOCKTAKE_STATES.includes(safeState)) {
    throw badRequest("품목 상태 값이 올바르지 않아요.");
  }

  await pool.query(
    `update public.arc_stocktake_items
        set counted_qty = $3,
            reason = $4,
            state = $5,
            action = $6
      where stocktake_id = $1
        and item_id = $2`,
    [
      stocktakeId,
      itemId,
      counted,
      text(reason, 300),
      safeState,
      text(action ?? found[0].action, 200),
    ]
  );

  return getArcStocktake(stocktakeId);
}

/** 실사 확정: 차이가 있는 품목만 ADJUST 수불을 만들어 재고를 맞춥니다. */
export async function applyArcStocktake(stocktakeId, employee = null) {
  return withTransaction(async (client) => {
    const { rows: headerRows } = await client.query(
      `select * from public.arc_stocktakes where id = $1 for update`,
      [stocktakeId]
    );

    if (headerRows.length === 0) {
      throw new HttpError(404, "HJ404", "실사를 찾을 수 없어요.");
    }

    const header = headerRows[0];

    if (header.status === "APPLIED") {
      throw badRequest("이미 확정된 실사예요.");
    }

    const { rows: items } = await client.query(
      `select t.*, i.code, i.name, i.unit
         from public.arc_stocktake_items t
         join public.arc_items i on i.id = t.item_id
        where t.stocktake_id = $1
          and t.counted_qty is not null
          and t.counted_qty <> t.system_qty`,
      [stocktakeId]
    );

    const adjusted = [];

    for (const row of items) {
      const diff = round2(num(row.counted_qty) - num(row.system_qty));

      if (diff > 0) {
        const lot = await pickIntakeLot(client, row.item_id, null);

        await client.query(
          `update public.arc_item_lots
              set qty = qty + $2, updated_at = now()
            where id = $1`,
          [lot.id, diff]
        );

        await insertMove(client, {
          itemId: row.item_id,
          lotId: lot.id,
          kind: "ADJUST",
          qty: diff,
          reason: `${header.period} 실사 차이(+${diff}) ${row.reason}`.trim(),
          refType: "STOCKTAKE",
          refId: stocktakeId,
          employee,
        });
      } else {
        const taken = await consumeLots(client, row.item_id, Math.abs(diff));

        for (const part of taken) {
          await insertMove(client, {
            itemId: row.item_id,
            lotId: part.lotId,
            kind: "ADJUST",
            qty: -part.qty,
            reason: `${header.period} 실사 차이(-${part.qty}) ${row.reason}`.trim(),
            refType: "STOCKTAKE",
            refId: stocktakeId,
            employee,
          });
        }
      }

      adjusted.push({ code: row.code, name: row.name, unit: row.unit, diff });
    }

    await client.query(
      `update public.arc_stocktakes
          set status = 'APPLIED',
              applied_at = now(),
              applied_by = $2,
              applied_by_name = $3
        where id = $1`,
      [stocktakeId, employee?.id ?? null, text(employee?.name, 60)]
    );

    return { stocktake: (await getArcStocktake(stocktakeId)).stocktake, adjusted };
  });
}

// ── 보충·구매·실비정산 ─────────────────────────────────────────────────────

function mapPurchase(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    qty: round2(row.qty),
    unitPrice: Number(row.unit_price ?? 0),
    amount: Number(row.amount ?? 0),
    vendor: row.vendor,
    receiptNo: row.receipt_no,
    purchasedOn: row.purchased_on ? String(row.purchased_on).slice(0, 10) : null,
    reason: row.reason,
    paidBy: row.paid_by,
    evidenceKind: row.evidence_kind ?? "RECEIPT",
    settleDueOn: row.settle_due_on ? String(row.settle_due_on).slice(0, 10) : null,
    settleStatus: row.settle_status,
    settledAmount: Number(row.settled_amount ?? 0),
    approvedByName: row.approved_by_name,
    approvedAt: row.approved_at,
    employeeName: row.employee_name,
    createdAt: row.created_at,
  };
}

export async function listArcPurchases({ period = null, limit = 100 } = {}) {
  const safePeriod = text(period, 7);
  const from = safePeriod ? `${safePeriod}-01` : null;

  const { rows } = await pool.query(
    `select * from public.arc_purchases
      where ($1::date is null
             or purchased_on >= $1::date
                and purchased_on < ($1::date + interval '1 month'))
      order by purchased_on desc, created_at desc
      limit $2`,
    [from, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );

  return rows.map(mapPurchase);
}

export async function createArcPurchase(input = {}, employee = null) {
  const itemId = text(input.itemId, 40);
  const item = itemId ? await getArcItem(itemId) : null;
  const qty = requireQty(input.qty, "수량");
  const unitPrice = Math.round(num(input.unitPrice));
  const amount = Math.round(num(input.amount ?? unitPrice * qty));

  if (unitPrice < 0 || amount < 0) {
    throw badRequest("금액은 0 이상이어야 해요.");
  }

  if (!item && !text(input.itemName, 120)) {
    throw badRequest("품목을 선택하거나 품목명을 입력해 주세요.");
  }

  const created = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into public.arc_purchases
         (id, item_id, item_code, item_name, qty, unit_price, amount, vendor, receipt_no,
          purchased_on, reason, paid_by, employee_id, employee_name,
          evidence_kind, settle_due_on)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               coalesce($10::date, current_date), $11, $12, $13, $14, $15, $16)
       returning *`,
      [
        randomUUID(),
        item?.id ?? null,
        item?.code ?? "",
        item?.name ?? text(input.itemName, 120),
        qty,
        unitPrice,
        amount,
        text(input.vendor, 120),
        text(input.receiptNo, 60),
        requireDate(input.purchasedOn, "구매일"),
        text(input.reason, 300),
        ["SHOP", "RN", "OWNER", "OTHER"].includes(text(input.paidBy, 10).toUpperCase())
          ? text(input.paidBy, 10).toUpperCase()
          : "SHOP",
        employee?.id ?? null,
        text(employee?.name, 60),
        ["RECEIPT", "CARD", "TAX_INVOICE", "CASH_RECEIPT", "NONE"].includes(
          text(input.evidenceKind, 20).toUpperCase()
        )
          ? text(input.evidenceKind, 20).toUpperCase()
          : "RECEIPT",
        input.settleDueOn ? requireDate(input.settleDueOn, "정산 예정일") : null,
      ]
    );

    // 재고에 바로 반영할지 여부. 실비정산만 남길 때는 false.
    if (item && input.applyToStock !== false) {
      const lot = await pickIntakeLot(client, item.id, null, {
        expiresOn: requireDate(input.expiresOn, "유효기간"),
      });

      await client.query(
        `update public.arc_item_lots set qty = qty + $2, updated_at = now() where id = $1`,
        [lot.id, qty]
      );

      await insertMove(client, {
        itemId: item.id,
        lotId: lot.id,
        kind: "IN",
        qty,
        reason: `구매·보충 ${text(input.vendor, 40)}`.trim(),
        refType: "PURCHASE",
        refId: rows[0].id,
        employee,
      });
    }

    return mapPurchase(rows[0]);
  });

  return created;
}

export async function settleArcPurchase(purchaseId, { settledAmount, approve = false } = {}, employee = null) {
  const { rows } = await pool.query(
    `select * from public.arc_purchases where id = $1`,
    [purchaseId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "구매 기록을 찾을 수 없어요.");
  }

  const current = rows[0].amount;
  const settled = Math.min(Math.max(Math.round(num(settledAmount)), 0), current);
  const status = settled <= 0 ? "UNSETTLED" : settled >= current ? "SETTLED" : "PARTIAL";

  const { rows: updated } = await pool.query(
    `update public.arc_purchases
        set settled_amount = $2,
            settle_status = $3,
            approved_by = case when $4::boolean then $5 else approved_by end,
            approved_by_name = case when $4::boolean then $6 else approved_by_name end,
            approved_at = case when $4::boolean then now() else approved_at end
      where id = $1
      returning *`,
    [purchaseId, settled, status, Boolean(approve), employee?.id ?? null, text(employee?.name, 60)]
  );

  return mapPurchase(updated[0]);
}

// ── 직원 개인 상비약(OTC) ──────────────────────────────────────────────────

function mapOtcItem(row) {
  const daysLeft = daysUntil(row.expires_on);
  const period = currentArcPeriod();
  const qty = round2(row.qty);
  const minQty = round2(row.min_qty);
  const reorderQty = round2(row.reorder_qty);

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    qty,
    unit: row.unit,
    minQty,
    reorderQty,
    lowStock: minQty > 0 && qty < minQty,
    suggestedOrderQty: minQty > 0 && qty < minQty ? round2(Math.max(reorderQty, 1)) : 0,
    expiresOn: row.expires_on ? String(row.expires_on).slice(0, 10) : null,
    daysLeft,
    expiryBucket: expiryBucket(daysLeft),
    ownerEmployeeId: row.owner_employee_id,
    ownerName: row.owner_name,
    note: row.note,
    active: Boolean(row.active),
    sortOrder: row.sort_order,
    checkedThisPeriod: row.checked_period === period,
    lastCheckedOn: row.last_checked_on ? String(row.last_checked_on).slice(0, 10) : null,
  };
}

export async function listArcOtcItems({ employee = null, scopeAll = false, period = null } = {}) {
  const safePeriod = normalizePeriod(period);
  const onlyMine = !scopeAll;

  const { rows } = await pool.query(
    `select o.*,
            (select c.period from public.arc_otc_checks c
              where c.otc_item_id = o.id and c.period = $2) as checked_period,
            (select max(c.checked_on) from public.arc_otc_checks c
              where c.otc_item_id = o.id) as last_checked_on
       from public.arc_otc_items o
      where ($1::boolean is false or o.owner_employee_id = $3)
      order by o.sort_order, o.code`,
    [onlyMine, safePeriod, employee?.id ?? null]
  );

  return rows.map(mapOtcItem);
}

export async function claimArcOtcItems(employee = null) {
  if (!employee?.id) {
    throw badRequest("직원 정보를 확인할 수 없어요.");
  }

  const { rows } = await pool.query(
    `update public.arc_otc_items
        set owner_employee_id = $1,
            owner_name = $2,
            updated_at = now()
      where owner_employee_id is null
      returning *
      `,
    [employee.id, text(employee.name, 60)]
  );

  return { claimed: rows.length, items: rows.map(mapOtcItem) };
}

export async function createArcOtcItem(input = {}, { employee = null, canManageAll = false } = {}) {
  const name = text(input.name, 120);

  if (!name) {
    throw badRequest("상비약 이름을 입력해 주세요.");
  }

  const ownerId = canManageAll
    ? text(input.ownerEmployeeId, 40) || employee?.id || null
    : employee?.id ?? null;

  if (!ownerId) {
    throw badRequest("소유 직원을 확인할 수 없어요.");
  }

  const ownerName =
    ownerId === employee?.id
      ? text(employee?.name, 60)
      : text(input.ownerName, 60);

  let code = text(input.code, 40).toUpperCase();

  if (!code) {
    // OTC-001~013 은 원본 시드라 그 뒤 번호를 자동으로 붙입니다.
    const { rows: nextRows } = await pool.query(
      `select coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 as next_no
         from public.arc_otc_items
        where code ~ '^[A-Z]+-[0-9]+$'`
    );

    code = `OTC-${String(Number(nextRows[0]?.next_no ?? 1)).padStart(3, "0")}`;
  }

  const { rows: sortRows } = await pool.query(
    `select coalesce(max(sort_order), 0) + 10 as next_sort from public.arc_otc_items`
  );

  const qty = requireQty(input.qty ?? 0, "수량", { allowZero: true });
  // 안전재고·보충 권장량을 비우면 포장 규모를 보고 자동으로 잡아 둡니다.
  const minQty = optionalQty(input.minQty, Math.ceil(qty * 0.3), "안전재고");
  const reorderQty = optionalQty(input.reorderQty, Math.ceil(qty * 0.5), "보충 권장량");

  try {
    const { rows } = await pool.query(
      `insert into public.arc_otc_items
         (id, code, name, category, qty, unit, expires_on, owner_employee_id, owner_name,
          min_qty, reorder_qty, note, active, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, $13)
       returning *`,
      [
        randomUUID(),
        code,
        name,
        text(input.category, 40),
        qty,
        text(input.unit ?? "정", 10) || "정",
        input.expiresOn ? requireDate(input.expiresOn, "유효기간") : null,
        ownerId,
        ownerName,
        minQty,
        reorderQty,
        text(input.note, 300),
        Number(sortRows[0]?.next_sort ?? 10),
      ]
    );

    return mapOtcItem(rows[0]);
  } catch (error) {
    if (uniqueViolation(error)) {
      throw badRequest(`상비약 코드 ${code} 는 이미 등록되어 있어요.`);
    }

    throw error;
  }
}

export async function updateArcOtcItem(otcItemId, patch = {}, { employee = null, canManageAll = false } = {}) {
  const { rows } = await pool.query(`select * from public.arc_otc_items where id = $1`, [otcItemId]);

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "상비약을 찾을 수 없어요.");
  }

  const current = rows[0];
  const isOwner = current.owner_employee_id && current.owner_employee_id === employee?.id;

  if (!canManageAll && !isOwner) {
    throw new HttpError(403, "HJ403", "본인 소유 상비약만 수정할 수 있어요.");
  }

  const ownerId =
    patch.ownerEmployeeId === undefined
      ? current.owner_employee_id
      : text(patch.ownerEmployeeId, 40) || null;
  const ownerName =
    patch.ownerName === undefined
      ? current.owner_name
      : patch.ownerEmployeeId === employee?.id
        ? text(employee?.name, 60)
        : text(patch.ownerName, 60);

  const { rows: updated } = await pool.query(
    `update public.arc_otc_items
        set qty = $2,
            unit = $3,
            expires_on = $4,
            note = $5,
            active = $6,
            owner_employee_id = $7,
            owner_name = $8,
            min_qty = $9,
            reorder_qty = $10,
            updated_at = now()
      where id = $1
      returning *`,
    [
      otcItemId,
      patch.qty === undefined ? current.qty : requireQty(patch.qty, "수량", { allowZero: true }),
      text(patch.unit ?? current.unit, 10) || "정",
      patch.expiresOn === undefined
        ? current.expires_on
        : requireDate(patch.expiresOn, "유효기간"),
      text(patch.note ?? current.note, 300),
      patch.active === undefined ? current.active : Boolean(patch.active),
      ownerId,
      ownerName,
      patch.minQty === undefined ? round2(current.min_qty) : optionalQty(patch.minQty, 0, "안전재고"),
      patch.reorderQty === undefined
        ? round2(current.reorder_qty)
        : optionalQty(patch.reorderQty, 0, "보충 권장량"),
    ]
  );

  return mapOtcItem(updated[0]);
}

export async function createArcOtcCheck(otcItemId, input = {}, { employee = null, canManageAll = false } = {}) {
  const { rows } = await pool.query(`select * from public.arc_otc_items where id = $1`, [otcItemId]);

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "상비약을 찾을 수 없어요.");
  }

  const item = rows[0];
  const isOwner = item.owner_employee_id && item.owner_employee_id === employee?.id;

  if (!canManageAll && !isOwner) {
    throw new HttpError(403, "HJ403", "본인 소유 상비약만 점검할 수 있어요.");
  }

  const period = normalizePeriod(input.period);
  const qty = input.qty === undefined ? num(item.qty) : requireQty(input.qty, "수량", { allowZero: true });

  const { rows: created } = await pool.query(
    `insert into public.arc_otc_checks
       (id, otc_item_id, period, checked_on, qty, expires_on, package_ok, storage_ok,
        no_sharing_ok, care_incident_no, note, employee_id, employee_name)
     values ($1, $2, $3, coalesce($4::date, current_date), $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (otc_item_id, period) do update
        set checked_on = excluded.checked_on,
            qty = excluded.qty,
            expires_on = excluded.expires_on,
            package_ok = excluded.package_ok,
            storage_ok = excluded.storage_ok,
            no_sharing_ok = excluded.no_sharing_ok,
            care_incident_no = excluded.care_incident_no,
            note = excluded.note,
            employee_id = excluded.employee_id,
            employee_name = excluded.employee_name
     returning *`,
    [
      randomUUID(),
      otcItemId,
      period,
      requireDate(input.checkedOn, "점검일"),
      qty,
      input.expiresOn === undefined ? item.expires_on : requireDate(input.expiresOn, "유효기간"),
      input.packageOk === undefined ? true : Boolean(input.packageOk),
      input.storageOk === undefined ? true : Boolean(input.storageOk),
      input.noSharingOk === undefined ? true : Boolean(input.noSharingOk),
      text(input.careIncidentNo, 60),
      text(input.note, 300),
      employee?.id ?? null,
      text(employee?.name, 60),
    ]
  );

  // 점검에서 수량/EXP 를 고쳤으면 상비약 마스터도 같이 맞춥니다(본인 확인 기록).
  await pool.query(
    `update public.arc_otc_items
        set qty = $2, expires_on = $3, updated_at = now()
      where id = $1`,
    [otcItemId, qty, created[0].expires_on]
  );

  return {
    check: {
      id: created[0].id,
      otcItemId: created[0].otc_item_id,
      period: created[0].period,
      checkedOn: String(created[0].checked_on).slice(0, 10),
      qty: round2(created[0].qty),
      expiresOn: created[0].expires_on ? String(created[0].expires_on).slice(0, 10) : null,
      packageOk: Boolean(created[0].package_ok),
      storageOk: Boolean(created[0].storage_ok),
      noSharingOk: Boolean(created[0].no_sharing_ok),
      careIncidentNo: created[0].care_incident_no,
      note: created[0].note,
      employeeName: created[0].employee_name,
    },
    item: mapOtcItem({ ...item, qty, expires_on: created[0].expires_on }),
  };
}

export async function listArcOtcChecks({ period = null, otcItemId = null, limit = 100 } = {}) {
  const safePeriod = text(period, 7);

  const { rows } = await pool.query(
    `select c.*, o.code, o.name, o.unit
       from public.arc_otc_checks c
       join public.arc_otc_items o on o.id = c.otc_item_id
      where ($1::text = '' or c.period = $1)
        and ($2::uuid is null or c.otc_item_id = $2::uuid)
      order by c.period desc, o.sort_order
      limit $3`,
    [safePeriod, otcItemId || null, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );

  return rows.map((row) => ({
    id: row.id,
    otcItemId: row.otc_item_id,
    code: row.code,
    name: row.name,
    unit: row.unit,
    period: row.period,
    checkedOn: String(row.checked_on).slice(0, 10),
    qty: round2(row.qty),
    expiresOn: row.expires_on ? String(row.expires_on).slice(0, 10) : null,
    packageOk: Boolean(row.package_ok),
    storageOk: Boolean(row.storage_ok),
    noSharingOk: Boolean(row.no_sharing_ok),
    careIncidentNo: row.care_incident_no,
    note: row.note,
    employeeName: row.employee_name,
  }));
}

// ── 대시보드 요약 ───────────────────────────────────────────────────────────

export async function arcStockSummary({ employee = null } = {}) {
  const items = await listArcItems({ includeInactive: false });
  const period = currentArcPeriod();

  const { rows: otcRows } = await pool.query(
    `select
       (select count(*)::int from public.arc_otc_items where active and owner_employee_id = $1)
         as my_otc_items,
       (select count(*)::int from public.arc_otc_items o
         where o.active
           and o.owner_employee_id = $1
           and not exists (
             select 1 from public.arc_otc_checks c
              where c.otc_item_id = o.id and c.period = $2
           )) as my_otc_due,
       (select count(*)::int from public.arc_otc_checks where period = $2) as checks_this_period`,
    [employee?.id ?? null, period]
  );

  const { rows: purchaseRows } = await pool.query(
    `select
       count(*) filter (where settle_status <> 'SETTLED')::int as unsettled_count,
       coalesce(sum(amount - settled_amount) filter (where settle_status <> 'SETTLED'), 0)::int
         as unsettled_amount
       from public.arc_purchases`
  );

  const { rows: stocktakeRows } = await pool.query(
    `select period, status from public.arc_stocktakes order by period desc limit 1`
  );

  return {
    period,
    totalItems: items.length,
    levelCItems: items.filter((item) => item.accessLevel === "C").length,
    devices: items.filter((item) => item.isDevice).length,
    lowStock: items.filter((item) => item.lowStock).length,
    belowBaseline: items.filter((item) => item.belowBaseline).length,
    expiring7: items.filter((item) => item.daysLeft !== null && item.daysLeft <= 7).length,
    expiring30: items.filter((item) => item.daysLeft !== null && item.daysLeft <= 30).length,
    expired: items.filter((item) => item.daysLeft !== null && item.daysLeft < 0).length,
    openedOverdue: items.filter((item) => item.openedOverdue).length,
    myOtcItems: otcRows[0]?.my_otc_items ?? 0,
    myOtcDue: otcRows[0]?.my_otc_due ?? 0,
    otcChecksThisPeriod: otcRows[0]?.checks_this_period ?? 0,
    unsettledPurchaseCount: purchaseRows[0]?.unsettled_count ?? 0,
    unsettledPurchaseAmount: purchaseRows[0]?.unsettled_amount ?? 0,
    lastStocktake: stocktakeRows[0]
      ? { period: stocktakeRows[0].period, status: stocktakeRows[0].status }
      : null,
  };
}
