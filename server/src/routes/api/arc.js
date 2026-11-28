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
  ARC_CARE_FILE_KINDS,
  arcFilesHealth,
  deleteArcCareFile,
  listArcCareFiles,
  readArcCareFile,
  saveArcCareFile,
} from "../../arcFiles.js";
import {
  addArcCareAddendum,
  arcIncidentSummary,
  createArcIncident,
  getArcCareDetail,
  getArcCareStatus,
  listArcCareRecords,
  listArcIncidents,
  saveArcCare,
  updateArcIncident,
} from "../../arcIncidents.js";
import {
  addArcExpensePayment,
  arcExpenseSummary,
  createArcExpense,
  createArcExpenseFromUsageMonth,
  getArcExpense,
  listArcExpenses,
  previewUsageMonth,
  removeArcExpensePayment,
  updateArcExpense,
} from "../../arcExpense.js";
import {
  arcQualitySummary,
  createArcQuality,
  deleteArcQualityAction,
  getArcQuality,
  listArcQuality,
  toggleArcQualityAction,
  updateArcQuality,
} from "../../arcQuality.js";
import {
  arcRoutineSummary,
  listArcRoutine,
  saveArcRoutineStep,
} from "../../arcRoutine.js";
import {
  applyArcStocktake,
  arcStockSummary,
  claimArcOtcItems,
  createArcOtcItem,
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
  listArcOtcOwnerCandidates,
  listArcPurchases,
  listArcStockMoves,
  listArcStocktakes,
  recordArcStockMove,
  saveArcStocktakeItem,
  scanArcStockAlerts,
  settleArcPurchase,
  updateArcItem,
  updateArcOtcItem,
  updateArcStocktake,
} from "../../arcStock.js";
import {
  arcUsageSummary,
  createArcItemPrice,
  createArcUsage,
  deleteArcItemPrice,
  getArcUsage,
  latestArcUnitPriceMap,
  listArcItemPrices,
  listArcUsages,
  voidArcUsage,
} from "../../arcUsage.js";
import { writeAuditLog } from "../../auth/audit.js";
import { isArcDirector, PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import {
  listArcPermissionBoard,
  saveArcEmployeePermissions,
} from "../../arcPermissions.js";
import { arcAssistantBriefing } from "../../arcAssistant.js";
import {
  arcTrainingCatalog,
  arcTrainingSummary,
  createArcTrainingSession,
  deleteArcTrainingSession,
  listArcTrainingSessions,
  listArcTrainingStaff,
  saveArcTrainingAttendees,
  updateArcTrainingSession,
} from "../../arcTraining.js";
import { arcTrainingGuide } from "../../arcTrainingGuide.js";
import {
  buildTrainingHelper,
  deleteTrainingContent,
  listTrainingContent,
  loadTrainingOverrides,
  saveTrainingContent,
} from "../../arcTrainingContent.js";
import {
  arcVerbalSummary,
  arcVerbalTemplate,
  createArcVerbalExam,
  deleteArcVerbalExam,
  getArcVerbalExam,
  gradeArcVerbalExam,
  listArcVerbalExams,
} from "../../arcVerbal.js";
import {
  completeArcRequest,
  createArcRequest,
  deleteArcRequest,
  getArcRequest,
  listArcRequests,
  reopenArcRequest,
  replyToArcRequest,
} from "../../arcRequests.js";
import {
  arcOtcLedgerCatalog,
  arcOtcLedgerSummary,
  cancelArcOtcSettlement,
  createArcOtcUsage,
  deleteArcOtcPrice,
  listArcOtcPrices,
  listArcOtcSettlements,
  listArcOtcUsages,
  payArcOtcSettlement,
  requestArcOtcSettlement,
  saveArcOtcPrice,
  voidArcOtcUsage,
} from "../../arcOtcLedger.js";
import { HttpError } from "../../http/errors.js";
import {
  addArcEventTask,
  arcEventSummary,
  createArcEvent,
  deleteArcEvent,
  deleteArcEventStaff,
  deleteArcEventTask,
  getArcEvent,
  listArcEvents,
  saveArcEventStaff,
  toggleArcEventTask,
  updateArcEvent,
} from "../../arcEvents.js";

// 응급안전관리센터는 사장(대표)·매니저, 그리고 ARC 총괄 계정(yoonhee1021)만 씁니다.
// 직원 계정에 arc.* 권한을 직접 넣어도 여기서 다시 막습니다. (2026-11-28 대표 지시)
const ARC_ROLES = ["OWNER", "MANAGER"];

function arcGuard(permission) {
  const base = createStaffGuard(permission);

  return async (request, reply) => {
    await base(request, reply);

    const employee = request.staff?.employee;

    if (!ARC_ROLES.includes(employee?.role) && !isArcDirector(employee?.loginId)) {
      throw new HttpError(
        403,
        "HJ403",
        "응급안전관리센터는 사장·매니저·ARC 총괄만 사용할 수 있어요."
      );
    }
  };
}

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

/** ARC 총괄(또는 arc.admin 권한 보유자)만 가능한 동작. 기준단가 등록에 씁니다. */
function arcAdminOnly(request) {
  const employee = request.staff?.employee;

  return isArcDirector(employee?.loginId) || hasPermission(request, PERMISSIONS.ARC_ADMIN);
}

export function registerArcRoutes(app) {
  const requireView = arcGuard(PERMISSIONS.ARC_VIEW);
  const requireStock = arcGuard(PERMISSIONS.ARC_STOCK);
  const requireCheck = arcGuard(PERMISSIONS.ARC_CHECK);
  const requireCare = arcGuard(PERMISSIONS.ARC_CARE);
  const requireSensitive = arcGuard(PERMISSIONS.ARC_SENSITIVE);
  const requireApprove = arcGuard(PERMISSIONS.ARC_APPROVE);
  const requireExpense = arcGuard(PERMISSIONS.ARC_EXPENSE);
  const requireAdmin = arcGuard(PERMISSIONS.ARC_ADMIN);

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
      usage: await arcUsageSummary(),
      expense: await arcExpenseSummary(),
      routine: await arcRoutineSummary(),
      quality: await arcQualitySummary(),
      events: await arcEventSummary(),
    };
  });

  // ── 응급안전 권한 관리 (ARC 대표·RN 전용) ──────────────────────────
  // 사장·매니저도 이 화면에서는 아무것도 바꿀 수 없습니다.
  // 응급안전 9종 부여·회수는 오직 총괄 계정만 가능합니다.
  const requireArcDirector = async (request) => {
    const employee = currentEmployee(request);

    if (!isArcDirector(employee?.loginId)) {
      throw new HttpError(
        403,
        "HJ403",
        "응급안전 권한은 ARC 대표(RN)만 관리할 수 있어요."
      );
    }
  };

  app.get(
    "/api/arc/permissions",
    { preHandler: [requireView, requireArcDirector] },
    async () => listArcPermissionBoard()
  );

  app.patch(
    "/api/arc/permissions/:employeeId",
    { preHandler: [requireView, requireArcDirector] },
    async (request) => {
      const body = readBody(request);

      return saveArcEmployeePermissions(
        {
          employeeId: request.params.employeeId,
          permissions: body.permissions,
          ip: clientIp(request),
          log: request.log,
        },
        currentEmployee(request)
      );
    }
  );

  // ── ARC 비서 브리핑 ─────────────────────────────────────────────────
  // 최윤희가 하루 일과를 한 화면에서 시작하도록, 지금 챙겨야 할 일만 모아 줍니다.
  app.get("/api/arc/assistant", { preHandler: requireView }, async (request) =>
    arcAssistantBriefing({ employee: currentEmployee(request) })
  );

  // ── 월간 운영 루틴(AS-CAL-001) ──────────────────────────────────────

  app.get("/api/arc/routine", { preHandler: requireView }, async (request) => {
    const query = request.query || {};

    return listArcRoutine({ period: query.period });
  });

  app.patch(
    "/api/arc/routine/:stepKey",
    { preHandler: requireCheck },
    async (request) => {
      const employee = currentEmployee(request);
      const body = readBody(request);

      const result = await saveArcRoutineStep(
        {
          period: body.period,
          stepKey: request.params.stepKey,
          status: body.status,
          checklist: body.checklist,
          actions: body.actions,
          note: body.note,
        },
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.routine.save",
        targetType: "arc_routine_log",
        targetId: `${result.period}:${request.params.stepKey}`,
        detail: { status: result.step?.status ?? "PENDING" },
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

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
    // 승인은 ARC 총괄만 합니다. 그 외에는 자기 요청만 봅니다.
    const canApprove = isArcDirector(employee?.loginId);
    const scopeAll = canApprove && isTruthyFlag(query.scopeAll);

    return {
      requests: await listArcSensitiveAccess({
        incidentNo: query.incidentNo || null,
        employeeId: scopeAll ? null : employee?.id ?? null,
        status: query.status || null,
        limit: query.limit,
      }),
      canApprove,
      // 열람 요청은 사장만 낼 수 있습니다.
      canRequest: employee?.role === "OWNER",
    };
  });

  app.post("/api/arc/sensitive-access", { preHandler: requireSensitive }, async (request) => {
    const employee = currentEmployee(request);

    // 2026-11-28 대표 지시: 요청은 사장만, 승인은 ARC 총괄만 합니다.
    if (employee?.role !== "OWNER") {
      throw new HttpError(
        403,
        "HJ403",
        "상세 건강기록 열람 요청은 사장만 낼 수 있어요. 직원은 ARC 총괄에게 직접 문의해 주세요."
      );
    }

    return { request: await requestArcSensitiveAccess(readBody(request), employee) };
  });

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

  app.patch("/api/arc/stocktakes/:stocktakeId", { preHandler: requireStock }, async (request) => ({
    ...(await updateArcStocktake(request.params?.stocktakeId, readBody(request))),
  }));

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
      owners: await listArcOtcOwnerCandidates(),
      canManageAll,
      viewerIsDirector: isArcDirector(employee?.loginId),
      viewerId: employee?.id ?? null,
      viewerName: employee?.name ?? "",
    };
  });

  app.post("/api/arc/otc/claim", { preHandler: requireStock }, async (request) => ({
    ...(await claimArcOtcItems(currentEmployee(request))),
  }));

  app.post("/api/arc/otc/items", { preHandler: requireStock }, async (request) => {
    const employee = currentEmployee(request);
    const item = await createArcOtcItem(readBody(request), {
      employee,
      canManageAll: hasPermission(request, PERMISSIONS.ARC_ADMIN),
    });

    await writeAuditLog({
      employee,
      action: "arc.otc.create",
      targetType: "arc_otc_item",
      targetId: item.id,
      detail: { code: item.code, name: item.name, ownerName: item.ownerName },
      ip: clientIp(request),
      log: request.log,
    });

    return { item };
  });

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

  app.get("/api/arc/incidents/:incidentId", { preHandler: requireView }, async (request) => {
    const employee = currentEmployee(request);
    const director = isArcDirector(employee?.loginId);

    return {
      ...(await getArcCareStatus(request.params?.incidentId)),
      canCare: hasPermission(request, PERMISSIONS.ARC_CARE),
      canSensitive: hasPermission(request, PERMISSIONS.ARC_SENSITIVE),
      canApprove: director,
      // 상세 건강기록 작성·수정은 ARC 총괄만 가능합니다.
      canWriteCare: director,
      isArcDirector: director,
      viewerName: employee?.name ?? "",
    };
  });

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
        careRecordId: status.careRecordId,
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
        careRecordId: status.careRecordId,
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

  // ── AS-CARE 서식 목록 · 첨부 파일 ────────────────────────────────────
  // 손으로 적고 서명한 AS-CARE 원본(HWP·DOCX·PDF·사진)을 사건에 붙여 둡니다.
  // 올리기·지우기는 ARC 총괄만, 내려받기는 총괄 또는 그 기록의 열람 승인을 받은 직원만.

  app.get("/api/arc/care", { preHandler: requireSensitive }, async (request) => {
    const employee = currentEmployee(request);
    const query = request.query || {};

    return {
      records: await listArcCareRecords({
        search: query.search || "",
        from: query.from || null,
        to: query.to || null,
        hasFiles: isTruthyFlag(query.hasFiles),
        limit: query.limit,
      }),
      canWriteCare: isArcDirector(employee?.loginId),
      isArcDirector: isArcDirector(employee?.loginId),
    };
  });

  app.get(
    "/api/arc/incidents/:incidentId/care-files",
    { preHandler: requireSensitive },
    async (request) => {
      const employee = currentEmployee(request);
      const status = await getArcCareStatus(request.params?.incidentId);

      // 파일명만 나오지만 그 자체로 기록의 존재를 알 수 있으므로 승인을 먼저 확인합니다.
      await assertArcSensitiveAccess({
        incidentNo: status.incident.incidentNo,
        careRecordId: status.careRecordId,
        employee,
        action: "VIEW",
        ip: clientIp(request),
      });

      return {
        files: await listArcCareFiles({ incidentId: status.incident.id }),
        canUpload: isArcDirector(employee?.loginId),
        kinds: ARC_CARE_FILE_KINDS,
        maxBytes: arcFilesHealth().maxFileBytes,
        extensions: arcFilesHealth().extensions,
      };
    }
  );

  app.post(
    "/api/arc/incidents/:incidentId/care-files",
    // 파일 본문을 base64 로 받으므로 이 경로만 본문 한도를 올립니다(파일 1개 최대 20MB).
    { preHandler: requireCare, bodyLimit: 30 * 1024 * 1024 },
    async (request) => {
      const employee = currentEmployee(request);
      const status = await getArcCareStatus(request.params?.incidentId);
      const result = await saveArcCareFile(
        { ...readBody(request), incidentId: status.incident.id },
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.care.file.upload",
        targetType: "arc_care_files",
        targetId: result.file.id,
        detail: {
          incidentNo: status.incident.incidentNo,
          fileName: result.file.fileName,
          bytes: result.file.bytes,
          kind: result.file.kind,
        },
      });

      return result;
    }
  );

  app.get(
    "/api/arc/care-files/:fileId/download",
    { preHandler: requireSensitive },
    async (request, reply) => {
      const file = await readArcCareFile(request.params?.fileId, currentEmployee(request), {
        ip: clientIp(request),
        action: "DOWNLOAD",
      });
      const encoded = encodeURIComponent(file.fileName);
      const fallback = file.fileName.replace(/[^\w.-]+/g, "_") || "as-care";

      reply.header("content-type", file.mime);
      reply.header("cache-control", "no-store");
      reply.header("content-length", String(file.buffer.length));
      reply.header(
        "content-disposition",
        `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
      );

      return reply.send(file.buffer);
    }
  );

  app.delete("/api/arc/care-files/:fileId", { preHandler: requireCare }, async (request) => {
    const employee = currentEmployee(request);
    const result = await deleteArcCareFile(request.params?.fileId, employee);

    await writeAuditLog({
      employee,
      action: "arc.care.file.delete",
      targetType: "arc_care_files",
      targetId: result.file.id,
      detail: { fileName: result.file.fileName, incidentId: result.file.incidentId },
    });

    return result;
  });

  // ── 품목 기준단가 사전 등록(ARC 총괄 전용) ───────────────────────────
  // 구매 기록이 없어도 사용대장 금액이 바로 계산되도록 기준단가를 미리 정해 둡니다.

  app.get("/api/arc/unit-prices", { preHandler: requireView }, async () => ({
    prices: await listArcItemPrices(),
    priceMap: await latestArcUnitPriceMap(),
    canManage: arcAdminOnly(request),
  }));

  app.post("/api/arc/unit-prices", { preHandler: requireView }, async (request) => {
    if (!arcAdminOnly(request)) {
      throw new HttpError(403, "HJ403", "기준단가는 ARC 총괄만 등록할 수 있어요.");
    }

    const employee = currentEmployee(request);
    const price = await createArcItemPrice(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.itemPrice.create",
      targetType: "arc_item_prices",
      targetId: price.id,
      detail: {
        itemId: price.itemId,
        itemName: price.itemName,
        unitPrice: price.unitPrice,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { price };
  });

  app.delete(
    "/api/arc/unit-prices/:priceId",
    { preHandler: requireView },
    async (request) => {
      if (!arcAdminOnly(request)) {
        throw new HttpError(403, "HJ403", "기준단가는 ARC 총괄만 수정할 수 있어요.");
      }

      const employee = currentEmployee(request);
      const result = await deleteArcItemPrice(request.params?.priceId);

      await writeAuditLog({
        employee,
        action: "arc.itemPrice.delete",
        targetType: "arc_item_prices",
        targetId: result.deletedId,
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // ── 사용대장(USE) · 소모금액 ────────────────────────────────────────

  app.get("/api/arc/usages", { preHandler: requireView }, async (request) => {
    const employee = currentEmployee(request);
    const period = request.query?.period || "";

    return {
      usages: await listArcUsages({
        period,
        incidentNo: request.query?.incidentNo || "",
        status: request.query?.status || "",
        limit: request.query?.limit,
      }),
      priceMap: await latestArcUnitPriceMap(),
      prices: await listArcItemPrices(),
      pendingUsage: await previewUsageMonth(period),
      summary: await arcUsageSummary(),
      canCreate: hasPermission(request, PERMISSIONS.ARC_STOCK),
      canExpense: hasPermission(request, PERMISSIONS.ARC_EXPENSE),
      canApprove: hasPermission(request, PERMISSIONS.ARC_APPROVE),
      canManagePrices: arcAdminOnly(request),
      viewerName: employee?.name ?? "",
    };
  });

  app.get(
    "/api/arc/usages/:usageId",
    { preHandler: requireView },
    async (request) => ({
      ...(await getArcUsage(request.params?.usageId)),
      canCreate: hasPermission(request, PERMISSIONS.ARC_STOCK),
    })
  );

  app.post("/api/arc/usages", { preHandler: requireStock }, async (request) => {
    const employee = currentEmployee(request);
    const result = await createArcUsage(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.usage.create",
      targetType: "arc_usage",
      targetId: result.usage?.id ?? "",
      detail: {
        usageNo: result.usage?.usageNo,
        targetKind: result.usage?.targetKind,
        totalAmount: result.usage?.totalAmount,
        itemCount: result.items?.length ?? 0,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return result;
  });

  app.post(
    "/api/arc/usages/:usageId/void",
    { preHandler: requireApprove },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await voidArcUsage(
        request.params?.usageId,
        { reason: readBody(request).reason },
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.usage.void",
        targetType: "arc_usage",
        targetId: request.params?.usageId,
        detail: {
          usageNo: result.usage?.usageNo,
          reason: readBody(request).reason,
          restored: result.restore,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // ── 비용·실비정산(EXP) + 부분입금 ──────────────────────────────────

  app.get("/api/arc/expenses", { preHandler: requireView }, async (request) => {
    const employee = currentEmployee(request);
    const period = request.query?.period || "";

    return {
      expenses: await listArcExpenses({
        period,
        status: request.query?.status || "",
        limit: request.query?.limit,
      }),
      summary: await arcExpenseSummary(),
      pendingUsage: await previewUsageMonth(period),
      canCreate: hasPermission(request, PERMISSIONS.ARC_EXPENSE),
      canApprove: hasPermission(request, PERMISSIONS.ARC_APPROVE),
      viewerName: employee?.name ?? "",
    };
  });

  app.get(
    "/api/arc/expenses/:expenseId",
    { preHandler: requireView },
    async (request) => ({
      ...(await getArcExpense(request.params?.expenseId)),
      canCreate: hasPermission(request, PERMISSIONS.ARC_EXPENSE),
      canApprove: hasPermission(request, PERMISSIONS.ARC_APPROVE),
    })
  );

  app.post(
    "/api/arc/expenses",
    { preHandler: requireExpense },
    async (request) =>
      createArcExpense(readBody(request), currentEmployee(request))
  );

  app.post(
    "/api/arc/expenses/from-usage-month",
    { preHandler: requireExpense },
    async (request) =>
      createArcExpenseFromUsageMonth(readBody(request), currentEmployee(request))
  );

  app.patch(
    "/api/arc/expenses/:expenseId",
    { preHandler: requireExpense },
    async (request) =>
      updateArcExpense(
        request.params?.expenseId,
        readBody(request),
        currentEmployee(request)
      )
  );

  // 대표확인(승인)은 건별로만 찍을 수 있고 arc.approve 권한이 필요합니다.
  app.post(
    "/api/arc/expenses/:expenseId/approve",
    { preHandler: requireApprove },
    async (request) =>
      updateArcExpense(
        request.params?.expenseId,
        { approve: true },
        currentEmployee(request)
      )
  );

  app.post(
    "/api/arc/expenses/:expenseId/payments",
    { preHandler: requireExpense },
    async (request) =>
      addArcExpensePayment(
        request.params?.expenseId,
        readBody(request),
        currentEmployee(request)
      )
  );

  app.post(
    "/api/arc/expenses/:expenseId/payments/:paymentId/remove",
    { preHandler: requireExpense },
    async (request) =>
      removeArcExpensePayment(
        request.params?.expenseId,
        request.params?.paymentId,
        currentEmployee(request)
      )
  );

  // ── 월간 교육·OT ────────────────────────────────────────────────────
  // 조회는 ARC 사용자 전체, 등록·수정은 총괄(최윤희)만 할 수 있습니다.

  const requireDirector = async (request, reply) => {
    await requireView(request, reply);

    if (!isArcDirector(currentEmployee(request)?.loginId)) {
      throw new HttpError(403, "HJ403", "교육·OT 등록은 ARC 총괄만 할 수 있어요.");
    }
  };

  app.get("/api/arc/training", { preHandler: requireView }, async (request) => {
    const employee = currentEmployee(request);
    const viewerIsDirector = isArcDirector(employee?.loginId);
    // 총괄이 고친 교육자료가 있으면 원문 위에 덮어써서 내려 줍니다.
    const overrides = await loadTrainingOverrides();
    const list = await listArcTrainingSessions({
      period: request.query?.period || null,
      limit: request.query?.limit,
      // 개인 달력(PERSONAL)·구두테스트는 총괄에게만 보입니다.
      viewerLoginId: employee?.loginId || "",
      viewerIsDirector,
    });

    return {
      ...list,
      catalog: arcTrainingCatalog({ overrides: overrides.grouped }),
      staff: await listArcTrainingStaff(),
      stats: await arcTrainingSummary({ period: list.period, viewerIsDirector }),
      canWrite: viewerIsDirector,
      viewerLoginId: employee?.loginId || "",
      viewerIsDirector,
    };
  });

  app.get("/api/arc/training/catalog", { preHandler: requireView }, async (request) => {
    const overrides = await loadTrainingOverrides();

    return {
      ...arcTrainingCatalog({ overrides: overrides.grouped }),
      canWrite: isArcDirector(currentEmployee(request)?.loginId),
    };
  });

  app.get("/api/arc/training/guide", { preHandler: requireView }, async (request) => {
    const overrides = await loadTrainingOverrides();

    return {
      ...arcTrainingGuide({ overrides: overrides.grouped }),
      canWrite: isArcDirector(currentEmployee(request)?.loginId),
    };
  });

  app.post("/api/arc/training", { preHandler: requireDirector }, async (request) => {
    const employee = currentEmployee(request);
    const session = await createArcTrainingSession(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.training.create",
      targetType: "arc_training_session",
      targetId: session.id,
      detail: {
        sessionNo: session.sessionNo,
        kind: session.kind,
        scheduledOn: session.scheduledOn,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { session };
  });

  app.patch(
    "/api/arc/training/:sessionId",
    { preHandler: requireDirector },
    async (request) => {
      const employee = currentEmployee(request);
      const session = await updateArcTrainingSession(
        request.params?.sessionId,
        readBody(request),
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.training.update",
        targetType: "arc_training_session",
        targetId: session.id,
        detail: {
          sessionNo: session.sessionNo,
          status: session.status,
          evidenceId: session.evidenceId,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { session };
    }
  );

  app.post(
    "/api/arc/training/:sessionId/attendees",
    { preHandler: requireDirector },
    async (request) => {
      const employee = currentEmployee(request);
      const session = await saveArcTrainingAttendees(
        request.params?.sessionId,
        readBody(request).attendees,
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.training.attendees",
        targetType: "arc_training_session",
        targetId: session.id,
        detail: {
          sessionNo: session.sessionNo,
          attendeeCount: session.attendeeCount,
          followupCount: session.followupCount,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { session };
    }
  );

  app.post(
    "/api/arc/training/:sessionId/delete",
    { preHandler: requireDirector },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await deleteArcTrainingSession(request.params?.sessionId);

      await writeAuditLog({
        employee,
        action: "arc.training.delete",
        targetType: "arc_training_session",
        targetId: request.params?.sessionId,
        detail: { sessionNo: result.sessionNo },
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // ── P14O · 교육자료 총괄 수정 + 작성 도우미 ─────────────────────────
  // 교육자료 원문은 코드가 원본이고, 총괄이 고친 부분만 저장합니다.
  // 저장·되돌리기·도우미는 모두 ARC 대표(RN)만 가능합니다.

  app.get("/api/arc/training/content", { preHandler: requireDirector }, async () => ({
    rows: await listTrainingContent(),
  }));

  app.put("/api/arc/training/content", { preHandler: requireDirector }, async (request) => {
    const employee = currentEmployee(request);
    const content = await saveTrainingContent(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.training.content.save",
      targetType: "arc_training_content",
      targetId: `${content.scope}:${content.key}`,
      detail: { scope: content.scope, key: content.key, restored: content.restored },
      ip: clientIp(request),
      log: request.log,
    });

    return { content };
  });

  app.post(
    "/api/arc/training/content/delete",
    { preHandler: requireDirector },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await deleteTrainingContent(readBody(request));

      await writeAuditLog({
        employee,
        action: "arc.training.content.reset",
        targetType: "arc_training_content",
        targetId: `${result.scope}:${result.key}`,
        detail: result,
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // 도우미: 총괄이 몇 줄만 적으면 교육자료에 붙일 문장을 만들어 줍니다.
  app.post(
    "/api/arc/training/content/helper",
    { preHandler: requireDirector },
    async (request) => ({ helper: buildTrainingHelper(readBody(request)) })
  );

  // ── P14O · 구두테스트(ARC 대표 전용) ───────────────────────────────
  // 평가표·질문·응시 기록 모두 총괄만 조회·수정합니다.

  app.get("/api/arc/verbal", { preHandler: requireDirector }, async (request) => {
    const list = await listArcVerbalExams({
      period: request.query?.period || null,
      employeeId: request.query?.employeeId || "",
      limit: request.query?.limit,
    });

    return {
      ...list,
      template: arcVerbalTemplate(),
      staff: await listArcTrainingStaff(),
      stats: await arcVerbalSummary({ period: list.period }),
    };
  });

  app.get(
    "/api/arc/verbal/template",
    { preHandler: requireDirector },
    async () => arcVerbalTemplate()
  );

  app.post("/api/arc/verbal", { preHandler: requireDirector }, async (request) => {
    const employee = currentEmployee(request);
    const exam = await createArcVerbalExam(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.verbal.create",
      targetType: "arc_verbal_exam",
      targetId: exam.id,
      detail: { examNo: exam.examNo, kind: exam.kind, employeeName: exam.employeeName },
      ip: clientIp(request),
      log: request.log,
    });

    return { exam };
  });

  app.get("/api/arc/verbal/:examId", { preHandler: requireDirector }, async (request) => ({
    exam: await getArcVerbalExam(request.params?.examId),
  }));

  app.post(
    "/api/arc/verbal/:examId/grade",
    { preHandler: requireDirector },
    async (request) => {
      const employee = currentEmployee(request);
      const exam = await gradeArcVerbalExam(
        request.params?.examId,
        readBody(request),
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.verbal.grade",
        targetType: "arc_verbal_exam",
        targetId: exam.id,
        detail: {
          examNo: exam.examNo,
          verdict: exam.verdict,
          percent: exam.percent,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { exam };
    }
  );

  app.post(
    "/api/arc/verbal/:examId/delete",
    { preHandler: requireDirector },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await deleteArcVerbalExam(request.params?.examId);

      await writeAuditLog({
        employee,
        action: "arc.verbal.delete",
        targetType: "arc_verbal_exam",
        targetId: request.params?.examId,
        detail: {},
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // ── P14O · 요청 게시판(전 직원 → ARC 대표) ─────────────────────────
  // ARC 화면 안에 있지만, 직원 계정도 글을 남길 수 있어야 하므로
  // 이 경로만 로그인 확인(권한 없음)으로 엽니다. 개인정보·민감정보는 포함하지 않습니다.

  const requireStaff = createStaffGuard();

  app.get("/api/arc/requests", { preHandler: requireStaff }, async (request) => {
    const employee = currentEmployee(request);
    const isDirector = isArcDirector(employee?.loginId);

    return {
      ...(await listArcRequests({
        isDirector,
        employeeId: employee?.id ?? "",
        status: request.query?.status || "",
        category: request.query?.category || "",
        period: request.query?.period || "",
        limit: request.query?.limit,
      })),
      canManage: isDirector,
      viewerName: employee?.name || employee?.loginId || "",
    };
  });

  app.post("/api/arc/requests", { preHandler: requireStaff }, async (request) => {
    const employee = currentEmployee(request);
    const item = await createArcRequest(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.request.create",
      targetType: "arc_request",
      targetId: item.id,
      detail: { requestNo: item.requestNo, category: item.category },
      ip: clientIp(request),
      log: request.log,
    });

    return { request: item };
  });

  app.get("/api/arc/requests/:requestId", { preHandler: requireStaff }, async (request) => {
    const employee = currentEmployee(request);
    const isDirector = isArcDirector(employee?.loginId);

    return {
      request: await getArcRequest(request.params?.requestId, {
        isDirector,
        employeeId: employee?.id ?? "",
        employee,
      }),
      canManage: isDirector,
    };
  });

  app.post(
    "/api/arc/requests/:requestId/replies",
    { preHandler: requireStaff },
    async (request) => {
      const employee = currentEmployee(request);
      const item = await replyToArcRequest(
        request.params?.requestId,
        readBody(request),
        employee,
        { isDirector: isArcDirector(employee?.loginId) }
      );

      return { request: item };
    }
  );

  app.post(
    "/api/arc/requests/:requestId/complete",
    { preHandler: requireStaff },
    async (request) => {
      const employee = currentEmployee(request);

      if (!isArcDirector(employee?.loginId)) {
        throw new HttpError(403, "HJ403", "완료 처리는 ARC 대표(RN)만 할 수 있어요.");
      }

      const item = await completeArcRequest(
        request.params?.requestId,
        readBody(request),
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.request.complete",
        targetType: "arc_request",
        targetId: item.id,
        detail: { requestNo: item.requestNo },
        ip: clientIp(request),
        log: request.log,
      });

      return { request: item };
    }
  );

  app.post(
    "/api/arc/requests/:requestId/reopen",
    { preHandler: requireStaff },
    async (request) => {
      const employee = currentEmployee(request);

      if (!isArcDirector(employee?.loginId)) {
        throw new HttpError(403, "HJ403", "완료 취소는 ARC 대표(RN)만 할 수 있어요.");
      }

      return {
        request: await reopenArcRequest(
          request.params?.requestId,
          readBody(request),
          employee
        ),
      };
    }
  );

  app.post(
    "/api/arc/requests/:requestId/delete",
    { preHandler: requireStaff },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await deleteArcRequest(request.params?.requestId, {
        isDirector: isArcDirector(employee?.loginId),
        employeeId: employee?.id ?? "",
      });

      await writeAuditLog({
        employee,
        action: "arc.request.delete",
        targetType: "arc_request",
        targetId: request.params?.requestId,
        detail: {},
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // ── P14O · 직원 개인 상비약 사용대장 · 단가 · 정산 ──────────────────
  // 조회·사용 기록은 ARC 사용자, 단가·정산 요청은 총괄, 지급 확인은 사장입니다.

  app.get("/api/arc/otc/ledger", { preHandler: requireView }, async (request) => {
    const employee = currentEmployee(request);
    const period = request.query?.period || "";
    const isDirector = isArcDirector(employee?.loginId);

    return {
      period: period || null,
      usages: await listArcOtcUsages({ period, limit: request.query?.limit }),
      prices: await listArcOtcPrices({}),
      settlements: await listArcOtcSettlements({ period }),
      summary: await arcOtcLedgerSummary({ period }),
      items: await listArcOtcItems({ employee, scopeAll: isDirector }),
      catalog: arcOtcLedgerCatalog(),
      canPrice: isDirector,
      canSettle: isDirector,
      canPay: isDirector || employee?.role === "OWNER",
    };
  });

  app.post("/api/arc/otc/usages", { preHandler: requireView }, async (request) => {
    const employee = currentEmployee(request);
    const usage = await createArcOtcUsage(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.otc.usage.create",
      targetType: "arc_otc_usage",
      targetId: usage.id,
      detail: {
        usageNo: usage.usageNo,
        itemName: usage.itemName,
        qty: usage.qty,
        amount: usage.amount,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return { usage };
  });

  app.post(
    "/api/arc/otc/usages/:usageId/void",
    { preHandler: requireView },
    async (request) => {
      const employee = currentEmployee(request);
      const usage = await voidArcOtcUsage(
        request.params?.usageId,
        readBody(request),
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.otc.usage.void",
        targetType: "arc_otc_usage",
        targetId: usage.id,
        detail: { usageNo: usage.usageNo, reason: usage.voidReason },
        ip: clientIp(request),
        log: request.log,
      });

      return { usage };
    }
  );

  app.post("/api/arc/otc/prices", { preHandler: requireDirector }, async (request) => {
    const employee = currentEmployee(request);
    const price = await saveArcOtcPrice(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.otc.price.save",
      targetType: "arc_otc_item",
      targetId: price.otcItemId,
      detail: { itemName: price.itemName, unitPrice: price.unitPrice },
      ip: clientIp(request),
      log: request.log,
    });

    return { price };
  });

  app.post(
    "/api/arc/otc/prices/:priceId/delete",
    { preHandler: requireDirector },
    async (request) => deleteArcOtcPrice(request.params?.priceId)
  );

  app.post(
    "/api/arc/otc/settlements/request",
    { preHandler: requireDirector },
    async (request) => {
      const employee = currentEmployee(request);
      const settlement = await requestArcOtcSettlement(readBody(request), employee);

      await writeAuditLog({
        employee,
        action: "arc.otc.settlement.request",
        targetType: "arc_otc_settlement",
        targetId: settlement.id,
        detail: {
          settlementNo: settlement.settlementNo,
          totalAmount: settlement.totalAmount,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { settlement };
    }
  );

  app.post(
    "/api/arc/otc/settlements/:settlementId/pay",
    { preHandler: requireView },
    async (request) => {
      const employee = currentEmployee(request);

      // 지급 확인은 사장(또는 총괄이 대신 기록)만 합니다.
      if (!isArcDirector(employee?.loginId) && employee?.role !== "OWNER") {
        throw new HttpError(403, "HJ403", "지급 확인은 사장만 할 수 있어요.");
      }

      const settlement = await payArcOtcSettlement(
        request.params?.settlementId,
        readBody(request),
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.otc.settlement.pay",
        targetType: "arc_otc_settlement",
        targetId: settlement.id,
        detail: {
          settlementNo: settlement.settlementNo,
          paidAmount: settlement.paidAmount,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return { settlement };
    }
  );

  app.post(
    "/api/arc/otc/settlements/:settlementId/cancel",
    { preHandler: requireDirector },
    async (request) => ({
      settlement: await cancelArcOtcSettlement(
        request.params?.settlementId,
        readBody(request)
      ),
    })
  );

  // ── 품질관리(P14I · AS-REC-001 F11·F12·F13·F14) ─────────────────────
  // 작성·수정은 사장·매니저(ARC 총괄 포함)가 합니다. 직원 계정에는 열리지 않습니다.

  app.get("/api/arc/quality", { preHandler: requireView }, async (request) => {
    const query = request.query || {};
    const list = await listArcQuality({
      kind: query.kind,
      status: query.status,
      incidentNo: query.incidentNo,
      q: query.q,
      limit: query.limit,
    });

    return {
      ...list,
      summary: await arcQualitySummary(),
      canWrite: hasPermission(request, PERMISSIONS.ARC_CARE),
    };
  });

  app.get("/api/arc/quality/summary", { preHandler: requireView }, async (request) =>
    arcQualitySummary(request.query?.limit)
  );

  app.get("/api/arc/quality/:recordId", { preHandler: requireView }, async (request) =>
    getArcQuality(request.params?.recordId)
  );

  app.post("/api/arc/quality", { preHandler: requireCare }, async (request) => {
    const employee = currentEmployee(request);
    const result = await createArcQuality(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.quality.create",
      targetType: "arc_quality_record",
      targetId: result.record.id,
      detail: {
        recordNo: result.record.recordNo,
        kind: result.record.kind,
        incidentNo: result.record.incidentNo,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return result;
  });

  app.patch(
    "/api/arc/quality/:recordId",
    { preHandler: requireCare },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await updateArcQuality(
        request.params?.recordId,
        readBody(request),
        employee
      );

      await writeAuditLog({
        employee,
        action: "arc.quality.update",
        targetType: "arc_quality_record",
        targetId: result.record.id,
        detail: {
          recordNo: result.record.recordNo,
          status: result.record.status,
          verdict: result.record.verdict,
        },
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  app.patch(
    "/api/arc/quality/:recordId/actions/:actionId",
    { preHandler: requireCare },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await toggleArcQualityAction(
        request.params?.recordId,
        request.params?.actionId,
        readBody(request)
      );

      await writeAuditLog({
        employee,
        action: "arc.quality.action",
        targetType: "arc_quality_record",
        targetId: result.record.id,
        detail: { recordNo: result.record.recordNo },
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  app.post(
    "/api/arc/quality/:recordId/actions/:actionId/delete",
    { preHandler: requireCare },
    async (request) =>
      deleteArcQualityAction(request.params?.recordId, request.params?.actionId)
  );

  // ── 행사·의료지원(P14J · AS-OPS-001 06-B-3 · AS-NOT-001) ─────────────
  // 행사 등록·체크리스트·배정 인력은 ARC 총괄(최윤희)과 사장·매니저가 맡습니다.

  app.get("/api/arc/events", { preHandler: requireView }, async (request) => {
    const query = request.query || {};
    const list = await listArcEvents({
      scope: query.scope,
      kind: query.kind,
      status: query.status,
      q: query.q,
      limit: query.limit,
    });

    return {
      ...list,
      summary: await arcEventSummary(),
      canWrite: hasPermission(request, PERMISSIONS.ARC_CARE),
    };
  });

  app.get("/api/arc/events/summary", { preHandler: requireView }, async (request) =>
    arcEventSummary(request.query?.limit)
  );

  app.get("/api/arc/events/:eventId", { preHandler: requireView }, async (request) =>
    getArcEvent(request.params?.eventId)
  );

  app.post("/api/arc/events", { preHandler: requireCare }, async (request) => {
    const employee = currentEmployee(request);
    const result = await createArcEvent(readBody(request), employee);

    await writeAuditLog({
      employee,
      action: "arc.event.create",
      targetType: "arc_event",
      targetId: result.eventId,
      detail: { eventNo: result.eventNo },
      ip: clientIp(request),
      log: request.log,
    });

    return getArcEvent(result.eventId);
  });

  app.patch(
    "/api/arc/events/:eventId",
    { preHandler: requireCare },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await updateArcEvent(request.params?.eventId, readBody(request));

      await writeAuditLog({
        employee,
        action: "arc.event.update",
        targetType: "arc_event",
        targetId: request.params?.eventId,
        detail: { status: result.status },
        ip: clientIp(request),
        log: request.log,
      });

      return getArcEvent(request.params?.eventId);
    }
  );

  app.post(
    "/api/arc/events/:eventId/delete",
    { preHandler: requireCare },
    async (request) => {
      const employee = currentEmployee(request);
      const result = await deleteArcEvent(request.params?.eventId);

      await writeAuditLog({
        employee,
        action: "arc.event.delete",
        targetType: "arc_event",
        targetId: result.eventId,
        detail: {},
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  app.patch(
    "/api/arc/events/:eventId/tasks/:taskId",
    { preHandler: requireCare },
    async (request) =>
      toggleArcEventTask(
        request.params?.eventId,
        request.params?.taskId,
        readBody(request),
        currentEmployee(request) ?? {}
      )
  );

  app.post(
    "/api/arc/events/:eventId/tasks",
    { preHandler: requireCare },
    async (request) =>
      addArcEventTask(request.params?.eventId, readBody(request))
  );

  app.post(
    "/api/arc/events/:eventId/tasks/:taskId/delete",
    { preHandler: requireCare },
    async (request) =>
      deleteArcEventTask(request.params?.eventId, request.params?.taskId)
  );

  app.post(
    "/api/arc/events/:eventId/staff",
    { preHandler: requireCare },
    async (request) =>
      saveArcEventStaff(request.params?.eventId, readBody(request))
  );

  app.post(
    "/api/arc/events/:eventId/staff/:staffId/delete",
    { preHandler: requireCare },
    async (request) =>
      deleteArcEventStaff(request.params?.eventId, request.params?.staffId)
  );
}
