// P12D — 메시지/공지·스레드·초대. 구조(채널/역할)는 건드리지 않습니다(P12E 담당).
//
// 입력 검증은 전부 여기서 다시 합니다. 프론트 입력값을 신뢰하지 않습니다.
import { ChannelType, PermissionFlagsBits } from "discord.js";

import { opError, toKoreanDiscordError } from "./discordErrors.js";

const CONTENT_MAX = 2000;
const EMBED_DESCRIPTION_MAX = 4000;
const EMBED_TITLE_MAX = 256;
const REASON_MAX = 400;
const INVITE_AGE_MAX = 7 * 24 * 60 * 60;
const INVITE_USES_MAX = 100;
const EMBED_COLOR = 0xf7b267;

const SENDABLE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);

const INVITABLE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

function auditReason(value, fallback) {
  const text = String(value ?? "").trim();

  return (text || fallback).slice(0, REASON_MAX);
}

function snowflake(value, label) {
  const id = String(value ?? "").trim();

  if (!/^\d{15,25}$/.test(id)) {
    throw opError(400, `${label} 형식이 올바르지 않아요.`);
  }

  return id;
}

async function resolveChannel(guild, channelId, allowedTypes, label) {
  const id = snowflake(channelId, label);

  let channel = guild.channels.cache.get(id);

  if (!channel) {
    try {
      channel = await guild.channels.fetch(id);
    } catch (error) {
      throw toKoreanDiscordError(error);
    }
  }

  if (!channel) {
    throw opError(404, `${label}를 찾을 수 없어요.`);
  }

  if (!allowedTypes.has(channel.type)) {
    throw opError(400, `${label}는 이 작업에 쓸 수 없는 종류예요(${ChannelType[channel.type] ?? channel.type}).`);
  }

  return channel;
}

function channelSummary(channel) {
  return {
    id: channel.id,
    name: channel.name ?? null,
    type: channel.type,
    typeName: ChannelType[channel.type] ?? String(channel.type),
    parentId: channel.parentId ?? null,
  };
}

function threadSummary(thread) {
  return {
    id: thread.id,
    name: thread.name ?? null,
    type: ChannelType[thread.type] ?? String(thread.type),
    parentId: thread.parentId ?? null,
    parentName: thread.parent?.name ?? null,
    ownerId: thread.ownerId ?? null,
    archived: Boolean(thread.archived),
    locked: Boolean(thread.locked),
    memberCount: thread.memberCount ?? null,
    messageCount: thread.messageCount ?? null,
    createdAt: thread.createdAt ? thread.createdAt.toISOString() : null,
    archivedAt: thread.archivedAt ? thread.archivedAt.toISOString() : null,
    lastMessageAt: thread.lastMessageAt ? thread.lastMessageAt.toISOString() : null,
    url: `https://discord.com/channels/${thread.guildId}/${thread.id}`,
  };
}

/**
 * 공지/메시지 발송. title 이 있으면 embed 로, content 만 있으면 일반 텍스트로 보냅니다.
 * 멘션은 pingEveryone 을 켠 경우에만 @everyone 을 허용합니다.
 */
export async function sendMessage(guild, input = {}, log) {
  const channel = await resolveChannel(guild, input.channelId, SENDABLE_TYPES, "채널");
  const content = String(input.content ?? "").trim().slice(0, CONTENT_MAX);
  const title = String(input.title ?? "").trim().slice(0, EMBED_TITLE_MAX);
  const body = String(input.body ?? "").trim().slice(0, EMBED_DESCRIPTION_MAX);

  if (!content && !title && !body) {
    throw opError(400, "보낼 내용을 입력해 주세요.");
  }

  const payload = {
    content: content || undefined,
    allowedMentions: { parse: input.pingEveryone ? ["everyone"] : [] },
  };

  if (title || body) {
    payload.embeds = [
      {
        title: title || undefined,
        description: body || undefined,
        color: EMBED_COLOR,
        footer: { text: "혼자야 HONJAYA" },
        timestamp: new Date().toISOString(),
      },
    ];
  }

  try {
    if (
      typeof channel.isTextBased === "function" &&
      channel.isTextBased() &&
      guild.members.me &&
      !channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)
    ) {
      throw opError(403, `'${channel.name}' 채널에 메시지를 보낼 권한이 봇에 없어요.`);
    }

    const message = await channel.send(payload);

    log?.info?.("discord message sent", { channelId: channel.id, messageId: message.id });

    return {
      channel: channelSummary(channel),
      messageId: message.id,
      jumpUrl: message.url ?? null,
      kind: title || body ? "ANNOUNCE" : "MESSAGE",
      content,
      embed: payload.embeds?.[0] ?? null,
      pingEveryone: Boolean(input.pingEveryone),
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    throw toKoreanDiscordError(error);
  }
}

export async function deleteMessage(guild, input = {}) {
  const channel = await resolveChannel(guild, input.channelId, SENDABLE_TYPES, "채널");
  const messageId = snowflake(input.messageId, "메시지 ID");
  const reason = auditReason(input.reason, "혼자야 관리자 페이지");

  try {
    const message = await channel.messages.fetch(messageId);

    await message.delete();
  } catch (error) {
    throw toKoreanDiscordError(error);
  }

  // 삭제된 메시지는 사유를 감사 로그에 남길 수 없으므로 우리 로그에만 남깁니다.
  return { channelId: channel.id, messageId, reason, deleted: true };
}

/** 활성 스레드 목록. channelId 를 주면 그 채널의 스레드만 추립니다. */
export async function listThreads(guild, options = {}) {
  const channelId = String(options.channelId ?? "").trim();
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);

  try {
    if (channelId) {
      const channel = await resolveChannel(
        guild,
        channelId,
        new Set([...SENDABLE_TYPES, ChannelType.GuildForum, ChannelType.GuildMedia]),
        "채널",
      );
      const active = await channel.threads.fetchActive();
      const items = [...active.threads.values()].map((thread) => ({
        ...threadSummary(thread),
        parentName: channel.name ?? thread.parent?.name ?? null,
      }));

      return { returned: items.length, channel: channelSummary(channel), threads: items.slice(0, limit) };
    }

    const active = await guild.channels.fetchActiveThreads();
    const items = [...active.threads.values()]
      .sort((a, b) => (b.lastMessageTimestamp ?? 0) - (a.lastMessageTimestamp ?? 0))
      .map((thread) => threadSummary(thread));

    return { returned: items.length, channel: null, threads: items.slice(0, limit) };
  } catch (error) {
    throw toKoreanDiscordError(error);
  }
}

export async function createThread(guild, input = {}) {
  const name = String(input.name ?? "").trim().slice(0, 100);
  const autoArchiveDuration = [60, 1440, 4320, 10080].includes(Number(input.autoArchiveMinutes))
    ? Number(input.autoArchiveMinutes)
    : 1440;

  if (!name) {
    throw opError(400, "스레드 이름을 입력해 주세요.");
  }

  const messageId = String(input.messageId ?? "").trim();

  try {
    if (messageId) {
      const channel = await resolveChannel(guild, input.channelId, SENDABLE_TYPES, "채널");
      const message = await channel.messages.fetch(snowflake(messageId, "메시지 ID"));
      const thread = await message.startThread({ name, autoArchiveDuration, reason: "혼자야 관리자 페이지" });

      return { thread: threadSummary(thread) };
    }

    const channel = await resolveChannel(guild, input.channelId, SENDABLE_TYPES, "채널");
    const thread = await channel.threads.create({
      name,
      autoArchiveDuration,
      type: input.private ? ChannelType.PrivateThread : ChannelType.PublicThread,
      reason: "혼자야 관리자 페이지",
    });

    return { thread: threadSummary(thread) };
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    throw toKoreanDiscordError(error);
  }
}

export async function archiveThread(guild, input = {}) {
  const threadId = snowflake(input.threadId, "스레드 ID");

  try {
    const thread = await guild.channels.fetch(threadId);

    if (!thread || typeof thread.setArchived !== "function") {
      throw opError(400, "스레드가 아니에요.");
    }

    const updated = await thread.setArchived(true, "혼자야 관리자 페이지");

    return { thread: threadSummary(updated ?? thread) };
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    throw toKoreanDiscordError(error);
  }
}

export async function listInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const items = [...invites.values()]
      .map((invite) => ({
        code: invite.code,
        url: invite.url,
        channelId: invite.channel?.id ?? invite.channelId ?? null,
        channelName: invite.channel?.name ?? null,
        inviterId: invite.inviter?.id ?? null,
        inviterName: invite.inviter?.tag ?? invite.inviter?.username ?? null,
        uses: invite.uses ?? 0,
        maxUses: invite.maxUses ?? 0,
        maxAge: invite.maxAge ?? 0,
        temporary: Boolean(invite.temporary),
        createdAt: invite.createdAt ? invite.createdAt.toISOString() : null,
        expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
      }))
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    return { returned: items.length, invites: items };
  } catch (error) {
    throw toKoreanDiscordError(error);
  }
}

export async function createInvite(guild, input = {}) {
  const channel = await resolveChannel(guild, input.channelId, INVITABLE_TYPES, "채널");
  const rawAge = Number(input.maxAgeSeconds);
  const rawUses = Number(input.maxUses);
  const maxAge = Number.isFinite(rawAge) ? Math.min(Math.max(Math.trunc(rawAge), 0), INVITE_AGE_MAX) : 86_400;
  const maxUses = Number.isFinite(rawUses) ? Math.min(Math.max(Math.trunc(rawUses), 0), INVITE_USES_MAX) : 0;

  try {
    if (
      guild.members.me &&
      !channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.CreateInstantInvite)
    ) {
      throw opError(403, `'${channel.name}' 채널에 초대 링크를 만들 권한이 봇에 없어요.`);
    }

    const invite = await channel.createInvite({
      maxAge,
      maxUses,
      temporary: Boolean(input.temporary),
      unique: input.unique !== false,
      reason: auditReason(input.reason, "혼자야 관리자 페이지"),
    });

    return {
      invite: {
        code: invite.code,
        url: invite.url,
        channelId: channel.id,
        channelName: channel.name ?? null,
        maxAge: invite.maxAge ?? maxAge,
        maxUses: invite.maxUses ?? maxUses,
        temporary: Boolean(invite.temporary),
        createdAt: invite.createdAt ? invite.createdAt.toISOString() : null,
        expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
      },
    };
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    throw toKoreanDiscordError(error);
  }
}

export async function deleteInvite(guild, input = {}) {
  const code = String(input.code ?? "").trim();

  if (!/^[A-Za-z0-9-]{2,32}$/.test(code)) {
    throw opError(400, "초대 코드 형식이 올바르지 않아요.");
  }

  try {
    await guild.invites.delete(code, auditReason(input.reason, "혼자야 관리자 페이지"));
  } catch (error) {
    throw toKoreanDiscordError(error);
  }

  return { code, deleted: true };
}

/** 우리 쪽 공지/메시지 기록. 실패해도 발송 자체는 되돌리지 않습니다. */
export async function recordMessage(pool, entry, log) {
  try {
    const { rows } = await pool.query(
      `insert into public.discord_messages (channel_id, message_id, kind, embed, created_by)
       values ($1, $2, $3, $4::jsonb, $5)
       returning id, channel_id, message_id, kind, created_at`,
      [
        String(entry.channelId ?? ""),
        String(entry.messageId ?? ""),
        String(entry.kind ?? "ANNOUNCE").slice(0, 32),
        entry.embed ? JSON.stringify(entry.embed) : null,
        String(entry.createdBy ?? "system").slice(0, 100),
      ],
    );

    return rows[0] ?? null;
  } catch (error) {
    log?.warn?.("discord_messages insert failed", { err: error });

    return null;
  }
}
