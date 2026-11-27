import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

import { repoRoot, serverRoot } from "../src/config.js";

// 새 DB 에는 필요 없는(운영 데이터 전용) 패치와 Supabase 전용 패치는 건너뜁니다.
//   003: 전체 상품 판매중지 (데이터 조작)
//   004: 칵테일 카테고리 삭제 (데이터 조작)
//   007: Edge Function + pg_net 기반 푸시 트리거 (Supabase 전용)
const SKIP_PATCH_NUMBERS = new Set(["003", "004", "007"]);

// 이 스키마는 Supabase 의 RLS 역할을 전제로 작성되어 있어서, 먼저 역할을 만들어 둡니다.
const BOOTSTRAP_SQL = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

create table if not exists public.schema_state (
  id         text primary key,
  sql_hash   text not null default '',
  applied_at timestamptz not null default now()
);
`;

function splitStatements(sql) {
  const statements = [];
  let current = "";
  let index = 0;
  let mode = "normal";
  let dollarTag = "";

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (mode === "lineComment") {
      current += char;
      index += 1;

      if (char === "\n") {
        mode = "normal";
      }

      continue;
    }

    if (mode === "blockComment") {
      if (char === "*" && next === "/") {
        current += "*/";
        index += 2;
        mode = "normal";
        continue;
      }

      current += char;
      index += 1;
      continue;
    }

    if (mode === "single") {
      current += char;

      if (char === "'") {
        if (next === "'") {
          current += next;
          index += 2;
          continue;
        }

        mode = "normal";
      }

      index += 1;
      continue;
    }

    if (mode === "dollar") {
      if (sql.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        mode = "normal";
        continue;
      }

      current += char;
      index += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      mode = "lineComment";
      current += char;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      mode = "blockComment";
      current += "/*";
      index += 2;
      continue;
    }

    if (char === "'") {
      mode = "single";
      current += char;
      index += 1;
      continue;
    }

    if (char === "$") {
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(index));

      if (tag) {
        dollarTag = tag[0];
        mode = "dollar";
        current += dollarTag;
        index += dollarTag.length;
        continue;
      }
    }

    if (char === ";") {
      statements.push(current.trim());
      current = "";
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements.filter((statement) => {
    const withoutComments = statement.replace(/--[^\n]*/g, "").trim();

    return withoutComments.length > 0 && withoutComments !== ";";
  });
}

function isAlreadyApplied(error) {
  return error.code === "42710" || error.code === "42P07" || error.code === "42P16"
    ? true
    : /already exists|already member of publication/i.test(error.message);
}

async function runSqlFile(client, path, log) {
  const label = basename(path);
  const statements = splitStatements(readFileSync(path, "utf8"));
  let applied = 0;
  let skipped = 0;

  for (const statement of statements) {
    try {
      await client.query(statement);
      applied += 1;
    } catch (error) {
      if (isAlreadyApplied(error)) {
        skipped += 1;
        continue;
      }

      error.message = `${label}: ${error.message}`;
      throw error;
    }
  }

  log.info?.(`[schema] ${label}: ${applied}개 적용, ${skipped}개 이미 적용됨`);
}

// applySchema 가 실제로 실행하는 SQL 파일 목록(순서 중요).
// 목록을 여기 한 곳에서만 관리해서, 기동 시 점검(index.js)과 실제 적용이 어긋나지 않게 합니다.
export function schemaFiles(log = null) {
  const files = [join(repoRoot, "supabase", "schema.sql")];

  const patches = readdirSync(join(repoRoot, "supabase"))
    .filter((file) => /^patch-\d+.*\.sql$/i.test(file))
    .sort();

  for (const patch of patches) {
    const number = (/^patch-(\d+)/i.exec(patch)?.[1] || "").padStart(3, "0");

    if (SKIP_PATCH_NUMBERS.has(number)) {
      log?.info?.(`[schema] ${patch}: 건너뜀(Supabase/데이터 전용)`);
      continue;
    }

    files.push(join(repoRoot, "supabase", patch));
  }

  return [
    ...files,
    // 마스터 표가 먼저 있어야 events.sql 의 트리거 생성 루프가 bar_tables 를 잡습니다.
    join(serverRoot, "sql", "tables.sql"),
    join(serverRoot, "sql", "events.sql"),
    join(serverRoot, "sql", "staff.sql"),
    // guest.sql 은 orders 를 alter 하므로 schema.sql 이후에 실행되어야 합니다.
    join(serverRoot, "sql", "guest.sql"),
    // payments.sql 은 order_sheets 에 paid_amount 를 추가하고 기존 결제를 이관합니다.
    // staff.sql(employees) 이후여야 employee_id 참조가 성립합니다.
    join(serverRoot, "sql", "payments.sql"),
    // points.sql 은 customers/point_ledger 를 만들고 order_sheets 에 points_used 를 추가합니다.
    // employees, payments 가 먼저 있어야 참조가 성립합니다.
    join(serverRoot, "sql", "points.sql"),
    // crm.sql 은 customers 를 확장하고 payments.customer_id 를 붙입니다(방문 이력 계산용).
    join(serverRoot, "sql", "crm.sql"),
    join(serverRoot, "sql", "marketing.sql"),
    // coupons.sql 은 customers 를 참조하므로 맨 마지막에 실행합니다.
    join(serverRoot, "sql", "coupons.sql"),
    // prepaid.sql(선불권) 도 customers/payments 를 참조하므로 그 뒤에 실행합니다.
    join(serverRoot, "sql", "prepaid.sql"),
    // gifts.sql(기프티콘) 은 products/customers/employees 를 참조하므로 맨 마지막입니다.
    join(serverRoot, "sql", "gifts.sql"),
    // discord.sql(P12). 다른 테이블을 참조하지 않는 독립 스키마라 순서는 상관없지만,
    // 봇 컨테이너가 가장 늦게 투입되므로 마지막에 둡니다.
    join(serverRoot, "sql", "discord.sql"),
    // arc.sql(P14 응급안전). employees 를 참조하므로 staff.sql 뒤에 둡니다.
    join(serverRoot, "sql", "arc.sql"),
  ];
}

// 적용 대상 SQL 파일 내용으로 만든 지문.
// 배포된 SQL 과 DB 에 마지막으로 적용된 SQL 이 같은지 비교하는 데 씁니다.
export function schemaFingerprint() {
  const hash = createHash("sha256");

  for (const file of schemaFiles()) {
    hash.update(basename(file));
    hash.update(readFileSync(file, "utf8"));
  }

  return hash.digest("hex").slice(0, 32);
}

// SQL 파일이 만들어야 하는 테이블 이름 목록.
// 목록을 손으로 관리하면 꼭 빠뜨리기 때문에 파일에서 직접 읽습니다.
// 중간에 drop table 로 지우는 테이블(예: chat_messages)은 최종 목록에서 뺍니다.
export function expectedTables() {
  const tables = new Set();

  for (const file of schemaFiles()) {
    const sql = readFileSync(file, "utf8").replace(/--[^\n]*/g, "");

    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi
    )) {
      tables.add(match[1].toLowerCase());
    }

    for (const match of sql.matchAll(
      /drop\s+table\s+(?:if\s+exists\s+)?([^;]+)/gi
    )) {
      for (const chunk of match[1].split(",")) {
        const name = chunk
          .replace(/\b(cascade|restrict)\b/gi, "")
          .split(".")
          .pop()
          .replace(/"/g, "")
          .trim()
          .toLowerCase();

        if (/^[a-z0-9_]+$/.test(name)) {
          tables.delete(name);
        }
      }
    }
  }

  return [...tables];
}

export async function applySchema(connectionString, log = console) {
  const client = new pg.Client({ connectionString });

  await client.connect();

  try {
    await client.query(BOOTSTRAP_SQL);

    for (const file of schemaFiles(log)) {
      await runSqlFile(client, file, log);
    }

    // 어디까지 적용된 DB 인지 지문을 남깁니다. 기동할 때 이 값과 비교해서
    // SQL 파일이 바뀌었으면 스키마를 자동으로 다시 적용합니다(server/src/index.js).
    await client.query(
      `insert into public.schema_state (id, sql_hash, applied_at)
       values ('schema', $1, now())
       on conflict (id) do update set sql_hash = excluded.sql_hash, applied_at = now()`,
      [schemaFingerprint()]
    );
  } finally {
    await client.end();
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const { config } = await import("../src/config.js");

  try {
    await applySchema(config.databaseUrl, console);
    console.log("[schema] 완료");
  } catch (error) {
    console.error("[schema] 실패:", error.message);
    process.exit(1);
  }
}
