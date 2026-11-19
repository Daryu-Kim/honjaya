import compress from "@fastify/compress";
import cors from "@fastify/cors";
import Fastify from "fastify";

import { config } from "./config.js";
import { HttpError, PG_STATUS } from "./http/errors.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerRestRoutes } from "./routes/rest.js";
import { registerRpcRoutes } from "./routes/rpc.js";

function readApiKey(request) {
  const apikey = request.headers.apikey;

  if (typeof apikey === "string" && apikey.trim()) {
    return apikey.trim();
  }

  const authorization = String(request.headers.authorization || "");

  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return "";
}

function createApiKeyGuard() {
  const allowed = [config.anonKey, config.serviceKey].filter(Boolean);

  // 키를 설정하지 않으면 인증을 끕니다(로컬 개발용).
  if (allowed.length === 0) {
    return async () => {};
  }

  return async (request) => {
    const key = readApiKey(request);

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

  // 폴링 구조라 같은 JSON 을 계속 내려줍니다. 압축만 켜도 전송량이 6~10배 줄어듭니다.
  await app.register(compress, { threshold: 1024 });

  await app.register(cors, {
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "accept",
      "apikey",
      "authorization",
      "content-type",
      "prefer",
      "range",
      "range-unit",
      "x-client-info",
    ],
    exposedHeaders: ["content-range", "content-location"],
  });

  const guard = createApiKeyGuard();

  app.addHook("onRequest", async (request) => {
    if (request.method === "OPTIONS") {
      return;
    }

    await guard(request);
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
        details: error.detail ?? null,
        hint: error.hint ?? null,
        message: error.message,
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
    endpoints: ["/rest/v1/:table", "/api/events", "/api/rpc/reserve-sequence", "/health"],
  }));

  registerRestRoutes(app);
  registerRpcRoutes(app);
  registerEventRoutes(app, app.log);

  return app;
}
