import compress from "@fastify/compress";
import cors from "@fastify/cors";
import Fastify from "fastify";

import { config } from "./config.js";
import { HttpError, PG_MESSAGES, PG_STATUS } from "./http/errors.js";
import { registerAdminRoutes } from "./routes/api/admin.js";
import { registerGuestRoutes } from "./routes/api/guest.js";
import { registerKakaoRoutes } from "./routes/api/kakao.js";
import { registerPaymentRoutes } from "./routes/api/payments.js";
import { registerPointRoutes } from "./routes/api/points.js";
import { registerStaffAuthRoutes } from "./routes/api/staffAuth.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerRestRoutes } from "./routes/rest.js";
import { registerRpcRoutes } from "./routes/rpc.js";

function readApiKey(request, options = {}) {
  const apikey = request.headers.apikey;

  if (typeof apikey === "string" && apikey.trim()) {
    return apikey.trim();
  }

  const authorization = String(request.headers.authorization || "");

  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  // 브라우저 EventSource 는 헤더를 지정할 수 없어서 SSE(/api/events) 만
  // 쿼리 파라미터 키를 허용합니다. (anon key 는 원래 공개되는 값입니다.)
  // REST 경로는 쿼리 파라미터가 곧 컬럼 필터라서 여기서 읽으면 400 이 납니다.
  if (options.allowQueryKey) {
    try {
      const queryKey = new URL(request.url, "http://localhost").searchParams.get(
        "apikey"
      );

      if (queryKey && queryKey.trim()) {
        return queryKey.trim();
      }
    } catch {
      // query 파싱 실패는 키 없음으로 처리합니다.
    }
  }

  return "";
}

function createApiKeyGuard() {
  const allowed = [config.anonKey, config.serviceKey].filter(Boolean);

  // 키를 설정하지 않으면 인증을 끕니다(로컬 개발용).
  if (allowed.length === 0) {
    return async () => {};
  }

  return async (request, options) => {
    const key = readApiKey(request, options);

    if (!allowed.includes(key)) {
      throw new HttpError(401, "PGRST301", "유효하지 않은 API 키예요");
    }
  };
}

export async function buildApp(options = {}) {
  const app = Fastify({
    logger: options.logger ?? { level: config.logLevel },
    bodyLimit: 8 * 1024 * 1024,
    trustProxy: true,
  });

  // postgrest-js 는 본문이 없는 DELETE 에도 content-type: application/json 을 붙입니다.
  // Fastify 기본 JSON 파서는 빈 본문을 400(FST_ERR_CTP_EMPTY_JSON_BODY)으로 거부하므로
  // 빈 본문은 통과시키는 파서로 교체합니다. (실제 PostgREST 도 허용합니다.)
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      if (typeof body !== "string" || !body.trim()) {
        done(null, undefined);
        return;
      }

      try {
        done(null, JSON.parse(body));
      } catch {
        done(
          new HttpError(400, "PGRST102", "요청 본문이 올바른 JSON 이 아니에요"),
          undefined
        );
      }
    }
  );

  // 폴링 구조라 같은 JSON 을 계속 내려줍니다. 압축만 켜도 전송량이 6~10배 줄어듭니다.
  await app.register(compress, { threshold: 1024 });

  await app.register(cors, {
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    // 직원 로그인 쿠키(/api/staff, /api/admin)를 프런트 오리진에서도 쓸 수 있게 합니다.
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    // supabase-js 2.116+ 는 db.schema 기본값(public)을 Accept-Profile / Content-Profile
    // 헤더로 항상 보냅니다. upsert 는 X-Upsert 를 씁니다. 목록에 없으면 브라우저
    // preflight 가 막혀서 모든 요청이 실패합니다.
    allowedHeaders: [
      "accept",
      "accept-profile",
      "apikey",
      "authorization",
      "content-profile",
      "content-type",
      "prefer",
      "range",
      "range-unit",
      "x-client-info",
      "x-supabase-api-version",
      "x-upsert",
    ],
    exposedHeaders: ["content-range", "content-location"],
  });

  const guard = createApiKeyGuard();

  app.addHook("onRequest", async (request) => {
    if (request.method === "OPTIONS") {
      return;
    }

    const path = request.url.split("?")[0];

    // 배포 확인·모니터링용. 데이터를 노출하지 않으므로 키 없이 열어 둡니다.
    if (path === "/health") {
      return;
    }

    await guard(request, { allowQueryKey: path === "/api/events" });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send(error.toBody());
    }

    // Postgres 에러(error.severity 가 있는 경우)를 적절한 HTTP 상태로 변환합니다.
    if (typeof error.code === "string" && error.severity) {
      const status = PG_STATUS[error.code] || 400;

      if (status >= 500) {
        request.log.error(error);
      }

      return reply.code(status).send({
        code: error.code,
        details: error.detail ?? error.message ?? null,
        hint: error.hint ?? null,
        message: PG_MESSAGES[error.code] || error.message,
      });
    }

    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    if (status >= 500) {
      request.log.error(error);
    }

    return reply.code(status).send({
      code: error.code || "INTERNAL_ERROR",
      details: null,
      hint: null,
      message: error.message || "서버 오류가 발생했어요",
    });
  });

  app.get("/", async () => ({
    name: "honjaya-server",
    version: "0.1.0",
    endpoints: [
      "/rest/v1/:table",
      "/api/events",
      "/api/rpc/reserve-sequence",
      "/api/guest/session",
      "/api/staff/login",
      "/api/admin/employees",
      "/api/payments",
      "/api/points",
      "/api/kakao/status",
      "/health",
    ],
  }));

  registerRestRoutes(app);
  registerRpcRoutes(app);
  registerEventRoutes(app, app.log);
  registerGuestRoutes(app);
  registerStaffAuthRoutes(app);
  registerAdminRoutes(app);
  registerPaymentRoutes(app);
  registerPointRoutes(app);
  registerKakaoRoutes(app);

  return app;
}
