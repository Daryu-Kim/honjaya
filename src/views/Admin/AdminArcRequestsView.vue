<template>
  <div class="admin-arc-requests-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>요청 게시판</h1>
        <p class="description">
          사장·직원 모두 ARC 대표(최윤희)에게 질문·건의·비품 요청을 글로 남길 수
          있어요. 글을 남기면 처리 상태(대기중 → 읽음 → 완료)가 그대로 보이고,
          완료될 때는 꼭 처리 사유가 함께 남습니다.
        </p>
      </div>
      <div class="header-actions">
        <router-link v-if="canAccessArc" to="/admin/arc" class="link-button"
          >응급안전 홈</router-link
        >
        <button type="button" class="link-button" @click="loadAll">
          새로고침
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">전체 글</span>
        <strong>{{ summary.total ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary.pending ?? 0) > 0 }"
      >
        <span class="summary-label">대기중</span>
        <strong>{{ summary.pending ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">읽음</span>
        <strong>{{ summary.read ?? 0 }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">완료</span>
        <strong>{{ summary.done ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary.urgent ?? 0) > 0 }"
      >
        <span class="summary-label">긴급</span>
        <strong>{{ summary.urgent ?? 0 }}건</strong>
      </article>
    </section>

    <!-- 글쓰기 -->
    <section class="panel write-panel">
      <div class="panel-head">
        <h2>새 요청 남기기</h2>
        <button
          type="button"
          class="mini-button"
          @click="writeOpen = !writeOpen"
        >
          {{ writeOpen ? "접기" : "펼치기" }}
        </button>
      </div>

      <div v-show="writeOpen" class="write-body">
        <div class="field-grid">
          <label class="field">
            <span>분류</span>
            <select v-model="form.category">
              <option
                v-for="item in categoryOptions"
                :key="item.key"
                :value="item.key"
              >
                {{ item.label }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>제목</span>
            <input
              v-model.trim="form.title"
              type="text"
              maxlength="160"
              placeholder="예: 응급키트 거즈가 거의 떨어졌어요"
            />
          </label>
        </div>

        <label class="field">
          <span>내용 (언제·어디서·무엇이 문제인지 적으면 빨라요)</span>
          <textarea
            v-model.trim="form.body"
            rows="4"
            maxlength="4000"
            placeholder="예: 3월 12일 오픈 준비 중 확인했는데 2호점 구급상자 거즈가 2장 남았습니다. 다음 주 발주에 넣어 주실 수 있을까요?"
          ></textarea>
        </label>

        <label class="checkbox-field">
          <input v-model="form.urgent" type="checkbox" />
          <span>긴급 (오늘·내일 안에 확인이 필요해요)</span>
        </label>

        <div v-if="tips.length" class="tips">
          <p class="tips-title">이렇게 적으면 답이 빨라요</p>
          <ul>
            <li v-for="tip in tips" :key="tip">{{ tip }}</li>
          </ul>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="primary-button"
            :disabled="isSaving"
            @click="submitRequest"
          >
            {{ isSaving ? "보내는 중…" : "요청 남기기" }}
          </button>
          <span class="helper-text"
            >글은 삭제하지 않는 한 기록으로 남습니다.</span
          >
        </div>
      </div>
    </section>

    <!-- 목록 -->
    <section class="panel">
      <div class="panel-head">
        <h2>{{ isDirector ? "들어온 요청" : "내가 남긴 요청" }}</h2>
        <div class="panel-actions">
          <select v-model="filters.status" class="inline-input">
            <option value="">전체 상태</option>
            <option
              v-for="item in statusOptions"
              :key="item.key"
              :value="item.key"
            >
              {{ item.label }}
            </option>
          </select>
          <select v-model="filters.category" class="inline-input">
            <option value="">전체 분류</option>
            <option
              v-for="item in categoryOptions"
              :key="item.key"
              :value="item.key"
            >
              {{ item.label }}
            </option>
          </select>
          <input
            v-model="filters.period"
            class="inline-input month-input"
            type="month"
          />
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중…</p>
      <p v-else-if="requests.length === 0" class="empty-box">
        아직 남긴 요청이 없어요. 위에서 첫 요청을 남겨 보세요.
      </p>

      <ul v-else class="request-list">
        <li
          v-for="row in requests"
          :key="row.id"
          :class="['request-card', { active: activeId === row.id }]"
          @click="openRequest(row.id)"
        >
          <div class="request-top">
            <span class="cat-chip">{{ categoryLabel(row.category) }}</span>
            <span v-if="row.urgent" class="urgent-chip">긴급</span>
            <span :class="['status-chip', statusTone(row.status)]">
              {{ statusLabel(row.status) }}
            </span>
            <span class="request-no">{{ row.requestNo }}</span>
            <span class="request-date">{{ formatDate(row.createdAt) }}</span>
          </div>
          <p class="request-title">{{ row.title }}</p>
          <p class="request-meta">
            {{ row.authorName }} ·
            {{ row.status === "PENDING" ? "아직 읽지 않음" : "확인함" }}
            <span v-if="row.replyCount"> · 답글 {{ row.replyCount }}개</span>
          </p>
        </li>
      </ul>
    </section>

    <!-- 상세 -->
    <section v-if="active" class="panel detail-panel">
      <div class="panel-head">
        <h2>{{ active.title }}</h2>
        <div class="panel-actions">
          <span :class="['status-chip', statusTone(active.status)]">
            {{ statusLabel(active.status) }}
          </span>
          <button type="button" class="mini-button" @click="closeRequest">
            닫기
          </button>
        </div>
      </div>

      <p class="detail-meta">
        {{ active.requestNo }} · {{ categoryLabel(active.category) }} ·
        {{ active.authorName }} · {{ formatDate(active.createdAt) }}
      </p>
      <p class="detail-body">{{ active.body }}</p>

      <div v-if="active.readAt" class="detail-flag">
        읽음: {{ formatDate(active.readAt) }}
      </div>

      <div v-if="active.status === 'DONE'" class="done-box">
        <p class="done-title">완료 처리</p>
        <p class="done-note">{{ active.doneNote }}</p>
        <p class="done-meta">
          {{ active.doneBy || "ARC 대표" }} · {{ formatDate(active.doneAt) }}
        </p>
        <button
          v-if="isDirector"
          type="button"
          class="mini-button"
          :disabled="isSaving"
          @click="reopenActive"
        >
          완료 취소(다시 처리 중)
        </button>
      </div>

      <div class="reply-block">
        <p class="reply-title">답글 {{ active.replies?.length ?? 0 }}개</p>
        <p v-if="!active.replies?.length" class="empty-line">
          아직 답글이 없어요.
        </p>
        <ul v-else class="reply-list">
          <li
            v-for="reply in active.replies"
            :key="reply.id"
            :class="['reply-item', { director: reply.isDirector }]"
          >
            <p class="reply-head">
              <strong>{{ reply.authorName }}</strong>
              <span v-if="reply.isDirector" class="director-chip"
                >ARC 대표</span
              >
              <span class="reply-date">{{ formatDate(reply.createdAt) }}</span>
            </p>
            <p class="reply-body">{{ reply.body }}</p>
          </li>
        </ul>
      </div>

      <label class="field">
        <span>{{ isDirector ? "답글 남기기" : "추가로 남길 말" }}</span>
        <textarea
          v-model.trim="replyBody"
          rows="3"
          maxlength="4000"
          placeholder="처리 상황이나 추가로 궁금한 점을 적어 주세요."
        ></textarea>
      </label>
      <div class="form-actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving || replyBody.length === 0"
          @click="submitReply"
        >
          답글 등록
        </button>
      </div>

      <div v-if="isDirector" class="complete-block">
        <p class="complete-title">완료 처리 (사유 필수)</p>
        <textarea
          v-model.trim="doneNote"
          rows="3"
          maxlength="2000"
          placeholder="예: 3월 15일 발주에 거즈 3박스 포함해 신청했습니다. 입고되면 재고에 반영합니다."
        ></textarea>
        <div class="form-actions">
          <button
            type="button"
            class="primary-button"
            :disabled="isSaving || doneNote.length < 5"
            @click="completeActive"
          >
            완료로 바꾸기
          </button>
          <span class="helper-text">
            완료 사유는 직원 화면에 그대로 보입니다(최소 5자).
          </span>
        </div>
      </div>

      <div class="detail-footer">
        <button
          type="button"
          class="mini-button danger"
          :disabled="isSaving"
          @click="removeActive"
        >
          글 삭제
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";

import {
  completeArcRequest,
  createArcRequest,
  deleteArcRequest,
  fetchArcRequest,
  fetchArcRequests,
  formatArcDateTime,
  reopenArcRequest,
  replyArcRequest,
} from "@/lib/arc";
import { canAccessArc } from "@/lib/arc.js";
import { staffAuthState } from "@/lib/staffAuth";

const ARC_REQUEST_TIPS_FALLBACK = [
  "언제·어디서 생긴 일인지 먼저 적어 주세요.",
  "필요한 물건은 품명과 수량을 숫자로 적어 주세요.",
  "급하면 '긴급'에 체크해 주세요. 순서를 앞당겨 확인합니다.",
];

const employee = computed(() => staffAuthState.employee ?? null);
const isDirector = computed(() => Boolean(employee.value?.isArcDirector));

const requests = ref([]);
const summary = ref({});
const catalog = ref({ categories: [], statuses: [], tips: [] });
const active = ref(null);
const activeId = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const writeOpen = ref(true);
const errorMessage = ref("");
const okMessage = ref("");
const replyBody = ref("");
const doneNote = ref("");

const form = reactive({
  category: "QUESTION",
  title: "",
  body: "",
  urgent: false,
});

const filters = reactive({ status: "", category: "", period: "" });

const categoryOptions = computed(() => {
  const list = catalog.value.categories ?? [];

  if (list.length === 0) {
    return [
      { key: "QUESTION", label: "질문" },
      { key: "COMPLAINT", label: "불만·건의" },
      { key: "SUPPLY", label: "비품·약품 요청" },
      { key: "EDUCATION", label: "교육 요청" },
      { key: "FACILITY", label: "시설·환경" },
      { key: "HEALTH", label: "건강·컨디션" },
      { key: "ETC", label: "기타" },
    ];
  }

  return list.map((item) => ({ key: item.key, label: item.label }));
});

const statusOptions = computed(() => {
  const list = catalog.value.statuses ?? [];

  if (list.length === 0) {
    return [
      { key: "PENDING", label: "대기중" },
      { key: "READ", label: "읽음" },
      { key: "DONE", label: "완료" },
    ];
  }

  return list.map((item) => ({ key: item.key, label: item.label }));
});

const tips = computed(() => catalog.value.tips ?? ARC_REQUEST_TIPS_FALLBACK);

function categoryLabel(key) {
  return categoryOptions.value.find((item) => item.key === key)?.label ?? key;
}

function statusLabel(key) {
  return statusOptions.value.find((item) => item.key === key)?.label ?? key;
}

function statusTone(key) {
  if (key === "DONE") return "ok";
  if (key === "READ") return "info";
  return "warn";
}

function formatDate(value) {
  if (!value) return "-";

  return formatArcDateTime(value) || String(value).slice(0, 10);
}

function flash(message) {
  okMessage.value = message;
  window.setTimeout(() => {
    if (okMessage.value === message) okMessage.value = "";
  }, 3200);
}

async function loadAll() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchArcRequests({
      status: filters.status,
      category: filters.category,
      period: filters.period,
    });

    requests.value = data?.requests ?? [];
    summary.value = data?.summary ?? {};
    if (data?.catalog) catalog.value = data.catalog;

    if (activeId.value) {
      const still = requests.value.some((row) => row.id === activeId.value);
      if (!still) {
        active.value = null;
        activeId.value = "";
      }
    }
  } catch (error) {
    errorMessage.value = error?.message ?? "요청 목록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function openRequest(requestId) {
  errorMessage.value = "";

  try {
    const data = await fetchArcRequest(requestId);

    active.value = data?.request ?? data;
    activeId.value = requestId;
    replyBody.value = "";
    doneNote.value = "";
  } catch (error) {
    errorMessage.value = error?.message ?? "요청 글을 열지 못했어요.";
  }
}

function closeRequest() {
  active.value = null;
  activeId.value = "";
  replyBody.value = "";
  doneNote.value = "";
}

async function submitRequest() {
  errorMessage.value = "";

  if (!form.title) {
    errorMessage.value = "제목을 적어 주세요.";
    return;
  }

  if (!form.body) {
    errorMessage.value = "내용을 적어 주세요.";
    return;
  }

  isSaving.value = true;

  try {
    await createArcRequest({
      category: form.category,
      title: form.title,
      body: form.body,
      urgent: form.urgent,
    });

    form.title = "";
    form.body = "";
    form.urgent = false;
    flash("요청을 남겼어요. ARC 대표가 확인하면 상태가 바뀝니다.");
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message ?? "요청을 남기지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function submitReply() {
  if (!active.value || !replyBody.value) return;

  isSaving.value = true;
  errorMessage.value = "";

  try {
    const data = await replyArcRequest(active.value.id, {
      body: replyBody.value,
    });

    active.value = data?.request ?? data;
    replyBody.value = "";
    flash("답글을 등록했어요.");
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message ?? "답글을 등록하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function completeActive() {
  if (!active.value) return;

  isSaving.value = true;
  errorMessage.value = "";

  try {
    const data = await completeArcRequest(active.value.id, {
      doneNote: doneNote.value,
    });

    active.value = data?.request ?? data;
    doneNote.value = "";
    flash("완료로 바꿨어요. 사유가 기록에 남습니다.");
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message ?? "완료 처리하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function reopenActive() {
  if (!active.value) return;

  isSaving.value = true;
  errorMessage.value = "";

  try {
    const data = await reopenArcRequest(active.value.id, {
      note: "완료 취소",
    });

    active.value = data?.request ?? data;
    flash("완료를 취소했어요. 다시 처리 중으로 돌아갑니다.");
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message ?? "완료를 취소하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function removeActive() {
  if (!active.value) return;

  if (!window.confirm("이 요청 글을 삭제할까요? 삭제하면 되돌릴 수 없어요.")) {
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await deleteArcRequest(active.value.id);
    flash("요청 글을 삭제했어요.");
    closeRequest();
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message ?? "글을 삭제하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

watch(
  () => [filters.status, filters.category, filters.period],
  () => loadAll()
);

onMounted(loadAll);
</script>

<style scoped>
.admin-arc-requests-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}

.header-left h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #ffffff;
}

.description {
  margin: 6px 0 0;
  max-width: 720px;
  font-size: 13px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.72);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.link-button {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

.error-box {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.ok-box {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #047857;
  font-size: 13px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}

.summary-card.alert {
  border-color: #fca5a5;
  background: #fff5f5;
}

.summary-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}

.summary-card strong {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
}

.panel {
  padding: 16px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  color: #334155;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.panel-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.inline-input {
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 12px;
  color: #0f172a;
  background: #fff;
}

.month-input {
  min-width: 130px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.field input,
.field select,
.field textarea {
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 400;
  color: #0f172a;
  font-family: inherit;
  resize: vertical;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #334155;
}

.tips {
  margin: 12px 0 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.tips-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 800;
  color: #475569;
}

.tips ul {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: #475569;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.primary-button {
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.primary-button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.mini-button {
  padding: 6px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  cursor: pointer;
}

.mini-button.danger {
  border-color: #fecaca;
  color: #b91c1c;
  background: #fff5f5;
}

.helper-text {
  margin: 0;
  font-size: 11.5px;
  color: #64748b;
}

.request-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.request-card {
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.request-card:hover,
.request-card.active {
  border-color: #93c5fd;
  background: #f8fbff;
}

.request-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.cat-chip {
  padding: 3px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
  font-weight: 800;
}

.urgent-chip {
  padding: 3px 8px;
  border-radius: 999px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 11px;
  font-weight: 800;
}

.status-chip {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}

.status-chip.warn {
  background: #fff7ed;
  color: #c2410c;
}

.status-chip.info {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-chip.ok {
  background: #ecfdf5;
  color: #047857;
}

.request-no {
  font-size: 11px;
  color: #94a3b8;
}

.request-date {
  margin-left: auto;
  font-size: 11px;
  color: #94a3b8;
}

.request-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.request-meta {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: #64748b;
}

.empty-box {
  margin: 0;
  padding: 26px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  text-align: center;
}

.empty-line {
  margin: 6px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.detail-meta {
  margin: 0 0 10px;
  font-size: 12px;
  color: #64748b;
}

.detail-body {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  font-size: 13px;
  line-height: 1.75;
  color: #1e293b;
  white-space: pre-line;
}

.detail-flag {
  margin-top: 8px;
  font-size: 11.5px;
  color: #1d4ed8;
}

.done-box {
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid #a7f3d0;
  border-radius: 12px;
  background: #ecfdf5;
}

.done-title {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 800;
  color: #047857;
}

.done-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #065f46;
  white-space: pre-line;
}

.done-meta {
  margin: 6px 0 8px;
  font-size: 11px;
  color: #059669;
}

.reply-block {
  margin-top: 14px;
}

.reply-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  color: #334155;
}

.reply-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.reply-item {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.reply-item.director {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.reply-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  font-size: 11.5px;
  color: #334155;
}

.director-chip {
  padding: 2px 7px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 10.5px;
  font-weight: 800;
}

.reply-date {
  margin-left: auto;
  color: #94a3b8;
}

.reply-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #1e293b;
  white-space: pre-line;
}

.complete-block {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.complete-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 800;
  color: #334155;
}

.complete-block textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 13px;
  font-family: inherit;
  color: #0f172a;
  resize: vertical;
}

.detail-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
