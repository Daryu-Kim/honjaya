import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

import { serverRoot } from "../src/config.js";

// 개발 PC에 Docker 없이 Postgres 를 띄우는 용도입니다.
// 데이터는 server/.pgdata 에 남기 때문에 다시 실행하면 그대로 이어집니다.
// 운영(노트북)에서는 docker-compose 를 쓰세요.
const PORT = Number(process.env.PG_PORT || 5432);
const DATABASE = process.env.PG_DATABASE || "honjaya";
const USER = "postgres";
const PASSWORD = "postgres";
const dataDir = join(serverRoot, ".pgdata");
const connectionString = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;

mkdirSync(dataDir, { recursive: true });

const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: PORT,
  user: USER,
  password: PASSWORD,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (error) => console.error("[dev-db]", error.message),
});

const silent = { info: () => {}, error: console.error, warn: console.warn };

let stopped = false;

async function shutdown(signal) {
  if (stopped) {
    return;
  }

  stopped = true;
  console.log(`\n[dev-db] ${signal} 수신, Postgres 종료 중...`);

  try {
    await postgres.stop();
  } catch {
    // 이미 죽어 있으면 무시
  }

  console.log("[dev-db] 종료 (데이터는 .pgdata 에 보존됨)");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    console.log(`[dev-db] 새 클러스터 생성 (${dataDir})`);
    await postgres.initialise();
  } else {
    console.log(`[dev-db] 기존 클러스터 재사용 (${dataDir})`);
  }

  console.log(`[dev-db] Postgres 시작 (127.0.0.1:${PORT})`);
  await postgres.start();

  try {
    await postgres.createDatabase(DATABASE);
    console.log(`[dev-db] 데이터베이스 ${DATABASE} 생성`);
  } catch (error) {
    if (!/already exists/i.test(error.message)) {
      throw error;
    }
  }

  console.log("[dev-db] 스키마 적용 (멱등)");
  const { applySchema } = await import("./apply-schema.mjs");

  await applySchema(connectionString, silent);
  console.log("[dev-db] 스키마 최신 상태");

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString });
  await client.connect();

  const { rows } = await client.query("select count(*)::int as n from public.products");

  await client.end();

  console.log(`
[dev-db] 준비 완료
  DATABASE_URL = ${connectionString}
  상품 ${rows[0].n}건

다른 터미널에서:
  cd server
  npm run db:import -- --dir <CSV 폴더>   # Supabase 백업이 아직 안 들어갔다면
  npm run dev                              # API 기동 (http://localhost:3000)

종료: Ctrl+C
`);

  await new Promise(() => {});
} catch (error) {
  console.error("[dev-db] 실패:", error.message);
  await postgres.stop().catch(() => {});
  process.exit(1);
}
