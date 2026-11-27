// P14 — ARC SAFETY 응급안전관리센터 API (P14A 기반 범위).
//
// 모든 경로는 직원 쿠키 세션 + arc.* 권한이 필요합니다.
// 민감 상세(성명·연락처 등)는 arc.sensitive 권한이 있어도 사건별 접근 승인을
// 통과해야만 복호화되어 나갑니다.
import {
  arcDashboardSummary,
  arcHealth,
  assertArcSensitiveAccess,
  confirmArcConsent,
  createArcConsent,
  decideArcSensitiveAccess,
  getArcSettings,
  listArcConsents,
  listArcNotifications,
  listArcSensitiveAccess,
  listArcSensitiveReads,
  markArcNotificationsRead,
  requestArcSensitiveAccess,
  updateArcSettings,
  withdrawArcConsent,
} from "../../arc.js";
import {
  addArcCareAddendum,
  arcIncidentSummary,
  createArcIncident,
  getArcCareDetail,
  getArcCareStatus,
  listArcIncidents,
  saveArcCare,
  updateArcIncident,
} from "../../arcIncidents.js";
import {
  applyArcStocktake,
  arcStockSummary,
  claimArcOtcItems,
  createArcItem,
  createArcOtcCheck,
  createArcPurchase,
  createArcStocktake,
  getArcItem,
  getArcStocktake,
  listArcItemLots,
  listArcItems,
  listArcOtcChecks,
  listArcOtcItems,
  listArcPurchases,
  listArcStockMoves,
  listArcStocktakes,
  recordArcStockMove,
  saveArcStocktakeItem,
  scanArcStockAlerts,
  settleArcPurchase,
  updateArcItem,
  updateArcOtcItem,
} from "../../arcStock.js";
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

function isTruthyFlag(value) {
  return value === "true" || value === "1" || value === true;
}

function currentEmployee(request) {
  return request.staff?.employee || null;
}

function hasPermission(request, permission) {
  return Boolean(request.staff?.employee?.permissions?.includes(permission));
}

export function registerArcRoutes(app) {
  const requireView = createStaffGuard(PERMISSIONS.ARC_VIEW);
  const requireStock = createStaffGuard(PERMISSIONS.ARC_STOCK);
  const requireCheck = createStaffGuard(PERMISSIONS.ARC_CHECK);
  const requireCare = createStaffGuard(PERMISSIONS.ARC_CARE);
  const requireSensitive = createStaffGuard(PERMISSIONS.ARC_SENSITIVE);
  const requireApprove = createStaffGuard(PERMISSIONS.ARC_APPROVE);
  const requireAdmin = createStaffGuard(PERMISSIONS.ARC_ADMIN);

  // ── 현황 ───────────────────────────────────────────────────────────

  app.get("/api/arc/health", { preHandler: requireView }, async () => ({
    status: arcHealth(),
  }));

  app.get("/api/arc/dashboard", { preHandler: requireView }, async (request) => {
    const employee = currentEmployee(request);

    return {
      summary: await arcDashboardSummary(employee?.id ?? null),
      stock: await arcStockSummary({ employee }),
      incidents: await arcIncidentSummary(),
    };
  });

  // ── 설정 ───────────────────────────────────────────────────────────

  app.get("/api/arc/settings", { preHandler: requireView }, async () => ({
    settings: await getArcSettings(),
  }));

  app.patch("/api/arc/settings", { preHandler: requireAdmin }, async (request) => {
    const employee = currentEmployee(request);
    const settings = await updateArcSettings(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.settings.update",
      targetType: "arc_settings",
      targetId: "1",
      detail: {
        alertChannelId: settings.alertChannelId,
        discordAlertEnabled: settings.discordAlertEnabled,
        appAlertEnabled: settings.appAlertEnabled,
        accessTtlMinutes: settings.accessTtlMinutes,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { settings };
  });

  // ── 알림함 ─────────────────────────────────────────────────────────

  app.get("/api/arc/notifications", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return {
      notifications: await listArcNotifications({
        employeeId: currentEmployee(request)?.id ?? null,
        unreadOnly: isTruthyFlag(query.unreadOnly),
        limit: query.limit,
      }),
    };
  });

  app.post("/api/arc/notifications/read", { preHandler: requireView }, async (request) => {
    const body = readBody(request);

    return markArcNotificationsRead({
      employeeId: currentEmployee(request)?.id ?? null,
      ids: body.ids,
    });
  });

  // ── 동의서(종이 서명 → 앱에서 동의 확인) ────────────────────────────

  app.get("/api/arc/consents", { preHandler: requireView }, async (request) => {
    const query = request.query || {};
    const employee = currentEmployee(request);
    const incidentNo = query.incidentNo || null;
    const canRevealSensitive = hasPermission(request, PERMISSIONS.ARC_SENSITIVE);
    // 성명·연락처는 arc.sensitive + 사건별 접근승인이 모두 있어야 복호화합니다.
    let revealSensitive = false;

    if (canRevealSensitive && incidentNo && isTruthyFlag(query.revealSensitive)) {
      await assertArcSensitiveAccess({
        incidentNo,
        employee,
        action: "VIEW_CONSENT",
        ip: clientIp(request),
      });
      revealSensitive = true;
    }

    return {
      consents: await listArcConsents({
        incidentNo,
        includeInactive: isTruthyFlag(query.includeInactive),
        revealSensitive,
        limit: query.limit,
      }),
      canRevealSensitive,
      revealed: revealSensitive,
    };
  });

  app.post("/api/arc/consents", { preHandler: requireCare }, async (request) => ({
    consent: await createArcConsent(readBody(request), currentEmployee(request)),
  }));

  app.patch(
    "/api/arc/consents/:consentId/confirm",
    { preHandler: requireCare },
    async (request) => ({
      consent: await confirmArcConsent(request.params?.consentId, currentEmployee(request)),
    })
  );

  app.patch(
    "/api/arc/consents/:consentId/withdraw",
    { preHandler: requireCare },
    async (request) => ({
      consent: await withdrawArcConsent(
        request.params?.consentId,
        currentEmployee(request),
        readBody(request).reason
      ),
    })
  );

  // ── 민감정보 접근 승인 ─────────────────────────────────────────────

  app.get("/api/arc/sensitive-access", { preHandler: requireSensitive }, async (request) => {
    const query = request.query || {};
    const employee = currentEmployee(request);
    const canApprove = hasPermission(request, PERMISSIONS.ARC_APPROVE);
    // 승인 권한자는 전체를, 그 외에는 자기 요청만 봅니다.
    const scopeAll = canApprove && isTruthyFlag(query.scopeAll);

    return {
      requests: await listArcSensitiveAccess({
        incidentNo: query.incidentNo || null,
        employeeId: scopeAll ? null : employee?.id ?? null,
        status: query.status || null,
        limit: query.limit,
      }),
      canApprove,
    };
  });

  app.post("/api/arc/sensitive-access", { preHandler: requireSensitive }, async (request) => ({
    request: await requestArcSensitiveAccess(readBody(request), currentEmployee(request)),
  }));

  app.patch(
    "/api/arc/sensitive-access/:accessId",
    { preHandler: requireApprove },
    async (request) => {
      const body = readBody(request);

      return {
        request: await decideArcSensitiveAccess(
          request.params?.accessId,
          { approve: isTruthyFlag(body.approve), reason: body.reason },
          currentEmployee(request)
        ),
      };
    }
  );

  app.get("/api/arc/sensitive-reads", { preHandler: requireAdmin }, async (request) => {
    const query = request.query || {};

    return {
      reads: await listArcSensitiveReads({
        incidentNo: query.incidentNo || null,
        limit: query.limit,
      }),
    };
  });

  // ── 재고·유효기간(구급상자 실물 마스터 / 로트 / 수불) ────────────────

  app.get("/api/arc/stock", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return {
      items: await listArcItems({
        category: query.category || null,
        accessLevel: query.accessLevel || null,
        search: query.search || "",
        includeInactive: isTruthyFlag(query.includeInactive),
        lowOnly: isTruthyFlag(query.lowOnly),
        expiringWithinDays: query.expiringWithinDays ? Number(query.expiringWithinDays) : null,
      }),
      summary: await arcStockSummary({ employee: currentEmployee(request) }),
      canManage: hasPermission(request, PERMISSIONS.ARC_ADMIN),
      canStock: hasPermission(request, PERMISSIONS.ARC_STOCK),
    };
  });

  app.post("/api/arc/stock/items", { preHandler: requireAdmin }, async (request) => {
    const employee = currentEmployee(request);
    const item = await createArcItem(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.stock.item.create",
      targetType: "arc_item",
      targetId: item.id,
      detail: { code: item.code, name: item.name, accessLevel: item.accessLevel },
      ip: clientIp(request),
      log: request.log,
    });

    return { item };
  });

  app.patch("/api/arc/stock/items/:itemId", { preHandler: requireAdmin }, async (request) => {
    const employee = currentEmployee(request);
    const item = await updateArcItem(request.params?.itemId, readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.stock.item.update",
      targetType: "arc_item",
      targetId: item.id,
      detail: { code: item.code, active: item.active, minQty: item.minQty },
      ip: clientIp(request),
      log: request.log,
    });

    return { item };
  });

  app.get("/api/arc/stock/items/:itemId", { preHandler: requireView }, async (request) => ({
    item: await getArcItem(request.params?.itemId),
    lots: await listArcItemLots(request.params?.itemId, { includeEmptied: true }),
    moves: await listArcStockMoves({ itemId: request.params?.itemId, limit: 40 }),
  }));

  app.get("/api/arc/stock/moves", { preHandler: requireView }, async (request) => ({
    moves: await listArcStockMoves({
      itemId: request.query?.itemId || null,
      limit: request.query?.limit,
    }),
  }));

  app.post("/api/arc/stock/moves", { preHandler: requireStock }, async (request) =>
    recordArcStockMove(readBody(request), currentEmployee(request))
  );

  app.get("/api/arc/stock/expiry-scan", { preHandler: requireView }, async (request) => ({
    result: await scanArcStockAlerts({ force: isTruthyFlag(request.query?.force) }),
  }));

  // ── 월 1회 실사 ─────────────────────────────────────────────────────

  app.get("/api/arc/stocktakes", { preHandler: requireView }, async (request) => ({
    stocktakes: await listArcStocktakes({ limit: request.query?.limit }),
    canCount: hasPermission(request, PERMISSIONS.ARC_STOCK),
    canApply: hasPermission(request, PERMISSIONS.ARC_CHECK),
  }));

  app.get("/api/arc/stocktakes/:stocktakeId", { preHandler: requireView }, async (request) =>
    getArcStocktake(request.params?.stocktakeId)
  );

  app.post("/api/arc/stocktakes", { preHandler: requireStock }, async (request) => ({
    ...(await createArcStocktake(readBody(request), currentEmployee(request))),
  }));

  app.patch(
    "/api/arc/stocktakes/:stocktakeId/items/:itemId",
    { preHandler: requireStock },
    async (request) =>
      saveArcStocktakeItem(
        request.params?.stocktakeId,
        request.params?.itemId,
        readBody(request)
      )
  );

  app.post(
    "/api/arc/stocktakes/:stocktakeId/apply",
    { preHandler: requireCheck },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await applyArcStocktake(request.params?.stocktakeId, employee);

      await writeAuditLog({
        employee,
        action: "arc.stocktake.apply",
        targetType: "arc_stocktake",
        targetId: request.params?.stocktakeId,
        detail: { period: result.stocktake.period, adjusted: result.adjusted.length },
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // ── 보충·구매·실비정산 ──────────────────────────────────────────────

  app.get("/api/arc/purchases", { preHandler: requireView }, async (request) => {
    const employee = currentEmployee(request);

    return {
      purchases: await listArcPurchases({
        period: request.query?.period || null,
        limit: request.query?.limit,
      }),
      canCreate: hasPermission(request, PERMISSIONS.ARC_STOCK),
      canSettle: hasPermission(request, PERMISSIONS.ARC_APPROVE),
      viewer: employee?.name ?? "",
    };
  });

  app.post("/api/arc/purchases", { preHandler: requireStock }, async (request) => ({
    purchase: await createArcPurchase(readBody(request), currentEmployee(request)),
  }));

  app.patch(
    "/api/arc/purchases/:purchaseId",
    { preHandler: requireApprove },
    async (request) => {
      const employee = currentEmployee(request);
      const body = readBody(request);
      const purchase = await settleArcPurchase(
        request.params?.purchaseId,
        { settledAmount: body.settledAmount, approve: isTruthyFlag(body.approve) },
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.purchase.settle",
        targetType: "arc_purchase",
        targetId: purchase.id,
        detail: { amount: purchase.amount, settled: purchase.settledAmount, status: purchase.settleStatus },
        ip: clientIp(request),
        log: request.log,
      });

      return { purchase };
    }
  );

  // ── 직원 개인 상비약(OTC) 자기점검 ──────────────────────────────────

  app.get("/api/arc/otc", { preHandler: requireView }, async (request) => {
    const employee = currentEmployee(request);
    const canManageAll = hasPermission(request, PERMISSIONS.ARC_ADMIN);
    const scopeAll = canManageAll && isTruthyFlag(request.query?.scopeAll);

    return {
      items: await listArcOtcItems({
        employee,
        scopeAll,
        period: request.query?.period || null,
      }),
      checks: await listArcOtcChecks({
        period: request.query?.period || null,
        limit: request.query?.limit,
      }),
      canManageAll,
      viewerId: employee?.id ?? null,
      viewerName: employee?.name ?? "",
    };
  });

  app.post("/api/arc/otc/claim", { preHandler: requireStock }, async (request) => ({
    ...(await claimArcOtcItems(currentEmployee(request))),
  }));

  app.patch("/api/arc/otc/items/:otcItemId", { preHandler: requireStock }, async (request) => ({
    item: await updateArcOtcItem(request.params?.otcItemId, readBody(request), {
      employee: currentEmployee(request),
      canManageAll: hasPermission(request, PERMISSIONS.ARC_ADMIN),
    }),
  }));

  app.post(
    "/api/arc/otc/items/:otcItemId/checks",
    { preHandler: requireStock },
    async (request) => ({
      ...(await createArcOtcCheck(request.params?.otcItemId, readBody(request), {
        employee: currentEmployee(request),
        canManageAll: hasPermission(request, PERMISSIONS.ARC_ADMIN),
      })),
    })
  );

  // ── 사건 접수(INC) · AS-CARE 상세기록 ───────────────────────────────

  app.get("/api/arc/incidents", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return {
      incidents: await listArcIncidents({
        kind: query.kind || null,
        status: query.status || null,
        search: query.search || "",
        from: query.from || null,
        to: query.to || null,
        limit: query.limit,
      }),
      canCare: hasPermission(request, PERMISSIONS.ARC_CARE),
      canSensitive: hasPermission(request, PERMISSIONS.ARC_SENSITIVE),
      canApprove: hasPermission(request, PERMISSIONS.ARC_APPROVE),
      viewerName: currentEmployee(request)?.name ?? "",
    };
  });

  app.post("/api/arc/incidents", { preHandler: requireCare }, async (request) => ({
    incident: await createArcIncident(readBody(request), currentEmployee(request)),
  }));

  app.get("/api/arc/incidents/:incidentId", { preHandler: requireView }, async (request) => ({
    ...(await getArcCareStatus(request.params?.incidentId)),
    canCare: hasPermission(request, PERMISSIONS.ARC_CARE),
    canSensitive: hasPermission(request, PERMISSIONS.ARC_SENSITIVE),
    canApprove: hasPermission(request, PERMISSIONS.ARC_APPROVE),
    viewerName: currentEmployee(request)?.name ?? "",
  }));

  app.patch(
    "/api/arc/incidents/:incidentId",
    { preHandler: requireCare },
    async (request) => ({
      incident: await updateArcIncident(
        request.params?.incidentId,
        readBody(request),
        currentEmployee(request)
      ),
    })
  );

  // 상세 건강기록 조회: arc.sensitive + 사건별 접근 승인 + 열람로그를 모두 통과해야 합니다.
  app.get(
    "/api/arc/incidents/:incidentId/care",
    { preHandler: requireSensitive },
    async (request) => {
      const employee = currentEmployee(request);
      const status = await getArcCareStatus(request.params?.incidentId);

      if (!status.exists) {
        return { ...(await getArcCareDetail(status.incident.id)), access: null };
      }

      const access = await assertArcSensitiveAccess({
        incidentNo: status.incident.incidentNo,
        employee,
        action: "VIEW",
        ip: clientIp(request),
      });

      return { ...(await getArcCareDetail(status.incident.id)), access };
    }
  );

  app.patch(
    "/api/arc/incidents/:incidentId/care",
    { preHandler: requireCare },
    async (request) =>
      saveArcCare(request.params?.incidentId, readBody(request), currentEmployee(request), {
        ip: clientIp(request),
      })
  );

  app.post(
    "/api/arc/incidents/:incidentId/addenda",
    { preHandler: requireSensitive },
    async (request) => {
      const status = await getArcCareStatus(request.params?.incidentId);

      await assertArcSensitiveAccess({
        incidentNo: status.incident.incidentNo,
        employee: currentEmployee(request),
        action: "UPDATE",
        ip: clientIp(request),
      });

      return {
        addendum: await addArcCareAddendum(
          request.params?.incidentId,
          readBody(request),
          currentEmployee(request)
        ),
      };
    }
  );
}
