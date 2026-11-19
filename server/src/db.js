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

// 테이블 컬럼 목록을 information_schema 에서 읽어 캐시합니다.
export async function columns(table) {
  const cached = columnCache.get(table);

  if (cached) {
    return cached;
  }

  const { rows } = await pool.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [table]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "PGRST205", `테이블을 찾을 수 없어요: ${table}`);
  }

  const names = new Set(rows.map((row) => row.column_name));

  columnCache.set(table, names);

  return names;
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
