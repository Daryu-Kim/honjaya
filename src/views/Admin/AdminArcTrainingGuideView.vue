<template>
  <div class="admin-arc-training-guide-view">
    <header class="page-header no-print">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>교육자료 · 오랄테스트 대비</h1>
        <p class="description">
          AS-GDE-001 「현장응급처치 교육가이드」 기준으로 정리한 학습 자료예요.
          교육 목표·상황연습·절대금지를 일반인 눈높이로 풀었고, 그대로 인쇄해서
          교육 교재나 구술평가 대본으로 쓸 수 있어요.
        </p>
      </div>
      <nav class="header-links">
        <router-link to="/admin/arc/training" class="link-button">
          월간 교육·OT
        </router-link>
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
        <button type="button" class="print-button" @click="printSheet">
          인쇄 · PDF 저장
        </button>
      </nav>
    </header>

    <p v-if="errorMessage" class="error-box no-print">{{ errorMessage }}</p>
    <p v-if="isLoading" class="empty-box no-print">
      교육자료를 불러오는 중이에요.
    </p>

    <section v-if="!isLoading && guide" class="filter-panel no-print">
      <div class="filter-row">
        <h2>1부 · 핵심 모듈</h2>
        <div class="filter-actions">
          <button type="button" class="ghost-button" @click="selectAllModules">
            전체 선택
          </button>
          <button type="button" class="ghost-button" @click="clearModules">
            전체 해제
          </button>
        </div>
      </div>
      <div class="chip-row">
        <button
          v-for="item in modules"
          :key="item.key"
          type="button"
          :class="['chip', { active: isModuleSelected(item.key) }]"
          @click="toggleModule(item.key)"
        >
          {{ item.title }}
        </button>
      </div>

      <div class="filter-row">
        <h2>2부 · 상황연습</h2>
        <select v-model="selectedCategory" class="category-select">
          <option value="ALL">전체 카테고리 ({{ scenarios.length }}개)</option>
          <option v-for="item in categories" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
      </div>

      <div class="filter-row">
        <h2>3부 · 절대금지</h2>
        <label class="switch">
          <input v-model="showForbidden" type="checkbox" />
          <span>절대금지 {{ forbidden.length }}개 함께 출력</span>
        </label>
      </div>

      <p class="print-hint">
        인쇄 미리보기에서 A4 · 여백 기본값을 쓰면 깔끔하게 나와요. 필요한 부분만
        골라서 뽑으면 교육 시간에 맞춰 쓸 수 있어요.
      </p>
    </section>

    <article v-if="!isLoading && guide" class="guide-sheet">
      <header class="sheet-head">
        <p class="sheet-brand">혼자야 · ARC SAFETY 응급안전관리센터</p>
        <h1>현장응급처치 교육자료</h1>
        <p class="sheet-sub">
          월간 교육·OT 구술평가(오랄테스트) 대비 학습 자료 · 일반인 눈높이
        </p>
        <dl class="sheet-meta">
          <div>
            <dt>근거 문서</dt>
            <dd>{{ guide.source }}</dd>
          </div>
          <div>
            <dt>출력일</dt>
            <dd>{{ printedOn }}</dd>
          </div>
          <div>
            <dt>수록</dt>
            <dd>
              핵심 모듈 {{ visibleModules.length }}개 · 상황연습
              {{ visibleScenarios.length }}개 · 절대금지
              {{ visibleForbidden.length }}개
            </dd>
          </div>
        </dl>
      </header>

      <section class="sheet-section quick-card">
        <h2>3분 요약 카드</h2>
        <p class="section-lead">
          교육 시작 전에 이 표만 같이 읽어도 절반은 끝나요. 숫자는 소리 내어
          읽으면서 외우세요.
        </p>
        <ul class="quick-list">
          <li v-for="item in QUICK_CARD" :key="item.label">
            <strong>{{ item.label }}</strong>
            <span>{{ item.value }}</span>
          </li>
        </ul>
      </section>

      <section v-if="examGuide" class="sheet-section">
        <h2>이렇게 공부하세요</h2>
        <p class="section-lead">{{ examGuide.title }}</p>
        <div class="round-grid">
          <article
            v-for="round in examGuide.rounds"
            :key="round.h"
            class="round-card"
          >
            <h3>{{ round.h }}</h3>
            <p>{{ round.p }}</p>
          </article>
        </div>
        <ul class="tip-list">
          <li v-for="tell in examGuide.tells" :key="tell">{{ tell }}</li>
        </ul>
      </section>

      <section v-if="visibleModules.length" class="sheet-section">
        <h2>1부 · 핵심 모듈 {{ visibleModules.length }}개</h2>
        <article
          v-for="item in visibleModules"
          :key="item.key"
          class="sheet-card"
        >
          <h3>
            {{ item.title }}
            <span class="tag">{{ item.phase }} · {{ item.minutes }}분</span>
          </h3>
          <p class="goal">교육 목표 · {{ item.goal }}</p>
          <p v-if="item.guide" class="why">{{ item.guide.why }}</p>

          <div
            v-for="block in item.guide?.body ?? []"
            :key="block.h"
            class="body-block"
          >
            <h4>{{ block.h }}</h4>
            <p>{{ block.p }}</p>
          </div>

          <ul v-if="item.guide?.numbers?.length" class="number-list">
            <li v-for="number in item.guide.numbers" :key="number">
              {{ number }}
            </li>
          </ul>

          <div v-if="item.guide?.tips?.length" class="bullet-box good">
            <p class="bullet-title">이렇게 하면 좋아요</p>
            <ul>
              <li v-for="tip in item.guide.tips" :key="tip">{{ tip }}</li>
            </ul>
          </div>

          <div v-if="item.guide?.mistakes?.length" class="bullet-box bad">
            <p class="bullet-title">자주 하는 실수</p>
            <ul>
              <li v-for="mistake in item.guide.mistakes" :key="mistake">
                {{ mistake }}
              </li>
            </ul>
          </div>

          <div v-if="item.items?.length" class="bullet-box plain">
            <p class="bullet-title">교육 내용 체크</p>
            <ul>
              <li v-for="line in item.items" :key="line">{{ line }}</li>
            </ul>
          </div>

          <p v-if="item.materials?.length" class="materials-line">
            준비물 · {{ item.materials.join(" · ") }}
          </p>

          <div v-if="item.guide?.oral" class="oral-box">
            <p class="oral-q">구술 문항 · {{ item.guide.oral.q }}</p>
            <p class="oral-a">모범 답안 · {{ item.guide.oral.a }}</p>
          </div>

          <div v-if="item.evaluation?.length" class="bullet-box eval">
            <p class="bullet-title">평가 기준 · 구술로 확인</p>
            <ul>
              <li v-for="line in item.evaluation" :key="line">{{ line }}</li>
            </ul>
          </div>
        </article>
      </section>

      <section v-if="visibleScenarios.length" class="sheet-section">
        <h2>2부 · 상황연습 {{ visibleScenarios.length }}개</h2>
        <p class="section-lead">
          상황을 읽고 10초 안에 "먼저 무엇을 할지" 말해 보세요. 답을 본 뒤에는
          순서를 가리고 다시 한 번 말합니다.
        </p>
        <article
          v-for="item in visibleScenarios"
          :key="item.key"
          class="sheet-card scenario"
        >
          <h3>
            {{ item.no }}. {{ item.scene }}
            <span class="tag">{{ item.category }}</span>
          </h3>
          <p v-if="item.guide" class="why">{{ item.guide.why }}</p>
          <ol v-if="item.guide?.steps?.length" class="step-list">
            <li v-for="step in item.guide.steps" :key="step">{{ step }}</li>
          </ol>
          <p v-if="item.guide?.trap" class="trap-line">
            헷갈리기 쉬운 점 · {{ item.guide.trap }}
          </p>
          <div v-if="item.guide?.oral" class="oral-box">
            <p class="oral-q">구술 문항 · {{ item.guide.oral.q }}</p>
            <p class="oral-a">모범 답안 · {{ item.guide.oral.a }}</p>
          </div>
        </article>
      </section>

      <section v-if="visibleForbidden.length" class="sheet-section">
        <h2>3부 · 절대금지 {{ visibleForbidden.length }}개</h2>
        <p class="section-lead">
          "왜 안 되는지"까지 말할 수 있어야 실제 상황에서도 지킬 수 있어요.
        </p>
        <ol class="forbidden-list">
          <li v-for="item in visibleForbidden" :key="item.key">
            <p class="forbidden-text">{{ item.text }}</p>
            <p v-if="item.guide" class="forbidden-why">
              이유 · {{ item.guide.why }}
            </p>
            <p v-if="item.guide" class="forbidden-instead">
              대신 이렇게 · {{ item.guide.instead }}
            </p>
          </li>
        </ol>
      </section>

      <footer class="sheet-foot">
        <p>
          혼자야 ARC SAFETY · AS-GDE-001 현장응급처치 교육가이드 / AS-KIT-001
          구급상자 운영관리대장 기준
        </p>
        <p>
          이 자료는 내부 교육용입니다. 실제 환자 상태 판단과 투약은 의료인·119
          지시를 따릅니다.
        </p>
      </footer>
    </article>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { fetchArcTrainingGuide } from "@/lib/arc";

const QUICK_CARD = [
  {
    label: "119 신고",
    value: "상황·위치·환자 상태·연락처를 한 번에. 끊지 말고 지시를 따릅니다.",
  },
  {
    label: "반응·호흡",
    value: "10초 안에 확인. 반응 없고 정상호흡 없으면 심정지로 판단합니다.",
  },
  {
    label: "가슴압박",
    value: "성인 5~6cm · 분당 100~120회 · 중단 최소화 · 완전히 이완.",
  },
  {
    label: "AED",
    value:
      "도착 즉시 패드 부착, 분석 중에는 손을 뗍니다. 음성 안내를 따릅니다.",
  },
  {
    label: "기가폐쇄",
    value: "기침 유도 → 말 못 하면 등 두드리기 5회 · 가슴 밀어내기 5회 반복.",
  },
  {
    label: "출혈",
    value: "직접 압박이 기본. 젖으면 위에 겹쳐 계속 압박합니다.",
  },
  {
    label: "화상",
    value: "흐르는 서늘한 물 20분. 얼음·기름·연고·물집 터뜨리기 금지.",
  },
  {
    label: "기록",
    value: "발견·신고·조치 시각과 한 일을 사실만. AS-CARE 24시간 내 정리.",
  },
];

const isLoading = ref(true);
const errorMessage = ref("");
const guide = ref(null);
const selectedKeys = ref([]);
const selectedCategory = ref("ALL");
const showForbidden = ref(true);

const modules = computed(() => guide.value?.modules ?? []);
const scenarios = computed(() => guide.value?.scenarios ?? []);
const forbidden = computed(() => guide.value?.forbidden ?? []);
const examGuide = computed(() => guide.value?.examGuide ?? null);

const categories = computed(() => {
  const set = new Set(
    scenarios.value.map((item) => item.category).filter(Boolean)
  );
  return [...set];
});

const visibleModules = computed(() =>
  modules.value.filter((item) => selectedKeys.value.includes(item.key))
);

const visibleScenarios = computed(() =>
  scenarios.value.filter(
    (item) =>
      selectedCategory.value === "ALL" ||
      item.category === selectedCategory.value
  )
);

const visibleForbidden = computed(() =>
  showForbidden.value ? forbidden.value : []
);

const printedOn = computed(() => {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
});

function isModuleSelected(key) {
  return selectedKeys.value.includes(key);
}

function toggleModule(key) {
  selectedKeys.value = isModuleSelected(key)
    ? selectedKeys.value.filter((item) => item !== key)
    : [...selectedKeys.value, key];
}

function selectAllModules() {
  selectedKeys.value = modules.value.map((item) => item.key);
}

function clearModules() {
  selectedKeys.value = [];
}

function printSheet() {
  window.print();
}

async function load() {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    const data = await fetchArcTrainingGuide();
    guide.value = data;
    selectedKeys.value = (data?.modules ?? []).map((item) => item.key);
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "교육자료를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  document.body.classList.add("arc-guide-open");
  load();
});

onUnmounted(() => {
  document.body.classList.remove("arc-guide-open");
});
</script>

<style scoped lang="scss">
.admin-arc-training-guide-view {
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
  flex-wrap: wrap;
}

.header-left {
  max-width: 780px;
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
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.66);
}

.header-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
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

.print-button {
  padding: 10px 18px;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.18);
  color: #bae6fd;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }
}

.filter-actions {
  display: flex;
  gap: 8px;
}

.ghost-button {
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &.active {
    border-color: rgba(167, 139, 250, 0.6);
    background: rgba(139, 92, 246, 0.24);
    color: #ede9fe;
  }
}

.category-select {
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: #131c2e;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);

  input {
    width: 16px;
    height: 16px;
    accent-color: #8b5cf6;
  }
}

.print-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.16);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fecaca;
  font-size: 13px;
}

.empty-box {
  margin: 0;
  padding: 22px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  text-align: center;
}

/* 인쇄 결과와 최대한 같게 보이도록 종이 느낌으로 표시합니다. */
.guide-sheet {
  width: 100%;
  max-width: 940px;
  margin: 0 auto;
  padding: 34px 38px 42px;
  border-radius: 18px;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  line-height: 1.75;
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.45);

  h1,
  h2,
  h3,
  h4,
  p,
  ul,
  ol,
  dl,
  dd {
    margin: 0;
  }

  ul,
  ol {
    padding-left: 18px;
  }

  h2 {
    font-size: 17px;
    font-weight: 800;
  }

  h3 {
    font-size: 14px;
    font-weight: 800;
  }

  h4 {
    font-size: 13px;
    font-weight: 800;
    color: #1e293b;
  }
}

.sheet-head {
  padding-bottom: 16px;
  border-bottom: 2px solid #111827;

  h1 {
    font-size: 26px;
    font-weight: 900;
    letter-spacing: -0.01em;
  }
}

.sheet-brand {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #6d28d9;
}

.sheet-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #475569;
}

.sheet-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 18px;
  margin-top: 14px;

  dt {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #64748b;
  }

  dd {
    font-size: 12px;
    color: #1f2937;
  }
}

.sheet-section {
  margin-top: 26px;

  > h2 {
    padding-bottom: 6px;
    border-bottom: 1px solid #cbd5e1;
  }
}

.section-lead {
  margin-top: 8px;
  font-size: 12px;
  color: #475569;
}

.quick-list {
  margin-top: 10px;
  display: grid;
  gap: 6px;
  list-style: none;
  padding-left: 0 !important;

  li {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 8px;
    background: #f1f5f9;
  }

  strong {
    font-size: 12px;
    font-weight: 800;
    color: #4c1d95;
  }

  span {
    font-size: 12px;
    color: #1f2937;
  }
}

.round-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.round-card {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;

  h3 {
    font-size: 12px;
    color: #4c1d95;
  }

  p {
    margin-top: 4px;
    font-size: 12px;
    color: #334155;
  }
}

.tip-list {
  margin-top: 10px;
  font-size: 12px;
  color: #334155;
}

.sheet-card {
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid #d7dde7;
  border-radius: 12px;
  break-inside: avoid;
  page-break-inside: avoid;

  h3 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
}

.tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
  font-size: 10px;
  font-weight: 800;
}

.goal {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #1f2937;
}

.why {
  margin-top: 6px;
  font-size: 12px;
  color: #334155;
}

.body-block {
  margin-top: 10px;

  h4 {
    font-size: 12px;
    color: #4c1d95;
  }

  p {
    margin-top: 2px;
    font-size: 12px;
    color: #1f2937;
  }
}

.number-list {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  padding-left: 0 !important;

  li {
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid #fbcfe8;
    background: #fdf2f8;
    font-size: 11px;
    font-weight: 700;
    color: #9d174d;
  }
}

.bullet-box {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  break-inside: avoid;

  ul {
    margin-top: 4px;
    font-size: 12px;
  }

  &.good {
    background: #f0fdf4;
    border-left: 3px solid #22c55e;
  }

  &.bad {
    background: #fef2f2;
    border-left: 3px solid #ef4444;
  }

  &.plain {
    background: #f8fafc;
    border-left: 3px solid #94a3b8;
  }

  &.eval {
    background: #fefce8;
    border-left: 3px solid #eab308;
  }
}

.bullet-title {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #0f172a;
}

.oral-box {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px dashed #a5b4fc;
  background: #eef2ff;
  break-inside: avoid;
}

.oral-q {
  font-size: 12px;
  font-weight: 800;
  color: #312e81;
}

.oral-a {
  margin-top: 3px;
  font-size: 12px;
  color: #1f2937;
}

.materials-line {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.6;
  color: #64748b;
}

.step-list {
  margin-top: 8px;
  font-size: 12px;
  color: #1f2937;

  li {
    margin-top: 3px;
  }
}

.trap-line {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #b45309;
}

.forbidden-list {
  margin-top: 10px;
  display: grid;
  gap: 8px;
  font-size: 12px;

  li {
    padding: 8px 12px;
    border-radius: 10px;
    background: #fef2f2;
    border-left: 3px solid #ef4444;
    break-inside: avoid;
  }
}

.forbidden-text {
  font-weight: 800;
  color: #991b1b;
}

.forbidden-why {
  margin-top: 3px;
  color: #334155;
}

.forbidden-instead {
  margin-top: 2px;
  font-weight: 700;
  color: #15803d;
}

.sheet-foot {
  margin-top: 28px;
  padding-top: 12px;
  border-top: 1px solid #cbd5e1;
  font-size: 10px;
  line-height: 1.6;
  color: #64748b;
}

@media (max-width: 900px) {
  .admin-arc-training-guide-view {
    padding: 16px;
  }

  .guide-sheet {
    padding: 22px 18px 30px;
  }

  .quick-list li {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>

<!-- 인쇄 전용: 사이드바·상단바를 숨기고 종이 여백만 남깁니다. 이 화면에서만 동작합니다. -->
<style lang="scss">
@media print {
  @page {
    margin: 12mm 10mm;
  }

  body.arc-guide-open {
    background: #ffffff !important;
  }

  body.arc-guide-open .admin-layout {
    display: block !important;
    background: #ffffff !important;
    color: #111827 !important;
    color-scheme: light !important;
    min-height: auto !important;
  }

  body.arc-guide-open .admin-sidebar,
  body.arc-guide-open .admin-topbar,
  body.arc-guide-open .mobile-menu-backdrop,
  body.arc-guide-open .no-print {
    display: none !important;
  }

  body.arc-guide-open .admin-main {
    display: block !important;
    margin: 0 !important;
    width: auto !important;
  }

  body.arc-guide-open .admin-content {
    padding: 0 !important;
    background: #ffffff !important;
  }

  body.arc-guide-open .guide-sheet {
    max-width: none !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  body.arc-guide-open .sheet-card,
  body.arc-guide-open .round-card,
  body.arc-guide-open .bullet-box,
  body.arc-guide-open .oral-box,
  body.arc-guide-open .forbidden-list li {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
</style>
