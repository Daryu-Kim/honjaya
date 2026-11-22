// P10 — 선불권 API. 상품 설정·판매·사용 현황·조정을 다룹니다.
//
// 실제 결제 차감은 결제 API(POST /api/payments, method=PREPAID) 안에서 처리합니다.
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import {
  adjustPass,
  createPlan,
  getPassLedger,
  issuePass,
  listCustomerPasses,
  listPasses,
  listPlans,
  prepaidSummary,
  updatePlan,
  voidPass,
} from "../../prepaid.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

export function registerPrepaidRoutes(app) {
  const requireIssue = createStaffGuard(PERMISSIONS.PREPAID_ISSUE);
  const requireView = createStaffGuard(PERMISSIONS.PREPAID_VIEW);
  const requireManage = createStaffGuard(PERMISSIONS.PREPAID_MANAGE);

  // 판매 화면에서 상품 목록이 필요하므로 발급 권한이면 조회할 수 있습니다.
  app.get("/api/prepaid/plans", { preHandler: requireIssue }, async (request) => {
    const query = request.query || {};

    return {
      plans: await listPlans({
        includeInactive:
          query.includeInactive === "true" || query.includeInactive === "1",
      }),
    };
  });

  app.post("/api/prepaid/plans", { preHandler: requireManage }, async (request) => {
    const employee = request.staff?.employee || null;
    const plan = await createPlan(readBody(request));

    await writeAuditLog({
      employee,
      action: "prepaid.plan.create",
      targetType: "prepaid_plan",
      targetId: plan.id,
      detail: {
        name: plan.name,
        price: plan.price,
        faceValue: plan.faceValue,
        validityMonths: plan.validityMonths,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { plan };
  });

  app.patch(
    "/api/prepaid/plans/:planId",
    { preHandler: requireManage },
    async (request) => {
      const employee = request.staff?.employee || null;
      const body = readBody(request);

      const plan = await updatePlan({
        planId: request.params?.planId,
        ...body,
      });

      await writeAuditLog({
        employee,
        action: "prepaid.plan.update",
        targetType: "prepaid_plan",
        targetId: plan.id,
        detail: {
          name: plan.name,
          price: plan.price,
          faceValue: plan.faceValue,
          validityMonths: plan.validityMonths,
          isActive: plan.isActive,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { plan };
    }
  );

  // 판매(발급). 매장에서 결제 후 직원이 등록합니다.
  app.post("/api/prepaid/passes", { preHandler: requireIssue }, async (request) => {
    const body = readBody(request);
    const employee = request.staff?.employee || null;

    const pass = await issuePass({
      phone: body.phone || "",
      customerId: body.customerId || "",
      planId: body.planId,
      paymentMethod: body.paymentMethod || "CARD",
      memo: body.memo || "",
      employee,
    });

    await writeAuditLog({
      employee,
      action: "prepaid.issue",
      targetType: "prepaid_pass",
      targetId: pass.id,
      detail: {
        code: pass.code,
        customerPhone: pass.customerPhone,
        planName: pass.planName,
        pricePaid: pass.pricePaid,
        faceValue: pass.faceValue,
        paymentMethod: pass.paymentMethod,
        usableFromDate: pass.usableFromDate,
        expiresAt: pass.expiresAt,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { pass };
  });

  // 결제 화면 — 전화번호로 보유 선불권과 이번 결제에서 쓸 수 있는 금액을 조회합니다.
  app.get("/api/prepaid/customer", { preHandler: requireIssue }, async (request) => {
    const query = request.query || {};

    return listCustomerPasses({
      phone: query.phone || "",
      customerId: query.customerId || "",
      paymentAmount:
        query.paymentAmount === undefined || query.paymentAmount === ""
          ? null
          : query.paymentAmount,
    });
  });

  app.get("/api/prepaid/passes", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return {
      passes: await listPasses({
        phone: query.phone || "",
        status: query.status || "",
        from: query.from || null,
        to: query.to || null,
        limit: query.limit,
      }),
    };
  });

  app.get(
    "/api/prepaid/passes/:passId/ledger",
    { preHandler: requireView },
    async (request) =>
      getPassLedger({
        passId: request.params?.passId,
        limit: request.query?.limit,
      })
  );

  app.post(
    "/api/prepaid/passes/:passId/adjust",
    { preHandler: requireManage },
    async (request) => {
      const body = readBody(request);
      const employee = request.staff?.employee || null;

      const result = await adjustPass({
        passId: request.params?.passId,
        amount: body.amount,
        reason: body.reason,
        employee,
      });

      await writeAuditLog({
        employee,
        action: "prepaid.adjust",
        targetType: "prepaid_pass",
        targetId: result.passId,
        detail: {
          amount: result.amount,
          balance: result.balance,
          reason: String(body.reason || "").slice(0, 200),
        },
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  app.post(
    "/api/prepaid/passes/:passId/void",
    { preHandler: requireManage },
    async (request) => {
      const body = readBody(request);
      const employee = request.staff?.employee || null;

      const result = await voidPass({
        passId: request.params?.passId,
        reason: body.reason,
        employee,
      });

      await writeAuditLog({
        employee,
        action: "prepaid.void",
        targetType: "prepaid_pass",
        targetId: result.passId,
        detail: { reason: String(body.reason || "").slice(0, 200) },
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  app.get("/api/prepaid/summary", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return prepaidSummary({
      from: query.from || null,
      to: query.to || null,
    });
  });
}
