// P5 — 포인트 조회/조정 API. 적립·사용은 결제(POST /api/payments) 안에서 처리합니다.
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import { pool } from "../../db.js";
import {
  adjustPoints,
  ensureCustomer,
  getCustomerPoints,
  listPointLedger,
  POINT_RULES,
} from "../../points.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

export function registerPointRoutes(app) {
  const requireUse = createStaffGuard(PERMISSIONS.POINT_USE);
  const requireCustomerView = createStaffGuard(PERMISSIONS.CUSTOMER_VIEW);
  const requireAdjust = createStaffGuard(PERMISSIONS.POINT_ADJUST);

  // 규칙(1,000P 단위 등)을 화면과 서버가 같은 값으로 쓰도록 내려 줍니다.
  app.get("/api/points/rules", { preHandler: requireUse }, async () => POINT_RULES);

  app.get("/api/points/customer", { preHandler: requireUse }, async (request) => {
    const query = request.query || {};

    return getCustomerPoints({
      phone: query.phone || "",
      customerId: query.customerId || null,
      historyLimit: query.limit,
    });
  });

  // 고객 이름/메모 저장(없으면 새로 만듭니다). 포인트는 건드리지 않습니다.
  app.post("/api/points/customer", { preHandler: requireUse }, async (request) => {
    const body = readBody(request);
    const employee = request.staff?.employee || null;
    let customer = null;

    const client = await pool.connect();

    try {
      await client.query("begin");
      customer = await ensureCustomer(client, {
        phone: body.phone,
        name: body.name,
        memo: body.memo ?? null,
      });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    await writeAuditLog({
      employee,
      action: "customer.upsert",
      targetType: "customer",
      targetId: customer.id,
      detail: { phone: customer.phone, name: customer.name },
      ip: clientIp(request),
      log: request.log,
    });

    return getCustomerPoints({ customerId: customer.id });
  });

  app.get("/api/points/ledger", { preHandler: requireCustomerView }, async (request) => {
    const query = request.query || {};

    return listPointLedger({
      from: query.from || null,
      to: query.to || null,
      phone: query.phone || "",
      customerId: query.customerId || null,
      limit: query.limit,
    });
  });

  app.post("/api/points/adjust", { preHandler: requireAdjust }, async (request) => {
    const body = readBody(request);
    const employee = request.staff?.employee || null;

    const result = await adjustPoints({
      phone: body.phone || "",
      customerId: body.customerId || null,
      points: body.points,
      reason: body.reason,
      employee,
    });

    await writeAuditLog({
      employee,
      action: "point.adjust",
      targetType: "customer",
      targetId: result.customer?.id || "",
      detail: {
        phone: result.customer?.phone || "",
        points: result.points,
        balance: result.balance,
        reason: String(body.reason || "").slice(0, 200),
      },
      ip: clientIp(request),
      log: request.log,
    });

    return result;
  });
}
