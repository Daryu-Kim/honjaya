import { createHash } from "node:crypto";

import { ChannelType } from "discord.js";

// 키 정렬 + BigInt 문자열화. 같은 구조는 언제나 같은 문자열 → 같은 해시가 나옵니다.
function normalize(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (typeof value === "object") {
    const out = {};

    for (const key of Object.keys(value).sort()) {
      const normalized = normalize(value[key]);

      if (normalized !== undefined) {
        out[key] = normalized;
      }
    }

    return out;
  }

  return value;
}

export function stableStringify(value) {
  return JSON.stringify(normalize(value));
}

export function hashStructure(structure) {
  return createHash("sha256").update(stableStringify(structure)).digest("hex");
}

function roleToPlain(role) {
  const colors = role.colors ?? null;

  return {
    id: role.id,
    name: role.name,
    position: role.position,
    color: role.color,
    colors: colors
      ? {
          primaryColor: colors.primaryColor,
          secondaryColor: colors.secondaryColor,
          tertiaryColor: colors.tertiaryColor,
        }
      : null,
    hoist: role.hoist,
    mentionable: role.mentionable,
    managed: role.managed,
    permissions: role.permissions.bitfield.toString(),
    unicodeEmoji: role.unicodeEmoji ?? null,
    iconUrl: role.iconURL({ extension: "png", size: 64 }) ?? null,
    isEveryone: role.id === role.guild.id,
  };
}

function channelToPlain(channel) {
  const overwrites = channel.permissionOverwrites?.cache;

  return {
    id: channel.id,
    type: channel.type,
    typeName: ChannelType[channel.type] ?? String(channel.type),
    name: channel.name ?? null,
    parentId: channel.parentId ?? null,
    position: channel.position ?? 0,
    topic: channel.topic ?? null,
    nsfw: channel.nsfw ?? null,
    rateLimitPerUser: channel.rateLimitPerUser ?? null,
    bitrate: channel.bitrate ?? null,
    userLimit: channel.userLimit ?? null,
    defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration ?? null,
    permissionOverwrites: overwrites
      ? [...overwrites.values()]
          .map((item) => ({
            id: item.id,
            type: item.type,
            allow: item.allow.bitfield.toString(),
            deny: item.deny.bitfield.toString(),
          }))
          .sort((a, b) => a.id.localeCompare(b.id))
      : [],
  };
}

function emojiToPlain(emoji) {
  return {
    id: emoji.id,
    name: emoji.name ?? "",
    animated: Boolean(emoji.animated),
    managed: Boolean(emoji.managed),
    available: emoji.available ?? null,
  };
}

function stickerToPlain(sticker) {
  return {
    id: sticker.id,
    name: sticker.name ?? "",
    description: sticker.description ?? "",
    tags: sticker.tags ?? "",
    format: sticker.format ?? null,
  };
}

function autoModRuleToPlain(rule) {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    eventType: rule.eventType,
    triggerType: rule.triggerType,
    triggerMetadata: rule.triggerMetadata ?? null,
    actions: rule.actions ?? [],
    exemptRoles: rule.exemptRoles ? [...rule.exemptRoles.keys()].sort() : [],
    exemptChannels: rule.exemptChannels ? [...rule.exemptChannels.keys()].sort() : [],
  };
}

function scheduledEventToPlain(event) {
  return {
    id: event.id,
    name: event.name,
    description: event.description ?? "",
    scheduledStartAt: event.scheduledStartAt ? event.scheduledStartAt.toISOString() : null,
    scheduledEndAt: event.scheduledEndAt ? event.scheduledEndAt.toISOString() : null,
    status: event.status,
    entityType: event.entityType,
    channelId: event.channelId ?? null,
    location: event.entityMetadata?.location ?? null,
  };
}

async function safeFetch(loader, label, log) {
  try {
    const collection = await loader();

    return collection ? [...collection.values()] : [];
  } catch (error) {
    log?.warn?.("structure fetch failed", { scope: label, err: error });

    return [];
  }
}

/**
 * 길드의 현재 구조를 JSON 한 덩어리로 읽습니다.
 * 스냅샷·3-way diff·적용(apply) 엔진이 모두 이 형태를 기준으로 동작합니다.
 */
export async function readStructure(guild, log) {
  const roles = [...guild.roles.cache.values()]
    .sort((a, b) => b.position - a.position || a.id.localeCompare(b.id))
    .map(roleToPlain);

  const channels = [...guild.channels.cache.values()]
    .map(channelToPlain)
    .sort(
      (a, b) =>
        String(a.parentId ?? "").localeCompare(String(b.parentId ?? "")) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );

  const autoModeration = (
    await safeFetch(() => guild.autoModerationRules.fetch(), "automod", log)
  ).map(autoModRuleToPlain);

  const scheduledEvents = (
    await safeFetch(() => guild.scheduledEvents.fetch(), "events", log)
  ).map(scheduledEventToPlain);

  return {
    guild: {
      id: guild.id,
      name: guild.name,
      ownerId: guild.ownerId,
      iconUrl: guild.iconURL({ extension: "png", size: 128 }) ?? null,
      preferredLocale: guild.preferredLocale ?? null,
      verificationLevel: guild.verificationLevel ?? null,
      explicitContentFilter: guild.explicitContentFilter ?? null,
      defaultMessageNotifications: guild.defaultMessageNotifications ?? null,
      afkChannelId: guild.afkChannelId ?? null,
      afkTimeout: guild.afkTimeout ?? null,
      systemChannelId: guild.systemChannelId ?? null,
      rulesChannelId: guild.rulesChannelId ?? null,
      publicUpdatesChannelId: guild.publicUpdatesChannelId ?? null,
      features: [...(guild.features ?? [])].sort(),
    },
    roles,
    channels,
    emojis: [...guild.emojis.cache.values()]
      .map(emojiToPlain)
      .sort((a, b) => a.id.localeCompare(b.id)),
    stickers: [...guild.stickers.cache.values()]
      .map(stickerToPlain)
      .sort((a, b) => a.id.localeCompare(b.id)),
    autoModeration: autoModeration.sort((a, b) => a.id.localeCompare(b.id)),
    scheduledEvents: scheduledEvents.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function summarizeStructure(structure) {
  const byType = {};

  for (const channel of structure.channels) {
    byType[channel.typeName] = (byType[channel.typeName] ?? 0) + 1;
  }

  return {
    guildId: structure.guild.id,
    guildName: structure.guild.name,
    roles: structure.roles.length,
    channels: structure.channels.length,
    channelsByType: byType,
    emojis: structure.emojis.length,
    stickers: structure.stickers.length,
    autoModeration: structure.autoModeration.length,
    scheduledEvents: structure.scheduledEvents.length,
  };
}
