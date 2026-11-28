<template>
  <div class="admin-arc-incident-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>사건 접수·응급기록</h1>
        <p class="description">
          사건은 비식별 정보(발생 위치·요약)로 먼저 접수해요.
          성명·연락처·증상·처치처럼 식별 가능한 건강정보는 상세기록(AS-CARE)에
          따로 보관하고, 열람은 사건별 승인을 받아야 해요.
        </p>
      </div>
      <div class="header-actions">
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
        <router-link to="/admin/arc/consents" class="link-button">
          동의서 관리
        </router-link>
        <router-link
          v-if="canApprove"
          to="/admin/arc/access"
          class="link-button"
        >
          열람 승인
        </router-link>
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <p v-if="arcSettings.partnerOrg" class="partner-banner">
      <strong>{{ arcSettings.partnerOrg }}</strong>
      <span v-if="arcSettings.partnerContact">
        · {{ arcSettings.partnerContact }}
      </span>
      <span class="partner-note">
        119 이송 후 사후 자문은 이 연락처로 진행하고, 통화 일시·안내 내용을 사건
        기록에 남겨 주세요.
      </span>
    </p>

    <section class="summary-grid">
      <article class="summary-card" :class="{ alert: (summary.open ?? 0) > 0 }">
        <span class="summary-label">진행 중 사건</span>
        <strong>{{ summary.open ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">이번 달 접수</span>
        <strong>{{ summary.thisMonth ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">90일 응급·119</span>
        <strong>{{ summary.emergencyLast90Days ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">90일 119 인계</span>
        <strong>{{ summary.transferredLast90Days ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">상세기록 보유</span>
        <strong>{{ summary.withCare ?? 0 }}건</strong>
      </article>
    </section>

    <section class="panel list-panel">
      <div class="panel-head">
        <h2>사건 목록</h2>
        <div class="panel-actions">
          <select v-model="filters.status" class="inline-input">
            <option value="">전체 상태</option>
            <option
              v-for="(label, code) in ARC_INCIDENT_STATUS_LABELS"
              :key="code"
              :value="code"
            >
              {{ label }}
            </option>
          </select>
          <select v-model="filters.kind" class="inline-input">
            <option value="">전체 성격</option>
            <option
              v-for="(label, code) in ARC_INCIDENT_KIND_LABELS"
              :key="code"
              :value="code"
            >
              {{ label }}
            </option>
          </select>
          <input
            v-model.trim="filters.search"
            class="inline-input"
            type="search"
            placeholder="사건번호·위치·요약 검색"
            @keyup.enter="loadIncidents"
          />
          <input v-model="filters.from" class="inline-input" type="date" />
          <input v-model="filters.to" class="inline-input" type="date" />
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadIncidents"
          >
            새로고침
          </button>
          <button
            v-if="canCare"
            type="button"
            class="primary-button small"
            @click="openCreate"
          >
            새 사건 접수
          </button>
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!incidents.length" class="empty-box">
        조건에 맞는 사건이 없어요.
      </p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>사건번호</th>
              <th>발생</th>
              <th>성격</th>
              <th>기록 방식</th>
              <th>표시명</th>
              <th>위치</th>
              <th>행사</th>
              <th>요약</th>
              <th>상세기록</th>
              <th>상태</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="incident in incidents" :key="incident.id">
              <td class="mono">{{ incident.incidentNo }}</td>
              <td class="nowrap">
                {{ formatArcDateTime(incident.occurredAt) }}
              </td>
              <td>
                <span class="kind-badge" :class="incident.kind.toLowerCase()">
                  {{ ARC_INCIDENT_KIND_LABELS[incident.kind] || incident.kind }}
                </span>
              </td>
              <td>
                {{ ARC_RECORD_MODE_LABELS[incident.recordMode] || "-" }}
              </td>
              <td>{{ incident.subjectLabel || "-" }}</td>
              <td>{{ incident.place || "-" }}</td>
              <td class="mono">{{ incident.eventNo || "-" }}</td>
              <td class="summary-cell">{{ incident.summary || "-" }}</td>
              <td>
                <span v-if="incident.hasCare" class="ok-tag">있음</span>
                <span v-else class="dim">없음</span>
                <span v-if="incident.pendingAccess > 0" class="warn-tag">
                  승인 대기 {{ incident.pendingAccess }}
                </span>
              </td>
              <td>
                <span class="status-tag" :class="incident.status.toLowerCase()">
                  {{
                    ARC_INCIDENT_STATUS_LABELS[incident.status] ||
                    incident.status
                  }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="preset-button"
                  @click="openIncident(incident.id)"
                >
                  열기
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="createOpen && canCare" class="panel create-panel">
      <div class="panel-head">
        <h2>새 사건 접수</h2>
        <div class="panel-actions">
          <button type="button" class="preset-button" @click="closeCreate">
            닫기
          </button>
        </div>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>발생 일시</span>
          <input v-model="createForm.occurredAt" type="datetime-local" />
        </label>
        <label class="field">
          <span>사건 성격</span>
          <select v-model="createForm.kind">
            <option
              v-for="(label, code) in ARC_INCIDENT_KIND_LABELS"
              :key="code"
              :value="code"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>기록 방식</span>
          <select v-model="createForm.recordMode">
            <option
              v-for="(label, code) in ARC_RECORD_MODE_LABELS"
              :key="code"
              :value="code"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>발생 위치</span>
          <input
            v-model.trim="createForm.place"
            type="text"
            maxlength="80"
            placeholder="예: 3번 테이블"
          />
        </label>
        <label class="field">
          <span>관련 행사 (선택)</span>
          <select v-model="createForm.eventNo">
            <option value="">연결 안 함</option>
            <option
              v-for="event in eventOptions"
              :key="event.id"
              :value="event.eventNo"
            >
              {{ event.eventNo }} · {{ event.title }}
            </option>
          </select>
          <small
            >행사 중 발생한 사건이면 연결해 두면 행사 기록에 함께 남아요.</small
          >
        </label>
        <label class="field">
          <span>비식별 표시명</span>
          <input
            v-model.trim="createForm.subjectLabel"
            type="text"
            maxlength="60"
            placeholder="예: 손님A"
          />
          <small>실명은 상세기록에만 입력해요.</small>
        </label>
        <label class="field">
          <span>처리 담당자</span>
          <input
            v-model.trim="createForm.handlerName"
            type="text"
            maxlength="60"
            :placeholder="viewerName || '예: 최윤희 RN'"
          />
        </label>
        <label class="field wide">
          <span>비식별 요약</span>
          <textarea
            v-model.trim="createForm.summary"
            rows="3"
            maxlength="500"
            placeholder="예: 기립성 어지럼 호소, 의자에서 휴식 후 안정"
          ></textarea>
          <small>
            전화번호·주민등록번호·이메일은 넣을 수 없어요(서버가 거절해요).
          </small>
        </label>
        <label class="field">
          <span>개인정보 처리근거</span>
          <select v-model="createForm.legalBasis">
            <option v-for="code in legalBasisOptions" :key="code" :value="code">
              {{ ARC_LEGAL_BASIS_LABELS[code] || code }}
            </option>
          </select>
        </label>
        <label
          v-if="createForm.legalBasis === 'OTHER_LEGAL'"
          class="field wide"
        >
          <span>적법근거 사유</span>
          <input
            v-model.trim="createForm.legalBasisNote"
            type="text"
            maxlength="500"
            placeholder="예: 생명·신체 긴급 보호(응급처치)"
          />
        </label>
        <label class="field checkbox-field">
          <input v-model="createForm.transferred119" type="checkbox" />
          <span>119 이송·인계</span>
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitCreate"
        >
          접수 저장
        </button>
        <p class="helper-text">
          접수만으로는 상세 건강정보가 저장되지 않아요. 상세기록은 동의(F25/F27)
          확인 후 작성할 수 있어요.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";

import {
  ARC_INCIDENT_KIND_LABELS,
  ARC_INCIDENT_STATUS_LABELS,
  ARC_LEGAL_BASIS_LABELS,
  ARC_RECORD_MODE_LABELS,
  createArcIncident,
  fetchArcDashboard,
  fetchArcEventSummary,
  fetchArcIncidents,
  fetchArcSettings,
  formatArcDateTime,
} from "@/lib/arc";

const router = useRouter();

const incidents = ref([]);
const summary = ref({});
const arcSettings = ref({});
const eventOptions = ref([]);
const canCare = ref(false);
const canApprove = ref(false);
const viewerName = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const createOpen = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const filters = reactive({
  status: "",
  kind: "",
  search: "",
  from: "",
  to: "",
});

function nowLocalInput() {
  const now = new Date();

  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function defaultLegalBasis(kind) {
  if (kind === "EMERGENCY") return "NOT_APPLICABLE";
  if (kind === "STAFF_OTC") return "CONSENT_F25";

  return "CONSENT_F27";
}

const createForm = reactive({
  occurredAt: nowLocalInput(),
  kind: "GUEST",
  recordMode: "ON_SITE",
  place: "",
  subjectLabel: "",
  handlerName: "",
  summary: "",
  eventNo: "",
  legalBasis: "CONSENT_F27",
  legalBasisNote: "",
  transferred119: false,
});

const legalBasisOptions = computed(() => {
  if (createForm.kind === "EMERGENCY") {
    return ["NOT_APPLICABLE", "CONSENT_F27", "OTHER_LEGAL"];
  }

  if (createForm.kind === "STAFF_OTC") {
    return ["CONSENT_F25", "OTHER_LEGAL", "DEIDENTIFIED"];
  }

  return ["CONSENT_F27", "OTHER_LEGAL", "DEIDENTIFIED"];
});

watch(legalBasisOptions, (options) => {
  if (!options.includes(createForm.legalBasis)) {
    createForm.legalBasis = options[0];
  }
});

watch(
  () => createForm.kind,
  (kind) => {
    createForm.legalBasis = defaultLegalBasis(kind);
  }
);

async function loadSummary() {
  const dashboard = await fetchArcDashboard();

  summary.value = dashboard.incidents ?? {};
}

async function loadIncidents() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const result = await fetchArcIncidents({ ...filters });

    incidents.value = result.incidents;
    canCare.value = result.canCare;
    canApprove.value = result.canApprove;
    viewerName.value = result.viewerName;
  } catch (error) {
    errorMessage.value = error?.message || "사건 목록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function loadSettings() {
  try {
    arcSettings.value = await fetchArcSettings();
  } catch (error) {
    arcSettings.value = {};
  }
}

async function loadEvents() {
  try {
    const data = await fetchArcEventSummary();

    eventOptions.value = data?.upcomingEvents ?? [];
  } catch (error) {
    eventOptions.value = [];
  }
}

async function loadAll() {
  await Promise.all([
    loadSummary(),
    loadIncidents(),
    loadSettings(),
    loadEvents(),
  ]);
}

function openCreate() {
  createForm.occurredAt = nowLocalInput();
  createForm.kind = "GUEST";
  createForm.recordMode = "ON_SITE";
  createForm.place = "";
  createForm.subjectLabel = "";
  createForm.handlerName = "";
  createForm.summary = "";
  createForm.eventNo = "";
  createForm.legalBasis = defaultLegalBasis("GUEST");
  createForm.legalBasisNote = "";
  createForm.transferred119 = false;
  okMessage.value = "";
  errorMessage.value = "";
  createOpen.value = true;
}

function closeCreate() {
  createOpen.value = false;
}

async function submitCreate() {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const incident = await createArcIncident({ ...createForm });

    createOpen.value = false;
    okMessage.value = `${
      incident?.incidentNo ?? "사건"
    }이(가) 접수되었어요. 상세기록을 작성해 주세요.`;
    await loadAll();

    if (incident?.id) {
      router.push(`/admin/arc/care/${incident.id}`);
    }
  } catch (error) {
    errorMessage.value = error?.message || "사건을 접수하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

function openIncident(incidentId) {
  router.push(`/admin/arc/care/${incidentId}`);
}

// 사건 접수 화면은 열자마자 바로 입력할 수 있게 새 사건 폼을 먼저 띄웁니다.
onMounted(async () => {
  await loadAll();

  if (canCare.value && !createOpen.value) {
    openCreate();
  }
});
</script>

<style scoped lang="scss">
@use "../../scss/_arc-ui" as *;
.admin-arc-incident-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

// 사건 접수 폼을 목록·요약보다 위에 두어 열자마자 바로 입력할 수 있게 합니다.
.create-panel {
  order: 1;
}

.summary-grid {
  order: 2;
}

.list-panel {
  order: 3;
}

.header-actions {
  flex-shrink: 0;
}

.mono {
  white-space: nowrap;
}

.nowrap {
  white-space: nowrap;
}

.summary-cell {
  max-width: 260px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.76);
}

.kind-badge,
.status-tag,
.ok-tag,
.warn-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.kind-badge {
  background: rgba(255, 255, 255, 0.12);

  &.emergency {
    background: rgba(248, 113, 113, 0.22);
    color: #fca5a5;
  }

  &.staff_otc {
    background: rgba(96, 165, 250, 0.2);
    color: #bfdbfe;
  }
}

.status-tag {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;

  &.open {
    background: rgba(52, 211, 153, 0.18);
    color: #6ee7b7;
  }
}

.ok-tag {
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
}

.warn-tag {
  margin-left: 6px;
  background: rgba(251, 191, 36, 0.18);
  color: #fcd34d;
}

.field {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.checkbox-field.field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.primary-button {
  &.small {
    padding: 8px 14px;
    font-size: 13px;
  }
}

.partner-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  background: rgba(59, 130, 246, 0.12);
  color: #dbeafe;
  font-size: 13px;
}

.partner-banner strong {
  color: #ffffff;
}

.partner-note {
  color: #93c5fd;
  font-size: 12px;
}
</style>
