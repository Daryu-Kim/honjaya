import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

// Supabase Table Editor 가 내려준 `*_rows.csv` 파일을 자체 Postgres 로 옮깁니다.
// 스키마가 Supabase 와 같으므로 컬럼을 그대로 매핑하고, id 기준 upsert 라 재실행해도 안전합니다.
//   node scripts/import-supabase-export.mjs --dir <csv 폴더> [--skip-active] [--dry-run]

const IMPORT_PLAN = [
  { table: "categories" },
  { table: "products" },
  { table: "app_settings" },
  { table: "counters" },
  { table: "order_sheets" },
  { table: "orders" },
  { table: "active_order_sheets", activePointers: true },
];

const ARRAY_TYPES = new Set(["_text", "_varchar", "_int4", "_int8"]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let index = 0;
  let quoted = false;

  if (text.charCodeAt(0) === 0xfeff) {
    index = 1;
  }

  while (index < text.length) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        quoted = false;
        index += 1;
        continue;
      }

      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }

    if (char === "\r" && text[index + 1] === "\n") {
      index += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.length > 1 || (entry[0] ?? "").trim() !== "");
}

function readCsvObjects(path) {
  const [header, ...lines] = parseCsv(readFileSync(path, "utf8"));
  const columns = header.map((name) => name.trim());

  return lines.map((line) => {
    const record = {};

    columns.forEach((name, position) => {
      record[name] = line[position] ?? "";
    });

    return record;
  });
}

function findExports(dir) {
  const byTable = new Map();

  for (const file of readdirSync(dir)) {
    if (!file.toLowerCase().endsWith(".csv")) {
      continue;
    }

    const match = /^([a-z0-9_]+?)_rows/i.exec(file);

    if (!match) {
      continue;
    }

    const table = match[1];
    byTable.set(table, [...(byTable.get(table) || []), join(dir, file)]);
  }

  return byTable;
}

function isBlank(value) {
  return value === undefined || value === null || value.trim() === "";
}

function parseArrayLiteral(raw) {
  const trimmed = raw.trim();

  if (!trimmed.startsWith("[")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);

    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function coerceValue(raw, column) {
  if (isBlank(raw)) {
    if (column.isNullable) {
      return null;
    }

    if (column.udtName === "bool") {
      return false;
    }

    if (ARRAY_TYPES.has(column.udtName)) {
      return [];
    }

    if (column.udtName === "json" || column.udtName === "jsonb") {
      return "{}";
    }

    if (/^(int2|int4|int8|numeric|float4|float8)$/.test(column.udtName)) {
      return 0;
    }

    return "";
  }

  if (ARRAY_TYPES.has(column.udtName)) {
    const parsed = parseArrayLiteral(raw);

    if (parsed) {
      return parsed;
    }

    if (/^\{.*\}$/s.test(raw.trim())) {
      return raw.trim();
    }

    // 배열에 값이 하나만 있는 구형 export 는 JSON 으로 감싸서 복원합니다.
    return [raw];
  }

  if (column.udtName === "bool") {
    return raw.trim() === "true" || raw.trim() === "t" || raw.trim() === "1";
  }

  if (/^(int2|int4|int8|numeric|float4|float8)$/.test(column.udtName)) {
    const number = Number(raw);

    if (!Number.isFinite(number)) {
      throw new Error(`${column.name}: 숫자가 아닌 값 ${JSON.stringify(raw)}`);
    }

    return number;
  }

  if (column.udtName === "json" || column.udtName === "jsonb") {
    try {
      JSON.parse(raw);
    } catch {
      throw new Error(`${column.name}: JSON 파싱 실패 ${JSON.stringify(raw.slice(0, 80))}`);
    }

    return raw;
  }

  return raw;
}

async function loadColumns(client, table) {
  const { rows } = await client.query(
    `select column_name, udt_name, is_nullable
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [table]
  );

  if (rows.length === 0) {
    throw new Error(`${table} 테이블이 없습니다. 먼저 npm run db:apply 를 실행하세요.`);
  }

  return rows.map((row) => ({
    name: row.column_name,
    udtName: row.udt_name,
    isNullable: row.is_nullable === "YES",
  }));
}

async function upsertRows(client, table, columns, records, log) {
  const available = new Set(columns.map((column) => column.name));
  const used = columns.filter((column) => records.length > 0 && Object.hasOwn(records[0], column.name));

  if (used.length === 0) {
    throw new Error(`${table}: CSV 컬럼과 테이블 컬럼이 하나도 일치하지 않습니다.`);
  }

  const ignored = Object.keys(records[0]).filter((name) => !available.has(name));

  if (ignored.length > 0) {
    log.info?.(`[import] ${table}: 테이블에 없는 CSV 컬럼 무시 -> ${ignored.join(", ")}`);
  }

  const missing = columns
    .filter((column) => !Object.hasOwn(records[0], column.name) && column.name !== "id")
    .map((column) => column.name);

  if (missing.length > 0) {
    log.info?.(`[import] ${table}: CSV 에 없는 컬럼은 기본값 사용 -> ${missing.join(", ")}`);
  }

  const names = used.map((column) => column.name);
  const conflictTargets = names.includes("id") ? "id" : names[0];
  const updates = names
    .filter((name) => name !== conflictTargets)
    .map((name) => `${name} = excluded.${name}`);
  const BATCH_SIZE = 100;
  let written = 0;

  for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
    const batch = records.slice(offset, offset + BATCH_SIZE);
    const params = [];
    const tuples = batch.map((record) => {
      const placeholders = used.map((column) => {
        params.push(coerceValue(record[column.name], column));

        return `$${params.length}`;
      });

      return `(${placeholders.join(", ")})`;
    });

    const sql = [
      `insert into public.${table} (${names.join(", ")}) values ${tuples.join(", ")}`,
      updates.length > 0 ? `on conflict (${conflictTargets}) do update set ${updates.join(", ")}` : `on conflict (${conflictTargets}) do nothing`,
    ].join(" ");

    await client.query(sql, params);
    written += batch.length;
  }

  return written;
}

async function syncCounters(client) {
  const { rows } = await client.query(
    `insert into public.counters (id, last_sequence_no)
     values ('orderSheet', (select coalesce(max(sequence_no), 0) from public.order_sheets))
     on conflict (id) do update
       set last_sequence_no = greatest(public.counters.last_sequence_no, excluded.last_sequence_no),
           updated_at = now()
     returning id, last_sequence_no`
  );

  return rows[0];
}

async function verify(client) {
  const checks = [];

  const count = async (label, sql) => {
    const { rows } = await client.query(sql);
    checks.push([label, rows[0].value]);
  };

  await count("categories", "select count(*)::text as value from public.categories");
  await count("products", "select count(*)::text as value from public.products");
  await count("products(recipe_info)", "select count(*)::text as value from public.products where recipe_info <> '{}'::jsonb");
  await count("order_sheets", "select count(*)::text as value from public.order_sheets");
  await count("orders", "select count(*)::text as value from public.orders");
  await count("active_order_sheets", "select count(*)::text as value from public.active_order_sheets");
  await count("counters", "select coalesce(max(last_sequence_no), 0)::text as value from public.counters where id = 'orderSheet'");
  await count(
    "orders(끊긴 주문서)",
    "select count(*)::text as value from public.orders o left join public.order_sheets s on s.id = o.order_sheet_id where s.id is null"
  );
  await count(
    "매출합계(마감분)",
    "select coalesce(sum(total_amount), 0)::text as value from public.order_sheets where payment_status = 'COMPLETED'"
  );

  return checks;
}

export async function importExport({ databaseUrl, dir, skipActive = false, dryRun = false, log = console }) {
  const root = resolve(dir);

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`CSV 폴더를 찾을 수 없습니다: ${root}`);
  }

  const exportsByTable = findExports(root);
  const client = new pg.Client({ connectionString: databaseUrl });

  await client.connect();

  const summary = [];

  try {
    for (const step of IMPORT_PLAN) {
      const files = exportsByTable.get(step.table) || [];

      if (files.length === 0) {
        log.info?.(`[import] ${step.table}: CSV 없음 -> 건너뜀`);
        continue;
      }

      if (step.activePointers && skipActive) {
        log.info?.("[import] active_order_sheets: --skip-active 로 건너뜀");
        continue;
      }

      const columns = await loadColumns(client, step.table);
      let records = files.flatMap((file) => readCsvObjects(file));

      if (step.activePointers) {
        const { rows } = await client.query("select id, status from public.order_sheets");
        const states = new Map(rows.map((row) => [row.id, row.status]));
        const skipped = records.filter((record) => states.get(record.order_sheet_id) !== "OPEN");

        if (skipped.length > 0) {
          log.info?.(
            `[import] active_order_sheets: 마감됐거나 없는 주문서를 가리키는 ${skipped.length}건 제외 -> ${skipped
              .map((record) => `${record.id}(${record.order_sheet_id})`)
              .join(", ")}`
          );
        }

        records = records.filter((record) => states.get(record.order_sheet_id) === "OPEN");
      }

      if (dryRun) {
        log.info?.(`[import] ${step.table}: ${records.length}건 (dry-run, 쓰기 없음)`);
        summary.push({ table: step.table, rows: records.length });
        continue;
      }

      await client.query("begin");

      try {
        const written = await upsertRows(client, step.table, columns, records, log);
        await client.query("commit");
        log.info?.(`[import] ${step.table}: ${written}건 반영 (${files.map((file) => basename(file)).join(", ")})`);
        summary.push({ table: step.table, rows: written });
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    if (!dryRun) {
      const counter = await syncCounters(client);
      log.info?.(`[import] counters: ${counter.id} = ${counter.last_sequence_no}`);
    }

    const checks = await verify(client);

    return { summary, checks };
  } finally {
    await client.end();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const { config } = await import("../src/config.js");
  const argv = process.argv.slice(2);
  const dirIndex = argv.indexOf("--dir");
  const dir = dirIndex >= 0 ? argv[dirIndex + 1] : "";

  if (!dir) {
    console.error("사용법: node scripts/import-supabase-export.mjs --dir <CSV 폴더> [--skip-active] [--dry-run]");
    process.exit(1);
  }

  try {
    const result = await importExport({
      databaseUrl: config.databaseUrl,
      dir,
      skipActive: argv.includes("--skip-active"),
      dryRun: argv.includes("--dry-run"),
    });

    console.log("\n[import] 검증");
    for (const [label, value] of result.checks) {
      console.log(`  ${label.padEnd(22)} ${value}`);
    }

    console.log("\n[import] 완료");
  } catch (error) {
    console.error("[import] 실패:", error.message);
    process.exit(1);
  }
}
