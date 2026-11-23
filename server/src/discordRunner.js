// P12E — 구조 초안(draft) → 미리보기(preview) → 적용(apply) → 롤백 실행기.
//
// 계획 생성은 discordApply.js(순수 함수)가 담당하고, 여기서는
//   1) 봇에서 현재 구조/권한 목록을 읽어 계획에 넘기고
//   2) discord_apply_runs / discord_apply_ops 에 진행 상황을 남기고
//   3) op 를 하나씩 봇(/internal/struct/op)에 실행시킵니다.
// 봇 작업 큐(discord_jobs)를 쓰지 않고 인라인 실행합니다: 근거는 plan.md §S 참고.
import { pool } from "./db.js";
import { callBot } from "./discordBot.js";
import {
  buildRollbackOps,
  isTempId,
  normalizeDesired,
  planApply,
  resolveTempIds,
} from "./discordApply.js";
import { HttpError } from "./http/errors.js";

const DEFAULT_MAX_OPS = 60;
// 봇이 죽었을 때 run 이 RUNNING 으로 영원히 남지 않도록 마지막 갱신 시각을 남깁니다.
const STALE_RUN_MINUTES = 15;

let catalogCache = null;

export async function readLiveStructure({ log }) {
  const payload = await callBot({ path: "/internal/structure/full", log });

  if (!payload?.structure) {
    throw new HttpError(502, "HJ_BOT", "Discord 봇이 서버 구조를 보내지 않았어요.");
  }

  return {
    structure: payload.structure,
    structureHash: payload.structureHash ?? null,
    bot: payload.bot ?? { highestPosition: -1 },
  };
}

export async function readPermissionCatalog({ log }) {
  if (catalogCache) {
    return catalogCache;
  }

  const payload = await callBot({ path: "/internal/permissions", log });
  catalogCache = Array.isArray(payload?.permissions) ? payload.permissions : [];

  return catalogCache;
}

/** 백업/공지/로그 채널과 op 상한은 DB 설정을 따릅니다. */
async function loadApplySettings() {
  const { rows } = await pool.query(
    `select backup_channel_id, announce_channel_id, log_channel_id, max_ops_per_run
       from public.discord_settings
      where id = 1`,
  );
  const row = rows[0] ?? {};
  const protectedChannelIds = new Set(
    [row.backup_channel_id, row.announce_channel_id, row.log_channel_id]
      .filter((value) => value !== null && value !== undefined && String(value) !== "")
      .map((value) => String(value)),
  );

  return {
    protectedChannelIds,
    maxOps: Number(row.max_ops_per_run) > 0 ? Number(row.max_ops_per_run) : DEFAULT_MAX_OPS,
  };
}

export async function loadDraft(guildId) {
  const { rows } = await pool.query(
    `select id, guild_id, version, desired, note, updated_by, updated_at
       from public.discord_struct_docs
      where guild_id = $1
      order by version desc, updated_at desc
      limit 1`,
    [guildId],
  );
  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    guildId: row.guild_id,
    version: row.version,
    desired: row.desired,
    note: row.note,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

/** 초안은 버전을 쌓고 최근 5개만 남깁니다(히스토리 비교용). */
export async function saveDraft({ guildId, desired, note, updatedBy }) {
  const { rows } = await pool.query(
    `insert into public.discord_struct_docs (guild_id, version, desired, note, updated_by)
     values (
       $1,
       coalesce((select max(version) from public.discord_struct_docs where guild_id = $1), 0) + 1,
       $2::jsonb,
       $3,
       $4
     )
     returning id, guild_id, version, note, updated_by, updated_at`,
    [guildId, JSON.stringify(desired), String(note ?? "").slice(0, 500), updatedBy],
  );
  const saved = rows[0];

  await pool.query(
    `delete from public.discord_struct_docs
      where guild_id = $1
        and id not in (
          select id from public.discord_struct_docs
           where guild_id = $1
           order by version desc
           limit 5
        )`,
    [guildId],
  );

  return saved;
}

export async function clearDraft(guildId) {
  const { rowCount } = await pool.query(
    `delete from public.discord_struct_docs where guild_id = $1`,
    [guildId],
  );

  return rowCount ?? 0;
}

/** 3-way 비교용: 가장 최근 스냅샷 구조. */
async function loadLastSynced(guildId) {
  const { rows } = await pool.query(
    `select structure from public.discord_snapshots
      where guild_id = $1
      order by captured_at desc
      limit 1`,
    [guildId],
  );

  return rows[0]?.structure ?? null;
}

/**
 * 초안을 검사해 실행 계획을 만듭니다. preview 와 apply 가 같은 함수를 씁니다.
 */
export async function buildPlan({ desired: rawDesired, log }) {
  const live = await readLiveStructure({ log });
  const [catalog, settings] = await Promise.all([
    readPermissionCatalog({ log }),
    loadApplySettings(),
  ]);
  const guildId = String(live.structure.guild?.id ?? "");

  if (!guildId) {
    throw new HttpError(502, "HJ_BOT", "Discord 서버 ID를 확인하지 못했어요.");
  }

  const desired = normalizeDesired(rawDesired, live.structure);
  const lastSynced = await loadLastSynced(guildId);
  const plan = planApply({
    desired,
    live: live.structure,
    lastSynced,
    catalog,
    maxOps: settings.maxOps,
    protectedChannelIds: settings.protectedChannelIds,
    botHighestPosition: Number(live.bot?.highestPosition ?? -1),
  });

  return { guildId, live, desired, plan, catalog, guild: live.structure.guild };
}

async function captureSnapshot({ guildId, reason, createdBy, log }) {
  try {
    const payload = await callBot({
      method: "POST",
      path: "/internal/snapshots",
      body: { reason, createdBy },
      log,
    });

    return payload?.snapshot?.id ?? null;
  } catch (error) {
    log?.warn?.("snapshot capture failed", { reason, message: error?.message });
    throw error;
  }
}

function auditSummary(plan) {
  return {
    total: plan.counts.total,
    destructive: plan.counts.destructive,
    create: plan.counts.create,
    update: plan.counts.update,
    move: plan.counts.move,
    remove: plan.counts.remove,
    blocked: plan.blocked.length,
    warnings: plan.warnings.length,
    conflicts: plan.conflicts.length,
  };
}

async function insertRun({ guildId, docVersion, plan, preSnapshotId, createdBy, rollbackOf = null }) {
  const { rows } = await pool.query(
    `insert into public.discord_apply_runs
       (guild_id, doc_version, status, op_total, pre_snapshot_id, rollback_of, started_at, created_by)
     values ($1, $2, 'RUNNING', $3, $4, $5, now(), $6)
     returning id`,
    [guildId, docVersion ?? null, plan.ops.length, preSnapshotId, rollbackOf, createdBy],
  );

  return rows[0].id;
}

async function insertOps({ runId, ops }) {
  const ids = [];

  for (const op of ops) {
    const { rows } = await pool.query(
      `insert into public.discord_apply_ops
         (run_id, seq, op, target_type, target_id, before, after, status)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'QUEUED')
       returning id`,
      [
        runId,
        op.seq,
        op.op,
        op.targetType ?? "",
        String(op.targetId ?? ""),
        op.before === null || op.before === undefined ? null : JSON.stringify(op.before),
        op.after === null || op.after === undefined ? null : JSON.stringify(op.after),
      ],
    );

    ids.push({ opRowId: rows[0].id, op });
  }

  return ids;
}

/**
 * op 를 순서대로 실행합니다. 첫 실패에서 멈춥니다(중간 상태를 더 만들지 않기 위해).
 * 실패한 op 의 before 를 남겨 두므로 rollback 으로 되돌릴 수 있습니다.
 */
async function runOps({ runId, entries, tempMap, log }) {
  let ok = 0;
  let failed = 0;
  let lastError = null;

  for (const entry of entries) {
    const resolved = resolveTempIds(entry.op, tempMap);

    await pool.query(
      `update public.discord_apply_ops set status = 'RUNNING', started_at = now() where id = $1`,
      [entry.opRowId],
    );

    try {
      const payload = await callBot({
        method: "POST",
        path: "/internal/struct/op",
        body: { op: resolved.op, targetId: resolved.targetId, payload: resolved.payload },
        log,
      });
      const result = payload?.result ?? null;

      // 새로 만든 항목의 실제 id 를 이후 op 들이 쓸 수 있게 등록합니다.
      if (isTempId(entry.op.targetId) && result?.id) {
        tempMap.set(entry.op.targetId, String(result.id));
      }

      const after =
        result === null
          ? entry.op.after
          : { ...(entry.op.after && typeof entry.op.after === "object" ? entry.op.after : {}), ...result };

      await pool.query(
        `update public.discord_apply_ops
            set status = 'SUCCEEDED',
                after = coalesce($2::jsonb, after),
                finished_at = now()
          where id = $1`,
        [entry.opRowId, after === null ? null : JSON.stringify(after)],
      );

      ok += 1;

      if (result?.skipped) {
        log?.info?.("struct op skipped (already in desired state)", {
          seq: entry.op.seq,
          op: entry.op.op,
        });
      }
    } catch (error) {
      failed += 1;
      lastError = error;

      await pool.query(
        `update public.discord_apply_ops
            set status = 'FAILED', error = $2, http_status = $3, discord_code = $4, finished_at = now()
          where id = $1`,
        [
          entry.opRowId,
          String(error?.message ?? "알 수 없는 오류").slice(0, 1000),
          Number(error?.status) || null,
          Number(error?.details?.discordCode) || null,
        ],
      );

      log?.warn?.("struct op failed", {
        seq: entry.op.seq,
        op: entry.op.op,
        message: error?.message,
      });

      break;
    }
  }

  // 남은 op 는 건드리지 않고 QUEUED 로 두되, 실행이 끝났음을 알 수 있게 SKIPPED 처리합니다.
  await pool.query(
    `update public.discord_apply_ops
        set status = 'SKIPPED', finished_at = now()
      where run_id = $1 and status = 'QUEUED'`,
    [runId],
  );

  return { ok, failed, lastError };
}

async function finishRun({ runId, ok, failed, lastError }) {
  const status = failed > 0 ? "FAILED" : "SUCCEEDED";

  await pool.query(
    `update public.discord_apply_runs
        set status = $2, op_ok = $3, op_failed = $4, error = $5, finished_at = now()
      where id = $1`,
    [runId, status, ok, failed, lastError ? String(lastError.message).slice(0, 1000) : null],
  );

  return status;
}

/**
 * 적용 실행. 사전 스냅샷 → op 실행 → 사후 스냅샷 순서입니다.
 * 사후 스냅샷은 다음 미리보기의 "마지막 동기화" 기준이 됩니다.
 */
export async function executeApply({
  desired: rawDesired,
  docVersion = null,
  createdBy,
  confirmName,
  allowAdministrator = false,
  allowDangerous = false,
  allowDeletes = false,
  rollbackOf = null,
  log,
}) {
  const { guildId, guild, plan } = await buildPlan({ desired: rawDesired, log });

  if (plan.blocked.length > 0) {
    throw new HttpError(
      409,
      "HJ409",
      plan.blocked[0].message,
      { blocked: plan.blocked, counts: plan.counts },
      "미리보기에서 막힌 항목을 먼저 정리해 주세요.",
    );
  }

  if (plan.ops.length === 0) {
    throw new HttpError(400, "HJ400", "적용할 변경 사항이 없어요.", {
      warnings: plan.warnings,
    });
  }

  if (plan.requiresAdministratorConfirm && !allowAdministrator) {
    throw new HttpError(
      400,
      "HJ400",
      "관리자(Administrator) 권한을 부여하는 변경이 있어요. 확인 후 다시 시도해 주세요.",
      { requiresAdministratorConfirm: true },
    );
  }

  if (plan.dangerousOverwrite && !allowDangerous) {
    throw new HttpError(
      400,
      "HJ400",
      "채널에 위험한 권한이 추가돼요. 확인 후 다시 시도해 주세요.",
      { dangerousOverwrite: true },
    );
  }

  if (plan.requiresDeleteConfirm && !allowDeletes) {
    throw new HttpError(
      400,
      "HJ400",
      `채널/역할 ${plan.counts.destructive}개를 삭제해요. 확인 후 다시 시도해 주세요.`,
      { requiresDeleteConfirm: true, destructive: plan.counts.destructive },
    );
  }

  if (String(confirmName ?? "").trim() !== String(guild?.name ?? "").trim()) {
    throw new HttpError(400, "HJ400", "확인을 위해 서버 이름을 정확히 입력해 주세요.", {
      expectedName: guild?.name ?? null,
    });
  }

  const preSnapshotId = await captureSnapshot({
    guildId,
    reason: "PRE_APPLY",
    createdBy,
    log,
  });
  const runId = await insertRun({
    guildId,
    docVersion,
    plan,
    preSnapshotId,
    createdBy,
    rollbackOf,
  });
  const entries = await insertOps({ runId, ops: plan.ops });
  const { ok, failed, lastError } = await runOps({
    runId,
    entries,
    tempMap: new Map(),
    log,
  });
  const status = await finishRun({ runId, ok, failed, lastError });

  // 사후 스냅샷: reason CHECK 에 POST_APPLY 가 없어 MANUAL 로 남기고 created_by 로 구분합니다.
  await captureSnapshot({ guildId, reason: "MANUAL", createdBy: "discord:apply", log }).catch(
    () => null,
  );

  return {
    runId,
    status,
    ok,
    failed,
    error: lastError ? String(lastError.message) : null,
    preSnapshotId,
    summary: auditSummary(plan),
    warnings: plan.warnings,
    conflicts: plan.conflicts,
  };
}

export async function loadRun(runId) {
  const { rows } = await pool.query(
    `select id, guild_id, doc_version, status, op_total, op_ok, op_failed, pre_snapshot_id,
            rollback_of, error, started_at, finished_at, created_by, created_at
       from public.discord_apply_runs
      where id = $1`,
    [runId],
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "적용 기록을 찾을 수 없어요.");
  }

  const ops = await pool.query(
    `select id, seq, op, target_type, target_id, before, after, status, http_status,
            discord_code, error, started_at, finished_at
       from public.discord_apply_ops
      where run_id = $1
      order by seq`,
    [runId],
  );

  return { run: rows[0], ops: ops.rows };
}

/** 직전 실행을 되돌립니다. 되돌리기 자체도 새 run 으로 기록합니다. */
export async function rollbackRun({ runId, createdBy, confirmName, log }) {
  const { run, ops } = await loadRun(runId);

  if (run.status === "RUNNING") {
    throw new HttpError(409, "HJ409", "아직 실행 중인 작업은 되돌릴 수 없어요.");
  }

  if (run.rollback_of) {
    throw new HttpError(400, "HJ400", "되돌리기 작업은 다시 되돌릴 수 없어요.");
  }

  const already = await pool.query(
    `select id from public.discord_apply_runs where rollback_of = $1 limit 1`,
    [runId],
  );

  if (already.rows.length > 0) {
    throw new HttpError(400, "HJ400", "이미 되돌린 작업이에요.");
  }

  const rollbackOps = buildRollbackOps(ops);

  if (rollbackOps.length === 0) {
    throw new HttpError(400, "HJ400", "되돌릴 작업이 없어요.");
  }

  const live = await readLiveStructure({ log });

  if (String(confirmName ?? "").trim() !== String(live.structure.guild?.name ?? "").trim()) {
    throw new HttpError(400, "HJ400", "확인을 위해 서버 이름을 정확히 입력해 주세요.", {
      expectedName: live.structure.guild?.name ?? null,
    });
  }

  const guildId = String(run.guild_id ?? live.structure.guild?.id ?? "");
  const plan = {
    ops: rollbackOps.map((op, index) => ({
      ...op,
      seq: index + 1,
      targetType: op.op.startsWith("role") ? "role" : op.op.startsWith("channel") ? "channel" : "guild",
      destructive: op.op.endsWith(":delete"),
      before: null,
      after: null,
    })),
    counts: { total: rollbackOps.length, destructive: 0, create: 0, update: 0, move: 0, remove: 0 },
  };

  const preSnapshotId = await captureSnapshot({ guildId, reason: "PRE_APPLY", createdBy, log });
  const newRunId = await insertRun({
    guildId,
    docVersion: run.doc_version,
    plan,
    preSnapshotId,
    createdBy,
    rollbackOf: runId,
  });
  const entries = await insertOps({ runId: newRunId, ops: plan.ops });
  const { ok, failed, lastError } = await runOps({
    runId: newRunId,
    entries,
    tempMap: new Map(),
    log,
  });
  const status = await finishRun({ runId: newRunId, ok, failed, lastError });

  if (failed === 0) {
    await pool.query(
      `update public.discord_apply_runs set status = 'ROLLED_BACK' where id = $1 and status <> 'RUNNING'`,
      [runId],
    );
  }

  await captureSnapshot({ guildId, reason: "MANUAL", createdBy: "discord:apply", log }).catch(
    () => null,
  );

  return {
    runId: newRunId,
    status,
    ok,
    failed,
    error: lastError ? String(lastError.message) : null,
    rollbackOf: runId,
    total: plan.ops.length,
  };
}

export async function listRuns({ guildId, limit = 20, offset = 0 }) {
  const params = [];
  const filters = [];

  if (guildId) {
    params.push(guildId);
    filters.push(`r.guild_id = $${params.length}`);
  }

  const where = filters.length > 0 ? `where ${filters.join(" and ")}` : "";

  const total = await pool.query(
    `select count(*)::int as count from public.discord_apply_runs r ${where}`,
    params,
  );

  params.push(limit, offset);

  const { rows } = await pool.query(
    `select r.id, r.guild_id, r.doc_version, r.status, r.op_total, r.op_ok, r.op_failed,
            r.pre_snapshot_id, r.rollback_of, r.error, r.started_at, r.finished_at,
            r.created_by, r.created_at
       from public.discord_apply_runs r
       ${where}
      order by r.created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  return { total: total.rows[0]?.count ?? 0, limit, offset, runs: rows };
}

/** 오래 매달린 RUNNING 은 실패로 정리합니다(봇 재시작 등). */
export async function markStaleRuns(log) {
  const { rowCount } = await pool.query(
    `update public.discord_apply_runs
        set status = 'FAILED',
            error = coalesce(error, '실행이 중간에 끊겼어요.'),
            finished_at = now()
      where status = 'RUNNING'
        and started_at < now() - ($1 || ' minutes')::interval`,
    [String(STALE_RUN_MINUTES)],
  );

  if (rowCount > 0) {
    log?.warn?.("stale apply runs marked as failed", { count: rowCount });
  }

  return rowCount ?? 0;
}
