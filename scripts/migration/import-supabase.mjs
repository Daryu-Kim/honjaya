// Firestore export -> Supabase import (data + normalization, no photos).
//
// Usage:
//   1. Apply supabase/schema.sql in the Supabase SQL Editor.
//   2. Fill .env.migration with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
//   3. node scripts/migration/import-supabase.mjs --dry-run   (preview only)
//      node scripts/migration/import-supabase.mjs            (replace + import)
//
// The import is idempotent: each target table is emptied first, then rows are
// upserted in batches. Re-running always reproduces the same final state.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const exportPath = join(repoRoot, "migration-data", "firestore-export.json");
const envPath = join(repoRoot, ".env.migration");
const BATCH_SIZE = 300;
const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const result = {};

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");

    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

const fileEnv = loadEnvFile(envPath);

function pickEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || fileEnv[name] || "").trim();

    if (value) {
      return { name, value };
    }
  }

  return null;
}

const urlSource = pickEnv([
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
]);
const keySource = pickEnv([
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);
const supabaseUrl = String(urlSource?.value || "").replace(/\/+$/, "");
const apiKey = String(keySource?.value || "");
const isServiceRoleKey = Boolean(keySource?.name.includes("SERVICE"));

// ---------------------------------------------------------------------------
// transform helpers
// ---------------------------------------------------------------------------

const report = {
  warnings: [],
  tableChanges: [],
  statusInventory: {},
};

function warn(message) {
  report.warnings.push(message);
}

const str = (value) => (value == null ? "" : String(value));
const num = (value, fallback = 0) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};
const arr = (value) => (Array.isArray(value) ? value : []);
const ts = (value, fallback = null) => {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return value;
  }

  return fallback;
};

// ported from src/lib/orderSheet.js
function normalizeTableNumber(value) {
  const digits = String(value ?? "")
    .trim()
    .replace(/[^\d]/g, "");

  return digits.replace(/^0+(?=\d)/, "");
}

function isReusableOrderSheetStatus(status) {
  return status === "OPEN" || status === "PAYMENT_REQUESTED";
}

function normalizeTableFields(row, rawTableNumber, rawDisplayName) {
  const normalized = normalizeTableNumber(rawTableNumber);

  if (!normalized || normalized === str(rawTableNumber).trim()) {
    return { tableNumber: str(rawTableNumber).trim(), displayName: str(rawDisplayName) };
  }

  const displayName =
    str(rawDisplayName) === `No.${str(rawTableNumber).trim()}`
      ? `No.${normalized}`
      : str(rawDisplayName);

  report.tableChanges.push({ from: str(rawTableNumber), to: normalized });

  return { tableNumber: normalized, displayName };
}

function statusKey(collection, value) {
  const bucket = (report.statusInventory[collection] ||= {});
  const key = value || "(empty)";

  bucket[key] = (bucket[key] || 0) + 1;
}

// ---------------------------------------------------------------------------
// transforms (Firestore collection -> Supabase rows)
// ---------------------------------------------------------------------------

function transformProducts(docs) {
  return docs.map((doc) => {
    const categoryId = str(doc.categoryId);
    const categoryIds = arr(doc.categoryIds).map(String).filter(Boolean);

    return {
      id: str(doc._id),
      product_name: str(doc.productName),
      description: str(doc.description),
      category_id: categoryId,
      // same fallback the app uses when categoryIds is empty
      category_ids: categoryIds.length > 0 ? categoryIds : categoryId ? [categoryId] : [],
      base_price: num(doc.basePrice ?? doc.price),
      stock: num(doc.stock),
      // photos will be re-taken; do not carry old Firebase Storage URLs
      image_url: "",
      is_active: doc.isActive !== false,
      is_sold_out: doc.isSoldOut === true,
      sort_order: num(doc.sortOrder),
      option_groups: arr(doc.optionGroups),
      recipe_text: str(doc.recipeText),
      recipe_info: doc.recipeInfo && typeof doc.recipeInfo === "object" ? doc.recipeInfo : {},
      created_at: ts(doc.createdAt, new Date().toISOString()),
      updated_at: ts(doc.updatedAt, new Date().toISOString()),
    };
  });
}

function transformCategories(docs) {
  return docs.map((doc) => ({
    id: str(doc._id),
    name: str(doc.name),
    code: str(doc.code),
    sort_order: num(doc.sortOrder),
    is_active: doc.isActive !== false,
    created_at: ts(doc.createdAt, new Date().toISOString()),
    updated_at: ts(doc.updatedAt, new Date().toISOString()),
  }));
}

function transformOrderSheets(docs) {
  return docs.map((doc) => {
    const rawStatus = str(doc.status) || "OPEN";
    // legacy value: PAID sheets are all paymentStatus COMPLETED -> terminal CLOSED
    const status = rawStatus === "PAID" ? "CLOSED" : rawStatus;

    if (rawStatus !== status) {
      warn(`orderSheets ${doc._id}: status ${rawStatus} -> ${status} (legacy)`);
    }

    statusKey("orderSheets.status", status);

    const { tableNumber, displayName } = normalizeTableFields(
      doc,
      doc.tableNumber,
      doc.displayName
    );

    return {
      id: str(doc._id),
      sequence_no: num(doc.sequenceNo),
      business_date: ts(doc.businessDate, ts(doc.createdAt, new Date().toISOString())),
      table_number: tableNumber,
      display_name: displayName,
      table_nickname: str(doc.tableNickname),
      status,
      payment_status: str(doc.paymentStatus) || "UNPAID",
      payment_method: str(doc.paymentMethod),
      total_amount: num(doc.totalAmount),
      order_count: num(doc.orderCount),
      latest_order_items_preview: arr(doc.latestOrderItemsPreview),
      latest_order_summary_text: str(doc.latestOrderSummaryText),
      original_amount: doc.originalAmount == null ? null : num(doc.originalAmount),
      discount_total: doc.discountTotal == null ? null : num(doc.discountTotal),
      discounts: Array.isArray(doc.discounts) ? doc.discounts : null,
      payment_splits: Array.isArray(doc.paymentSplits) ? doc.paymentSplits : null,
      internal_tags: arr(doc.internalTags).map(String),
      created_at: ts(doc.createdAt, new Date().toISOString()),
      updated_at: ts(doc.updatedAt, new Date().toISOString()),
      paid_at: ts(doc.paidAt),
      closed_at: ts(doc.closedAt),
    };
  });
}

function transformOrders(docs) {
  return docs.map((doc) => {
    statusKey("orders.status", str(doc.status));

    const { tableNumber, displayName } = normalizeTableFields(
      doc,
      doc.tableNumber,
      doc.displayName
    );

    return {
      id: str(doc._id),
      order_sheet_id: str(doc.orderSheetId),
      table_number: tableNumber,
      display_name: displayName,
      request_message: str(doc.requestMessage),
      // jsonb payload kept in its original camelCase shape (history snapshots
      // keep their old Firebase Storage imageUrl values on purpose)
      items: arr(doc.items),
      total_count: num(doc.totalCount),
      total_price: num(doc.totalPrice),
      status: str(doc.status) || "REQUESTED",
      created_at: ts(doc.createdAt, new Date().toISOString()),
      updated_at: ts(doc.updatedAt, new Date().toISOString()),
    };
  });
}

function transformActiveOrderSheets(docs, orderSheetById) {
  const winners = new Map();

  for (const doc of docs) {
    const rawId = str(doc._id);
    const idSuffix = rawId.startsWith("table_") ? rawId.slice("table_".length) : rawId;
    const rawTable = str(doc.tableNumber).trim() || idSuffix;
    const normalized = normalizeTableNumber(rawTable);
    const canonicalId = normalized ? `table_${normalized}` : rawId;
    const orderSheetId = str(doc.orderSheetId).trim();
    const sheet = orderSheetById.get(orderSheetId);
    const score = !sheet ? -1 : isReusableOrderSheetStatus(sheet.status) ? 1 : 0;
    const updatedAt = ts(doc.updatedAt, "");

    const candidate = {
      id: canonicalId,
      table_number: normalized || rawTable,
      display_name: str(doc.displayName),
      order_sheet_id: orderSheetId,
      status: str(doc.status) || "OPEN",
      business_date: ts(doc.businessDate),
      updated_at: updatedAt || new Date().toISOString(),
      _score: score,
      _updatedAt: updatedAt,
      _sourceId: rawId,
    };

    const current = winners.get(canonicalId);

    if (!current) {
      winners.set(canonicalId, candidate);
      continue;
    }

    const winner =
      candidate._score !== current._score
        ? candidate._score > current._score
        : candidate._updatedAt > current._updatedAt
          ? candidate
          : current;
    const loser = winner === candidate ? current : candidate;

    winners.set(canonicalId, winner);
    warn(
      `activeOrderSheets key collision for ${canonicalId}: kept ${winner._sourceId}, dropped ${loser._sourceId}`
    );
  }

  return [...winners.values()].map((row) => {
    if (!orderSheetById.has(row.order_sheet_id)) {
      warn(
        `activeOrderSheets ${row._sourceId}: orderSheetId ${row.order_sheet_id || "(empty)"} not found in orderSheets`
      );
    }

    if (row._sourceId !== row.id) {
      warn(`activeOrderSheets key ${row._sourceId} -> ${row.id}`);
    }

    if (!row._score) {
      warn(
        `activeOrderSheets ${row.id}: source status ${row.status} (reuse score ${row._score})`
      );
    }

    const { tableNumber, displayName } = normalizeTableFields(
      row,
      row.table_number,
      row.display_name
    );

    return {
      id: row.id,
      table_number: tableNumber,
      display_name: displayName,
      order_sheet_id: row.order_sheet_id,
      status: row.status,
      business_date: row.business_date,
      updated_at: row.updated_at,
    };
  });
}

function transformChatMessages(docs) {
  return docs.map((doc) => {
    statusKey("chatMessages.messageType", str(doc.messageType));

    return {
      id: str(doc._id),
      message: str(doc.message),
      message_type: str(doc.messageType) || "USER",
      table_number: str(doc.tableNumber),
      nickname: str(doc.nickname),
      sender_label: str(doc.senderLabel),
      is_deleted: doc.isDeleted === true,
      created_at: ts(doc.createdAt, new Date().toISOString()),
      updated_at: ts(doc.updatedAt, new Date().toISOString()),
    };
  });
}

function transformCounters(docs) {
  return docs.map((doc) => ({
    id: str(doc._id),
    last_sequence_no: num(doc.lastSequenceNo),
    updated_at: ts(doc.updatedAt, new Date().toISOString()),
  }));
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

function validate(tables) {
  const sheetIds = new Set(tables.order_sheets.map((row) => row.id));
  const seenSequence = new Set();

  for (const row of tables.order_sheets) {
    if (seenSequence.has(row.sequence_no)) {
      warn(`orderSheets: duplicate sequenceNo ${row.sequence_no} (id ${row.id})`);
    }

    seenSequence.add(row.sequence_no);
  }

  for (const row of tables.orders) {
    if (!sheetIds.has(row.order_sheet_id)) {
      warn(`orders ${row.id}: orderSheetId ${row.order_sheet_id || "(empty)"} not found`);
    }
  }

  const counter = tables.counters.find((row) => row.id === "orderSheet");
  const maxSequence = tables.order_sheets.reduce(
    (max, row) => Math.max(max, row.sequence_no),
    0
  );

  if (counter && counter.last_sequence_no < maxSequence) {
    warn(
      `counters: lastSequenceNo ${counter.last_sequence_no} < max orderSheet sequenceNo ${maxSequence}`
    );
  }
}

// ---------------------------------------------------------------------------
// supabase (PostgREST) access
// ---------------------------------------------------------------------------

function requireConfig() {
  if (!supabaseUrl || !apiKey) {
    console.error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 없어요. .env.migration 파일을 확인해주세요."
    );
    console.error(`기대 파일 위치: ${envPath}`);
    console.error(
      "허용 이름: SUPABASE_URL | VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | VITE_SUPABASE_PUBLISHABLE_KEY"
    );
    process.exit(1);
  }
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return response;
}

async function describeFailure(response) {
  let detail = "";

  try {
    const text = await response.text();

    try {
      const parsed = JSON.parse(text);
      detail = parsed.message || parsed.error || text;
    } catch {
      detail = text;
    }
  } catch {
    detail = "";
  }

  if (detail.includes("does not exist") && detail.includes("relation")) {
    return `${response.status} ${response.statusText} — 테이블이 없어요. Supabase SQL Editor에서 supabase/schema.sql을 먼저 실행해주세요. (${detail})`;
  }

  return `${response.status} ${response.statusText} — ${detail || "no detail"}`;
}

async function clearTable(table) {
  const existing = await countRows(table);

  if (existing === 0) {
    console.log(`  ${table}: 기존 행 0건 — 삭제 생략`);

    return;
  }

  const response = await request(`${table}?id=not.is.null`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  if (!response.ok) {
    const detail = await describeFailure(response);

    throw new Error(
      isServiceRoleKey
        ? `DELETE ${table} 실패: ${detail}`
        : `DELETE ${table} 실패: ${detail} — 기존 ${existing}건을 덮어쓰려면 service_role 키가 필요해요(.env.migration).`
    );
  }
}

async function insertRows(table, rows) {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const response = await request(table, {
      method: "POST",
      body: batch,
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
    });

    if (!response.ok) {
      throw new Error(
        `POST ${table} (rows ${index + 1}-${index + batch.length}) 실패: ${await describeFailure(response)}`
      );
    }

    console.log(`  ${table}: ${Math.min(index + batch.length, rows.length)}/${rows.length}`);
  }
}

async function countRows(table) {
  const response = await request(`${table}?select=id`, {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });

  if (!response.ok) {
    throw new Error(`HEAD ${table} 실패: ${await describeFailure(response)}`);
  }

  const contentRange = response.headers.get("content-range") || "";
  const total = contentRange.split("/")[1];

  return Number.isFinite(Number(total)) ? Number(total) : -1;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function printSample(table, rows) {
  const sample = rows[0];

  if (!sample) {
    return;
  }

  const preview = JSON.stringify(sample);
  console.log(`  sample: ${preview.length > 400 ? `${preview.slice(0, 400)}...` : preview}`);
}

async function main() {
  if (!existsSync(exportPath)) {
    console.error(`export 파일이 없어요: ${exportPath}`);
    console.error("node scripts/migration/export-firestore.mjs 를 먼저 실행해주세요.");
    process.exit(1);
  }

  const exported = JSON.parse(readFileSync(exportPath, "utf8"));
  const collections = exported.collections || {};

  console.log(`export: ${exported.exportedAt} (project ${exported.projectId})`);

  const orderSheets = transformOrderSheets(arr(collections.orderSheets));
  const orderSheetById = new Map(orderSheets.map((row) => [row.id, row]));

  const tables = {
    categories: transformCategories(arr(collections.categories)),
    products: transformProducts(arr(collections.products)),
    order_sheets: orderSheets,
    orders: transformOrders(arr(collections.orders)),
    active_order_sheets: transformActiveOrderSheets(
      arr(collections.activeOrderSheets),
      orderSheetById
    ),
    chat_messages: transformChatMessages(arr(collections.chatMessages)),
    counters: transformCounters(arr(collections.counters)),
  };

  validate(tables);

  console.log("\n변환 결과:");
  const sourceCounts = {
    categories: arr(collections.categories).length,
    products: arr(collections.products).length,
    order_sheets: arr(collections.orderSheets).length,
    orders: arr(collections.orders).length,
    active_order_sheets: arr(collections.activeOrderSheets).length,
    chat_messages: arr(collections.chatMessages).length,
    counters: arr(collections.counters).length,
  };

  for (const [table, rows] of Object.entries(tables)) {
    console.log(`  ${table}: ${rows.length} rows (source ${sourceCounts[table]})`);
  }

  console.log("\n상태값 분포:");
  for (const [key, distribution] of Object.entries(report.statusInventory)) {
    console.log(`  ${key}: ${JSON.stringify(distribution)}`);
  }

  if (report.tableChanges.length > 0) {
    console.log(`\n테이블 번호 정규화: ${report.tableChanges.length}건`);
    report.tableChanges.slice(0, 10).forEach((change) => {
      console.log(`  ${change.from} -> ${change.to}`);
    });
  } else {
    console.log("\n테이블 번호 정규화: 이미 정리됨 (변경 0건)");
  }

  if (report.warnings.length > 0) {
    console.log(`\n경고 ${report.warnings.length}건:`);
    report.warnings.slice(0, 40).forEach((message) => console.log(`  - ${message}`));

    if (report.warnings.length > 40) {
      console.log(`  ... 외 ${report.warnings.length - 40}건`);
    }
  }

  console.log("\n샘플 행:");
  for (const [table, rows] of Object.entries(tables)) {
    if (rows.length > 0) {
      console.log(`  [${table}]`);
      printSample(table, rows);
    }
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: Supabase에 아무것도 쓰지 않았어요.");
    return;
  }

  requireConfig();
  console.log(`\nSupabase: ${supabaseUrl}`);
  console.log(
    `키: ${keySource.name} (${isServiceRoleKey ? "service_role" : "publishable/anon — 기존 행 삭제 불가"})`
  );
  console.log("주의: 기존 행을 전부 지우고 다시 넣어요 (replace 모드).");

  const failures = [];
  const imported = {};

  for (const [table, rows] of Object.entries(tables)) {
    try {
      await clearTable(table);
      await insertRows(table, rows);
      imported[table] = await countRows(table);
    } catch (error) {
      failures.push({ table, reason: String(error?.message || error) });
      console.error(`  ${table}: 실패 — ${error?.message || error}`);
    }
  }

  console.log("\n검증 (Supabase 실제 건수):");
  for (const [table, rows] of Object.entries(tables)) {
    const actual = imported[table];
    const mark = actual === rows.length ? "OK" : actual == null ? "FAILED" : "MISMATCH";

    console.log(`  ${table}: ${actual ?? "-"} / ${rows.length} ${mark}`);
  }

  if (failures.length > 0) {
    console.log(`\n실패한 테이블 ${failures.length}건:`);
    failures.forEach((item) => console.log(`  - ${item.table}: ${item.reason}`));
    process.exit(1);
  }

  console.log("\n이전 완료.");
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
