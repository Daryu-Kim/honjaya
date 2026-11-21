// P6 — 고객 관리(CRM) API. 마케팅 동의·방문 이력·메모를 관리자 화면에서 다룹니다.
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import {
  getCustomerProfile,
  listCustomers,
  updateCustomer,
} from "../../crm.js";
import {
  issueCoupon,
  listCustomerCoupons,
  voidCoupon,
} from "../../coupons.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

export function registerCrmRoutes(app) {
  const requireCrm = createStaffGuard(PERMISSIONS.CRM_VIEW);
  const requireMarketingManage = createStaffGuard(PERMISSIONS.MARKETING_MANAGE);

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

  // 재방문 쿠폰 목록(사용/만료/취소 포함).
  app.get(
    "/api/crm/customers/:customerId/coupons",
    { preHandler: requireCrm },
    async (request) => ({
      coupons: await listCustomerCoupons({
        customerId: request.params?.customerId,
        limit: request.query?.limit,
      }),
    })
  );

  // 쿠폰 발급은 혜택 지급이라 사장(marketing.manage)만 합니다.
  app.post(
    "/api/crm/customers/:customerId/coupons",
    { preHandler: requireMarketingManage },
    async (request) => {
      const body = readBody(request);
      const employee = request.staff?.employee || null;
      const coupon = await issueCoupon({
        customerId: request.params?.customerId,
        title: body.title,
        discountType: body.discountType,
        discountValue: body.discountValue,
        minAmount: body.minAmount,
        expiresInDays: body.expiresInDays,
        expiresAt: body.expiresAt,
        memo: body.memo,
        employee,
      });

      await writeAuditLog({
        employee,
        action: "coupon.issue",
        targetType: "customer",
        targetId: coupon.customerId,
        detail: {
          couponId: coupon.id,
          title: coupon.title,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minAmount: coupon.minAmount,
          expiresAt: coupon.expiresAt,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { coupon };
    }
  );

  app.post(
    "/api/crm/coupons/:couponId/void",
    { preHandler: requireMarketingManage },
    async (request) => {
      const employee = request.staff?.employee || null;
      const coupon = await voidCoupon({ couponId: request.params?.couponId });

      await writeAuditLog({
        employee,
        action: "coupon.void",
        targetType: "customer",
        targetId: coupon.customerId,
        detail: { couponId: coupon.id, title: coupon.title },
        ip: clientIp(request),
        log: request.log,
      });

      return { coupon };
    }
  );
}
