<template>
  <div class="settings-card">
    <div class="card-head">
      <h3>백업 설정</h3>
      <div class="card-actions">
        <button
          type="button"
          class="preset-button"
          :disabled="!canEdit || saving || !dirty"
          @click="save"
        >
          {{ saving ? "저장 중…" : "설정 저장" }}
        </button>
        <button
          type="button"
          class="ghost-button"
          :disabled="!canEdit || saving || !dirty"
          @click="reset"
        >
          되돌리기
        </button>
      </div>
    </div>

    <p class="hint">
      저장한 값은 봇이 최대 1분 안에 반영해요. 다음 백업 시각은 봇이 직접
      계산합니다.
    </p>
    <p v-if="!canEdit" class="hint warn">
      백업 설정 변경은 사장 계정만 할 수 있어요.
    </p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="message" class="notice">{{ message }}</p>

    <div class="grid">
      <label class="field">
        <span>백업 채널</span>
        <select v-model="draft.backupChannelId" :disabled="!canEdit">
          <option value="">자동 (이름이 백업/backup 인 채널)</option>
          <option
            v-for="channel in textChannels"
            :key="channel.id"
            :value="channel.id"
          >
            # {{ channel.name }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>공지 채널</span>
        <select v-model="draft.announceChannelId" :disabled="!canEdit">
          <option value="">자동 (설정 없음)</option>
          <option
            v-for="channel in textChannels"
            :key="channel.id"
            :value="channel.id"
          >
            # {{ channel.name }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>로그 채널</span>
        <select v-model="draft.logChannelId" :disabled="!canEdit">
          <option value="">자동 (설정 없음)</option>
          <option
            v-for="channel in textChannels"
            :key="channel.id"
            :value="channel.id"
          >
            # {{ channel.name }}
          </option>
        </select>
      </label>

      <label class="field field-column">
        <span>백업 시각 (cron)</span>
        <input
          v-model="draft.backupCron"
          type="text"
          class="cron-input"
          :disabled="!canEdit"
          placeholder="0 5 * * *"
        />
        <span class="sub-hint"
          >분 시 일 월 요일 · 숫자만 (예: 0 5 * * * = 매일 05:00)</span
        >
        <div class="cron-presets">
          <button
            v-for="preset in CRON_PRESETS"
            :key="preset.value"
            type="button"
            class="chip-button"
            :class="{ active: draft.backupCron === preset.value }"
            :disabled="!canEdit"
            @click="draft.backupCron = preset.value"
          >
            {{ preset.label }}
          </button>
        </div>
      </label>

      <label class="field">
        <span>일 보관</span>
        <input
          v-model.number="draft.keepDaily"
          type="number"
          min="0"
          max="365"
          :disabled="!canEdit"
        />
        <span class="sub-hint">최근 며칠치를 남길지</span>
      </label>

      <label class="field">
        <span>주 보관</span>
        <input
          v-model.number="draft.keepWeekly"
          type="number"
          min="0"
          max="365"
          :disabled="!canEdit"
        />
        <span class="sub-hint">주 1회 백업을 몇 개 남길지</span>
      </label>

      <label class="field">
        <span>월 보관</span>
        <input
          v-model.number="draft.keepMonthly"
          type="number"
          min="0"
          max="365"
          :disabled="!canEdit"
        />
        <span class="sub-hint">월 1회 백업을 몇 개 남길지</span>
      </label>

      <label class="field">
        <span>업로드 최대 MB</span>
        <input
          v-model.number="draft.maxUploadMb"
          type="number"
          min="1"
          max="500"
          :disabled="!canEdit"
        />
        <span class="sub-hint">Discord 업로드 한도(기본 20MB)</span>
      </label>

      <label class="field">
        <span>실행당 최대 작업</span>
        <input
          v-model.number="draft.maxOpsPerRun"
          type="number"
          min="1"
          max="500"
          :disabled="!canEdit"
        />
        <span class="sub-hint">한 번에 올릴 조각 수 상한</span>
      </label>

      <label class="field">
        <span>사장 Discord ID</span>
        <input
          v-model="draft.ownerDiscordId"
          type="text"
          :disabled="!canEdit"
          placeholder="비워도 됩니다"
        />
        <span class="sub-hint">슬래시 명령·고위험 작업을 허용할 사용자 ID</span>
      </label>
    </div>

    <div class="status-row">
      <span class="pill">다음 백업</span>
      <span class="status-value">{{ nextBackupLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";

import { formatDiscordDateTime, updateDiscordSettings } from "@/lib/discord";

const props = defineProps({
  settings: { type: Object, default: null },
  channels: { type: Array, default: () => [] },
  canEdit: { type: Boolean, default: false },
});

const emit = defineEmits(["saved"]);

const CRON_PRESETS = [
  { label: "매일 05:00", value: "0 5 * * *" },
  { label: "매일 03:00", value: "0 3 * * *" },
  { label: "매주 월 05:00", value: "0 5 * * 1" },
  { label: "매월 1일 05:00", value: "0 5 1 * *" },
];

const TEXT_CHANNEL_TYPES = new Set(["GuildText", "GuildAnnouncement"]);

const saving = ref(false);
const error = ref("");
const message = ref("");
const nextBackupAt = ref(null);

const draft = reactive({
  backupChannelId: "",
  announceChannelId: "",
  logChannelId: "",
  ownerDiscordId: "",
  backupCron: "0 5 * * *",
  keepDaily: 14,
  keepWeekly: 8,
  keepMonthly: 12,
  maxUploadMb: 20,
  maxOpsPerRun: 60,
});

const baseline = ref("");

const textChannels = computed(() =>
  props.channels
    .filter((channel) => TEXT_CHANNEL_TYPES.has(channel.typeName))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
);

function fromSettings(current) {
  return {
    backupChannelId: String(current?.backup_channel_id || ""),
    announceChannelId: String(current?.announce_channel_id || ""),
    logChannelId: String(current?.log_channel_id || ""),
    ownerDiscordId: String(current?.owner_discord_id || ""),
    backupCron: String(current?.backup_cron || "0 5 * * *"),
    keepDaily: Number(current?.keep_daily ?? 14),
    keepWeekly: Number(current?.keep_weekly ?? 8),
    keepMonthly: Number(current?.keep_monthly ?? 12),
    maxUploadMb: Number(current?.max_upload_mb ?? 20),
    maxOpsPerRun: Number(current?.max_ops_per_run ?? 60),
  };
}

function payload() {
  return {
    backupChannelId: String(draft.backupChannelId || ""),
    announceChannelId: String(draft.announceChannelId || ""),
    logChannelId: String(draft.logChannelId || ""),
    ownerDiscordId: String(draft.ownerDiscordId || "").trim(),
    backupCron: String(draft.backupCron || "").trim(),
    keepDaily: Number(draft.keepDaily ?? 0),
    keepWeekly: Number(draft.keepWeekly ?? 0),
    keepMonthly: Number(draft.keepMonthly ?? 0),
    maxUploadMb: Number(draft.maxUploadMb ?? 20),
    maxOpsPerRun: Number(draft.maxOpsPerRun ?? 60),
  };
}

function reset() {
  const next = fromSettings(props.settings);

  Object.assign(draft, next);
  baseline.value = JSON.stringify(next);
  nextBackupAt.value = props.settings?.next_backup_at ?? null;
  error.value = "";
}

watch(() => props.settings, reset, { immediate: true, deep: true });

const dirty = computed(() => JSON.stringify(payload()) !== baseline.value);

// 사용자가 값을 고치면 이전 성공 안내를 지웁니다.
watch(dirty, (changed) => {
  if (changed) {
    message.value = "";
  }
});

const nextBackupLabel = computed(() =>
  nextBackupAt.value
    ? formatDiscordDateTime(nextBackupAt.value)
    : "아직 계산되지 않았어요(봇이 1분 안에 채워요)"
);

async function save() {
  saving.value = true;
  error.value = "";
  message.value = "";

  try {
    const result = await updateDiscordSettings(payload());

    nextBackupAt.value =
      result?.nextBackupAt ?? result?.settings?.next_backup_at ?? null;
    baseline.value = JSON.stringify(payload());
    message.value = "백업 설정을 저장했어요.";
    emit("saved", result?.settings ?? null);
  } catch (caught) {
    error.value = caught?.message || "백업 설정을 저장하지 못했어요.";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.settings-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 10px;
}
.card-head h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #ffffff;
}
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset-button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.24);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.ghost-button {
  height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.preset-button:disabled,
.ghost-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.55);
}
.hint.warn {
  color: #fcd34d;
}
.error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.16);
  color: #fca5a5;
  font-size: 12px;
  line-height: 1.5;
}
.notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.16);
  color: #6ee7b7;
  font-size: 12px;
  line-height: 1.5;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.74);
}
.field > span:first-child {
  font-weight: 700;
  color: #ffffff;
}
.field-column {
  grid-column: 1 / -1;
}
.cron-input {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.06em;
}
.field input[type="text"],
.field input[type="number"],
.field select {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
}
.field select option {
  color: #111827;
}
.sub-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}
.cron-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip-button {
  padding: 5px 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.chip-button.active {
  background: rgba(99, 102, 241, 0.32);
  color: #e0e7ff;
}
.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}
.status-value {
  font-weight: 700;
  color: #ffffff;
}
</style>
