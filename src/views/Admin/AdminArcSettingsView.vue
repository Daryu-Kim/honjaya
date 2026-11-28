<template>
  <div class="admin-arc-settings-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>응급안전 설정</h1>
        <p class="description">
          알림을 받을 디스코드 채널과 기록 보존기간, 운영 기준(문서 버전 ·
          협력사 · 월말 Gate)을 정해요. 저장 즉시 적용되고, 변경 이력은 관리자
          감사 로그에 남아요.
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

    <section class="panel">
      <h2>운영 기준 · 문서</h2>

      <div class="field-grid">
        <label class="field">
          <span>적용 문서 버전</span>
          <input
            v-model.trim="form.docVersion"
            type="text"
            placeholder="예: AS-KIT-001 v1.0"
          />
          <small
            >구급상자 운영관리대장(AS-KIT-001) 개정 시 버전을 올려
            주세요.</small
          >
        </label>

        <label class="field">
          <span>응급 자문 협력사</span>
          <input
            v-model.trim="form.partnerOrg"
            type="text"
            placeholder="예: OO응급의료지원센터"
          />
        </label>

        <label class="field">
          <span>협력사 담당 연락처</span>
          <input
            v-model.trim="form.partnerContact"
            type="text"
            placeholder="예: 02-000-0000 / 담당자명"
          />
          <small>119 이송 후 사후 자문에 쓰는 연락처예요.</small>
        </label>

        <label class="field">
          <span>월말 Gate 서명자</span>
          <input
            v-model.trim="form.gateSignerName"
            type="text"
            placeholder="예: 김원재"
          />
          <small>매월 25일 이후 실사·정산을 대표가 확인·서명해요.</small>
        </label>

        <label class="field">
          <span>Gate 기준일(일)</span>
          <input
            v-model.number="form.stocktakeGateDay"
            type="number"
            min="1"
            max="31"
          />
          <small>이 날부터 '월말 서명 대기' 알림이 표시돼요.</small>
        </label>

        <label class="field">
          <span>유효기간 임박 알림(일)</span>
          <input
            v-model.number="form.expiryAlertDays"
            type="number"
            min="1"
            max="365"
          />
          <small>기본 30일. 7일 이내는 위험 알림으로 따로 표시돼요.</small>
        </label>
      </div>
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
  docVersion: "",
  partnerOrg: "",
  partnerContact: "",
  expiryAlertDays: 30,
  stocktakeGateDay: 25,
  gateSignerName: "",
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
  form.docVersion = data.docVersion ?? "";
  form.partnerOrg = data.partnerOrg ?? "";
  form.partnerContact = data.partnerContact ?? "";
  form.expiryAlertDays = data.expiryAlertDays ?? 30;
  form.stocktakeGateDay = data.stocktakeGateDay ?? 25;
  form.gateSignerName = data.gateSignerName ?? "";
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
@use "../../scss/_arc-ui" as *;
.admin-arc-settings-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.link-button {
  flex-shrink: 0;
}

.field {
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
}

.checkbox-field {
  flex-direction: row;
}

.updated-at {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
