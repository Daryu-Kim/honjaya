// 손님 테이블 세션(쿠키) 처리.
//
// 직원 세션(./sessions.js)과 같은 방식입니다: 쿠키에는 임의 토큰, DB 에는 sha256 해시만.
// 다른 점은 세션이 (테이블 번호, 열려 있는 주문서)에 묶인다는 것과, 권한 대신
// "내 테이블 주문서만" 이라는 접근 범위를 만든다는 것입니다.
import { randomUUID } from "node:crypto";

import { config } from "../config.js";
import { pool } from "../db.js";
import { parseCookies, serializeCookie } from "./cookies.js";
import { hashToken, isSecureRequest } from "./sessions.js";

const HOUR_MS = 60 * 60 * 1000;
const USER_AGENT_MAX = 300;
const NICKNAME_MAX = 24;

function newToken() {
  return `${randomUUID()}.${randomUUID()}`;
}

function guestTtlMs() {
  const hours =
    Number.isFinite(config.guestSessionHours) && config.guestSessionHours > 0
      ? config.guestSessionHours
      : 12;

  return hours * HOUR_MS;
}

export function normalizeNickname(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, NICKNAME_MAX);
}

export function readGuestToken(request) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[config.guestCookieName];

  return typeof token === "string" ? token.trim() : "";
}

export function setGuestCookie(reply, token, { request, maxAgeMs }) {
  reply.header(
    "set-cookie",
    serializeCookie(config.guestCookieName, token, {
      maxAge: Math.floor(maxAgeMs / 1000),
      expires: new Date(Date.now() + maxAgeMs),
      secure: isSecureRequest(request),
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    })
  );
}

export function clearGuestCookie(reply, { request }) {
  reply.header(
    "set-cookie",
    serializeCookie(config.guestCookieName, "", {
      maxAge: 0,
      expires: new Date(0),
      secure: isSecureRequest(request),
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    })
  );
}

export function toPublicGuestSession(row) {
  return {
    id: row.id,
    tableNumber: String(row.table_number || ""),
    orderSheetId: String(row.order_sheet_id || ""),
    nickname: String(row.nickname || ""),
    createdAt: row.created_at || null,
    expiresAt: row.expires_at || null,
  };
}

export async function createGuestSession({
  tableNumber,
  orderSheetId,
  nickname,
  request,
}) {
  const token = newToken();
  const ttlMs = guestTtlMs();
  const expiresAt = new Date(Date.now() + ttlMs);
  const id = randomUUID();

  await pool.query(
    `insert into public.guest_sessions
       (id, table_number, order_sheet_id, nickname, token_hash, user_agent, ip, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      tableNumber,
      orderSheetId,
      normalizeNickname(nickname),
      hashToken(token),
      String(request.headers["user-agent"] || "").slice(0, USER_AGENT_MAX),
      String(request.ip || ""),
      expiresAt,
    ]
  );

  return { id, token, ttlMs, expiresAt };
}

export async function resolveGuestSession(token) {
  if (!token) {
    return null;
  }

  const result = await pool.query(
    `select id, table_number, order_sheet_id, nickname, created_at, expires_at
       from public.guest_sessions
      where token_hash = $1
        and revoked_at is null
        and expires_at > now()
      limit 1`,
    [hashToken(token)]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  pool
    .query(`update public.guest_sessions set last_seen_at = now() where id = $1`, [
      row.id,
    ])
    .catch(() => {});

  return toPublicGuestSession(row);
}

export async function updateGuestSession(id, { orderSheetId, nickname, expiresAt }) {
  const result = await pool.query(
    `update public.guest_sessions
        set order_sheet_id = coalesce($2, order_sheet_id),
            nickname = coalesce($3, nickname),
            expires_at = coalesce($4, expires_at),
            last_seen_at = now()
      where id = $1
        and revoked_at is null
      returning id, table_number, order_sheet_id, nickname, created_at, expires_at`,
    [id, orderSheetId ?? null, nickname ?? null, expiresAt ?? null]
  );

  const row = result.rows[0];

  return row ? toPublicGuestSession(row) : null;
}

export function guestSessionExpiry() {
  const ttlMs = guestTtlMs();

  return { ttlMs, expiresAt: new Date(Date.now() + ttlMs) };
}

export async function revokeGuestSession(token) {
  if (!token) {
    return;
  }

  await pool.query(
    `update public.guest_sessions
        set revoked_at = now()
      where token_hash = $1
        and revoked_at is null`,
    [hashToken(token)]
  );
}

// 주문서가 결제/마감되면 그 주문서에 묶인 손님 세션을 모두 끊습니다.
export async function revokeGuestSessionsForSheet(orderSheetId) {
  const safeId = String(orderSheetId || "").trim();

  if (!safeId) {
    return;
  }

  await pool.query(
    `update public.guest_sessions
        set revoked_at = now()
      where order_sheet_id = $1
        and revoked_at is null`,
    [safeId]
  );
}

export async function purgeExpiredGuestSessions() {
  await pool.query(
    `delete from public.guest_sessions
      where expires_at < now() - interval '7 days'
         or (revoked_at is not null and revoked_at < now() - interval '7 days')`
  );
}
