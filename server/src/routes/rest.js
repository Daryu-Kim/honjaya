import { columns, columnTypes, pool } from "../db.js";
import { HttpError, badRequest } from "../http/errors.js";
import { wantsObject, parsePrefer } from "../http/prefer.js";
import {
  buildWhere,
  parseFilters,
  parseOrder,
  parseSelect,
  quoteIdent,
} from "../http/sql.js";
import { assertWritable, tableMeta } from "../tables.js";
import {
  resolveRestIdentity,
  scopeDeleteFilters,
  scopeInsertRows,
  scopeSelectFilters,
  scopeUpdateBody,
} from "../auth/restIdentity.js";
import { revokeGuestSessionsForSheet } from "../auth/guestSessions.js";

const DEFAULT_LIMIT = 10_000;
const MAX_LIMIT = 10_000;

// node-postgres 는 JS 배열을 Postgres 배열 리터럴로 직렬화합니다.
// json/jsonb 컬럼에 그대로 바인딩하면 invalid input syntax for type json 이 나므로
// (PostgREST 와 동일하게) 배열·객체를 JSON 문자열로 바꿔서 넘깁니다.
const JSON_TYPE_NAMES = new Set(["json", "jsonb"]);

function toColumnValue(types, column, value) {
  if (value === undefined || value === null) {
    return null;
  }

  // 이미 문자열이면 그대로 둡니다. (미리 stringify 된 JSON 도 계속 동작해야 합니다.)
  if (JSON_TYPE_NAMES.has(types.get(column)) && typeof value !== "string") {
    return JSON.stringify(value);
  }

  return value;
}

async function resolveTable(table) {
  const meta = tableMeta(table);

  return {
    meta,
    cols: await columns(table),
    types: await columnTypes(table),
  };
}

function pagination(request) {
  const query = request.query || {};
  let limit = query.limit === undefined ? null : Number.parseInt(query.limit, 10);
  let offset = query.offset === undefined ? 0 : Number.parseInt(query.offset, 10);
  const range = request.headers.range;

  // .range(from, to) 는 Range 헤더로 옵니다. (Range-Unit: items)
  if (range && limit === null) {
    const match = /^(\d+)-(\d*)$/.exec(String(range).trim());

    if (match) {
      const from = Number.parseInt(match[1], 10);
      const to = match[2] ? Number.parseInt(match[2], 10) : from + DEFAULT_LIMIT - 1;

      offset = from;
      limit = Math.max(0, to - from + 1);
    }
  }

  if (!Number.isFinite(offset) || offset < 0) {
    offset = 0;
  }

  if (limit === null || !Number.isFinite(limit) || limit <= 0) {
    limit = DEFAULT_LIMIT;
  }

  return { limit: Math.min(limit, MAX_LIMIT), offset };
}

function sendRows(request, reply, rows, options = {}) {
  const { status = 200, total = null, offset = 0 } = options;

  if (total !== null) {
    const range = rows.length > 0
      ? `${offset}-${offset + rows.length - 1}/${total}`
      : `*/${total}`;

    reply.header("content-range", range);
  }

  if (wantsObject(request.headers.accept)) {
    if (rows.length !== 1) {
      throw new HttpError(
        406,
        "PGRST116",
        "JSON object requested, multiple (or no) rows returned"
      );
    }

    return reply.code(status).send(rows[0]);
  }

  return reply.code(status).send(rows);
}

function groupRowsByKeySet(rows, cols) {
  const groups = new Map();

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw badRequest("요청 본문은 객체 또는 객체 배열이어야 해요");
    }

    const keys = Object.keys(row);

    if (keys.length === 0) {
      throw badRequest("저장할 값이 없어요");
    }

    for (const key of keys) {
      if (!cols.has(key)) {
        throw new HttpError(400, "PGRST204", `컬럼을 찾을 수 없어요: ${key}`);
      }
    }

    const groupKey = keys.join(",");

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { keys, rows: [] });
    }

    groups.get(groupKey).rows.push(row);
  }

  return [...groups.values()];
}

// 필터에 걸리는 행의 id 만 뽑습니다. (주문서 마감 시 손님 세션을 끊을 때 사용)
async function collectIds(table, cols, filters) {
  const params = [];
  const where = buildWhere(filters, cols, params);
  const { rows } = await pool.query(
    `select id from ${quoteIdent(table)}${where}`,
    params
  );

  return rows.map((row) => row.id);
}

async function handleSelect(request, reply) {
  const table = request.params.table;
  const { cols } = await resolveTable(table);
  const params = [];
  const identity = await resolveRestIdentity(request);
  const filters = scopeSelectFilters(table, identity, parseFilters(request.query));
  const where = buildWhere(filters, cols, params);
  const select = parseSelect(request.query?.select, cols);
  const order = parseOrder(request.query?.order, cols);
  const { limit, offset } = pagination(request);
  const prefer = parsePrefer(request.headers.prefer);

  const sql = `select ${select} from ${quoteIdent(table)}${where}${order} limit ${limit} offset ${offset}`;
  const { rows } = await pool.query(sql, params);

  let total = null;

  if (prefer.count === "exact" || prefer.count === "planned" || prefer.count === "estimated") {
    const countResult = await pool.query(
      `select count(*)::bigint as total from ${quoteIdent(table)}${where}`,
      params
    );

    total = Number(countResult.rows[0].total);
  }

  return sendRows(request, reply, rows, { total, offset });
}

async function handleInsert(request, reply) {
  const table = request.params.table;
  const { meta, cols, types } = await resolveTable(table);

  assertWritable(table, meta);
  const prefer = parsePrefer(request.headers.prefer);
  const identity = await resolveRestIdentity(request);
  const rawRows = Array.isArray(request.body) ? request.body : [request.body];
  const rows = scopeInsertRows(
    table,
    identity,
    rawRows.filter((row) => row !== undefined && row !== null)
  );
  const body = rows;

  if (body.length === 0) {    throw badRequest("저장할 값이 없어요");
  }

  const onConflict = String(request.query?.on_conflict || "")
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);

  for (const column of onConflict) {
    if (!cols.has(column)) {
      throw new HttpError(400, "PGRST204", `컬럼을 찾을 수 없어요: ${column}`);
    }
  }

  const inserted = [];

  for (const group of groupRowsByKeySet(body, cols)) {
    const params = [];
    const push = (value) => {
      params.push(value ?? null);

      return `$${params.length}`;
    };

    const tuples = group.rows.map((row) => {
      const placeholders = group.keys.map((key) =>
        push(toColumnValue(types, key, row[key]))
      );

      return `(${placeholders.join(", ")})`;
    });

    let sql = `insert into ${quoteIdent(table)} (${group.keys
      .map(quoteIdent)
      .join(", ")}) values ${tuples.join(", ")}`;

    if (onConflict.length > 0) {
      const target = onConflict.map(quoteIdent).join(", ");
      const updates = group.keys
        .filter((key) => !onConflict.includes(key))
        .map((key) => `${quoteIdent(key)} = excluded.${quoteIdent(key)}`);

      if (prefer.resolution === "ignore-duplicates") {
        sql += ` on conflict (${target}) do nothing`;
      } else if (updates.length > 0) {
        sql += ` on conflict (${target}) do update set ${updates.join(", ")}`;
      } else {
        sql += ` on conflict (${target}) do nothing`;
      }
    }

    if (prefer.return === "representation") {
      sql += ` returning ${parseSelect(request.query?.select, cols)}`;
    }

    const result = await pool.query(sql, params);

    inserted.push(...result.rows);
  }

  if (prefer.return === "representation") {
    return sendRows(request, reply, inserted, { status: 201 });
  }

  return reply.code(201).send();
}

async function handleUpdate(request, reply) {
  const table = request.params.table;
  const { meta, cols, types } = await resolveTable(table);

  assertWritable(table, meta);
  const prefer = parsePrefer(request.headers.prefer);
  const identity = await resolveRestIdentity(request);
  const rawBody = Array.isArray(request.body) ? request.body[0] : request.body;

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw badRequest("요청 본문은 객체여야 해요");
  }

  const body = scopeUpdateBody(table, identity, rawBody);
  const entries = Object.entries(body);

  if (entries.length === 0) {
    throw badRequest("수정할 값이 없어요");
  }

  const params = [];
  const assignments = entries.map(([key, value]) => {
    if (!cols.has(key)) {
      throw new HttpError(400, "PGRST204", `컬럼을 찾을 수 없어요: ${key}`);
    }

    params.push(toColumnValue(types, key, value));

    return `${quoteIdent(key)} = $${params.length}`;
  });

  const filters = scopeSelectFilters(
    table,
    identity,
    parseFilters(request.query)
  );
  const where = buildWhere(filters, cols, params);
  const returning = prefer.return === "representation"
    ? ` returning ${parseSelect(request.query?.select, cols)}`
    : "";
  // 주문서를 마감하면 그 테이블 손님 세션을 끊습니다. (다음 손님과 주문이 섞이지 않게)
  const closingSheets = table === "order_sheets" && body.status === "CLOSED";
  const closedIds = closingSheets ? await collectIds(table, cols, filters) : [];
  const sql = `update ${quoteIdent(table)} set ${assignments.join(", ")}${where}${returning}`;
  const result = await pool.query(sql, params);

  for (const sheetId of closedIds) {
    try {
      await revokeGuestSessionsForSheet(sheetId);
    } catch (error) {
      request.log.warn({ err: error }, "손님 세션 정리에 실패했습니다");
    }
  }

  if (prefer.return === "representation") {
    return sendRows(request, reply, result.rows);
  }

  return reply.code(204).send();
}

async function handleDelete(request, reply) {
  const table = request.params.table;
  const { meta, cols } = await resolveTable(table);

  assertWritable(table, meta);
  const prefer = parsePrefer(request.headers.prefer);
  const identity = await resolveRestIdentity(request);
  const params = [];
  const filters = scopeDeleteFilters(
    table,
    identity,
    parseFilters(request.query)
  );
  const where = buildWhere(filters, cols, params);
  const returning = prefer.return === "representation"
    ? ` returning ${parseSelect(request.query?.select, cols)}`
    : "";
  const result = await pool.query(`delete from ${quoteIdent(table)}${where}${returning}`, params);

  if (prefer.return === "representation") {
    return sendRows(request, reply, result.rows);
  }

  return reply.code(204).send();
}

// supabase-js 의 PostgREST 호출을 그대로 받아주는 범용 CRUD 엔드포인트입니다.
export function registerRestRoutes(app) {
  app.get("/rest/v1/:table", handleSelect);
  app.post("/rest/v1/:table", handleInsert);
  app.patch("/rest/v1/:table", handleUpdate);
  app.delete("/rest/v1/:table", handleDelete);
}
