import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { basename } from "node:path";

import { config, configProblems } from "./config.js";

const MAX_BODY_BYTES = 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function httpError(status, message) {
  const error = new Error(message);

  error.status = status;

  return error;
}

/** "/internal/backups/:runId/verify" → 정규식 + 키 목록 */
function compile(pattern) {
  const segments = pattern.split("/").filter(Boolean);
  const keys = [];

  const source = segments
    .map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));

        return "([^/]+)";
      }

      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return { regex: new RegExp(`^/${source}/?$`), keys };
}

/**
 * api 컨테이너 전용 내부 API. compose 네트워크 안에서만 열리고 외부로 발행하지 않습니다.
 * BOT_INTERNAL_TOKEN 이 비어 있으면 인증이 필요한 모든 경로를 503 으로 막습니다(무인증 개방 방지).
 */
export function startInternalApi({ log, deps }) {
  const startedAt = Date.now();

  const definitions = [
    [
      "GET",
      "/internal/health",
      async () => ({
        status: 200,
        body: {
          ok: true,
          service: "honjaya-bot",
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          configured: deps.service.state.configured,
          ready: deps.service.state.ready,
        },
      }),
    ],

    [
      "GET",
      "/internal/status",
      async () => {
        const status = deps.service.describe();
        const depth = await deps.queue.depth();
        const { runs } = await deps.backups.listRuns({ limit: 1 });

        return {
          status: 200,
          body: {
            ...status,
            jobs: depth,
            problems: configProblems(),
            backupUploadLimitMb: config.backup.maxUploadMb,
            lastBackup: runs[0] ?? null,
          },
        };
      },
    ],

    [
      "GET",
      "/internal/structure",
      async () => ({ status: 200, body: { summary: await deps.service.getStructureSummary() } }),
    ],

    [
      "POST",
      "/internal/snapshots",
      async (req) => {
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
    ],

    // ── 백업(P12B) ──────────────────────────────────────────────────────────
    [
      "GET",
      "/internal/backups",
      async (req) => {
        const url = new URL(req.url ?? "/", "http://bot.local");
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
        const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

        return { status: 200, body: await deps.backups.listRuns({ limit, offset }) };
      },
    ],

    [
      "POST",
      "/internal/backups",
      async (req) => {
        const body = await readJsonBody(req);
        const actor = String(body?.triggeredBy ?? "api");
        const job = await deps.queue.enqueue({
          kind: "BACKUP",
          payload: { triggeredBy: actor },
          createdBy: actor,
          dedupe: true,
        });

        return { status: 202, body: { jobId: job.id, deduped: job.deduped } };
      },
    ],

    [
      "GET",
      "/internal/backups/:runId",
      async (_req, { params }) => {
        if (!UUID_RE.test(params.runId)) {
          throw httpError(400, "백업 ID 형식이 올바르지 않습니다.");
        }

        const run = await deps.backups.getRun(params.runId);

        if (!run) {
          throw httpError(404, "백업 실행을 찾을 수 없습니다.");
        }

        return { status: 200, body: { run } };
      },
    ],

    [
      "POST",
      "/internal/backups/:runId/verify",
      async (req, { params }) => {
        if (!UUID_RE.test(params.runId)) {
          throw httpError(400, "백업 ID 형식이 올바르지 않습니다.");
        }

        const body = await readJsonBody(req);
        const actor = String(body?.triggeredBy ?? "api");
        const job = await deps.queue.enqueue({
          kind: "BACKUP_VERIFY",
          payload: { runId: params.runId, triggeredBy: actor },
          maxAttempts: 2,
          createdBy: actor,
          dedupe: true,
        });

        return { status: 202, body: { jobId: job.id, deduped: job.deduped } };
      },
    ],

    [
      "POST",
      "/internal/backups/:runId/upload",
      async (req, { params }) => {
        if (!UUID_RE.test(params.runId)) {
          throw httpError(400, "백업 ID 형식이 올바르지 않습니다.");
        }

        const body = await readJsonBody(req);
        const actor = String(body?.triggeredBy ?? "api");
        const job = await deps.queue.enqueue({
          kind: "BACKUP_UPLOAD",
          payload: { runId: params.runId, triggeredBy: actor },
          maxAttempts: 5,
          createdBy: actor,
          dedupe: true,
        });

        return { status: 202, body: { jobId: job.id, deduped: job.deduped } };
      },
    ],

    [
      "GET",
      "/internal/backups/:runId/download",
      async (_req, { params }) => {
        if (!UUID_RE.test(params.runId)) {
          throw httpError(400, "백업 ID 형식이 올바르지 않습니다.");
        }

        const run = await deps.backups.getRun(params.runId);

        if (!run) {
          throw httpError(404, "백업 실행을 찾을 수 없습니다.");
        }

        const path = String(run.local_path || "");

        if (!path) {
          throw httpError(404, "로컬 백업 파일 경로가 기록되어 있지 않습니다.");
        }

        const info = await stat(path).catch(() => null);

        if (!info) {
          throw httpError(404, "로컬 백업 파일이 없습니다(보관 정책으로 삭제되었을 수 있습니다).");
        }

        return {
          status: 200,
          stream: { path, filename: basename(run.filename || path), sizeBytes: info.size },
        };
      },
    ],
  ];

  const routes = definitions.map(([method, pattern, handler]) => ({
    method,
    handler,
    ...compile(pattern),
    path: pattern,
  }));

  const PUBLIC = new Set(["GET /internal/health"]);

  function matchRoute(method, pathname) {
    for (const route of routes) {
      if (route.method !== method) {
        continue;
      }

      const result = route.regex.exec(pathname);

      if (!result) {
        continue;
      }

      const params = {};

      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(result[index + 1]);
      });

      return { route, params, key: `${route.method} ${route.path}` };
    }

    return null;
  }

  function sendStream(res, stream) {
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": stream.sizeBytes,
      "content-disposition": `attachment; filename="${String(stream.filename).replace(/[^\w.\-]/g, "_")}"`,
      "cache-control": "no-store",
    });

    createReadStream(stream.path)
      .on("error", () => res.destroy())
      .pipe(res);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://bot.local");
    const found = matchRoute(req.method, url.pathname);

    if (!found) {
      sendJson(res, 404, { error: "not_found" });

      return;
    }

    if (!PUBLIC.has(found.key)) {
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
      const result = await found.route.handler(req, { params: found.params });

      if (result?.stream) {
        sendStream(res, result.stream);

        return;
      }

      sendJson(res, result.status, result.body);
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
