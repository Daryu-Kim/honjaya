// Menu board -> products import.
//
// Usage:
//   node scripts/menu/import-menu.mjs --file menu-data/menu.json           (preview only)
//   node scripts/menu/import-menu.mjs --file menu-data/menu.json --apply    (write changes)
//   node scripts/menu/import-menu.mjs --file menu-data/menu.json --recipes-only [--apply]
//                                                                     (레시피(recipeInfo)만 반영)
//
// Input JSON:
// {
//   "source": "메뉴판 2026-09",
//   "syncCategories": true,                                    // optional
//   "categories": [{ "name": "칵테일", "code": "cocktail" }],   // optional, 배열 순서 = 노출 순서
//   "items": [
//     {
//       "name": "마티니",
//       "price": 12000,
//       "categories": ["인텐스 칵테일", "칵테일"],  // "category": "칵테일" 단일 문자열도 가능
//       "ingredients": ["진", "드라이 베르무트"],   // optional, 레시피 정보가 비어있을 때만 채움
//       "recipeInfo": {                              // optional, 지정하면 레시피를 그대로 교체
//         "description": "마티니잔 · 스터",
//         "ingredients": [{ "name": "바톤 진", "amount": "2 oz" }],
//         "steps": ["잔에 얼음 칠링"],
//         "tips": ["가니쉬: 레몬 필"]
//       },
//       "optionGroups": [],                          // optional, 지정하면 옵션 구성을 그대로 맞춤(빈 배열 = 옵션 제거)
//       "description": "진 · 드라이 베르무트\n클래식 칵테일 · Alc 30%"
//     }
//   ]
// }
//
// Matching policy:
//   - 같은 이름(공백/대소문자 무시)의 기존 상품: 가격/카테고리/설명/정렬을 갱신하고 되살립니다.
//   - 메뉴 파일에 없는 기존 상품: 소프트 삭제합니다(deleted_at + is_active=false).
//   - 새 이름: 새 상품으로 추가합니다(사진은 빈 값 — 촬영 후 어드민에서 등록).
//   - 재고가 0 이하인 기존 상품은 기본 재고로 복구합니다(재고 0 = 품절 처리 때문).
//   - syncCategories=true 이면 메뉴 파일에 없는 카테고리 중 남는 상품이 없는 것을 비활성화합니다.
//   - --recipes-only 는 recipeInfo 가 있는 항목의 레시피만 갱신합니다(카테고리/가격/재고/삭제는 건드리지 않음).

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const dataPath = fileIndex === -1 ? "" : args[fileIndex + 1];
const APPLY = args.includes("--apply");
const RECIPES_ONLY = args.includes("--recipes-only");
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

  const categories = [];
  const categoryKeys = new Set();

  const addCategory = (name, code) => {
    const key = normalizeName(name);

    if (!key || categoryKeys.has(key)) {
      return;
    }

    categoryKeys.add(key);
    categories.push({ name, code: String(code || "").trim() });
  };

  for (const entry of Array.isArray(parsed.categories) ? parsed.categories : []) {
    addCategory(
      String((entry && entry.name) || "").trim(),
      entry && entry.code
    );
  }

  const items = [];
  const seen = new Set();
  const duplicates = [];

  rawItems.forEach((raw, index) => {
    const name = String((raw && raw.name) || "").trim();

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

    const rawCategoryNames = Array.isArray(raw && raw.categories)
      ? raw.categories
      : [raw && (raw.category || raw.categoryName)];
    const categoryNames = [];

    for (const entry of rawCategoryNames) {
      const categoryName = String(entry || "").trim();

      if (!categoryName || categoryNames.includes(categoryName)) {
        continue;
      }

      categoryNames.push(categoryName);
      addCategory(categoryName, "");
    }

    items.push({
      name,
      key,
      categoryNames,
      description: String((raw && raw.description) || "").trim(),
      ingredients: Array.isArray(raw && raw.ingredients)
        ? raw.ingredients
            .map((entry) => String(entry || "").trim())
            .filter((entry) => entry)
        : [],
      price: toPrice(raw && (raw.price ?? raw.basePrice)),
      stock: Number.isFinite(Number(raw && raw.stock))
        ? Math.trunc(Number(raw.stock))
        : null,
      optionGroups: Array.isArray(raw && raw.optionGroups)
        ? raw.optionGroups
        : null,
      recipeInfo: normalizeRecipeInfo(raw && raw.recipeInfo),
    });
  });

  if (duplicates.length > 0) {
    console.warn(
      `  ! 메뉴 파일 안에 중복 이름이 있어 첫 항목만 사용합니다: ${duplicates.join(", ")}`
    );
  }

  return {
    source: String(parsed.source || path),
    syncCategories: parsed.syncCategories === true,
    categories,
    items,
  };
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

const CATEGORY_ORDER_STEP = 1000;

function isEmptyRecipeInfo(value) {
  return (
    !value ||
    (typeof value === "object" && Object.keys(value).length === 0)
  );
}

// recipeInfo 키가 없으면 null을 돌려주고, 있으면 화면/DB가 쓰는 형태로 정규화한다.
function normalizeRecipeInfo(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const ingredients = (Array.isArray(value.ingredients) ? value.ingredients : [])
    .map((entry) => {
      if (typeof entry === "string") {
        return { name: entry.trim(), amount: "" };
      }

      if (!entry || typeof entry !== "object") {
        return null;
      }

      return {
        name: String(entry.name || "").trim(),
        amount: String(entry.amount || "").trim(),
      };
    })
    .filter((entry) => entry && entry.name);

  const toTextList = (input) =>
    (Array.isArray(input) ? input : [])
      .map((entry) => String(entry || "").trim())
      .filter((entry) => entry);

  return {
    description: String(value.description || "").trim(),
    ingredients,
    steps: toTextList(value.steps),
    tips: toTextList(value.tips),
  };
}

// Postgres(jsonb)는 객체 키 순서를 바꿔서 돌려주므로, 키 순서에 상관없이 비교한다.
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();

    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value === undefined ? null : value);
}

function isSameRecipeInfo(current, next) {
  return stableStringify(current || {}) === stableStringify(next || {});
}

function buildPlan(menu, existingCategories, existingProducts) {
  const categoryByName = new Map(
    existingCategories.map((item) => [normalizeName(item.name), item])
  );
  const productByName = new Map(
    existingProducts.map((item) => [normalizeName(item.product_name), item])
  );
  const categoryNameById = new Map(
    existingCategories.map((item) => [item.id, item.name])
  );

  if (RECIPES_ONLY) {
    const updatedItems = [];

    for (const item of menu.items) {
      if (!item.recipeInfo) {
        continue;
      }

      const existing = productByName.get(item.key);

      if (!existing) {
        console.warn(`  ! ${item.name}: DB에 없는 상품이라 레시피를 건너뜁니다.`);
        continue;
      }

      if (isSameRecipeInfo(existing.recipe_info, item.recipeInfo)) {
        continue;
      }

      updatedItems.push({
        id: existing.id,
        name: existing.product_name,
        patch: { recipe_info: item.recipeInfo },
        changes: [
          `레시피 교체 (재료 ${item.recipeInfo.ingredients.length}개 / 순서 ${item.recipeInfo.steps.length}개)`,
        ],
      });
    }

    return {
      recipesOnly: true,
      newCategories: [],
      updatedCategories: [],
      deactivatedCategories: [],
      newItems: [],
      updatedItems,
      softDeleted: [],
    };
  }

  const newCategories = [];
  const updatedCategories = [];
  const categoryIdByName = new Map();
  const categoryIndexByName = new Map();

  menu.categories.forEach((definition, index) => {
    const key = normalizeName(definition.name);
    const sortOrder = (index + 1) * CATEGORY_ORDER_STEP;

    categoryIndexByName.set(key, index);

    const found = categoryByName.get(key);

    if (!found) {
      const created = {
        id: randomUUID(),
        name: definition.name,
        code: definition.code,
        sort_order: sortOrder,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      newCategories.push(created);
      categoryIdByName.set(key, created.id);
      categoryNameById.set(created.id, created.name);
      return;
    }

    categoryIdByName.set(key, found.id);

    const patch = {};
    const changes = [];

    if (definition.code && String(found.code || "") !== definition.code) {
      patch.code = definition.code;
      changes.push(`코드 ${found.code || "(없음)"} → ${definition.code}`);
    }

    if (Number(found.sort_order ?? 0) !== sortOrder) {
      patch.sort_order = sortOrder;
    }

    if (found.is_active === false) {
      patch.is_active = true;
      changes.push("다시 노출");
    }

    if (Object.keys(patch).length > 0) {
      updatedCategories.push({
        id: found.id,
        name: found.name,
        patch,
        changes,
      });
    }
  });

  const itemCountByCategory = new Map();

  const newItems = [];
  const updatedItems = [];
  const matchedIds = new Set();
  const finalCategoryIdsById = new Map();
  const exposedCategoryIds = new Set();

  for (const item of menu.items) {
    const categoryKey = normalizeName(item.categoryNames[0] || "");
    const categoryIndex = categoryIndexByName.has(categoryKey)
      ? categoryIndexByName.get(categoryKey)
      : 0;
    const ordinal = (itemCountByCategory.get(categoryKey) || 0) + 1;

    itemCountByCategory.set(categoryKey, ordinal);

    const sortOrder = (categoryIndex + 1) * CATEGORY_ORDER_STEP + ordinal;
    const categoryIds = item.categoryNames
      .map((name) => categoryIdByName.get(normalizeName(name)) || "")
      .filter((id) => id);
    const categoryId = categoryIds[0] || "";
    const recipeInfo =
      item.recipeInfo ||
      (item.ingredients.length > 0
        ? { description: "", ingredients: item.ingredients }
        : {});

    for (const id of categoryIds) {
      exposedCategoryIds.add(id);
    }

    const existing = productByName.get(item.key);

    if (!existing) {
      newItems.push({
        id: randomUUID(),
        product_name: item.name,
        description: item.description,
        category_id: categoryId,
        category_ids: categoryIds,
        base_price: item.price,
        stock: item.stock === null ? DEFAULT_STOCK : item.stock,
        image_url: "",
        is_active: true,
        is_sold_out: false,
        sort_order: sortOrder,
        option_groups: item.optionGroups || [],
        recipe_info: recipeInfo,
      });
      continue;
    }

    matchedIds.add(existing.id);
    finalCategoryIdsById.set(existing.id, categoryIds);

    const existingCategoryIds = Array.isArray(existing.category_ids)
      ? existing.category_ids.filter((id) => id)
      : [];
    const patch = {};
    const changes = [];

    if (Number(existing.base_price || 0) !== item.price) {
      patch.base_price = item.price;
      changes.push(
        `가격 ${Number(existing.base_price || 0).toLocaleString("ko-KR")} → ${item.price.toLocaleString("ko-KR")}`
      );
    }

    if (
      String(existing.category_id || "") !== categoryId ||
      existingCategoryIds.join(",") !== categoryIds.join(",")
    ) {
      patch.category_id = categoryId;
      patch.category_ids = categoryIds;
      const before = existingCategoryIds
        .map((id) => categoryNameById.get(id) || id)
        .join(" + ");
      const after = categoryIds
        .map((id) => categoryNameById.get(id) || id)
        .join(" + ");

      changes.push(`카테고리 ${before || "(없음)"} → ${after || "(없음)"}`);
    }

    if (String(existing.description || "").trim() !== item.description) {
      patch.description = item.description;
      changes.push("설명 변경");
    }

    if (item.recipeInfo) {
      if (!isSameRecipeInfo(existing.recipe_info, item.recipeInfo)) {
        patch.recipe_info = item.recipeInfo;
        changes.push(
          `레시피 교체 (재료 ${item.recipeInfo.ingredients.length}개 / 순서 ${item.recipeInfo.steps.length}개)`
        );
      }
    } else if (
      item.ingredients.length > 0 &&
      !String(existing.recipe_text || "").trim() &&
      isEmptyRecipeInfo(existing.recipe_info)
    ) {
      patch.recipe_info = recipeInfo;
      changes.push(`레시피 정보 추가 (${item.ingredients.length}개 재료)`);
    }

    if (Array.isArray(item.optionGroups)) {
      const currentGroups = Array.isArray(existing.option_groups)
        ? existing.option_groups
        : [];

      if (JSON.stringify(currentGroups) !== JSON.stringify(item.optionGroups)) {
        patch.option_groups = item.optionGroups;
        changes.push(
          item.optionGroups.length === 0
            ? `옵션 제거 (${currentGroups.length}개 그룹)`
            : `옵션 ${item.optionGroups.length}개 그룹으로 교체`
        );
      }
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

  const deactivatedCategories = [];

  if (menu.syncCategories) {
    const visibleCountByCategoryId = new Map();

    for (const categoryIds of finalCategoryIdsById.values()) {
      for (const id of categoryIds) {
        visibleCountByCategoryId.set(
          id,
          (visibleCountByCategoryId.get(id) || 0) + 1
        );
      }
    }

    for (const category of existingCategories) {
      if (category.is_active === false || exposedCategoryIds.has(category.id)) {
        continue;
      }

      deactivatedCategories.push({
        id: category.id,
        name: category.name,
        remaining: visibleCountByCategoryId.get(category.id) || 0,
      });
    }
  }

  return {
    newCategories,
    updatedCategories,
    deactivatedCategories,
    newItems,
    updatedItems,
    softDeleted,
  };
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

  if (plan.recipesOnly) {
    console.log(
      "레시피만 반영 모드(--recipes-only): 카테고리/가격/재고/삭제는 건드리지 않습니다."
    );
    console.log("");
  }

  if (plan.newCategories.length > 0) {
    printList(
      "카테고리 추가",
      plan.newCategories,
      (row) => `${row.name} (${row.code || "코드 없음"})`
    );
  }

  if (plan.updatedCategories.length > 0) {
    printList(
      "카테고리 갱신",
      plan.updatedCategories,
      (row) =>
        `${row.name}: ${row.changes.length > 0 ? row.changes.join(", ") : "정렬 순서 변경"}`
    );
  }

  if (plan.deactivatedCategories.length > 0) {
    printList(
      "카테고리 비활성화",
      plan.deactivatedCategories,
      (row) => `${row.name} (남는 노출 상품 ${row.remaining}개)`
    );
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

  if (plan.updatedCategories.length > 0) {
    console.log(`카테고리 ${plan.updatedCategories.length}개 갱신...`);

    for (const item of plan.updatedCategories) {
      await updateRow("categories", item.id, { ...item.patch, updated_at: now });
    }
  }

  if (plan.deactivatedCategories.length > 0) {
    console.log(`카테고리 ${plan.deactivatedCategories.length}개 비활성화...`);

    for (const item of plan.deactivatedCategories) {
      await updateRow("categories", item.id, {
        is_active: false,
        updated_at: now,
      });
    }
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
  const existingCategories = await fetchRows(
    "categories",
    "id,name,code,sort_order,is_active"
  );
  const existingProducts = await fetchRows(
    "products",
    "id,product_name,description,base_price,stock,category_id,category_ids,is_active,sort_order,deleted_at,recipe_text,recipe_info,option_groups"
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
  const afterCategories = await fetchRows("categories", "id,is_active");

  console.log("");
  console.log(
    `완료: 상품 ${after.length}개 (노출 ${exposed.length} / 소프트삭제 ${after.filter((item) => item.deleted_at).length})`
  );
  console.log(
    `완료: 카테고리 ${afterCategories.length}개 (노출 ${afterCategories.filter((item) => item.is_active).length})`
  );
}

main().catch((error) => {
  console.error(String(error && error.message ? error.message : error));
  process.exit(1);
});
