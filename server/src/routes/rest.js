import { columns, pool } from "../db.js";
import { HttpError, badRequest } from "../http/errors.js";
import { wantsObject, parsePrefer } from "../http/prefer.js";
import {
  buildWhere,
  parseFilters,
  parseOrder,
  parseSelect,
  quoteIdent,
} from "../http/sql.js";
import { tableMeta } from "../tables.js";

const DEFAULT_LIMIT = 10_000;
const MAX_LIMIT = 10_000;

async function resolveTable(table) {
  const meta = tableMeta(table);

  return { meta, cols: await columns(table) };
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

async function handleSelect(request, reply) {
  const table = request.params.table;
  const { cols } = await resolveTable(table);
  const params = [];
  const where = buildWhere(parseFilters(request.query), cols, params);
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
  const { cols } = await resolveTable(table);
  const prefer = parsePrefer(request.headers.prefer);
  const rows = Array.isArray(request.body) ? request.body : [request.body];
  const body = rows.filter((row) => row !== undefined && row !== null);

  if (body.length === 0) {
    throw badRequest("저장할 값이 없어요");
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
      const placeholders = group.keys.map((key) => push(row[key]));

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
  const { cols } = await resolveTable(table);
  const prefer = parsePrefer(request.headers.prefer);
  const body = Array.isArray(request.body) ? request.body[0] : request.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("요청 본문은 객체여야 해요");
  }

  const entries = Object.entries(body);

  if (entries.length === 0) {
    throw badRequest("수정할 값이 없어요");
  }

  const params = [];
  const assignments = entries.map(([key, value]) => {
    if (!cols.has(key)) {
      throw new HttpError(400, "PGRST204", `컬럼을 찾을 수 없어요: ${key}`);
    }

    params.push(value ?? null);

    return `${quoteIdent(key)} = $${params.length}`;
  });

  const where = buildWhere(parseFilters(request.query), cols, params);
  const returning = prefer.return === "representation"
    ? ` returning ${parseSelect(request.query?.select, cols)}`
    : "";
  const sql = `update ${quoteIdent(table)} set ${assignments.join(", ")}${where}${returning}`;
  const result = await pool.query(sql, params);

  if (prefer.return === "representation") {
    return sendRows(request, reply, result.rows);
  }

  return reply.code(204).send();
}

async function handleDelete(request, reply) {
  const table = request.params.table;
  const { cols } = await resolveTable(table);
  const prefer = parsePrefer(request.headers.prefer);
  const params = [];
  const where = buildWhere(parseFilters(request.query), cols, params);
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
