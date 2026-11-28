// 직원 세션(쿠키) 처리.
//
// 쿠키에는 해시의 원본이 되는 임의 토큰이 담기고, DB 에는 sha256 해시만 저장합니다.
// 세션 테이블은 /rest/v1 화이트리스트에 없으므로 API 로만 접근됩니다.
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { config } from "../config.js";
import { pool } from "../db.js";
import { HttpError } from "../http/errors.js";
import { parseCookies, serializeCookie } from "./cookies.js";
import {
  ROLE_LABELS,
  arcPermissionsForEmployee,
  isArcDirector,
  permissionsForEmployee,
} from "./permissions.js";

const HOUR_MS = 60 * 60 * 1000;
const USER_AGENT_MAX = 300;

export function hashToken(token) {
  return createHash("sha256").update(String(token ?? "")).digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

export function isSecureRequest(request) {
  if (config.cookieSecure === "true") {
    return true;
  }

  if (config.cookieSecure === "false") {
    return false;
  }

  // auto: 프록시(Vercel/Cloudflare)가 넘긴 x-forwarded-proto 를 신뢰합니다.
  return request.protocol === "https";
}

export function readStaffToken(request) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[config.staffCookieName];

  return typeof token === "string" ? token.trim() : "";
}

export function setStaffCookie(reply, token, { request, maxAgeMs }) {
  reply.header(
    "set-cookie",
    serializeCookie(config.staffCookieName, token, {
      maxAge: Math.floor(maxAgeMs / 1000),
      expires: new Date(Date.now() + maxAgeMs),
      secure: isSecureRequest(request),
      httpOnly: true,
      sameSite: "Lax",
      domain: config.staffCookieDomain || undefined,
      path: "/",
    })
  );
}

export function clearStaffCookie(reply, { request }) {
  reply.header(
    "set-cookie",
    serializeCookie(config.staffCookieName, "", {
      maxAge: 0,
      expires: new Date(0),
      secure: isSecureRequest(request),
      httpOnly: true,
      sameSite: "Lax",
      domain: config.staffCookieDomain || undefined,
      path: "/",
    })
  );
}

export function toPublicEmployee(row) {
  return {
    id: row.id,
    loginId: row.login_id,
    name: row.name || "",
    role: row.role,
    // 표시용 직위(예: 'ARC 대표(RN)'). 비어 있으면 화면에서 역할명으로 대체합니다.
    title: row.title || "",
    titleLabel: row.title || ROLE_LABELS[row.role] || row.role,
    permissions: permissionsForEmployee(row),
    // 응급안전관리센터 총괄 계정이면 프런트가 ARC 를 첫 화면으로 엽니다.
    isArcDirector: isArcDirector(row.login_id),
    // null = 역할 기본값 사용, 배열 = 직원별 직접 설정값
    permissionOverrides: Array.isArray(row.permissions)
      ? [...row.permissions]
      : null,
    // 응급안전 9종 오버라이드 (null = 역할 기본값)
    arcPermissions: arcPermissionsForEmployee(row),
    arcPermissionOverrides: Array.isArray(row.arc_permissions)
      ? [...row.arc_permissions]
      : null,
    isActive: row.is_active !== false,
    lastLoginAt: row.last_login_at || null,
  };
}

export function sessionTtlMs(remember) {
  const days = Number.isFinite(config.staffRememberDays) && config.staffRememberDays > 0
    ? config.staffRememberDays
    : 30;

  const hours = Number.isFinite(config.staffSessionHours) && config.staffSessionHours > 0
    ? config.staffSessionHours
    : 12;

  return remember ? days * 24 * HOUR_MS : hours * HOUR_MS;
}

export async function createStaffSession(employeeId, { request, remember = false }) {
  const token = newToken();
  const ttlMs = sessionTtlMs(remember);
  const expiresAt = new Date(Date.now() + ttlMs);

  await pool.query(
    `insert into public.staff_sessions
       (id, employee_id, token_hash, user_agent, ip, expires_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      employeeId,
      hashToken(token),
      String(request.headers["user-agent"] || "").slice(0, USER_AGENT_MAX),
      String(request.ip || ""),
      expiresAt,
    ]
  );

  return { token, ttlMs, expiresAt };
}

export async function resolveStaffSession(token) {
  if (!token) {
    return null;
  }

  const result = await pool.query(
    `select s.id as session_id,
            s.expires_at,
            e.id,
            e.login_id,
            e.name,
            e.role,
            e.permissions,
            e.is_active,
            e.last_login_at
       from public.staff_sessions s
       join public.employees e on e.id = s.employee_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
      limit 1`,
    [hashToken(token)]
  );

  const row = result.rows[0];

  if (!row || row.is_active === false) {
    return null;
  }

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    employee: toPublicEmployee(row),
  };
}

export async function revokeStaffSession(token) {
  if (!token) {
    return;
  }

  await pool.query(
    `update public.staff_sessions
        set revoked_at = now()
      where token_hash = $1
        and revoked_at is null`,
    [hashToken(token)]
  );
}

export async function revokeSessionsForEmployee(employeeId, { keepSessionId = null } = {}) {
  await pool.query(
    `update public.staff_sessions
        set revoked_at = now()
      where employee_id = $1
        and revoked_at is null
        and ($2::text is null or id <> $2)`,
    [employeeId, keepSessionId]
  );
}

export async function purgeExpiredSessions() {
  await pool.query(
    `delete from public.staff_sessions
      where expires_at < now() - interval '7 days'
         or (revoked_at is not null and revoked_at < now() - interval '7 days')`
  );
}

// 라우트에서 preHandler 로 사용합니다. permission 을 주면 권한까지 확인합니다.
export function createStaffGuard(permission = null) {
  return async (request, reply) => {
    const token = readStaffToken(request);
    const staff = await resolveStaffSession(token);

    if (!staff) {
      if (token) {
        clearStaffCookie(reply, { request });
      }

      throw new HttpError(401, "HJ401", "로그인이 필요해요.");
    }

    if (permission && !staff.employee.permissions.includes(permission)) {
      throw new HttpError(403, "HJ403", "이 작업을 할 권한이 없어요.");
    }

    request.staff = staff;
  };
}
