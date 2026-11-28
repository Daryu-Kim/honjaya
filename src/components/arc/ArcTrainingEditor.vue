<template>
  <section class="editor-panel">
    <header class="editor-head">
      <div>
        <h2>교육자료 수정 — ARC 대표(RN) 전용</h2>
        <p class="editor-desc">
          교육 모듈·상황연습·절대금지 원문을 최윤희 선생님이 직접 고칠 수
          있어요. 여기서 저장한 내용은 직원·사장이 보는 교육자료와 인쇄물에
          그대로 반영됩니다. 잘못 고쳤다면 <strong>원문으로 되돌리기</strong>를
          누르면 됩니다.
        </p>
      </div>
      <button type="button" class="ghost-button" @click="emit('close')">
        수정 닫기
      </button>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="savedMessage" class="ok-box">{{ savedMessage }}</p>

    <div class="scope-row">
      <button
        v-for="item in SCOPES"
        :key="item.key"
        type="button"
        :class="['scope-button', { active: scope === item.key }]"
        @click="changeScope(item.key)"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="editor-grid">
      <aside class="item-list">
        <p class="list-title">
          {{ scopeLabel }} {{ items.length }}개
          <span class="legend"><b>수정됨</b> 표시는 이미 고친 항목이에요.</span>
        </p>
        <button
          v-for="item in items"
          :key="item.key"
          type="button"
          :class="['item-button', { active: contentKey === item.key }]"
          @click="selectItem(item.key)"
        >
          <span class="item-no">{{ item.no ?? item.key }}</span>
          <span class="item-label">{{ shortLabel(item) }}</span>
          <span v-if="isEdited(item.key)" class="dot">수정됨</span>
        </button>
      </aside>

      <div v-if="current" class="editor-body">
        <h3>{{ shortLabel(current) }}</h3>

        <!-- 작성 도우미 -->
        <section class="helper-block">
          <header>
            <h4>작성 도우미 — 몇 줄만 적으면 문장을 만들어 드려요</h4>
            <button
              type="button"
              class="ghost-button small"
              @click="toggleHelper"
            >
              {{ helperOpen ? "접기" : "펼치기" }}
            </button>
          </header>
          <p class="helper-desc">
            이번 달 있었던 일만 적어도 아래 네 덩어리가 자동으로 만들어집니다.
            마음에 드는 것만 골라 <strong>적용</strong>을 누르면 교육자료에 바로
            들어가요.
          </p>
          <div v-if="helperOpen" class="helper-form">
            <label>
              대상 월
              <input v-model="helper.month" type="month" />
            </label>
            <label class="wide">
              이번 달 실제 사례
              <input
                v-model="helper.incident"
                type="text"
                placeholder="예: 손님이 화장실에서 쓰러져 119 출동"
              />
            </label>
            <label class="wide">
              직원이 반복한 실수
              <input
                v-model="helper.mistake"
                type="text"
                placeholder="예: 장갑 없이 피를 닦음"
              />
            </label>
            <label class="wide">
              새로 들여온 품목·변경 사항
              <input
                v-model="helper.product"
                type="text"
                placeholder="예: 이지엔6 이브 추가, 위치 카운터 아래"
              />
            </label>
            <label class="wide">
              이번 달 강조점
              <input
                v-model="helper.emphasis"
                type="text"
                placeholder="예: 확인 없이 약 건네지 않기"
              />
            </label>
            <label>
              교육 대상
              <input
                v-model="helper.audience"
                type="text"
                placeholder="사장·직원"
              />
            </label>
            <button
              type="button"
              class="primary-button wide"
              :disabled="isSaving"
              @click="runHelper"
            >
              도우미로 초안 만들기
            </button>
          </div>

          <div v-if="helperResult" class="helper-result">
            <article>
              <header>
                <h5>① 보강 포인트 (인쇄용)</h5>
                <button
                  type="button"
                  class="mini-button"
                  @click="applyHelperNote"
                >
                  적용
                </button>
              </header>
              <pre>{{ helperResult.helperNote }}</pre>
            </article>
            <article>
              <header>
                <h5>② 요약 초안</h5>
                <button
                  type="button"
                  class="mini-button"
                  @click="applyHelperSummary"
                >
                  적용
                </button>
              </header>
              <p>{{ helperResult.summary }}</p>
            </article>
            <article v-if="helperResult.pitfalls?.length">
              <header>
                <h5>③ 흔한 실수 초안</h5>
                <button
                  type="button"
                  class="mini-button"
                  @click="applyHelperPitfalls"
                >
                  추가
                </button>
              </header>
              <ul>
                <li v-for="row in helperResult.pitfalls" :key="row.text">
                  <strong>{{ row.text }}</strong> — {{ row.why }}
                </li>
              </ul>
            </article>
            <article v-if="helperResult.quiz?.length">
              <header>
                <h5>④ 확인 질문 초안</h5>
                <button
                  type="button"
                  class="mini-button"
                  @click="applyHelperQuiz"
                >
                  추가
                </button>
              </header>
              <ul>
                <li v-for="row in helperResult.quiz" :key="row.q">
                  <strong>{{ row.q }}</strong> — {{ row.a }}
                </li>
              </ul>
            </article>
          </div>
        </section>

        <!-- 편집 필드 -->
        <div class="field-grid">
          <label v-for="field in fields" :key="field.key" :class="field.class">
            {{ field.label }}
            <small v-if="field.hint">{{ field.hint }}</small>
            <textarea
              v-model="form[field.key]"
              :rows="field.rows ?? 3"
              :placeholder="field.placeholder ?? ''"
            ></textarea>
          </label>
        </div>

        <div
          v-if="scope === 'MODULE' && moduleItemKeys.length"
          class="item-details"
        >
          <h4>항목별 자세한 설명 (직원이 읽는 부분)</h4>
          <label v-for="item in moduleItemKeys" :key="item.key">
            {{ item.label }}
            <textarea
              v-model="itemDetails[item.key]"
              rows="2"
              placeholder="이 항목을 왜 하는지, 어떻게 하는지 쉬운 말로 적어 주세요."
            ></textarea>
          </label>
        </div>

        <div class="editor-actions">
          <button
            type="button"
            class="primary-button"
            :disabled="isSaving"
            @click="save"
          >
            교육자료 저장
          </button>
          <button
            type="button"
            class="mini-button danger"
            :disabled="isSaving || !isEdited(contentKey)"
            @click="restore"
          >
            원문으로 되돌리기
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  buildArcTrainingHelper,
  fetchArcTrainingContent,
  resetArcTrainingContent,
  saveArcTrainingContent,
} from "@/lib/arc";

const props = defineProps({
  catalog: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["saved", "close"]);

const SCOPES = [
  { key: "MODULE", label: "교육 모듈" },
  { key: "SCENARIO", label: "상황연습 21" },
  { key: "FORBIDDEN", label: "절대금지 30" },
];

const scope = ref("MODULE");
const contentKey = ref("");
const isSaving = ref(false);
const errorMessage = ref("");
const savedMessage = ref("");
const editedRows = ref([]);
const helperOpen = ref(false);
const helperResult = ref(null);
const form = reactive({});
const itemDetails = reactive({});
const helper = reactive({
  month: new Date().toISOString().slice(0, 7),
  incident: "",
  mistake: "",
  product: "",
  emphasis: "",
  audience: "사장·직원",
});

const scopeLabel = computed(
  () => SCOPES.find((item) => item.key === scope.value)?.label ?? ""
);

const items = computed(() => {
  if (scope.value === "SCENARIO") return props.catalog.scenarios ?? [];
  if (scope.value === "FORBIDDEN") return props.catalog.forbidden ?? [];
  return props.catalog.modules ?? [];
});

const current = computed(
  () => items.value.find((item) => item.key === contentKey.value) ?? null
);

const moduleItemKeys = computed(() =>
  (current.value?.items ?? []).map((row) =>
    Array.isArray(row)
      ? { key: row[0], label: row[1] }
      : { key: row.key, label: row.label }
  )
);

const fields = computed(() => {
  if (scope.value === "SCENARIO") {
    return [
      { key: "scene", label: "상황", rows: 2 },
      { key: "answer", label: "정답·대응", rows: 3 },
      { key: "why", label: "왜 그렇게 하는가", rows: 3 },
      {
        key: "steps",
        label: "단계별 행동",
        hint: "한 줄에 한 단계씩 적어 주세요.",
        rows: 4,
      },
      { key: "wrong", label: "자주 하는 잘못된 대응", rows: 2 },
      { key: "basis", label: "근거(가이드·지침)", rows: 2 },
      { key: "helperNote", label: "보강 포인트(도우미 결과)", rows: 4 },
    ];
  }

  if (scope.value === "FORBIDDEN") {
    return [
      { key: "text", label: "금지 행동", rows: 3 },
      { key: "why", label: "왜 금지인가", rows: 4 },
      { key: "instead", label: "대신 이렇게 하세요", rows: 4 },
      { key: "risk", label: "어기면 생기는 일", rows: 3 },
      { key: "signs", label: "살펴볼 신호", rows: 3 },
      { key: "drill", label: "소리 내어 연습", rows: 3 },
      { key: "basis", label: "근거", rows: 2 },
      { key: "helperNote", label: "보강 포인트(도우미 결과)", rows: 4 },
    ];
  }

  return [
    { key: "title", label: "교육 제목", rows: 1 },
    { key: "goal", label: "교육 목표", rows: 2 },
    { key: "summary", label: "요약 (직원이 먼저 읽는 3~5줄)", rows: 4 },
    { key: "why", label: "왜 이 교육을 하는가", rows: 4 },
    {
      key: "basis",
      label: "이론 근거",
      hint: "한 줄에 근거 하나씩 적어 주세요.",
      rows: 3,
    },
    {
      key: "checklist",
      label: "진행 체크리스트",
      hint: "한 줄에 하나씩. 교육할 때 순서대로 읽으세요.",
      rows: 5,
    },
    {
      key: "pitfalls",
      label: "흔한 실수",
      hint: "한 줄에 '실수 | 왜 문제인지' 형식으로 적어 주세요.",
      rows: 4,
    },
    {
      key: "quiz",
      label: "확인 질문",
      hint: "한 줄에 '질문 | 정답' 형식으로 적어 주세요.",
      rows: 4,
    },
    { key: "helperNote", label: "보강 포인트(도우미 결과)", rows: 5 },
  ];
});

function shortLabel(item) {
  if (scope.value === "FORBIDDEN") return item.text ?? item.key;
  if (scope.value === "SCENARIO") return item.scene ?? item.key;
  return item.title ?? item.key;
}

function toLines(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

function toPairLines(rows, left, right) {
  return (rows ?? [])
    .map((row) => `${row[left] ?? ""} | ${row[right] ?? ""}`)
    .join("\n");
}

function parseLines(value) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parsePairs(value, left, right) {
  return parseLines(value)
    .map((line) => {
      const [first, ...rest] = line.split("|");
      return {
        [left]: (first ?? "").trim(),
        [right]: rest.join("|").trim(),
      };
    })
    .filter((row) => row[left]);
}

function isEdited(key) {
  return editedRows.value.some(
    (row) => row.scope === scope.value && row.key === key
  );
}

async function loadOverrides() {
  try {
    const data = await fetchArcTrainingContent();
    editedRows.value = data?.rows ?? [];
  } catch (error) {
    errorMessage.value = error?.message ?? "수정 이력을 불러오지 못했어요.";
  }
}

function clearForm() {
  Object.keys(form).forEach((key) => {
    delete form[key];
  });
  Object.keys(itemDetails).forEach((key) => {
    delete itemDetails[key];
  });
}

function fillForm() {
  clearForm();
  helperResult.value = null;

  const item = current.value;
  if (!item) return;

  if (scope.value === "SCENARIO") {
    form.scene = item.scene ?? "";
    form.answer = item.answer ?? "";
    form.why = item.why ?? "";
    form.steps = toLines(item.steps);
    form.wrong = item.wrong ?? "";
    form.basis = item.basis ?? "";
    form.helperNote = item.helperNote ?? "";
    return;
  }

  if (scope.value === "FORBIDDEN") {
    form.text = item.text ?? "";
    form.why = item.why ?? "";
    form.instead = item.instead ?? "";
    form.risk = item.risk ?? "";
    form.signs = item.signs ?? "";
    form.drill = item.drill ?? "";
    form.basis = item.basis ?? "";
    form.helperNote = item.helperNote ?? "";
    return;
  }

  form.title = item.title ?? "";
  form.goal = item.goal ?? "";
  form.summary = item.summary ?? "";
  form.why = item.why ?? "";
  form.basis = toLines(item.basis);
  form.checklist = toLines(item.checklist);
  form.pitfalls = toPairLines(item.pitfalls, "text", "why");
  form.quiz = toPairLines(item.quiz, "q", "a");
  form.helperNote = item.helperNote ?? "";

  moduleItemKeys.value.forEach((row) => {
    itemDetails[row.key] = item.itemDetails?.[row.key] ?? "";
  });
}

function changeScope(next) {
  scope.value = next;
  contentKey.value = "";
  clearForm();
  selectItem((items.value[0] ?? {}).key ?? "");
}

function selectItem(key) {
  contentKey.value = key;
  fillForm();
}

function toggleHelper() {
  helperOpen.value = !helperOpen.value;
}

function buildPayload() {
  if (scope.value === "SCENARIO") {
    return {
      scene: form.scene,
      answer: form.answer,
      why: form.why,
      steps: parseLines(form.steps),
      wrong: form.wrong,
      basis: form.basis,
      helperNote: form.helperNote,
    };
  }

  if (scope.value === "FORBIDDEN") {
    return {
      text: form.text,
      why: form.why,
      instead: form.instead,
      risk: form.risk,
      signs: form.signs,
      drill: form.drill,
      basis: form.basis,
      helperNote: form.helperNote,
    };
  }

  const details = {};
  Object.entries(itemDetails).forEach(([key, value]) => {
    details[key] = value ?? "";
  });

  return {
    title: form.title,
    goal: form.goal,
    summary: form.summary,
    why: form.why,
    basis: parseLines(form.basis),
    checklist: parseLines(form.checklist),
    pitfalls: parsePairs(form.pitfalls, "text", "why"),
    quiz: parsePairs(form.quiz, "q", "a"),
    items: details,
    helperNote: form.helperNote,
  };
}

function flash(message) {
  savedMessage.value = message;

  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      savedMessage.value = "";
    }, 3200);
  }
}

async function save() {
  if (!contentKey.value) return;

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await saveArcTrainingContent({
      scope: scope.value,
      key: contentKey.value,
      payload: buildPayload(),
    });
    flash("교육자료를 저장했어요. 직원 화면에도 바로 반영됩니다.");
    await loadOverrides();
    emit("saved");
  } catch (error) {
    errorMessage.value = error?.message ?? "저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function restore() {
  if (
    !window.confirm(
      "이 항목을 원문(기본 교육자료)으로 되돌릴까요? 직접 고친 내용은 사라집니다."
    )
  ) {
    return;
  }

  isSaving.value = true;

  try {
    await resetArcTrainingContent(scope.value, contentKey.value);
    flash("원문으로 되돌렸어요.");
    await loadOverrides();
    emit("saved");
  } catch (error) {
    errorMessage.value = error?.message ?? "되돌리지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function runHelper() {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    const data = await buildArcTrainingHelper({
      scope: scope.value,
      key: contentKey.value,
      title: form.title || shortLabel(current.value ?? {}),
      input: { ...helper },
    });
    helperResult.value = data?.helper ?? null;
  } catch (error) {
    errorMessage.value = error?.message ?? "도우미를 실행하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

function applyHelperNote() {
  form.helperNote = helperResult.value?.helperNote ?? "";
  flash("보강 포인트를 넣었어요. 저장을 눌러야 반영됩니다.");
}

function applyHelperSummary() {
  form.summary = helperResult.value?.summary ?? "";
  flash("요약 초안을 넣었어요. 저장을 눌러야 반영됩니다.");
}

function applyHelperPitfalls() {
  const extra = (helperResult.value?.pitfalls ?? [])
    .map((row) => `${row.text} | ${row.why}`)
    .join("\n");
  form.pitfalls = [form.pitfalls, extra].filter(Boolean).join("\n");
  flash("흔한 실수 초안을 추가했어요. 저장을 눌러야 반영됩니다.");
}

function applyHelperQuiz() {
  const extra = (helperResult.value?.quiz ?? [])
    .map((row) => `${row.q} | ${row.a}`)
    .join("\n");
  form.quiz = [form.quiz, extra].filter(Boolean).join("\n");
  flash("확인 질문 초안을 추가했어요. 저장을 눌러야 반영됩니다.");
}

onMounted(async () => {
  await loadOverrides();
  selectItem((items.value[0] ?? {}).key ?? "");
});
</script>

<style scoped>
.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #f8fafc;
  color: #111827;
}

.editor-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.editor-head h2 {
  margin: 0 0 6px;
  font-size: 18px;
}

.editor-desc {
  max-width: 760px;
  margin: 0;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.6;
}

.scope-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.scope-button {
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  color: #374151;
  font-size: 13px;
  cursor: pointer;
}

.scope-button.active {
  border-color: #b45309;
  background: #fffbeb;
  color: #b45309;
  font-weight: 600;
}

.editor-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(200px, 260px) 1fr;
}

@media (max-width: 900px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }
}

.item-list {
  max-height: 720px;
  padding: 12px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.list-title {
  margin: 0 0 8px;
  color: #6b7280;
  font-size: 12px;
}

.legend {
  display: block;
  margin-top: 2px;
  color: #9ca3af;
}

.item-button {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #374151;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.item-button:hover {
  background: #f3f4f6;
}

.item-button.active {
  background: #fef3c7;
  color: #92400e;
  font-weight: 600;
}

.item-no {
  flex: 0 0 auto;
  color: #9ca3af;
  font-size: 11px;
}

.item-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 600;
}

.editor-body {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.editor-body h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.helper-block {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  background: #fffbeb;
}

.helper-block header {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.helper-block h4 {
  margin: 0;
  font-size: 13px;
}

.helper-desc {
  margin: 6px 0 10px;
  color: #92400e;
  font-size: 12px;
  line-height: 1.6;
}

.helper-form {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.helper-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #374151;
  font-size: 12px;
}

.helper-form .wide {
  grid-column: 1 / -1;
}

.helper-form input {
  padding: 7px 9px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 12px;
}

.helper-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.helper-result article {
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.helper-result header {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.helper-result h5 {
  margin: 0;
  font-size: 12px;
}

.helper-result pre {
  margin: 6px 0 0;
  color: #374151;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.helper-result p,
.helper-result li {
  margin: 6px 0 0;
  color: #374151;
  font-size: 12px;
  line-height: 1.7;
}

.helper-result ul {
  margin: 6px 0 0;
  padding-left: 16px;
}

.field-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.field-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
}

.field-grid small {
  color: #9ca3af;
  font-size: 11px;
  font-weight: 400;
}

.field-grid textarea {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.7;
  resize: vertical;
}

.item-details {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #e5e7eb;
}

.item-details h4 {
  margin: 0 0 8px;
  font-size: 13px;
}

.item-details label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
}

.item-details textarea {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.7;
  resize: vertical;
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.primary-button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #b45309;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.primary-button.wide {
  grid-column: 1 / -1;
}

.mini-button {
  padding: 5px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.mini-button.danger {
  border-color: #fca5a5;
  color: #b91c1c;
}

.ghost-button {
  padding: 7px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.ghost-button.small {
  padding: 4px 9px;
  font-size: 11px;
}

.error-box {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.ok-box {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  background: #ecfdf5;
  color: #047857;
  font-size: 13px;
}
</style>
