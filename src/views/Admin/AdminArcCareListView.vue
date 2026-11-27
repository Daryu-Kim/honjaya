<template>
  <div class="admin-arc-care-list-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>AS-CARE 기록</h1>
        <p class="description">
          총괄이 작성한 AS-CARE 서식과 첨부 원본(한글·워드·PDF·사진)을 한곳에서
          확인해요. 이 목록에는 성명·증상 같은 식별 정보가 나오지 않고, 실제
          내용은 사건별 열람 승인을 받아야 볼 수 있어요.
        </p>
      </div>
      <div class="header-actions">
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
        <router-link to="/admin/arc/incidents" class="link-button">
          사건 접수
        </router-link>
        <router-link
          v-if="canWriteCare"
          to="/admin/arc/routine"
          class="link-button"
        >
          월간 루틴
        </router-link>
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">작성된 AS-CARE</span>
        <strong>{{ records.length }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">서식 원본 첨부</span>
        <strong>{{ withFilesCount }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">추가 기록 있음</span>
        <strong>{{ withAddendaCount }}건</strong>
      </article>
      <article class="summary-card" :class="{ alert: !canWriteCare }">
        <span class="summary-label">내 권한</span>
        <strong>{{ canWriteCare ? "작성 가능" : "열람 승인 필요" }}</strong>
      </article>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>AS-CARE 목록</h2>
        <div class="panel-actions">
          <input
            v-model.trim="filters.search"
            class="inline-input"
            type="search"
            placeholder="사건번호·표시명·요약·작성자"
            @keyup.enter="loadRecords"
          />
          <input v-model="filters.from" class="inline-input" type="date" />
          <input v-model="filters.to" class="inline-input" type="date" />
          <label class="checkbox-field">
            <input v-model="filters.hasFiles" type="checkbox" />
            첨부 있는 건만
          </label>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadRecords"
          >
            새로고침
          </button>
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="errorMessage" class="empty-box">
        목록을 불러오지 못했어요.
      </p>
      <p v-else-if="!records.length" class="empty-box">
        조건에 맞는 AS-CARE 기록이 없어요. 사건 접수 화면에서 상세기록을 먼저
        작성해 주세요.
      </p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>사건번호</th>
              <th>발생</th>
              <th>성격</th>
              <th>표시명</th>
              <th>작성자</th>
              <th>기록 구성</th>
              <th>서식 원본</th>
              <th>최근 저장</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in records" :key="row.careRecordId">
              <td class="mono">{{ row.incidentNo }}</td>
              <td class="nowrap">
                {{ formatArcDateTime(row.occurredAt) }}
              </td>
              <td>
                <span class="kind-badge" :class="row.kind.toLowerCase()">
                  {{ ARC_INCIDENT_KIND_LABELS[row.kind] || row.kind }}
                </span>
              </td>
              <td>{{ row.subjectLabel || "-" }}</td>
              <td>{{ row.recordedByName || "-" }}</td>
              <td class="nowrap dim">
                측정 {{ row.timelineCount }} · 약품 {{ row.medsCount }} · 추가
                {{ row.addendaCount }}
              </td>
              <td>
                <span v-if="row.fileCount" class="ok-tag">
                  {{ row.fileCount }}개
                </span>
                <span v-else class="warn-tag">없음</span>
              </td>
              <td class="nowrap">
                {{ formatArcDateTime(row.updatedAt) }}
              </td>
              <td>
                <router-link
                  class="preset-button link"
                  :to="`/admin/arc/care/${row.incidentId}`"
                >
                  열기
                </router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="helper-text">
        서식 원본 첨부는 ARC 총괄만 올리거나 지울 수 있고, 내려받기 기록은
        민감정보 열람 로그에 남아요.
      </p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  ARC_INCIDENT_KIND_LABELS,
  fetchArcCareRecords,
  formatArcDateTime,
} from "@/lib/arc";

const records = ref([]);
const canWriteCare = ref(false);
const isLoading = ref(false);
const errorMessage = ref("");
const filters = reactive({
  search: "",
  from: "",
  to: "",
  hasFiles: false,
});

const withFilesCount = computed(
  () => records.value.filter((row) => row.fileCount > 0).length
);
const withAddendaCount = computed(
  () => records.value.filter((row) => row.addendaCount > 0).length
);

async function loadRecords() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchArcCareRecords({
      search: filters.search,
      from: filters.from,
      to: filters.to,
      hasFiles: filters.hasFiles,
      limit: 200,
    });

    records.value = data.records;
    canWriteCare.value = data.canWriteCare;
  } catch (error) {
    records.value = [];
    errorMessage.value = error?.message || "AS-CARE 목록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadRecords);
</script>

<style scoped lang="scss">
.admin-arc-care-list-view {
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

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.eyebrow {
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
  max-width: 760px;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.66);
}

.link-button {
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);

  &.alert {
    background: rgba(251, 191, 36, 0.16);
  }

  strong {
    font-size: 18px;
    font-weight: 800;
  }
}

.summary-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
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
  gap: 8px;
  flex-wrap: wrap;
}

.inline-input {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.preset-button {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.86);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &.link {
    display: inline-block;
    text-decoration: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 9px 10px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    vertical-align: top;
  }

  th {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
  }
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}

.nowrap {
  white-space: nowrap;
}

.dim {
  color: rgba(255, 255, 255, 0.5);
}

.kind-badge,
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

.ok-tag {
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
}

.warn-tag {
  background: rgba(251, 191, 36, 0.18);
  color: #fcd34d;
}

.helper-text {
  margin: 0;
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

.empty-box {
  margin: 0;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
