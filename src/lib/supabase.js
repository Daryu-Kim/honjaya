// Supabase data access layer (replaces the Firestore SDK).
//
// Naming convention:
//   * Views/lib code keeps the app's camelCase field names (productName, orderSheetId, ...).
//   * Postgres columns are snake_case (product_name, order_sheet_id, ...).
//   toAppRow() / toDbRow() translate the top level of a row; nested jsonb payloads
//   (items, optionGroups, discounts, ...) already use camelCase inside the JSON and
//   are passed through untouched.
import { createClient } from "@supabase/supabase-js";

// "/" 처럼 상대 경로로 지정하면 지금 접속한 오리진을 그대로 씁니다.
// 브라우저에서는 항상 같은 오리진을 사용합니다. 손님 세션이 HttpOnly 쿠키라서,
// /rest/v1 이 다른 오리진이면 쿠키가 실리지 않아 주문서 범위 제한이 동작하지 않습니다.
// (실제 API 연결은 Vercel rewrites(vercel.json) / vue.config.js devServer.proxy 가 담당합니다.)
function resolveSupabaseUrl() {
  const raw = String(process.env.VUE_APP_SUPABASE_URL || "").trim();

  if (typeof window === "undefined") {
    return raw;
  }

  const suffix = raw.startsWith("/") ? raw.replace(/\/+$/, "") : "";

  return `${window.location.origin}${suffix}`;
}

// SSE(/api/events) 는 프록시를 거치면 버퍼링될 수 있어 절대 주소를 그대로 씁니다.
// VUE_APP_EVENTS_BASE_URL 이 없으면 기존 VUE_APP_SUPABASE_URL 의 절대 주소를 재사용합니다.
function resolveEventsUrl() {
  const explicit = String(process.env.VUE_APP_EVENTS_BASE_URL || "").trim();
  const raw = String(process.env.VUE_APP_SUPABASE_URL || "").trim();
  const base = explicit || (raw.startsWith("/") ? "" : raw);

  if (base) {
    return base.replace(/\/+$/, "");
  }

  return typeof window === "undefined" ? "" : window.location.origin;
}

const SUPABASE_URL = resolveSupabaseUrl();
const EVENTS_URL = resolveEventsUrl();
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
  activeOrderSheets: "active_order_sheets",
  active_order_sheets: "active_order_sheets",
  barTables: "bar_tables",
  bar_tables: "bar_tables",
  counters: "counters",
  appSettings: "app_settings",
  app_settings: "app_settings",
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
    paidAmount: "paid_amount",
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
    guestSessionId: "guest_session_id",
    guestNickname: "guest_nickname",
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
  bar_tables: {
    tableNumber: "table_number",
    seatCapacity: "seat_capacity",
    displayName: "display_name",
    isActive: "is_active",
    sortOrder: "sort_order",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  counters: {
    lastSequenceNo: "last_sequence_no",
    updatedAt: "updated_at",
  },
  app_settings: {
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
  const message = String(error?.message || "");

  // Supabase 프로젝트가 사용량(egress) 한도 초과로 정지되면 모든 요청이 402로
  // 떨어집니다. 그대로 노출하면 손님·직원이 원인을 알 수 없어 안내 문구로 바꿉니다.
  if (
    error?.code === "402" ||
    error?.status === 402 ||
    /exceed_\w+_quota|Service for this project is restricted/i.test(message)
  ) {
    return new Error(
      `${action}: 서버 사용량 한도를 초과해 데이터 서버가 일시 정지됐어요. 사장님께 알려주세요.`
    );
  }

  return new Error(`${action}: ${message || "알 수 없는 오류"}`);
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

// 여러 행을 조건으로 한 번에 삭제합니다. (예: 영업일이 지난 채팅 정리)
export async function deleteWhere(table, filters) {
  const tableName = resolveTable(table);
  let builder = supabase.from(tableName).delete();

  builder = applyFilters(builder, tableName, filters);

  const { data, error } = await builder.select("id");

  if (error) {
    throw buildError("삭제하지 못했어요", error);
  }

  return (data || []).map((row) => row.id);
}

// 이 백엔드는 Realtime(WebSocket) 을 제공하지 않습니다.
// 대신 변경 알림을 SSE(/api/events) 로 받습니다. EventSource 는 헤더를 못 넣으므로
// apikey 는 쿼리 파라미터로 넘깁니다(anon key 는 원래 공개되는 값).
function openChangeStream(tableName, onEvent) {
  if (typeof EventSource === "undefined") {
    return null;
  }

  const params = new URLSearchParams({ tables: tableName });

  if (SUPABASE_KEY) {
    params.set("apikey", SUPABASE_KEY);
  }

  const url = `${EVENTS_URL}/api/events?${params}`;
  const source = new EventSource(url);

  source.addEventListener("change", (event) => {
    let changedTable = "";

    try {
      changedTable = String(JSON.parse(event.data)?.table || "");
    } catch (error) {
      changedTable = "";
    }

    if (changedTable === tableName) {
      onEvent();
    }
  });

  return source;
}

// Realtime replacement for onSnapshot():
//   * loads once immediately,
//   * reloads on every change event for the table (SSE),
//   * keeps a slow poll as a safety net (pollMs: 0 disables it).
// SSE 는 테이블 단위 알림만 주므로 행 단위 filter 는 지원하지 않습니다.
// Supabase egress 절감을 위해 화면이 가려진 동안에는 폴링을 쉬고,
// 다시 보이면 즉시 한 번 새로고침합니다.
export function subscribeTable(table, reload, options = {}) {
  const tableName = resolveTable(table);
  const { pollMs = 120000 } = options;
  let stopped = false;
  let pollTimer = null;

  const isHidden = () =>
    typeof document !== "undefined" && document.visibilityState === "hidden";

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

  const pollReload = () => {
    if (isHidden()) {
      return;
    }

    runReload();
  };

  runReload();

  const source = openChangeStream(tableName, runReload);

  const handleVisibility = () => {
    if (!isHidden()) {
      runReload();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibility);
  }

  if (Number.isFinite(pollMs) && pollMs > 0) {
    pollTimer = setInterval(pollReload, pollMs);
  }

  return () => {
    stopped = true;

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibility);
    }

    if (source) {
      source.close();
    }
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
