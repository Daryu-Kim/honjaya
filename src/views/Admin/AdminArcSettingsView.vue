<template>
  <div class="admin-arc-settings-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>응급안전 설정</h1>
        <p class="description">
          알림을 받을 디스코드 채널과 기록 보존기간을 정해요. 저장 즉시
          적용되고, 변경 이력은 관리자 감사 로그에 남아요.
        </p>
      </div>
      <router-link to="/admin/arc" class="link-button">
        응급안전 홈
      </router-link>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="savedMessage" class="ok-box">{{ savedMessage }}</p>
    <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>

    <section class="panel">
      <h2>알림</h2>

      <div class="field-grid">
        <label class="field">
          <span>디스코드 알림 채널 ID</span>
          <input
            v-model="form.alertChannelId"
            type="text"
            inputmode="numeric"
            placeholder="예: 1234567890123456789"
          />
          <small>
            채널을 우클릭 → '채널 ID 복사'로 확인해요. 비워 두면 디스코드 알림은
            나가지 않아요.
          </small>
        </label>

        <label class="field checkbox-field">
          <input v-model="form.discordAlertEnabled" type="checkbox" />
          <span>디스코드로도 알림 보내기</span>
        </label>

        <label class="field checkbox-field">
          <input v-model="form.appAlertEnabled" type="checkbox" />
          <span>관리자 앱 알림함에 쌓기</span>
        </label>
      </div>
    </section>

    <section class="panel">
      <h2>보존기간 · 열람 승인</h2>

      <div class="field-grid">
        <label class="field">
          <span>사건·점검 기록 보존기간(년)</span>
          <input
            v-model.number="form.recordRetentionYears"
            type="number"
            min="1"
            max="30"
          />
        </label>

        <label class="field">
          <span>민감 건강기록 보존기간(년)</span>
          <input
            v-model.number="form.sensitiveRetentionYears"
            type="number"
            min="1"
            max="30"
          />
        </label>

        <label class="field">
          <span>열람 승인 유효시간(분)</span>
          <input
            v-model.number="form.accessTtlMinutes"
            type="number"
            min="5"
            max="10080"
          />
          <small>
            승인받은 뒤 이 시간이 지나면 상세 건강기록은 다시 승인을 받아야
            열려요. 기본 480분(8시간)이에요.
          </small>
        </label>
      </div>

      <p class="helper-text">
        보존기간이 지난 기록은 자동으로 지워지지 않아요. 파기는 사장과
        관리자(최윤희)의 이중 승인으로만 진행하게 되어 있어요.
      </p>
    </section>

    <div class="actions">
      <button
        type="button"
        class="primary-button"
        :disabled="isSaving"
        @click="save"
      >
        {{ isSaving ? "저장 중이에요..." : "설정 저장" }}
      </button>
      <span v-if="settings.updatedAt" class="updated-at">
        마지막 변경: {{ settings.updatedByName || "-" }} ·
        {{ formatArcDateTime(settings.updatedAt) }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";

import {
  fetchArcSettings,
  formatArcDateTime,
  saveArcSettings,
} from "@/lib/arc";

const settings = ref({});
const form = reactive({
  alertChannelId: "",
  discordAlertEnabled: true,
  appAlertEnabled: true,
  recordRetentionYears: 3,
  sensitiveRetentionYears: 2,
  accessTtlMinutes: 480,
});

const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const savedMessage = ref("");

function applySettings(data) {
  if (!data) return;

  settings.value = data;
  form.alertChannelId = data.alertChannelId ?? "";
  form.discordAlertEnabled = Boolean(data.discordAlertEnabled);
  form.appAlertEnabled = Boolean(data.appAlertEnabled);
  form.recordRetentionYears = data.recordRetentionYears ?? 3;
  form.sensitiveRetentionYears = data.sensitiveRetentionYears ?? 2;
  form.accessTtlMinutes = data.accessTtlMinutes ?? 480;
}

async function loadSettings() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    applySettings(await fetchArcSettings());
  } catch (error) {
    errorMessage.value = error?.message || "설정을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function save() {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  savedMessage.value = "";

  try {
    applySettings(await saveArcSettings({ ...form }));
    savedMessage.value = "설정을 저장했어요.";
  } catch (error) {
    errorMessage.value = error?.message || "설정을 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(loadSettings);
</script>

<style scoped lang="scss">
.admin-arc-settings-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-header .eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
}

.description {
  margin: 0;
  max-width: 660px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}

.link-button {
  flex-shrink: 0;
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);

  input[type="text"],
  input[type="number"] {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    font-size: 13px;
  }

  small {
    color: rgba(255, 255, 255, 0.48);
    line-height: 1.5;
  }
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.helper-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
}

.actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.primary-button {
  padding: 11px 20px;
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.28);
  color: #e0e7ff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
}

.updated-at {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
  font-size: 13px;
}

.ok-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(52, 211, 153, 0.14);
  color: #6ee7b7;
  font-size: 13px;
}

.empty-box {
  margin: 0;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
}
</style>
