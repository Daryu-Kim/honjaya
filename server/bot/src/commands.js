import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { config } from "./config.js";

const OK_COLOR = 0x2e7d32;
const WARN_COLOR = 0xc62828;

function kst(date) {
  if (!date) {
    return "-";
  }

  const value = typeof date === "string" ? new Date(date) : date;

  if (Number.isNaN(value.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

async function assertOwner(interaction) {
  const ownerId = config.discord.ownerUserId;

  if (!ownerId) {
    throw new Error("DISCORD_OWNER_USER_ID 가 설정되지 않아 명령을 실행할 수 없습니다.");
  }

  if (interaction.user.id !== ownerId) {
    throw new Error("이 명령은 지정된 서버 소유자만 사용할 수 있습니다.");
  }

  const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  if (!canManage) {
    throw new Error("Discord 에서 '서버 관리' 권한이 있어야 명령을 실행할 수 있습니다.");
  }
}

async function lastSnapshot(pool, guildId) {
  const { rows } = await pool.query(
    `select id, reason, structure_hash, role_count, channel_count, created_by, captured_at
       from public.discord_snapshots
      where guild_id = $1
      order by captured_at desc
      limit 1`,
    [guildId],
  );

  return rows[0] ?? null;
}

function mb(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} MiB`;
}

const RUN_STATUS_LABEL = {
  RUNNING: "진행 중",
  SUCCEEDED: "성공",
  FAILED: "실패",
};

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("상태")
      .setDescription("혼자야 봇과 서버 연결 상태를 확인합니다."),
    async execute({ deps }) {
      const status = deps.service.describe();
      const depth = await deps.queue.depth();
      const snapshot = status.guildId ? await lastSnapshot(deps.pool, status.guildId) : null;
      const { runs } = await deps.backups.listRuns({ limit: 1 });
      const backup = runs[0] ?? null;

      const embed = new EmbedBuilder()
        .setTitle("혼자야 봇 상태")
        .setColor(status.ready ? OK_COLOR : WARN_COLOR)
        .addFields(
          { name: "게이트웨이", value: status.ready ? "연결됨" : "끊김", inline: true },
          { name: "핑", value: status.pingMs === null ? "-" : `${status.pingMs}ms`, inline: true },
          { name: "가동 시간", value: `${Math.floor(status.uptimeSec / 60)}분`, inline: true },
          {
            name: "서버",
            value: status.guild
              ? `${status.guild.name} (멤버 ${status.guild.memberCount ?? "?"} · 채널 ${status.guild.channelCount} · 역할 ${status.guild.roleCount})`
              : "연결된 길드 없음",
          },
          { name: "대기 작업", value: `대기 ${depth.QUEUED} · 실행 ${depth.RUNNING}`, inline: true },
          {
            name: "최근 스냅샷",
            value: snapshot
              ? `${kst(snapshot.captured_at)} · 역할 ${snapshot.role_count} · 채널 ${snapshot.channel_count}`
              : "없음",
            inline: true,
          },
          {
            name: "최근 백업",
            value: backup
              ? `${kst(backup.started_at)} · ${RUN_STATUS_LABEL[backup.status] ?? backup.status}\n${mb(backup.size_bytes)} · 업로드 ${backup.uploaded_parts}/${backup.part_rows}`
              : "없음",
            inline: true,
          },
        )
        .setTimestamp(new Date());

      if (status.lastError) {
        embed.addFields({ name: "마지막 오류", value: String(status.lastError).slice(0, 500) });
      }

      const problems = deps.configProblems();

      if (problems.length > 0) {
        embed.addFields({
          name: "설정 누락",
          value: problems.map((item) => `\`${item.key}\` — ${item.message}`).join("\n").slice(0, 1000),
        });
      }

      return { embeds: [embed] };
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("구조")
      .setDescription("현재 서버 구조(채널·역할·이모지 등)를 요약합니다."),
    async execute({ deps }) {
      const summary = await deps.service.getStructureSummary();
      const byType = Object.entries(summary.channelsByType)
        .map(([type, count]) => `${type} ${count}`)
        .join(" · ");

      const embed = new EmbedBuilder()
        .setTitle(`${summary.guildName} 구조 요약`)
        .setColor(OK_COLOR)
        .addFields(
          { name: "역할", value: String(summary.roles), inline: true },
          { name: "채널", value: String(summary.channels), inline: true },
          { name: "채널 종류", value: byType || "-" },
          { name: "이모지", value: String(summary.emojis), inline: true },
          { name: "스티커", value: String(summary.stickers), inline: true },
          { name: "AutoMod 규칙", value: String(summary.autoModeration), inline: true },
          { name: "예약 이벤트", value: String(summary.scheduledEvents), inline: true },
        )
        .setFooter({ text: `길드 ${summary.guildId}` })
        .setTimestamp(new Date());

      return { embeds: [embed] };
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("스냅샷")
      .setDescription("현재 서버 구조를 스냅샷으로 저장합니다."),
    defer: true,
    async execute({ interaction, deps }) {
      await interaction.editReply("스냅샷을 저장하는 중입니다…");

      const guild = await deps.service.requireGuild();
      const { snapshot, summary } = await deps.captureSnapshot({
        pool: deps.pool,
        guild,
        reason: "MANUAL",
        createdBy: `discord:${interaction.user.id}`,
        log: deps.log,
      });

      const embed = new EmbedBuilder()
        .setTitle("스냅샷 저장 완료")
        .setColor(OK_COLOR)
        .addFields(
          { name: "ID", value: `\`${snapshot.id}\`` },
          { name: "해시", value: `\`${snapshot.structure_hash.slice(0, 16)}…\``, inline: true },
          { name: "역할", value: String(summary.roles), inline: true },
          { name: "채널", value: String(summary.channels), inline: true },
          { name: "시각", value: kst(snapshot.captured_at) },
        )
        .setTimestamp(new Date());

      return { embeds: [embed] };
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("백업")
      .setDescription("지금 DB 를 암호화 백업해 Discord 백업 채널로 올립니다."),
    async execute({ interaction, deps }) {
      const job = await deps.queue.enqueue({
        kind: "BACKUP",
        payload: { triggeredBy: `discord:${interaction.user.id}` },
        createdBy: `discord:${interaction.user.id}`,
        dedupe: true,
      });

      const embed = new EmbedBuilder()
        .setTitle(job.deduped ? "이미 대기 중인 백업이 있습니다" : "백업을 시작했습니다")
        .setColor(job.deduped ? WARN_COLOR : OK_COLOR)
        .addFields(
          { name: "작업 ID", value: `\`${job.id}\`` },
          {
            name: "진행 상황",
            value: "덤프 → 암호화 → 분할 → 업로드 순서로 진행합니다.\n`/백업목록` 으로 결과를 확인하세요.",
          },
        )
        .setTimestamp(new Date());

      return { embeds: [embed] };
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("백업목록")
      .setDescription("최근 백업 이력과 업로드·검증 상태를 봅니다."),
    async execute({ deps }) {
      const { runs } = await deps.backups.listRuns({ limit: 5 });

      if (runs.length === 0) {
        return { embeds: [new EmbedBuilder().setTitle("백업 이력").setDescription("아직 백업이 없습니다.")] };
      }

      const embed = new EmbedBuilder()
        .setTitle("최근 백업 5건")
        .setColor(OK_COLOR)
        .setDescription(
          runs
            .map((run) => {
              const verify = run.last_verify_status
                ? ` · 검증 ${run.last_verify_status === "SUCCEEDED" ? "통과" : "실패"}`
                : "";
              const upload =
                run.part_rows === 0
                  ? "업로드 대기"
                  : `${run.uploaded_parts}/${run.part_rows} 조각 업로드`;

              return [
                `**${kst(run.started_at)}** · ${RUN_STATUS_LABEL[run.status] ?? run.status}`,
                `${mb(run.size_bytes)} · ${upload}${verify}`,
                `\`${run.id}\``,
              ].join("\n");
            })
            .join("\n\n")
            .slice(0, 3800),
        )
        .setTimestamp(new Date());

      return { embeds: [embed] };
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("검증")
      .setDescription("백업을 스크래치 DB 로 복원해 실제로 쓸 수 있는지 확인합니다.")
      .addStringOption((option) =>
        option
          .setName("run")
          .setDescription("백업 ID (비우면 가장 최근 성공 백업)")
          .setRequired(false),
      ),
    async execute({ interaction, deps }) {
      const given = interaction.options?.getString("run")?.trim() || "";
      let runId = given;

      if (!runId) {
        const { runs } = await deps.backups.listRuns({ limit: 20 });
        const latest = runs.find((run) => run.status === "SUCCEEDED");

        if (!latest) {
          return { content: "검증할 성공한 백업이 없습니다. `/백업` 으로 먼저 백업해 주세요." };
        }

        runId = latest.id;
      }

      if (!/^[0-9a-f-]{36}$/i.test(runId)) {
        return { content: "백업 ID 형식이 올바르지 않습니다." };
      }

      const job = await deps.queue.enqueue({
        kind: "BACKUP_VERIFY",
        payload: { runId, triggeredBy: `discord:${interaction.user.id}` },
        maxAttempts: 2,
        createdBy: `discord:${interaction.user.id}`,
        dedupe: true,
      });

      const embed = new EmbedBuilder()
        .setTitle(job.deduped ? "이미 대기 중인 검증이 있습니다" : "검증을 시작했습니다")
        .setColor(OK_COLOR)
        .addFields(
          { name: "백업", value: `\`${runId}\`` },
          {
            name: "방법",
            value: "조각 재조립 → SHA-256 대조 → 복호화 → 스크래치 DB 복원 → 행 수 비교",
          },
          { name: "작업 ID", value: `\`${job.id}\`` },
        )
        .setTimestamp(new Date());

      return { embeds: [embed] };
    },
  },
];

export function commandPayloads() {
  return commands.map((command) => command.data.toJSON());
}

export const SLASH_NAMES = commands.map((command) => command.data.name);

/** 길드 전용 명령으로 등록합니다(즉시 반영). */
export async function registerGuildCommands(guild) {
  const registered = await guild.commands.set(commandPayloads());

  return registered.map((command) => command.name);
}

export async function handleInteraction(interaction, deps) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commands.find((item) => item.data.name === interaction.commandName);

  if (!command) {
    return;
  }

  const ephemeral = { flags: MessageFlags.Ephemeral };

  try {
    await assertOwner(interaction);

    const deferred = command.defer === true;

    if (deferred) {
      await interaction.deferReply(ephemeral);
    }

    const payload = await command.execute({ interaction, deps });

    if (deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ...ephemeral });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = { content: `⚠️ ${message}`, ...ephemeral };

    deps.log.warn("command rejected", { command: interaction.commandName, message });

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (replyError) {
      deps.log.warn("command reply failed", { err: replyError });
    }
  }
}
