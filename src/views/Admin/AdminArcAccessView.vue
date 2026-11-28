<template>
  <div class="admin-arc-access-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>민감정보 열람 관리</h1>
        <p class="description">
          상세 건강기록(AS-CARE)은 ARC 총괄 최윤희만 작성·조회해요. 사장도 바로
          볼 수 없고, 사유와 증빙을 남겨 요청한 뒤 총괄이 그 기록지 1건만
          허락해야 열람할 수 있어요. 허락은 정해진 시간이 지나면 자동으로
          끝나고, 모든 열람은 기록으로 남아요.
        </p>
      </div>
      <router-link to="/admin/arc" class="link-button">
        응급안전 홈
      </router-link>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="panel flow-panel">
      <h2>이 화면에서 일어나는 일</h2>
      <ol class="flow-steps">
        <li>
          <strong>사장이 요청</strong>
          <p>
            어떤 사건의 어떤 기록지를 왜 봐야 하는지, 증빙은 무엇인지 적어
            요청해요. 사유는 10자 이상이어야 하고 증빙은 필수예요.
          </p>
        </li>
        <li>
          <strong>총괄이 사유 검토</strong>
          <p>
            최윤희가 요청 사유와 증빙을 읽고, 그 기록지 1건을 열어 줘도 되는지
            판단해요. 필요하면 사건을 확인한 뒤 허락·거부를 정해요.
          </p>
        </li>
        <li>
          <strong>해당 기록지만 허락</strong>
          <p>
            허락은 사건 전체가 아니라 그 AS-CARE 기록 1건에만 적용돼요. 다른
            사건·다른 기록지는 다시 허락을 받아야 해요.
          </p>
        </li>
        <li>
          <strong>제한 시간 열람</strong>
          <p>
            허락된 시간 동안만 열 수 있고, 끝나면 자동으로 닫혀요. 열람한
            사람·시각·IP는 아래 열람 기록에 남아요.
          </p>
        </li>
      </ol>
      <p class="flow-note">
        총괄(최윤희)은 요청 없이 모든 AS-CARE를 작성·조회할 수 있어요. 직원은
        열람 요청을 낼 수 없고, 필요하면 총괄에게 직접 문의해요.
      </p>
    </section>

    <section v-if="canRequest" class="panel">
      <h2>열람 승인 요청 (사장 전용)</h2>

      <div class="field-grid">
        <label class="field">
          <span>사건 번호</span>
          <input
            v-model="requestForm.incidentNo"
            type="text"
            placeholder="예: INC-20250101-01"
          />
        </label>
        <label class="field">
          <span>AS-CARE 기록 ID (선택)</span>
          <input
            v-model="requestForm.careRecordId"
            type="text"
            placeholder="비우면 해당 사건의 AS-CARE 기록 1건"
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
          {{ isSaving ? "요청 중이에요..." : "총괄에게 열람 요청" }}
        </button>
        <span class="helper-text">
          사유와 증빙이 있어야 총괄이 판단할 수 있어요. 허락은 사건 전체가
          아니라 그 AS-CARE 기록 1건에만 적용되고, 이미 유효한 허락이 있으면
          새로 만들지 않고 그대로 써요.
        </span>
      </div>
    </section>

    <section v-else-if="!canApprove" class="panel">
      <h2>열람 요청은 사장만 보낼 수 있어요</h2>
      <p class="helper-text">
        상세 건강기록은 ARC 총괄 최윤희만 작성·조회해요. 직원은 이 화면에서
        요청을 낼 수 없고, 기록 확인이 필요하면 총괄에게 직접 사유를 말하고
        안내를 받아요. 열람이 필요하다고 판단되면 총괄이 직접 열어 확인해 줄 수
        있어요.
      </p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>{{ canApprove ? "요청 검토 · 허락" : "내 요청 상태" }}</h2>
        <div class="panel-actions">
          <label v-if="canApprove" class="checkbox-field">
            <input v-model="scopeAll" type="checkbox" @change="loadRequests" />
            <span>전체 요청 보기</span>
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
      <p v-else-if="!requests.length" class="empty-box">
        {{
          canApprove
            ? "아직 검토할 요청이 없어요."
            : "아직 보낸 요청이 없어요. 위에서 요청하면 총괄이 검토해요."
        }}
      </p>

      <ul v-else class="request-list">
        <li v-for="item in requests" :key="item.id" class="request-row">
          <div class="row-head">
            <span class="incident-no">{{ item.incidentNo || "-" }}</span>
            <span class="status-chip" :class="statusTone(item.status)">
              {{ ARC_ACCESS_STATUS_LABELS[item.status] ?? item.status }}
            </span>
            <strong class="row-title">
              {{ item.requestedByName || "직원" }}
              <span class="role-chip">{{
                roleLabel(item.requestedByRole)
              }}</span>
            </strong>
            <time class="row-time">{{
              formatArcDateTime(item.requestedAt)
            }}</time>
          </div>

          <p v-if="item.targetLabel" class="row-target">
            허락 대상 · {{ item.targetLabel }} (이 기록 1건만)
          </p>
          <p class="row-body">
            <span class="row-label">사유</span>{{ item.purpose }}
          </p>
          <p v-if="item.evidence" class="row-body evidence-row">
            <span class="row-label">증빙</span>{{ item.evidence }}
          </p>

          <p v-if="statusGuide(item)" class="status-guide">
            {{ statusGuide(item) }}
          </p>

          <div class="row-actions">
            <router-link
              v-if="item.incidentId"
              :to="`/admin/arc/care/${item.incidentId}`"
              class="row-link"
            >
              AS-CARE 열기
            </router-link>
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
                이 기록지 허락
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
const canRequest = ref(false);
const scopeAll = ref(false);
const filterStatus = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const canAdmin = computed(() => hasPermission("arc.admin"));

const requestForm = reactive({
  incidentNo: "",
  careRecordId: "",
  purpose: "",
  evidence: "",
});

function statusTone(status) {
  if (status === "APPROVED") return "active";
  if (status === "PENDING") return "pending";
  if (status === "DENIED") return "danger";
  return "muted";
}

const ROLE_LABELS = {
  OWNER: "사장",
  MANAGER: "매니저",
  STAFF: "직원",
};

function roleLabel(role) {
  return ROLE_LABELS[role] ?? (role || "직원");
}

// 요청자(사장)와 총괄이 각각 다음에 뭘 해야 하는지 한 줄로 알려 줍니다.
function statusGuide(item) {
  if (item.status === "PENDING") {
    return canApprove.value
      ? "사유와 증빙을 확인한 뒤, 이 기록지만 열어 줘도 되는지 판단해 주세요."
      : "총괄이 사유를 검토하고 있어요. 허락되면 이 카드에서 바로 열 수 있어요.";
  }

  if (item.status === "APPROVED") {
    return canApprove.value
      ? "허락한 기록지예요. 시간이 지나면 자동으로 닫히고, 다시 필요하면 새로 요청받아야 해요."
      : "허락된 기록지예요. 정해진 시간이 지나면 자동으로 닫혀요.";
  }

  if (item.status === "DENIED") {
    return canApprove.value
      ? "거부한 요청이에요. 사유가 남아 있으니 같은 요청이 다시 오면 이 내용을 먼저 확인하세요."
      : "허락되지 않았어요. 사유를 확인하고 필요하면 총괄에게 직접 문의해 주세요.";
  }

  return "";
}

async function loadRequests() {
  const data = await fetchArcAccessRequests({
    scopeAll: scopeAll.value,
    status: filterStatus.value,
  });

  requests.value = data.requests;
  canApprove.value = data.canApprove;
  canRequest.value = data.canRequest;
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
    requestForm.careRecordId = "";
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

  const target = item.targetLabel || "이 AS-CARE 기록";
  const who = item.requestedByName || "사장";

  const head = approve
    ? `${who}님에게 ${
        item.incidentNo || "해당 사건"
      } ${target} 1건 열람을 허락할까요?\n\n요청 사유: ${item.purpose}`
    : `${who}님의 ${
        item.incidentNo || "해당 사건"
      } ${target} 열람 요청을 거부할까요?\n\n요청 사유: ${item.purpose}`;

  if (!window.confirm(head)) return;

  const reason = window.prompt(
    approve
      ? "허락 사유를 적어 주세요. (예: 보호자 안내를 위해 확인 필요 · 선택)"
      : "거부 사유를 적어 주세요. 요청자에게 그대로 보여요. (필수)",
    ""
  );

  if (reason === null) return;

  if (!approve && !reason.trim()) {
    errorMessage.value = "거부할 때는 사유를 꼭 적어 주세요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await decideArcAccess(item.id, { approve, reason });
    okMessage.value = approve
      ? "이 기록지 열람을 허락했어요. 정해진 시간이 지나면 자동으로 닫혀요."
      : "열람 요청을 거부했어요.";
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
@use "../../scss/_arc-ui" as *;
.admin-arc-access-view {
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
}

.filter-input {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
}

.preset-button {
  &.danger {
    border-color: rgba(248, 113, 113, 0.4);
    color: #fca5a5;
  }
}

.flow-panel {
  gap: 12px;
}

.flow-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: flow;

  li {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 14px 14px 44px;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.24);
    position: relative;
  }

  li::before {
    counter-increment: flow;
    content: counter(flow);
    position: absolute;
    left: 14px;
    top: 14px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(56, 189, 248, 0.22);
    color: #bae6fd;
    font-size: 11px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  strong {
    font-size: 13px;
    font-weight: 800;
    color: #f8fafc;
  }

  p {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
    color: rgba(226, 232, 240, 0.78);
  }
}

.flow-note {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(253, 230, 138, 0.1);
  border: 1px solid rgba(253, 230, 138, 0.28);
  font-size: 12px;
  line-height: 1.7;
  color: #fde68a;
}

.role-chip {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.22);
  color: rgba(226, 232, 240, 0.9);
  font-size: 11px;
  font-weight: 700;
}

.row-label {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.16);
  color: #bae6fd;
  font-size: 11px;
  font-weight: 700;
}

.status-guide {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.72);
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

.row-target {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: rgba(56, 189, 248, 0.9);
}

.row-link {
  font-size: 12px;
  color: rgba(56, 189, 248, 0.95);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
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
