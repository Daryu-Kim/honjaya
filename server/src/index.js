import { buildApp } from "./app.js";
import { purgeExpiredSessions } from "./auth/sessions.js";
import { config } from "./config.js";
import { closePool } from "./db.js";
import { startEventBroadcast, stopEventBroadcast } from "./routes/events.js";

const app = await buildApp();

await startEventBroadcast(app.log);

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
