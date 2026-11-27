// P13 — 혼자야 전자담배 예약(픽업) API.
//
// 공개 경로(/api/public/shop/*)는 직원 쿠키 없이 동작합니다.
// 다만 서버 전체 공통으로 apikey 헤더는 필요합니다(app.js 의 createApiKeyGuard).
//
// 결제는 온라인으로 받지 않습니다(담배사업법 제25조). 손님은 예약만 하고
// 매장에서 신분증 확인 후 결제·픽업합니다.
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import {
  assertReservationRate,
  cancelReservation,
  createReservation,
  createShopCategory,
  createShopProduct,
  deleteShopCategory,
  deleteShopProduct,
  getShopProduct,
  listReservations,
  listShopCategories,
  listShopProducts,
  lookupReservation,
  reservationSummary,
  updateReservation,
  updateShopCategory,
  updateShopProduct,
} from "../../shop.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

function isTruthyFlag(value) {
  return value === "true" || value === "1" || value === true;
}

export function registerShopRoutes(app) {
  const requireView = createStaffGuard(PERMISSIONS.SHOP_VIEW);
  const requireManage = createStaffGuard(PERMISSIONS.SHOP_MANAGE);

  // ── 공개(손님용) ─────────────────────────────────────────────────────

  app.get("/api/public/shop/products", async (request) => {
    const query = request.query || {};

    return {
      categories: await listShopCategories(),
      products: await listShopProducts({
        categoryId: query.categoryId,
        q: query.q,
      }),
    };
  });

  app.get("/api/public/shop/products/:productId", async (request) => ({
    product: await getShopProduct(request.params?.productId),
  }));

  app.post("/api/public/reservations", async (request) => {
    assertReservationRate(clientIp(request));

    const reservation = await createReservation(readBody(request));

    request.log?.info?.(
      { reservationNo: reservation.reservationNo },
      "shop reservation created"
    );

    return { reservation };
  });

  // 연락처가 URL/접근 로그에 남지 않도록 조회도 POST 로 받습니다.
  app.post("/api/public/reservations/lookup", async (request) => {
    const body = readBody(request);

    return {
      reservation: await lookupReservation({
        reservationNo: body.reservationNo,
        phone: body.phone,
      }),
    };
  });

  app.post("/api/public/reservations/cancel", async (request) => {
    const body = readBody(request);

    return {
      reservation: await cancelReservation({
        reservationNo: body.reservationNo,
        phone: body.phone,
        reason: body.reason,
      }),
    };
  });

  // ── 관리자: 카테고리 ─────────────────────────────────────────────────

  app.get("/api/shop/categories", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return {
      categories: await listShopCategories({
        includeInactive: isTruthyFlag(query.includeInactive),
      }),
    };
  });

  app.post("/api/shop/categories", { preHandler: requireManage }, async (request) => {
    const employee = request.staff?.employee || null;
    const category = await createShopCategory(readBody(request));

    await writeAuditLog({
      employee,
      action: "shop.category.create",
      targetType: "shop_category",
      targetId: category.id,
      detail: { name: category.name, isActive: category.isActive },
      ip: clientIp(request),
      log: request.log,
    });

    return { category };
  });

  app.patch(
    "/api/shop/categories/:categoryId",
    { preHandler: requireManage },
    async (request) => {
      const employee = request.staff?.employee || null;
      const category = await updateShopCategory(
        request.params?.categoryId,
        readBody(request)
      );

      await writeAuditLog({
        employee,
        action: "shop.category.update",
        targetType: "shop_category",
        targetId: category.id,
        detail: { name: category.name, isActive: category.isActive },
        ip: clientIp(request),
        log: request.log,
      });

      return { category };
    }
  );

  app.delete(
    "/api/shop/categories/:categoryId",
    { preHandler: requireManage },
    async (request) => {
      const employee = request.staff?.employee || null;
      const result = await deleteShopCategory(request.params?.categoryId);

      await writeAuditLog({
        employee,
        action: "shop.category.delete",
        targetType: "shop_category",
        targetId: result.id,
        detail: {},
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // ── 관리자: 상품 ─────────────────────────────────────────────────────

  app.get("/api/shop/products", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return {
      products: await listShopProducts({
        categoryId: query.categoryId,
        q: query.q,
        includeInactive: isTruthyFlag(query.includeInactive),
      }),
    };
  });

  app.get("/api/shop/products/:productId", { preHandler: requireView }, async (request) => ({
    product: await getShopProduct(request.params?.productId, { includeInactive: true }),
  }));

  app.post("/api/shop/products", { preHandler: requireManage }, async (request) => {
    const employee = request.staff?.employee || null;
    const product = await createShopProduct(readBody(request));

    await writeAuditLog({
      employee,
      action: "shop.product.create",
      targetType: "shop_product",
      targetId: product.id,
      detail: {
        name: product.name,
        price: product.price,
        stock: product.stock,
        categoryId: product.categoryId,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { product };
  });

  app.patch(
    "/api/shop/products/:productId",
    { preHandler: requireManage },
    async (request) => {
      const employee = request.staff?.employee || null;
      const body = readBody(request);
      const product = await updateShopProduct(request.params?.productId, body);

      await writeAuditLog({
        employee,
        action: "shop.product.update",
        targetType: "shop_product",
        targetId: product.id,
        detail: {
          name: product.name,
          price: product.price,
          stock: product.stock,
          isActive: product.isActive,
          isSoldOut: product.isSoldOut,
          changed: Object.keys(body).slice(0, 20),
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { product };
    }
  );

  app.delete(
    "/api/shop/products/:productId",
    { preHandler: requireManage },
    async (request) => {
      const employee = request.staff?.employee || null;
      const result = await deleteShopProduct(request.params?.productId);

      await writeAuditLog({
        employee,
        action: "shop.product.delete",
        targetType: "shop_product",
        targetId: result.id,
        detail: {},
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // ── 관리자: 예약 ─────────────────────────────────────────────────────

  app.get("/api/shop/reservations", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return {
      reservations: await listReservations({
        status: query.status,
        from: query.from,
        to: query.to,
        q: query.q,
        limit: query.limit,
      }),
    };
  });

  app.get("/api/shop/summary", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return { summary: await reservationSummary({ date: query.date }) };
  });

  app.patch(
    "/api/shop/reservations/:reservationId",
    { preHandler: requireView },
    async (request) => {
      const employee = request.staff?.employee || null;
      const body = readBody(request);
      const reservation = await updateReservation(
        request.params?.reservationId,
        body,
        { employee }
      );

      await writeAuditLog({
        employee,
        action: "shop.reservation.update",
        targetType: "reservation",
        targetId: reservation.id,
        detail: {
          reservationNo: reservation.reservationNo,
          status: reservation.status,
          adultCheckedAt: reservation.adultCheckedAt,
          statusMemo: reservation.statusMemo,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { reservation };
    }
  );
}
