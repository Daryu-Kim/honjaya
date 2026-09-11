// Supabase data access layer (replaces the Firestore SDK).
//
// Naming convention:
//   * Views/lib code keeps the app's camelCase field names (productName, orderSheetId, ...).
//   * Postgres columns are snake_case (product_name, order_sheet_id, ...).
//   toAppRow() / toDbRow() translate the top level of a row; nested jsonb payloads
//   (items, optionGroups, discounts, ...) already use camelCase inside the JSON and
//   are passed through untouched.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = String(process.env.VUE_APP_SUPABASE_URL || "").trim();
const SUPABASE_KEY = String(
  process.env.VUE_APP_SUPABASE_PUBLISHABLE_KEY || ""
).trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.error(
    "Supabase 환경변수(VUE_APP_SUPABASE_URL, VUE_APP_SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았어요."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// app table name -> postgres table name
const TABLE_MAPS = {
  categories: "categories",
  products: "products",
  orderSheets: "order_sheets",
  order_sheets: "order_sheets",
  orders: "orders",
  checkoutRequests: "checkout_requests",
  checkout_requests: "checkout_requests",
  activeOrderSheets: "active_order_sheets",
  active_order_sheets: "active_order_sheets",
  chatMessages: "chat_messages",
  chat_messages: "chat_messages",
  counters: "counters",
};

// app field name -> postgres column name (keys that match are omitted)
const FIELD_MAPS = {
  categories: {
    sortOrder: "sort_order",
    isActive: "is_active",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  products: {
    productName: "product_name",
    categoryId: "category_id",
    categoryIds: "category_ids",
    basePrice: "base_price",
    imageUrl: "image_url",
    isActive: "is_active",
    isSoldOut: "is_sold_out",
    sortOrder: "sort_order",
    optionGroups: "option_groups",
    recipeText: "recipe_text",
    recipeInfo: "recipe_info",
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
  order_sheets: {
    sequenceNo: "sequence_no",
    businessDate: "business_date",
    tableNumber: "table_number",
    displayName: "display_name",
    tableNickname: "table_nickname",
    paymentStatus: "payment_status",
    paymentMethod: "payment_method",
    totalAmount: "total_amount",
    orderCount: "order_count",
    latestOrderItemsPreview: "latest_order_items_preview",
    latestOrderSummaryText: "latest_order_summary_text",
    originalAmount: "original_amount",
    discountTotal: "discount_total",
    paymentSplits: "payment_splits",
    internalTags: "internal_tags",
    createdAt: "created_at",
    updatedAt: "updated_at",
    paidAt: "paid_at",
    closedAt: "closed_at",
  },
  orders: {
    orderSheetId: "order_sheet_id",
    tableNumber: "table_number",
    displayName: "display_name",
    requestMessage: "request_message",
    totalCount: "total_count",
    totalPrice: "total_price",
    isGift: "is_gift",
    giftToTableNumber: "gift_to_table_number",
    giftToNickname: "gift_to_nickname",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  checkout_requests: {
    orderSheetId: "order_sheet_id",
    tableNumber: "table_number",
    displayName: "display_name",
    paymentMethod: "payment_method",
    originalAmount: "original_amount",
    discountTotal: "discount_total",
    totalAmount: "total_amount",
    paymentSplits: "payment_splits",
    approvedAt: "approved_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  active_order_sheets: {
    tableNumber: "table_number",
    displayName: "display_name",
    orderSheetId: "order_sheet_id",
    businessDate: "business_date",
    updatedAt: "updated_at",
  },
  chat_messages: {
    messageType: "message_type",
    tableNumber: "table_number",
    senderLabel: "sender_label",
    isDeleted: "is_deleted",
    roomType: "room_type",
    roomKey: "room_key",
    recipientTableNumber: "recipient_table_number",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  counters: {
    lastSequenceNo: "last_sequence_no",
    updatedAt: "updated_at",
  },
};

const REVERSE_FIELD_MAPS = Object.entries(FIELD_MAPS).reduce(
  (accumulator, [table, fieldMap]) => {
    accumulator[table] = Object.entries(fieldMap).reduce(
      (reverseMap, [appField, column]) => {
        reverseMap[column] = appField;

        return reverseMap;
      },
      {}
    );

    return accumulator;
  },
  {}
);

export function resolveTable(table) {
  return TABLE_MAPS[String(table || "")] || String(table || "");
}

export function toColumn(table, field) {
  const fieldMap = FIELD_MAPS[resolveTable(table)] || {};

  return fieldMap[field] || String(field);
}

// postgres row -> app object
export function toAppRow(table, row) {
  if (!row || typeof row !== "object") {
    return row;
  }

  const tableName = resolveTable(table);
  const reverseMap = REVERSE_FIELD_MAPS[tableName] || {};
  const result = {};

  Object.entries(row).forEach(([column, value]) => {
    result[reverseMap[column] || column] = value;
  });

  // order_sheets rows keep their id in the primary key column only
  if (tableName === "order_sheets") {
    result.orderSheetId = row.id;
  }

  return result;
}

// app object -> postgres row
export function toDbRow(table, payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const tableName = resolveTable(table);
  const fieldMap = FIELD_MAPS[tableName] || {};
  const result = {};

  Object.entries(payload).forEach(([field, value]) => {
    if (tableName === "order_sheets" && field === "orderSheetId") {
      return;
    }

    result[fieldMap[field] || field] = value;
  });

  return result;
}

export function nowIso() {
  return new Date().toISOString();
}

export function toTime(value) {
  if (!value) {
    return 0;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/* global globalThis */

// Firestore addDoc() used to generate ids server side; the app now generates
// them client side (crypto.randomUUID is unavailable over plain http, so the
// fallback keeps working on LAN/tablet access).
export function newId() {
  const cryptoObject =
    typeof globalThis === "undefined" ? undefined : globalThis.crypto;

  if (typeof cryptoObject?.randomUUID === "function") {
    try {
      return cryptoObject.randomUUID();
    } catch (error) {
      // insecure context: fall through to the manual generator
    }
  }

  if (typeof cryptoObject?.getRandomValues === "function") {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(10));

    return [...bytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function buildError(action, error) {
  return new Error(`${action}: ${error?.message || "알 수 없는 오류"}`);
}

function applyFilters(builder, tableName, filters) {
  let nextBuilder = builder;

  (filters || []).forEach((filter) => {
    const [field, second, third] = filter;
    const operator = third === undefined ? "eq" : second;
    const value = third === undefined ? second : third;
    const column = toColumn(tableName, field);

    switch (operator) {
      case "eq":
        nextBuilder = nextBuilder.eq(column, value);
        break;
      case "neq":
        nextBuilder = nextBuilder.neq(column, value);
        break;
      case "gt":
        nextBuilder = nextBuilder.gt(column, value);
        break;
      case "gte":
        nextBuilder = nextBuilder.gte(column, value);
        break;
      case "lt":
        nextBuilder = nextBuilder.lt(column, value);
        break;
      case "lte":
        nextBuilder = nextBuilder.lte(column, value);
        break;
      case "in":
        nextBuilder = nextBuilder.in(column, value || []);
        break;
      case "is":
        nextBuilder = nextBuilder.is(column, value);
        break;
      case "like":
        nextBuilder = nextBuilder.like(column, value);
        break;
      case "ilike":
        nextBuilder = nextBuilder.ilike(column, value);
        break;
      case "contains":
        nextBuilder = nextBuilder.contains(column, value);
        break;
      default:
        throw new Error(`지원하지 않는 조회 조건이에요: ${operator}`);
    }
  });

  return nextBuilder;
}

// fetchList("orders", {
//   columns: ["id", "totalPrice"],
//   filters: [["orderSheetId", "000241"], ["status", "in", ["REQUESTED"]]],
//   order: ["createdAt", "desc"],
//   limit: 50,
// })
export async function fetchList(table, options = {}) {
  const { columns, filters, order, limit, offset } = options;
  const tableName = resolveTable(table);
  const columnList = Array.isArray(columns)
    ? columns.map((column) => toColumn(tableName, column)).join(",")
    : columns;

  let builder = supabase
    .from(tableName)
    .select(columnList && columnList.length > 0 ? columnList : "*");

  builder = applyFilters(builder, tableName, filters);

  if (order) {
    const [field, direction] = Array.isArray(order) ? order : [order, "asc"];

    builder = builder.order(toColumn(tableName, field), {
      ascending: String(direction || "asc").toLowerCase() !== "desc",
    });
  }

  const hasLimit = Number.isFinite(limit) && limit > 0;
  const hasOffset = Number.isFinite(offset) && offset > 0;

  if (hasOffset) {
    const pageSize = hasLimit ? limit : 1000;

    builder = builder.range(offset, offset + pageSize - 1);
  } else if (hasLimit) {
    builder = builder.limit(limit);
  }

  const { data, error } = await builder;

  if (error) {
    throw buildError("데이터를 불러오지 못했어요", error);
  }

  return (data || []).map((row) => toAppRow(tableName, row));
}

export async function fetchRow(table, id) {
  const tableName = resolveTable(table);
  const safeId = String(id ?? "").trim();

  if (!safeId) {
    return null;
  }

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("id", safeId)
    .maybeSingle();

  if (error) {
    throw buildError("데이터를 불러오지 못했어요", error);
  }

  return data ? toAppRow(tableName, data) : null;
}

export async function fetchFirst(table, options = {}) {
  const rows = await fetchList(table, { ...options, limit: 1 });

  return rows[0] || null;
}

export async function insertRow(table, payload) {
  const tableName = resolveTable(table);
  const row = toDbRow(tableName, payload);
  const { data, error } = await supabase
    .from(tableName)
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    throw buildError("저장하지 못했어요", error);
  }

  return toAppRow(tableName, data || row);
}

export async function updateRow(table, id, payload) {
  const tableName = resolveTable(table);
  const row = toDbRow(tableName, payload);
  const { data, error } = await supabase
    .from(tableName)
    .update(row)
    .eq("id", String(id ?? "").trim())
    .select()
    .maybeSingle();

  if (error) {
    throw buildError("수정하지 못했어요", error);
  }

  return data ? toAppRow(tableName, data) : null;
}

export async function updateWhere(table, filters, payload) {
  const tableName = resolveTable(table);
  const row = toDbRow(tableName, payload);

  let builder = supabase.from(tableName).update(row);

  builder = applyFilters(builder, tableName, filters);

  const { data, error } = await builder.select();

  if (error) {
    throw buildError("수정하지 못했어요", error);
  }

  return (data || []).map((updatedRow) => toAppRow(tableName, updatedRow));
}

export async function upsertRow(table, payload) {
  const tableName = resolveTable(table);
  const row = toDbRow(tableName, payload);
  const { data, error } = await supabase
    .from(tableName)
    .upsert(row, { onConflict: "id" })
    .select()
    .maybeSingle();

  if (error) {
    throw buildError("저장하지 못했어요", error);
  }

  return toAppRow(tableName, data || row);
}

export async function deleteRow(table, id) {
  const tableName = resolveTable(table);
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq("id", String(id ?? "").trim());

  if (error) {
    throw buildError("삭제하지 못했어요", error);
  }
}

// Realtime replacement for onSnapshot():
//   * loads once immediately,
//   * reloads on every postgres_changes event for the table,
//   * keeps a slow poll as a safety net (pollMs: 0 disables it).
// `filter` accepts a single eq condition, e.g. ["tableNumber", "5"].
export function subscribeTable(table, reload, options = {}) {
  const tableName = resolveTable(table);
  const { filter, pollMs = 30000 } = options;
  let stopped = false;
  let pollTimer = null;

  const runReload = async () => {
    if (stopped) {
      return;
    }

    try {
      await reload();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[supabase] ${tableName} 실시간 갱신 실패`, error);
    }
  };

  runReload();

  const channelConfig = {
    event: "*",
    schema: "public",
    table: tableName,
  };

  if (filter) {
    const [field, value] = filter;

    channelConfig.filter = `${toColumn(tableName, field)}=eq.${value}`;
  }

  const channel = supabase
    .channel(`table:${tableName}:${newId().slice(0, 8)}`)
    .on("postgres_changes", channelConfig, () => {
      runReload();
    })
    .subscribe();

  if (Number.isFinite(pollMs) && pollMs > 0) {
    pollTimer = setInterval(runReload, pollMs);
  }

  return () => {
    stopped = true;

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    supabase.removeChannel(channel);
  };
}

// counters/{id}.lastSequenceNo 를 CAS 방식으로 +1 합니다 (runTransaction 대체).
export async function reserveSequenceNo(counterId = "orderSheet") {
  const safeCounterId = String(counterId || "").trim() || "orderSheet";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await fetchRow("counters", safeCounterId);
    const lastSequenceNo = Number(current?.lastSequenceNo || 0);
    const nextSequenceNo = lastSequenceNo + 1;

    if (!current) {
      await upsertRow("counters", {
        id: safeCounterId,
        lastSequenceNo: 0,
        updatedAt: nowIso(),
      });

      continue;
    }

    const { data, error } = await supabase
      .from("counters")
      .update({ last_sequence_no: nextSequenceNo, updated_at: nowIso() })
      .eq("id", safeCounterId)
      .eq("last_sequence_no", lastSequenceNo)
      .select();

    if (error) {
      throw buildError("주문서 번호를 발급하지 못했어요", error);
    }

    if (Array.isArray(data) && data.length === 1) {
      return nextSequenceNo;
    }
  }

  throw new Error(
    "주문서 번호를 발급하지 못했어요. 잠시 후 다시 시도해주세요."
  );
}
