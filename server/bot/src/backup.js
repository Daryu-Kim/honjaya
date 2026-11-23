// P12B — 암호화 백업 파이프라인.
//
// 흐름: pg_dump -Fc → gzip → AES-256-GCM → 로컬 파일 → 20MiB 조각 분할
//        → Discord 백업 채널 업로드(실패해도 백업 자체는 성공으로 남김)
//        → 보관 정책(daily/weekly/monthly) 정리 → 검증 복원(스크래치 DB)
//
// 원칙:
//   - BACKUP_ENCRYPTION_KEY 는 봇 컨테이너 env 에만 있고, DB·Discord·브라우저로 나가지 않습니다.
//   - 업로드 실패는 백업 실패가 아닙니다(로컬 파일 유지 + 재시도 큐).
//   - 운영 DB 덮어쓰기는 절대 자동화하지 않습니다. 검증은 honjaya_verify 스크래치 DB 에서만.
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { config } from "./config.js";
import { nextCronTime } from "./cron.js";
import {
  BACKUP_FILE_SUFFIX,
  SERVER_FILE_SUFFIX,
  decryptToDumpFile,
  encryptToFile,
  parseKey,
  reassembleFiles,
  sha256File,
  splitFile,
} from "./backupFiles.js";
import { bundleSource } from "./serverBundle.js";

// 복원 후 행 수를 비교할 의미 있는 테이블들. 존재하는 것만 사용합니다.
const COUNT_TABLES = [
  "customers",
  "orders",
  "order_sheets",
  "payments",
  "payment_allocations",
  "refunds",
  "point_ledger",
  "point_allocations",
  "coupons",
  "employees",
  "products",
  "categories",
  "bar_tables",
  "prepaid_plans",
  "prepaid_passes",
  "prepaid_transactions",
  "gift_products",
  "gift_certificates",
  "market_history",
  "hearts",
  "chat_messages",
  "message_campaigns",
  "message_logs",
];

const DIVIDER = "────────────────────";

function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function errorText(error) {
  const message = error instanceof Error ? error.message : String(error);

  return message.slice(0, 2000);
}

function mib(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} MiB`;
}

/** 백업 종류별 Discord 안내 embed. DB 백업과 서버 번들은 복원 방법이 달라 문구를 나눕니다. */
function backupEmbed(run) {
  const common = {
    timestamp: new Date(run.started_at ?? Date.now()).toISOString(),
    footer: { text: "honjaya-backup" },
  };

  if (run.kind === "SERVER") {
    const counts = run.row_counts ?? {};

    return {
      ...common,
      title: "혼자야 서버 백업",
      color: 0x1565c0,
      description: [
        `**종류** 서버 코드·설정 (${counts.files ?? "-"}개 파일)`,
        `**파일** ${run.filename}`,
        `**크기** ${mib(run.size_bytes)} · 조각 ${run.part_count}`,
        `**SHA-256** \`${String(run.sha256 ?? "").slice(0, 32)}…\``,
        `**암호화** AES-256-GCM (키는 서버에만 있음)`,
        DIVIDER,
        "`.env` 등 비밀값은 이 파일에 포함되지 않습니다.",
        "복원: 복호화한 뒤 tar 로 풀고, DB 는 DB 백업 파일로 따로 되돌립니다.",
        `run \`${run.id}\``,
      ].join("\n"),
    };
  }

  return {
    ...common,
    title: "혼자야 백업",
    color: 0x2e7d32,
    description: [
      `**DB** ${run.db_name}`,
      `**파일** ${run.filename}`,
      `**크기** ${mib(run.size_bytes)} · 조각 ${run.part_count}`,
      `**SHA-256** \`${String(run.sha256 ?? "").slice(0, 32)}…\``,
      `**암호화** AES-256-GCM (키는 서버에만 있음)`,
      DIVIDER,
      "복원은 서버에서 암호화 키로 복호화한 뒤 진행해야 합니다.",
      `run \`${run.id}\``,
    ].join("\n"),
  };
}

function databaseTarget() {
  const url = new URL(config.databaseUrl);

  return {
    host: url.hostname || "db",
    port: url.port || "5432",
    user: decodeURIComponent(url.username || "postgres"),
    password: decodeURIComponent(url.password || ""),
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "") || "honjaya"),
  };
}

/** 외부 명령을 실행하고 stdout/stderr 를 모읍니다. */
function runCommand(command, args, { env = {}, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), Math.max(timeoutMs, 1000));

    child.stdout.on("data", (chunk) => {
      if (stdout.length < 200_000) {
        stdout += chunk.toString("utf8");
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-200_000);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });

        return;
      }

      const error = new Error(
        `${command} 실패 (exit ${code}): ${stderr.trim().slice(-800) || "출력 없음"}`,
      );

      error.exitCode = code;
      reject(error);
    });
  });
}

/** pg_dump 를 스트리밍으로 실행합니다(stdout 을 암호화 파이프라인에 바로 연결). */
function spawnDump() {
  const target = databaseTarget();
  const child = spawn(
    "pg_dump",
    [
      "-Fc",
      "--no-owner",
      "--no-privileges",
      "-h",
      target.host,
      "-p",
      target.port,
      "-U",
      target.user,
      "-d",
      target.database,
    ],
    {
      env: { ...process.env, PGPASSWORD: target.password, PGCONNECT_TIMEOUT: "15" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-200_000);
  });

  const done = new Promise((resolve, reject) => {
    child.on("error", (error) => {
      reject(
        new Error(
          error.code === "ENOENT"
            ? "pg_dump 를 찾을 수 없습니다. 봇 이미지에 postgresql-client 가 설치되어 있는지 확인해 주세요."
            : `pg_dump 실행 실패: ${error.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();

        return;
      }

      reject(new Error(`pg_dump 실패 (exit ${code}): ${stderr.trim().slice(-800) || "출력 없음"}`));
    });
  });

  // 파이프라인이 먼저 실패하면 이 프라미스는 아무도 await 하지 않으므로 미리 막아 둡니다.
  done.catch(() => {});

  return { child, done };
}

/** 일별/주별/월별 보관 정책(GFS). 남길 run id 집합을 계산합니다. */
export function pickRunIdsToKeep(runs, { keepDaily = 14, keepWeekly = 8, keepMonthly = 12 } = {}) {
  const keep = new Set();
  const ordered = [...runs].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );

  if (ordered.length === 0) {
    return keep;
  }

  keep.add(ordered[0].id);

  const buckets = [
    { key: (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`, limit: keepDaily },
    { key: (date) => `${isoYear(date)}-${isoWeek(date)}`, limit: keepWeekly },
    { key: (date) => `${date.getFullYear()}-${date.getMonth() + 1}`, limit: keepMonthly },
  ];

  for (const bucket of buckets) {
    const seen = new Set();

    for (const run of ordered) {
      const date = new Date(run.started_at);

      if (Number.isNaN(date.getTime())) {
        continue;
      }

      const key = bucket.key(date);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      keep.add(run.id);

      if (seen.size >= bucket.limit) {
        break;
      }
    }
  }

  return keep;
}

function isoWeek(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7));

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));

  return (
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    )
  );
}

function isoYear(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7));

  return target.getUTCFullYear();
}

export function createBackupService({ pool, log, service, queue }) {
  function client() {
    if (!service?.state?.ready) {
      throw new Error("Discord 봇이 연결되지 않아 업로드할 수 없습니다.");
    }

    return service.client;
  }

  async function readSettings() {
    const { rows } = await pool.query(
      `select backup_channel_id, backup_cron, keep_daily, keep_weekly, keep_monthly,
              max_upload_mb, next_backup_at
         from public.discord_settings
        where id = 1`,
    );

    return (
      rows[0] ?? {
        backup_channel_id: "",
        backup_cron: "0 5 * * *",
        keep_daily: 14,
        keep_weekly: 8,
        keep_monthly: 12,
        max_upload_mb: config.backup.maxUploadMb,
        next_backup_at: null,
      }
    );
  }

  // 설정이 비어 있으면 길드에서 이름으로 백업 채널을 찾습니다.
  // P12E 프리셋이 만드는 `#백업` 채널을 그대로 쓰기 위해서입니다.
  const BACKUP_CHANNEL_PATTERN = /백업|backup/i;

  function findBackupChannelIdByName() {
    try {
      const guild = client().guilds.cache.get(config.discord.guildId);
      const channels = guild ? [...guild.channels.cache.values()] : [];
      const found = channels.find(
        (channel) => channel.type === 0 && BACKUP_CHANNEL_PATTERN.test(String(channel.name ?? "")),
      );

      return found?.id ?? "";
    } catch {
      return "";
    }
  }

  async function backupChannelId() {
    const settings = await readSettings();
    const configured = String(settings.backup_channel_id || config.discord.backupChannelId || "").trim();

    if (configured) {
      return configured;
    }

    return findBackupChannelIdByName();
  }

  async function rowCounts() {
    const { rows } = await pool.query(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const present = new Set(rows.map((row) => row.table_name));
    const targets = COUNT_TABLES.filter((name) => present.has(name));

    if (targets.length === 0) {
      return {};
    }

    const sql = targets
      .map((name) => `select '${name}' as name, count(*)::bigint as count from public.${name}`)
      .join(" union all ");

    const counted = await pool.query(sql);
    const out = {};

    for (const row of counted.rows) {
      out[row.name] = Number(row.count);
    }

    return out;
  }

  async function getRun(runId) {
    const { rows } = await pool.query(`select * from public.backup_runs where id = $1`, [runId]);

    if (rows.length === 0) {
      return null;
    }

    const files = await pool.query(
      `select id, run_id, part_no, part_count, filename, size_bytes, sha256,
              discord_channel_id, discord_message_id, upload_status, uploaded_at, error
         from public.backup_files
        where run_id = $1
        order by part_no asc`,
      [runId],
    );

    return { ...rows[0], files: files.rows };
  }

  async function listRuns({ limit = 20, offset = 0 } = {}) {
    const total = await pool.query(`select count(*)::int as count from public.backup_runs`);
    const { rows } = await pool.query(
      `select r.*,
              (select count(*)::int from public.backup_files f
                where f.run_id = r.id and f.upload_status = 'UPLOADED') as uploaded_parts,
              (select count(*)::int from public.backup_files f where f.run_id = r.id) as part_rows,
              (select status from public.backup_restores v
                where v.run_id = r.id and v.mode = 'VERIFY'
                order by v.started_at desc limit 1) as last_verify_status,
              (select started_at from public.backup_restores v
                where v.run_id = r.id and v.mode = 'VERIFY'
                order by v.started_at desc limit 1) as last_verify_at
         from public.backup_runs r
        order by r.started_at desc
        limit $1 offset $2`,
      [limit, offset],
    );

    return { total: total.rows[0]?.count ?? 0, limit, offset, runs: rows };
  }

  async function partRows(runId) {
    const { rows } = await pool.query(
      `select id, part_no, filename from public.backup_files where run_id = $1 order by part_no asc`,
      [runId],
    );

    return rows;
  }

  function partPath(run, filename) {
    const base = run.local_path ? dirname(run.local_path) : config.backup.dir;

    return join(base, filename);
  }

  async function writeParts(run, baseName, partSizeBytes) {
    await pool.query(`delete from public.backup_files where run_id = $1`, [run.id]);

    for (const file of await existingPartFiles(run)) {
      await rm(file, { force: true }).catch(() => {});
    }

    const { partCount, parts } = await splitFile({
      sourcePath: run.local_path,
      dir: dirname(run.local_path),
      partSizeBytes,
      baseName,
    });

    for (const part of parts) {
      await pool.query(
        `insert into public.backup_files (run_id, part_no, part_count, filename, size_bytes, sha256)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (run_id, part_no) do update
            set part_count = excluded.part_count,
                filename = excluded.filename,
                size_bytes = excluded.size_bytes,
                sha256 = excluded.sha256,
                upload_status = 'PENDING',
                discord_message_id = '',
                uploaded_at = null,
                error = null`,
        [run.id, part.partNo, part.partCount, part.filename, part.sizeBytes, part.sha256],
      );
    }

    await pool.query(`update public.backup_runs set part_count = $2 where id = $1`, [
      run.id,
      partCount,
    ]);

    return partCount;
  }

  async function existingPartFiles(run) {
    const dir = run.local_path ? dirname(run.local_path) : config.backup.dir;

    try {
      const entries = await readdir(dir);

      return entries
        .filter((name) => name.startsWith(`${run.filename}.part-`))
        .map((name) => join(dir, name));
    } catch {
      return [];
    }
  }

  // 암호화 파일을 조각으로 나눠 DB 에 기록하고 run 을 SUCCEEDED 로 마감합니다.
  // DB 백업과 서버 번들 백업이 같은 마무리 절차를 씁니다.
  async function persistEncryptedRun({ runId, filename, localPath, encrypted, partSizeBytes, rowCounts }) {
    const run = { id: runId, local_path: localPath, filename };
    const partCount = await writeParts(run, filename, partSizeBytes);

    await pool.query(
      `update public.backup_runs
          set status = 'SUCCEEDED',
              size_bytes = $2,
              sha256 = $3,
              part_count = $4,
              local_path = $5,
              row_counts = $6::jsonb,
              finished_at = now()
        where id = $1`,
      [runId, encrypted.sizeBytes, encrypted.sha256, partCount, localPath, JSON.stringify(rowCounts)],
    );

    return partCount;
  }

  // ── 1단계: 덤프 → 암호화 → 분할 ────────────────────────────────────────────
  async function runBackup({ triggeredBy = "system", jobId = null } = {}) {
    const key = parseKey(config.backup.encryptionKey);
    const target = databaseTarget();
    const settings = await readSettings();
    const filename = `${target.database}-${stamp()}${BACKUP_FILE_SUFFIX}`;

    await mkdir(config.backup.dir, { recursive: true });

    const created = await pool.query(
      `insert into public.backup_runs (kind, status, db_name, filename, key_id, encrypted,
                                       triggered_by, job_id, app_version, app_commit)
       values ('FULL', 'RUNNING', $1, $2, 'v1', true, $3, $4, $5, $6)
       returning id, started_at`,
      [
        target.database,
        filename,
        triggeredBy,
        jobId,
        process.env.APP_VERSION || "",
        process.env.APP_COMMIT || "",
      ],
    );

    const runId = created.rows[0].id;
    const localPath = join(config.backup.dir, filename);

    log.info("backup started", { runId, filename, db: target.database });

    const dump = spawnDump();

    try {
      const [encrypted] = await Promise.all([
        encryptToFile({ source: dump.child.stdout, targetPath: localPath, key }),
        dump.done,
      ]);

      const counts = await rowCounts();
      const partSizeBytes = Math.max(1, Number(settings.max_upload_mb) || 20) * 1024 * 1024;
      const partCount = await persistEncryptedRun({
        runId,
        filename,
        localPath,
        encrypted,
        partSizeBytes,
        rowCounts: counts,
      });

      log.info("backup completed", {
        runId,
        sizeBytes: encrypted.sizeBytes,
        partCount,
        sha256: encrypted.sha256.slice(0, 16),
      });

      return {
        runId,
        sizeBytes: encrypted.sizeBytes,
        sha256: encrypted.sha256,
        partCount,
        rowCounts: counts,
      };
    } catch (error) {
      dump.child.kill("SIGKILL");
      await rm(localPath, { force: true }).catch(() => {});
      await pool
        .query(
          `update public.backup_runs set status = 'FAILED', error = $2, finished_at = now() where id = $1`,
          [runId, errorText(error)],
        )
        .catch(() => {});

      log.error("backup failed", { runId, err: error });
      throw error;
    }
  }

  // ── 1-b단계: 서버(코드·설정) 번들 백업 ─────────────────────────────────────
  // DB 백업과 같은 암호화·분할·업로드 파이프라인을 타되 run 종류만 SERVER 입니다.
  // 소스가 없거나 tar 가 실패해도 DB 백업은 그대로 성공해야 하므로 별도 잡으로 돕니다.
  async function runServerBackup({ triggeredBy = "system", jobId = null } = {}) {
    const sourceDir = String(config.backup.sourceDir || "").trim();

    if (!sourceDir) {
      log.warn("server backup skipped: BACKUP_SOURCE_DIR 미설정");

      return { skipped: "NO_SOURCE_DIR" };
    }

    const key = parseKey(config.backup.encryptionKey);
    const settings = await readSettings();
    const filename = `server-${stamp()}${SERVER_FILE_SUFFIX}`;
    const localPath = join(config.backup.dir, filename);
    const archivePath = `${localPath}.tar.gz`;
    const listPath = `${archivePath}.list`;

    await mkdir(config.backup.dir, { recursive: true });

    const created = await pool.query(
      `insert into public.backup_runs (kind, status, db_name, filename, key_id, encrypted,
                                       triggered_by, job_id, app_version, app_commit)
       values ('SERVER', 'RUNNING', 'honjaya-app', $1, 'v1', true, $2, $3, $4, $5)
       returning id, started_at`,
      [filename, triggeredBy, jobId, process.env.APP_VERSION || "", process.env.APP_COMMIT || ""],
    );

    const runId = created.rows[0].id;

    log.info("server backup started", { runId, filename, sourceDir });

    try {
      const bundle = await bundleSource({ root: sourceDir, targetPath: archivePath, listPath });
      const encrypted = await encryptToFile({
        source: createReadStream(archivePath),
        targetPath: localPath,
        key,
      });
      const partSizeBytes = Math.max(1, Number(settings.max_upload_mb) || 20) * 1024 * 1024;
      const rowCounts = {
        files: bundle.fileCount,
        sourceBytes: bundle.sourceBytes,
        archiveBytes: bundle.archiveBytes,
      };
      const partCount = await persistEncryptedRun({
        runId,
        filename,
        localPath,
        encrypted,
        partSizeBytes,
        rowCounts,
      });

      log.info("server backup completed", {
        runId,
        fileCount: bundle.fileCount,
        sizeBytes: encrypted.sizeBytes,
        partCount,
      });

      return {
        runId,
        sizeBytes: encrypted.sizeBytes,
        sha256: encrypted.sha256,
        partCount,
        ...rowCounts,
      };
    } catch (error) {
      await rm(localPath, { force: true }).catch(() => {});
      await pool
        .query(
          `update public.backup_runs set status = 'FAILED', error = $2, finished_at = now() where id = $1`,
          [runId, errorText(error)],
        )
        .catch(() => {});

      log.error("server backup failed", { runId, err: error });
      throw error;
    } finally {
      await rm(archivePath, { force: true }).catch(() => {});
      await rm(listPath, { force: true }).catch(() => {});
    }
  }

  // ── 2단계: Discord 업로드 ──────────────────────────────────────────────────
  async function uploadRun(runId, { triggeredBy = "system" } = {}) {
    const run = await getRun(runId);

    if (!run) {
      throw new Error("백업 실행을 찾을 수 없습니다.");
    }

    if (run.status !== "SUCCEEDED") {
      throw new Error("성공한 백업만 업로드할 수 있습니다.");
    }

    const channelId = await backupChannelId();

    if (!channelId) {
      log.warn("backup upload skipped: no channel", { runId });

      return { uploaded: 0, skipped: "NO_BACKUP_CHANNEL" };
    }

    const channel = await client()
      .channels.fetch(channelId)
      .catch((error) => {
        throw new Error(`백업 채널(${channelId})을 열 수 없습니다: ${error.message}`);
      });

    if (!channel?.isTextBased?.()) {
      throw new Error("백업 채널이 텍스트 채널이 아닙니다.");
    }

    const pending = run.files.filter((file) => file.upload_status !== "UPLOADED");

    if (pending.length === 0) {
      return { uploaded: 0, skipped: "ALREADY_UPLOADED" };
    }

    const embed = backupEmbed(run);

    let uploaded = 0;
    const batches = [];

    for (let index = 0; index < pending.length; index += 10) {
      batches.push(pending.slice(index, index + 10));
    }

    for (const [batchIndex, batch] of batches.entries()) {
      const files = [];

      for (const file of batch) {
        const path = partPath(run, file.filename);

        try {
          await stat(path);
        } catch {
          throw new Error(`백업 조각 파일이 없습니다: ${file.filename}`);
        }

        files.push({ attachment: path, name: file.filename });
      }

      try {
        const message = await channel.send(
          batchIndex === 0 ? { embeds: [embed], files } : { content: `\`${run.filename}\` (계속)`, files },
        );

        for (const [fileIndex, file] of batch.entries()) {
          const attachmentId = message.attachments?.at?.(fileIndex)?.id ?? "";

          await pool.query(
            `update public.backup_files
                set upload_status = 'UPLOADED',
                    discord_channel_id = $2,
                    discord_message_id = $3,
                    discord_attachment_id = $4,
                    uploaded_at = now(),
                    error = null
              where id = $1`,
            [file.id, channel.id, message.id, attachmentId],
          );

          uploaded += 1;
        }
      } catch (error) {
        const tooLarge = Number(error?.status) === 413 || Number(error?.code) === 40005;

        for (const file of batch) {
          await pool
            .query(
              `update public.backup_files set upload_status = 'FAILED', error = $2 where id = $1`,
              [file.id, errorText(error)],
            )
            .catch(() => {});
        }

        if (tooLarge) {
          const nextSize = Math.max(1, Math.floor(Number(run.files[0]?.size_bytes || 0) * 0.8));

          log.warn("backup part too large, re-splitting", { runId, nextSize });

          await writeParts(run, run.filename, nextSize);

          throw new Error(
            "백업 조각이 Discord 업로드 한도를 넘어 더 작은 크기로 다시 나눴습니다. 다음 시도에서 업로드합니다.",
          );
        }

        throw error;
      }
    }

    log.info("backup uploaded", { runId, uploaded, channelId, triggeredBy });

    return { uploaded, channelId, messages: batches.length };
  }

  // ── 3단계: 보관 정책 ──────────────────────────────────────────────────────
  async function prune() {
    const settings = await readSettings();
    const { rows } = await pool.query(
      `select id, kind, started_at, filename, local_path, status
         from public.backup_runs
        order by started_at desc`,
    );
    const retention = {
      keepDaily: Number(settings.keep_daily) || 0,
      keepWeekly: Number(settings.keep_weekly) || 0,
      keepMonthly: Number(settings.keep_monthly) || 0,
    };
    // 종류별로 따로 셉니다. 서버 번들이 DB 백업 보관 개수를 잡아먹지 않게 하기 위해서입니다.
    const dbRows = rows.filter((run) => run.kind !== "SERVER");
    const serverRows = rows.filter((run) => run.kind === "SERVER");
    const keep = new Set([
      ...pickRunIdsToKeep(dbRows, retention),
      ...pickRunIdsToKeep(serverRows, retention),
    ]);
    const drop = rows.filter((run) => !keep.has(run.id));
    let deletedMessages = 0;

    for (const run of drop) {
      const files = await pool.query(
        `select filename, discord_channel_id, discord_message_id from public.backup_files where run_id = $1`,
        [run.id],
      );
      const messageIds = new Set(
        files.rows.map((file) => file.discord_message_id).filter(Boolean),
      );

      for (const messageId of messageIds) {
        const channelId = files.rows.find((file) => file.discord_message_id === messageId)
          ?.discord_channel_id;

        try {
          const channel = await client().channels.fetch(channelId);
          const message = await channel?.messages?.fetch(messageId);

          await message?.delete();

          deletedMessages += 1;
        } catch (error) {
          log.warn("backup message delete failed", { messageId, err: error });
        }
      }

      for (const file of files.rows) {
        await rm(partPath(run, file.filename), { force: true }).catch(() => {});
      }

      if (run.local_path) {
        await rm(run.local_path, { force: true }).catch(() => {});
      }

      await pool.query(`delete from public.backup_runs where id = $1`, [run.id]);
    }

    log.info("backup prune done", { kept: keep.size, deleted: drop.length, deletedMessages });

    return { kept: keep.size, deleted: drop.length, deletedMessages };
  }

  // ── 4단계: 검증 복원(스크래치 DB) ─────────────────────────────────────────
  async function verifyRun(runId, { triggeredBy = "system" } = {}) {
    const run = await getRun(runId);

    if (!run) {
      throw new Error("백업 실행을 찾을 수 없습니다.");
    }

    if (run.kind === "SERVER") {
      throw new Error(
        "서버 코드 백업은 DB 검증 대상이 아닙니다. 복호화한 뒤 tar 로 풀어 내용을 확인해 주세요.",
      );
    }

    const target = databaseTarget();
    const scratchDb = config.backup.scratchDb;

    if (scratchDb === target.database) {
      throw new Error("검증용 DB 이름이 운영 DB 와 같습니다. BACKUP_SCRATCH_DB 를 바꿔 주세요.");
    }

    const restore = await pool.query(
      `insert into public.backup_restores (run_id, mode, target_db, status, triggered_by)
       values ($1, 'VERIFY', $2, 'RUNNING', $3)
       returning id`,
      [runId, scratchDb, triggeredBy],
    );
    const restoreId = restore.rows[0].id;
    const workDir = join(config.backup.dir, "verify", restoreId);
    const reassembled = join(workDir, `${run.filename}.joined`);
    const dumpPath = join(workDir, `${run.db_name}.dump`);
    const env = { PGPASSWORD: target.password };

    const verification = {};

    try {
      await mkdir(workDir, { recursive: true });

      const parts = [];
      const missing = [];

      for (const file of run.files) {
        const path = partPath(run, file.filename);

        try {
          await stat(path);
          parts.push({ path, partNo: file.part_no });
        } catch {
          missing.push(file.filename);
        }
      }

      if (parts.length !== run.files.length || run.files.length === 0) {
        throw new Error(
          `백업 조각이 로컬에 없어 검증할 수 없습니다: ${missing.join(", ") || "조각 정보 없음"}`,
        );
      }

      await reassembleFiles({ parts, targetPath: reassembled });

      const reassembledHash = await sha256File(reassembled);

      verification.sha256Match = reassembledHash === run.sha256;
      verification.reassembledSize = (await stat(reassembled)).size;

      if (!verification.sha256Match) {
        throw new Error("재조립한 백업의 SHA-256 이 기록과 다릅니다. 파일이 손상되었습니다.");
      }

      await decryptToDumpFile({
        sourcePath: reassembled,
        targetPath: dumpPath,
        key: parseKey(config.backup.encryptionKey),
      });

      const listed = await runCommand("pg_restore", ["--list", dumpPath], { timeoutMs: 60_000 });

      verification.dumpEntries = listed.stdout.split(/\r?\n/).filter((line) => line && !line.startsWith(";")).length;

      if (verification.dumpEntries === 0) {
        throw new Error("pg_restore --list 결과가 비어 있습니다. 덤프가 손상되었습니다.");
      }

      await runCommand("dropdb", ["--if-exists", "-h", target.host, "-p", target.port, "-U", target.user, scratchDb], {
        env,
        timeoutMs: 60_000,
      });
      await runCommand("createdb", ["-h", target.host, "-p", target.port, "-U", target.user, scratchDb], {
        env,
        timeoutMs: 60_000,
      });
      await runCommand(
        "pg_restore",
        [
          "-h",
          target.host,
          "-p",
          target.port,
          "-U",
          target.user,
          "-d",
          scratchDb,
          "--no-owner",
          "--no-privileges",
          "--exit-on-error",
          dumpPath,
        ],
        { env, timeoutMs: config.backup.verifyTimeoutMs },
      );

      const mismatches = [];
      const recorded = run.row_counts && typeof run.row_counts === "object" ? run.row_counts : {};
      const names = Object.keys(recorded);

      if (names.length > 0) {
        const sql = names
          .map((name) => `select '${name}' as name, count(*)::bigint as count from public.${name}`)
          .join(" union all ");
        const counted = await runCommand(
          "psql",
          [
            "-h",
            target.host,
            "-p",
            target.port,
            "-U",
            target.user,
            "-d",
            scratchDb,
            "-At",
            "-F",
            "|",
            "-c",
            sql,
          ],
          { env, timeoutMs: 120_000 },
        );

        for (const line of counted.stdout.split(/\r?\n/)) {
          if (!line.trim()) {
            continue;
          }

          const [name, rawCount] = line.split("|");
          const expected = Number(recorded[name]);
          const actual = Number(rawCount);

          if (expected !== actual) {
            mismatches.push({ table: name, expected, actual });
          }
        }
      }

      verification.rowMismatches = mismatches;
      verification.checkedTables = names.length;

      if (mismatches.length > 0) {
        throw new Error(
          `행 수가 일치하지 않습니다: ${mismatches
            .map((item) => `${item.table} ${item.expected}→${item.actual}`)
            .join(", ")}`,
        );
      }

      await runCommand("dropdb", ["--if-exists", "-h", target.host, "-p", target.port, "-U", target.user, scratchDb], {
        env,
        timeoutMs: 60_000,
      }).catch((error) => log.warn("scratch db drop failed", { err: error }));

      await pool.query(
        `update public.backup_restores
            set status = 'SUCCEEDED', verification = $2::jsonb, finished_at = now()
          where id = $1`,
        [restoreId, JSON.stringify(verification)],
      );

      log.info("backup verified", { runId, restoreId, checkedTables: names.length });

      return { runId, restoreId, verification };
    } catch (error) {
      await pool
        .query(
          `update public.backup_restores
              set status = 'FAILED', verification = $2::jsonb, error = $3, finished_at = now()
            where id = $1`,
          [restoreId, JSON.stringify(verification), errorText(error)],
        )
        .catch(() => {});

      await runCommand("dropdb", ["--if-exists", "-h", target.host, "-p", target.port, "-U", target.user, scratchDb], {
        env,
        timeoutMs: 60_000,
      }).catch(() => {});

      log.error("backup verify failed", { runId, restoreId, err: error });
      throw error;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // ── 스케줄 ────────────────────────────────────────────────────────────────
  async function ensureSchedule(now = new Date()) {
    const settings = await readSettings();

    if (settings.next_backup_at) {
      return settings.next_backup_at;
    }

    let next = null;

    try {
      next = nextCronTime(settings.backup_cron, now);
    } catch (error) {
      log.warn("backup cron invalid", { cron: settings.backup_cron, err: error });

      return null;
    }

    if (!next) {
      return null;
    }

    await pool.query(`update public.discord_settings set next_backup_at = $1, updated_at = now() where id = 1`, [
      next,
    ]);

    return next;
  }

  async function tick(now = new Date()) {
    const next = await ensureSchedule(now);

    if (!next || new Date(next).getTime() > now.getTime()) {
      return { enqueued: false, next };
    }

    if (!queue) {
      return { enqueued: false, next };
    }

    const job = await queue.enqueue({
      kind: "BACKUP",
      payload: { triggeredBy: "schedule" },
      createdBy: "schedule",
      dedupe: true,
    });

    let following = null;

    try {
      following = nextCronTime((await readSettings()).backup_cron, now);
    } catch {
      following = null;
    }

    await pool.query(`update public.discord_settings set next_backup_at = $1, updated_at = now() where id = 1`, [
      following,
    ]);
    log.info("scheduled backup enqueued", { jobId: job.id, deduped: job.deduped, next: following });

    return { enqueued: !job.deduped, jobId: job.id, next: following };
  }

  return {
    ensureSchedule,
    getRun,
    listRuns,
    partPath,
    prune,
    runBackup,
    runServerBackup,
    tick,
    uploadRun,
    verifyRun,
  };
}

/** 잡 큐 핸들러 등록. index.js 가 부팅 시 1회 호출합니다. */
export function registerBackupJobs(handlers, { backups, queue, log }) {
  handlers.BACKUP = async (job) => {
    const result = await backups.runBackup({
      triggeredBy: job.payload?.triggeredBy || job.created_by || "system",
      jobId: job.id,
    });

    await queue.enqueue({
      kind: "BACKUP_UPLOAD",
      payload: { runId: result.runId, triggeredBy: "backup" },
      maxAttempts: 6,
      createdBy: "backup",
      dedupe: true,
    });
    // DB 백업과 별개 잡으로 돌려, 서버 번들이 실패해도 DB 백업 성공은 유지합니다.
    // dedupe 를 쓰지 않는 이유: dedupe 는 payload 를 무시하고 QUEUED 잡 1건으로 합치므로
    // 백업을 연달아 돌리면 두 번째 백업의 서버 번들이 조용히 사라집니다.
    await queue.enqueue({
      kind: "BACKUP_SERVER",
      payload: { triggeredBy: job.payload?.triggeredBy || "backup" },
      maxAttempts: 2,
      createdBy: "backup",
    });
    await queue.enqueue({
      kind: "BACKUP_PRUNE",
      payload: {},
      maxAttempts: 2,
      createdBy: "backup",
      dedupe: true,
    });

    return result;
  };

  handlers.BACKUP_SERVER = async (job) => {
    const result = await backups.runServerBackup({
      triggeredBy: job.payload?.triggeredBy || job.created_by || "system",
      jobId: job.id,
    });

    if (result?.runId) {
      await queue.enqueue({
        kind: "BACKUP_UPLOAD",
        payload: { runId: result.runId, triggeredBy: "backup" },
        maxAttempts: 6,
        createdBy: "backup",
        dedupe: true,
      });
    }

    return result;
  };

  handlers.BACKUP_UPLOAD = async (job) => {
    const runId = job.payload?.runId;

    if (!runId) {
      throw new Error("BACKUP_UPLOAD 작업에 runId 가 없습니다.");
    }

    return backups.uploadRun(runId, { triggeredBy: job.payload?.triggeredBy || "backup" });
  };

  handlers.BACKUP_PRUNE = async () => backups.prune();

  handlers.BACKUP_VERIFY = async (job) => {
    const runId = job.payload?.runId;

    if (!runId) {
      throw new Error("BACKUP_VERIFY 작업에 runId 가 없습니다.");
    }

    return backups.verifyRun(runId, { triggeredBy: job.payload?.triggeredBy || "verify" });
  };

  log.info("backup job handlers registered", {
    kinds: ["BACKUP", "BACKUP_SERVER", "BACKUP_UPLOAD", "BACKUP_PRUNE", "BACKUP_VERIFY"],
  });
}
