import { createBackupService, registerBackupJobs } from "./backup.js";
import { config, configProblems } from "./config.js";
import { handleInteraction, registerGuildCommands } from "./commands.js";
import { createPool } from "./db.js";
import { createDiscordService } from "./discordService.js";
import { startInternalApi } from "./internalApi.js";
import { createJobQueue, startJobWorker } from "./jobs.js";
import { createLogger } from "./logger.js";
import { captureSnapshot, registerSnapshotJob } from "./snapshot.js";

const log = createLogger(config.logLevel);

async function main() {
  const pool = createPool(log);
  const queue = createJobQueue({ pool, log });
  const service = createDiscordService({ pool, log });
  const backups = createBackupService({ pool, log, service, queue });

  const deps = {
    pool,
    log,
    queue,
    service,
    backups,
    captureSnapshot,
    configProblems,
  };

  const handlers = {};

  registerSnapshotJob(handlers, { pool, log, requireGuild: service.requireGuild });
  registerBackupJobs(handlers, { backups, queue, log });

  service.attachHandlers({
    onReady: async () => {
      const guild = await service.requireGuild();

      await service.upsertGuild(guild);

      const names = await registerGuildCommands(guild);

      log.info("slash commands registered", { count: names.length, names });
    },
    onInteraction: (interaction) => handleInteraction(interaction, deps),
  });

  // 이전 프로세스가 남긴 RUNNING 작업을 되살립니다.
  await queue.requeueStale(10);

  const worker = startJobWorker({ queue, log, handlers, pollMs: config.jobPollMs });
  const api = startInternalApi({ log, deps });

  // 스케줄러: next_backup_at 이 지나면 BACKUP 잡을 큐에 넣습니다. 실제 실행은 워커가 담당합니다.
  let ticking = false;

  async function scheduleTick() {
    if (ticking) {
      return;
    }

    ticking = true;

    try {
      await backups.tick();
    } catch (error) {
      log.warn("backup scheduler tick failed", { err: error });
    } finally {
      ticking = false;
    }
  }

  const scheduler = setInterval(scheduleTick, config.backup.schedulerPollMs);
  scheduler.unref();

  await service.start();

  await scheduleTick();

  const problems = configProblems();

  if (problems.length > 0) {
    log.warn("bot running with incomplete configuration", {
      missing: problems.map((item) => item.key),
    });
  }

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    log.info("shutting down", { signal });

    clearInterval(scheduler);

    try {
      await api.stop();
    } catch (error) {
      log.warn("internal api stop failed", { err: error });
    }

    try {
      await worker.stop();
    } catch (error) {
      log.warn("worker stop failed", { err: error });
    }

    try {
      await service.stop();
    } catch (error) {
      log.warn("discord stop failed", { err: error });
    }

    await pool.end().catch(() => {});

    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    log.error("unhandled rejection", { error: reason });
  });
  process.on("uncaughtException", (error) => {
    log.error("uncaught exception", { err: error });
  });

  log.info("bot started", {
    version: "0.1.0",
    guildId: config.discord.guildId || null,
    configured: service.state.configured,
  });
}

main().catch((error) => {
  log.error("bot bootstrap failed", { err: error });
  process.exitCode = 1;
});
