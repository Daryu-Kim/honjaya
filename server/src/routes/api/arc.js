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
  const requireCare = createStaffGuard(PERMISSIONS.ARC_CARE);
  const requireSensitive = createStaffGuard(PERMISSIONS.ARC_SENSITIVE);
  const requireApprove = createStaffGuard(PERMISSIONS.ARC_APPROVE);
  const requireAdmin = createStaffGuard(PERMISSIONS.ARC_ADMIN);

  // ── 현황 ───────────────────────────────────────────────────────────

  app.get("/api/arc/health", { preHandler: requireView }, async () => ({
    status: arcHealth(),
  }));

  app.get("/api/arc/dashboard", { preHandler: requireView }, async (request) => ({
    summary: await arcDashboardSummary(currentEmployee(request)?.id ?? null),
  }));

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
}
