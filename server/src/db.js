import pg from "pg";

import { config } from "./config.js";
import { HttpError } from "./http/errors.js";

const { Client, Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) => {
  console.error("[pg] idle client error:", error.message);
});

const columnCache = new Map();

// 테이블 컬럼 이름과 타입(udt_name)을 information_schema 에서 읽어 캐시합니다.
async function loadColumns(table) {
  const { rows } = await pool.query(
    `select column_name, udt_name
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [table]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "PGRST205", `테이블을 찾을 수 없어요: ${table}`);
  }

  const entry = {
    names: new Set(rows.map((row) => row.column_name)),
    types: new Map(rows.map((row) => [row.column_name, row.udt_name])),
  };

  columnCache.set(table, entry);

  return entry;
}

async function columnEntry(table) {
  return columnCache.get(table) ?? loadColumns(table);
}

// 테이블 컬럼 이름 집합.
export async function columns(table) {
  const entry = await columnEntry(table);

  return entry.names;
}

// 컬럼 이름 -> udt_name (jsonb, text, _text, ...) 매핑.
export async function columnTypes(table) {
  const entry = await columnEntry(table);

  return entry.types;
}

export function clearColumnCache() {
  columnCache.clear();
}

// SSE 용 LISTEN 전용 커넥션. 풀을 점유하지 않도록 별도 Client 를 씁니다.
export async function createListener() {
  const client = new Client({ connectionString: config.databaseUrl });

  client.on("error", (error) => {
    console.error("[pg] listener error:", error.message);
  });

  await client.connect();

  return client;
}

export async function closePool() {
  await pool.end();
}
