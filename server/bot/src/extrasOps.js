// P12F — 확장 기능: 이모지/스티커, AutoMod 규칙, 예약 이벤트.
//
// 구조(역할/채널) 편집과 달리 초안·미리보기 없이 즉시 반영됩니다.
// 입력값은 프론트를 신뢰하지 않고 전부 여기서 다시 검증합니다.
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} from "discord.js";

import { opError, toKoreanDiscordError } from "./discordErrors.js";
import {
  autoModRuleToPlain,
  emojiToPlain,
  scheduledEventToPlain,
  stickerToPlain,
} from "./structure.js";

const REASON = "혼자야 관리자 웹";
const EMOJI_NAME_RE = /^[A-Za-z0-9_]{2,32}$/;
const IMAGE_URL_MAX = 512;
const STICKER_NAME_MAX = 30;
const EVENT_NAME_MAX = 100;
const EVENT_DESCRIPTION_MAX = 1000;
const EVENT_LOCATION_MAX = 100;
const AUTOMOD_NAME_MAX = 100;
const KEYWORD_MAX_COUNT = 100;
const KEYWORD_MAX_LENGTH = 60;
const REGEX_MAX_COUNT = 10;
const REGEX_MAX_LENGTH = 260;
const TIMEOUT_MAX_SECONDS = 28 * 24 * 60 * 60;

const TRIGGER_TYPES = new Set([
  AutoModerationRuleTriggerType.Keyword,
  AutoModerationRuleTriggerType.Spam,
  AutoModerationRuleTriggerType.KeywordPreset,
  AutoModerationRuleTriggerType.MentionSpam,
  AutoModerationRuleTriggerType.MemberProfile,
]);

const PRESET_TYPES = new Set([1, 2, 3]);
const EVENT_ENTITY_TYPES = new Set([
  GuildScheduledEventEntityType.Voice,
  GuildScheduledEventEntityType.External,
]);

const VOICE_EVENT_CHANNEL_TYPES = new Set([2, 13]);

function snowflake(value, label) {
  const id = String(value ?? "").trim();

  if (!/^\d{15,25}$/.test(id)) {
    throw opError(400, `${label} 형식이 올바르지 않아요.`);
  }

  return id;
}

function text(value, label, max, { required = true } = {}) {
  const raw = typeof value === "string" ? value : "";

  if (!required && raw.trim() === "") {
    return "";
  }

  const trimmed = raw.trim();

  if (trimmed === "") {
    throw opError(400, `${label} 값이 필요해요.`);
  }

  if (trimmed.length > max) {
    throw opError(400, `${label} 길이는 ${max}자까지 쓸 수 있어요.`);
  }

  return trimmed;
}

function uniqueSnowflakes(value, label) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw opError(400, `${label} 목록 형식이 올바르지 않아요.`);
  }

  return [...new Set(value.map((item) => snowflake(item, label)))];
}

function stringList(value, label, maxCount, maxLength) {
  if (!Array.isArray(value)) {
    throw opError(400, `${label} 목록 형식이 올바르지 않아요.`);
  }

  const list = [
    ...new Set(
      value.map((item) => String(item ?? "").trim()).filter((item) => item !== ""),
    ),
  ];

  if (list.length > maxCount) {
    throw opError(400, `${label} 항목은 ${maxCount}개까지 넣을 수 있어요.`);
  }

  const tooLong = list.find((item) => item.length > maxLength);

  if (tooLong) {
    throw opError(400, `${label} 항목 하나는 ${maxLength}자까지 쓸 수 있어요.`);
  }

  return list;
}

async function fetchOne(manager, id, label) {
  try {
    const item = await manager.fetch(id);

    if (!item) {
      throw opError(404, `${label}를 찾을 수 없어요.`);
    }

    return item;
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    throw toKoreanDiscordError(error);
  }
}

function wrap(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error?.status) {
        throw error;
      }

      throw toKoreanDiscordError(error);
    }
  };
}

// ── 조회 ──────────────────────────────────────────────────────────────────

async function readSection(loader, label, log) {
  try {
    const collection = await loader();

    return { items: collection ? [...collection.values()] : [], error: null };
  } catch (error) {
    log?.warn?.("extras fetch failed", { scope: label, err: error });

    return {
      items: [],
      error: toKoreanDiscordError(error).message,
    };
  }
}

export const listExtras = wrap(async (guild, log) => {
  const [emojis, stickers, rules, events] = await Promise.all([
    readSection(() => guild.emojis.fetch(), "emojis", log),
    readSection(() => guild.stickers.fetch(), "stickers", log),
    readSection(() => guild.autoModerationRules.fetch(), "automod", log),
    readSection(() => guild.scheduledEvents.fetch(), "events", log),
  ]);

  return {
    emojis: emojis.items.map(emojiToPlain).sort((a, b) => a.name.localeCompare(b.name)),
    stickers: stickers.items
      .map(stickerToPlain)
      .sort((a, b) => a.name.localeCompare(b.name)),
    autoModeration: rules.items
      .map(autoModRuleToPlain)
      .sort((a, b) => a.name.localeCompare(b.name)),
    scheduledEvents: events.items
      .map(scheduledEventToPlain)
      .sort((a, b) => String(a.scheduledStartAt).localeCompare(String(b.scheduledStartAt))),
    errors: {
      emojis: emojis.error,
      stickers: stickers.error,
      autoModeration: rules.error,
      scheduledEvents: events.error,
    },
  };
});

// ── 이모지 ────────────────────────────────────────────────────────────────

export const createEmoji = wrap(async (guild, body) => {
  const name = String(body?.name ?? "").trim();
  const imageUrl = String(body?.imageUrl ?? "").trim();

  if (!EMOJI_NAME_RE.test(name)) {
    throw opError(400, "이모지 이름은 영문·숫자·밑줄로 된 2~32자여야 해요.");
  }

  if (!/^https?:\/\/\S+$/i.test(imageUrl) || imageUrl.length > IMAGE_URL_MAX) {
    throw opError(400, "이미지 주소는 http(s) 로 시작하는 URL 이어야 해요.");
  }

  const emoji = await guild.emojis.create({
    attachment: imageUrl,
    name,
    reason: REASON,
  });

  return { emoji: emojiToPlain(emoji) };
});

export const updateEmoji = wrap(async (guild, body) => {
  const emojiId = snowflake(body?.emojiId, "이모지 ID");
  const name = String(body?.name ?? "").trim();

  if (!EMOJI_NAME_RE.test(name)) {
    throw opError(400, "이모지 이름은 영문·숫자·밑줄로 된 2~32자여야 해요.");
  }

  const emoji = await fetchOne(guild.emojis, emojiId, "이모지");
  const updated = await emoji.setName(name, REASON);

  return { emoji: emojiToPlain(updated) };
});

export const deleteEmoji = wrap(async (guild, body) => {
  const emojiId = snowflake(body?.emojiId, "이모지 ID");
  const emoji = await fetchOne(guild.emojis, emojiId, "이모지");

  await emoji.delete(REASON);

  return { deletedId: emojiId };
});

// ── 스티커 ────────────────────────────────────────────────────────────────
// 스티커 추가는 파일 업로드(multipart)가 필요해서 웹에서 다루지 않습니다.
// 이름·설명 수정과 삭제만 지원합니다.

export const updateSticker = wrap(async (guild, body) => {
  const stickerId = snowflake(body?.stickerId, "스티커 ID");
  const name = text(body?.name, "스티커 이름", STICKER_NAME_MAX);
  const sticker = await fetchOne(guild.stickers, stickerId, "스티커");
  const updated = await sticker.edit({ name, reason: REASON });

  return { sticker: stickerToPlain(updated) };
});

export const deleteSticker = wrap(async (guild, body) => {
  const stickerId = snowflake(body?.stickerId, "스티커 ID");
  const sticker = await fetchOne(guild.stickers, stickerId, "스티커");

  await sticker.delete(REASON);

  return { deletedId: stickerId };
});

// ── AutoMod ───────────────────────────────────────────────────────────────

function buildTriggerMetadata(triggerType, source) {
  const metadata = source && typeof source === "object" ? source : {};

  if (triggerType === AutoModerationRuleTriggerType.Keyword) {
    const keywords = Array.isArray(metadata.keywords)
      ? stringList(metadata.keywords, "차단 키워드", KEYWORD_MAX_COUNT, KEYWORD_MAX_LENGTH)
      : [];

    const regexPatterns = Array.isArray(metadata.regexPatterns)
      ? metadata.regexPatterns
          .map((item) => String(item ?? "").trim())
          .filter((item) => item !== "")
      : [];

    if (keywords.length === 0 && regexPatterns.length === 0) {
      throw opError(400, "차단 키워드나 정규식을 1개 이상 입력해 주세요.");
    }

    if (regexPatterns.length > REGEX_MAX_COUNT) {
      throw opError(400, `정규식은 ${REGEX_MAX_COUNT}개까지 넣을 수 있어요.`);
    }

    const tooLongRegex = regexPatterns.find((item) => item.length > REGEX_MAX_LENGTH);

    if (tooLongRegex) {
      throw opError(400, `정규식 한 개는 ${REGEX_MAX_LENGTH}자까지 쓸 수 있어요.`);
    }

    if (regexPatterns.length > 0) {
      for (const pattern of regexPatterns) {
        try {
          new RegExp(pattern);
        } catch {
          throw opError(400, `정규식 형식이 올바르지 않아요: ${pattern}`);
        }
      }
    }

    return { keywordFilter: keywords, regexPatterns };
  }

  if (triggerType === AutoModerationRuleTriggerType.KeywordPreset) {
    const presets = Array.isArray(metadata.presets)
      ? metadata.presets.map((item) => Number(item)).filter((item) => PRESET_TYPES.has(item))
      : [];

    if (presets.length === 0) {
      throw opError(400, "사전 설정 필터를 1개 이상 골라 주세요.");
    }

    const allowList = Array.isArray(metadata.allowList)
      ? metadata.allowList
          .map((item) => String(item ?? "").trim())
          .filter((item) => item !== "")
      : [];

    return allowList.length > 0
      ? { presets: [...new Set(presets)], allowList }
      : { presets: [...new Set(presets)] };
  }

  if (triggerType === AutoModerationRuleTriggerType.MentionSpam) {
    const mentionLimit = Number(metadata.mentionLimit);

    if (!Number.isFinite(mentionLimit) || mentionLimit < 1 || mentionLimit > 50) {
      throw opError(400, "멘션 제한은 1~50 사이 숫자여야 해요.");
    }

    return {
      mentionTotalLimit: Math.trunc(mentionLimit),
      mentionRaidProtectionEnabled: metadata.mentionRaidProtection === true,
    };
  }

  // Spam / MemberProfile 은 추가 메타데이터가 없습니다.
  return {};
}

function buildActions(source) {
  const actions = Array.isArray(source) ? source : [];

  if (actions.length === 0) {
    throw opError(400, "규칙 동작을 1개 이상 골라 주세요.");
  }

  return actions.map((action) => {
    const type = Number(action?.type);

    if (type === AutoModerationActionType.BlockMessage) {
      return { type };
    }

    if (type === AutoModerationActionType.SendAlertMessage) {
      return {
        type,
        metadata: { channelId: snowflake(action?.channelId, "알림 채널") },
      };
    }

    if (type === AutoModerationActionType.Timeout) {
      const duration = Number(action?.durationSeconds);

      if (!Number.isFinite(duration) || duration < 1 || duration > TIMEOUT_MAX_SECONDS) {
        throw opError(400, "타임아웃 시간은 1초~28일 사이여야 해요.");
      }

      return { type, metadata: { durationSeconds: Math.trunc(duration) } };
    }

    throw opError(400, "지원하지 않는 규칙 동작이에요.");
  });
}

function automodPayload(body) {
  const name = text(body?.name, "규칙 이름", AUTOMOD_NAME_MAX);
  const triggerType = Number(body?.triggerType);
  const enabled = body?.enabled !== false;

  if (!TRIGGER_TYPES.has(triggerType)) {
    throw opError(400, "지원하지 않는 트리거 종류예요.");
  }

  const eventType =
    triggerType === AutoModerationRuleTriggerType.MemberProfile
      ? AutoModerationRuleEventType.MemberUpdate
      : AutoModerationRuleEventType.MessageSend;

  const payload = {
    name,
    eventType,
    enabled,
    triggerMetadata: buildTriggerMetadata(triggerType, body?.triggerMetadata),
    actions: buildActions(body?.actions),
    exemptRoles: uniqueSnowflakes(body?.exemptRoles, "제외 역할"),
    exemptChannels: uniqueSnowflakes(body?.exemptChannels, "제외 채널"),
    reason: REASON,
  };

  return { payload, triggerType };
}

export const createAutoModRule = wrap(async (guild, body) => {
  const { payload, triggerType } = automodPayload(body);
  const rule = await guild.autoModerationRules.create({ ...payload, triggerType });

  return { rule: autoModRuleToPlain(rule) };
});

export const updateAutoModRule = wrap(async (guild, body) => {
  const ruleId = snowflake(body?.ruleId, "규칙 ID");
  const rule = await fetchOne(guild.autoModerationRules, ruleId, "AutoMod 규칙");
  const { payload } = automodPayload(body);
  const updated = await rule.edit(payload);

  return { rule: autoModRuleToPlain(updated) };
});

export const setAutoModEnabled = wrap(async (guild, body) => {
  const ruleId = snowflake(body?.ruleId, "규칙 ID");
  const rule = await fetchOne(guild.autoModerationRules, ruleId, "AutoMod 규칙");
  const updated = await rule.setEnabled(body?.enabled !== false, REASON);

  return { rule: autoModRuleToPlain(updated) };
});

export const deleteAutoModRule = wrap(async (guild, body) => {
  const ruleId = snowflake(body?.ruleId, "규칙 ID");
  const rule = await fetchOne(guild.autoModerationRules, ruleId, "AutoMod 규칙");

  await rule.delete(REASON);

  return { deletedId: ruleId };
});

// ── 예약 이벤트 ───────────────────────────────────────────────────────────

function parseDate(value, label) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    throw opError(400, `${label} 값이 필요해요.`);
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    throw opError(400, `${label} 형식이 올바르지 않아요.`);
  }

  return date;
}

async function eventPayload(body) {
  const name = text(body?.name, "이벤트 이름", EVENT_NAME_MAX);
  const description = String(body?.description ?? "").trim();

  if (description.length > EVENT_DESCRIPTION_MAX) {
    throw opError(
      400,
      `이벤트 설명은 ${EVENT_DESCRIPTION_MAX}자까지 쓸 수 있어요.`,
    );
  }

  const entityType = Number(body?.entityType);

  if (!EVENT_ENTITY_TYPES.has(entityType)) {
    throw opError(400, "이벤트 장소 종류는 음성 채널 또는 외부 장소만 고를 수 있어요.");
  }

  const startAt = parseDate(body?.startAt, "시작 시각");
  const endAt = body?.endAt ? parseDate(body.endAt, "종료 시각") : null;

  if (endAt && endAt.getTime() <= startAt.getTime()) {
    throw opError(400, "종료 시각은 시작 시각보다 뒤여야 해요.");
  }

  const payload = {
    name,
    description,
    scheduledStartTime: startAt.toISOString(),
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType,
    reason: REASON,
  };

  if (entityType === GuildScheduledEventEntityType.External) {
    const location = text(body?.location, "장소", EVENT_LOCATION_MAX);

    if (!endAt) {
      throw opError(400, "외부 장소 이벤트는 종료 시각이 필요해요.");
    }

    payload.scheduledEndTime = endAt.toISOString();
    payload.entityMetadata = { location };
  } else {
    const channelId = snowflake(body?.channelId, "음성 채널");
    const channel = await resolveVoiceChannel(guild, channelId);

    payload.channelId = channel.id;

    if (endAt) {
      payload.scheduledEndTime = endAt.toISOString();
    }
  }

  return payload;
}

async function resolveVoiceChannel(guild, channelId) {
  let channel = guild.channels.cache.get(channelId);

  if (!channel) {
    try {
      channel = await guild.channels.fetch(channelId);
    } catch (error) {
      throw toKoreanDiscordError(error);
    }
  }

  if (!channel) {
    throw opError(404, "음성 채널을 찾을 수 없어요.");
  }

  if (!VOICE_EVENT_CHANNEL_TYPES.has(channel.type)) {
    throw opError(400, "이벤트는 음성 채널이나 스테이지 채널에서만 열 수 있어요.");
  }

  return channel;
}

export const createScheduledEvent = wrap(async (guild, body) => {
  const payload = await eventPayload(body);
  const created = await guild.scheduledEvents.create(payload);

  return { event: scheduledEventToPlain(created) };
});

export const updateScheduledEvent = wrap(async (guild, body) => {
  const eventId = snowflake(body?.eventId, "이벤트 ID");
  const existing = await fetchOne(guild.scheduledEvents, eventId, "예약 이벤트");
  const payload = await eventPayload(body);
  const updated = await existing.edit(payload);

  return { event: scheduledEventToPlain(updated) };
});

export const deleteScheduledEvent = wrap(async (guild, body) => {
  const eventId = snowflake(body?.eventId, "이벤트 ID");
  const existing = await fetchOne(guild.scheduledEvents, eventId, "예약 이벤트");

  await existing.delete();

  return { deletedId: eventId };
});
