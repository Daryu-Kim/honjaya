import { buildApp } from "./app.js";
import { purgeExpiredSessions } from "./auth/sessions.js";
import { config } from "./config.js";
import { closePool } from "./db.js";
import { messagingReadiness } from "./messaging.js";
import { startEventBroadcast, stopEventBroadcast } from "./routes/events.js";

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
