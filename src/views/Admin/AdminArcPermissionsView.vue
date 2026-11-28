<template>
  <div class="admin-arc-permissions-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY · 권한 관리</p>
        <h1>응급안전 권한 관리</h1>
        <p class="description">
          응급안전관리센터 메뉴 {{ menuCount }}개와 그 안쪽 동작 권한
          {{ actionCount }}개, 모두 {{ permissionTotal }}개의 권한을 오직 ARC
          대표(RN)만 부여·회수할 수 있어요. 메뉴를 열 수 있어도 등록·승인·정산
          같은 동작은 따로 켜야 실제로 할 수 있습니다. 저장하면 그 직원의 로그인
          세션이 즉시 끊겨 새 권한이 바로 적용돼요.
        </p>
      </div>
      <router-link to="/admin/arc" class="link-button">응급안전 홈</router-link>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="savedMessage" class="ok-box">{{ savedMessage }}</p>
    <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>

    <template v-else>
      <section class="summary-grid">
        <article class="summary-card">
          <p class="summary-label">메뉴 권한</p>
          <strong class="summary-value">{{ menuCount }}</strong>
          <p class="summary-note">메뉴를 열 수 있는 권한</p>
        </article>
        <article class="summary-card">
          <p class="summary-label">동작 권한</p>
          <strong class="summary-value">{{ actionCount }}</strong>
          <p class="summary-note">등록·승인·정산·확정</p>
        </article>
        <article class="summary-card">
          <p class="summary-label">전체 권한</p>
          <strong class="summary-value">{{ permissionTotal }}</strong>
          <p class="summary-note">한 사람에게 줄 수 있는 최대치</p>
        </article>
        <article class="summary-card">
          <p class="summary-label">관리 대상</p>
          <strong class="summary-value">{{ employees.length }}</strong>
          <p class="summary-note">ARC 대표 본인은 잠금</p>
        </article>
      </section>

      <section class="panel guide-panel">
        <header class="panel-head">
          <h2>권한 사전 — 이 권한이 실제로 하는 일</h2>
          <p class="helper-text">
            체크 한 칸이 무슨 일을 할 수 있게 하는지 먼저 읽어 보고 정해 주세요.
            메뉴를 하나라도 켜면 ‘센터 입장(arc.view)’은 자동으로 함께 켜집니다.
            동작 권한을 켜면 그 동작이 속한 메뉴도 자동으로 함께 켜집니다.
          </p>
        </header>

        <div
          v-for="group in groups"
          :key="`guide-${group.name}`"
          class="perm-group"
        >
          <h3 class="perm-group-title">
            {{ group.name }}
            <span class="perm-count">{{ group.items.length }}개 메뉴</span>
          </h3>

          <div class="perm-menu-grid">
            <article
              v-for="item in group.items"
              :key="`guide-${item.permission}`"
              class="perm-menu-card"
            >
              <header class="perm-menu-head">
                <strong>{{ item.label }}</strong>
                <span class="perm-count">
                  현재 {{ totals[item.permission] || 0 }}명 보유
                </span>
              </header>
              <p class="perm-plain">{{ item.plain }}</p>
              <p v-if="item.caution" class="perm-caution">
                주의 · {{ item.caution }}
              </p>

              <ul v-if="item.actions.length" class="perm-action-list">
                <li
                  v-for="action in item.actions"
                  :key="`guide-${action.permission}`"
                >
                  <div class="perm-action-head">
                    <strong>{{ action.label }}</strong>
                    <span class="perm-count">
                      {{ totals[action.permission] || 0 }}명
                    </span>
                    <span v-if="action.directorOnly" class="director-chip">
                      총괄 전용
                    </span>
                  </div>
                  <p class="perm-action-plain">{{ action.plain }}</p>
                </li>
              </ul>
              <p v-else class="helper-text">
                이 메뉴는 보기와 등록이 나뉘어 있지 않아요.
              </p>
            </article>
          </div>
        </div>

        <ul class="perm-locked-list">
          <li v-for="item in lockedMenus" :key="`guide-${item.key}`">
            <strong>{{ item.label }}</strong>
            <span class="perm-plain">{{ item.plain }}</span>
          </li>
        </ul>
      </section>

      <section
        v-for="person in employees"
        :key="person.id"
        class="panel person-panel"
      >
        <header class="person-head">
          <div class="person-id">
            <h2>
              {{ person.name || person.loginId }}
              <span class="person-title">{{ person.titleLabel }}</span>
            </h2>
            <p class="person-meta">
              아이디 {{ person.loginId }} ·
              {{
                person.isArcDirector
                  ? "ARC 대표(RN) — 권한 변경 불가"
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
          {{ permissionTotal }}종 전부로 고정돼요. 다른 사람의 권한만 바꿀 수
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
                {{ groupSelected(person, group) }}/{{ groupTotal(group) }}
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

          <div class="perm-menu-grid">
            <article
              v-for="item in group.items"
              :key="`${person.id}-${item.permission}`"
              class="perm-menu-card"
              :class="{ granted: has(item, person) }"
            >
              <label class="perm-menu-toggle">
                <input
                  v-model="drafts[person.id]"
                  type="checkbox"
                  :value="item.permission"
                  :disabled="person.isArcDirector"
                />
                <strong>{{ item.label }}</strong>
                <span v-if="item.actions.length" class="group-count">
                  동작 {{ actionSelectedCount(person, item) }}/{{
                    item.actions.length
                  }}
                </span>
              </label>

              <p class="perm-plain">{{ item.plain }}</p>

              <div v-if="item.actions.length" class="perm-action-chips">
                <label
                  v-for="action in item.actions"
                  :key="`${person.id}-${action.permission}`"
                  class="perm-action-chip"
                  :class="{
                    on: isPicked(person, action.permission),
                    locked: action.directorOnly,
                  }"
                  :title="action.plain"
                >
                  <input
                    v-model="drafts[person.id]"
                    type="checkbox"
                    :value="action.permission"
                    :disabled="person.isArcDirector || action.directorOnly"
                  />
                  <span>{{ action.label }}</span>
                </label>
              </div>
              <p v-else class="helper-text">보기·등록이 나뉘어 있지 않아요.</p>

              <button
                v-if="!person.isArcDirector && item.actions.length"
                type="button"
                class="mini-button"
                @click="toggleMenuActions(person, item)"
              >
                {{
                  actionSelectedCount(person, item)
                    ? "동작 전체 끄기"
                    : "동작 전체 켜기"
                }}
              </button>
            </article>
          </div>
        </div>
      </section>

      <p class="helper-text footer-note">{{ note }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import { fetchArcPermissions, saveArcEmployeePermissions } from "@/lib/arc";

const employees = ref([]);
const catalog = ref([]);
const groups = ref([]);
const totals = ref({});
const note = ref("");
const permissionTotal = ref(0);
const drafts = reactive({});

const isLoading = ref(false);
const isSaving = ref("");
const errorMessage = ref("");
const savedMessage = ref("");

const menuCatalogs = computed(() =>
  catalog.value.filter((item) => !item.locked)
);
const lockedMenus = computed(() => catalog.value.filter((item) => item.locked));
const menuCount = computed(() => menuCatalogs.value.length);
const actionCount = computed(() =>
  menuCatalogs.value.reduce((sum, item) => sum + (item.actions?.length ?? 0), 0)
);

function applyBoard(data) {
  employees.value = Array.isArray(data?.employees) ? data.employees : [];
  catalog.value = Array.isArray(data?.catalog) ? data.catalog : [];
  groups.value = Array.isArray(data?.groups) ? data.groups : [];
  totals.value = data?.totals ?? {};
  note.value = data?.note ?? "";
  permissionTotal.value = Number(data?.permissionTotal ?? 0);

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

function isPicked(person, permission) {
  return (drafts[person.id] || []).includes(permission);
}

function has(item, person) {
  return (
    isPicked(person, item.permission) ||
    item.actions.some((action) => isPicked(person, action.permission))
  );
}

function actionSelectedCount(person, item) {
  return item.actions.filter((action) => isPicked(person, action.permission))
    .length;
}

function groupTotal(group) {
  return group.items.reduce(
    (sum, item) => sum + 1 + (item.actions?.length ?? 0),
    0
  );
}

function groupSelected(person, group) {
  return group.items.reduce(
    (sum, item) =>
      sum +
      (isPicked(person, item.permission) ? 1 : 0) +
      item.actions.filter((action) => isPicked(person, action.permission))
        .length,
    0
  );
}

function setGroup(person, group, enabled) {
  const current = new Set(drafts[person.id] || []);

  for (const item of group.items) {
    const keys = [
      item.permission,
      ...item.actions
        .filter((action) => !action.directorOnly)
        .map((action) => action.permission),
    ];

    for (const key of keys) {
      if (enabled) {
        current.add(key);
      } else {
        current.delete(key);
      }
    }
  }

  if (enabled) current.add("arc.view");

  drafts[person.id] = [...current];
}

function toggleMenuActions(person, item) {
  const current = new Set(drafts[person.id] || []);
  const keys = item.actions
    .filter((action) => !action.directorOnly)
    .map((action) => action.permission);
  const allOn = keys.every((key) => current.has(key));

  for (const key of keys) {
    if (allOn) {
      current.delete(key);
    } else {
      current.add(key);
    }
  }

  // 동작을 하나라도 켜면 그 메뉴와 센터 입장은 함께 켜 둡니다(서버도 같은 규칙).
  if (keys.some((key) => current.has(key))) {
    current.add(item.permission);
    current.add("arc.view");
  }

  drafts[person.id] = [...current];
}

function selectAll(person) {
  drafts[person.id] = catalog.value
    .filter((item) => !item.locked)
    .flatMap((item) => [
      item.permission,
      ...item.actions
        .filter((action) => !action.directorOnly)
        .map((action) => action.permission),
    ]);
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
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
}

.description {
  margin: 0;
  max-width: 780px;
  font-size: 14px;
  line-height: 1.65;
}

.link-button {
  flex-shrink: 0;
  padding: 10px 16px;
  border-radius: 12px;
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
}

.panel-head {
  display: flex;
  flex-direction: column;
  gap: 6px;

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }
}

.person-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.person-id h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 800;
}

.person-meta {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
}

.person-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.group-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--arc-line, #e2e8f0);
}

.group-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 800;
}

.group-actions {
  display: flex;
  gap: 8px;
}

.perm-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.perm-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--arc-line, #e2e8f0);
  font-size: 14px;
  font-weight: 800;
}

.perm-menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.perm-menu-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--arc-line, #e2e8f0);
  border-radius: var(--arc-radius, 14px);
  background: var(--arc-surface, #fff);

  &.granted {
    border-color: var(--arc-brand-line, #fed7aa);
    background: var(--arc-brand-soft, #fff7ed);
  }
}

.perm-menu-head,
.perm-action-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13.5px;
}

.perm-menu-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;

  input {
    width: 16px;
    height: 16px;
    accent-color: var(--arc-brand, #b45309);
    cursor: pointer;
  }
}

.perm-plain {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--arc-ink-2, #41506a);
}

.perm-caution {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.55;
  color: var(--arc-warn, #b45309);
}

.perm-action-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 10px 0 0;
  border-top: 1px dashed var(--arc-line, #e2e8f0);
  list-style: none;
}

.perm-action-plain {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--arc-ink-3, #5a6780);
}

.perm-action-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.perm-action-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid var(--arc-line, #e2e8f0);
  border-radius: 999px;
  background: var(--arc-surface-2, #f8fafc);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--arc-ink-3, #5a6780);
  cursor: pointer;

  input {
    width: 13px;
    height: 13px;
    accent-color: var(--arc-brand, #b45309);
    cursor: pointer;
  }

  &.on {
    border-color: var(--arc-brand-line, #fed7aa);
    background: var(--arc-brand-soft, #fff7ed);
    color: #7c2d12;
  }

  &.locked {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.perm-locked-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 10px 0 0;
  border-top: 1px dashed var(--arc-line, #e2e8f0);
  list-style: none;
  font-size: 12.5px;
  line-height: 1.6;

  strong {
    margin-right: 6px;
  }
}

.lock-note {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--arc-ink-2, #41506a);
}

.footer-note {
  padding: 0 4px;
}
</style>
