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

export async function applySchema(connectionString, log = console) {
  const client = new pg.Client({ connectionString });

  await client.connect();

  try {
    await client.query(BOOTSTRAP_SQL);
    await runSqlFile(client, join(repoRoot, "supabase", "schema.sql"), log);

    const patches = readdirSync(join(repoRoot, "supabase"))
      .filter((file) => /^patch-\d+.*\.sql$/i.test(file))
      .sort();

    for (const patch of patches) {
      const number = (/^patch-(\d+)/i.exec(patch)?.[1] || "").padStart(3, "0");

      if (SKIP_PATCH_NUMBERS.has(number)) {
        log.info?.(`[schema] ${patch}: 건너뜀(Supabase/데이터 전용)`);
        continue;
      }

      await runSqlFile(client, join(repoRoot, "supabase", patch), log);
    }

    // 마스터 표가 먼저 있어야 events.sql 의 트리거 생성 루프가 bar_tables 를 잡습니다.
    await runSqlFile(client, join(serverRoot, "sql", "tables.sql"), log);
    await runSqlFile(client, join(serverRoot, "sql", "events.sql"), log);
    await runSqlFile(client, join(serverRoot, "sql", "staff.sql"), log);
    // guest.sql 은 orders 를 alter 하므로 schema.sql 이후에 실행되어야 합니다.
    await runSqlFile(client, join(serverRoot, "sql", "guest.sql"), log);
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
