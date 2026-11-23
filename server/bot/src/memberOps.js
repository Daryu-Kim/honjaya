// P12D — 멤버 라이브 편집(닉네임/역할/타임아웃/킥/밴/음성 이동).
//
// 안전 규칙은 모두 여기서 강제합니다. api 컨테이너는 "누가 요청했는지"만 검사하고,
// Discord 규칙(역할 서열·소유자 보호·봇 권한)은 실제 길드 객체를 가진 봇이 판단합니다.
import { PermissionFlagsBits } from "discord.js";

import { opError, toKoreanDiscordError } from "./discordErrors.js";
import { memberToPlain } from "./guildView.js";

export const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;
const REASON_MAX = 400;
const NICKNAME_MAX = 32;

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

function botMember(guild) {
  const me = guild.members.me;

  if (!me) {
    throw opError(503, "봇 멤버 정보를 읽을 수 없어요. 잠시 후 다시 시도해 주세요.");
  }

  return me;
}

function requireBotPermission(guild, permission, message) {
  const me = botMember(guild);

  if (!me.permissions.has(permission)) {
    throw opError(403, message);
  }

  return me;
}

async function fetchTargetMember(guild, userId) {
  try {
    return await guild.members.fetch(snowflake(userId, "멤버 ID"));
  } catch (error) {
    throw toKoreanDiscordError(error);
  }
}

/** 역할 서열·소유자·봇 자신 보호. Discord 도 동일하게 거부하지만 먼저 한국어로 알려줍니다. */
function assertCanActOn(guild, target, actionLabel) {
  const me = botMember(guild);

  if (target.id === me.id) {
    throw opError(400, `봇 자신에게는 ${actionLabel} 수 없어요.`);
  }

  if (target.id === guild.ownerId) {
    throw opError(400, `서버 소유자에게는 ${actionLabel} 수 없어요.`);
  }

  const botPosition = me.roles?.highest?.position ?? -1;
  const targetPosition = target.roles?.highest?.position ?? -1;

  if (targetPosition >= botPosition) {
    throw opError(
      403,
      `'${target.roles?.highest?.name ?? "?"}' 역할을 가진 멤버라서 ${actionLabel} 수 없어요. 봇 역할을 상대보다 위로 올려 주세요.`,
    );
  }
}

function assertRoleAssignable(guild, roleId) {
  const me = botMember(guild);
  const role = guild.roles.cache.get(String(roleId));

  if (!role) {
    throw opError(404, "역할을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.");
  }

  if (role.id === guild.id) {
    throw opError(400, "@everyone 역할은 지정하거나 해제할 수 없어요.");
  }

  if (role.managed) {
    throw opError(400, `'${role.name}' 역할은 봇·연동이 관리하므로 직접 지정할 수 없어요.`);
  }

  if (role.position >= (me.roles?.highest?.position ?? -1)) {
    throw opError(403, `'${role.name}' 역할이 봇 역할보다 높거나 같아서 지정할 수 없어요.`);
  }

  return role;
}

/** 이름 입력 확인. 파괴적 작업은 화면에서 이름을 그대로 입력해야 통과합니다(서버측 재검증). */
export function assertConfirmName(target, confirmName) {
  const given = String(confirmName ?? "").trim();

  if (!given) {
    throw opError(400, "확인을 위해 멤버 이름을 입력해 주세요.");
  }

  const candidates = [target.displayName, target.user?.username, target.user?.tag]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  if (!candidates.includes(given.toLowerCase())) {
    throw opError(400, "입력한 이름이 멤버 이름과 달라요. 화면에 보이는 이름을 그대로 입력해 주세요.");
  }
}

export async function updateMember(guild, input = {}) {
  requireBotPermission(
    guild,
    PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageNicknames,
    "봇에 '역할 관리' 또는 '닉네임 관리' 권한이 없어요.",
  );

  const target = await fetchTargetMember(guild, input.userId);
  const reason = auditReason(input.reason, "혼자야 관리자 페이지");
  const hasNickname = input.nickname !== undefined && input.nickname !== null;
  const addIds = [...new Set((input.rolesAdd ?? []).map((id) => String(id)))];
  const removeIds = [...new Set((input.rolesRemove ?? []).map((id) => String(id)))];

  if (!hasNickname && addIds.length === 0 && removeIds.length === 0) {
    throw opError(400, "변경할 내용이 없어요.");
  }

  const changes = {};
  let member = target;

  if (hasNickname) {
    assertCanActOn(guild, target, "닉네임을 변경");

    if (!botMember(guild).permissions.has(PermissionFlagsBits.ManageNicknames)) {
      throw opError(403, "봇에 '닉네임 관리' 권한이 없어요.");
    }

    const next = String(input.nickname ?? "").trim().slice(0, NICKNAME_MAX) || null;

    if (next !== (target.nickname ?? null)) {
      try {
        member = await target.setNickname(next, reason);
        changes.nickname = { before: target.nickname ?? null, after: next };
      } catch (error) {
        throw toKoreanDiscordError(error);
      }
    }
  }

  if (addIds.length > 0 || removeIds.length > 0) {
    assertCanActOn(guild, target, "역할을 변경");

    if (!botMember(guild).permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw opError(403, "봇에 '역할 관리' 권한이 없어요.");
    }

    const addRoles = addIds.map((id) => assertRoleAssignable(guild, id));
    const removeRoles = removeIds.map((id) => assertRoleAssignable(guild, id));
    const before = [...target.roles.cache.keys()].filter((id) => id !== guild.id);
    const next = new Set(before);

    for (const role of addRoles) {
      next.add(role.id);
    }

    for (const role of removeRoles) {
      next.delete(role.id);
    }

    const after = [...next];

    if (addRoles.some((role) => !before.includes(role.id)) || removeRoles.some((role) => before.includes(role.id))) {
      try {
        member = await target.roles.set(after, reason);
      } catch (error) {
        throw toKoreanDiscordError(error);
      }

      changes.roles = {
        before,
        after,
        added: after.filter((id) => !before.includes(id)),
        removed: before.filter((id) => !after.includes(id)),
      };
    }
  }

  return { member: memberToPlain(member, guild), changes };
}

export async function timeoutMember(guild, input = {}) {
  requireBotPermission(guild, PermissionFlagsBits.ModerateMembers, "봇에 '멤버 타임아웃' 권한이 없어요.");

  const minutes = Number(input.minutes);

  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_TIMEOUT_MINUTES) {
    throw opError(400, `타임아웃 시간은 1분 이상 ${MAX_TIMEOUT_MINUTES}분(28일) 이하여야 해요.`);
  }

  const reason = auditReason(input.reason, "혼자야 관리자 페이지");
  const target = await fetchTargetMember(guild, input.userId);

  assertCanActOn(guild, target, "타임아웃을 적용");

  try {
    const member = await target.timeout(Math.round(minutes) * 60_000, reason);

    return {
      member: memberToPlain(member, guild),
      minutes: Math.round(minutes),
      expiresAt: member.communicationDisabledUntil?.toISOString() ?? null,
    };
  } catch (error) {
    throw toKoreanDiscordError(error);
  }
}

export async function clearTimeout(guild, input = {}) {
  requireBotPermission(guild, PermissionFlagsBits.ModerateMembers, "봇에 '멤버 타임아웃' 권한이 없어요.");

  const reason = auditReason(input.reason, "혼자야 관리자 페이지");
  const target = await fetchTargetMember(guild, input.userId);

  assertCanActOn(guild, target, "타임아웃을 해제");

  try {
    const member = await target.timeout(null, reason);

    return { member: memberToPlain(member, guild) };
  } catch (error) {
    throw toKoreanDiscordError(error);
  }
}

export async function kickMember(guild, input = {}) {
  requireBotPermission(guild, PermissionFlagsBits.KickMembers, "봇에 '멤버 추방' 권한이 없어요.");

  const reason = auditReason(input.reason, "혼자야 관리자 페이지");
  const target = await fetchTargetMember(guild, input.userId);

  assertConfirmName(target, input.confirmName);
  assertCanActOn(guild, target, "추방");

  const snapshot = memberToPlain(target, guild);

  try {
    await target.kick(reason);
  } catch (error) {
    throw toKoreanDiscordError(error);
  }

  return { member: snapshot, action: "KICK" };
}

export async function banMember(guild, input = {}) {
  requireBotPermission(guild, PermissionFlagsBits.BanMembers, "봇에 '멤버 차단' 권한이 없어요.");

  const reason = auditReason(input.reason, "혼자야 관리자 페이지");
  const target = await fetchTargetMember(guild, input.userId);

  assertConfirmName(target, input.confirmName);
  assertCanActOn(guild, target, "차단");

  const snapshot = memberToPlain(target, guild);
  const rawSeconds = Number(input.deleteMessageSeconds);
  const deleteMessageSeconds = Number.isFinite(rawSeconds)
    ? Math.min(Math.max(Math.trunc(rawSeconds), 0), 7 * 24 * 60 * 60)
    : 0;

  try {
    await guild.bans.create(target.id, {
      reason,
      deleteMessageSeconds: deleteMessageSeconds > 0 ? deleteMessageSeconds : undefined,
    });
  } catch (error) {
    throw toKoreanDiscordError(error);
  }

  return { member: snapshot, action: "BAN", deleteMessageSeconds };
}

export async function unbanMember(guild, input = {}) {
  requireBotPermission(guild, PermissionFlagsBits.BanMembers, "봇에 '멤버 차단' 권한이 없어요.");

  const userId = snowflake(input.userId, "멤버 ID");
  const reason = auditReason(input.reason, "혼자야 관리자 페이지");

  if (userId === guild.ownerId) {
    throw opError(400, "서버 소유자는 차단 해제 대상이 아니에요.");
  }

  try {
    await guild.bans.remove(userId, reason);
  } catch (error) {
    throw toKoreanDiscordError(error);
  }

  return { userId, action: "UNBAN" };
}

/** 음성 채널 이동 또는 연결 끊기. channelId 가 없으면 연결을 끊습니다. */
export async function moveMemberVoice(guild, input = {}) {
  requireBotPermission(guild, PermissionFlagsBits.MoveMembers, "봇에 '멤버 이동' 권한이 없어요.");

  const reason = auditReason(input.reason, "혼자야 관리자 페이지");
  const target = await fetchTargetMember(guild, input.userId);

  assertCanActOn(guild, target, "음성 채널을 이동");

  if (!target.voice?.channelId) {
    throw opError(400, "이 멤버는 음성 채널에 접속해 있지 않아요.");
  }

  const fromChannelId = target.voice.channelId;
  const channelId = String(input.channelId ?? "").trim();

  try {
    if (!channelId) {
      await target.voice.disconnect(reason);

      return { userId: target.id, action: "VOICE_DISCONNECT", fromChannelId, toChannelId: null };
    }

    const channel = guild.channels.cache.get(snowflake(channelId, "음성 채널 ID"));

    if (!channel) {
      throw opError(404, "이동할 음성 채널을 찾을 수 없어요.");
    }

    if (typeof channel.isVoiceBased === "function" && !channel.isVoiceBased()) {
      throw opError(400, "음성 채널이 아닙니다. 음성 채널을 선택해 주세요.");
    }

    await target.voice.setChannel(channel, reason);

    return {
      userId: target.id,
      action: "VOICE_MOVE",
      fromChannelId,
      toChannelId: channel.id,
      toChannelName: channel.name ?? null,
    };
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    throw toKoreanDiscordError(error);
  }
}

/** 우리 쪽 제재 기록. Discord 감사 로그와 별개로 남깁니다. */
export async function recordModAction(pool, entry, log) {
  const rows = Array.isArray(entry) ? entry : [entry];

  for (const row of rows) {
    if (!row || !row.action) {
      continue;
    }

    try {
      await pool.query(
        `insert into public.discord_mod_actions
           (guild_id, target_user_id, target_user_name, action, reason, detail, expires_at,
            actor_employee_id, actor_name)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
        [
          String(row.guildId ?? ""),
          String(row.targetUserId ?? ""),
          String(row.targetUserName ?? "").slice(0, 200),
          String(row.action),
          String(row.reason ?? "").slice(0, REASON_MAX),
          JSON.stringify(row.detail ?? {}),
          row.expiresAt ?? null,
          row.actorEmployeeId ?? null,
          String(row.actorName ?? "").slice(0, 100),
        ],
      );
    } catch (error) {
      log?.warn?.("discord_mod_actions insert failed", { err: error });
    }
  }
}
