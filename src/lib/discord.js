// P12 — Discord 관리봇 API 호출 도우미(읽기 전용 대시보드, P12C).
//
// 봇 토큰은 브라우저에 절대 내려오지 않습니다. 여기서는 우리 api(/api/discord/*)만 부릅니다.
import { apiBlob, apiGet, apiPost, apiRequest } from "@/lib/api";

export const BACKUP_STATUS_LABELS = {
  RUNNING: "진행 중",
  SUCCEEDED: "완료",
  FAILED: "실패",
};

// P12B-1 — 백업 종류. SERVER 는 DB 덤프가 아니라 코드·설정 tar.gz 입니다.
export const BACKUP_KIND_LABELS = {
  FULL: "DB 전체",
  SCHEMA: "DB 스키마",
  DATA: "DB 데이터",
  SERVER: "서버 코드·설정",
};

export const VERIFY_STATUS_LABELS = {
  RUNNING: "검증 중",
  SUCCEEDED: "검증 통과",
  FAILED: "검증 실패",
};

export const SNAPSHOT_REASON_LABELS = {
  MANUAL: "수동",
  PRE_APPLY: "적용 전 자동",
  SCHEDULED: "정기",
};

export const UPLOAD_STATUS_LABELS = {
  PENDING: "대기",
  UPLOADED: "업로드 완료",
  FAILED: "업로드 실패",
};

// discord_mod_actions.action (서버 CHECK 제약과 같은 목록)
export const MOD_ACTION_LABELS = {
  TIMEOUT: "타임아웃",
  TIMEOUT_CLEAR: "타임아웃 해제",
  KICK: "강퇴",
  BAN: "차단",
  UNBAN: "차단 해제",
  NICK: "닉네임 변경",
  ROLE_ADD: "역할 추가",
  ROLE_REMOVE: "역할 제거",
};

export const MESSAGE_KIND_LABELS = {
  ANNOUNCE: "공지",
  MESSAGE: "일반 메시지",
};

export const CHANNEL_TYPE_LABELS = {
  GuildText: "텍스트",
  GuildVoice: "음성",
  GuildCategory: "카테고리",
  GuildAnnouncement: "공지",
  GuildStageVoice: "스테이지",
  GuildForum: "포럼",
  GuildDirectory: "디렉터리",
  GuildMedia: "미디어",
};

const DIFF_FIELD_LABELS = {
  name: "이름",
  position: "순서",
  parentId: "상위 카테고리",
  parentName: "상위 카테고리",
  topic: "주제",
  nsfw: "NSFW",
  rateLimitPerUser: "슬로우모드(초)",
  bitrate: "비트레이트",
  userLimit: "인원 제한",
  color: "색상",
  hoist: "역할 분리 표시",
  mentionable: "멘션 허용",
  permissions: "권한",
  permissionOverwrites: "채널 권한",
  overwrites: "채널 권한",
  defaultAutoArchiveDuration: "스레드 자동 보관",
  unicodeEmoji: "이모지",
  iconUrl: "아이콘",
  animated: "움직이는 이모지",
  available: "사용 가능",
  enabled: "사용",
  verifyLevel: "인증 레벨",
  verificationLevel: "인증 레벨",
  explicitContentFilter: "유해 콘텐츠 필터",
  defaultMessageNotifications: "기본 알림",
  afkChannelId: "AFK 채널",
  afkTimeout: "AFK 시간",
  systemChannelId: "시스템 채널",
  rulesChannelId: "규칙 채널",
  description: "설명",
  tags: "태그",
  format: "형식",
  status: "상태",
  scheduledStartAt: "시작 시각",
  scheduledEndAt: "종료 시각",
  location: "장소",
  triggerMetadata: "트리거 조건",
  actions: "조치",
  exemptRoles: "제외 역할",
  exemptChannels: "제외 채널",
};

export function getBackupStatusLabel(status) {
  return BACKUP_STATUS_LABELS[status] || status || "-";
}

export function getBackupKindLabel(kind) {
  return BACKUP_KIND_LABELS[kind] || kind || "-";
}

// 서버 코드 백업은 pg_restore 검증 대상이 아니라 다른 복원 절차를 씁니다.
export function isServerBackup(run) {
  return run?.kind === "SERVER";
}

export function getVerifyStatusLabel(status) {
  return VERIFY_STATUS_LABELS[status] || status || "-";
}

export function getSnapshotReasonLabel(reason) {
  return SNAPSHOT_REASON_LABELS[reason] || reason || "-";
}

export function getChannelTypeLabel(typeName) {
  return CHANNEL_TYPE_LABELS[typeName] || typeName || "-";
}

export function getUploadStatusLabel(status) {
  return UPLOAD_STATUS_LABELS[status] || status || "-";
}

export function getDiffFieldLabel(key) {
  return DIFF_FIELD_LABELS[key] || key;
}

export function formatDiscordDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(value) {
  const bytes = Number(value || 0);

  if (!Number.isFinite(bytes) || bytes <= 0) return "-";

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// 역할 색상(10진수) → CSS 색. 0 은 "색 없음"입니다.
export function roleColorStyle(color) {
  const value = Number(color || 0);

  if (!value) {
    return {};
  }

  return { color: `#${value.toString(16).padStart(6, "0")}` };
}

// ── API ────────────────────────────────────────────────────────────────────

export function fetchDiscordStatus() {
  return apiGet("/api/discord/status");
}

export function fetchDiscordGuild() {
  return apiGet("/api/discord/guild");
}

export function fetchDiscordMembers({
  query = "",
  roleId = "",
  after = "",
  limit = 50,
} = {}) {
  const params = new URLSearchParams();

  params.set("limit", String(limit));

  if (query) params.set("query", query);
  if (roleId) params.set("roleId", roleId);
  if (after) params.set("after", after);

  return apiGet(`/api/discord/members?${params.toString()}`);
}

export function fetchDiscordAuditLogs({ before = "", limit = 40 } = {}) {
  const params = new URLSearchParams();

  params.set("limit", String(limit));

  if (before) params.set("before", before);

  return apiGet(`/api/discord/audit-logs?${params.toString()}`);
}

export function fetchDiscordSnapshots({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();

  params.set("limit", String(limit));
  params.set("offset", String(offset));

  return apiGet(`/api/discord/snapshots?${params.toString()}`);
}

export function createDiscordSnapshot() {
  return apiPost("/api/discord/snapshots", { reason: "MANUAL" });
}

export function fetchDiscordSnapshotDiff(snapshotId, against = "") {
  const suffix = against ? `?against=${encodeURIComponent(against)}` : "";

  return apiGet(`/api/discord/snapshots/${snapshotId}/diff${suffix}`);
}

export function fetchDiscordBackups({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();

  params.set("limit", String(limit));
  params.set("offset", String(offset));

  return apiGet(`/api/discord/backups?${params.toString()}`);
}

export function fetchDiscordBackup(runId) {
  return apiGet(`/api/discord/backups/${runId}`);
}

export function runDiscordBackup() {
  return apiPost("/api/discord/backups", {});
}

export function verifyDiscordBackup(runId) {
  return apiPost(`/api/discord/backups/${runId}/verify`, {});
}

// 암호화된 백업 파일을 브라우저로 내려받습니다(복호화 키는 서버에만 있음).
export async function downloadDiscordBackup(runId, filename) {
  const blob = await apiBlob(`/api/discord/backups/${runId}/download`);
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");

    link.href = url;
    link.download = filename || `backup-${runId}.dump.gz.enc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // 클릭 직후 해제하면 Safari 에서 다운로드가 끊기는 경우가 있어 조금 늦춥니다.
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

// ── 라이브 편집(P12D) ────────────────────────────────────────────────────────

export function getModActionLabel(action) {
  return MOD_ACTION_LABELS[action] || action || "-";
}

export function getMessageKindLabel(kind) {
  return MESSAGE_KIND_LABELS[kind] || kind || "-";
}

export function updateDiscordMember(userId, payload) {
  return apiRequest(`/api/discord/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function timeoutDiscordMember(
  userId,
  { minutes, reason, targetUserName = "" }
) {
  return apiPost(`/api/discord/members/${encodeURIComponent(userId)}/timeout`, {
    minutes,
    reason,
    targetUserName,
  });
}

export function clearDiscordMemberTimeout(
  userId,
  { reason = "", targetUserName = "" } = {}
) {
  return apiRequest(
    `/api/discord/members/${encodeURIComponent(userId)}/timeout`,
    {
      method: "DELETE",
      body: { reason, targetUserName },
    }
  );
}

export function kickDiscordMember(
  userId,
  { reason = "", confirmName = "", targetUserName = "" } = {}
) {
  return apiPost(`/api/discord/members/${encodeURIComponent(userId)}/kick`, {
    reason,
    confirmName,
    targetUserName,
  });
}

export function banDiscordMember(
  userId,
  {
    reason = "",
    confirmName = "",
    targetUserName = "",
    deleteMessageSeconds = 0,
  } = {}
) {
  return apiPost(`/api/discord/members/${encodeURIComponent(userId)}/ban`, {
    reason,
    confirmName,
    targetUserName,
    deleteMessageSeconds,
  });
}

export function unbanDiscordMember(
  userId,
  { reason = "", targetUserName = "" } = {}
) {
  return apiRequest(`/api/discord/members/${encodeURIComponent(userId)}/ban`, {
    method: "DELETE",
    body: { reason, targetUserName },
  });
}

export function moveDiscordMemberVoice(userId, channelId = "") {
  return apiPost(`/api/discord/members/${encodeURIComponent(userId)}/voice`, {
    channelId: channelId || null,
  });
}

export function fetchDiscordMemberHistory(userId, { limit = 30 } = {}) {
  return apiGet(
    `/api/discord/members/${encodeURIComponent(userId)}/history?limit=${limit}`
  );
}

export function fetchDiscordMessages({ limit = 20 } = {}) {
  return apiGet(`/api/discord/messages?limit=${limit}`);
}

export function sendDiscordMessage(payload) {
  return apiPost("/api/discord/messages", payload);
}

export function deleteDiscordMessage({
  messageId,
  channelId,
  recordId = null,
  reason = "",
}) {
  return apiRequest(`/api/discord/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
    body: { channelId, recordId, reason },
  });
}

export function fetchDiscordThreads({ channelId = "", limit = 25 } = {}) {
  const params = new URLSearchParams();

  params.set("limit", String(limit));

  if (channelId) params.set("channelId", channelId);

  return apiGet(`/api/discord/threads?${params.toString()}`);
}

export function createDiscordThread(payload) {
  return apiPost("/api/discord/threads", payload);
}

export function archiveDiscordThread(threadId, archived = true) {
  return apiPost(
    `/api/discord/threads/${encodeURIComponent(threadId)}/archive`,
    { archived }
  );
}

export function fetchDiscordInvites() {
  return apiGet("/api/discord/invites");
}

export function createDiscordInvite(payload) {
  return apiPost("/api/discord/invites", payload);
}

export function deleteDiscordInvite(code, reason = "") {
  return apiRequest(`/api/discord/invites/${encodeURIComponent(code)}`, {
    method: "DELETE",
    body: { reason },
  });
}

// ── 구조 편집(P12E) ──────────────────────────────────────────────────────────

export const STRUCT_OP_LABELS = {
  "guild:patch": "서버 설정 변경",
  "role:create": "역할 생성",
  "role:patch": "역할 수정",
  "role:position": "역할 순서 변경",
  "role:delete": "역할 삭제",
  "channel:create": "채널 생성",
  "channel:patch": "채널 설정 변경",
  "channel:position": "채널 이동",
  "channel:overwrite:put": "권한 변경",
  "channel:overwrite:delete": "권한 삭제",
  "channel:delete": "채널 삭제",
};

// 서버가 만드는 op 순서(plan.md §D.4)와 같은 묶음입니다.
export const STRUCT_PHASE_LABELS = {
  guild: "서버 설정",
  "roles:create": "역할 생성",
  "roles:patch": "역할 수정",
  "roles:position": "역할 순서",
  "channels:create": "채널 생성",
  "channels:patch": "채널 설정",
  "channels:position": "채널 이동",
  overwrites: "채널 권한",
  renames: "이름 변경",
  deletes: "삭제",
};

export const APPLY_STATUS_LABELS = {
  QUEUED: "대기",
  RUNNING: "진행 중",
  SUCCEEDED: "완료",
  FAILED: "실패",
  ROLLED_BACK: "되돌림",
  CANCELLED: "취소",
};

export const APPLY_OP_STATUS_LABELS = {
  QUEUED: "대기",
  RUNNING: "진행 중",
  SUCCEEDED: "완료",
  FAILED: "실패",
  SKIPPED: "건너뜀",
};

export const BLOCKED_REASON_LABELS = {
  PROTECTED_CHANNEL: "보호된 채널",
  ROLE_MANAGED: "앱 관리 역할",
  ROLE_ABOVE_BOT: "봇보다 위 역할",
  EVERYONE: "@everyone",
  MISSING_PARENT: "상위 카테고리 없음",
  TOO_MANY_OPS: "변경이 너무 많음",
  UNKNOWN_ROLE: "알 수 없는 역할",
  UNKNOWN_CHANNEL: "알 수 없는 채널",
};

export function getStructOpLabel(op) {
  return STRUCT_OP_LABELS[op] || op || "-";
}

export function getApplyStatusLabel(status) {
  return APPLY_STATUS_LABELS[status] || status || "-";
}

export function getApplyOpStatusLabel(status) {
  return APPLY_OP_STATUS_LABELS[status] || status || "-";
}

export function getBlockedReasonLabel(code) {
  return BLOCKED_REASON_LABELS[code] || code || "-";
}

// 새 역할/채널은 실제 id 가 없으므로 "new:role-<uuid>" 임시 id 로 초안에 담습니다.
export function newTempId(kind) {
  const uuid =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

  return `new:${kind === "channel" ? "channel" : "role"}-${uuid}`;
}

export function isTempId(id) {
  return String(id ?? "").startsWith("new:");
}

// 권한 카탈로그(서버 /api/discord/structure)로 10진 비트필드 ↔ 이름 목록을 변환합니다.
export function decodePermissionNames(catalog, bitfield) {
  let bits = 0n;

  try {
    bits = BigInt(String(bitfield ?? "0") || "0");
  } catch {
    bits = 0n;
  }

  return (catalog || [])
    .filter((item) => {
      try {
        return (bits & BigInt(item.bit)) !== 0n;
      } catch {
        return false;
      }
    })
    .map((item) => item.name);
}

export function encodePermissionNames(catalog, names) {
  const picked = new Set(names || []);
  let bits = 0n;

  for (const item of catalog || []) {
    if (picked.has(item.name)) {
      bits |= BigInt(item.bit);
    }
  }

  return bits.toString();
}

// 라이브 구조를 편집 가능한 초안 모양으로 바꿉니다(적용 전 미리보기의 기준).
export function desiredFromStructure(structure) {
  if (!structure) {
    return { guild: {}, roles: [], channels: [] };
  }

  const guild = structure.guild || {};
  const numberOrNull = (value) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    guild: {
      id: guild.id,
      name: guild.name,
      verificationLevel: numberOrNull(guild.verificationLevel),
      explicitContentFilter: numberOrNull(guild.explicitContentFilter),
      defaultMessageNotifications: numberOrNull(
        guild.defaultMessageNotifications
      ),
      afkChannelId: guild.afkChannelId ?? null,
      afkTimeout: numberOrNull(guild.afkTimeout),
      systemChannelId: guild.systemChannelId ?? null,
    },
    // 앱이 관리하는 역할(봇 역할)도 초안에 그대로 담습니다. 빼면 "삭제 대상"으로 잡혀
    // 적용이 막히므로, 화면에서 읽기 전용으로만 보여 줍니다.
    roles: (structure.roles || []).map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color ?? 0,
      hoist: Boolean(role.hoist),
      mentionable: Boolean(role.mentionable),
      permissions: role.permissions ?? "0",
      position: role.position ?? 0,
    })),
    channels: (structure.channels || []).map((channel) => ({
      id: channel.id,
      typeName: channel.typeName,
      name: channel.name ?? "",
      parentId: channel.parentId ?? null,
      position: channel.position ?? 0,
      topic: channel.topic ?? null,
      nsfw: channel.nsfw ?? null,
      rateLimitPerUser: channel.rateLimitPerUser ?? null,
      bitrate: channel.bitrate ?? null,
      userLimit: channel.userLimit ?? null,
      permissionOverwrites: (channel.permissionOverwrites || []).map(
        (item) => ({
          id: item.id,
          type: Number(item.type) === 1 ? 1 : 0,
          allow: item.allow ?? "0",
          deny: item.deny ?? "0",
        })
      ),
    })),
  };
}

// ── 혼자야 기본 구조 프리셋 ─────────────────────────────────────────────────
// 빈 서버(또는 정리가 안 된 서버)에 우리 가게 구조를 한 번에 깔아 줍니다.
// 이미 있는 역할/카테고리/채널은 이름(별칭 포함)으로 찾아 그대로 두고, 없는 것만
// 새로 만듭니다. 기존 항목의 이름·권한은 건드리지 않습니다.
const PRESET_TEXTUAL_TYPES = new Set([
  "GuildText",
  "GuildAnnouncement",
  "GuildForum",
  "GuildMedia",
]);
const PRESET_VOICE_TYPES = new Set(["GuildVoice", "GuildStageVoice"]);

const PRESET_ROLES = [
  {
    key: "owner",
    name: "사장",
    aliases: ["사장님", "점장", "owner"],
    color: 0xc9a227,
    hoist: true,
    mentionable: false,
    // Administrator 는 일부러 넣지 않습니다(적용 시 추가 확인이 필요한 권한).
    permissions: [
      "ManageGuild",
      "ManageRoles",
      "ManageChannels",
      "ViewAuditLog",
      "ManageWebhooks",
      "ManageEvents",
      "ManageNicknames",
      "KickMembers",
      "BanMembers",
      "ModerateMembers",
      "ManageMessages",
      "ManageThreads",
      "MuteMembers",
      "DeafenMembers",
      "MoveMembers",
    ],
  },
  {
    key: "manager",
    name: "매니저",
    aliases: ["매니져", "관리자", "manager"],
    color: 0x7b68ee,
    hoist: true,
    mentionable: true,
    permissions: [
      "ManageMessages",
      "ManageThreads",
      "ManageNicknames",
      "KickMembers",
      "ModerateMembers",
      "MuteMembers",
      "DeafenMembers",
      "MoveMembers",
      "ViewAuditLog",
    ],
  },
  {
    key: "staff",
    name: "직원",
    aliases: ["알바", "스태프", "staff", "employee"],
    color: 0x3ba55d,
    hoist: true,
    mentionable: true,
    permissions: [
      "ManageMessages",
      "ManageThreads",
      "MuteMembers",
      "DeafenMembers",
      "MoveMembers",
    ],
  },
  {
    key: "guest",
    name: "손님",
    aliases: ["단골", "멤버", "guest", "customer"],
    color: 0x99aab5,
    hoist: false,
    mentionable: true,
    permissions: [],
  },
];

const READ_ONLY = {
  allow: ["ViewChannel", "ReadMessageHistory", "AddReactions"],
  deny: ["SendMessages"],
};
const STAFF_WRITE = {
  allow: ["SendMessages", "EmbedLinks", "AttachFiles"],
  deny: [],
};
const STAFF_ONLY = {
  allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"],
  deny: [],
};
const HIDDEN = { allow: [], deny: ["ViewChannel"] };
// P12B-1 — 백업 파일이 쌓이는 곳. 운영진은 읽을 수만 있고 글은 봇만 남깁니다.
const STAFF_READ = {
  allow: ["ViewChannel", "ReadMessageHistory", "AddReactions"],
  deny: ["SendMessages"],
};

const PRESET_CATEGORIES = [
  {
    name: "📢 공지",
    aliases: ["공지", "공지사항", "notice", "announcements"],
    channels: [
      {
        name: "공지사항",
        aliases: ["공지", "notice", "announcements"],
        topic: "혼자야 공지 · 영업시간·휴무·이벤트 안내",
        overwrites: {
          everyone: READ_ONLY,
          staff: STAFF_WRITE,
          manager: STAFF_WRITE,
        },
      },
      {
        name: "이벤트",
        aliases: ["event"],
        topic: "이벤트·공연·시즌 메뉴 소식",
        overwrites: {
          everyone: READ_ONLY,
          staff: STAFF_WRITE,
          manager: STAFF_WRITE,
        },
      },
      {
        name: "혼자야-규칙",
        aliases: ["규칙", "rules"],
        topic: "혼자야 이용 규칙 · 처음 오셨다면 꼭 읽어 주세요",
        overwrites: { everyone: READ_ONLY },
      },
    ],
  },
  {
    name: "🍶 혼자야",
    aliases: ["혼자야", "일반", "general"],
    channels: [
      {
        name: "잡담",
        aliases: ["수다", "general", "chat"],
        topic: "자유롭게 이야기해요",
      },
      {
        name: "메뉴-리뷰",
        aliases: ["리뷰", "후기", "review"],
        topic: "오늘 마신 메뉴 후기 남겨 주세요",
      },
      {
        name: "신청곡",
        aliases: ["노래신청", "music"],
        topic: "듣고 싶은 노래를 신청해 주세요",
      },
      {
        name: "방문-인증",
        aliases: ["인증", "사진"],
        topic: "방문 인증샷 · 테이블 번호를 함께 남겨 주세요",
      },
    ],
  },
  {
    name: "🛠 운영진",
    aliases: ["운영진", "스태프", "staff"],
    channels: [
      { name: "운영-잡담", aliases: ["운영"], topic: "근무 중 공유할 내용" },
      { name: "업무일지", aliases: ["일지"], topic: "근무 일지·인수인계" },
      { name: "재고-체크", aliases: ["재고"], topic: "재고·발주 체크" },
      {
        name: "백업",
        aliases: ["backup", "서버-백업"],
        topic:
          "자동 백업 파일(DB·서버 코드). 봇만 올리고 사람은 읽기만 합니다.",
        overwrites: {
          everyone: HIDDEN,
          staff: STAFF_READ,
          manager: STAFF_READ,
        },
      },
    ],
    overwrites: { everyone: HIDDEN, staff: STAFF_ONLY, manager: STAFF_ONLY },
  },
  {
    name: "🎧 음성",
    aliases: ["음성", "보이스", "voice"],
    channels: [
      { name: "라운지", typeName: "GuildVoice" },
      { name: "노래방", typeName: "GuildVoice" },
      { name: "음악감상", typeName: "GuildVoice" },
    ],
  },
];

// 이모지·공백·기호를 모두 지워 비교합니다("📢 공지" == "공지").
function presetKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function cloneOverwrites(list) {
  return (list || []).map((item) => ({ ...item }));
}

function matchesPresetName(name, spec) {
  const key = presetKey(name);

  if (!key) {
    return false;
  }

  if (key === presetKey(spec.name)) {
    return true;
  }

  return (spec.aliases || []).some((alias) => presetKey(alias) === key);
}

function findPresetCategory(list, spec) {
  return list.find(
    (item) =>
      item.typeName === "GuildCategory" && matchesPresetName(item.name, spec)
  );
}

function findPresetChannel(list, spec) {
  return list.find(
    (item) =>
      item.typeName !== "GuildCategory" && matchesPresetName(item.name, spec)
  );
}

/**
 * 현재 초안(desired) 위에 혼자야 기본 구조를 얹습니다.
 * 없는 역할 → 카테고리 → 채널 순서로 임시 id 를 붙여 추가하고, 이미 있는 항목은
 * 그대로 복사만 합니다. 반환값의 summary 로 화면에서 미리 보여 줍니다.
 */
export function buildHonjayaPreset({
  desired,
  catalog = [],
  everyoneRoleId = "",
  botHighestPosition = -1,
} = {}) {
  if (!desired) {
    return null;
  }

  const next = {
    guild: { ...(desired.guild || {}) },
    roles: (desired.roles || []).map((role) => ({ ...role })),
    channels: (desired.channels || []).map((channel) => ({
      ...channel,
      permissionOverwrites: cloneOverwrites(channel.permissionOverwrites),
    })),
  };

  const summary = {
    createdRoles: [],
    createdCategories: [],
    createdChannels: [],
    reusedRoles: [],
    reusedChannels: [],
    missingPermissions: [],
  };

  const catalogNames = new Set((catalog || []).map((item) => item.name));
  const usedPermissions = new Set();

  function bits(names) {
    (names || []).forEach((name) => usedPermissions.add(name));

    return encodePermissionNames(catalog, names || []);
  }

  const roleIdByKey = new Map();

  if (everyoneRoleId) {
    roleIdByKey.set("everyone", String(everyoneRoleId));
  }

  // 새 역할은 봇 역할 바로 아래에 위에서부터 차례로 놓습니다.
  const basePosition =
    Number(botHighestPosition) > 0 ? Number(botHighestPosition) - 1 : null;

  PRESET_ROLES.forEach((spec, index) => {
    const existing = next.roles.find((role) =>
      matchesPresetName(role.name, spec)
    );

    if (existing) {
      roleIdByKey.set(spec.key, String(existing.id));
      summary.reusedRoles.push(existing.name);

      return;
    }

    const id = newTempId("role");

    next.roles.push({
      id,
      name: spec.name,
      color: spec.color,
      hoist: Boolean(spec.hoist),
      mentionable: Boolean(spec.mentionable),
      permissions: bits(spec.permissions),
      position:
        basePosition === null ? null : Math.max(basePosition - index, 0),
    });

    roleIdByKey.set(spec.key, id);
    summary.createdRoles.push(spec.name);
  });

  function overwritesFor(spec) {
    return Object.entries(spec.overwrites || {})
      .map(([key, value]) => {
        const id = roleIdByKey.get(key);

        if (!id) {
          return null;
        }

        return {
          id,
          type: 0,
          allow: bits(value.allow),
          deny: bits(value.deny),
        };
      })
      .filter(Boolean);
  }

  PRESET_CATEGORIES.forEach((category, categoryIndex) => {
    const existingCategory = findPresetCategory(next.channels, category);

    let categoryId;

    if (existingCategory) {
      categoryId = String(existingCategory.id);
      summary.reusedChannels.push(existingCategory.name);
    } else {
      categoryId = newTempId("channel");
      next.channels.push({
        id: categoryId,
        typeName: "GuildCategory",
        name: category.name,
        parentId: null,
        position: categoryIndex,
        topic: null,
        nsfw: null,
        rateLimitPerUser: null,
        bitrate: null,
        userLimit: null,
        permissionOverwrites: overwritesFor(category),
      });
      summary.createdCategories.push(category.name);
    }

    category.channels.forEach((spec, index) => {
      const existingChannel = findPresetChannel(next.channels, spec);

      if (existingChannel) {
        summary.reusedChannels.push(existingChannel.name);

        return;
      }

      const typeName = PRESET_VOICE_TYPES.has(spec.typeName)
        ? spec.typeName
        : "GuildText";
      const isText = PRESET_TEXTUAL_TYPES.has(typeName);
      const isVoice = PRESET_VOICE_TYPES.has(typeName);
      // 채널에 따로 지정이 없으면 카테고리 설정을 그대로 물려받습니다.
      const overwriteSpec = spec.overwrites ? spec : category;

      next.channels.push({
        id: newTempId("channel"),
        typeName,
        name: spec.name,
        parentId: categoryId,
        position: index,
        topic: isText ? spec.topic ?? "" : null,
        nsfw: isText ? false : null,
        rateLimitPerUser: isText ? 0 : null,
        bitrate: isVoice ? 64000 : null,
        userLimit: isVoice ? 0 : null,
        permissionOverwrites: isText ? overwritesFor(overwriteSpec) : [],
      });
      summary.createdChannels.push(spec.name);
    });
  });

  summary.missingPermissions = [...usedPermissions].filter(
    (name) => !catalogNames.has(name)
  );

  return { desired: next, summary };
}

export function fetchDiscordStructure() {
  return apiGet("/api/discord/structure");
}

export function fetchDiscordDraft() {
  return apiGet("/api/discord/draft");
}

export function saveDiscordDraft(desired, note = "") {
  return apiRequest("/api/discord/draft", {
    method: "PUT",
    body: { desired, note },
  });
}

export function clearDiscordDraft() {
  return apiRequest("/api/discord/draft", { method: "DELETE" });
}

export function previewDiscordApply(desired = null) {
  return apiPost("/api/discord/apply/preview", desired ? { desired } : {});
}

export function applyDiscordStructure({
  confirmName,
  desired = null,
  allowAdministrator = false,
  allowDangerous = false,
  allowDeletes = false,
}) {
  return apiPost("/api/discord/apply", {
    confirmName,
    desired,
    allowAdministrator,
    allowDangerous,
    allowDeletes,
  });
}

export function rollbackDiscordApply(runId, { confirmName } = {}) {
  return apiPost(`/api/discord/apply/${encodeURIComponent(runId)}/rollback`, {
    confirmName,
  });
}

export function fetchDiscordApplyRuns({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();

  params.set("limit", String(limit));
  params.set("offset", String(offset));

  return apiGet(`/api/discord/apply/runs?${params.toString()}`);
}

export function fetchDiscordApplyRun(runId) {
  return apiGet(`/api/discord/apply/runs/${encodeURIComponent(runId)}`);
}

export function updateDiscordGuild(payload) {
  return apiRequest("/api/discord/guild", { method: "PATCH", body: payload });
}
