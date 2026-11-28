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

    <section v-if="canWriteCare" class="panel">
      <div class="panel-head">
        <h2>서식 원본 등록 (한글·워드·PDF)</h2>
      </div>
      <p class="helper-text">
        종이로 작성·서명한 AS-CARE 원본을 사건에 붙여 둘 수 있어요. HWP · HWPX ·
        DOC · DOCX · XLS · XLSX · PDF · JPG · PNG · TXT 파일을 한 개 20MB까지
        올릴 수 있고, 등록은 ARC 총괄(최윤희)만 할 수 있어요.
      </p>
      <p v-if="uploadError" class="error-box">{{ uploadError }}</p>
      <p v-else-if="uploadOk" class="ok-box">{{ uploadOk }}</p>
      <div class="upload-form">
        <label class="field wide">
          <span>사건 선택</span>
          <select v-model="uploadIncidentId" :disabled="isUploading">
            <option value="">사건을 선택해 주세요</option>
            <option v-for="row in incidents" :key="row.id" :value="row.id">
              {{ row.incidentNo }} · {{ formatArcDateTime(row.occurredAt) }} ·
              {{ row.subjectLabel || "표시명 없음" }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>서식 파일</span>
          <input
            ref="uploadInput"
            type="file"
            accept=".hwp,.hwpx,.doc,.docx,.xls,.xlsx,.pdf,.jpg,.jpeg,.png,.txt"
            :disabled="isUploading"
          />
        </label>
        <label class="field">
          <span>자료 종류</span>
          <select v-model="uploadKind" :disabled="isUploading">
            <option
              v-for="(label, code) in ARC_CARE_FILE_KIND_LABELS"
              :key="code"
              :value="code"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <label class="field wide">
          <span>메모(선택)</span>
          <input
            v-model.trim="uploadNote"
            type="text"
            maxlength="300"
            placeholder="예) 종이 서식 서명 후 스캔, 원본은 사무실 보관"
            :disabled="isUploading"
          />
        </label>
        <div class="actions">
          <button
            type="button"
            class="preset-button"
            :disabled="isUploading"
            @click="submitUpload"
          >
            {{ isUploading ? "올리는 중…" : "서식 원본 올리기" }}
          </button>
        </div>
      </div>
    </section>
    <p v-else class="helper-text">
      서식 원본 등록은 ARC 총괄(최윤희)만 할 수 있어요. 등록된 원본은 각 사건의
      AS-CARE 화면에서 내려받을 수 있어요.
    </p>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  ARC_CARE_FILE_KIND_LABELS,
  ARC_INCIDENT_KIND_LABELS,
  fetchArcCareRecords,
  fetchArcIncidents,
  formatArcDateTime,
  uploadArcCareFile,
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

// 서식 원본 등록(ARC 총괄 전용). 사건을 고르고 파일을 붙입니다.
const incidents = ref([]);
const uploadIncidentId = ref("");
const uploadKind = ref("CARE_SHEET");
const uploadNote = ref("");
const uploadInput = ref(null);
const uploadError = ref("");
const uploadOk = ref("");
const isUploading = ref(false);

const withFilesCount = computed(
  () => records.value.filter((row) => row.fileCount > 0).length
);
const withAddendaCount = computed(
  () => records.value.filter((row) => row.addendaCount > 0).length
);

async function loadIncidents() {
  try {
    const data = await fetchArcIncidents({ limit: 200 });

    incidents.value = data.incidents ?? [];
  } catch {
    incidents.value = [];
  }
}

async function submitUpload() {
  if (isUploading.value) return;

  uploadError.value = "";
  uploadOk.value = "";

  const file = uploadInput.value?.files?.[0];

  if (!uploadIncidentId.value) {
    uploadError.value = "원본을 붙일 사건을 먼저 선택해 주세요.";
    return;
  }

  if (!file) {
    uploadError.value = "올릴 파일을 선택해 주세요.";
    return;
  }

  isUploading.value = true;

  try {
    const result = await uploadArcCareFile(uploadIncidentId.value, {
      file,
      kind: uploadKind.value,
      note: uploadNote.value,
    });

    uploadOk.value = result.duplicated
      ? "같은 파일이 이미 첨부되어 있어요. 기존 파일을 그대로 두었어요."
      : `'${result.file?.fileName || file.name}' 파일을 첨부했어요.`;
    uploadNote.value = "";

    if (uploadInput.value) {
      uploadInput.value.value = "";
    }

    await loadRecords();
  } catch (error) {
    uploadError.value = error?.message || "파일을 첨부하지 못했어요.";
  } finally {
    isUploading.value = false;
  }
}

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

    if (data.canWriteCare) {
      await loadIncidents();
    }
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
@use "../../scss/_arc-ui" as *;
.admin-arc-care-list-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.header-actions {
  flex-shrink: 0;
}

.preset-button {
  &.link {
    display: inline-block;
    text-decoration: none;
  }
}

.mono {
  white-space: nowrap;
}

.nowrap {
  white-space: nowrap;
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

.upload-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  align-items: end;
}

.field {
  span {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.62);
  }

  select option {
    color: #ffffff;
  }
}

.actions {
  grid-column: 1 / -1;
}
</style>
