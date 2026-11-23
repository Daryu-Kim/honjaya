import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const botRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// server/src/config.js 와 같은 방식(.env 수동 파싱)으로 동작합니다.
// docker compose 로 띄울 때는 compose 의 environment 가 우선이고, 이 파일이 덮어쓰지 않습니다.
function loadEnvFile() {
  const file = process.env.ENV_FILE || resolve(botRoot, ".env");

  if (!existsSync(file)) {
    return;
  }

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function text(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function num(name, fallback) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  databaseUrl: text("DATABASE_URL", "postgres://postgres:postgres@127.0.0.1:5432/honjaya"),
  poolMax: num("DB_POOL_MAX", 4),
  port: num("BOT_PORT", 4100),
  host: text("BOT_HOST", "0.0.0.0"),
  internalToken: text("BOT_INTERNAL_TOKEN"),
  logLevel: text("LOG_LEVEL", "info"),
  jobPollMs: num("BOT_JOB_POLL_MS", 3000),
  discord: {
    token: text("DISCORD_BOT_TOKEN"),
    applicationId: text("DISCORD_APPLICATION_ID"),
    guildId: text("DISCORD_GUILD_ID"),
    ownerUserId: text("DISCORD_OWNER_USER_ID"),
    backupChannelId: text("DISCORD_BACKUP_CHANNEL_ID"),
    announceChannelId: text("DISCORD_ANNOUNCE_CHANNEL_ID"),
  },
  backup: {
    dir: text("BACKUP_DIR", "/backups"),
    encryptionKey: text("BACKUP_ENCRYPTION_KEY"),
    maxUploadMb: num("DISCORD_MAX_UPLOAD_MB", 20),
  },
};

// 필수 값이 비어 있어도 프로세스를 죽이지 않습니다.
// 대신 "설정 누락" 상태로 계속 살아 있으면서 관리자 화면에 이유를 보여 줍니다.
export function configProblems() {
  const problems = [];

  if (!config.discord.token) {
    problems.push({
      key: "DISCORD_BOT_TOKEN",
      message: "Discord 봇 토큰이 없어 게이트웨이에 접속하지 않습니다.",
    });
  }

  if (!config.discord.guildId) {
    problems.push({
      key: "DISCORD_GUILD_ID",
      message: "관리할 길드 ID가 없습니다.",
    });
  }

  if (!config.internalToken) {
    problems.push({
      key: "BOT_INTERNAL_TOKEN",
      message: "내부 API 토큰이 없어 API 서버의 요청을 모두 거부합니다.",
    });
  }

  if (!config.backup.encryptionKey) {
    problems.push({
      key: "BACKUP_ENCRYPTION_KEY",
      message: "백업 암호화 키가 없어 백업(P12B)을 실행할 수 없습니다.",
    });
  }

  return problems;
}
