import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { config, configProblems } from "./config.js";

const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body ?? null);

  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        const error = new Error("요청 본문이 너무 큽니다.");

        error.status = 413;
        reject(error);
        req.destroy();

        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});

        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        const error = new Error("JSON 본문을 해석할 수 없습니다.");

        error.status = 400;
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function tokenMatches(headerValue) {
  if (!config.internalToken) {
    return false;
  }

  const given = Buffer.from(String(headerValue ?? ""), "utf8");
  const expected = Buffer.from(config.internalToken, "utf8");

  if (given.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(given, expected);
}

/**
 * api 컨테이너 전용 내부 API. compose 네트워크 안에서만 열리고 외부로 발행하지 않습니다.
 * BOT_INTERNAL_TOKEN 이 비어 있으면 인증이 필요한 모든 경로를 503 으로 막습니다(무인증 개방 방지).
 */
export function startInternalApi({ log, deps }) {
  const startedAt = Date.now();

  const routes = {
    "GET /internal/health": async () => ({
      status: 200,
      body: {
        ok: true,
        service: "honjaya-bot",
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        configured: deps.service.state.configured,
        ready: deps.service.state.ready,
      },
    }),

    "GET /internal/status": async () => {
      const status = deps.service.describe();
      const depth = await deps.queue.depth();

      return {
        status: 200,
        body: {
          ...status,
          jobs: depth,
          problems: configProblems(),
          backupUploadLimitMb: config.backup.maxUploadMb,
        },
      };
    },

    "GET /internal/structure": async () => {
      const summary = await deps.service.getStructureSummary();

      return { status: 200, body: { summary } };
    },

    "POST /internal/snapshots": async (req) => {
      const body = await readJsonBody(req);
      const guild = await deps.service.requireGuild();
      const { snapshot, summary } = await deps.captureSnapshot({
        pool: deps.pool,
        guild,
        reason: body?.reason === "PRE_APPLY" ? "PRE_APPLY" : "MANUAL",
        createdBy: String(body?.createdBy ?? "api"),
        log,
      });

      return {
        status: 201,
        body: {
          snapshot: {
            id: snapshot.id,
            guildId: snapshot.guild_id,
            reason: snapshot.reason,
            structureHash: snapshot.structure_hash,
            roleCount: snapshot.role_count,
            channelCount: snapshot.channel_count,
            capturedAt: snapshot.captured_at,
          },
          summary,
        },
      };
    },
  };

  const publicRoute = new Set(["GET /internal/health"]);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://bot.local");
    const key = `${req.method} ${url.pathname}`;
    const route = routes[key];

    if (!route) {
      sendJson(res, 404, { error: "not_found" });

      return;
    }

    if (!publicRoute.has(key)) {
      if (!config.internalToken) {
        sendJson(res, 503, { error: "internal_token_missing" });

        return;
      }

      if (!tokenMatches(req.headers["x-internal-token"])) {
        log.warn("internal api unauthorized", { path: url.pathname, method: req.method });
        sendJson(res, 401, { error: "unauthorized" });

        return;
      }
    }

    try {
      const { status, body } = await route(req, res);

      sendJson(res, status, body);
    } catch (error) {
      const status = Number(error?.status) || 500;

      if (status >= 500) {
        log.error("internal api error", { path: url.pathname, err: error });
      }

      sendJson(res, status, {
        error: status >= 500 ? "internal_error" : "bad_request",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.listen(config.port, config.host, () => {
    log.info("internal api listening", { host: config.host, port: config.port });
  });

  return {
    server,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      log.info("internal api stopped");
    },
  };
}
