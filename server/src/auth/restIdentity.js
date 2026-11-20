// /rest/v1 요청의 접근 범위(누가 무엇을 볼 수 있는지)를 정합니다.
//
// 지금까지 /rest/v1 은 apikey 만 맞으면 누구나 모든 행을 읽고 쓸 수 있었습니다.
// 손님 세션(guest_sessions)이 생기면서, 손님은 "내 테이블 주문서"로 범위를 제한합니다.
//
//   staff(직원 쿠키)  → 기존과 동일하게 전체 접근
//   guest(손님 쿠키)  → 주문/주문서/활성주문서를 자기 테이블 주문서로 강제 제한
//   anon              → 주문 관련 테이블은 403 (상품/카테고리 등은 공개 유지)
import { config } from "../config.js";
import { HttpError } from "../http/errors.js";
import { parseCookies } from "./cookies.js";
import { resolveGuestSession } from "./guestSessions.js";
import { resolveStaffSession } from "./sessions.js";

const GUEST_SCOPED_TABLES = new Set([
  "orders",
  "order_sheets",
  "active_order_sheets",
]);

const DENIED_MESSAGE = "내 테이블 주문서에만 접근할 수 있어요.";

// 손님이 직접 갱신할 수 있는 주문서 컬럼(닉네임/합계 계산용).
const GUEST_ORDER_SHEET_COLUMNS = new Set([
  "table_nickname",
  "total_amount",
  "order_count",
  "latest_order_items_preview",
  "latest_order_summary_text",
  "updated_at",
]);

// 손님이 만들 수 있는 주문은 이 컬럼들을 서버가 강제로 채웁니다.
const GUEST_ORDER_FORCED_COLUMNS = new Set([
  "order_sheet_id",
  "table_number",
  "display_name",
  "guest_session_id",
  "guest_nickname",
]);

export async function resolveRestIdentity(request) {
  const cookies = parseCookies(request.headers.cookie);
  const staffToken = cookies[config.staffCookieName];

  if (staffToken) {
    const staff = await resolveStaffSession(staffToken);

    if (staff) {
      return { kind: "staff", employee: staff.employee };
    }
  }

  const guest = await resolveGuestSession(cookies[config.guestCookieName]);

  if (guest) {
    return { kind: "guest", session: guest };
  }

  return { kind: "anon" };
}

// staff / 공개 테이블은 손대지 않습니다.
function guardTable(table, identity) {
  if (!GUEST_SCOPED_TABLES.has(table) || identity.kind === "staff") {
    return false;
  }

  if (identity.kind === "anon") {
    throw new HttpError(403, "HJ403", "주문 정보는 테이블 입장 후에 볼 수 있어요.");
  }

  return true;
}

function guestFilters(table, identity) {
  const orderSheetId = identity.session.orderSheetId;
  const column = table === "order_sheets" ? "id" : "order_sheet_id";

  return [{ column, op: "eq", operand: orderSheetId }];
}

export function scopeSelectFilters(table, identity, filters) {
  if (!guardTable(table, identity)) {
    return filters;
  }

  return [...filters, ...guestFilters(table, identity)];
}

export function scopeInsertRows(table, identity, rows) {
  if (!guardTable(table, identity)) {
    return rows;
  }

  if (table !== "orders") {
    throw new HttpError(403, "HJ403", DENIED_MESSAGE);
  }

  const { orderSheetId, tableNumber, id: sessionId, nickname } = identity.session;
  const forced = {
    order_sheet_id: orderSheetId,
    table_number: tableNumber,
    display_name: `No.${tableNumber}`,
    guest_session_id: sessionId,
    guest_nickname: nickname,
  };

  return rows.map((row) => {
    const next = { ...row };

    for (const column of GUEST_ORDER_FORCED_COLUMNS) {
      next[column] = forced[column];
    }

    // 손님이 상태를 조작하지 못하게 항상 '요청됨' 으로 만듭니다.
    next.status = "REQUESTED";

    return next;
  });
}

export function scopeUpdateBody(table, identity, body) {
  if (!guardTable(table, identity)) {
    return body;
  }

  if (table !== "order_sheets") {
    throw new HttpError(403, "HJ403", DENIED_MESSAGE);
  }

  const next = {};

  for (const [key, value] of Object.entries(body)) {
    if (!GUEST_ORDER_SHEET_COLUMNS.has(key)) {
      throw new HttpError(403, "HJ403", `이 항목은 손님이 바꿀 수 없어요: ${key}`);
    }

    next[key] = value;
  }

  return next;
}

export function scopeDeleteFilters(table, identity, filters) {
  if (!guardTable(table, identity)) {
    return filters;
  }

  throw new HttpError(403, "HJ403", DENIED_MESSAGE);
}
