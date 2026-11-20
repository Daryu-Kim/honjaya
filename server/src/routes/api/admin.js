import { randomUUID } from "node:crypto";

import { writeAuditLog } from "../../auth/audit.js";
import { hashPassword, validatePasswordStrength } from "../../auth/password.js";
import { PERMISSIONS, ROLE_LABELS, isValidRole } from "../../auth/permissions.js";
import { createStaffGuard, revokeSessionsForEmployee } from "../../auth/sessions.js";
import { pool } from "../../db.js";
import { HttpError } from "../../http/errors.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function normalizeLoginId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function mapEmployeeRow(row) {
  return {
    id: row.id,
    loginId: row.login_id,
    name: row.name || "",
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    isActive: row.is_active !== false,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTableRow(row) {
  return {
    tableNumber: row.table_number,
    zone: row.zone,
    zoneLabel: row.zone === "LARGE" ? "큰 테이블" : "바",
    seatCapacity: row.seat_capacity,
    displayName: row.display_name || "",
    isActive: row.is_active !== false,
    sortOrder: row.sort_order,
    note: row.note || "",
    updatedAt: row.updated_at,
  };
}

const TABLE_ZONES = ["BAR", "LARGE"];

async function countActiveOwners(excludeId = null) {
  const result = await pool.query(    `select count(*)::int as count
       from public.employees
      where role = 'OWNER'
        and is_active = true
        and ($1::text is null or id <> $1)`,
    [excludeId]
  );

  return result.rows[0]?.count || 0;
}

export function registerAdminRoutes(app) {
  const requireEmployeeManage = createStaffGuard(PERMISSIONS.EMPLOYEE_MANAGE);
  const requireAuditView = createStaffGuard(PERMISSIONS.AUDIT_VIEW);

  app.get("/api/admin/employees", { preHandler: requireEmployeeManage }, async () => {
    const result = await pool.query(
      `select id, login_id, name, role, is_active, last_login_at, created_at, updated_at
         from public.employees
        order by
          case role when 'OWNER' then 0 when 'MANAGER' then 1 else 2 end,
          lower(login_id)`
    );

    return { employees: result.rows.map(mapEmployeeRow) };
  });

  app.post("/api/admin/employees", { preHandler: requireEmployeeManage }, async (request) => {
    const body = readBody(request);
    const loginId = normalizeLoginId(body.loginId ?? body.login_id);
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "STAFF").trim().toUpperCase();

    if (!/^[a-z0-9._-]{3,30}$/.test(loginId)) {
      throw new HttpError(
        400,
        "HJ400",
        "아이디는 영문 소문자·숫자·._- 조합 3~30자로 입력해 주세요."
      );
    }

    if (!name) {
      throw new HttpError(400, "HJ400", "이름을 입력해 주세요.");
    }

    if (!isValidRole(role)) {
      throw new HttpError(400, "HJ400", "권한 값이 올바르지 않아요.");
    }

    // 매니저가 사장 계정을 만들 수 없도록 역할 생성 범위를 제한합니다.
    if (role === "OWNER" && request.staff.employee.role !== "OWNER") {
      throw new HttpError(403, "HJ403", "사장 계정은 사장만 만들 수 있어요.");
    }

    const strengthError = validatePasswordStrength(password);

    if (strengthError) {
      throw new HttpError(400, "HJ400", strengthError);
    }

    const existing = await pool.query(
      `select 1 from public.employees where lower(login_id) = $1 limit 1`,
      [loginId]
    );

    if (existing.rowCount > 0) {
      throw new HttpError(409, "HJ409", "이미 사용 중인 아이디예요.");
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(password);

    const inserted = await pool.query(
      `insert into public.employees (id, login_id, password_hash, name, role)
       values ($1, $2, $3, $4, $5)
       returning id, login_id, name, role, is_active, last_login_at, created_at, updated_at`,
      [id, loginId, passwordHash, name, role]
    );

    await writeAuditLog({
      employee: request.staff.employee,
      action: "EMPLOYEE_CREATE",
      targetType: "employee",
      targetId: id,
      detail: { loginId, name, role },
      ip: request.ip,
      log: request.log,
    });

    return { employee: mapEmployeeRow(inserted.rows[0]) };
  });

  app.patch("/api/admin/employees/:id", { preHandler: requireEmployeeManage }, async (request) => {
    const id = String(request.params?.id || "").trim();
    const body = readBody(request);
    const updates = [];
    const values = [];

    const current = await pool.query(
      `select id, login_id, name, role, is_active from public.employees where id = $1 limit 1`,
      [id]
    );

    if (current.rowCount === 0) {
      throw new HttpError(404, "HJ404", "직원을 찾을 수 없어요.");
    }

    const employee = current.rows[0];

    if (body.name !== undefined) {
      const name = String(body.name).trim();

      if (!name) {
        throw new HttpError(400, "HJ400", "이름을 입력해 주세요.");
      }

      values.push(name);
      updates.push(`name = $${values.length}`);
    }

    if (body.role !== undefined) {
      const role = String(body.role).trim().toUpperCase();

      if (!isValidRole(role)) {
        throw new HttpError(400, "HJ400", "권한 값이 올바르지 않아요.");
      }

      if (role === "OWNER" && request.staff.employee.role !== "OWNER") {
        throw new HttpError(403, "HJ403", "사장 권한은 사장만 지정할 수 있어요.");
      }

      if (employee.role === "OWNER" && role !== "OWNER" && (await countActiveOwners(id)) === 0) {
        throw new HttpError(400, "HJ400", "사장 계정은 최소 한 명 이상 있어야 해요.");
      }

      values.push(role);
      updates.push(`role = $${values.length}`);
    }

    if (body.isActive !== undefined) {
      const isActive = Boolean(body.isActive);

      if (!isActive && employee.id === request.staff.employee.id) {
        throw new HttpError(400, "HJ400", "본인 계정은 사용 중지할 수 없어요.");
      }

      if (!isActive && employee.role === "OWNER" && (await countActiveOwners(id)) === 0) {
        throw new HttpError(400, "HJ400", "사장 계정은 최소 한 명 이상 있어야 해요.");
      }

      values.push(isActive);
      updates.push(`is_active = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new HttpError(400, "HJ400", "변경할 값이 없어요.");
    }

    values.push(id);

    const updated = await pool.query(
      `update public.employees
          set ${updates.join(", ")}, updated_at = now()
        where id = $${values.length}
        returning id, login_id, name, role, is_active, last_login_at, created_at, updated_at`,
      values
    );

    // 권한을 뺏거나 계정을 잠그면 기존 세션을 즉시 끊습니다.
    if (body.role !== undefined || body.isActive === false) {
      await revokeSessionsForEmployee(id, { keepSessionId: request.staff.sessionId });
    }

    await writeAuditLog({
      employee: request.staff.employee,
      action: "EMPLOYEE_UPDATE",
      targetType: "employee",
      targetId: id,
      detail: body,
      ip: request.ip,
      log: request.log,
    });

    return { employee: mapEmployeeRow(updated.rows[0]) };
  });

  app.post(
    "/api/admin/employees/:id/password",
    { preHandler: requireEmployeeManage },
    async (request) => {
      const id = String(request.params?.id || "").trim();
      const body = readBody(request);
      const password = String(body.password ?? "");

      const strengthError = validatePasswordStrength(password);

      if (strengthError) {
        throw new HttpError(400, "HJ400", strengthError);
      }

      const passwordHash = await hashPassword(password);
      const updated = await pool.query(
        `update public.employees
            set password_hash = $2, updated_at = now()
          where id = $1
          returning id, login_id, name, role, is_active, last_login_at, created_at, updated_at`,
        [id, passwordHash]
      );

      if (updated.rowCount === 0) {
        throw new HttpError(404, "HJ404", "직원을 찾을 수 없어요.");
      }

      // 비밀번호를 바꾸면 그 직원의 모든 기기에서 로그아웃시킵니다.
      await revokeSessionsForEmployee(id);

      await writeAuditLog({
        employee: request.staff.employee,
        action: "EMPLOYEE_PASSWORD_RESET",
        targetType: "employee",
        targetId: id,
        ip: request.ip,
        log: request.log,
      });

      return { employee: mapEmployeeRow(updated.rows[0]) };
    }
  );

  app.get("/api/admin/audit-logs", { preHandler: requireAuditView }, async (request) => {
    const limit = Math.min(Math.max(Number(request.query?.limit) || 100, 1), 500);
    const offset = Math.max(Number(request.query?.offset) || 0, 0);
    const action = String(request.query?.action || "").trim();

    const result = await pool.query(
      `select id, employee_id, employee_name, action, target_type, target_id, detail, ip, created_at
         from public.admin_audit_logs
        where ($1::text = '' or action = $1)
        order by created_at desc
        limit $2 offset $3`,
      [action, limit, offset]
    );

    return {
      logs: result.rows.map((row) => ({
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        detail: row.detail,
        ip: row.ip,
        createdAt: row.created_at,
      })),
    };
  });

  const requireTableView = createStaffGuard(PERMISSIONS.TABLE_VIEW);
  // 테이블 마스터(구역/좌석/이름/사용여부)는 매장 구조를 바꾸는 설정이라 사장 전용으로 둡니다.
  // 현장 직원의 table.manage 권한은 "손님 배정/정리"용으로 남겨둡니다.
  const requireTableManage = createStaffGuard(PERMISSIONS.SETTINGS_MANAGE);

  app.get("/api/admin/tables", { preHandler: requireTableView }, async () => {
    const result = await pool.query(
      `select table_number, zone, seat_capacity, display_name, is_active, sort_order, note, updated_at
         from public.bar_tables
        order by sort_order, table_number`
    );

    return { tables: result.rows.map(mapTableRow) };
  });

  app.patch(
    "/api/admin/tables/:tableNumber",
    { preHandler: requireTableManage },
    async (request) => {
      const tableNumber = Number.parseInt(request.params?.tableNumber, 10);

      if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 999) {
        throw new HttpError(400, "HJ400", "테이블 번호가 올바르지 않아요.");
      }

      const body = readBody(request);
      const assignments = [];
      const params = [tableNumber];
      const applied = {};

      const pushValue = (column, value, appKey) => {
        params.push(value);
        assignments.push(`${column} = $${params.length}`);
        applied[appKey] = value;
      };

      if (body.zone !== undefined) {
        const zone = String(body.zone).trim().toUpperCase();

        if (!TABLE_ZONES.includes(zone)) {
          throw new HttpError(400, "HJ400", "구역은 BAR 또는 LARGE 만 가능해요.");
        }

        pushValue("zone", zone, "zone");
      }

      if (body.seatCapacity !== undefined) {
        const seatCapacity = Number.parseInt(body.seatCapacity, 10);

        if (!Number.isInteger(seatCapacity) || seatCapacity < 1 || seatCapacity > 50) {
          throw new HttpError(400, "HJ400", "좌석 수는 1~50 사이로 입력해 주세요.");
        }

        pushValue("seat_capacity", seatCapacity, "seatCapacity");
      }

      if (body.displayName !== undefined) {
        const displayName = String(body.displayName).trim();

        if (displayName.length > 40) {
          throw new HttpError(400, "HJ400", "표시 이름은 40자 이내로 입력해 주세요.");
        }

        pushValue("display_name", displayName, "displayName");
      }

      if (body.isActive !== undefined) {
        pushValue("is_active", body.isActive === true, "isActive");
      }

      if (body.sortOrder !== undefined) {
        const sortOrder = Number.parseInt(body.sortOrder, 10);

        if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
          throw new HttpError(400, "HJ400", "정렬 순서는 0~9999 사이로 입력해 주세요.");
        }

        pushValue("sort_order", sortOrder, "sortOrder");
      }

      if (body.note !== undefined) {
        const note = String(body.note).trim();

        if (note.length > 200) {
          throw new HttpError(400, "HJ400", "메모는 200자 이내로 입력해 주세요.");
        }

        pushValue("note", note, "note");
      }

      if (assignments.length === 0) {
        throw new HttpError(400, "HJ400", "수정할 값이 없어요.");
      }

      const updated = await pool.query(
        `update public.bar_tables
            set ${assignments.join(", ")}, updated_at = now()
          where table_number = $1
          returning table_number, zone, seat_capacity, display_name, is_active, sort_order, note, updated_at`,
        params
      );

      if (updated.rowCount === 0) {
        throw new HttpError(404, "HJ404", "테이블을 찾을 수 없어요.");
      }

      await writeAuditLog({
        employee: request.staff.employee,
        action: "TABLE_UPDATE",
        targetType: "bar_table",
        targetId: String(tableNumber),
        detail: applied,
        ip: request.ip,
        log: request.log,
      });

      return { table: mapTableRow(updated.rows[0]) };
    }
  );
}
