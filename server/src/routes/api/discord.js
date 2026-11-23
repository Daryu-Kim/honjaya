// P12 — Discord 관리봇 API.
//
// 봇 토큰(DISCORD_BOT_TOKEN)은 이 컨테이너에 없습니다. bot 컨테이너가 유일한 보관자이고,
// 여기서는 compose 내부 주소(bot:4100)로 요청을 넘기기만 합니다.
// 스냅샷 목록·상세는 DB 에서 바로 읽습니다(봇이 살아 있지 않아도 조회는 가능해야 하므로).
import { Readable } from "node:stream";

import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import { config } from "../../config.js";
import { pool } from "../../db.js";
import { HttpError } from "../../http/errors.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value, label) {
  const id = String(value || "").trim();

  if (!UUID_RE.test(id)) {
    throw new HttpError(400, "HJ400", `${label} 형식이 올바르지 않아요.`);
  }

  return id;
}

function readBody(request) {
  return request.body && typeof request.body === "object" ? request.body : {};
}

function clientIp(request) {
  return request.ip || "";
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

async function callBot({ method = "GET", path, body = null, log }) {
  if (!config.discord.internalToken) {
    throw new HttpError(
      503,
      "HJ503",
      "Discord 봇 내부 토큰(BOT_INTERNAL_TOKEN)이 설정되지 않았어요.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.discord.timeoutMs);
  const base = config.discord.botUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-internal-token": config.discord.internalToken,
      },
      body: body === null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text.slice(0, 500) };
      }
    }

    if (!response.ok) {
      log?.warn?.("bot responded with error", {
        path,
        status: response.status,
      });

      throw new HttpError(
        response.status >= 500 ? 502 : response.status,
        "HJ_BOT",
        payload?.message || "Discord 봇이 요청을 처리하지 못했어요.",
        payload?.error ?? null,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error?.name === "AbortError") {
      throw new HttpError(
        504,
        "HJ504",
        "Discord 봇 응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.",
      );
    }

    log?.error?.("bot call failed", { path, err: error });

    throw new HttpError(
      503,
      "HJ503",
      "Discord 봇에 연결할 수 없어요. 봇 컨테이너가 실행 중인지 확인해 주세요.",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 봇이 내려주는 암호화 백업 파일을 그대로 흘려보냅니다.
 * 본문은 복호화 키가 없으면 쓸모가 없으므로 api 는 내용을 검사하지 않고 통과시킵니다.
 */
async function callBotStream({ path, log }) {
  if (!config.discord.internalToken) {
    throw new HttpError(
      503,
      "HJ503",
      "Discord 봇 내부 토큰(BOT_INTERNAL_TOKEN)이 설정되지 않았어요.",
    );
  }

  // 헤더 수신까지만 제한합니다(다운로드 자체는 파일 크기만큼 걸릴 수 있음).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(config.discord.timeoutMs, 60_000));
  const base = config.discord.botUrl.replace(/\/+$/, "");

  let response;

  try {
    response = await fetch(`${base}${path}`, {
      headers: { "x-internal-token": config.discord.internalToken },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HttpError(504, "HJ504", "Discord 봇 응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.");
    }

    log?.error?.("bot stream call failed", { path, err: error });

    throw new HttpError(
      503,
      "HJ503",
      "Discord 봇에 연결할 수 없어요. 봇 컨테이너가 실행 중인지 확인해 주세요.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = "Discord 봇이 파일을 내려주지 못했어요.";

    if (text) {
      try {
        message = JSON.parse(text)?.message || message;
      } catch {
        message = text.slice(0, 200);
      }
    }

    throw new HttpError(response.status >= 500 ? 502 : response.status, "HJ_BOT", message);
  }

  if (!response.body) {
    throw new HttpError(502, "HJ_BOT", "Discord 봇이 빈 응답을 보냈어요.");
  }

  return {
    stream: Readable.fromWeb(response.body),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentLength: response.headers.get("content-length"),
    disposition: response.headers.get("content-disposition"),
  };
}

async function loadSettings() {
  const { rows } = await pool.query(
    `select id, backup_channel_id, announce_channel_id, log_channel_id, owner_discord_id,
            backup_cron, keep_daily, keep_weekly, keep_monthly, max_upload_mb,
            max_ops_per_run, next_backup_at, updated_at
       from public.discord_settings
      where id = 1`,
  );

  return rows[0] ?? null;
}

export function registerDiscordRoutes(app) {
  const requireView = createStaffGuard(PERMISSIONS.DISCORD_VIEW);
  const requireManage = createStaffGuard(PERMISSIONS.DISCORD_MANAGE);

  app.get("/api/discord/status", { preHandler: requireView }, async (request) => {
    const [bot, settings] = await Promise.all([
      callBot({ path: "/internal/status", log: request.log }).catch((error) => ({
        unavailable: true,
        message: error instanceof Error ? error.message : String(error),
      })),
      loadSettings(),
    ]);

    return { bot, settings };
  });

  app.get("/api/discord/snapshots", { preHandler: requireView }, async (request) => {
    const query = request.query || {};
    const limit = clampInt(query.limit, 20, 1, 100);
    const offset = clampInt(query.offset, 0, 0, 100_000);
    const guildId = String(query.guildId || "").trim();

    const params = [];
    const filters = [];

    if (guildId) {
      params.push(guildId);
      filters.push(`guild_id = $${params.length}`);
    }

    const where = filters.length > 0 ? `where ${filters.join(" and ")}` : "";

    const total = await pool.query(
      `select count(*)::int as count from public.discord_snapshots ${where}`,
      params,
    );

    params.push(limit, offset);

    const { rows } = await pool.query(
      `select id, guild_id, reason, structure_hash, channel_count, role_count,
              member_count, created_by, captured_at
         from public.discord_snapshots
         ${where}
        order by captured_at desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );

    return { total: total.rows[0]?.count ?? 0, limit, offset, snapshots: rows };
  });

  app.get(
    "/api/discord/snapshots/:snapshotId",
    { preHandler: requireView },
    async (request) => {
      const snapshotId = String(request.params?.snapshotId || "").trim();

      if (!/^[0-9a-f-]{36}$/i.test(snapshotId)) {
        throw new HttpError(400, "HJ400", "스냅샷 ID 형식이 올바르지 않아요.");
      }

      const { rows } = await pool.query(
        `select id, guild_id, reason, structure, structure_hash, channel_count,
                role_count, member_count, created_by, captured_at
           from public.discord_snapshots
          where id = $1`,
        [snapshotId],
      );

      if (rows.length === 0) {
        throw new HttpError(404, "HJ404", "스냅샷을 찾을 수 없어요.");
      }

      return { snapshot: rows[0] };
    },
  );

  app.post("/api/discord/snapshots", { preHandler: requireManage }, async (request) => {
    const employee = request.staff?.employee || null;
    const body = readBody(request);
    const reason = body.reason === "PRE_APPLY" ? "PRE_APPLY" : "MANUAL";

    const result = await callBot({
      method: "POST",
      path: "/internal/snapshots",
      body: { reason, createdBy: employee?.email || employee?.name || "api" },
      log: request.log,
    });

    await writeAuditLog({
      employee,
      action: "discord.snapshot.create",
      targetType: "discord_snapshot",
      targetId: result?.snapshot?.id ?? null,
      detail: {
        reason,
        roleCount: result?.snapshot?.roleCount ?? null,
        channelCount: result?.snapshot?.channelCount ?? null,
      },
      ip: clientIp(request),
      log: request.log,
    });

    return result;
  });

  // ── 백업(P12B) ────────────────────────────────────────────────────────────
  const BACKUP_COLUMNS = `r.id, r.kind, r.status, r.db_name, r.filename, r.size_bytes, r.sha256,
            r.key_id, r.encrypted, r.part_count, r.row_counts, r.app_version, r.app_commit,
            r.error, r.triggered_by, r.job_id, r.started_at, r.finished_at`;

  app.get("/api/discord/backups", { preHandler: requireView }, async (request) => {
    const query = request.query || {};
    const limit = clampInt(query.limit, 20, 1, 100);
    const offset = clampInt(query.offset, 0, 0, 100_000);

    const total = await pool.query(`select count(*)::int as count from public.backup_runs`);

    const { rows } = await pool.query(
      `select ${BACKUP_COLUMNS},
              (select count(*)::int from public.backup_files f
                where f.run_id = r.id and f.upload_status = 'UPLOADED') as uploaded_parts,
              (select count(*)::int from public.backup_files f where f.run_id = r.id) as part_rows,
              (select v.status from public.backup_restores v
                where v.run_id = r.id and v.mode = 'VERIFY'
                order by v.started_at desc limit 1) as last_verify_status,
              (select v.started_at from public.backup_restores v
                where v.run_id = r.id and v.mode = 'VERIFY'
                order by v.started_at desc limit 1) as last_verify_at
         from public.backup_runs r
        order by r.started_at desc
        limit $1 offset $2`,
      [limit, offset],
    );

    return { total: total.rows[0]?.count ?? 0, limit, offset, runs: rows };
  });

  app.get("/api/discord/backups/:runId", { preHandler: requireView }, async (request) => {
    const runId = assertUuid(request.params?.runId, "백업 ID");

    const { rows } = await pool.query(
      `select ${BACKUP_COLUMNS} from public.backup_runs r where r.id = $1`,
      [runId],
    );

    if (rows.length === 0) {
      throw new HttpError(404, "HJ404", "백업 실행을 찾을 수 없어요.");
    }

    const files = await pool.query(
      `select id, run_id, part_no, part_count, filename, size_bytes, sha256,
              discord_channel_id, discord_message_id, upload_status, uploaded_at, error
         from public.backup_files
        where run_id = $1
        order by part_no asc`,
      [runId],
    );

    const restores = await pool.query(
      `select id, mode, target_db, status, verification, error, triggered_by, started_at, finished_at
         from public.backup_restores
        where run_id = $1
        order by started_at desc
        limit 20`,
      [runId],
    );

    return { run: { ...rows[0], files: files.rows, restores: restores.rows } };
  });

  app.post("/api/discord/backups", { preHandler: requireManage }, async (request) => {
    const employee = request.staff?.employee || null;
    const actor = employee?.email || employee?.name || "api";

    const result = await callBot({
      method: "POST",
      path: "/internal/backups",
      body: { triggeredBy: actor },
      log: request.log,
    });

    await writeAuditLog({
      employee,
      action: "discord.backup.run",
      targetType: "backup_run",
      targetId: null,
      detail: { jobId: result?.jobId ?? null, deduped: result?.deduped ?? null },
      ip: clientIp(request),
      log: request.log,
    });

    return result;
  });

  app.post("/api/discord/backups/:runId/verify", { preHandler: requireManage }, async (request) => {
    const runId = assertUuid(request.params?.runId, "백업 ID");
    const employee = request.staff?.employee || null;
    const actor = employee?.email || employee?.name || "api";

    const result = await callBot({
      method: "POST",
      path: `/internal/backups/${runId}/verify`,
      body: { triggeredBy: actor },
      log: request.log,
    });

    await writeAuditLog({
      employee,
      action: "discord.backup.verify",
      targetType: "backup_run",
      targetId: runId,
      detail: { jobId: result?.jobId ?? null, deduped: result?.deduped ?? null },
      ip: clientIp(request),
      log: request.log,
    });

    return result;
  });

  app.post("/api/discord/backups/:runId/upload", { preHandler: requireManage }, async (request) => {
    const runId = assertUuid(request.params?.runId, "백업 ID");
    const employee = request.staff?.employee || null;
    const actor = employee?.email || employee?.name || "api";

    const result = await callBot({
      method: "POST",
      path: `/internal/backups/${runId}/upload`,
      body: { triggeredBy: actor },
      log: request.log,
    });

    await writeAuditLog({
      employee,
      action: "discord.backup.upload",
      targetType: "backup_run",
      targetId: runId,
      detail: { jobId: result?.jobId ?? null, deduped: result?.deduped ?? null },
      ip: clientIp(request),
      log: request.log,
    });

    return result;
  });

  app.get("/api/discord/backups/:runId/download", { preHandler: requireView }, async (request, reply) => {
    const runId = assertUuid(request.params?.runId, "백업 ID");
    const employee = request.staff?.employee || null;

    const file = await callBotStream({
      path: `/internal/backups/${runId}/download`,
      log: request.log,
    });

    await writeAuditLog({
      employee,
      action: "discord.backup.download",
      targetType: "backup_run",
      targetId: runId,
      detail: {},
      ip: clientIp(request),
      log: request.log,
    });

    reply.header("content-type", file.contentType);
    reply.header("cache-control", "no-store");
    reply.header(
      "content-disposition",
      file.disposition || `attachment; filename="backup-${runId}.dump.gz.enc"`,
    );

    if (file.contentLength) {
      reply.header("content-length", file.contentLength);
    }

    return reply.send(file.stream);
  });
}
