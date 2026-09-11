// Menu board -> products import.
//
// Usage:
//   node scripts/menu/import-menu.mjs --file menu-data/menu.json           (preview only)
//   node scripts/menu/import-menu.mjs --file menu-data/menu.json --apply    (write changes)
//
// Input JSON:
// {
//   "source": "메뉴판 2026-09",
//   "categories": [{ "name": "칵테일", "code": "cocktail" }],   // optional
//   "items": [
//     { "name": "마티니", "price": 12000, "category": "칵테일" }
//   ]
// }
//
// Matching policy:
//   - 같은 이름(공백/대소문자 무시)의 기존 상품: 가격/카테고리/정렬만 갱신하고 되살립니다.
//   - 메뉴 파일에 없는 기존 상품: 소프트 삭제합니다(deleted_at + is_active=false).
//   - 새 이름: 새 상품으로 추가합니다(사진은 빈 값 — 촬영 후 어드민에서 등록).
//   - 재고가 0 이하인 기존 상품은 기본 재고로 복구합니다(재고 0 = 품절 처리 때문).

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const dataPath = fileIndex === -1 ? "" : args[fileIndex + 1];
const APPLY = args.includes("--apply");
const stockArg = args.find((item) => item.startsWith("--stock="));
const DEFAULT_STOCK = stockArg ? Number(stockArg.split("=")[1]) : 99999;
const BATCH_SIZE = 200;

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

const fileEnv = {
  ...loadEnvFile(join(repoRoot, ".env.migration")),
  ...loadEnvFile(join(repoRoot, ".env")),
};

function pickEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || fileEnv[name] || "").trim();

    if (value) {
      return value;
    }
  }

  return "";
}

const supabaseUrl = pickEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]).replace(
  /\/+$/,
  ""
);
const apiKey = pickEnv([
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
]);

// ---------------------------------------------------------------------------
// rest helpers
// ---------------------------------------------------------------------------

function request(path, { method = "GET", body, headers = {} } = {}) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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

  return `${response.status} ${response.statusText} — ${detail || "no detail"}`;
}

async function fetchRows(table, select) {
  const response = await request(`${table}?select=${select}&limit=1000`);

  if (!response.ok) {
    throw new Error(`GET ${table} 실패: ${await describeFailure(response)}`);
  }

  return response.json();
}

async function insertRows(table, rows) {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const response = await request(table, {
      method: "POST",
      body: batch,
      headers: { Prefer: "return=minimal" },
    });

    if (!response.ok) {
      throw new Error(
        `POST ${table} (${index + 1}-${index + batch.length}) 실패: ${await describeFailure(response)}`
      );
    }
  }
}

async function updateRow(table, id, patch) {
  const response = await request(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
    headers: { Prefer: "return=minimal" },
  });

  if (!response.ok) {
    throw new Error(
      `PATCH ${table} ${id} 실패: ${await describeFailure(response)}`
    );
  }
}

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

function normalizeName(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, "")
    .toLowerCase();
}

function toPrice(value) {
  const parsed = Number(
    String(value == null ? "" : value).replace(/[^\d]/g, "")
  );

  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function readMenuFile(path) {
  if (!path || !existsSync(path)) {
    console.error(`메뉴 파일을 찾을 수 없어요: ${path || "(없음)"}`);
    console.error(
      "사용법: node scripts/menu/import-menu.mjs --file menu-data/menu.json [--apply]"
    );
    process.exit(1);
  }

  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const rawItems = Array.isArray(parsed) ? parsed : parsed.items;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    console.error("메뉴 파일에 items 배열이 없어요.");
    process.exit(1);
  }

  const categoryNames = [];

  for (const entry of Array.isArray(parsed.categories) ? parsed.categories : []) {
    const name = String((entry && entry.name) || "").trim();

    if (name && !categoryNames.includes(name)) {
      categoryNames.push(name);
    }
  }

  const items = [];
  const seen = new Set();
  const duplicates = [];

  rawItems.forEach((raw, index) => {
    const name = String((raw && raw.name) || "").trim();
    const categoryName = String(
      (raw && (raw.category || raw.categoryName)) || ""
    ).trim();

    if (!name) {
      console.warn(`  ! ${index + 1}번째 항목에 이름이 없어 건너뜁니다.`);
      return;
    }

    const key = normalizeName(name);

    if (seen.has(key)) {
      duplicates.push(name);
      return;
    }

    seen.add(key);

    if (categoryName && !categoryNames.includes(categoryName)) {
      categoryNames.push(categoryName);
    }

    items.push({
      name,
      key,
      categoryName,
      description: String((raw && raw.description) || ""),
      price: toPrice(raw && (raw.price ?? raw.basePrice)),
      stock: Number.isFinite(Number(raw && raw.stock))
        ? Math.trunc(Number(raw.stock))
        : null,
      optionGroups: Array.isArray(raw && raw.optionGroups)
        ? raw.optionGroups
        : null,
    });
  });

  if (duplicates.length > 0) {
    console.warn(
      `  ! 메뉴 파일 안에 중복 이름이 있어 첫 항목만 사용합니다: ${duplicates.join(", ")}`
    );
  }

  return {
    source: String(parsed.source || path),
    categoryNames,
    items,
  };
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

const CATEGORY_ORDER_STEP = 1000;

function buildPlan(menu, existingCategories, existingProducts) {
  const categoryByName = new Map(
    existingCategories.map((item) => [normalizeName(item.name), item])
  );
  const productByName = new Map(
    existingProducts.map((item) => [normalizeName(item.product_name), item])
  );

  const newCategories = [];
  const categoryIdByName = new Map();

  menu.categoryNames.forEach((name, index) => {
    const key = normalizeName(name);
    const found = categoryByName.get(key);

    if (found) {
      categoryIdByName.set(key, found.id);
      return;
    }

    const created = {
      id: randomUUID(),
      name,
      code: "",
      sort_order: (index + 1) * CATEGORY_ORDER_STEP,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    newCategories.push(created);
    categoryIdByName.set(key, created.id);
  });

  const categoryIndexByName = new Map(
    menu.categoryNames.map((name, index) => [normalizeName(name), index])
  );
  const itemCountByCategory = new Map();

  const newItems = [];
  const updatedItems = [];
  const matchedIds = new Set();

  for (const item of menu.items) {
    const categoryKey = normalizeName(item.categoryName);
    const categoryIndex = categoryIndexByName.has(categoryKey)
      ? categoryIndexByName.get(categoryKey)
      : 0;
    const ordinal = (itemCountByCategory.get(categoryKey) || 0) + 1;

    itemCountByCategory.set(categoryKey, ordinal);

    const sortOrder = (categoryIndex + 1) * CATEGORY_ORDER_STEP + ordinal;
    const categoryId = categoryIdByName.get(categoryKey) || "";
    const existing = productByName.get(item.key);

    if (!existing) {
      newItems.push({
        id: randomUUID(),
        product_name: item.name,
        description: item.description,
        category_id: categoryId,
        category_ids: categoryId ? [categoryId] : [],
        base_price: item.price,
        stock: item.stock === null ? DEFAULT_STOCK : item.stock,
        image_url: "",
        is_active: true,
        is_sold_out: false,
        sort_order: sortOrder,
        option_groups: item.optionGroups || [],
      });
      continue;
    }

    matchedIds.add(existing.id);

    const patch = {};
    const changes = [];

    if (Number(existing.base_price || 0) !== item.price) {
      patch.base_price = item.price;
      changes.push(
        `가격 ${Number(existing.base_price || 0).toLocaleString("ko-KR")} → ${item.price.toLocaleString("ko-KR")}`
      );
    }

    if (String(existing.category_id || "") !== categoryId) {
      patch.category_id = categoryId;
      patch.category_ids = categoryId ? [categoryId] : [];
      changes.push("카테고리 변경");
    }

    if (Number(existing.sort_order ?? 0) !== sortOrder) {
      patch.sort_order = sortOrder;
    }

    if (existing.is_active === false) {
      patch.is_active = true;
      changes.push("되살림(노출)");
    }

    if (existing.deleted_at) {
      patch.deleted_at = null;
      changes.push("소프트 삭제 해제");
    }

    // stock 0 means "sold out" in the app, so revive matched items
    if (Number(existing.stock ?? 0) <= 0) {
      patch.stock = item.stock === null ? DEFAULT_STOCK : item.stock;
      changes.push(`재고 ${Number(existing.stock ?? 0)} → ${patch.stock}`);
    } else if (item.stock !== null && item.stock !== Number(existing.stock)) {
      patch.stock = item.stock;
      changes.push(`재고 ${Number(existing.stock)} → ${item.stock}`);
    }

    if (Object.keys(patch).length === 0) {
      continue;
    }

    updatedItems.push({
      id: existing.id,
      name: existing.product_name,
      patch,
      changes,
    });
  }

  const softDeleted = existingProducts
    .filter((item) => !matchedIds.has(item.id) && !item.deleted_at)
    .map((item) => ({ id: item.id, name: item.product_name }));

  return { newCategories, newItems, updatedItems, softDeleted };
}

function printList(label, rows, format) {
  console.log(`[${label}] ${rows.length}개`);

  rows.slice(0, 20).forEach((row) => console.log(`  ${format(row)}`));

  if (rows.length > 20) {
    console.log(`  ... 외 ${rows.length - 20}개`);
  }
}

function printPlan(menu, existingCategories, existingProducts, plan) {
  const exposed = existingProducts.filter(
    (item) => item.is_active && !item.deleted_at
  ).length;
  const deleted = existingProducts.filter((item) => item.deleted_at).length;

  console.log(`메뉴 파일: ${menu.source}`);
  console.log(
    `현재 DB: 상품 ${existingProducts.length}개 (노출 ${exposed} / 비노출 ${existingProducts.length - exposed - deleted} / 소프트삭제 ${deleted}), 카테고리 ${existingCategories.length}개`
  );
  console.log(`메뉴 파일 항목: ${menu.items.length}개`);
  console.log("");

  if (plan.newCategories.length > 0) {
    printList("카테고리 추가", plan.newCategories, (row) => row.name);
  }

  printList(
    "갱신",
    plan.updatedItems,
    (row) =>
      `${row.name}: ${row.changes.length > 0 ? row.changes.join(", ") : "정렬 순서만 변경"}`
  );
  printList(
    "추가",
    plan.newItems,
    (row) =>
      `${row.product_name} ${row.base_price.toLocaleString("ko-KR")}원${row.category_id ? "" : " (카테고리 없음)"}`
  );
  printList("소프트 삭제", plan.softDeleted, (row) => row.name);

  console.log("");
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

async function applyPlan(plan) {
  const now = new Date().toISOString();

  if (plan.newCategories.length > 0) {
    console.log(`카테고리 ${plan.newCategories.length}개 추가...`);
    await insertRows("categories", plan.newCategories);
  }

  if (plan.updatedItems.length > 0) {
    console.log(`상품 ${plan.updatedItems.length}개 갱신...`);

    for (const item of plan.updatedItems) {
      await updateRow("products", item.id, { ...item.patch, updated_at: now });
    }
  }

  if (plan.newItems.length > 0) {
    console.log(`상품 ${plan.newItems.length}개 추가...`);
    await insertRows(
      "products",
      plan.newItems.map((item) => ({
        ...item,
        created_at: now,
        updated_at: now,
      }))
    );
  }

  if (plan.softDeleted.length > 0) {
    console.log(`상품 ${plan.softDeleted.length}개 소프트 삭제...`);

    for (const item of plan.softDeleted) {
      await updateRow("products", item.id, {
        deleted_at: now,
        is_active: false,
        updated_at: now,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  if (!supabaseUrl || !apiKey) {
    console.error(
      "SUPABASE_URL / 키를 찾을 수 없어요. .env 또는 .env.migration을 확인해주세요."
    );
    process.exit(1);
  }

  const menu = readMenuFile(dataPath);
  const existingCategories = await fetchRows("categories", "id,name,code");
  const existingProducts = await fetchRows(
    "products",
    "id,product_name,base_price,stock,category_id,is_active,sort_order,deleted_at"
  );

  const plan = buildPlan(menu, existingCategories, existingProducts);

  printPlan(menu, existingCategories, existingProducts, plan);

  if (!APPLY) {
    console.log("미리보기 모드입니다. 실제 반영은 --apply 를 붙여 실행하세요.");
    return;
  }

  await applyPlan(plan);

  const after = await fetchRows(
    "products",
    "id,is_active,deleted_at,category_id"
  );
  const exposed = after.filter((item) => item.is_active && !item.deleted_at);

  console.log("");
  console.log(
    `완료: 상품 ${after.length}개 (노출 ${exposed.length} / 소프트삭제 ${after.filter((item) => item.deleted_at).length})`
  );
}

main().catch((error) => {
  console.error(String(error && error.message ? error.message : error));
  process.exit(1);
});
