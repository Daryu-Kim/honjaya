// P12 — Discord 관리봇 API.
//
// 봇 토큰(DISCORD_BOT_TOKEN)은 이 컨테이너에 없습니다. bot 컨테이너가 유일한 보관자이고,
// 여기서는 compose 내부 주소(bot:4100)로 요청을 넘기기만 합니다.
// 스냅샷 목록·상세는 DB 에서 바로 읽습니다(봇이 살아 있지 않아도 조회는 가능해야 하므로).
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import { pool } from "../../db.js";
import { callBot, callBotStream } from "../../discordBot.js";
import { diffStructures } from "../../discordDiff.js";
import {
  buildPlan,
  clearDraft,
  executeApply,
  listRuns,
  loadDraft,
  loadRun,
  markStaleRuns,
  readPermissionCatalog,
  rollbackRun,
  saveDraft,
} from "../../discordRunner.js";
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
  // 백업 실행/검증/내려받기는 plan.md §3-13 기준 discord.backup 입니다(현재 OWNER 전용).
  const requireBackup = createStaffGuard(PERMISSIONS.DISCORD_BACKUP);

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

  app.post("/api/discord/backups", { preHandler: requireBackup }, async (request) => {
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

  app.post("/api/discord/backups/:runId/verify", { preHandler: requireBackup }, async (request) => {
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

  app.post("/api/discord/backups/:runId/upload", { preHandler: requireBackup }, async (request) => {
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

  app.get("/api/discord/backups/:runId/download", { preHandler: requireBackup }, async (request, reply) => {
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

  // ── 읽기 전용 대시보드(P12C) ──────────────────────────────────────────────
  app.get("/api/discord/guild", { preHandler: requireView }, async (request) => {
    const guild = await callBot({ path: "/internal/guild", log: request.log });

    return guild;
  });

  app.get("/api/discord/members", { preHandler: requireView }, async (request) => {
    const query = request.query || {};
    const params = new URLSearchParams();

    params.set("limit", String(clampInt(query.limit, 50, 1, 100)));

    for (const key of ["query", "roleId", "after"]) {
      const value = String(query[key] ?? "").trim();

      if (value) {
        params.set(key, value.slice(0, 100));
      }
    }

    return callBot({ path: `/internal/members?${params.toString()}`, log: request.log });
  });

  app.get("/api/discord/audit-logs", { preHandler: requireView }, async (request) => {
    const query = request.query || {};
    const params = new URLSearchParams();

    params.set("limit", String(clampInt(query.limit, 40, 1, 100)));

    const before = String(query.before ?? "").trim();

    if (before) {
      params.set("before", before);
    }

    return callBot({ path: `/internal/audit-logs?${params.toString()}`, log: request.log });
  });

  app.get(
    "/api/discord/snapshots/:snapshotId/diff",
    { preHandler: requireView },
    async (request) => {
      const snapshotId = assertUuid(request.params?.snapshotId, "스냅샷 ID");
      const againstParam = String(request.query?.against ?? "").trim();

      const target = await pool.query(
        `select id, reason, structure, structure_hash, captured_at
           from public.discord_snapshots
          where id = $1`,
        [snapshotId],
      );

      if (target.rows.length === 0) {
        throw new HttpError(404, "HJ404", "스냅샷을 찾을 수 없어요.");
      }

      const targetRow = target.rows[0];

      // 기준 스냅샷을 지정하지 않으면 "이 스냅샷 바로 이전"과 비교합니다.
      const base = againstParam
        ? await pool.query(
            `select id, reason, structure, structure_hash, captured_at
               from public.discord_snapshots
              where id = $1`,
            [assertUuid(againstParam, "비교 스냅샷 ID")],
          )
        : await pool.query(
            `select id, reason, structure, structure_hash, captured_at
               from public.discord_snapshots
              where captured_at < $1
              order by captured_at desc
              limit 1`,
            [targetRow.captured_at],
          );

      if (base.rows.length === 0) {
        throw new HttpError(
          404,
          "HJ404",
          "비교할 이전 스냅샷이 없어요. 스냅샷을 한 번 더 찍은 뒤 비교해 주세요.",
        );
      }

      const baseRow = base.rows[0];

      return {
        base: {
          id: baseRow.id,
          reason: baseRow.reason,
          structureHash: baseRow.structure_hash,
          capturedAt: baseRow.captured_at,
        },
        target: {
          id: targetRow.id,
          reason: targetRow.reason,
          structureHash: targetRow.structure_hash,
          capturedAt: targetRow.captured_at,
        },
        diff: diffStructures(baseRow.structure, targetRow.structure),
      };
    },
  );

  // ── 라이브 편집(P12D) ────────────────────────────────────────────────────
  const requireMember = createStaffGuard(PERMISSIONS.DISCORD_MEMBER);
  const SNOWFLAKE_RE = /^\d{15,25}$/;

  function assertSnowflake(value, label) {
    const id = String(value || "").trim();

    if (!SNOWFLAKE_RE.test(id)) {
      throw new HttpError(400, "HJ400", `${label} 형식이 올바르지 않아요.`);
    }

    return id;
  }

  /** 봇이 discord_mod_actions 에 기록할 요청자 정보. */
  function actorPayload(request) {
    const employee = request.staff?.employee || null;

    return {
      actorEmployeeId: employee?.id ?? null,
      actorName: String(employee?.name || employee?.email || "").slice(0, 100),
    };
  }

  function reasonText(value) {
    return String(value ?? "").trim().slice(0, 512);
  }

  function auditAction(request, action, targetType, targetId, detail) {
    return writeAuditLog({
      employee: request.staff?.employee || null,
      action,
      targetType,
      targetId,
      detail,
      ip: clientIp(request),
      log: request.log,
    });
  }

  app.get("/api/discord/members/:userId/history", { preHandler: requireView }, async (request) => {
    const userId = assertSnowflake(request.params?.userId, "멤버 ID");
    const limit = clampInt(request.query?.limit, 30, 1, 100);

    const { rows } = await pool.query(
      `select id, guild_id, target_user_id, target_user_name, action, reason, detail,
              expires_at, actor_employee_id, actor_name, created_at
         from public.discord_mod_actions
        where target_user_id = $1
        order by created_at desc
        limit $2`,
      [userId, limit],
    );

    return {
      userId,
      entries: rows.map((row) => ({
        id: row.id,
        guildId: row.guild_id,
        targetUserId: row.target_user_id,
        targetUserName: row.target_user_name,
        action: row.action,
        reason: row.reason,
        detail: row.detail,
        expiresAt: row.expires_at,
        actorEmployeeId: row.actor_employee_id,
        actorName: row.actor_name,
        createdAt: row.created_at,
      })),
    };
  });

  app.patch("/api/discord/members/:userId", { preHandler: requireMember }, async (request) => {
    const userId = assertSnowflake(request.params?.userId, "멤버 ID");
    const body = readBody(request);
    const reason = reasonText(body.reason);
    const roleIds = Array.isArray(body.roleIds)
      ? body.roleIds.map((value) => assertSnowflake(value, "역할 ID"))
      : null;

    const result = await callBot({
      method: "PATCH",
      path: `/internal/members/${userId}`,
      body: {
        nickname: typeof body.nickname === "string" ? body.nickname : undefined,
        roleIds,
        reason,
        targetUserName: String(body.targetUserName ?? "").slice(0, 200),
        ...actorPayload(request),
      },
      log: request.log,
    });

    await auditAction(request, "discord.member.update", "discord_member", userId, {
      reason,
      nickname: result?.changes?.nickname ?? null,
      roles: result?.changes?.roles ?? null,
    });

    return result;
  });

  app.post("/api/discord/members/:userId/timeout", { preHandler: requireMember }, async (request) => {
    const userId = assertSnowflake(request.params?.userId, "멤버 ID");
    const body = readBody(request);
    const minutes = clampInt(body.minutes, 0, 1, 40320);
    const reason = reasonText(body.reason);

    if (minutes < 1) {
      throw new HttpError(400, "HJ400", "타임아웃 시간(분)을 입력해 주세요.");
    }

    if (!reason) {
      throw new HttpError(400, "HJ400", "타임아웃 사유를 입력해 주세요.");
    }

    const result = await callBot({
      method: "POST",
      path: `/internal/members/${userId}/timeout`,
      body: {
        minutes,
        reason,
        targetUserName: String(body.targetUserName ?? "").slice(0, 200),
        ...actorPayload(request),
      },
      log: request.log,
    });

    await auditAction(request, "discord.member.timeout", "discord_member", userId, {
      minutes,
      reason,
      expiresAt: result?.expiresAt ?? null,
    });

    return result;
  });

  app.delete("/api/discord/members/:userId/timeout", { preHandler: requireMember }, async (request) => {
    const userId = assertSnowflake(request.params?.userId, "멤버 ID");
    const body = readBody(request);
    const reason = reasonText(body.reason);

    const result = await callBot({
      method: "DELETE",
      path: `/internal/members/${userId}/timeout`,
      body: {
        reason,
        targetUserName: String(body.targetUserName ?? "").slice(0, 200),
        ...actorPayload(request),
      },
      log: request.log,
    });

    await auditAction(request, "discord.member.timeout.clear", "discord_member", userId, { reason });

    return result;
  });

  app.post("/api/discord/members/:userId/kick", { preHandler: requireManage }, async (request) => {
    const userId = assertSnowflake(request.params?.userId, "멤버 ID");
    const body = readBody(request);
    const reason = reasonText(body.reason);

    const result = await callBot({
      method: "POST",
      path: `/internal/members/${userId}/kick`,
      body: {
        reason,
        confirmName: String(body.confirmName ?? ""),
        targetUserName: String(body.targetUserName ?? "").slice(0, 200),
        ...actorPayload(request),
      },
      log: request.log,
    });

    await auditAction(request, "discord.member.kick", "discord_member", userId, { reason });

    return result;
  });

  app.post("/api/discord/members/:userId/ban", { preHandler: requireManage }, async (request) => {
    const userId = assertSnowflake(request.params?.userId, "멤버 ID");
    const body = readBody(request);
    const reason = reasonText(body.reason);

    const result = await callBot({
      method: "POST",
      path: `/internal/members/${userId}/ban`,
      body: {
        reason,
        deleteMessageSeconds: clampInt(body.deleteMessageSeconds, 0, 0, 604800),
        confirmName: String(body.confirmName ?? ""),
        targetUserName: String(body.targetUserName ?? "").slice(0, 200),
        ...actorPayload(request),
      },
      log: request.log,
    });

    await auditAction(request, "discord.member.ban", "discord_member", userId, {
      reason,
      deleteMessageSeconds: result?.deleteMessageSeconds ?? null,
    });

    return result;
  });

  app.delete("/api/discord/members/:userId/ban", { preHandler: requireManage }, async (request) => {
    const userId = assertSnowflake(request.params?.userId, "멤버 ID");
    const body = readBody(request);
    const reason = reasonText(body.reason);

    const result = await callBot({
      method: "DELETE",
      path: `/internal/members/${userId}/ban`,
      body: {
        reason,
        targetUserName: String(body.targetUserName ?? "").slice(0, 200),
        ...actorPayload(request),
      },
      log: request.log,
    });

    await auditAction(request, "discord.member.unban", "discord_member", userId, { reason });

    return result;
  });

  app.post("/api/discord/members/:userId/voice", { preHandler: requireManage }, async (request) => {
    const userId = assertSnowflake(request.params?.userId, "멤버 ID");
    const body = readBody(request);

    const result = await callBot({
      method: "POST",
      path: `/internal/members/${userId}/voice`,
      body: {
        channelId: body.channelId ? assertSnowflake(body.channelId, "음성 채널 ID") : null,
        ...actorPayload(request),
      },
      log: request.log,
    });

    await auditAction(request, "discord.member.voice", "discord_member", userId, {
      fromChannelId: result?.fromChannelId ?? null,
      toChannelId: result?.toChannelId ?? null,
      action: result?.action ?? null,
    });

    return result;
  });

  app.get("/api/discord/messages", { preHandler: requireView }, async (request) => {
    const limit = clampInt(request.query?.limit, 20, 1, 50);

    const { rows } = await pool.query(
      `select id, channel_id, message_id, kind, embed, created_by, created_at, deleted_at
         from public.discord_messages
        order by created_at desc
        limit $1`,
      [limit],
    );

    return {
      entries: rows.map((row) => ({
        id: row.id,
        channelId: row.channel_id,
        messageId: row.message_id,
        kind: row.kind,
        embed: row.embed,
        createdBy: row.created_by,
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
      })),
    };
  });

  app.post("/api/discord/messages", { preHandler: requireManage }, async (request) => {
    const body = readBody(request);
    const employee = request.staff?.employee || null;

    const result = await callBot({
      method: "POST",
      path: "/internal/messages",
      body: {
        channelId: assertSnowflake(body.channelId, "채널 ID"),
        title: String(body.title ?? "").slice(0, 256),
        body: String(body.body ?? "").slice(0, 4000),
        content: String(body.content ?? "").slice(0, 2000),
        pingEveryone: Boolean(body.pingEveryone),
        createdBy: String(employee?.name || employee?.email || "api").slice(0, 100),
      },
      log: request.log,
    });

    await auditAction(request, "discord.message.send", "discord_message", result?.record?.id ?? null, {
      channelId: result?.channel?.id ?? null,
      messageId: result?.messageId ?? null,
      kind: result?.kind ?? null,
      pingEveryone: Boolean(body.pingEveryone),
    });

    return result;
  });

  app.delete("/api/discord/messages/:messageId", { preHandler: requireManage }, async (request) => {
    const messageId = assertSnowflake(request.params?.messageId, "메시지 ID");
    const body = readBody(request);
    const reason = reasonText(body.reason);

    const result = await callBot({
      method: "DELETE",
      path: `/internal/messages/${messageId}`,
      body: {
        channelId: assertSnowflake(body.channelId, "채널 ID"),
        recordId: body.recordId ? assertUuid(body.recordId, "기록 ID") : null,
        reason,
      },
      log: request.log,
    });

    await auditAction(request, "discord.message.delete", "discord_message", null, {
      channelId: result?.channelId ?? null,
      messageId,
      reason,
    });

    return result;
  });

  app.get("/api/discord/threads", { preHandler: requireView }, async (request) => {
    const params = new URLSearchParams();

    params.set("limit", String(clampInt(request.query?.limit, 25, 1, 100)));

    const channelId = String(request.query?.channelId ?? "").trim();

    if (channelId) {
      params.set("channelId", assertSnowflake(channelId, "채널 ID"));
    }

    return callBot({ path: `/internal/threads?${params.toString()}`, log: request.log });
  });

  app.post("/api/discord/threads", { preHandler: requireManage }, async (request) => {
    const body = readBody(request);

    const result = await callBot({
      method: "POST",
      path: "/internal/threads",
      body: {
        channelId: assertSnowflake(body.channelId, "채널 ID"),
        name: String(body.name ?? "").slice(0, 100),
        messageId: body.messageId ? assertSnowflake(body.messageId, "메시지 ID") : null,
        archiveMinutes: clampInt(body.archiveMinutes, 1440, 60, 10080),
      },
      log: request.log,
    });

    await auditAction(request, "discord.thread.create", "discord_thread", result?.thread?.id ?? null, {
      channelId: result?.thread?.parentId ?? null,
      name: result?.thread?.name ?? null,
    });

    return result;
  });

  app.post(
    "/api/discord/threads/:threadId/archive",
    { preHandler: requireManage },
    async (request) => {
      const threadId = assertSnowflake(request.params?.threadId, "스레드 ID");

      const result = await callBot({
        method: "POST",
        path: `/internal/threads/${threadId}/archive`,
        body: { archived: readBody(request).archived !== false },
        log: request.log,
      });

      await auditAction(request, "discord.thread.archive", "discord_thread", threadId, {
        archived: result?.thread?.archived ?? null,
      });

      return result;
    },
  );

  app.get("/api/discord/invites", { preHandler: requireManage }, async (request) =>
    callBot({ path: "/internal/invites", log: request.log }),
  );

  app.post("/api/discord/invites", { preHandler: requireManage }, async (request) => {
    const body = readBody(request);

    const result = await callBot({
      method: "POST",
      path: "/internal/invites",
      body: {
        channelId: assertSnowflake(body.channelId, "채널 ID"),
        maxAgeSeconds: clampInt(body.maxAgeSeconds, 86400, 0, 604800),
        maxUses: clampInt(body.maxUses, 0, 0, 100),
        reason: reasonText(body.reason) || "혼자야 관리자 페이지",
      },
      log: request.log,
    });

    await auditAction(request, "discord.invite.create", "discord_invite", result?.invite?.code ?? null, {
      channelId: result?.invite?.channelId ?? null,
      maxAgeSeconds: result?.invite?.maxAge ?? null,
      maxUses: result?.invite?.maxUses ?? null,
    });

    return result;
  });

  app.delete("/api/discord/invites/:code", { preHandler: requireManage }, async (request) => {
    const code = String(request.params?.code ?? "").trim();

    if (!/^[A-Za-z0-9-]{2,32}$/.test(code)) {
      throw new HttpError(400, "HJ400", "초대 코드 형식이 올바르지 않아요.");
    }

    const result = await callBot({
      method: "DELETE",
      path: `/internal/invites/${encodeURIComponent(code)}`,
      body: { reason: reasonText(readBody(request).reason) || "혼자야 관리자 페이지" },
      log: request.log,
    });

    await auditAction(request, "discord.invite.delete", "discord_invite", code, {});

    return result;
  });

  // ── 구조 편집(P12E) ───────────────────────────────────────────────────────
  // 편집기는 실제 Discord 를 건드리지 않습니다. 초안(draft)을 저장하고
  // 미리보기로 op 목록을 확인한 뒤, 적용(apply)에서만 반영합니다.

  async function currentGuildId(log) {
    const status = await callBot({ path: "/internal/status", log });
    const id = String(status?.guild?.id ?? "").trim();

    if (!id) {
      throw new HttpError(503, "HJ503", "Discord 봇이 아직 서버에 연결되지 않았어요.");
    }

    return id;
  }

  app.get("/api/discord/structure", { preHandler: requireView }, async (request) => {
    const payload = await callBot({ path: "/internal/structure/full", log: request.log });
    const guildId = String(payload?.structure?.guild?.id ?? "").trim();
    const [permissions, draft] = await Promise.all([
      readPermissionCatalog({ log: request.log }).catch(() => []),
      guildId ? loadDraft(guildId) : Promise.resolve(null),
    ]);

    return {
      structure: payload?.structure ?? null,
      structureHash: payload?.structureHash ?? null,
      bot: payload?.bot ?? null,
      permissions,
      draft,
    };
  });

  app.get("/api/discord/draft", { preHandler: requireView }, async (request) => ({
    draft: await loadDraft(await currentGuildId(request.log)),
  }));

  async function saveDraftHandler(request) {
    const body = readBody(request);
    const employee = request.staff?.employee || null;

    if (!body.desired || typeof body.desired !== "object") {
      throw new HttpError(400, "HJ400", "저장할 초안(desired)이 없어요.");
    }

    const saved = await saveDraft({
      guildId: await currentGuildId(request.log),
      desired: body.desired,
      note: body.note,
      updatedBy: employee?.email || employee?.name || "staff",
    });

    await auditAction(request, "discord.draft.save", "discord_struct_doc", saved.id, {
      version: saved.version,
      roleCount: Array.isArray(body.desired.roles) ? body.desired.roles.length : null,
      channelCount: Array.isArray(body.desired.channels) ? body.desired.channels.length : null,
    });

    return { draft: saved };
  }

  app.put("/api/discord/draft", { preHandler: requireManage }, saveDraftHandler);
  app.post("/api/discord/draft", { preHandler: requireManage }, saveDraftHandler);

  app.delete("/api/discord/draft", { preHandler: requireManage }, async (request) => {
    const guildId = await currentGuildId(request.log);
    const deleted = await clearDraft(guildId);

    await auditAction(request, "discord.draft.clear", "discord_struct_doc", guildId, { deleted });

    return { deleted };
  });

  app.post("/api/discord/apply/preview", { preHandler: requireView }, async (request) => {
    const body = readBody(request);
    let desired = body.desired ?? null;

    if (!desired) {
      const draft = await loadDraft(await currentGuildId(request.log));
      desired = draft?.desired ?? null;
    }

    if (!desired) {
      throw new HttpError(400, "HJ400", "미리 볼 초안이 없어요.");
    }

    const result = await buildPlan({ desired, log: request.log });

    return {
      guild: { id: result.guildId, name: result.guild?.name ?? null },
      ops: result.plan.ops,
      blocked: result.plan.blocked,
      warnings: result.plan.warnings,
      conflicts: result.plan.conflicts,
      requiresAdministratorConfirm: result.plan.requiresAdministratorConfirm,
      dangerousOverwrite: result.plan.dangerousOverwrite,
      requiresDeleteConfirm: result.plan.requiresDeleteConfirm,
      counts: result.plan.counts,
    };
  });

  app.post("/api/discord/apply", { preHandler: requireManage }, async (request) => {
    const body = readBody(request);
    const employee = request.staff?.employee || null;
    const draft = await loadDraft(await currentGuildId(request.log));
    const desired = body.desired ?? draft?.desired ?? null;

    if (!desired) {
      throw new HttpError(400, "HJ400", "적용할 초안이 없어요.");
    }

    const result = await executeApply({
      desired,
      docVersion: draft?.version ?? null,
      createdBy: employee?.email || employee?.name || "staff",
      confirmName: body.confirmName,
      allowAdministrator: body.allowAdministrator === true,
      allowDangerous: body.allowDangerous === true,
      allowDeletes: body.allowDeletes === true,
      log: request.log,
    });

    await auditAction(request, "discord.apply", "discord_apply_run", result.runId, {
      status: result.status,
      ok: result.ok,
      failed: result.failed,
      summary: result.summary,
      error: result.error,
    });

    return result;
  });

  app.post("/api/discord/apply/:runId/rollback", { preHandler: requireManage }, async (request) => {
    const runId = assertUuid(request.params?.runId, "실행 ID");
    const body = readBody(request);
    const employee = request.staff?.employee || null;

    const result = await rollbackRun({
      runId,
      createdBy: employee?.email || employee?.name || "staff",
      confirmName: body.confirmName,
      log: request.log,
    });

    await auditAction(request, "discord.apply.rollback", "discord_apply_run", result.runId, {
      rollbackOf: runId,
      status: result.status,
      ok: result.ok,
      failed: result.failed,
      total: result.total,
    });

    return result;
  });

  app.get("/api/discord/apply/runs", { preHandler: requireView }, async (request) => {
    await markStaleRuns(request.log).catch(() => 0);

    return listRuns({
      guildId: String(request.query?.guildId || "").trim() || null,
      limit: clampInt(request.query?.limit, 20, 1, 100),
      offset: clampInt(request.query?.offset, 0, 0, 100_000),
    });
  });

  app.get("/api/discord/apply/runs/:runId", { preHandler: requireView }, async (request) =>
    loadRun(assertUuid(request.params?.runId, "실행 ID")),
  );

  app.patch("/api/discord/guild", { preHandler: requireManage }, async (request) => {
    const body = readBody(request);
    const payload = body.payload && typeof body.payload === "object" ? body.payload : body;

    if (Object.keys(payload).length === 0) {
      throw new HttpError(400, "HJ400", "변경할 서버 설정이 없어요.");
    }

    const result = await callBot({
      method: "PATCH",
      path: "/internal/guild",
      body: { payload },
      log: request.log,
    });

    await auditAction(request, "discord.guild.update", "discord_guild", result?.result?.id ?? null, {
      fields: Object.keys(payload),
    });

    return result;
  });
}
