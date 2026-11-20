// 관리자 감사 로그 기록. 실패해도 요청 자체를 막지 않습니다(로그는 부가 기능).
import { randomUUID } from "node:crypto";

import { pool } from "../db.js";

export async function writeAuditLog({
  employee = null,
  action,
  targetType = "",
  targetId = "",
  detail = {},
  ip = "",
  log = null,
}) {
  try {
    await pool.query(
      `insert into public.admin_audit_logs
         (id, employee_id, employee_name, action, target_type, target_id, detail, ip)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        randomUUID(),
        employee?.id || null,
        employee?.name || "",
        String(action || "UNKNOWN").slice(0, 100),
        String(targetType || "").slice(0, 100),
        String(targetId || "").slice(0, 200),
        JSON.stringify(detail ?? {}),
        String(ip || "").slice(0, 100),
      ]
    );
  } catch (error) {
    log?.warn?.(`[audit] 감사 로그 기록 실패: ${error.message}`);
  }
}
