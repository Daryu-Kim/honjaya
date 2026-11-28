<template>
  <div class="admin-arc-permissions-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY · 권한 관리</p>
        <h1>응급안전 권한 관리</h1>
        <p class="description">
          응급안전관리센터 9종 권한은 오직 ARC 대표(RN)만 부여·회수할 수 있어요.
          일반 직원 관리 화면에서는 응급안전 권한이 잠겨 있고, 이 화면에서만
          바꿀 수 있습니다. 저장하면 그 직원의 로그인 세션이 즉시 끊겨 새 권한이
          바로 적용돼요.
        </p>
      </div>
      <router-link to="/admin/arc" class="link-button">응급안전 홈</router-link>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="savedMessage" class="ok-box">{{ savedMessage }}</p>
    <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>

    <template v-else>
      <section class="panel guide-panel">
        <h2>권한 9종이 뜻하는 것</h2>
        <p class="helper-text">
          체크 한 칸이 실제로 어떤 일을 할 수 있게 하는지 먼저 읽어 보고 정해
          주세요. 되돌리려면 '기본값으로' 를 누르면 됩니다.
        </p>

        <ul class="perm-guide">
          <li
            v-for="item in catalog"
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
            </p>
          </div>

          <div class="person-actions">
            <button
              v-if="!person.isArcDirector"
              type="button"
              class="ghost-button"
              :disabled="isSaving === person.id"
              @click="resetToDefault(person)"
            >
              기본값으로
            </button>
            <button
              v-if="!person.isArcDirector"
              type="button"
              class="primary-button"
              :disabled="isSaving === person.id"
              @click="save(person)"
            >
              {{ isSaving === person.id ? "저장 중…" : "권한 저장" }}
            </button>
          </div>
        </header>

        <p v-if="person.isArcDirector" class="lock-note">
          ARC 대표(RN) 본인 권한은 잠금 사고를 막기 위해 항상 9종 전부로
          고정돼요. 다른 사람의 권한만 바꿀 수 있습니다.
        </p>

        <div class="perm-grid">
          <label
            v-for="item in catalog"
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
          </label>
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
  max-width: 720px;
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
    ". hint";
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
