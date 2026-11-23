// P12E — 초안(desired) · 실제(live) · 마지막 스냅샷(lastSynced) 3-way 비교로
// Discord 에 적용할 op 목록을 만듭니다. 여기서는 Discord 를 호출하지 않습니다(순수 계산).
//
// 적용 순서는 plan.md §D.5 에 고정되어 있습니다:
//   roles:create → roles:patch → roles:position → categories:create → channels:create
//   → channels:position/parent → overwrites → renames(마지막) → deletes
import { HttpError } from "./http/errors.js";

export const TEMP_PREFIX = "new:";
export const STRUCT_OP_TYPES = [
  "guild:patch",
  "role:create",
  "role:patch",
  "role:delete",
  "role:position",
  "channel:create",
  "channel:patch",
  "channel:delete",
  "channel:position",
  "channel:overwrite:put",
  "channel:overwrite:delete",
];

// 초안에서 바꿀 수 있는 서버 설정. 소유권·삭제는 의도적으로 대상이 아닙니다(§D.8).
const GUILD_EDITABLE = [
  "name",
  "verificationLevel",
  "explicitContentFilter",
  "defaultMessageNotifications",
  "afkChannelId",
  "afkTimeout",
  "systemChannelId",
];

const ROLE_FLAGS = ["hoist", "mentionable"];
const TEXTUAL_TYPES = new Set(["GuildText", "GuildAnnouncement", "GuildForum", "GuildMedia"]);
const VOICE_TYPES = new Set(["GuildVoice", "GuildStageVoice"]);
const CREATABLE_TYPES = new Set(TEXTUAL_TYPES);
CREATABLE_TYPES.add("GuildCategory");
CREATABLE_TYPES.add("GuildVoice");

const SNOWFLAKE_RE = /^\d{15,25}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(message) {
  return new HttpError(400, "HJ400", message);
}

export function isTempId(value) {
  return typeof value === "string" && value.startsWith(TEMP_PREFIX);
}

/** 새로 만드는 항목의 임시 id. 실행하면서 실제 id 로 치환됩니다. */
export function newTempId(kind) {
  return `${TEMP_PREFIX}${kind}-${randomUuid()}`;
}

function randomUuid() {
  // 구조 편집은 브라우저에서 id 를 만들기 때문에 crypto.randomUUID 를 그대로 씁니다.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function assertRefId(value, label) {
  const id = String(value ?? "").trim();

  if (isTempId(id)) {
    const rest = id.slice(TEMP_PREFIX.length);

    if (!UUID_RE.test(rest.replace(/^(role|channel)-/, ""))) {
      throw bad(`${label} 임시 id 형식이 올바르지 않아요.`);
    }

    return id;
  }

  if (!SNOWFLAKE_RE.test(id)) {
    throw bad(`${label} id 형식이 올바르지 않아요.`);
  }

  return id;
}

function bitString(value, label = "권한") {
  const text = typeof value === "string" ? value.trim() : String(value ?? "0");
  const normalized = text === "" ? "0" : text;

  if (!/^\d{1,25}$/.test(normalized)) {
    throw bad(`${label} 값이 올바르지 않아요.`);
  }

  return BigInt(normalized).toString();
}

function nameText(value, label, max = 100) {
  const name = String(value ?? "").trim();

  if (name.length < 1 || name.length > max) {
    throw bad(`${label}은(는) 1~${max}자로 입력해 주세요.`);
  }

  return name;
}

function optionalInt(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function canonical(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

// ── 초안 검증 ─────────────────────────────────────────────────────────────

function normalizeGuild(raw, live) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};

  if (source.id && String(source.id) !== String(live.id)) {
    throw bad("다른 서버의 초안이에요. 새로고침 후 다시 시도해 주세요.");
  }

  if (source.ownerId && String(source.ownerId) !== String(live.ownerId ?? "")) {
    throw bad("서버 소유권 이전은 지원하지 않아요.");
  }

  for (const key of GUILD_EDITABLE) {
    if (!(key in source)) {
      continue;
    }

    if (key === "name") {
      out.name = nameText(source.name, "서버 이름");
      continue;
    }

    if (key === "afkChannelId" || key === "systemChannelId") {
      out[key] = source[key] ? assertRefId(source[key], "채널") : null;
      continue;
    }

    // null 은 "그대로 두기"로 봅니다. 화면이 라이브 값을 못 받은 경우 0 으로 덮어쓰지 않게요.
    if (source[key] === null) {
      continue;
    }

    const value = optionalInt(source[key], null);

    if (value === null || value < 0) {
      throw bad(`서버 설정 값(${key})이 올바르지 않아요.`);
    }

    out[key] = value;
  }

  return out;
}

function normalizeOverwrites(raw, label) {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw bad(`${label} 권한 목록 형식이 올바르지 않아요.`);
  }

  return raw.map((item) => {
    const id = assertRefId(item?.id, `${label} 권한 대상`);

    return {
      id,
      type: Number(item?.type) === 1 ? 1 : 0,
      allow: bitString(item?.allow ?? "0", `${label} 허용 권한`),
      deny: bitString(item?.deny ?? "0", `${label} 거부 권한`),
    };
  });
}

function normalizeRoles(raw) {
  if (!Array.isArray(raw)) {
    throw bad("역할 목록(roles)이 없어요.");
  }

  const seen = new Set();

  return raw.map((item) => {
    const id = assertRefId(item?.id, "역할");
    const key = id.toString();

    if (seen.has(key)) {
      throw bad(`역할 id 가 중복되었어요: ${key}`);
    }

    seen.add(key);

    const role = {
      id,
      name: nameText(item?.name, "역할 이름"),
      color: Math.min(Math.max(optionalInt(item?.color, 0) ?? 0, 0), 0xffffff),
      hoist: Boolean(item?.hoist),
      mentionable: Boolean(item?.mentionable),
      permissions: bitString(item?.permissions ?? "0", "역할 권한"),
      position: optionalInt(item?.position, null),
    };

    return role;
  });
}

function normalizeChannels(raw) {
  if (!Array.isArray(raw)) {
    throw bad("채널 목록(channels)이 없어요.");
  }

  const seen = new Set();

  return raw.map((item) => {
    const id = assertRefId(item?.id, "채널");
    const key = id.toString();

    if (seen.has(key)) {
      throw bad(`채널 id 가 중복되었어요: ${key}`);
    }

    seen.add(key);

    const typeName = String(item?.typeName ?? "GuildText");

    if (!CREATABLE_TYPES.has(typeName) && !TEXTUAL_TYPES.has(typeName) && !VOICE_TYPES.has(typeName)) {
      throw bad(`지원하지 않는 채널 종류예요: ${typeName}`);
    }

    const channel = {
      id,
      typeName,
      name: nameText(item?.name, "채널 이름"),
      parentId: item?.parentId ? assertRefId(item.parentId, "카테고리") : null,
      position: optionalInt(item?.position, 0) ?? 0,
      topic: item?.topic === undefined || item.topic === null ? null : String(item.topic).slice(0, 1024),
      nsfw: item?.nsfw === undefined || item.nsfw === null ? null : Boolean(item.nsfw),
      rateLimitPerUser: optionalInt(item?.rateLimitPerUser, null),
      bitrate: optionalInt(item?.bitrate, null),
      userLimit: optionalInt(item?.userLimit, null),
      permissionOverwrites: normalizeOverwrites(item?.permissionOverwrites, "채널"),
    };

    if (channel.parentId === channel.id) {
      throw bad(`'${channel.name}' 채널을 자기 자신 아래에 둘 수 없어요.`);
    }

    return channel;
  });
}

/**
 * 화면이 보낸 초안을 검증해 정규화합니다. 여기서 통과하지 못하면 preview/apply 모두 거부합니다.
 */
export function normalizeDesired(raw, live) {
  const source = raw && typeof raw === "object" ? raw : {};
  const desired = {
    guild: normalizeGuild(source.guild, live.guild),
    roles: normalizeRoles(source.roles),
    channels: normalizeChannels(source.channels),
  };

  // @everyone 은 어떤 서버에나 있고 초안에서 뺄 수 없습니다. 이 검사가 없으면
  // 화면 버그로 빈 목록이 왔을 때 "전부 삭제" 계획이 만들어집니다.
  if (!desired.roles.some((role) => String(role.id) === String(live.guild?.id))) {
    throw bad("초안에 @everyone 역할이 없어요. 새로고침 후 다시 시도해 주세요.");
  }

  // temp id 는 반드시 역할→채널 순서로 만들어집니다(역할이 먼저 생성되므로).
  const tempRoles = new Set(desired.roles.filter((role) => isTempId(role.id)).map((role) => role.id));
  const tempChannels = new Set(
    desired.channels.filter((channel) => isTempId(channel.id)).map((channel) => channel.id),
  );

  function checkRef(id, tempSet, label) {
    if (isTempId(id)) {
      if (!tempSet.has(id)) {
        throw bad(`초안에 없는 ${label} 를 가리키고 있어요.`);
      }

      return;
    }

    // 이미 삭제된(초안에 없는) 실제 id 를 가리키는 경우는 Discord 쪽에서 걸러집니다.
  }

  for (const channel of desired.channels) {
    if (channel.parentId) {
      checkRef(channel.parentId, tempChannels, "카테고리");

      const parent = desired.channels.find((item) => item.id === channel.parentId);

      if (parent && parent.typeName !== "GuildCategory") {
        throw bad(`'${parent.name}' 는 카테고리가 아니에요.`);
      }
    }

    if (channel.typeName === "GuildCategory" && channel.parentId) {
      throw bad(`카테고리 '${channel.name}' 안에 다른 카테고리를 둘 수 없어요.`);
    }

    for (const overwrite of channel.permissionOverwrites) {
      checkRef(overwrite.id, new Set([...tempRoles, live.guild.id]), "역할");
    }
  }

  if (desired.guild.afkChannelId) {
    if (isTempId(desired.guild.afkChannelId)) {
      throw bad("새로 만드는 채널은 AFK 채널로 바로 지정할 수 없어요. 먼저 적용한 뒤 다시 설정해 주세요.");
    }

    checkRef(desired.guild.afkChannelId, tempChannels, "채널");
  }

  if (desired.guild.systemChannelId) {
    if (isTempId(desired.guild.systemChannelId)) {
      throw bad("새로 만드는 채널은 시스템 채널로 바로 지정할 수 없어요. 먼저 적용한 뒤 다시 설정해 주세요.");
    }

    checkRef(desired.guild.systemChannelId, tempChannels, "채널");
  }

  return desired;
}

// ── 라벨 ─────────────────────────────────────────────────────────────────

function roleTag(role) {
  return `@${role.name}`;
}

function channelTag(channel) {
  return `#${channel.name}`;
}

function catalogLabels(catalog) {
  const map = new Map();

  for (const item of Array.isArray(catalog) ? catalog : []) {
    map.set(item.name, item.label ?? item.name);
  }

  return (name) => map.get(name) ?? name;
}

function permissionsOf(bitfield, catalog) {
  const value = BigInt(bitString(bitfield, "권한"));
  const names = [];

  for (const item of Array.isArray(catalog) ? catalog : []) {
    const bit = BigInt(item.bit);

    if (bit > 0n && (value & bit) === bit) {
      names.push(item.name);
    }
  }

  return names;
}

function diffPermissions(before, after, catalog) {
  const beforeNames = new Set(permissionsOf(before, catalog));
  const afterNames = new Set(permissionsOf(after, catalog));

  return {
    added: [...afterNames].filter((name) => !beforeNames.has(name)),
    removed: [...beforeNames].filter((name) => !afterNames.has(name)),
  };
}

function permissionDeltaText(before, after, catalog) {
  const { added, removed } = diffPermissions(before, after, catalog);
  const label = catalogLabels(catalog);
  const parts = [
    ...added.map((name) => `+${label(name)}`),
    ...removed.map((name) => `-${label(name)}`),
  ];

  return parts.length > 0 ? parts.join(", ") : "권한 변경";
}

/** 채널 권한 덮어쓰기는 allow/deny 두 마스크를 모두 봐야 합니다. */
function overwriteDeltaText(before, after, catalog) {
  const allowDelta = diffPermissions(before?.allow ?? "0", after?.allow ?? "0", catalog);
  const denyDelta = diffPermissions(before?.deny ?? "0", after?.deny ?? "0", catalog);
  const label = catalogLabels(catalog);
  const parts = [
    ...allowDelta.added.map((name) => `+${label(name)}`),
    ...allowDelta.removed.map((name) => `-${label(name)}`),
    ...denyDelta.added.map((name) => `거부 +${label(name)}`),
    ...denyDelta.removed.map((name) => `거부 -${label(name)}`),
  ];

  return parts.length > 0 ? parts.join(", ") : "권한 변경";
}

// ── 실행 계획 ────────────────────────────────────────────────────────────

function sortByPosition(list) {
  return [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
}

/**
 * @param {object} input
 * @param {object} input.desired     normalizeDesired() 결과
 * @param {object} input.live        봇이 읽은 현재 구조 (structure.js 모양)
 * @param {object|null} input.lastSynced 가장 최근 스냅샷 구조 (없으면 null)
 * @param {Array}  [input.catalog]   권한 카탈로그 [{ name, label, bit, dangerous }]
 * @param {number} [input.maxOps]    한 번에 허용할 op 수 (기본 60)
 * @param {Set}    [input.protectedChannelIds] 지우면 안 되는 채널(백업/공지)
 */
export function planApply({
  desired,
  live,
  lastSynced = null,
  catalog = [],
  maxOps = 60,
  protectedChannelIds = new Set(),
  botHighestPosition = -1,
}) {
  const ops = [];
  const blocked = [];
  const warnings = [];
  const liveRoleById = new Map(live.roles.map((role) => [String(role.id), role]));
  const liveChannelById = new Map(live.channels.map((channel) => [String(channel.id), channel]));
  const desiredRoleById = new Map(desired.roles.map((role) => [String(role.id), role]));
  const desiredChannelById = new Map(desired.channels.map((channel) => [String(channel.id), channel]));
  const botHighest = Number(botHighestPosition ?? -1);
  const dangerousNames = new Set(
    (Array.isArray(catalog) ? catalog : [])
      .filter((item) => item.dangerous)
      .map((item) => item.name),
  );

  function push(phase, op, targetType, targetId, text, payload, extra = {}) {
    ops.push({
      seq: 0,
      phase,
      op,
      targetType,
      targetId: targetId ?? null,
      label: text,
      destructive: extra.destructive ?? false,
      payload: payload ?? {},
      before: extra.before ?? null,
      after: extra.after ?? null,
    });
  }

  // 1) 서버 설정
  const guildPatch = {};

  for (const [key, value] of Object.entries(desired.guild)) {
    const current = live.guild?.[key] ?? null;

    if (canonical(value) !== canonical(current)) {
      guildPatch[key] = value;
    }
  }

  if (Object.keys(guildPatch).length > 0) {
    const before = {};
    const after = {};

    for (const key of Object.keys(guildPatch)) {
      before[key] = live.guild?.[key] ?? null;
      after[key] = guildPatch[key];
    }

    push("guild", "guild:patch", "guild", live.guild.id, "서버 설정 변경", guildPatch, {
      before,
      after,
    });
  }

  // 2) 역할 생성
  const createdRoles = desired.roles.filter((role) => isTempId(role.id));

  for (const role of createdRoles) {
    push(
      "roles:create",
      "role:create",
      "role",
      role.id,
      `역할 생성 · ${roleTag(role)}`,
      {
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: role.permissions,
      },
      { after: { id: role.id, name: role.name } },
    );
  }

  // 3) 역할 수정 (이름은 마지막 단계로 미룹니다)
  const roleRenames = [];
  const rolePositions = [];
  const roleDeletes = [];

  for (const role of desired.roles) {
    if (isTempId(role.id)) {
      if (role.position !== null) {
        rolePositions.push({ role, position: role.position });
      }

      continue;
    }

    const current = liveRoleById.get(String(role.id));

    if (!current) {
      warnings.push({
        code: "ROLE_MISSING",
        message: `초안에 있는 역할 ${roleTag(role)} 이(가) Discord 에 없어 건너뜁니다.`,
      });

      continue;
    }

    const isEveryone = Boolean(current.isEveryone) || String(role.id) === String(live.guild.id);
    const currentPermissions = bitString(current.permissions ?? "0", "역할 권한");

    if (current.managed) {
      const changed =
        role.name !== current.name ||
        role.color !== current.color ||
        Boolean(role.hoist) !== Boolean(current.hoist) ||
        Boolean(role.mentionable) !== Boolean(current.mentionable) ||
        role.permissions !== currentPermissions;

      if (changed) {
        blocked.push({
          code: "ROLE_MANAGED",
          message: `'${current.name}' 역할은 다른 앱이 관리하고 있어 수정할 수 없어요.`,
        });
      }

      continue;
    }

    if (!isEveryone && role.name !== current.name) {
      roleRenames.push({ role, current });
    }

    const payload = {};

    if (!isEveryone && role.color !== current.color) {
      payload.color = role.color;
    }

    for (const flag of ROLE_FLAGS) {
      if (!isEveryone && Boolean(role[flag]) !== Boolean(current[flag])) {
        payload[flag] = Boolean(role[flag]);
      }
    }

    if (role.permissions !== currentPermissions) {
      payload.permissions = role.permissions;
    }

    if (Object.keys(payload).length > 0) {
      const before = {};

      for (const key of Object.keys(payload)) {
        before[key] = current[key] ?? null;
      }

      const permissionNote =
        "permissions" in payload
          ? ` · ${permissionDeltaText(current.permissions ?? "0", payload.permissions, catalog)}`
          : "";

      const adminGranted =
        "permissions" in payload &&
        permissionsOf(payload.permissions, catalog).includes("Administrator");

      push(
        "roles:patch",
        "role:patch",
        "role",
        role.id,
        `역할 수정 · ${roleTag(current)}${permissionNote}`,
        payload,
        { before, after: payload },
      );

      if (isEveryone) {
        warnings.push({
          code: "EVERYONE_PERMISSIONS",
          message: "@everyone 역할의 권한을 바꿉니다. 서버 전체에 즉시 적용돼요.",
        });
      }

      if (adminGranted) {
        warnings.push({
          code: "ADMIN_GRANTED",
          message: `${roleTag(current)} 역할에 'Administrator' 권한이 부여됩니다.`,
        });
      }
    }

    if (role.position !== null && role.position !== (current.position ?? 0)) {
      rolePositions.push({ role, position: role.position, current });
    }
  }

  // 4) 역할 위치 (아래에서 위로)
  for (const item of rolePositions.sort((a, b) => a.position - b.position)) {
    const current = item.current ?? liveRoleById.get(String(item.role.id));

    if (item.position >= botHighest) {
      blocked.push({
        code: "ROLE_ABOVE_BOT",
        message: `'${item.role.name}' 역할을 봇 역할 위로 올릴 수 없어요(Discord 제한).`,
      });

      continue;
    }

    if (current && item.position === (current.position ?? 0)) {
      continue;
    }

    push(
      "roles:position",
      "role:position",
      "role",
      item.role.id,
      `역할 순서 변경 · ${roleTag(item.role)} → ${item.position}`,
      { position: item.position },
      { before: { position: current?.position ?? null }, after: { position: item.position } },
    );
  }

  // 5) 카테고리 → 채널 생성 (부모가 먼저)
  const createdChannels = desired.channels.filter((channel) => isTempId(channel.id));
  const createdCategories = sortByPosition(
    createdChannels.filter((channel) => channel.typeName === "GuildCategory"),
  );
  const createdOthers = sortByPosition(
    createdChannels.filter((channel) => channel.typeName !== "GuildCategory"),
  );

  for (const channel of [...createdCategories, ...createdOthers]) {
    const parentIsTemp = channel.parentId ? isTempId(channel.parentId) : false;
    const parentLive = channel.parentId ? liveChannelById.get(String(channel.parentId)) : null;
    const parentDesired = channel.parentId ? desiredChannelById.get(String(channel.parentId)) : null;

    if (parentIsTemp && parentDesired && !createdCategories.includes(parentDesired)) {
      blocked.push({
        code: "PARENT_ORDER",
        message: `'${channel.name}' 의 상위 카테고리가 같은 실행에서 만들어지지 않습니다.`,
      });

      continue;
    }

    if (channel.parentId && !parentIsTemp && !parentLive && !parentDesired) {
      warnings.push({
        code: "PARENT_MISSING",
        message: `'${channel.name}' 의 상위 카테고리를 찾을 수 없어 최상위에 만듭니다.`,
      });
    }

    const payload = {
      name: channel.name,
      typeName: channel.typeName,
      parentId: channel.parentId,
    };

    if (TEXTUAL_TYPES.has(channel.typeName)) {
      payload.topic = channel.topic;
      payload.nsfw = channel.nsfw ?? false;

      if (channel.rateLimitPerUser !== null) {
        payload.rateLimitPerUser = channel.rateLimitPerUser;
      }
    }

    if (VOICE_TYPES.has(channel.typeName)) {
      if (channel.bitrate !== null) {
        payload.bitrate = channel.bitrate;
      }

      if (channel.userLimit !== null) {
        payload.userLimit = channel.userLimit;
      }
    }

    if (channel.permissionOverwrites.length > 0) {
      payload.permissionOverwrites = channel.permissionOverwrites;
    }

    push(
      "channels:create",
      "channel:create",
      "channel",
      channel.id,
      `채널 생성 · ${channelTag(channel)}`,
      payload,
      { after: { id: channel.id, name: channel.name } },
    );
  }

  // 6) 채널 속성/위치 변경
  const channelRenames = [];
  const channelMoves = [];
  const channelOverwrites = [];
  const channelDeletes = [];

  for (const channel of desired.channels) {
    if (isTempId(channel.id)) {
      continue;
    }

    const current = liveChannelById.get(String(channel.id));

    if (!current) {
      warnings.push({
        code: "CHANNEL_MISSING",
        message: `초안에 있는 채널 ${channelTag(channel)} 이(가) Discord 에 없어 건너뜁니다.`,
      });

      continue;
    }

    if (channel.name !== current.name) {
      channelRenames.push({ channel, current });
    }

    const payload = {};

    if (TEXTUAL_TYPES.has(channel.typeName)) {
      if (channel.topic !== null && channel.topic !== (current.topic ?? null)) {
        payload.topic = channel.topic;
      }

      if (channel.nsfw !== null && Boolean(channel.nsfw) !== Boolean(current.nsfw)) {
        payload.nsfw = Boolean(channel.nsfw);
      }

      if (channel.rateLimitPerUser !== null && channel.rateLimitPerUser !== (current.rateLimitPerUser ?? 0)) {
        payload.rateLimitPerUser = channel.rateLimitPerUser;
      }
    }

    if (VOICE_TYPES.has(channel.typeName)) {
      if (channel.bitrate !== null && channel.bitrate !== (current.bitrate ?? null)) {
        payload.bitrate = channel.bitrate;
      }

      if (channel.userLimit !== null && channel.userLimit !== (current.userLimit ?? 0)) {
        payload.userLimit = channel.userLimit;
      }
    }

    if (Object.keys(payload).length > 0) {
      const before = {};

      for (const key of Object.keys(payload)) {
        before[key] = current[key] ?? null;
      }

      push("channels:patch", "channel:patch", "channel", channel.id, `채널 설정 변경 · ${channelTag(current)}`, payload, {
        before,
        after: payload,
      });
    }

    const positionPayload = {};

    if ((channel.parentId ?? null) !== (current.parentId ?? null)) {
      positionPayload.parentId = channel.parentId;
    }

    if (channel.position !== (current.position ?? 0)) {
      positionPayload.position = channel.position;
    }

    if (Object.keys(positionPayload).length > 0) {
      channelMoves.push({ channel, current, payload: positionPayload });
    }

    const currentOverwrites = new Map(
      (current.permissionOverwrites ?? []).map((item) => [String(item.id), item]),
    );
    const desiredOverwrites = new Map(
      channel.permissionOverwrites.map((item) => [String(item.id), item]),
    );

    for (const [id, overwrite] of desiredOverwrites) {
      const existing = currentOverwrites.get(id);
      const allow = bitString(overwrite.allow, "허용 권한");
      const deny = bitString(overwrite.deny, "거부 권한");

      if (existing && bitString(existing.allow, "허용 권한") === allow && bitString(existing.deny, "거부 권한") === deny) {
        continue;
      }

      channelOverwrites.push({
        channel,
        current,
        overwrite,
        allow,
        deny,
        before: existing ? { allow: bitString(existing.allow), deny: bitString(existing.deny) } : null,
      });
    }

    for (const [id] of currentOverwrites) {
      if (desiredOverwrites.has(id)) {
        continue;
      }

      channelOverwrites.push({
        channel,
        current,
        overwrite: { id, type: currentOverwrites.get(id).type, allow: "0", deny: "0" },
        allow: "0",
        deny: "0",
        before: {
          allow: bitString(currentOverwrites.get(id).allow),
          deny: bitString(currentOverwrites.get(id).deny),
        },
        remove: true,
      });
    }
  }

  for (const item of channelMoves) {
    push(
      "channels:position",
      "channel:position",
      "channel",
      item.channel.id,
      `채널 이동 · ${channelTag(item.current)}`,
      item.payload,
      {
        before: { parentId: item.current.parentId ?? null, position: item.current.position ?? 0 },
        after: item.payload,
      },
    );
  }

  for (const item of channelOverwrites) {
    const removed = item.remove || (item.allow === "0" && item.deny === "0");

    push(
      "overwrites",
      removed ? "channel:overwrite:delete" : "channel:overwrite:put",
      "overwrite",
      item.channel.id,
      removed
        ? `권한 삭제 · ${channelTag(item.current)} / ${item.overwrite.id}`
        : `권한 변경 · ${channelTag(item.current)} / ${item.overwrite.id} · ${overwriteDeltaText(
            item.before,
            { allow: item.allow, deny: item.deny },
            catalog,
          )}`,
      {
        ...(removed ? {} : { allow: item.allow, deny: item.deny }),
        overwriteId: String(item.overwrite.id),
        overwriteType: Number(item.overwrite.type) === 1 ? 1 : 0,
      },
      {
        before: item.before,
        after: removed ? null : { allow: item.allow, deny: item.deny },
      },
    );
  }

  // 7) 이름 변경은 마지막에서 두 번째 (멘션/검색이 잠깐 비는 것을 최소화)
  for (const item of roleRenames) {
    push(
      "renames",
      "role:patch",
      "role",
      item.role.id,
      `역할 이름 변경 · ${roleTag(item.current)} → ${roleTag(item.role)}`,
      { name: item.role.name },
      { before: { name: item.current.name }, after: { name: item.role.name } },
    );
  }

  for (const item of channelRenames) {
    push(
      "renames",
      "channel:patch",
      "channel",
      item.channel.id,
      `채널 이름 변경 · ${channelTag(item.current)} → ${channelTag(item.channel)}`,
      { name: item.channel.name },
      { before: { name: item.current.name }, after: { name: item.channel.name } },
    );
  }

  // 8) 삭제
  for (const channel of live.channels) {
    if (desiredChannelById.has(String(channel.id))) {
      continue;
    }

    if (protectedChannelIds.has(String(channel.id))) {
      blocked.push({
        code: "PROTECTED_CHANNEL",
        message: `'${channel.name}' 채널은 백업/공지 채널로 지정되어 있어 지울 수 없어요.`,
      });

      continue;
    }

    channelDeletes.push(channel);
  }

  for (const channel of channelDeletes) {
    push(
      "deletes",
      "channel:delete",
      "channel",
      channel.id,
      `채널 삭제 · ${channelTag(channel)}`,
      {},
      { destructive: true, before: { id: channel.id, name: channel.name } },
    );
  }

  for (const role of live.roles) {
    if (desiredRoleById.has(String(role.id)) || role.isEveryone) {
      continue;
    }

    roleDeletes.push(role);
  }

  for (const role of roleDeletes) {
    if (role.managed) {
      blocked.push({
        code: "ROLE_MANAGED",
        message: `'${role.name}' 역할은 다른 앱이 관리하고 있어 지울 수 없어요.`,
      });

      continue;
    }

    if ((role.position ?? 0) >= botHighest) {
      blocked.push({
        code: "ROLE_ABOVE_BOT",
        message: `'${role.name}' 역할이 봇 역할보다 위에 있어 지울 수 없어요.`,
      });

      continue;
    }

    push("deletes", "role:delete", "role", role.id, `역할 삭제 · ${roleTag(role)}`, {}, {
      destructive: true,
      before: { id: role.id, name: role.name },
    });
  }

  ops.forEach((op, index) => {
    op.seq = index + 1;
  });

  const destructiveCount = ops.filter((op) => op.destructive).length;
  const requiresAdministratorConfirm = ops.some((op) => {
    const delta =
      op.op === "role:patch" || op.op === "role:create"
        ? permissionsOf(op.payload.permissions ?? "0", catalog)
        : [];

    return delta.includes("Administrator");
  });

  if (ops.length > maxOps) {
    blocked.push({
      code: "TOO_MANY_OPS",
      message: `한 번에 ${maxOps}개까지만 적용할 수 있어요(현재 ${ops.length}개). 초안을 나눠 주세요.`,
    });
  }

  const conflicts = collectConflicts({ desired, live, lastSynced });

  const dangerousOverwrite = ops.some((op) => {
    if (!op.op.startsWith("channel:overwrite")) {
      return false;
    }

    const added = permissionsOf(op.payload.allow ?? "0", catalog);

    return added.some((name) => dangerousNames.has(name));
  });

  return {
    ops,
    blocked,
    warnings,
    conflicts,
    requiresAdministratorConfirm,
    dangerousOverwrite,
    requiresDeleteConfirm: destructiveCount > 0,
    counts: {
      total: ops.length,
      destructive: destructiveCount,
      create: ops.filter((op) => op.op.endsWith(":create")).length,
      update: ops.filter((op) => op.op.endsWith(":patch") || op.op.endsWith(":put")).length,
      move: ops.filter((op) => op.op.endsWith(":position")).length,
      remove: ops.filter((op) => op.op.endsWith(":delete")).length,
    },
  };
}

/**
 * 3-way: 마지막 스냅샷 이후 Discord 에서 손으로 바뀐 항목을 알려줍니다(차단이 아니라 경고).
 */
function collectConflicts({ desired, live, lastSynced }) {
  if (!lastSynced) {
    return [];
  }

  const conflicts = [];

  const liveRoles = new Map((live.roles ?? []).map((role) => [String(role.id), role]));
  const syncedRoles = new Map((lastSynced.roles ?? []).map((role) => [String(role.id), role]));

  for (const role of desired.roles) {
    const liveRole = liveRoles.get(String(role.id));
    const syncedRole = syncedRoles.get(String(role.id));

    if (!liveRole || !syncedRole) {
      continue;
    }

    const liveSignature = canonical([liveRole.name, liveRole.color, liveRole.permissions]);
    const syncedSignature = canonical([syncedRole.name, syncedRole.color, syncedRole.permissions]);
    const desiredSignature = canonical([role.name, role.color, role.permissions]);

    if (liveSignature !== syncedSignature && desiredSignature !== liveSignature) {
      conflicts.push({
        kind: "role",
        id: role.id,
        name: liveRole.name,
        message: `'${liveRole.name}' 역할이 마지막 스냅샷 이후 Discord 에서 바뀌었어요. 초안이 그 변경을 덮어씁니다.`,
      });
    }
  }

  const liveChannels = new Map((live.channels ?? []).map((channel) => [String(channel.id), channel]));
  const syncedChannels = new Map(
    (lastSynced.channels ?? []).map((channel) => [String(channel.id), channel]),
  );

  for (const channel of desired.channels) {
    const liveChannel = liveChannels.get(String(channel.id));
    const syncedChannel = syncedChannels.get(String(channel.id));

    if (!liveChannel || !syncedChannel) {
      continue;
    }

    const liveSignature = canonical([
      liveChannel.name,
      liveChannel.parentId,
      liveChannel.topic,
      liveChannel.permissionOverwrites,
    ]);
    const syncedSignature = canonical([
      syncedChannel.name,
      syncedChannel.parentId,
      syncedChannel.topic,
      syncedChannel.permissionOverwrites,
    ]);
    const desiredSignature = canonical([
      channel.name,
      channel.parentId,
      channel.topic,
      channel.permissionOverwrites,
    ]);

    if (liveSignature !== syncedSignature && desiredSignature !== liveSignature) {
      conflicts.push({
        kind: "channel",
        id: channel.id,
        name: liveChannel.name,
        message: `'${liveChannel.name}' 채널이 마지막 스냅샷 이후 Discord 에서 바뀌었어요. 초안이 그 변경을 덮어씁니다.`,
      });
    }
  }

  return conflicts;
}

/**
 * 적용된 op 를 역순으로 되돌리는 계획을 만듭니다.
 * 새로 만든 항목은 지우고, 지운 항목은 같은 속성으로 다시 만듭니다(새 id 발급).
 */
export function buildRollbackOps(appliedOps) {
  const ops = [];
  const ordered = [...appliedOps].sort((a, b) => Number(b.seq) - Number(a.seq));

  for (const row of ordered) {
    if (row.status !== "SUCCEEDED") {
      continue;
    }

    const before = row.before && typeof row.before === "object" ? row.before : null;
    const after = row.after && typeof row.after === "object" ? row.after : null;
    const resultId = after?.id ?? row.result_id ?? row.targetId ?? row.target_id ?? null;

    switch (row.op) {
      case "role:create":
        ops.push({ op: "role:delete", targetId: String(resultId), payload: {} });
        break;
      case "role:delete":
        ops.push({
          op: "role:create",
          targetId: null,
          payload: {
            name: before?.name ?? "복구된 역할",
            color: before?.color ?? 0,
            hoist: Boolean(before?.hoist),
            mentionable: Boolean(before?.mentionable),
            permissions: before?.permissions ?? "0",
          },
        });
        break;
      case "role:patch":
        ops.push({
          op: "role:patch",
          targetId: String(row.target_id ?? row.targetId),
          payload: {
            ...(before?.name !== undefined ? { name: before.name } : {}),
            ...(before?.color !== undefined ? { color: before.color } : {}),
            ...(before?.hoist !== undefined ? { hoist: before.hoist } : {}),
            ...(before?.mentionable !== undefined ? { mentionable: before.mentionable } : {}),
            ...(before?.permissions !== undefined ? { permissions: before.permissions } : {}),
          },
        });
        break;
      case "role:position":
        ops.push({
          op: "role:position",
          targetId: String(row.target_id ?? row.targetId),
          payload: { position: before?.position ?? 0 },
        });
        break;
      case "channel:create":
        ops.push({ op: "channel:delete", targetId: String(resultId), payload: {} });
        break;
      case "channel:delete":
        ops.push({
          op: "channel:create",
          targetId: null,
          payload: {
            name: before?.name ?? "복구된-채널",
            typeName: before?.typeName ?? "GuildText",
            parentId: null,
            ...(before?.topic !== undefined ? { topic: before.topic } : {}),
            ...(before?.nsfw !== undefined ? { nsfw: before.nsfw } : {}),
            ...(before?.rateLimitPerUser !== undefined
              ? { rateLimitPerUser: before.rateLimitPerUser }
              : {}),
            ...(before?.bitrate !== undefined ? { bitrate: before.bitrate } : {}),
            ...(before?.userLimit !== undefined ? { userLimit: before.userLimit } : {}),
            ...(Array.isArray(before?.permissionOverwrites)
              ? { permissionOverwrites: before.permissionOverwrites }
              : {}),
          },
        });
        break;
      case "channel:patch":
        ops.push({
          op: "channel:patch",
          targetId: String(row.target_id ?? row.targetId),
          payload: Object.fromEntries(
            Object.entries(before ?? {}).filter(([, value]) => value !== undefined),
          ),
        });
        break;
      case "channel:position":
        ops.push({
          op: "channel:position",
          targetId: String(row.target_id ?? row.targetId),
          payload: {
            ...(before && "parentId" in before ? { parentId: before.parentId } : {}),
            ...(before && "position" in before ? { position: before.position } : {}),
          },
        });
        break;
      case "channel:overwrite:put":
        ops.push(
          before
            ? {
                op: "channel:overwrite:put",
                targetId: String(row.target_id ?? row.targetId),
                payload: {
                  overwriteId: String(row.payload?.overwriteId ?? after?.overwriteId ?? ""),
                  overwriteType: Number(row.payload?.overwriteType) === 1 ? 1 : 0,
                  allow: before.allow ?? "0",
                  deny: before.deny ?? "0",
                },
              }
            : {
                op: "channel:overwrite:delete",
                targetId: String(row.target_id ?? row.targetId),
                payload: {
                  overwriteId: String(row.payload?.overwriteId ?? after?.overwriteId ?? ""),
                },
              },
        );
        break;
      case "channel:overwrite:delete":
        ops.push({
          op: "channel:overwrite:put",
          targetId: String(row.target_id ?? row.targetId),
          payload: {
            overwriteId: String(row.payload?.overwriteId ?? ""),
            overwriteType: Number(row.payload?.overwriteType) === 1 ? 1 : 0,
            allow: before?.allow ?? "0",
            deny: before?.deny ?? "0",
          },
        });
        break;
      case "guild:patch":
        ops.push({ op: "guild:patch", targetId: null, payload: { ...(before ?? {}) } });
        break;
      default:
        break;
    }
  }

  return ops.filter((op) => Object.keys(op.payload ?? {}).length > 0 || op.targetId);
}

/** 실행 중 temp id 를 실제 id 로 바꿉니다. */
export function resolveTempIds(op, tempMap) {
  const resolve = (value) => (isTempId(value) ? tempMap.get(value) ?? value : value);
  const payload = { ...(op.payload ?? {}) };

  if (payload.parentId) {
    payload.parentId = resolve(payload.parentId);
  }

  if (payload.overwriteId) {
    payload.overwriteId = resolve(payload.overwriteId);
  }

  if (Array.isArray(payload.permissionOverwrites)) {
    payload.permissionOverwrites = payload.permissionOverwrites.map((item) => ({
      ...item,
      id: resolve(item.id),
    }));
  }

  return {
    op: op.op,
    targetId: op.targetId ? resolve(op.targetId) : null,
    payload,
  };
}
