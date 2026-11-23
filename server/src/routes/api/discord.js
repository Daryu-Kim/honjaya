// P12 — Discord 관리봇 API.
//
// 봇 토큰(DISCORD_BOT_TOKEN)은 이 컨테이너에 없습니다. bot 컨테이너가 유일한 보관자이고,
// 여기서는 compose 내부 주소(bot:4100)로 요청을 넘기기만 합니다.
// 스냅샷 목록·상세는 DB 에서 바로 읽습니다(봇이 살아 있지 않아도 조회는 가능해야 하므로).
import { writeAuditLog } from "../../auth/audit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { createStaffGuard } from "../../auth/sessions.js";
import { config } from "../../config.js";
import { pool } from "../../db.js";
import { HttpError } from "../../http/errors.js";

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
}
