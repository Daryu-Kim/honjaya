// P12 — Discord 관리봇 API 호출 도우미(읽기 전용 대시보드, P12C).
//
// 봇 토큰은 브라우저에 절대 내려오지 않습니다. 여기서는 우리 api(/api/discord/*)만 부릅니다.
import { apiBlob, apiGet, apiPost, apiRequest } from "@/lib/api";

export const BACKUP_STATUS_LABELS = {
  RUNNING: "진행 중",
  SUCCEEDED: "완료",
  FAILED: "실패",
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
