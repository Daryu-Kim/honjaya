import { buildApp } from "./app.js";
import { purgeExpiredSessions } from "./auth/sessions.js";
import { config } from "./config.js";
import { closePool, pool } from "./db.js";
import { messagingReadiness } from "./messaging.js";
import { startEventBroadcast, stopEventBroadcast } from "./routes/events.js";
import {
  applySchema,
  expectedTables,
  schemaFingerprint,
} from "../scripts/apply-schema.mjs";

// 배포 후 migrate 를 잊으면 화면마다 "테이블을 찾을 수 없어요." 가 뜹니다.
// AUTO_SCHEMA=1 이면 기동할 때 (1) SQL 이 만들어야 하는 테이블이 다 있는지,
// (2) 마지막으로 적용한 SQL 지문과 지금 SQL 지문이 같은지 확인하고,
// 둘 중 하나라도 어긋나면 스키마를 적용합니다.
// (모든 SQL 이 멱등이라 이미 적용된 DB 에서는 조회 한 번으로 끝납니다)
async function missingTables() {
  const tables = expectedTables();
  const select = tables
    .map((name) => `to_regclass('public.${name}') is not null as ${name}`)
    .join(", ");
  const { rows } = await pool.query(`select ${select}`);

  return tables.filter((name) => !rows[0][name]);
}

async function appliedSchemaHash() {
  try {
    const { rows } = await pool.query(
      "select sql_hash from public.schema_state where id = 'schema'"
    );

    return rows[0]?.sql_hash || "";
  } catch (error) {
    // schema_state 가 없는 예전 DB 는 아직 아무것도 기록되지 않은 상태입니다.
    if (error.code === "42P01" || error.code === "42703") {
      return "";
    }

    throw error;
  }
}

async function ensureSchema(log) {
  const missing = await missingTables();
  const applied = await appliedSchemaHash();
  const expected = schemaFingerprint();

  if (missing.length === 0 && applied === expected) {
    log.info("[schema] 스키마 최신 상태 확인");
    return;
  }

  if (missing.length > 0) {
    log.info(`[schema] 없는 테이블 ${missing.length}개: ${missing.join(", ")}`);
  } else {
    log.info("[schema] SQL 파일이 바뀌어서 스키마를 다시 적용합니다.");
  }

  log.info("[schema] 기동 중 스키마를 적용합니다. 첫 배포에서는 1~2분 걸릴 수 있어요.");

  await applySchema(config.databaseUrl, log);

  const still = await missingTables();

  if (still.length > 0) {
    throw new Error(`스키마 적용 후에도 없는 테이블: ${still.join(", ")}`);
  }

  log.info("[schema] 기동 시 스키마 적용 완료");
}

if (config.autoSchema) {
  try {
    await ensureSchema(console);
  } catch (error) {
    console.error(`[schema] 기동 시 스키마 적용 실패: ${error.message}`);
    console.error(
      "[schema] 서버에서 `docker compose --profile tools run --rm migrate` 로 다시 적용해 주세요."
    );
  }
}

const app = await buildApp();

await startEventBroadcast(app.log);

// 마케팅 문자 발송 상태를 기동 로그에 남깁니다(키 값은 남기지 않습니다).
const messaging = messagingReadiness();

if (messaging.dryRun) {
  app.log.warn(
    `[messaging] 검수용 모드(${messaging.provider}) — 실제 문자는 발송되지 않습니다. 실발송은 MESSAGING_PROVIDER=solapi 로 바꾼 뒤 api 를 재시작하세요.`
  );
} else if (!messaging.credentialsReady) {
  app.log.error(
    `[messaging] 발송 설정 누락: ${messaging.missing.join(", ")} — 이 상태로는 발송이 실패합니다.`
  );
} else {
  app.log.info("[messaging] 실사용 모드 — 솔라피 문자 발송이 켜져 있습니다.");
}

// 만료된 직원 세션 정리 (하루 한 번). 실패해도 서버 기동은 계속합니다.
purgeExpiredSessions().catch((error) => {
  app.log.warn(`[auth] 만료 세션 정리 실패: ${error.message}`);
});

setInterval(
  () => {
    purgeExpiredSessions().catch((error) => {
      app.log.warn(`[auth] 만료 세션 정리 실패: ${error.message}`);
    });
  },
  24 * 60 * 60 * 1000
).unref();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info(`[server] ${signal} 수신, 종료합니다`);

  await stopEventBroadcast();
  await app.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
