<template>
  <div class="admin-arc-permissions-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY · 권한 관리</p>
        <h1>응급안전 권한 관리</h1>
        <p class="description">
          응급안전관리센터 메뉴 {{ catalog.length }}개의 권한은 오직 ARC
          대표(RN)만 부여·회수할 수 있어요. 메뉴 하나하나를 따로 켜고 끌 수
          있고, 일반 직원 관리 화면에서는 응급안전 권한이 잠겨 있습니다.
          저장하면 그 직원의 로그인 세션이 즉시 끊겨 새 권한이 바로 적용돼요.
        </p>
      </div>
      <router-link to="/admin/arc" class="link-button">응급안전 홈</router-link>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="savedMessage" class="ok-box">{{ savedMessage }}</p>
    <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>

    <template v-else>
      <section class="panel guide-panel">
        <h2>권한 {{ catalog.length }}종이 뜻하는 것</h2>
        <p class="helper-text">
          체크 한 칸이 실제로 어떤 일을 할 수 있게 하는지 먼저 읽어 보고 정해
          주세요. 메뉴를 하나라도 켜면 ‘센터 입장·종합 현황’은 자동으로 함께
          켜집니다. 기본값으로 되돌리려면 각 사람 칸의 ‘기본값으로’를 누르면
          됩니다.
        </p>

        <div
          v-for="group in groups"
          :key="`guide-${group.name}`"
          class="guide-group"
        >
          <h3 class="guide-group-title">
            {{ group.name }}
            <span>{{ group.items.length }}개 메뉴</span>
          </h3>
          <ul class="perm-guide">
            <li
              v-for="item in group.items"
              :key="item.permission"
              class="perm-guide-item"
            >
              <div class="perm-guide-head">
                <strong>{{ item.label }}</strong>
                <span class="perm-count"
                  >현재 {{ totals[item.permission] || 0 }}명 보유</span
                >
              </div>
              <p class="perm-plain">{{ item.plain }}</p>
              <p v-if="item.caution" class="perm-caution">
                주의 · {{ item.caution }}
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section
        v-for="person in employees"
        :key="person.id"
        class="panel person-panel"
      >
        <header class="person-head">
          <div>
            <h2>
              {{ person.name || person.loginId }}
              <span class="person-title">{{ person.titleLabel }}</span>
            </h2>
            <p class="person-meta">
              아이디 {{ person.loginId }} ·
              {{
                person.isArcDirector
                  ? "응급안전 총괄(권한 변경 불가)"
                  : stateLabel(person)
              }}
              · 지금 {{ (drafts[person.id] || []).length }}종 선택
            </p>
          </div>

          <div class="person-actions">
            <template v-if="!person.isArcDirector">
              <button
                type="button"
                class="ghost-button"
                :disabled="isSaving === person.id"
                @click="selectAll(person)"
              >
                전체 켜기
              </button>
              <button
                type="button"
                class="ghost-button"
                :disabled="isSaving === person.id"
                @click="clearAll(person)"
              >
                전체 끄기
              </button>
              <button
                type="button"
                class="ghost-button"
                :disabled="isSaving === person.id"
                @click="resetToDefault(person)"
              >
                기본값으로
              </button>
              <button
                type="button"
                class="primary-button"
                :disabled="isSaving === person.id"
                @click="save(person)"
              >
                {{ isSaving === person.id ? "저장 중…" : "권한 저장" }}
              </button>
            </template>
          </div>
        </header>

        <p v-if="person.isArcDirector" class="lock-note">
          ARC 대표(RN) 본인 권한은 잠금 사고를 막기 위해 항상
          {{ catalog.length }}종 전부로 고정돼요. 다른 사람의 권한만 바꿀 수
          있습니다.
        </p>

        <div
          v-for="group in groups"
          :key="`${person.id}-${group.name}`"
          class="group-block"
        >
          <div class="group-head">
            <h3 class="group-name">
              {{ group.name }}
              <span class="group-count">
                {{ groupSelected(person, group) }}/{{ group.items.length }}
              </span>
            </h3>
            <div v-if="!person.isArcDirector" class="group-actions">
              <button
                type="button"
                class="group-button"
                :disabled="isSaving === person.id"
                @click="setGroup(person, group, true)"
              >
                이 묶음 켜기
              </button>
              <button
                type="button"
                class="group-button"
                :disabled="isSaving === person.id"
                @click="setGroup(person, group, false)"
              >
                끄기
              </button>
            </div>
          </div>

          <div class="perm-grid">
            <label
              v-for="item in group.items"
              :key="`${person.id}-${item.permission}`"
              class="perm-item"
              :class="{ locked: person.isArcDirector }"
            >
              <input
                v-model="drafts[person.id]"
                type="checkbox"
                :value="item.permission"
                :disabled="person.isArcDirector"
              />
              <span class="perm-label">{{ item.label }}</span>
              <small class="perm-hint">{{ item.plain }}</small>
              <small v-if="item.caution" class="perm-hint-warn">
                주의 · {{ item.caution }}
              </small>
            </label>
          </div>
        </div>
      </section>

      <p class="helper-text footer-note">{{ note }}</p>
    </template>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";

import { fetchArcPermissions, saveArcEmployeePermissions } from "@/lib/arc";

const employees = ref([]);
const catalog = ref([]);
const groups = ref([]);
const totals = ref({});
const note = ref("");
const drafts = reactive({});

const isLoading = ref(false);
const isSaving = ref("");
const errorMessage = ref("");
const savedMessage = ref("");

function applyBoard(data) {
  employees.value = Array.isArray(data?.employees) ? data.employees : [];
  catalog.value = Array.isArray(data?.catalog) ? data.catalog : [];
  groups.value = Array.isArray(data?.groups) ? data.groups : [];
  totals.value = data?.totals ?? {};
  note.value = data?.note ?? "";

  for (const person of employees.value) {
    drafts[person.id] = Array.isArray(person.permissions)
      ? [...person.permissions]
      : [];
  }
}

function stateLabel(person) {
  const count = Array.isArray(person.permissionOverrides)
    ? person.permissionOverrides.length
    : null;

  if (count === null) {
    return "역할 기본값 사용 중";
  }

  return count === 0 ? "응급안전 접근 없음" : `직접 설정 ${count}종`;
}

function groupSelected(person, group) {
  const current = drafts[person.id] || [];

  return group.items.filter((item) => current.includes(item.permission)).length;
}

function setGroup(person, group, enabled) {
  const current = new Set(drafts[person.id] || []);

  for (const item of group.items) {
    if (enabled) {
      current.add(item.permission);
    } else {
      current.delete(item.permission);
    }
  }

  // 메뉴를 하나라도 켜면 센터 입장 권한은 함께 켜 둡니다(서버도 같은 규칙).
  if (enabled) current.add("arc.view");

  drafts[person.id] = [...current];
}

function selectAll(person) {
  drafts[person.id] = catalog.value.map((item) => item.permission);
}

function clearAll(person) {
  drafts[person.id] = [];
}

async function loadBoard() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    applyBoard(await fetchArcPermissions());
  } catch (error) {
    errorMessage.value = error?.message || "권한 정보를 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function save(person) {
  if (isSaving.value) return;

  isSaving.value = person.id;
  errorMessage.value = "";
  savedMessage.value = "";

  try {
    await saveArcEmployeePermissions(person.id, drafts[person.id] ?? []);
    savedMessage.value = `${
      person.name || person.loginId
    } 님의 응급안전 권한을 저장했어요. 새 권한이 바로 적용됩니다.`;
    await loadBoard();
  } catch (error) {
    errorMessage.value = error?.message || "권한을 저장하지 못했어요.";
  } finally {
    isSaving.value = "";
  }
}

async function resetToDefault(person) {
  if (isSaving.value) return;

  isSaving.value = person.id;
  errorMessage.value = "";
  savedMessage.value = "";

  try {
    await saveArcEmployeePermissions(person.id, null);
    savedMessage.value = `${
      person.name || person.loginId
    } 님을 역할 기본값으로 되돌렸어요.`;
    await loadBoard();
  } catch (error) {
    errorMessage.value = error?.message || "기본값으로 되돌리지 못했어요.";
  } finally {
    isSaving.value = "";
  }
}

onMounted(loadBoard);
</script>

<style scoped lang="scss">
.admin-arc-permissions-view {
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
  max-width: 760px;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
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

.helper-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.66);
}

.guide-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.guide-group-title {
  margin: 6px 0 0;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 14px;
  font-weight: 800;
  color: #e2e8f0;

  span {
    margin-left: 8px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
  }
}

.perm-guide {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.perm-guide-item {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.45);
}

.perm-guide-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;

  strong {
    font-size: 14px;
  }
}

.perm-count {
  font-size: 12px;
  font-weight: 700;
  color: #a5b4fc;
}

.perm-plain {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.78);
}

.perm-caution {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #fcd34d;
}

.person-panel {
  gap: 12px;
}

.person-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.person-title {
  margin-left: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.18);
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 700;
}

.person-meta {
  margin: 6px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.person-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.primary-button,
.ghost-button {
  padding: 9px 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.primary-button {
  border: 1px solid rgba(52, 211, 153, 0.45);
  background: rgba(16, 185, 129, 0.22);
  color: #a7f3d0;
}

.ghost-button {
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.lock-note {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(251, 191, 36, 0.14);
  color: #fde68a;
  font-size: 13px;
  line-height: 1.6;
}

.group-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.3);
}

.group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.group-name {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #e2e8f0;
}

.group-count {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #a5b4fc;
}

.group-actions {
  display: flex;
  gap: 6px;
}

.group-button {
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.perm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.perm-item {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    "box label"
    ". hint"
    ". warn";
  gap: 2px 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.45);
  cursor: pointer;

  input {
    grid-area: box;
    align-self: center;
    width: 18px;
    height: 18px;
    accent-color: #34d399;
  }

  &.locked {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.perm-label {
  grid-area: label;
  font-size: 14px;
  font-weight: 700;
}

.perm-hint {
  grid-area: hint;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.6);
}

.perm-hint-warn {
  grid-area: warn;
  font-size: 11.5px;
  line-height: 1.5;
  color: #fcd34d;
}

.footer-note {
  padding-bottom: 12px;
}

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(248, 113, 113, 0.16);
  color: #fecaca;
  font-size: 13px;
  font-weight: 700;
}

.ok-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(52, 211, 153, 0.16);
  color: #a7f3d0;
  font-size: 13px;
  font-weight: 700;
}

.empty-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}
</style>
