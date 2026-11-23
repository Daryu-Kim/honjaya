// P12E — 실행 계획(discordApply.js)의 op 한 건을 실제 Discord 에 적용합니다.
//
// api 가 temp id(new:...) 를 이미 실제 id 로 바꿔서 보내므로, 여기서는 id 해석과
// Discord 가 거부할 요청을 미리 막는 가드레일(plan.md §D.8)만 담당합니다.
import { ChannelType } from "discord.js";

import { opError, toKoreanDiscordError } from "./discordErrors.js";
import { decodePermissions } from "./guildView.js";

const REASON = "혼자야 관리자 페이지 · 구조 편집";
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 5_000;

// 새로 만들 수 있는 채널 종류. 나머지(Directory/Stage/스레드 등)는 생성 API 자체가 없습니다.
const CREATABLE_TYPES = new Set([
  "GuildText",
  "GuildVoice",
  "GuildCategory",
  "GuildAnnouncement",
  "GuildForum",
  "GuildMedia",
]);
const TEXTUAL_TYPES = new Set(["GuildText", "GuildAnnouncement", "GuildForum", "GuildMedia"]);
const VOICE_TYPES = new Set(["GuildVoice", "GuildStageVoice"]);
const GUILD_NUMERIC_FIELDS = [
  "verificationLevel",
  "explicitContentFilter",
  "defaultMessageNotifications",
  "afkTimeout",
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** discord.js 는 Discord 응답의 초 단위 retry_after 를 ms 로 바꿔 담아줍니다. 둘 다 대비합니다. */
function retryAfterMs(error) {
  const seconds = Number(error?.rawError?.retry_after);

  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.round(seconds * 1000);
  }

  const millis = Number(error?.retryAfter);

  return Number.isFinite(millis) && millis > 0 ? Math.round(millis) : 1_000;
}

/**
 * 429 만 짧게 재시도합니다. 403 은 재시도해도 같은 결과이고, 반복하면 Discord 가 IP 를
 * 차단하므로(10,000 invalid requests / 10분) 그대로 올려서 실행 자체를 멈춥니다.
 */
async function withRateLimitRetry(action, { log, label }) {
  let attempt = 0;

  for (;;) {
    try {
      return await action();
    } catch (error) {
      const status = Number(error?.httpStatus ?? error?.status) || 0;
      const waitMs = retryAfterMs(error);
      const retriable = status === 429 && attempt < MAX_RATE_LIMIT_RETRIES;
      // 대기가 길면 재시도하지 않습니다(요청이 수십 초 붙잡히는 편이 더 나쁩니다).
      const waitable = waitMs <= MAX_RETRY_WAIT_MS;

      if (!retriable || !waitable) {
        throw error;
      }

      attempt += 1;
      log?.warn?.("struct op rate limited, retrying", { label, attempt, waitMs });
      await sleep(waitMs);
    }
  }
}

function permissionBits(value, label) {
  const text = typeof value === "string" ? value.trim() : String(value ?? "0");
  const normalized = text === "" ? "0" : text;

  if (!/^\d{1,25}$/.test(normalized)) {
    throw opError(400, `${label} 값이 올바르지 않아요.`);
  }

  return BigInt(normalized);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function requireName(value, label, max = 100) {
  const name = String(value ?? "").trim();

  if (name.length < 1 || name.length > max) {
    throw opError(400, `${label}은(는) 1~${max}자로 입력해 주세요.`);
  }

  return name;
}

function requireRole(guild, id) {
  const role = guild.roles.cache.get(String(id ?? ""));

  if (!role) {
    throw opError(404, "역할을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.", 10011);
  }

  return role;
}

function requireChannel(guild, id) {
  const channel = guild.channels.cache.get(String(id ?? ""));

  if (!channel) {
    throw opError(404, "채널을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.", 10004);
  }

  return channel;
}

function botTopPosition(guild) {
  return guild.members.me?.roles?.highest?.position ?? -1;
}

/**
 * 봇이 손댈 수 없는 역할을 걸러냅니다. Discord 도 403 을 주지만, 먼저 막아야
 * 불필요한 invalid request 를 쌓지 않습니다(plan.md §D.9).
 */
function assertRoleWritable(guild, role) {
  if (role.id === guild.id) {
    throw opError(400, "@everyone 역할은 이름·색상·정렬을 바꿀 수 없어요. 권한만 수정할 수 있습니다.");
  }

  if (role.managed) {
    throw opError(400, `'${role.name}' 역할은 다른 앱이 관리하고 있어 수정할 수 없어요.`);
  }

  if (role.position >= botTopPosition(guild)) {
    throw opError(
      403,
      `'${role.name}' 역할이 봇 역할보다 위에 있어 수정할 수 없어요. Discord 에서 봇 역할을 위로 올려 주세요.`,
    );
  }
}

function overwriteOptions(allow, deny) {
  const options = {};

  for (const name of decodePermissions(allow.toString())) {
    options[name] = true;
  }

  for (const name of decodePermissions(deny.toString())) {
    options[name] = false;
  }

  return options;
}

function overwriteTypeOf(payload) {
  if (Number(payload.overwriteType) === 1 || payload.kind === "member") {
    return 1;
  }

  return 0;
}

function normalizeOverwrite(overwrite) {
  return {
    id: String(overwrite?.id ?? ""),
    type: Number(overwrite?.type) === 1 ? 1 : 0,
    allow: permissionBits(overwrite?.allow ?? "0", "허용 권한").toString(),
    deny: permissionBits(overwrite?.deny ?? "0", "거부 권한").toString(),
  };
}

const handlers = {
  async "guild:patch"({ guild, payload }) {
    const patch = {};

    if ("name" in payload) {
      patch.name = requireName(payload.name, "서버 이름");
    }

    for (const key of GUILD_NUMERIC_FIELDS) {
      if (key in payload && payload[key] !== null && payload[key] !== undefined) {
        const value = Number(payload[key]);

        if (!Number.isInteger(value) || value < 0) {
          throw opError(400, `서버 설정 값(${key})이 올바르지 않아요.`);
        }

        patch[key] = value;
      }
    }

    if ("afkChannelId" in payload) {
      patch.afkChannelId = payload.afkChannelId ? String(payload.afkChannelId) : null;

      if (!patch.afkChannelId) {
        patch.afkTimeout = null;
      }
    }

    if ("systemChannelId" in payload) {
      patch.systemChannelId = payload.systemChannelId ? String(payload.systemChannelId) : null;
    }

    if (Object.keys(patch).length === 0) {
      throw opError(400, "변경할 서버 설정이 없어요.");
    }

    const updated = await guild.edit(patch, REASON);

    return { id: updated.id, name: updated.name };
  },

  async "role:create"({ guild, payload }) {
    const permissions = permissionBits(payload.permissions ?? "0", "역할 권한");
    const role = await guild.roles.create({
      name: requireName(payload.name, "역할 이름"),
      color: clampNumber(payload.color, 0, 0xffffff, 0),
      hoist: Boolean(payload.hoist),
      mentionable: Boolean(payload.mentionable),
      permissions,
      reason: REASON,
    });

    return { id: role.id, name: role.name };
  },

  async "role:patch"({ guild, targetId, payload }) {
    const role = requireRole(guild, targetId);
    const isEveryone = role.id === guild.id;
    const patch = {};

    if ("name" in payload) {
      const name = requireName(payload.name, "역할 이름");

      if (name !== role.name) {
        if (isEveryone) {
          throw opError(400, "@everyone 역할의 이름은 바꿀 수 없어요.");
        }

        patch.name = name;
      }
    }

    if ("color" in payload) {
      const color = clampNumber(payload.color, 0, 0xffffff, 0);

      if (color !== role.color) {
        if (isEveryone) {
          throw opError(400, "@everyone 역할의 색상은 바꿀 수 없어요.");
        }

        patch.color = color;
      }
    }

    for (const key of ["hoist", "mentionable"]) {
      if (key in payload && Boolean(payload[key]) !== role[key]) {
        if (isEveryone) {
          throw opError(400, `@everyone 역할의 ${key} 값은 바꿀 수 없어요.`);
        }

        patch[key] = Boolean(payload[key]);
      }
    }

    if ("permissions" in payload) {
      const permissions = permissionBits(payload.permissions, "역할 권한");

      if (permissions !== role.permissions.bitfield) {
        patch.permissions = permissions;
      }
    }

    if (Object.keys(patch).length === 0) {
      return { id: role.id, skipped: true };
    }

    if (!isEveryone) {
      assertRoleWritable(guild, role);
    }

    const updated = await role.edit(patch, REASON);

    return { id: updated.id, name: updated.name };
  },

  async "role:position"({ guild, targetId, payload }) {
    const role = requireRole(guild, targetId);

    assertRoleWritable(guild, role);

    const ceiling = Math.max(botTopPosition(guild) - 1, 0);
    const position = clampNumber(payload.position, 0, ceiling, role.position);

    if (position === role.position) {
      return { id: role.id, position, skipped: true };
    }

    const updated = await role.setPosition(position, { reason: REASON });

    return { id: updated.id, position: updated.position };
  },

  async "role:delete"({ guild, targetId }) {
    const role = requireRole(guild, targetId);

    assertRoleWritable(guild, role);
    await role.delete(REASON);

    return { id: role.id, name: role.name };
  },

  async "channel:create"({ guild, payload }) {
    const typeName = String(payload.typeName ?? "GuildText");

    if (!CREATABLE_TYPES.has(typeName)) {
      throw opError(400, `이 종류의 채널은 새로 만들 수 없어요: ${typeName}`);
    }

    const options = {
      name: requireName(payload.name, "채널 이름"),
      type: ChannelType[typeName],
      reason: REASON,
    };

    if (payload.parentId) {
      const parent = requireChannel(guild, payload.parentId);

      if (parent.type !== ChannelType.GuildCategory) {
        throw opError(400, `'${parent.name}' 는 카테고리가 아니에요.`);
      }

      options.parent = parent.id;
    }

    if (TEXTUAL_TYPES.has(typeName)) {
      if ("topic" in payload) {
        options.topic = payload.topic ? String(payload.topic).slice(0, 1024) : null;
      }

      if ("nsfw" in payload) {
        options.nsfw = Boolean(payload.nsfw);
      }

      if ("rateLimitPerUser" in payload) {
        options.rateLimitPerUser = clampNumber(payload.rateLimitPerUser, 0, 21_600, 0);
      }

      if (payload.defaultAutoArchiveDuration) {
        options.defaultAutoArchiveDuration = Number(payload.defaultAutoArchiveDuration);
      }
    }

    if (VOICE_TYPES.has(typeName)) {
      if ("bitrate" in payload) {
        options.bitrate = clampNumber(payload.bitrate, 8_000, 384_000, 64_000);
      }

      if ("userLimit" in payload) {
        options.userLimit = clampNumber(payload.userLimit, 0, 99, 0);
      }
    }

    if (Array.isArray(payload.permissionOverwrites) && payload.permissionOverwrites.length > 0) {
      options.permissionOverwrites = payload.permissionOverwrites
        .map(normalizeOverwrite)
        .filter((item) => item.id);
    }

    const channel = await guild.channels.create(options);

    return { id: channel.id, name: channel.name };
  },

  async "channel:patch"({ guild, targetId, payload }) {
    const channel = requireChannel(guild, targetId);
    const typeName = ChannelType[channel.type] ?? "GuildText";
    const patch = {};

    if ("name" in payload) {
      const name = requireName(payload.name, "채널 이름");

      if (name !== channel.name) {
        patch.name = name;
      }
    }

    if (TEXTUAL_TYPES.has(typeName)) {
      if ("topic" in payload) {
        const topic = payload.topic ? String(payload.topic).slice(0, 1024) : null;

        if (topic !== (channel.topic ?? null)) {
          patch.topic = topic;
        }
      }

      if ("nsfw" in payload && Boolean(payload.nsfw) !== Boolean(channel.nsfw)) {
        patch.nsfw = Boolean(payload.nsfw);
      }

      if ("rateLimitPerUser" in payload) {
        const rate = clampNumber(payload.rateLimitPerUser, 0, 21_600, 0);

        if (rate !== (channel.rateLimitPerUser ?? 0)) {
          patch.rateLimitPerUser = rate;
        }
      }
    }

    if (VOICE_TYPES.has(typeName)) {
      if ("bitrate" in payload) {
        const bitrate = clampNumber(payload.bitrate, 8_000, 384_000, 64_000);

        if (bitrate !== (channel.bitrate ?? 64_000)) {
          patch.bitrate = bitrate;
        }
      }

      if ("userLimit" in payload) {
        const limit = clampNumber(payload.userLimit, 0, 99, 0);

        if (limit !== (channel.userLimit ?? 0)) {
          patch.userLimit = limit;
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return { id: channel.id, skipped: true };
    }

    const updated = await channel.edit(patch, REASON);

    return { id: updated.id, name: updated.name };
  },

  async "channel:position"({ guild, targetId, payload }) {
    const channel = requireChannel(guild, targetId);
    const patch = {};

    if ("parentId" in payload) {
      const parentId = payload.parentId ? String(payload.parentId) : null;

      if (parentId) {
        if (parentId === channel.id) {
          throw opError(400, "채널을 자기 자신 아래로 옮길 수 없어요.");
        }

        const parent = requireChannel(guild, parentId);

        if (parent.type !== ChannelType.GuildCategory) {
          throw opError(400, `'${parent.name}' 는 카테고리가 아니에요.`);
        }
      }

      if (parentId !== (channel.parentId ?? null)) {
        patch.parent = parentId;
      }
    }

    if ("position" in payload) {
      const position = clampNumber(payload.position, 0, 500, channel.position ?? 0);

      if (position !== (channel.position ?? 0)) {
        patch.position = position;
      }
    }

    if (Object.keys(patch).length === 0) {
      return { id: channel.id, skipped: true };
    }

    const updated = await channel.edit(patch, REASON);

    return { id: updated.id, parentId: updated.parentId, position: updated.position };
  },

  async "channel:overwrite:put"({ guild, targetId, payload }) {
    const channel = requireChannel(guild, targetId);
    const overwriteId = String(payload.overwriteId ?? "");

    if (!overwriteId) {
      throw opError(400, "권한을 바꿀 대상(역할/멤버) id 가 없어요.");
    }

    const allow = permissionBits(payload.allow ?? "0", "허용 권한");
    const deny = permissionBits(payload.deny ?? "0", "거부 권한");

    if (allow === 0n && deny === 0n) {
      await channel.permissionOverwrites.delete(overwriteId, REASON).catch(() => null);

      return { id: channel.id, overwriteId, removed: true };
    }

    // create() 는 기존 덮어쓰기를 통째로 교체하는 PUT 이므로 allow/deny 만 넘기면 됩니다.
    await channel.permissionOverwrites.create(
      overwriteId,
      overwriteOptions(allow, deny),
      { type: overwriteTypeOf(payload), reason: REASON },
    );

    return { id: channel.id, overwriteId };
  },

  async "channel:overwrite:delete"({ guild, targetId, payload }) {
    const channel = requireChannel(guild, targetId);
    const overwriteId = String(payload.overwriteId ?? "");

    if (!overwriteId) {
      throw opError(400, "삭제할 권한 대상(역할/멤버) id 가 없어요.");
    }

    await channel.permissionOverwrites.delete(overwriteId, REASON);

    return { id: channel.id, overwriteId };
  },

  async "channel:delete"({ guild, targetId }) {
    const channel = requireChannel(guild, targetId);

    await channel.delete(REASON);

    return { id: channel.id, name: channel.name, typeName: ChannelType[channel.type] ?? null };
  },
};

export const STRUCT_OP_TYPES = Object.keys(handlers);

/** 지원 여부만 확인할 때 씁니다(api 의 실행 계획 검증용). */
export function isStructOp(op) {
  return Object.hasOwn(handlers, String(op));
}

/**
 * op 하나를 실행합니다.
 * @returns {Promise<object>} 생성된 경우 실제 id 가 담깁니다.
 */
export async function applyStructureOp({ guild, op, targetId = null, payload = {}, log }) {
  const key = String(op ?? "");
  const handler = handlers[key];

  if (!handler) {
    throw opError(400, `지원하지 않는 구조 편집 작업이에요: ${key}`);
  }

  try {
    const result = await withRateLimitRetry(
      () => handler({ guild, targetId, payload: payload ?? {} }),
      { log, label: key },
    );

    return result ?? {};
  } catch (error) {
    // 우리가 던진 opError 는 status 를 이미 갖고 있습니다.
    if (Number(error?.status)) {
      throw error;
    }

    throw toKoreanDiscordError(error);
  }
}
