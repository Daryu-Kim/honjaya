import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(serverRoot, "..");

function loadEnvFile() {
  const file = process.env.ENV_FILE || resolve(serverRoot, ".env");

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

    // 이미 지정된 환경변수를 .env 가 덮어쓰지 않도록 합니다.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function list(value, fallback) {
  const items = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  databaseUrl:
    process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/honjaya",
  poolMax: Number(process.env.DB_POOL_MAX || 10),
  anonKey: String(process.env.ANON_KEY || "").trim(),
  serviceKey: String(process.env.SERVICE_KEY || "").trim(),
  corsOrigins: list(process.env.CORS_ORIGINS, ["*"]),
  logLevel: process.env.LOG_LEVEL || "info",
};
