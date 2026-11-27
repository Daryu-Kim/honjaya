<template>
  <div class="admin-arc-consent-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>동의서 관리</h1>
        <p class="description">
          종이 동의서에 서명을 받은 뒤 직원이 '동의 확인'을 누르면 효력이
          생겨요. 상세 건강기록은 유효한 동의가 있을 때만 저장할 수 있어요.
        </p>
      </div>
      <router-link to="/admin/arc" class="link-button">
        응급안전 홈
      </router-link>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section v-if="canWrite" class="panel">
      <h2>동의서 등록</h2>

      <div class="field-grid">
        <label class="field">
          <span>사건 번호</span>
          <input
            v-model="form.incidentNo"
            type="text"
            placeholder="예: INC-20250101-01"
          />
        </label>
        <label class="field">
          <span>동의 대상 표시명</span>
          <input
            v-model="form.subjectLabel"
            type="text"
            placeholder="예: 3번 테이블 손님"
          />
          <small
            >화면에 그대로 보이는 이름이에요. 실명은 아래 암호화 항목에
            적어요.</small
          >
        </label>
        <label class="field">
          <span>성명 (암호화 저장)</span>
          <input v-model="form.subjectName" type="text" autocomplete="off" />
        </label>
        <label class="field">
          <span>연락처 (암호화 저장)</span>
          <input
            v-model="form.subjectPhone"
            type="text"
            inputmode="tel"
            autocomplete="off"
          />
        </label>
        <label class="field">
          <span>동의 방식</span>
          <select v-model="form.kind">
            <option
              v-for="(label, value) in ARC_CONSENT_KIND_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>보존기간 만료일</span>
          <input v-model="form.retentionUntil" type="date" />
        </label>
        <label class="field wide">
          <span>수집 목적</span>
          <input
            v-model="form.purpose"
            type="text"
            placeholder="예: 응급상황 대응 및 사후 안내"
          />
        </label>
        <label class="field wide">
          <span>수집 항목</span>
          <input
            v-model="form.scope"
            type="text"
            placeholder="예: 성명, 연락처, 응급처치 경과"
          />
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submit"
        >
          {{ isSaving ? "등록 중이에요..." : "동의서 등록" }}
        </button>
        <span class="helper-text">
          등록만으로는 효력이 없어요. 서명을 받은 뒤 목록에서 '동의 확인'을 눌러
          주세요.
        </span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>동의서 목록</h2>
        <div class="panel-actions">
          <label class="checkbox-field">
            <input
              v-model="includeInactive"
              type="checkbox"
              @change="loadConsents"
            />
            <span>철회 포함</span>
          </label>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadConsents"
          >
            새로고침
          </button>
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!consents.length" class="empty-box">
        등록된 동의서가 없어요.
      </p>

      <ul v-else class="consent-list">
        <li v-for="consent in consents" :key="consent.id" class="consent-row">
          <div class="row-head">
            <strong class="row-title">{{ consent.subjectLabel }}</strong>
            <span class="status-chip" :class="statusTone(consent.status)">
              {{ ARC_CONSENT_STATUS_LABELS[consent.status] ?? consent.status }}
            </span>
            <span class="kind-chip">
              {{ ARC_CONSENT_KIND_LABELS[consent.kind] ?? consent.kind }}
            </span>
            <span v-if="consent.incidentNo" class="incident-no">
              {{ consent.incidentNo }}
            </span>
          </div>

          <dl class="meta-grid">
            <div>
              <dt>목적</dt>
              <dd>{{ consent.purpose || "-" }}</dd>
            </div>
            <div>
              <dt>항목</dt>
              <dd>{{ consent.scope || "-" }}</dd>
            </div>
            <div>
              <dt>확인</dt>
              <dd>
                {{ consent.confirmedByName || "미확인" }}
                <template v-if="consent.confirmedAt">
                  · {{ formatArcDateTime(consent.confirmedAt) }}
                </template>
              </dd>
            </div>
            <div>
              <dt>보존 만료</dt>
              <dd>
                {{
                  consent.retentionUntil
                    ? formatArcDate(consent.retentionUntil)
                    : "-"
                }}
              </dd>
            </div>
            <div v-if="consent.withdrawnAt">
              <dt>철회</dt>
              <dd>
                {{ formatArcDateTime(consent.withdrawnAt) }}
                <template v-if="consent.withdrawnReason">
                  · {{ consent.withdrawnReason }}
                </template>
              </dd>
            </div>
          </dl>

          <div class="row-actions">
            <button
              v-if="canWrite && consent.status === 'PENDING'"
              type="button"
              class="preset-button"
              :disabled="isSaving"
              @click="confirm(consent)"
            >
              동의 확인
            </button>
            <button
              v-if="canWrite && consent.status !== 'WITHDRAWN'"
              type="button"
              class="preset-button danger"
              :disabled="isSaving"
              @click="withdraw(consent)"
            >
              철회
            </button>
            <span class="row-note">
              등록 {{ consent.createdByName || "-" }}
            </span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  ARC_CONSENT_KIND_LABELS,
  ARC_CONSENT_STATUS_LABELS,
  confirmArcConsent,
  createArcConsent,
  fetchArcConsents,
  formatArcDate,
  formatArcDateTime,
  withdrawArcConsent,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";

const consents = ref([]);
const includeInactive = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const canWrite = computed(() => hasPermission("arc.care"));

const form = reactive({
  incidentNo: "",
  subjectLabel: "",
  subjectName: "",
  subjectPhone: "",
  kind: "PAPER",
  purpose: "",
  scope: "",
  retentionUntil: "",
});

function statusTone(status) {
  if (status === "ACTIVE") return "active";
  if (status === "PENDING") return "pending";
  return "muted";
}

function resetForm() {
  form.incidentNo = "";
  form.subjectLabel = "";
  form.subjectName = "";
  form.subjectPhone = "";
  form.kind = "PAPER";
  form.purpose = "";
  form.scope = "";
  form.retentionUntil = "";
}

async function loadConsents() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchArcConsents({
      includeInactive: includeInactive.value,
    });

    consents.value = data.consents;
  } catch (error) {
    errorMessage.value = error?.message || "동의서를 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function submit() {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await createArcConsent({ ...form });
    okMessage.value =
      "동의서를 등록했어요. 서명 확인 후 '동의 확인'을 눌러 주세요.";
    resetForm();
    await loadConsents();
  } catch (error) {
    errorMessage.value = error?.message || "동의서를 등록하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function confirm(consent) {
  if (isSaving.value) return;

  const confirmed = window.confirm(
    `${consent.subjectLabel} 동의서의 서명을 확인했나요? 확인을 누르면 효력이 생겨요.`
  );

  if (!confirmed) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await confirmArcConsent(consent.id);
    okMessage.value = "동의 확인을 기록했어요.";
    await loadConsents();
  } catch (error) {
    errorMessage.value = error?.message || "동의 확인을 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function withdraw(consent) {
  if (isSaving.value) return;

  const reason = window.prompt(
    `${consent.subjectLabel} 동의서를 철회할까요? 사유를 적어 주세요.`,
    ""
  );

  if (reason === null) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await withdrawArcConsent(consent.id, reason);
    okMessage.value = "동의 철회를 기록했어요.";
    await loadConsents();
  } catch (error) {
    errorMessage.value = error?.message || "동의 철회를 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(loadConsents);
</script>

<style scoped lang="scss">
.admin-arc-consent-view {
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

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);

  &.wide {
    grid-column: 1 / -1;
  }

  input,
  select {
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
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

.preset-button {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &.danger {
    border-color: rgba(248, 113, 113, 0.4);
    color: #fca5a5;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.helper-text {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
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

.consent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.consent-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
}

.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.row-title {
  font-size: 14px;
  font-weight: 800;
}

.incident-no {
  font-family: monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin: 0;
  font-size: 12px;

  dt {
    margin: 0 0 2px;
    color: rgba(255, 255, 255, 0.45);
    font-weight: 700;
  }

  dd {
    margin: 0;
    color: rgba(255, 255, 255, 0.75);
  }
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.row-note {
  margin-left: auto;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.status-chip {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;

  &.active {
    background: rgba(52, 211, 153, 0.18);
    color: #6ee7b7;
  }

  &.pending {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.muted {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
  }
}

.kind-chip {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}
</style>
