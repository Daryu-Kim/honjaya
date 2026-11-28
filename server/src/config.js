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
  // 손님 테이블 세션(쿠키). 술자리 한 번을 덮을 정도로 넉넉하게 잡습니다.
  guestCookieName: process.env.GUEST_COOKIE_NAME || "hj_guest",
  guestSessionHours: Number(process.env.GUEST_SESSION_HOURS || 12),
  // 기프티콘 링크·문자에 넣는 손님용 주소(공개 카드 페이지).
  publicAppUrl: String(
    process.env.PUBLIC_APP_URL || "https://honjaya.vercel.app"
  ).trim(),
  // 마케팅 문자/알림톡 발송. 키가 없으면 dryrun(실제 발송 없음)으로 동작합니다.
  messaging: {
    provider: String(process.env.MESSAGING_PROVIDER || "dryrun").trim(),
    sender: String(process.env.MESSAGING_SENDER || "").trim(),
    solapiApiKey: String(process.env.SOLAPI_API_KEY || "").trim(),
    solapiApiSecret: String(process.env.SOLAPI_API_SECRET || "").trim(),
  },
  // Discord 관리봇(P12). 봇 토큰은 api 가 아니라 bot 컨테이너에만 둡니다.
  // api 는 compose 네트워크 안의 bot:4100 으로만 요청을 넘깁니다.
  discord: {
    botUrl: String(process.env.BOT_API_URL || "http://bot:4100").trim(),
    internalToken: String(process.env.BOT_INTERNAL_TOKEN || "").trim(),
    timeoutMs: Number(process.env.BOT_TIMEOUT_MS || 15000),
  },
  // P14 — ARC SAFETY. 증빙 파일은 로컬 볼륨(백업에 포함)에 둡니다.
  arc: {
    filesDir: resolve(serverRoot, String(process.env.ARC_FILES_DIR || "arc-files").trim()),
  },
  // 기동할 때 스키마(supabase/*.sql + sql/*.sql)를 한 번 적용합니다.
  // "배포했는데 migrate 를 잊어서 테이블을 찾을 수 없어요" 를 막기 위한 장치이고,
  // 모든 SQL 이 멱등이라 여러 번 실행해도 안전합니다. compose api 서비스에서만 켭니다.
  autoSchema: String(process.env.AUTO_SCHEMA || "").trim() === "1",
};
