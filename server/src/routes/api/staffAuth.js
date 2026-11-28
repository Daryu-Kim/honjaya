import { randomBytes } from "node:crypto";

import { writeAuditLog } from "../../auth/audit.js";
import { hashPassword, verifyPassword, validatePasswordStrength } from "../../auth/password.js";
import { checkLoginRate, clearLoginFailures, recordLoginFailure } from "../../auth/rateLimit.js";
import {
  clearStaffCookie,
  createStaffGuard,
  createStaffSession,
  readStaffToken,
  revokeSessionsForEmployee,
  revokeStaffSession,
  setStaffCookie,
  toPublicEmployee,
} from "../../auth/sessions.js";
import { pool } from "../../db.js";
import { HttpError } from "../../http/errors.js";

// 존재하지 않는 아이디로 로그인해도 같은 시간이 걸리도록 쓰는 더미 해시입니다.
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

export function registerStaffAuthRoutes(app) {
  const requireStaff = createStaffGuard();

  app.post("/api/staff/login", async (request, reply) => {
    const body = readBody(request);
    const loginId = String(body.loginId ?? body.login_id ?? "").trim();
    const password = String(body.password ?? "");
    const remember = Boolean(body.remember);

    if (!loginId || !password) {
      throw new HttpError(400, "HJ400", "아이디와 비밀번호를 입력해 주세요.");
    }

    const rateKey = `${loginId.toLowerCase()}|${request.ip || ""}`;
    const rate = checkLoginRate(rateKey);

    if (rate.blocked) {
      const minutes = Math.max(1, Math.ceil((rate.retryAfterMs || 0) / 60000));

      throw new HttpError(
        429,
        "HJ429",
        `로그인 시도가 너무 많아요. ${minutes}분 후에 다시 시도해 주세요.`
      );
    }

    const result = await pool.query(
      `select id, login_id, name, role, permissions, is_active, password_hash, last_login_at,
             title, arc_permissions
         from public.employees
        where lower(login_id) = lower($1)
        limit 1`,
      [loginId]
    );

    const row = result.rows[0];
    const matched = await verifyPassword(password, row?.password_hash || DUMMY_HASH);

    if (!row || !matched) {
      recordLoginFailure(rateKey);
      throw new HttpError(401, "HJ401", "아이디 또는 비밀번호가 올바르지 않아요.");
    }

    if (row.is_active === false) {
      throw new HttpError(403, "HJ403", "사용이 중지된 계정이에요. 사장님께 문의해 주세요.");
    }

    clearLoginFailures(rateKey);

    const { token, ttlMs, expiresAt } = await createStaffSession(row.id, { request, remember });

    await pool.query(`update public.employees set last_login_at = now() where id = $1`, [row.id]);
    setStaffCookie(reply, token, { request, maxAgeMs: ttlMs });

    const employee = toPublicEmployee({ ...row, last_login_at: new Date() });

    await writeAuditLog({
      employee,
      action: "STAFF_LOGIN",
      targetType: "employee",
      targetId: employee.id,
      ip: request.ip,
      log: request.log,
    });

    return { employee, expiresAt, ttlMs };
  });

  app.post("/api/staff/logout", async (request, reply) => {
    const token = readStaffToken(request);

    await revokeStaffSession(token);
    clearStaffCookie(reply, { request });

    return { ok: true };
  });

  app.get("/api/staff/me", { preHandler: requireStaff }, async (request) => ({
    employee: request.staff.employee,
    expiresAt: request.staff.expiresAt,
  }));

  app.post("/api/staff/password", { preHandler: requireStaff }, async (request) => {
    const body = readBody(request);
    const currentPassword = String(body.currentPassword ?? body.current_password ?? "");
    const newPassword = String(body.newPassword ?? body.new_password ?? "");

    const strengthError = validatePasswordStrength(newPassword);

    if (strengthError) {
      throw new HttpError(400, "HJ400", strengthError);
    }

    const result = await pool.query(
      `select password_hash from public.employees where id = $1 limit 1`,
      [request.staff.employee.id]
    );

    const matched = await verifyPassword(currentPassword, result.rows[0]?.password_hash || DUMMY_HASH);

    if (!matched) {
      throw new HttpError(400, "HJ400", "현재 비밀번호가 올바르지 않아요.");
    }

    const passwordHash = await hashPassword(newPassword);

    await pool.query(
      `update public.employees set password_hash = $2, updated_at = now() where id = $1`,
      [request.staff.employee.id, passwordHash]
    );

    // 다른 기기에 남아 있는 세션만 끊고, 지금 쓰는 세션은 유지합니다.
    await revokeSessionsForEmployee(request.staff.employee.id, {
      keepSessionId: request.staff.sessionId,
    });

    await writeAuditLog({
      employee: request.staff.employee,
      action: "STAFF_PASSWORD_CHANGE",
      targetType: "employee",
      targetId: request.staff.employee.id,
      ip: request.ip,
      log: request.log,
    });

    return { ok: true };
  });
}
