// P7 — 마케팅(문자/알림톡) API.
//
// 수신거부 안내 링크는 손님이 로그인 없이 누르는 화면이라 직원 세션을 요구하지 않습니다.
// (전역 apikey 검사는 그대로 적용됩니다.)
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import {
  createCampaign,
  exportAudienceCsv,
  getCampaign,
  getMarketingSettings,
  getSegmentCounts,
  getUnsubscribeInfo,
  listCampaigns,
  previewAudience,
  retryCampaign,
  sendCampaign,
  unsubscribeByToken,
} from "../../marketing.js";

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

export function registerMarketingRoutes(app) {
  const requireView = createStaffGuard(PERMISSIONS.MARKETING_VIEW);
  const requireManage = createStaffGuard(PERMISSIONS.MARKETING_MANAGE);

  app.get("/api/marketing/settings", { preHandler: requireView }, async () =>
    getMarketingSettings()
  );

  app.get("/api/marketing/segments", { preHandler: requireView }, async () => ({
    segments: await getSegmentCounts(),
  }));

  app.get("/api/marketing/audience", { preHandler: requireView }, async (request) =>
    previewAudience({ segment: request.query?.segment })
  );

  app.get(
    "/api/marketing/audience/export",
    { preHandler: requireView },
    async (request, reply) => {
      const segment = request.query?.segment || "CONSENTED";
      const csv = await exportAudienceCsv({ segment });
      const stamp = new Date().toISOString().slice(0, 10);

      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="honjaya-audience-${stamp}.csv"`
        )
        .send(csv);
    }
  );

  app.get("/api/marketing/campaigns", { preHandler: requireView }, async (request) =>
    listCampaigns({
      limit: request.query?.limit,
      offset: request.query?.offset,
    })
  );

  app.get(
    "/api/marketing/campaigns/:campaignId",
    { preHandler: requireView },
    async (request) =>
      getCampaign({
        campaignId: request.params?.campaignId,
        logLimit: request.query?.logLimit,
      })
  );

  app.post(
    "/api/marketing/campaigns",
    { preHandler: requireManage },
    async (request, reply) => {
      const body = readBody(request);
      const campaign = await createCampaign({
        title: body.title,
        body: body.body,
        channel: body.channel,
        segment: body.segment,
        employee: request.staff?.employee || null,
      });

      return reply.code(201).send(campaign);
    }
  );

  // 실제 발송은 되돌릴 수 없으므로 권한(OWNER) + 화면 확인을 함께 요구합니다.
  app.post(
    "/api/marketing/campaigns/:campaignId/send",
    { preHandler: requireManage },
    async (request) => {
      const result = await sendCampaign({
        campaignId: request.params?.campaignId,
        employee: request.staff?.employee || null,
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  app.post(
    "/api/marketing/campaigns/:campaignId/retry",
    { preHandler: requireManage },
    async (request) => {
      const result = await retryCampaign({
        campaignId: request.params?.campaignId,
        employee: request.staff?.employee || null,
        ip: clientIp(request),
        log: request.log,
      });

      return result;
    }
  );

  // ---- 손님용 수신거부(로그인 없음)

  app.get("/api/marketing/unsubscribe", async (request) =>
    getUnsubscribeInfo({ token: request.query?.token })
  );

  app.post("/api/marketing/unsubscribe", async (request) =>
    unsubscribeByToken({ token: readBody(request).token })
  );
}
