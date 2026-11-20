// 손님 입장/세션 API.
//
// 손님은 이제 /rest/v1 으로 주문서를 직접 만들지 않습니다.
// 입장은 이 API 로만 하고, 서버가 쿠키(HttpOnly)에 묶인 세션을 발급합니다.
import {
  clearGuestCookie,
  createGuestSession,
  guestSessionExpiry,
  normalizeNickname,
  purgeExpiredGuestSessions,
  readGuestToken,
  resolveGuestSession,
  revokeGuestSession,
  setGuestCookie,
  updateGuestSession,
} from "../../auth/guestSessions.js";
import {
  openTableOrderSheet,
  readOrderSheetById,
  readTableEntryInfo,
  validateGuestNickname,
} from "../../guest.js";
import { pool } from "../../db.js";
import { HttpError } from "../../http/errors.js";

const EXPIRED_MESSAGE = "입장 정보가 만료됐어요. 테이블 오더 카드를 다시 접촉해 주세요.";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function readNickname(body) {
  const raw = body.nickname ?? body.tableNickname ?? body.table_nickname ?? "";
  const errorMessage = validateGuestNickname(raw);

  if (errorMessage) {
    throw new HttpError(400, "HJ400", errorMessage);
  }

  return normalizeNickname(raw);
}

async function requireGuestSession(request) {
  const token = readGuestToken(request);
  const session = await resolveGuestSession(token);

  if (!session) {
    throw new HttpError(401, "HJ401", EXPIRED_MESSAGE);
  }

  return { token, session };
}

// 주문서에 표시명이 비어 있을 때만 첫 손님 닉네임을 채웁니다.
// (뒤에 입장한 손님이 앞 손님이 정한 테이블 이름을 덮어쓰지 않게)
async function fillSheetNicknameIfEmpty(orderSheet, nickname) {
  if (!nickname || orderSheet.tableNickname) {
    return orderSheet;
  }

  const result = await pool.query(
    `update public.order_sheets
        set table_nickname = $2,
            updated_at = now()
      where id = $1
        and coalesce(table_nickname, '') = ''
      returning table_nickname`,
    [orderSheet.orderSheetId, nickname]
  );

  if (result.rows[0]) {
    orderSheet.tableNickname = String(result.rows[0].table_nickname || "");
  }

  return orderSheet;
}

export function registerGuestRoutes(app) {
  purgeExpiredGuestSessions().catch((error) => {
    app.log.warn({ err: error }, "[guest] 만료 세션 정리 실패");
  });

  // 입장 화면 미리보기(테이블 존재 확인 + 기존 닉네임). 세션은 만들지 않습니다.
  app.get("/api/guest/table", async (request) => {
    const query = request.query || {};

    return {
      table: await readTableEntryInfo(query.tableNumber ?? query.table_number ?? query.table),
    };
  });

  // 테이블 입장: 테이블 확인 → 열린 주문서 준비 → 손님 세션 발급.
  // 같은 브라우저에서 다시 입장하면 기존 세션을 재사용합니다.
  app.post("/api/guest/session", async (request, reply) => {
    const body = readBody(request);
    const nickname = readNickname(body);
    const { tableNumber, orderSheet } = await openTableOrderSheet(
      body.tableNumber ?? body.table_number
    );

    const token = readGuestToken(request);
    const existing = await resolveGuestSession(token);
    const { ttlMs, expiresAt } = guestSessionExpiry();

    let session = null;

    if (existing && existing.tableNumber === tableNumber) {
      session = await updateGuestSession(existing.id, {
        orderSheetId: orderSheet.orderSheetId,
        nickname,
        expiresAt,
      });
    }

    if (session) {
      setGuestCookie(reply, token, { request, maxAgeMs: ttlMs });
    } else {
      const created = await createGuestSession({
        tableNumber,
        orderSheetId: orderSheet.orderSheetId,
        nickname,
        request,
      });

      session = {
        id: created.id,
        tableNumber,
        orderSheetId: orderSheet.orderSheetId,
        nickname,
        createdAt: new Date(),
        expiresAt: created.expiresAt,
      };
      setGuestCookie(reply, created.token, { request, maxAgeMs: created.ttlMs });
    }

    await fillSheetNicknameIfEmpty(orderSheet, nickname);

    return { session, orderSheet };
  });

  // 새로고침/재접속 시 세션 복구.
  app.get("/api/guest/session", async (request, reply) => {
    const token = readGuestToken(request);

    if (!token) {
      throw new HttpError(401, "HJ401", EXPIRED_MESSAGE);
    }

    const session = await resolveGuestSession(token);

    if (!session) {
      clearGuestCookie(reply, { request });
      throw new HttpError(401, "HJ401", EXPIRED_MESSAGE);
    }

    const orderSheet = await readOrderSheetById(session.orderSheetId);

    if (!orderSheet) {
      clearGuestCookie(reply, { request });
      await revokeGuestSession(token);
      throw new HttpError(401, "HJ401", EXPIRED_MESSAGE);
    }

    return { session, orderSheet };
  });

  // 닉네임 변경(내 세션만). 테이블 표시명은 바꾸지 않습니다.
  app.patch("/api/guest/session", async (request) => {
    const { session } = await requireGuestSession(request);
    const nickname = readNickname(readBody(request));
    const updated = await updateGuestSession(session.id, {
      nickname,
      expiresAt: guestSessionExpiry().expiresAt,
    });

    if (!updated) {
      throw new HttpError(401, "HJ401", EXPIRED_MESSAGE);
    }

    return { session: updated };
  });

  app.post("/api/guest/logout", async (request, reply) => {
    const token = readGuestToken(request);

    await revokeGuestSession(token);
    clearGuestCookie(reply, { request });

    return { ok: true };
  });
}
