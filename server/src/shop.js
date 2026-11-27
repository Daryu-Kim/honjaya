// P13 전자담배 예약(픽업) 판매 도메인.
//
// 화면(공개/관리자)은 이 모듈만 호출합니다. 가격·재고·성인 여부는 항상 여기서 다시 계산하고
// 클라이언트가 보낸 금액은 신뢰하지 않습니다.
//
// 예약 상태 흐름
//   REQUESTED(접수) → CONFIRMED(확정) → READY(준비완료) → PICKED_UP(픽업완료)
//   어느 단계에서든 CANCELED 가능. READY 에서 NO_SHOW(노쇼) 가능.
import { randomUUID } from "node:crypto";

import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";
import { normalizePhone } from "./points.js";

export const RESERVATION_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "READY",
  "PICKED_UP",
  "CANCELED",
  "NO_SHOW",
];

export const ACTIVE_RESERVATION_STATUSES = ["REQUESTED", "CONFIRMED", "READY"];

export const RESERVATION_STATUS_LABELS = {
  REQUESTED: "접수",
  CONFIRMED: "확정",
  READY: "준비완료",
  PICKED_UP: "픽업완료",
  CANCELED: "취소",
  NO_SHOW: "노쇼",
};

// 손님이 스스로 취소할 수 있는 상태.
const CUSTOMER_CANCELABLE = ["REQUESTED", "CONFIRMED"];

const ALLOWED_TRANSITIONS = {
  REQUESTED: ["CONFIRMED", "READY", "CANCELED"],
  CONFIRMED: ["READY", "PICKED_UP", "CANCELED"],
  READY: ["PICKED_UP", "CANCELED", "NO_SHOW"],
  PICKED_UP: [],
  CANCELED: [],
  NO_SHOW: [],
};

const MAX_ITEMS = 20;
const MAX_ITEM_QUANTITY = 20;
const MAX_NAME = 30;
const MAX_MEMO = 300;
const MAX_STATUS_MEMO = 200;
const MAX_TEXT = 200;
const MAX_DESCRIPTION = 1000;
const MAX_PRICE = 10_000_000;
const MAX_STOCK = 100_000;
const MAX_LIST = 300;
const MAX_OPTION_GROUPS = 10;
const MAX_OPTIONS = 40;

// 픽업 시각: 지금부터 20분 뒤 ~ 60일 이내.
const MIN_PICKUP_LEAD_MS = 20 * 60 * 1000;
const MAX_PICKUP_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;

const NO_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function trimText(value, maxLength = MAX_TEXT) {
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

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "y", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "n", "no", "off"].includes(normalized)) return false;

  return fallback;
}

function toIso(value) {
  if (!value) return null;

  return value instanceof Date ? value.toISOString() : String(value);
}

function assertMoney(value, label, { max = MAX_PRICE } = {}) {
  const amount = toInt(value, 0);

  if (amount < 0 || amount > max) {
    throw new HttpError(400, "HJ400", `${label} 값이 올바르지 않아요.`);
  }

  return amount;
}

function requireText(value, label, { maxLength = MAX_TEXT } = {}) {
  const text = trimText(value, maxLength);

  if (!text) {
    throw new HttpError(400, "HJ400", `${label}을 입력해 주세요.`);
  }

  return text;
}

// ── 공개 예약 요청 제한 ─────────────────────────────────────────────────────
// 서버가 한 대뿐이라 메모리 기반으로 IP 당 창(window) 제한만 둡니다.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 20;
const rateBuckets = new Map();

export function assertReservationRate(ip = "") {
  const key = trimText(ip, 60) || "unknown";
  const current = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= current) {
    if (rateBuckets.size > 500) {
      for (const [entryKey, entry] of rateBuckets) {
        if (entry.resetAt <= current) rateBuckets.delete(entryKey);
      }
    }

    rateBuckets.set(key, { count: 1, resetAt: current + RATE_WINDOW_MS });
    return;
  }

  if (bucket.count >= RATE_MAX_REQUESTS) {
    throw new HttpError(429, "HJ429", "예약 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
  }

  bucket.count += 1;
}

// ── 카테고리 ────────────────────────────────────────────────────────────────

function mapShopCategory(row) {
  return {
    id: row.id,
    name: row.name,
    memo: row.memo,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    productCount: toInt(row.product_count, 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listShopCategories({ includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `select c.*,
            (
              select count(*)::int
                from public.shop_products p
               where p.category_id = c.id
                 and p.deleted_at is null
                 and p.is_active
            ) as product_count
       from public.shop_categories c
      where ($1 or c.is_active)
      order by c.sort_order, c.name`,
    [includeInactive]
  );

  return rows.map(mapShopCategory);
}

export function normalizeShopCategoryInput(body = {}, { partial = false } = {}) {
  const input = body && typeof body === "object" ? body : {};
  const output = {};

  if (!partial || input.name !== undefined) {
    output.name = requireText(input.name, "카테고리 이름", { maxLength: 40 });
  }

  if (input.memo !== undefined) {
    output.memo = trimText(input.memo, MAX_MEMO);
  }

  if (input.sortOrder !== undefined) {
    output.sortOrder = toInt(input.sortOrder, 0);
  }

  if (input.isActive !== undefined) {
    output.isActive = toBool(input.isActive, true);
  }

  return output;
}

export async function createShopCategory(body = {}) {
  const input = normalizeShopCategoryInput(body);
  const id = randomUUID();

  await pool.query(
    `insert into public.shop_categories (id, name, memo, sort_order, is_active)
     values ($1, $2, $3, $4, $5)`,
    [id, input.name, input.memo ?? "", input.sortOrder ?? 0, input.isActive ?? true]
  );

  const { rows } = await pool.query(
    `select c.*,
            (
              select count(*)::int
                from public.shop_products p
               where p.category_id = c.id and p.deleted_at is null and p.is_active
            ) as product_count
       from public.shop_categories c
      where c.id = $1`,
    [id]
  );

  return mapShopCategory(rows[0]);
}

export async function updateShopCategory(categoryId, body = {}) {
  const input = normalizeShopCategoryInput(body, { partial: true });
  const columns = {
    name: "name",
    memo: "memo",
    sortOrder: "sort_order",
    isActive: "is_active",
  };
  const sets = [];
  const values = [];

  Object.entries(columns).forEach(([field, column]) => {
    if (input[field] === undefined) return;
    values.push(input[field]);
    sets.push(`${column} = $${values.length}`);
  });

  if (sets.length === 0) {
    throw new HttpError(400, "HJ400", "변경할 값이 없어요.");
  }

  values.push(categoryId);
  const { rowCount } = await pool.query(
    `update public.shop_categories
        set ${sets.join(", ")}, updated_at = now()
      where id = $${values.length}`,
    values
  );

  if (rowCount === 0) {
    throw new HttpError(404, "HJ404", "카테고리를 찾을 수 없어요.");
  }

  const { rows } = await pool.query(
    `select c.*,
            (
              select count(*)::int
                from public.shop_products p
               where p.category_id = c.id and p.deleted_at is null and p.is_active
            ) as product_count
       from public.shop_categories c
      where c.id = $1`,
    [categoryId]
  );

  return mapShopCategory(rows[0]);
}

export async function deleteShopCategory(categoryId) {
  const { rowCount: productCount } = await pool.query(
    `select 1 from public.shop_products
      where category_id = $1 and deleted_at is null
      limit 1`,
    [categoryId]
  );

  if (productCount > 0) {
    throw new HttpError(409, "HJ409", "상품이 남아 있는 카테고리는 삭제할 수 없어요.");
  }

  const { rowCount } = await pool.query(
    `delete from public.shop_categories where id = $1`,
    [categoryId]
  );

  if (rowCount === 0) {
    throw new HttpError(404, "HJ404", "카테고리를 찾을 수 없어요.");
  }

  return { id: categoryId };
}

// ── 상품 ───────────────────────────────────────────────────────────────────

function normalizeOptionGroups(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_OPTION_GROUPS).map((group, groupIndex) => {
    const source = group && typeof group === "object" ? group : {};
    const options = Array.isArray(source.options) ? source.options : [];

    return {
      groupId: trimText(source.groupId, 60) || `group_${groupIndex}`,
      groupName: trimText(source.groupName, 60) || `옵션 ${groupIndex + 1}`,
      isRequired: toBool(source.isRequired, false),
      isMultiple: toBool(source.isMultiple, false),
      minSelectCount: Math.max(0, toInt(source.minSelectCount, 0)),
      maxSelectCount: Math.max(0, toInt(source.maxSelectCount, 0)),
      sortOrder: toInt(source.sortOrder, groupIndex),
      options: options.slice(0, MAX_OPTIONS).map((option, optionIndex) => {
        const item = option && typeof option === "object" ? option : {};

        return {
          optionId: trimText(item.optionId, 60) || `option_${groupIndex}_${optionIndex}`,
          optionName: trimText(item.optionName, 60) || `옵션 ${optionIndex + 1}`,
          additionalPrice: toInt(item.additionalPrice, 0),
          isActive: toBool(item.isActive, true),
          isSoldOut: toBool(item.isSoldOut, false),
          isDefault: toBool(item.isDefault, false),
          sortOrder: toInt(item.sortOrder, optionIndex),
        };
      }),
    };
  });
}

export function normalizeShopProductInput(body = {}, { partial = false } = {}) {
  const input = body && typeof body === "object" ? body : {};
  const output = {};

  if (!partial || input.name !== undefined) {
    output.name = requireText(input.name, "상품 이름", { maxLength: 60 });
  }

  if (!partial || input.price !== undefined) {
    output.price = assertMoney(input.price, "판매가");
  }

  if (input.categoryId !== undefined) {
    output.categoryId = trimText(input.categoryId, 60);
  }

  if (input.brand !== undefined) {
    output.brand = trimText(input.brand, 40);
  }

  if (input.description !== undefined) {
    output.description = trimText(input.description, MAX_DESCRIPTION);
  }

  if (input.stock !== undefined) {
    output.stock = Math.min(MAX_STOCK, Math.max(0, toInt(input.stock, 0)));
  }

  if (input.imageUrl !== undefined) {
    output.imageUrl = trimText(input.imageUrl, 500);
  }

  if (input.optionGroups !== undefined) {
    output.optionGroups = normalizeOptionGroups(input.optionGroups);
  }

  if (input.flavorProfile !== undefined) {
    output.flavorProfile = trimText(input.flavorProfile, 100);
  }

  if (input.nicotineType !== undefined) {
    output.nicotineType = trimText(input.nicotineType, 40);
  }

  if (input.isNicotineFree !== undefined) {
    output.isNicotineFree = toBool(input.isNicotineFree, false);
  }

  if (input.isAdultOnly !== undefined) {
    output.isAdultOnly = toBool(input.isAdultOnly, true);
  }

  if (input.isActive !== undefined) {
    output.isActive = toBool(input.isActive, true);
  }

  if (input.isSoldOut !== undefined) {
    output.isSoldOut = toBool(input.isSoldOut, false);
  }

  if (input.sortOrder !== undefined) {
    output.sortOrder = toInt(input.sortOrder, 0);
  }

  return output;
}

// 진행중 예약 수량을 함께 계산합니다.
const PRODUCT_SELECT = `
  select p.*,
         coalesce((
           select sum(ri.quantity)::int
             from public.reservation_items ri
             join public.reservations r on r.id = ri.reservation_id
            where ri.product_id = p.id
              and r.status in ('REQUESTED', 'CONFIRMED', 'READY')
         ), 0) as reserved_quantity
    from public.shop_products p`;

function mapShopProduct(row) {
  const stock = toInt(row.stock, 0);
  const reservedQuantity = toInt(row.reserved_quantity, 0);

  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    brand: row.brand,
    description: row.description,
    price: toInt(row.price, 0),
    stock,
    reservedQuantity,
    availableStock: Math.max(0, stock - reservedQuantity),
    imageUrl: row.image_url,
    optionGroups: normalizeOptionGroups(row.option_groups),
    flavorProfile: row.flavor_profile,
    nicotineType: row.nicotine_type,
    isNicotineFree: row.is_nicotine_free,
    isAdultOnly: row.is_adult_only,
    isActive: row.is_active,
    isSoldOut: row.is_sold_out,
    sortOrder: toInt(row.sort_order, 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listShopProducts({
  categoryId = "",
  includeInactive = false,
  q = "",
} = {}) {
  const keyword = trimText(q, 40);
  const { rows } = await pool.query(
    `${PRODUCT_SELECT}
      where p.deleted_at is null
        and ($1 or p.is_active)
        and ($2 = '' or p.category_id = $2)
        and ($3 = '' or p.name ilike '%' || $3 || '%' or p.brand ilike '%' || $3 || '%')
      order by p.sort_order, p.name
      limit ${MAX_LIST}`,
    [includeInactive, trimText(categoryId, 60), keyword]
  );

  return rows.map(mapShopProduct);
}

export async function getShopProduct(productId, { includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `${PRODUCT_SELECT}
      where p.id = $1
        and p.deleted_at is null
        and ($2 or p.is_active)`,
    [productId, includeInactive]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "상품을 찾을 수 없어요.");
  }

  return mapShopProduct(rows[0]);
}

export async function createShopProduct(body = {}) {
  const input = normalizeShopProductInput(body);
  const id = randomUUID();

  await pool.query(
    `insert into public.shop_products
       (id, category_id, name, brand, description, price, stock, image_url, option_groups,
        flavor_profile, nicotine_type, is_nicotine_free, is_adult_only, is_active, is_sold_out, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      input.categoryId ?? "",
      input.name,
      input.brand ?? "",
      input.description ?? "",
      input.price,
      input.stock ?? 0,
      input.imageUrl ?? "",
      JSON.stringify(input.optionGroups ?? []),
      input.flavorProfile ?? "",
      input.nicotineType ?? "",
      input.isNicotineFree ?? false,
      input.isAdultOnly ?? true,
      input.isActive ?? true,
      input.isSoldOut ?? false,
      input.sortOrder ?? 0,
    ]
  );

  return getShopProduct(id, { includeInactive: true });
}

export async function updateShopProduct(productId, body = {}) {
  const input = normalizeShopProductInput(body, { partial: true });
  const columns = {
    categoryId: "category_id",
    name: "name",
    brand: "brand",
    description: "description",
    price: "price",
    stock: "stock",
    imageUrl: "image_url",
    flavorProfile: "flavor_profile",
    nicotineType: "nicotine_type",
    isNicotineFree: "is_nicotine_free",
    isAdultOnly: "is_adult_only",
    isActive: "is_active",
    isSoldOut: "is_sold_out",
    sortOrder: "sort_order",
  };
  const sets = [];
  const values = [];

  Object.entries(columns).forEach(([field, column]) => {
    if (input[field] === undefined) return;
    values.push(input[field]);
    sets.push(`${column} = $${values.length}`);
  });

  if (input.optionGroups !== undefined) {
    values.push(JSON.stringify(input.optionGroups));
    sets.push(`option_groups = $${values.length}::jsonb`);
  }

  if (sets.length === 0) {
    throw new HttpError(400, "HJ400", "변경할 값이 없어요.");
  }

  values.push(productId);
  const { rowCount } = await pool.query(
    `update public.shop_products
        set ${sets.join(", ")}, updated_at = now()
      where id = $${values.length}
        and deleted_at is null`,
    values
  );

  if (rowCount === 0) {
    throw new HttpError(404, "HJ404", "상품을 찾을 수 없어요.");
  }

  return getShopProduct(productId, { includeInactive: true });
}

export async function deleteShopProduct(productId) {
  const { rowCount } = await pool.query(
    `update public.shop_products
        set deleted_at = now(), is_active = false, updated_at = now()
      where id = $1
        and deleted_at is null`,
    [productId]
  );

  if (rowCount === 0) {
    throw new HttpError(404, "HJ404", "상품을 찾을 수 없어요.");
  }

  return { id: productId };
}

// ── 예약 ───────────────────────────────────────────────────────────────────

export function generateReservationNo(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const ymd = kst.toISOString().slice(2, 10).replace(/-/g, "");
  let body = "";

  for (let index = 0; index < 4; index += 1) {
    body += NO_ALPHABET[Math.floor(Math.random() * NO_ALPHABET.length)];
  }

  return `R${ymd}-${body}`;
}

// 손님이 "r260126a7k2", " R260126 A7K2 " 처럼 입력해도 찾을 수 있게 정규화합니다.
export function normalizeReservationNo(value) {
  const raw = String(value ?? "")
    .toUpperCase()
    .replace(/[\s\-_]/g, "");

  if (!raw) return "";

  const body = raw.startsWith("R") ? raw.slice(1) : raw;

  if (body.length !== 10) return raw;

  return `R${body.slice(0, 6)}-${body.slice(6)}`;
}

function parsePickupAt(value) {
  const raw = value instanceof Date ? value : new Date(String(value ?? ""));

  if (Number.isNaN(raw.getTime())) {
    throw new HttpError(400, "HJ400", "픽업 희망 일시를 선택해 주세요.");
  }

  const now = Date.now();

  if (raw.getTime() < now + MIN_PICKUP_LEAD_MS) {
    throw new HttpError(400, "HJ400", "픽업 시간은 지금부터 20분 뒤 이후로 선택해 주세요.");
  }

  if (raw.getTime() > now + MAX_PICKUP_AHEAD_MS) {
    throw new HttpError(400, "HJ400", "픽업 시간은 60일 이내로 선택해 주세요.");
  }

  return raw;
}

function normalizeReservationItems(value) {
  const list = Array.isArray(value) ? value : [];

  if (list.length === 0) {
    throw new HttpError(400, "HJ400", "예약할 상품을 선택해 주세요.");
  }

  if (list.length > MAX_ITEMS) {
    throw new HttpError(400, "HJ400", `한 번에 ${MAX_ITEMS}종류까지 예약할 수 있어요.`);
  }

  return list.map((entry) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const productId = trimText(item.productId, 60);
    const quantity = toInt(item.quantity, 0);

    if (!productId) {
      throw new HttpError(400, "HJ400", "상품을 선택해 주세요.");
    }

    if (quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      throw new HttpError(
        400,
        "HJ400",
        `상품 수량은 1~${MAX_ITEM_QUANTITY}개까지 선택할 수 있어요.`
      );
    }

    const optionIds = Array.isArray(item.optionIds)
      ? item.optionIds.map((optionId) => trimText(optionId, 60)).filter(Boolean)
      : [];

    return { productId, quantity, optionIds: [...new Set(optionIds)] };
  });
}

// 선택한 옵션이 실제 옵션 그룹에 속하는지 확인하고 추가금을 계산합니다.
function resolveOptions(product, optionIds) {
  const groups = normalizeOptionGroups(product.option_groups);
  const selected = new Map();
  const optionNames = [];
  let additionalPrice = 0;

  optionIds.forEach((optionId) => {
    let matched = null;

    groups.forEach((group) => {
      group.options.forEach((option) => {
        if (option.optionId === optionId) {
          matched = { group, option };
        }
      });
    });

    if (!matched) {
      throw new HttpError(400, "HJ400", `${product.name} 상품에 없는 옵션이 있어요.`);
    }

    if (matched.option.isActive === false || matched.option.isSoldOut === true) {
      throw new HttpError(400, "HJ400", `${matched.option.optionName} 옵션은 지금 선택할 수 없어요.`);
    }

    if (!selected.has(matched.group.groupId)) {
      selected.set(matched.group.groupId, []);
    }

    selected.get(matched.group.groupId).push(matched.option);
    optionNames.push(matched.option.optionName);
    additionalPrice += toInt(matched.option.additionalPrice, 0);
  });

  groups.forEach((group) => {
    const picked = selected.get(group.groupId) ?? [];
    const minSelect = group.isRequired ? Math.max(1, group.minSelectCount) : group.minSelectCount;

    if (picked.length < minSelect) {
      throw new HttpError(400, "HJ400", `${group.groupName} 옵션을 선택해 주세요.`);
    }

    if (!group.isMultiple && picked.length > 1) {
      throw new HttpError(400, "HJ400", `${group.groupName} 옵션은 하나만 선택할 수 있어요.`);
    }

    if (group.maxSelectCount > 0 && picked.length > group.maxSelectCount) {
      throw new HttpError(
        400,
        "HJ400",
        `${group.groupName} 옵션은 ${group.maxSelectCount}개까지 선택할 수 있어요.`
      );
    }
  });

  return {
    optionText: optionNames.join(" / "),
    unitPrice: Math.max(0, toInt(product.price, 0) + additionalPrice),
  };
}

function mapReservationItem(row) {
  return {
    id: row.id,
    productId: row.product_id ?? "",
    productName: row.product_name,
    brand: row.brand,
    optionText: row.option_text,
    unitPrice: toInt(row.unit_price, 0),
    quantity: toInt(row.quantity, 0),
    lineAmount: toInt(row.line_amount, 0),
    isAdultOnly: row.is_adult_only,
  };
}

function mapReservation(row, items = []) {
  return {
    id: row.id,
    reservationNo: row.reservation_no,
    customerId: row.customer_id ?? "",
    customerName: row.customer_name,
    phone: row.phone,
    pickupAt: toIso(row.pickup_at),
    status: row.status,
    statusLabel: RESERVATION_STATUS_LABELS[row.status] ?? row.status,
    totalAmount: toInt(row.total_amount, 0),
    itemCount: toInt(row.item_count, 0),
    isAdultOrder: row.is_adult_order,
    adultCheckedAt: toIso(row.adult_checked_at),
    adultCheckedBy: row.adult_checked_by,
    memo: row.memo,
    statusMemo: row.status_memo,
    pickedUpAt: toIso(row.picked_up_at),
    canceledAt: toIso(row.canceled_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    items: items.map(mapReservationItem),
  };
}

async function loadReservationItems(client, reservationIds) {
  if (reservationIds.length === 0) return new Map();

  const { rows } = await client.query(
    `select *
       from public.reservation_items
      where reservation_id = any($1::text[])
      order by created_at`,
    [reservationIds]
  );

  const byReservation = new Map();

  rows.forEach((row) => {
    if (!byReservation.has(row.reservation_id)) {
      byReservation.set(row.reservation_id, []);
    }

    byReservation.get(row.reservation_id).push(row);
  });

  return byReservation;
}

async function nextReservationNo(client) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateReservationNo();
    const { rowCount } = await client.query(
      `select 1 from public.reservations where reservation_no = $1`,
      [candidate]
    );

    if (rowCount === 0) return candidate;
  }

  throw new HttpError(503, "HJ503", "예약번호를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
}

export async function createReservation(body = {}) {
  const input = body && typeof body === "object" ? body : {};
  const customerName = requireText(input.customerName, "이름", { maxLength: MAX_NAME });
  const phone = normalizePhone(input.phone);
  const pickupAt = parsePickupAt(input.pickupAt);
  const memo = trimText(input.memo, MAX_MEMO);
  const items = normalizeReservationItems(input.items);

  const client = await pool.connect();

  try {
    await client.query("begin");

    const productIds = [...new Set(items.map((item) => item.productId))];
    const { rows: productRows } = await client.query(
      `select * from public.shop_products
        where id = any($1::text[])
          and deleted_at is null
        for update`,
      [productIds]
    );
    const products = new Map(productRows.map((row) => [row.id, row]));

    const { rows: reservedRows } = await client.query(
      `select ri.product_id, sum(ri.quantity)::int as reserved
         from public.reservation_items ri
         join public.reservations r on r.id = ri.reservation_id
        where ri.product_id = any($1::text[])
          and r.status in ('REQUESTED', 'CONFIRMED', 'READY')
        group by ri.product_id`,
      [productIds]
    );
    const reservedByProduct = new Map(
      reservedRows.map((row) => [row.product_id, toInt(row.reserved, 0)])
    );

    const prepared = items.map((item) => {
      const product = products.get(item.productId);

      if (!product) {
        throw new HttpError(404, "HJ404", "예약할 수 없는 상품이 포함되어 있어요.");
      }

      if (product.is_active === false) {
        throw new HttpError(400, "HJ400", `${product.name} 상품은 지금 예약할 수 없어요.`);
      }

      if (product.is_sold_out === true) {
        throw new HttpError(400, "HJ400", `${product.name} 상품은 품절이에요.`);
      }

      const available =
        toInt(product.stock, 0) - toInt(reservedByProduct.get(product.id), 0);

      if (item.quantity > available) {
        throw new HttpError(
          400,
          "HJ400",
          available > 0
            ? `${product.name} 상품은 ${available}개까지 예약할 수 있어요.`
            : `${product.name} 상품은 재고가 없어 예약할 수 없어요.`
        );
      }

      const { optionText, unitPrice } = resolveOptions(product, item.optionIds);
      const lineAmount = unitPrice * item.quantity;

      return {
        productId: product.id,
        productName: product.name,
        brand: product.brand,
        optionText,
        unitPrice,
        quantity: item.quantity,
        lineAmount,
        isAdultOnly: product.is_adult_only === true,
      };
    });

    const totalAmount = prepared.reduce((sum, item) => sum + item.lineAmount, 0);
    const itemCount = prepared.reduce((sum, item) => sum + item.quantity, 0);
    const isAdultOrder = prepared.some((item) => item.isAdultOnly);
    const reservationId = randomUUID();
    const reservationNo = await nextReservationNo(client);

    const { rows: customerRows } = await client.query(
      `select id from public.customers where phone = $1 limit 1`,
      [phone]
    );
    const customerId = customerRows[0]?.id ?? null;

    await client.query(
      `insert into public.reservations
         (id, reservation_no, customer_id, customer_name, phone, pickup_at,
          total_amount, item_count, is_adult_order, memo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        reservationId,
        reservationNo,
        customerId,
        customerName,
        phone,
        pickupAt.toISOString(),
        totalAmount,
        itemCount,
        isAdultOrder,
        memo,
      ]
    );

    for (const item of prepared) {
      await client.query(
        `insert into public.reservation_items
           (id, reservation_id, product_id, product_name, brand, option_text,
            unit_price, quantity, line_amount, is_adult_only)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          reservationId,
          item.productId,
          item.productName,
          item.brand,
          item.optionText,
          item.unitPrice,
          item.quantity,
          item.lineAmount,
          item.isAdultOnly,
        ]
      );
    }

    await client.query("commit");

    const { rows } = await pool.query(
      `select * from public.reservations where id = $1`,
      [reservationId]
    );
    const itemRows = await loadReservationItems(pool, [reservationId]);

    return mapReservation(rows[0], itemRows.get(reservationId) ?? []);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getReservation(reservationId) {
  const { rows } = await pool.query(
    `select * from public.reservations where id = $1`,
    [reservationId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "예약을 찾을 수 없어요.");
  }

  const itemRows = await loadReservationItems(pool, [reservationId]);

  return mapReservation(rows[0], itemRows.get(reservationId) ?? []);
}

export async function lookupReservation({ reservationNo = "", phone = "" } = {}) {
  const normalizedNo = normalizeReservationNo(reservationNo);

  if (!normalizedNo) {
    throw new HttpError(400, "HJ400", "예약번호를 입력해 주세요.");
  }

  const normalizedPhone = normalizePhone(phone);
  const { rows } = await pool.query(
    `select * from public.reservations
      where reservation_no = $1 and phone = $2`,
    [normalizedNo, normalizedPhone]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "예약을 찾을 수 없어요. 예약번호와 연락처를 확인해 주세요.");
  }

  const itemRows = await loadReservationItems(pool, [rows[0].id]);

  return mapReservation(rows[0], itemRows.get(rows[0].id) ?? []);
}

export async function cancelReservation({ reservationNo = "", phone = "", reason = "" } = {}) {
  const reservation = await lookupReservation({ reservationNo, phone });

  if (!CUSTOMER_CANCELABLE.includes(reservation.status)) {
    throw new HttpError(
      409,
      "HJ409",
      "이미 진행된 예약은 직접 취소할 수 없어요. 매장으로 문의해 주세요."
    );
  }

  const { rows } = await pool.query(
    `update public.reservations
        set status = 'CANCELED',
            canceled_at = now(),
            status_memo = $2,
            updated_at = now()
      where id = $1
      returning *`,
    [reservation.id, trimText(reason, MAX_STATUS_MEMO) || "손님 취소"]
  );
  const itemRows = await loadReservationItems(pool, [reservation.id]);

  return mapReservation(rows[0], itemRows.get(reservation.id) ?? []);
}

export async function listReservations({
  status = "",
  from = "",
  to = "",
  q = "",
  limit = 200,
} = {}) {
  const safeStatus = RESERVATION_STATUSES.includes(status) ? status : "";
  const keyword = trimText(q, 40);
  const safeLimit = Math.min(MAX_LIST, Math.max(1, toInt(limit, 200)));
  const { rows } = await pool.query(
    `select *
       from public.reservations
      where ($1 = '' or status = $1)
        and (nullif($2, '') is null or pickup_at >= nullif($2, '')::date)
        and (nullif($3, '') is null or pickup_at < (nullif($3, '')::date + interval '1 day'))
        and ($4 = '' or customer_name ilike '%' || $4 || '%'
                      or phone like '%' || $4 || '%'
                      or reservation_no ilike '%' || $4 || '%')
      order by pickup_at asc, created_at desc
      limit ${safeLimit}`,
    [safeStatus, trimText(from, 10), trimText(to, 10), keyword]
  );

  const itemRows = await loadReservationItems(
    pool,
    rows.map((row) => row.id)
  );

  return rows.map((row) => mapReservation(row, itemRows.get(row.id) ?? []));
}

export async function updateReservation(reservationId, body = {}, { employee = null } = {}) {
  const input = body && typeof body === "object" ? body : {};
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows } = await client.query(
      `select * from public.reservations where id = $1 for update`,
      [reservationId]
    );

    if (rows.length === 0) {
      throw new HttpError(404, "HJ404", "예약을 찾을 수 없어요.");
    }

    const current = rows[0];
    const nextStatus = input.status === undefined ? current.status : String(input.status);

    if (!RESERVATION_STATUSES.includes(nextStatus)) {
      throw new HttpError(400, "HJ400", "알 수 없는 예약 상태예요.");
    }

    const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];

    if (nextStatus !== current.status && !allowed.includes(nextStatus)) {
      throw new HttpError(
        409,
        "HJ409",
        `${RESERVATION_STATUS_LABELS[current.status]} 상태에서는 ${RESERVATION_STATUS_LABELS[nextStatus]} 로 바꿀 수 없어요.`
      );
    }

    const adultChecked = toBool(input.adultChecked, false);
    let adultCheckedAt = current.adult_checked_at;
    let adultCheckedBy = current.adult_checked_by;

    if (adultChecked && !current.adult_checked_at) {
      adultCheckedAt = new Date().toISOString();
      adultCheckedBy = trimText(employee?.name, 40) || "직원";
    }

    if (nextStatus === "PICKED_UP" && current.is_adult_order && !adultCheckedAt) {
      throw new HttpError(400, "HJ400", "성인 상품이 포함된 예약이에요. 신분증 확인을 먼저 체크해 주세요.");
    }

    const sets = [];
    const values = [];

    const push = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (nextStatus !== current.status) {
      push("status", nextStatus);

      if (nextStatus === "PICKED_UP") {
        push("picked_up_at", new Date().toISOString());
      }

      if (nextStatus === "CANCELED") {
        push("canceled_at", new Date().toISOString());
      }
    }

    if (input.statusMemo !== undefined) {
      push("status_memo", trimText(input.statusMemo, MAX_STATUS_MEMO));
    }

    if (input.memo !== undefined) {
      push("memo", trimText(input.memo, MAX_MEMO));
    }

    if (input.adultChecked !== undefined) {
      push("adult_checked_at", adultChecked ? adultCheckedAt : null);
      push("adult_checked_by", adultChecked ? adultCheckedBy : "");
    }

    if (sets.length > 0) {
      values.push(reservationId);
      await client.query(
        `update public.reservations
            set ${sets.join(", ")}, updated_at = now()
          where id = $${values.length}`,
        values
      );
    }

    // 픽업완료 시점에 실제 재고를 차감합니다(진행중 예약 집계에서 빠지므로 이중 차감은 없습니다).
    if (nextStatus === "PICKED_UP" && current.status !== "PICKED_UP") {
      const { rows: itemRows } = await client.query(
        `select product_id, sum(quantity)::int as quantity
           from public.reservation_items
          where reservation_id = $1
          group by product_id`,
        [reservationId]
      );

      for (const item of itemRows) {
        if (!item.product_id) continue;

        await client.query(
          `update public.shop_products
              set stock = greatest(0, stock - $2), updated_at = now()
            where id = $1`,
          [item.product_id, toInt(item.quantity, 0)]
        );
      }
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return getReservation(reservationId);
}

export async function reservationSummary({ date = "" } = {}) {
  const targetDate = trimText(date, 10);
  const { rows } = await pool.query(
    `select status,
            count(*)::int as count
       from public.reservations
      where (nullif($1, '') is null or (pickup_at >= nullif($1, '')::date and pickup_at < (nullif($1, '')::date + interval '1 day')))
      group by status`,
    [targetDate]
  );
  const counts = Object.fromEntries(RESERVATION_STATUSES.map((status) => [status, 0]));

  rows.forEach((row) => {
    counts[row.status] = toInt(row.count, 0);
  });

  const { rows: adultRows } = await pool.query(
    `select count(*)::int as count
       from public.reservations
      where is_adult_order
        and adult_checked_at is null
        and status in ('REQUESTED', 'CONFIRMED', 'READY')
        and (nullif($1, '') is null or (pickup_at >= nullif($1, '')::date and pickup_at < (nullif($1, '')::date + interval '1 day')))`,
    [targetDate]
  );

  return {
    date: targetDate,
    counts,
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    adultCheckPending: toInt(adultRows[0]?.count, 0),
  };
}
