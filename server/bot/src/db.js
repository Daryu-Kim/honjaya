import pg from "pg";

import { config } from "./config.js";

const { Pool } = pg;

export function createPool(log) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on("error", (error) => {
    log?.error?.("pg idle client error", { err: error });
  });

  return pool;
}
