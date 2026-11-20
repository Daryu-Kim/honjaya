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
  // 직원 로그인 세션(쿠키). 기본 12시간, "로그인 유지" 선택 시 30일입니다.
  staffCookieName: process.env.STAFF_COOKIE_NAME || "hj_staff",
  staffSessionHours: Number(process.env.STAFF_SESSION_HOURS || 12),
  staffRememberDays: Number(process.env.STAFF_REMEMBER_DAYS || 30),
  // 비워두면 요청 Host 에만 붙는 호스트 전용 쿠키가 됩니다(가장 안전).
  staffCookieDomain: String(process.env.STAFF_COOKIE_DOMAIN || "").trim(),
  // auto(기본): https 요청일 때만 Secure. 로컬 http 개발에서는 자동으로 꺼집니다.
  cookieSecure: String(process.env.COOKIE_SECURE || "auto").trim().toLowerCase(),
};
