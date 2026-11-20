// 손님 입장 처리: 테이블 확인 + 열려 있는 주문서 찾기/만들기.
//
// 예전에는 브라우저가 /rest/v1 으로 직접 주문서를 만들었지만, 이제는 서버가
// 손님 세션을 발급하면서 같은 트랜잭션에서 주문서를 준비합니다.
// (손님은 /rest/v1 에서 주문서를 새로 만들 수 없습니다.)
import { pool } from "./db.js";
import { HttpError } from "./http/errors.js";

export const TABLE_NUMBER_MAX = 999;

export function normalizeTableNumber(value) {
  const digits = String(value ?? "")
    .trim()
    .replace(/[^\d]/g, "");

  return digits.replace(/^0+(?=\d)/, "");
}

export function formatSequenceNo(sequenceNo) {
  return String(sequenceNo).padStart(6, "0");
}

// 프런트(src/lib/orderSheet.js)와 같은 규칙: 한글 1자 = 2 units, 그 외 1 unit.
const HANGUL_CHAR_PATTERN = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/;
const NICKNAME_MAX_UNITS = 16;

export function countNicknameUnits(nickname) {
  return [...String(nickname || "").trim()].reduce(
    (total, char) => total + (HANGUL_CHAR_PATTERN.test(char) ? 2 : 1),
    0
  );
}

export function validateGuestNickname(nickname) {
  if (countNicknameUnits(nickname) > NICKNAME_MAX_UNITS) {
    return "닉네임은 한글 8자(영문·숫자 16자)까지 입력할 수 있어요.";
  }

  return "";
}

function activeSheetKey(tableNumber) {
  return `table_${normalizeTableNumber(tableNumber)}`;
}

export function toPublicOrderSheet(row) {
  if (!row) {
    return null;
  }

  const status = String(row.status || "OPEN");

  return {
    orderSheetId: row.id,
    tableNumber: String(row.table_number || ""),
    displayName: String(row.display_name || ""),
    tableNickname: String(row.table_nickname || ""),
    status,
    isReusable: status === "OPEN",
    totalAmount: Number(row.total_amount || 0),
    orderCount: Number(row.order_count || 0),
  };
}

async function findActiveRow(client, tableNumber) {
  const { rows } = await client.query(
    `select id, order_sheet_id
       from public.active_order_sheets
      where table_number = $1
      limit 1
      for update`,
    [tableNumber]
  );

  return rows[0] || null;
}

async function readOrderSheet(client, orderSheetId) {
  if (!orderSheetId) {
    return null;
  }

  const { rows } = await client.query(
    `select id, table_number, display_name, table_nickname, status,
            total_amount, order_count
       from public.order_sheets
      where id = $1
      limit 1`,
    [orderSheetId]
  );

  return rows[0] || null;
}

async function reserveSequenceNo(client) {
  const { rows } = await client.query(
    `insert into public.counters (id, last_sequence_no, updated_at)
     values ('orderSheet', 1, now())
     on conflict (id) do update
        set last_sequence_no = public.counters.last_sequence_no + 1,
            updated_at = now()
     returning last_sequence_no`
  );

  return Number(rows[0].last_sequence_no);
}

async function ensureOpenOrderSheetOnClient(client, tableNumber) {
  const activeRow = await findActiveRow(client, tableNumber);
  const current = activeRow ? await readOrderSheet(client, activeRow.order_sheet_id) : null;

  if (current && String(current.status || "") === "OPEN") {
    return toPublicOrderSheet(current);
  }

  const sequenceNo = await reserveSequenceNo(client);
  const orderSheetId = formatSequenceNo(sequenceNo);
  const displayName = `No.${tableNumber}`;

  const inserted = await client.query(
    `insert into public.order_sheets
       (id, sequence_no, business_date, table_number, display_name, table_nickname,
        status, payment_status, payment_method, total_amount, order_count,
        latest_order_items_preview, latest_order_summary_text)
     values ($1, $2, now(), $3, $4, '', 'OPEN', 'UNPAID', '', 0, 0, '[]'::jsonb, '')
     returning id, table_number, display_name, table_nickname, status,
               total_amount, order_count`,
    [orderSheetId, sequenceNo, tableNumber, displayName]
  );

  if (activeRow) {
    await client.query(
      `update public.active_order_sheets
          set order_sheet_id = $2,
              display_name = $3,
              status = 'OPEN',
              business_date = now(),
              updated_at = now()
        where id = $1`,
      [activeRow.id, orderSheetId, displayName]
    );
  } else {
    await client.query(
      `insert into public.active_order_sheets
         (id, table_number, display_name, order_sheet_id, status, business_date, updated_at)
       values ($1, $2, $3, $4, 'OPEN', now(), now())
       on conflict (id) do update
          set table_number = excluded.table_number,
              display_name = excluded.display_name,
              order_sheet_id = excluded.order_sheet_id,
              status = 'OPEN',
              business_date = excluded.business_date,
              updated_at = now()`,
      [activeSheetKey(tableNumber), tableNumber, displayName, orderSheetId]
    );
  }

  return toPublicOrderSheet(inserted.rows[0]);
}

// 테이블 번호를 검증하고, 그 테이블의 열려 있는 주문서를 돌려줍니다.
// 없으면 새로 만듭니다. 동시에 두 손님이 입장해도 주문서는 하나만 생깁니다.
export async function openTableOrderSheet(tableNumber) {
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeTableNumber) {
    throw new HttpError(400, "HJ400", "테이블 번호를 확인할 수 없어요.");
  }

  if (Number(safeTableNumber) > TABLE_NUMBER_MAX) {
    throw new HttpError(400, "HJ400", "존재하지 않는 테이블 번호예요.");
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows } = await client.query(
      `select table_number, is_active from public.bar_tables where table_number = $1 limit 1`,
      [Number(safeTableNumber)]
    );

    const table = rows[0];

    if (!table || table.is_active === false) {
      throw new HttpError(
        404,
        "HJ404",
        "사용할 수 없는 테이블이에요. 직원에게 문의해 주세요."
      );
    }

    const orderSheet = await ensureOpenOrderSheetOnClient(client, safeTableNumber);

    await client.query("commit");

    return { tableNumber: safeTableNumber, orderSheet };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function readOrderSheetById(orderSheetId) {  const safeId = String(orderSheetId || "").trim();

  if (!safeId) {
    return null;
  }

  const { rows } = await pool.query(
    `select id, table_number, display_name, table_nickname, status,
            total_amount, order_count
       from public.order_sheets
      where id = $1
      limit 1`,
    [safeId]
  );

  return toPublicOrderSheet(rows[0]);
}

// 입장 화면에서 테이블 존재 여부와 기존 닉네임을 미리 보여주기 위한 조회입니다.
// (손님 세션이 아직 없으므로 주문서 내용은 노출하지 않습니다.)
export async function readTableEntryInfo(tableNumber) {
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeTableNumber) {
    throw new HttpError(400, "HJ400", "테이블 번호를 확인할 수 없어요.");
  }

  if (Number(safeTableNumber) > TABLE_NUMBER_MAX) {
    throw new HttpError(400, "HJ400", "존재하지 않는 테이블 번호예요.");
  }

  const { rows } = await pool.query(
    `select t.table_number,
            t.is_active,
            a.order_sheet_id,
            s.table_nickname,
            s.status
       from public.bar_tables t
       left join public.active_order_sheets a on a.table_number = $2
       left join public.order_sheets s on s.id = a.order_sheet_id
      where t.table_number = $1
      limit 1`,
    [Number(safeTableNumber), safeTableNumber]
  );

  const row = rows[0];

  if (!row || row.is_active === false) {
    throw new HttpError(
      404,
      "HJ404",
      "사용할 수 없는 테이블이에요. 직원에게 문의해 주세요."
    );
  }

  const status = String(row.status || "");

  return {
    tableNumber: safeTableNumber,
    displayName: `No.${safeTableNumber}`,
    tableNickname: status === "OPEN" ? String(row.table_nickname || "") : "",
    hasOpenSheet: status === "OPEN",
  };
}
