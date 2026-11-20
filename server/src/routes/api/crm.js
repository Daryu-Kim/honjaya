// P6 — 고객 관리(CRM) API. 마케팅 동의·방문 이력·메모를 관리자 화면에서 다룹니다.
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import {
  getCustomerProfile,
  listCustomers,
  updateCustomer,
} from "../../crm.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

export function registerCrmRoutes(app) {
  const requireCrm = createStaffGuard(PERMISSIONS.CRM_VIEW);

  app.get("/api/crm/customers", { preHandler: requireCrm }, async (request) => {
    const query = request.query || {};

    return listCustomers({
      query: query.q || "",
      consent: query.consent || "",
      sort: query.sort || "recent",
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.get(
    "/api/crm/customers/:customerId",
    { preHandler: requireCrm },
    async (request) =>
      getCustomerProfile({
        customerId: request.params?.customerId,
        visitLimit: request.query?.visitLimit,
      })
  );

  // 이름/닉네임/메모/마케팅 수신 동의 수정.
  app.patch(
    "/api/crm/customers/:customerId",
    { preHandler: requireCrm },
    async (request) => {
      const body = readBody(request);
      const employee = request.staff?.employee || null;
      const result = await updateCustomer({
        customerId: request.params?.customerId,
        name: body.name,
        nickname: body.nickname,
        memo: body.memo,
        marketingConsent: body.marketingConsent,
        employee,
      });

      await writeAuditLog({
        employee,
        action: result.consentChanged ? "customer.consent" : "customer.update",
        targetType: "customer",
        targetId: result.customer.id,
        detail: {
          phone: result.customer.phone,
          name: result.customer.name,
          marketingConsent: result.customer.marketingConsent,
          consentChanged: result.consentChanged,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { customer: result.customer, visits: result.visits };
    }
  );
}
