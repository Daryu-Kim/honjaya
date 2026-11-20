// P3 — 결제/환불 API. 금액 계산과 저장은 전부 서버에서 처리합니다.
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import { getSheetLedger, listPayments, recordPayment, refundPayment } from "../../payments.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

export function registerPaymentRoutes(app) {
  const requireView = createStaffGuard(PERMISSIONS.PAYMENT_VIEW);
  const requireManage = createStaffGuard(PERMISSIONS.PAYMENT_MANAGE);
  const requireRefund = createStaffGuard(PERMISSIONS.PAYMENT_REFUND);

  app.get("/api/payments", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return listPayments({
      from: query.from || null,
      to: query.to || null,
      limit: query.limit,
    });
  });

  app.get(
    "/api/payments/sheet/:orderSheetId",
    { preHandler: requireView },
    async (request) => getSheetLedger(request.params.orderSheetId)
  );

  app.post("/api/payments", { preHandler: requireManage }, async (request) => {
    const body = readBody(request);
    const employee = request.staff?.employee || null;

    const ledger = await recordPayment({
      orderSheetId: body.orderSheetId,
      originalAmount: body.originalAmount ?? null,
      discounts: body.discounts ?? null,
      entries: body.entries,
      memo: body.memo,
      close: body.close,
      customerPhone: body.customerPhone ?? "",
      customerName: body.customerName ?? "",
      marketingConsent: body.marketingConsent === true,
      pointsUsed: body.pointsUsed ?? 0,
      employee,
      ip: clientIp(request),
      log: request.log,
    });

    await writeAuditLog({
      employee,
      action: "payment.record",
      targetType: "order_sheet",
      targetId: ledger.orderSheetId,
      detail: {
        amount: ledger.justPaidAmount,
        remainingAmount: ledger.remainingAmount,
        paymentStatus: ledger.paymentStatus,
        closed: ledger.closed,
        pointsUsed: ledger.pointsUsed || 0,
        pointsEarned: ledger.pointsEarned || 0,
        customerPhone: ledger.customer?.phone || "",
        marketingConsent: ledger.customer?.marketingConsent === true,
        payments: ledger.payments.map((payment) => ({
          method: payment.method,
          amount: payment.amount,
          payerLabel: payment.payerLabel,
        })),
      },
      ip: clientIp(request),
      log: request.log,
    });

    return ledger;
  });

  app.post(
    "/api/payments/:paymentId/refund",
    { preHandler: requireRefund },
    async (request) => {
      const body = readBody(request);
      const employee = request.staff?.employee || null;

      const ledger = await refundPayment({
        paymentId: request.params.paymentId,
        amount: body.amount,
        reason: body.reason,
        employee,
        log: request.log,
      });

      await writeAuditLog({
        employee,
        action: "payment.refund",
        targetType: "payment",
        targetId: request.params.paymentId,
        detail: {
          orderSheetId: ledger.orderSheetId,
          amount: ledger.justRefundedAmount,
          reason: String(body.reason || "").slice(0, 200),
          remainingAmount: ledger.remainingAmount,
          pointsReclaimed: ledger.pointsReclaimed || 0,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return ledger;
    }
  );
}
