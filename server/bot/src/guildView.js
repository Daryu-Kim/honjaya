// P12C — 관리자 화면(/admin/discord)이 그대로 그릴 수 있는 "보기용" 길드 데이터.
//
// 스냅샷/diff 는 structure.js 의 readStructure() 결과를 그대로 씁니다(해시 안정성 유지).
// 여기서는 같은 원본에 이름·한글 라벨만 덧붙여 화면용으로 가공합니다.
import { AuditLogEvent, OverwriteType, PermissionsBitField } from "discord.js";

import { readStructure, summarizeStructure } from "./structure.js";

// 위험 권한: 화면에서 붉게 강조하고, P12E 편집 시 추가 확인을 받습니다.
const DANGEROUS = new Set([
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
  "BanMembers",
  "KickMembers",
  "ModerateMembers",
  "ManageWebhooks",
]);

const PERMISSION_LABELS_KO = {
  CreateInstantInvite: "초대 링크 만들기",
  KickMembers: "멤버 추방",
  BanMembers: "멤버 차단",
  Administrator: "관리자(모든 권한)",
  ManageChannels: "채널 관리",
  ManageGuild: "서버 관리",
  AddReactions: "반응 추가",
  ViewAuditLog: "감사 로그 보기",
  PrioritySpeaker: "우선 발언권",
  Stream: "화면 공유",
  ViewChannel: "채널 보기",
  SendMessages: "메시지 보내기",
  SendTTSMessages: "TTS 메시지 보내기",
  ManageMessages: "메시지 관리",
  EmbedLinks: "링크 임베드",
  AttachFiles: "파일 첨부",
  ReadMessageHistory: "이전 메시지 보기",
  MentionEveryone: "@everyone 멘션",
  UseExternalEmojis: "외부 이모지 사용",
  ViewGuildInsights: "서버 인사이트 보기",
  Connect: "음성 채널 접속",
  Speak: "발언",
  MuteMembers: "멤버 음소거",
  DeafenMembers: "멤버 헤드셋 끄기",
  MoveMembers: "멤버 이동",
  UseVAD: "음성 감지 사용",
  ChangeNickname: "닉네임 변경",
  ManageNicknames: "닉네임 관리",
  ManageRoles: "역할 관리",
  ManageWebhooks: "웹훅 관리",
  ManageGuildExpressions: "이모지·스티커 관리",
  UseApplicationCommands: "슬래시 명령 사용",
  RequestToSpeak: "발언 요청",
  ManageEvents: "이벤트 관리",
  ManageThreads: "스레드 관리",
  CreatePublicThreads: "공개 스레드 만들기",
  CreatePrivateThreads: "비공개 스레드 만들기",
  UseExternalStickers: "외부 스티커 사용",
  SendMessagesInThreads: "스레드에 메시지 보내기",
  UseEmbeddedActivities: "액티비티 사용",
  ModerateMembers: "멤버 타임아웃",
  ViewCreatorMonetizationAnalytics: "수익 분석 보기",
  UseSoundboard: "사운드보드 사용",
  UseExternalSounds: "외부 사운드 사용",
  SendVoiceMessages: "음성 메시지 보내기",
  SendPolls: "투표 만들기",
  UseExternalApps: "외부 앱 사용",
};

const AUDIT_LABELS_KO = {
  GuildUpdate: "서버 설정 변경",
  ChannelCreate: "채널 생성",
  ChannelUpdate: "채널 수정",
  ChannelDelete: "채널 삭제",
  ChannelOverwriteCreate: "채널 권한 추가",
  ChannelOverwriteUpdate: "채널 권한 변경",
  ChannelOverwriteDelete: "채널 권한 제거",
  MemberKick: "멤버 추방",
  MemberPrune: "휴면 멤버 정리",
  MemberBanAdd: "멤버 차단",
  MemberBanRemove: "차단 해제",
  MemberUpdate: "멤버 수정",
  MemberRoleUpdate: "멤버 역할 변경",
  MemberMove: "멤버 이동",
  MemberDisconnect: "음성 연결 끊기",
  BotAdd: "봇 추가",
  RoleCreate: "역할 생성",
  RoleUpdate: "역할 수정",
  RoleDelete: "역할 삭제",
  InviteCreate: "초대 링크 생성",
  InviteUpdate: "초대 링크 수정",
  InviteDelete: "초대 링크 삭제",
  WebhookCreate: "웹훅 생성",
  WebhookUpdate: "웹훅 수정",
  WebhookDelete: "웹훅 삭제",
  EmojiCreate: "이모지 생성",
  EmojiUpdate: "이모지 수정",
  EmojiDelete: "이모지 삭제",
  MessageDelete: "메시지 삭제",
  MessageBulkDelete: "메시지 대량 삭제",
  MessagePin: "메시지 고정",
  MessageUnpin: "메시지 고정 해제",
  IntegrationCreate: "통합 생성",
  IntegrationUpdate: "통합 수정",
  IntegrationDelete: "통합 삭제",
  StageInstanceCreate: "스테이지 시작",
  StageInstanceUpdate: "스테이지 수정",
  StageInstanceDelete: "스테이지 종료",
  StickerCreate: "스티커 생성",
  StickerUpdate: "스티커 수정",
  StickerDelete: "스티커 삭제",
  GuildScheduledEventCreate: "예약 이벤트 생성",
  GuildScheduledEventUpdate: "예약 이벤트 수정",
  GuildScheduledEventDelete: "예약 이벤트 삭제",
  ThreadCreate: "스레드 생성",
  ThreadUpdate: "스레드 수정",
  ThreadDelete: "스레드 삭제",
  AutomodRuleCreate: "AutoMod 규칙 생성",
  AutomodRuleUpdate: "AutoMod 규칙 수정",
  AutomodRuleDelete: "AutoMod 규칙 삭제",
  AutomodBlockMessage: "AutoMod 메시지 차단",
  AutomodFlagToChannel: "AutoMod 신고 접수",
  AutomodTimeout: "AutoMod 타임아웃",
  SoundboardSoundCreate: "사운드 생성",
  SoundboardSoundUpdate: "사운드 수정",
  SoundboardSoundDelete: "사운드 삭제",
};

/** BigInt/Date 가 섞인 값을 JSON 으로 안전하게 바꿉니다. */
function jsonSafe(value, depth = 0) {
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
    return depth > 3 ? [] : value.map((item) => jsonSafe(item, depth + 1));
  }

  if (typeof value === "object") {
    if (depth > 3) {
      return null;
    }

    const out = {};

    for (const [key, item] of Object.entries(value)) {
      out[key] = jsonSafe(item, depth + 1);
    }

    return out;
  }

  return value;
}

export function decodePermissions(bitfield) {
  let value = 0n;

  try {
    value = BigInt(String(bitfield ?? "0"));
  } catch {
    return [];
  }

  const names = [];

  for (const [name, bit] of Object.entries(PermissionsBitField.Flags)) {
    if (typeof bit !== "bigint" || bit === 0n) {
      continue;
    }

    if ((value & bit) === bit) {
      names.push(name);
    }
  }

  return names.sort((a, b) => a.localeCompare(b));
}

export function permissionLabelKo(name) {
  return PERMISSION_LABELS_KO[name] ?? name;
}

// P12E 구조 편집기의 권한 체크박스 목록. discord.js 의 이름→비트 정의를 그대로 씁니다.
let catalogCache = null;

export function permissionCatalog() {
  if (catalogCache) {
    return catalogCache;
  }

  const items = [];

  for (const [name, bit] of Object.entries(PermissionsBitField.Flags)) {
    if (typeof bit !== "bigint" || bit === 0n) {
      continue;
    }

    items.push({
      name,
      label: permissionLabelKo(name),
      bit: bit.toString(),
      dangerous: DANGEROUS.has(name),
    });
  }

  items.sort((a, b) => a.label.localeCompare(b.label, "ko"));
  catalogCache = items;

  return catalogCache;
}

function permissionEntries(bitfield) {
  return decodePermissions(bitfield).map((name) => ({
    name,
    label: permissionLabelKo(name),
    dangerous: DANGEROUS.has(name),
  }));
}

function overwriteTarget(overwrite, roleById, guild) {
  if (overwrite.type === OverwriteType.Role) {
    return { kind: "role", name: roleById.get(overwrite.id)?.name ?? `역할 ${overwrite.id}` };
  }

  const member = guild.members.cache.get(overwrite.id);

  return {
    kind: "member",
    name: member?.displayName ?? member?.user?.username ?? `멤버 ${overwrite.id}`,
  };
}

/**
 * 길드 전체를 화면용으로 읽습니다.
 * 봇이 오프라인이면 requireGuild() 가 던지므로 api 쪽에서 503/502 로 변환됩니다.
 */
export async function readGuildView(guild, log) {
  const structure = await readStructure(guild, log);
  const summary = summarizeStructure(structure);

  const roleById = new Map(structure.roles.map((role) => [role.id, role]));
  const channelById = new Map(structure.channels.map((channel) => [channel.id, channel]));

  const me = guild.members.me;
  const botHighestPosition = me?.roles?.highest?.position ?? -1;
  const botUserId = guild.client?.user?.id ?? null;
  // 캐시에 전원이 없으면 역할별 인원 수가 틀리게 나오므로 아예 표시하지 않습니다.
  const memberCacheComplete = guild.members.cache.size >= (guild.memberCount ?? 0);

  const roles = structure.roles.map((role) => {
    const permissions = permissionEntries(role.permissions);

    return {
      ...role,
      permissions,
      dangerousPermissions: permissions.filter((item) => item.dangerous).map((item) => item.name),
      // 봇이 이 역할을 수정/삭제할 수 있는지 (P12E 가 같은 규칙을 재사용합니다)
      editableByBot:
        Boolean(me) &&
        !role.isEveryone &&
        !role.managed &&
        role.position < botHighestPosition,
      isBotRole: Boolean(me?.roles?.botRole && me.roles.botRole.id === role.id),
      memberCount: role.isEveryone
        ? guild.memberCount ?? null
        : memberCacheComplete
          ? (guild.roles.cache.get(role.id)?.members?.size ?? 0)
          : null,
    };
  });

  const channels = structure.channels.map((channel) => ({
    ...channel,
    parentName: channel.parentId ? channelById.get(channel.parentId)?.name ?? null : null,
    overwrites: (channel.permissionOverwrites ?? []).map((overwrite) => {
      const target = overwriteTarget(overwrite, roleById, guild);

      return {
        id: overwrite.id,
        kind: target.kind,
        name: target.name,
        allow: decodePermissions(overwrite.allow),
        deny: decodePermissions(overwrite.deny),
      };
    }),
  }));

  return {
    guild: {
      ...structure.guild,
      memberCount: guild.memberCount ?? null,
      createdAt: guild.createdAt ? guild.createdAt.toISOString() : null,
      premiumTier: guild.premiumTier ?? null,
      description: guild.description ?? null,
    },
    bot: me
      ? {
          userId: botUserId,
          tag: guild.client?.user?.tag ?? null,
          displayName: me.displayName ?? null,
          joinedAt: me.joinedAt ? me.joinedAt.toISOString() : null,
          highestRole: me.roles.highest ? { id: me.roles.highest.id, name: me.roles.highest.name } : null,
          permissions: permissionEntries(me.permissions.bitfield.toString()),
        }
      : null,
    summary,
    roles,
    channels,
    emojis: structure.emojis,
    stickers: structure.stickers,
    autoModeration: structure.autoModeration,
    scheduledEvents: structure.scheduledEvents,
    fetchedAt: new Date().toISOString(),
  };
}

export function memberToPlain(member, guild) {
  const roles = [...member.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name, color: role.color, position: role.position }));

  return {
    id: member.id,
    displayName: member.displayName ?? member.user?.username ?? member.id,
    username: member.user?.username ?? null,
    tag: member.user?.tag ?? null,
    nickname: member.nickname ?? null,
    bot: Boolean(member.user?.bot),
    avatarUrl: member.displayAvatarURL ? member.displayAvatarURL({ size: 128 }) : null,
    joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
    createdAt: member.user?.createdAt ? member.user.createdAt.toISOString() : null,
    timedOutUntil: member.communicationDisabledUntil
      ? member.communicationDisabledUntil.toISOString()
      : null,
    roles,
  };
}

/**
 * 멤버 목록. 검색어가 있으면 Discord 이름 검색을, 없으면 가입순 페이지를 읽습니다.
 * 역할 필터는 받아온 페이지 안에서만 적용되므로 truncated 를 함께 돌려줍니다.
 */
export async function listMembers(guild, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const query = String(options.query ?? "").trim().slice(0, 100);
  const after = String(options.after ?? "").trim();
  const roleId = String(options.roleId ?? "").trim();

  const fetchOptions = { limit };

  if (query) {
    fetchOptions.query = query;
  }

  if (after) {
    fetchOptions.after = after;
  }

  let collection;
  let warning = null;

  try {
    collection = await guild.members.fetch(fetchOptions);
  } catch (error) {
    // 봇에 GUILD_MEMBERS intent 가 없거나 권한이 부족하면 캐시로 폴백합니다.
    warning = error?.message ?? String(error);
    collection = guild.members.cache;
  }

  let members = [...collection.values()];

  if (roleId) {
    members = members.filter((member) => member.roles.cache.has(roleId));
  }

  members.sort((a, b) => {
    const aJoined = a.joinedTimestamp ?? 0;
    const bJoined = b.joinedTimestamp ?? 0;

    return aJoined - bJoined || a.id.localeCompare(b.id);
  });

  return {
    total: guild.memberCount ?? null,
    returned: members.length,
    limit,
    nextAfter: members.length >= limit ? members[members.length - 1].id : null,
    truncated: members.length >= limit,
    warning,
    members: members.map((member) => memberToPlain(member, guild)),
  };
}

/** Discord 감사 로그(읽기 전용). 최신순으로 돌려줍니다. */
export async function listAuditLogs(guild, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 40, 1), 100);
  const fetchOptions = { limit };

  if (options.before) {
    fetchOptions.before = String(options.before);
  }

  const logs = await guild.fetchAuditLogs(fetchOptions);

  const entries = [...logs.entries.values()].map((entry) => ({
    id: entry.id,
    action: entry.action,
    actionName: AuditLogEvent[entry.action] ?? String(entry.action),
    actionLabel: AUDIT_LABELS_KO[AuditLogEvent[entry.action]] ?? AuditLogEvent[entry.action] ?? String(entry.action),
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? entry.target?.id ?? null,
    targetName: entry.target?.name ?? entry.target?.tag ?? null,
    executorId: entry.executorId ?? null,
    executorName: entry.executor?.tag ?? entry.executor?.username ?? entry.executorId ?? null,
    executorAvatarUrl: entry.executor?.displayAvatarURL
      ? entry.executor.displayAvatarURL({ size: 64 })
      : null,
    reason: entry.reason ?? null,
    createdAt: entry.createdAt ? entry.createdAt.toISOString() : null,
    changes: jsonSafe((entry.changes ?? []).slice(0, 8)),
  }));

  return {
    returned: entries.length,
    nextBefore: entries.length >= limit ? entries[entries.length - 1].id : null,
    entries,
  };
}
