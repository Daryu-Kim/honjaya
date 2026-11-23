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

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("상태")
      .setDescription("혼자야 봇과 서버 연결 상태를 확인합니다."),
    async execute({ deps }) {
      const status = deps.service.describe();
      const depth = await deps.queue.depth();
      const snapshot = status.guildId ? await lastSnapshot(deps.pool, status.guildId) : null;

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

    const deferred = command.data.name === "스냅샷";

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
