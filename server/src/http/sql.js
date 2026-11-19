import { badRequest, HttpError } from "./errors.js";

const IDENT = /^[a-z_][a-z0-9_]*$/;

// 쿼리스트링에서 우리가 직접 처리하는 예약 파라미터. 나머지는 모두 필터로 간주합니다.
export const RESERVED_PARAMS = new Set([
  "select",
  "order",
  "limit",
  "offset",
  "on_conflict",
  "columns",
]);

const COMPARISON_OPS = new Map([
  ["eq", "="],
  ["neq", "<>"],
  ["gt", ">"],
  ["gte", ">="],
  ["lt", "<"],
  ["lte", "<="],
  ["like", "like"],
  ["ilike", "ilike"],
  ["contains", "@>"],
  ["cs", "@>"],
  ["cd", "<@"],
  ["ov", "&&"],
]);

export function quoteIdent(name) {
  if (!IDENT.test(String(name || ""))) {
    throw badRequest(`허용되지 않는 식별자예요: ${name}`);
  }

  return `"${name}"`;
}

function assertColumn(column, columns) {
  if (!columns.has(column)) {
    throw new HttpError(400, "PGRST204", `컬럼을 찾을 수 없어요: ${column}`);
  }
}

function unquote(raw) {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  return raw;
}

// in.(a,b,"c,d") 형태를 값 배열로 바꿉니다.
function parseInList(raw) {
  const body = String(raw || "").trim();

  if (!body.startsWith("(") || !body.endsWith(")")) {
    throw badRequest(`in 조건 형식이 올바르지 않아요: ${raw}`);
  }

  const inner = body.slice(1, -1);

  if (!inner.trim()) {
    return [];
  }

  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];

    if (quoted) {
      if (char === "\\" && index + 1 < inner.length) {
        current += inner[index + 1];
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }

      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());

  return values.map((value) => (value === "null" ? null : value));
}

// ?id=eq.abc&status=in.(OPEN,CLOSED) 형태를 [{ column, op, operand }] 로 바꿉니다.
export function parseFilters(query) {
  const filters = [];

  for (const [column, raw] of Object.entries(query || {})) {
    if (RESERVED_PARAMS.has(column)) {
      continue;
    }

    const values = Array.isArray(raw) ? raw : [raw];

    for (const item of values) {
      const text = String(item ?? "");
      const separator = text.indexOf(".");

      if (separator <= 0) {
        throw badRequest(`필터 형식이 올바르지 않아요: ${column}=${text}`);
      }

      const op = text.slice(0, separator).toLowerCase();
      const operand = text.slice(separator + 1);

      filters.push({
        column,
        op,
        operand: op === "in" ? operand : unquote(operand),
      });
    }
  }

  return filters;
}

// 필터를 SQL WHERE 절로 만듭니다. 값은 params 배열에 순서대로 쌓입니다.
export function buildWhere(filters, columns, params) {
  const clauses = [];
  const push = (value) => {
    params.push(value);

    return `$${params.length}`;
  };

  for (const filter of filters) {
    assertColumn(filter.column, columns);

    const column = quoteIdent(filter.column);
    const operand = filter.operand;

    if (filter.op === "is") {
      const normalized = String(operand).toLowerCase();

      if (normalized === "null") {
        clauses.push(`${column} is null`);
      } else if (normalized === "true" || normalized === "false") {
        clauses.push(`${column} is ${normalized}`);
      } else if (normalized === "unknown") {
        clauses.push(`${column} is null`);
      } else {
        throw badRequest(`is 조건은 null/true/false 만 지원해요: ${operand}`);
      }

      continue;
    }

    if (filter.op === "in") {
      const values = parseInList(operand);

      if (values.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`${column} = any(${push(values)})`);
      }

      continue;
    }

    const sqlOp = COMPARISON_OPS.get(filter.op);

    if (!sqlOp) {
      throw badRequest(`지원하지 않는 조건이에요: ${filter.op}`);
    }

    const value = filter.op === "like" || filter.op === "ilike"
      ? String(operand).replace(/\*/g, "%")
      : operand;

    if (value === "null" && filter.op === "eq") {
      clauses.push(`${column} is null`);
      continue;
    }

    if (value === "null" && filter.op === "neq") {
      clauses.push(`${column} is not null`);
      continue;
    }

    clauses.push(`${column} ${sqlOp} ${push(value)}`);
  }

  return clauses.length > 0 ? ` where ${clauses.join(" and ")}` : "";
}

// select=id,name,* → SQL 선택 목록
export function parseSelect(raw, columns) {
  const text = String(raw ?? "").trim();

  if (!text || text === "*") {
    return "*";
  }

  const selected = [];

  for (const part of text.split(",")) {
    const piece = part.trim();

    if (!piece) {
      continue;
    }

    if (piece.includes("(") || piece.includes("!")) {
      throw badRequest(`지원하지 않는 select 형식이에요: ${piece}`);
    }

    const separator = piece.indexOf(":");
    const alias = separator > 0 ? piece.slice(0, separator).trim() : "";
    const column = separator > 0 ? piece.slice(separator + 1).trim() : piece;

    if (column === "*") {
      selected.push("*");
      continue;
    }

    assertColumn(column, columns);

    selected.push(alias ? `${quoteIdent(column)} as ${quoteIdent(alias)}` : quoteIdent(column));
  }

  return selected.length > 0 ? selected.join(", ") : "*";
}

// order=created_at.desc,nullslast 형태를 SQL ORDER BY 절로 바꿉니다.
export function parseOrder(raw, columns) {
  if (!raw) {
    return "";
  }

  const specs = (Array.isArray(raw) ? raw : [raw]).flatMap((value) => String(value).split(","));
  const parts = [];

  for (const spec of specs) {
    const [column, ...modifiers] = String(spec)
      .split(".")
      .map((piece) => piece.trim());

    if (!column) {
      continue;
    }

    assertColumn(column, columns);

    let direction = "asc";
    let nulls = "";

    for (const modifier of modifiers) {
      const lower = modifier.toLowerCase();

      if (lower === "asc" || lower === "desc") {
        direction = lower;
      } else if (lower === "nullsfirst") {
        nulls = " nulls first";
      } else if (lower === "nullslast") {
        nulls = " nulls last";
      }
    }

    parts.push(`${quoteIdent(column)} ${direction}${nulls}`);
  }

  return parts.length > 0 ? ` order by ${parts.join(", ")}` : "";
}
