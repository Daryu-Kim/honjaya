// P11 — 혼자야 기프티콘 API. 상품 설정·발급·조회·취소·재발송을 다룹니다.
//
// 실제 결제 차감은 결제 API(POST /api/payments, method=GIFT_CERT) 안에서 처리합니다.
// 공개 카드 페이지(/gift/:code)는 직원 쿠키 없이 /api/public/gifts/:code 만 사용합니다.
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import {
  createGiftProduct,
  giftSummary,
  issueGift,
  listCustomerGifts,
  listGiftProducts,
  listGifts,
  lookupGift,
  lookupPublicGift,
  resendGift,
  updateGiftProduct,
  voidGift,
} from "../../gifts.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

export function registerGiftRoutes(app) {
  const requireIssue = createStaffGuard(PERMISSIONS.GIFT_ISSUE);
  const requireView = createStaffGuard(PERMISSIONS.GIFT_VIEW);
  const requireManage = createStaffGuard(PERMISSIONS.GIFT_MANAGE);

  // ── 상품 설정 ────────────────────────────────────────────────────────

  // 판매 화면에서 상품 목록이 필요하므로 발급 권한이면 조회할 수 있습니다.
  app.get("/api/gifts/products", { preHandler: requireIssue }, async (request) => {
    const query = request.query || {};

    return {
      products: await listGiftProducts({
        includeInactive:
          query.includeInactive === "true" || query.includeInactive === "1",
      }),
    };
  });

  app.post("/api/gifts/products", { preHandler: requireManage }, async (request) => {
    const employee = request.staff?.employee || null;
    const product = await createGiftProduct(readBody(request));

    await writeAuditLog({
      employee,
      action: "gift.product.create",
      targetType: "gift_product",
      targetId: product.id,
      detail: {
        name: product.name,
        kind: product.kind,
        faceValue: product.faceValue,
        price: product.price,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { product };
  });

  app.patch(
    "/api/gifts/products/:productId",
    { preHandler: requireManage },
    async (request) => {
      const employee = request.staff?.employee || null;
      const product = await updateGiftProduct(
        request.params?.productId,
        readBody(request)
      );

      await writeAuditLog({
        employee,
        action: "gift.product.update",
        targetType: "gift_product",
        targetId: product.id,
        detail: {
          name: product.name,
          faceValue: product.faceValue,
          price: product.price,
          isActive: product.isActive,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { product };
    }
  );

  // ── 발급·조회 ────────────────────────────────────────────────────────

  app.post("/api/gifts", { preHandler: requireIssue }, async (request) => {
    const body = readBody(request);
    const employee = request.staff?.employee || null;

    const gift = await issueGift({
      productId: body.productId,
      buyerName: body.buyerName,
      buyerPhone: body.buyerPhone,
      recipientName: body.recipientName,
      recipientPhone: body.recipientPhone,
      message: body.message,
      paymentMethod: body.paymentMethod,
      send: body.send === true,
      channel: body.channel,
      employee,
    });

    await writeAuditLog({
      employee,
      action: "gift.issue",
      targetType: "gift_certificate",
      targetId: gift.id,
      detail: {
        code: gift.code,
        productName: gift.productName,
        faceValue: gift.faceValue,
        pricePaid: gift.pricePaid,
        sent: Boolean(gift.sentAt),
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { gift };
  });

  // 결제 화면에서 코드로 기프티콘을 확인합니다.
  app.get("/api/gifts/lookup", { preHandler: requireIssue }, async (request) =>
    lookupGift({ code: request.query?.code })
  );

  app.get("/api/gifts", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return {
      gifts: await listGifts({
        code: query.code,
        phone: query.phone,
        status: query.status,
        from: query.from,
        to: query.to,
        limit: query.limit,
      }),
    };
  });

  app.get(
    "/api/gifts/customer/:customerId",
    { preHandler: requireView },
    async (request) => ({
      gifts: await listCustomerGifts(request.params?.customerId),
    })
  );

  app.post("/api/gifts/:giftId/resend", { preHandler: requireIssue }, async (request) => {
    const employee = request.staff?.employee || null;
    const result = await resendGift({ giftId: request.params?.giftId });

    await writeAuditLog({
      employee,
      action: "gift.resend",
      targetType: "gift_certificate",
      targetId: request.params?.giftId,
      detail: { channel: result.channel, provider: result.provider },
      ip: clientIp(request),
      log: request.log,
    });

    return result;
  });

  app.post("/api/gifts/:giftId/void", { preHandler: requireManage }, async (request) => {
    const body = readBody(request);
    const employee = request.staff?.employee || null;

    const result = await voidGift({
      giftId: request.params?.giftId,
      reason: body.reason,
      employee,
    });

    await writeAuditLog({
      employee,
      action: "gift.void",
      targetType: "gift_certificate",
      targetId: result.gift.id,
      detail: {
        code: result.gift.code,
        faceValue: result.gift.faceValue,
        reason: String(body.reason || "").slice(0, 200),
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { gift: result.gift };
  });

  app.get("/api/gifts/summary", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return { totals: await giftSummary({ from: query.from, to: query.to }) };
  });

  // ── 공개(손님용) ─────────────────────────────────────────────────────
  // 기프티콘 링크를 받은 사람이 로그인 없이 카드를 볼 수 있어야 합니다.
  // 코드를 아는 사람만 볼 수 있고, 내려주는 값은 최소한으로 제한합니다.
  app.get("/api/public/gifts/:code", async (request) =>
    lookupPublicGift({ code: request.params?.code })
  );
}
