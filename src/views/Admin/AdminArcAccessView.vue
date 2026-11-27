<template>
  <div class="admin-arc-access-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>민감정보 열람 관리</h1>
        <p class="description">
          상세 건강기록 작성·조회는 ARC 총괄(최윤희) 전용이에요. 그 밖의 직원은
          정당한 사유와 증빙을 남기고 총괄의 승인을 받은 뒤 정해진 시간 동안만
          열람할 수 있어요. 모든 열람은 기록으로 남아요.
        </p>
      </div>
      <router-link to="/admin/arc" class="link-button">
        응급안전 홈
      </router-link>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="panel">
      <h2>열람 승인 요청</h2>

      <div class="field-grid">
        <label class="field">
          <span>사건 번호</span>
          <input
            v-model="requestForm.incidentNo"
            type="text"
            placeholder="예: INC-20250101-01"
          />
        </label>
        <label class="field wide">
          <span>열람 사유 (10자 이상)</span>
          <input
            v-model="requestForm.purpose"
            type="text"
            placeholder="예: 응급처치 경과 확인 및 보호자 안내"
          />
        </label>
        <label class="field wide">
          <span>증빙 자료 (필수)</span>
          <input
            v-model="requestForm.evidence"
            type="text"
            placeholder="예: 보호자 요청 문자 캡처, 119 이송 기록지 번호"
          />
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitRequest"
        >
          {{ isSaving ? "요청 중이에요..." : "승인 요청" }}
        </button>
        <span class="helper-text">
          이미 유효한 승인이 있으면 새로 만들지 않고 그대로 써요.
        </span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>요청 목록</h2>
        <div class="panel-actions">
          <label v-if="canApprove" class="checkbox-field">
            <input v-model="scopeAll" type="checkbox" @change="loadRequests" />
            <span>전체 직원 요청 보기</span>
          </label>
          <select
            v-model="filterStatus"
            class="filter-input"
            @change="loadRequests"
          >
            <option value="">전체 상태</option>
            <option
              v-for="(label, value) in ARC_ACCESS_STATUS_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadAll"
          >
            새로고침
          </button>
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!requests.length" class="empty-box">요청이 없어요.</p>

      <ul v-else class="request-list">
        <li v-for="item in requests" :key="item.id" class="request-row">
          <div class="row-head">
            <span class="incident-no">{{ item.incidentNo || "-" }}</span>
            <span class="status-chip" :class="statusTone(item.status)">
              {{ ARC_ACCESS_STATUS_LABELS[item.status] ?? item.status }}
            </span>
            <strong class="row-title">{{
              item.requestedByName || "직원"
            }}</strong>
            <time class="row-time">{{
              formatArcDateTime(item.requestedAt)
            }}</time>
          </div>

          <p class="row-body">{{ item.purpose }}</p>
          <p v-if="item.evidence" class="row-body evidence-row">
            증빙 · {{ item.evidence }}
          </p>

          <div class="row-actions">
            <span v-if="item.status === 'APPROVED'" class="row-note">
              {{ formatArcRemaining(item.expiresAt) }}
            </span>
            <span v-if="item.decidedByName" class="row-note">
              처리 {{ item.decidedByName }}
              <template v-if="item.decisionReason">
                · {{ item.decisionReason }}</template
              >
            </span>
            <template v-if="canApprove && item.status === 'PENDING'">
              <button
                type="button"
                class="preset-button"
                :disabled="isSaving"
                @click="decide(item, true)"
              >
                승인
              </button>
              <button
                type="button"
                class="preset-button danger"
                :disabled="isSaving"
                @click="decide(item, false)"
              >
                거부
              </button>
            </template>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="canAdmin" class="panel">
      <div class="panel-head">
        <h2>열람 기록</h2>
        <span class="helper-text">최근 200건까지 보여요.</span>
      </div>

      <p v-if="!reads.length" class="empty-box">열람 기록이 없어요.</p>

      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>일시</th>
              <th>사건 번호</th>
              <th>열람자</th>
              <th>동작</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="read in reads" :key="read.id">
              <td>{{ formatArcDateTime(read.createdAt) }}</td>
              <td class="mono">{{ read.incidentNo || "-" }}</td>
              <td>{{ read.employeeName || "-" }}</td>
              <td>{{ read.action }}</td>
              <td class="mono">{{ read.ip || "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  ARC_ACCESS_STATUS_LABELS,
  decideArcAccess,
  fetchArcAccessReads,
  fetchArcAccessRequests,
  formatArcDateTime,
  formatArcRemaining,
  requestArcAccess,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";

const requests = ref([]);
const reads = ref([]);
const canApprove = ref(false);
const scopeAll = ref(false);
const filterStatus = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const canAdmin = computed(() => hasPermission("arc.admin"));

const requestForm = reactive({
  incidentNo: "",
  purpose: "",
  evidence: "",
});

function statusTone(status) {
  if (status === "APPROVED") return "active";
  if (status === "PENDING") return "pending";
  if (status === "DENIED") return "danger";
  return "muted";
}

async function loadRequests() {
  const data = await fetchArcAccessRequests({
    scopeAll: scopeAll.value,
    status: filterStatus.value,
  });

  requests.value = data.requests;
  canApprove.value = data.canApprove;
}

async function loadReads() {
  if (!canAdmin.value) return;

  reads.value = await fetchArcAccessReads({ limit: 200 });
}

async function loadAll() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    await Promise.all([loadRequests(), loadReads()]);
  } catch (error) {
    errorMessage.value = error?.message || "요청 목록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function submitRequest() {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const created = await requestArcAccess({ ...requestForm });

    okMessage.value =
      created?.status === "APPROVED"
        ? "이미 유효한 승인이 있어 그대로 사용할 수 있어요."
        : "열람 승인을 요청했어요. 승인되면 상세 기록을 볼 수 있어요.";
    requestForm.incidentNo = "";
    requestForm.purpose = "";
    requestForm.evidence = "";
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message || "열람 승인을 요청하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function decide(item, approve) {
  if (isSaving.value) return;

  const reason = window.prompt(
    approve ? "승인 사유를 적어 주세요. (선택)" : "거부 사유를 적어 주세요.",
    ""
  );

  if (reason === null) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await decideArcAccess(item.id, { approve, reason });
    okMessage.value = approve ? "열람을 승인했어요." : "열람을 거부했어요.";
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message || "처리하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(loadAll);
</script>

<style scoped lang="scss">
.admin-arc-access-view {
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
  flex-wrap: wrap;
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

  input {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    font-size: 13px;
  }
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.filter-input {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
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

.request-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.request-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.row-time {
  margin-left: auto;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.row-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
}

.evidence-row {
  color: rgba(255, 214, 138, 0.86);
  font-size: 12px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.row-note {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.incident-no,
.mono {
  font-family: monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
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

  &.danger {
    background: rgba(248, 113, 113, 0.18);
    color: #fca5a5;
  }

  &.muted {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
  }
}

.table-wrap {
  overflow-x: auto;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    padding: 9px 12px;
    text-align: left;
    white-space: nowrap;
  }

  th {
    color: rgba(255, 255, 255, 0.5);
    font-weight: 700;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  td {
    color: rgba(255, 255, 255, 0.78);
  }
}
</style>
