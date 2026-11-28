<template>
  <div class="admin-employee-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN EMPLOYEES</p>
        <h1>직원 관리</h1>
        <p class="description">
          직원 계정을 만들고 역할과 세부 권한을 직접 설정할 수 있어요. 권한을
          바꾸면 해당 직원은 모든 기기에서 다시 로그인해야 합니다.
        </p>
      </div>
    </header>

    <section v-if="!canManage" class="empty-box">
      사장만 들어갈 수 있는 화면이에요.
    </section>

    <template v-else>
      <section v-if="errorMessage" class="notice error">
        {{ errorMessage }}
      </section>
      <section v-if="noticeMessage" class="notice success">
        {{ noticeMessage }}
      </section>

      <section class="card">
        <div class="card-head">
          <h2>직원 추가</h2>
          <p class="hint">
            아이디는 영문 소문자·숫자·.<code>_</code>- 조합 3~30자입니다.
          </p>
        </div>

        <form class="employee-form" @submit.prevent="submitCreate">
          <div class="form-grid">
            <div class="form-group">
              <label for="newLoginId">아이디</label>
              <input
                id="newLoginId"
                v-model="createForm.loginId"
                type="text"
                maxlength="30"
                autocomplete="off"
                placeholder="예: bar2"
              />
            </div>

            <div class="form-group">
              <label for="newName">이름</label>
              <input
                id="newName"
                v-model="createForm.name"
                type="text"
                maxlength="30"
                autocomplete="off"
                placeholder="예: 김혼자"
              />
            </div>

            <div class="form-group">
              <label for="newTitle">직위(선택)</label>
              <input
                id="newTitle"
                v-model="createForm.title"
                type="text"
                maxlength="40"
                autocomplete="off"
                placeholder="예: 바 매니저 · ARC 대표(RN)"
              />
              <small class="hint">
                직위는 화면에 표시되는 이름표예요. 응급안전 권한과는
                관계없습니다.
              </small>
            </div>

            <div class="form-group">
              <label for="newPassword">비밀번호</label>
              <input
                id="newPassword"
                v-model="createForm.password"
                type="password"
                maxlength="72"
                autocomplete="new-password"
                placeholder="영문+숫자 8자 이상"
              />
            </div>

            <div class="form-group">
              <label for="newRole">역할</label>
              <select id="newRole" v-model="createForm.role">
                <option
                  v-for="option in roleOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }} · {{ option.description }}
                </option>
              </select>
            </div>
          </div>

          <div class="permission-block">
            <label class="toggle-row">
              <input v-model="createForm.useCustom" type="checkbox" />
              <span>역할 기본 권한 대신 직접 설정</span>
            </label>

            <p v-if="!createForm.useCustom" class="hint">
              {{ roleLabel(createForm.role) }} 기본 권한
              {{ defaultCount(createForm.role) }}개를 그대로 사용합니다.
            </p>

            <div v-else class="permission-groups">
              <div
                v-for="group in editableGroups"
                :key="group.key"
                class="permission-group"
              >
                <h3>{{ group.label }}</h3>
                <label
                  v-for="item in group.permissions"
                  :key="item.permission"
                  class="check-item"
                >
                  <input
                    v-model="createForm.permissions"
                    type="checkbox"
                    :value="item.permission"
                  />
                  <span>{{ item.label }}</span>
                </label>
              </div>
            </div>

            <div class="permission-group arc-locked">
              <h3>응급안전 (ARC 대표(RN) 전용)</h3>
              <p class="hint">
                응급안전관리센터 9종 권한은 사장도 줄 수 없어요. ARC 대표(RN)가
                <router-link to="/admin/arc/permissions">
                  응급안전 권한 관리
                </router-link>
                화면에서 부여합니다.
              </p>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="primary-button" :disabled="isCreating">
              {{ isCreating ? "추가 중…" : "직원 추가" }}
            </button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>직원 목록</h2>
          <button
            type="button"
            class="ghost-button"
            :disabled="isLoading"
            @click="loadEmployees"
          >
            새로고침
          </button>
        </div>

        <p v-if="isLoading" class="hint">불러오는 중…</p>
        <p v-else-if="employees.length === 0" class="hint">
          등록된 직원이 없어요.
        </p>

        <div v-else class="table-wrap">
          <table class="employee-table">
            <thead>
              <tr>
                <th>아이디</th>
                <th>이름</th>
                <th>역할</th>
                <th>권한</th>
                <th>상태</th>
                <th>마지막 로그인</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="employee in employees" :key="employee.id">
                <td class="mono">{{ employee.loginId }}</td>
                <td>
                  {{ employee.name || "-" }}
                  <span v-if="employee.title" class="title-chip">
                    {{ employee.titleLabel || employee.title }}
                  </span>
                </td>
                <td>{{ roleLabel(employee.role) }}</td>
                <td class="permission-cell">
                  {{ permissionSummary(employee) }}
                </td>
                <td>
                  <span
                    class="status-chip"
                    :class="employee.isActive ? 'active' : 'inactive'"
                  >
                    {{ employee.isActive ? "사용" : "중지" }}
                  </span>
                </td>
                <td class="mono">
                  {{ formatEmployeeDate(employee.lastLoginAt) }}
                </td>
                <td class="action-cell">
                  <button
                    type="button"
                    class="ghost-button"
                    @click="startEdit(employee)"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    class="ghost-button"
                    @click="startPasswordReset(employee)"
                  >
                    비밀번호
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="editTarget" class="card">
        <div class="card-head">
          <h2>{{ editTarget.loginId }} 수정</h2>
          <button type="button" class="ghost-button" @click="cancelEdit">
            닫기
          </button>
        </div>

        <form class="employee-form" @submit.prevent="submitEdit">
          <div class="form-grid">
            <div class="form-group">
              <label for="editName">이름</label>
              <input
                id="editName"
                v-model="editForm.name"
                type="text"
                maxlength="30"
              />
            </div>

            <div class="form-group">
              <label for="editRole">역할</label>
              <select id="editRole" v-model="editForm.role">
                <option
                  v-for="option in roleOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }} · {{ option.description }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="editTitle">직위(선택)</label>
              <input
                id="editTitle"
                v-model="editForm.title"
                type="text"
                maxlength="40"
                :disabled="editTarget.isArcDirector"
              />
              <small v-if="editTarget.isArcDirector" class="hint">
                ARC 대표(RN) 직위는 응급안전 권한 관리 화면에서만 바꿀 수
                있어요.
              </small>
            </div>

            <div class="form-group">
              <label for="editActive">계정 상태</label>
              <select id="editActive" v-model="editForm.isActive">
                <option :value="true">사용</option>
                <option :value="false">사용 중지</option>
              </select>
            </div>
          </div>

          <div class="permission-block">
            <p v-if="isOwnerRole(editForm.role)" class="hint">
              사장 계정은 모든 권한을 가집니다. 세부 권한은 조정할 수 없어요.
            </p>

            <template v-else>
              <label class="toggle-row">
                <input
                  v-model="editForm.useCustom"
                  type="checkbox"
                  @change="handleEditCustomChange"
                />
                <span>역할 기본 권한 대신 직접 설정</span>
              </label>

              <p v-if="!editForm.useCustom" class="hint">
                {{ roleLabel(editForm.role) }} 기본 권한
                {{ defaultCount(editForm.role) }}개를 그대로 사용합니다.
              </p>

              <div v-else class="permission-groups">
                <div
                  v-for="group in editableGroups"
                  :key="group.key"
                  class="permission-group"
                >
                  <h3>{{ group.label }}</h3>
                  <label
                    v-for="item in group.permissions"
                    :key="item.permission"
                    class="check-item"
                  >
                    <input
                      v-model="editForm.permissions"
                      type="checkbox"
                      :value="item.permission"
                    />
                    <span>{{ item.label }}</span>
                  </label>
                </div>
              </div>

              <div class="permission-group arc-locked">
                <h3>응급안전 (ARC 대표(RN) 전용)</h3>
                <p class="hint">
                  응급안전 9종 권한은 이 화면에서 바꿀 수 없어요. ARC 대표(RN)가
                  <router-link to="/admin/arc/permissions">
                    응급안전 권한 관리
                  </router-link>
                  화면에서 부여·회수합니다.
                </p>
                <p v-if="arcPermissionText(editTarget)" class="arc-current">
                  현재 {{ arcPermissionText(editTarget) }}
                </p>
              </div>
            </template>
          </div>

          <div class="form-actions">
            <button type="submit" class="primary-button" :disabled="isSaving">
              {{ isSaving ? "저장 중…" : "저장" }}
            </button>
          </div>
        </form>
      </section>

      <section v-if="passwordTarget" class="card">
        <div class="card-head">
          <h2>{{ passwordTarget.loginId }} 비밀번호 변경</h2>
          <button type="button" class="ghost-button" @click="cancelPassword">
            닫기
          </button>
        </div>

        <form class="employee-form" @submit.prevent="submitPassword">
          <div class="form-grid">
            <div class="form-group">
              <label for="resetPassword">새 비밀번호</label>
              <input
                id="resetPassword"
                v-model="passwordForm.password"
                type="password"
                maxlength="72"
                autocomplete="new-password"
                placeholder="영문+숫자 8자 이상"
              />
            </div>
          </div>

          <p class="hint">변경하면 해당 직원은 모든 기기에서 로그아웃됩니다.</p>

          <div class="form-actions">
            <button
              type="submit"
              class="primary-button"
              :disabled="isResetting"
            >
              {{ isResetting ? "변경 중…" : "비밀번호 변경" }}
            </button>
          </div>
        </form>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  EMPLOYEE_MANAGE_PERMISSION,
  ROLE_OPTIONS,
  createEmployee,
  fetchEmployees,
  fetchPermissionCatalog,
  formatEmployeeDate,
  resetEmployeePassword,
  roleLabelOf,
  updateEmployee,
} from "@/lib/adminEmployees.js";
import { hasPermission } from "@/lib/staffAuth.js";

const roleOptions = ROLE_OPTIONS;

const canManage = computed(() => hasPermission(EMPLOYEE_MANAGE_PERMISSION));

const catalog = reactive({ roles: [], groups: [] });

// 응급안전 9종은 이 화면에서 다루지 않습니다(ARC 대표(RN) 전용 화면에서만 부여).
const editableGroups = computed(() =>
  (catalog.groups || []).filter((group) => group.key !== "arc")
);

const ARC_PERMISSION_LABELS = {
  "arc.view": "조회",
  "arc.stock": "재고·사용",
  "arc.expense": "비용·정산",
  "arc.approve": "승인",
  "arc.check": "점검·실사",
  "arc.edu": "교육",
  "arc.care": "사건·AS-CARE",
  "arc.sensitive": "민감정보",
  "arc.admin": "설정",
};

function arcPermissionText(employee) {
  const list = Array.isArray(employee?.arcPermissions)
    ? employee.arcPermissions
    : [];

  if (list.length === 0) {
    return "응급안전 접근 없음";
  }

  return list
    .map((permission) => ARC_PERMISSION_LABELS[permission] || permission)
    .join(" · ");
}
const employees = ref([]);
const isLoading = ref(false);
const isCreating = ref(false);
const isSaving = ref(false);
const isResetting = ref(false);
const errorMessage = ref("");
const noticeMessage = ref("");

const createForm = reactive({
  loginId: "",
  name: "",
  title: "",
  password: "",
  role: "STAFF",
  useCustom: false,
  permissions: [],
});

const editTarget = ref(null);
const editForm = reactive({
  name: "",
  title: "",
  role: "STAFF",
  isActive: true,
  useCustom: false,
  permissions: [],
});

const passwordTarget = ref(null);
const passwordForm = reactive({ password: "" });

function roleLabel(role) {
  return roleLabelOf(role);
}

function isOwnerRole(role) {
  return role === "OWNER";
}

function defaultPermissionsOf(role) {
  const found = catalog.roles.find((item) => item.role === role);

  return found ? found.permissions : [];
}

function defaultCount(role) {
  return defaultPermissionsOf(role).length;
}

function permissionSummary(employee) {
  if (employee.role === "OWNER") {
    return "전체";
  }

  const count = Array.isArray(employee.permissions)
    ? employee.permissions.length
    : 0;

  if (!employee.permissionOverrides) {
    return `기본 ${count}개`;
  }

  return `직접 설정 ${count}개`;
}

function clearMessages() {
  errorMessage.value = "";
  noticeMessage.value = "";
}

async function loadCatalog() {
  try {
    const data = await fetchPermissionCatalog();
    catalog.roles = data.roles;
    catalog.groups = data.groups;
  } catch (error) {
    errorMessage.value = error?.message || "권한 목록을 불러오지 못했어요.";
  }
}

async function loadEmployees() {
  if (!canManage.value) {
    return;
  }

  isLoading.value = true;

  try {
    employees.value = await fetchEmployees();
  } catch (error) {
    errorMessage.value = error?.message || "직원 목록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

function resetCreateForm() {
  createForm.loginId = "";
  createForm.name = "";
  createForm.title = "";
  createForm.password = "";
  createForm.role = "STAFF";
  createForm.useCustom = false;
  createForm.permissions = [];
}

async function submitCreate() {
  clearMessages();

  const loginId = createForm.loginId.trim().toLowerCase();
  const name = createForm.name.trim();

  if (!loginId) {
    errorMessage.value = "아이디를 입력해 주세요.";
    return;
  }

  if (!name) {
    errorMessage.value = "이름을 입력해 주세요.";
    return;
  }

  if (!createForm.password) {
    errorMessage.value = "비밀번호를 입력해 주세요.";
    return;
  }

  if (createForm.useCustom && createForm.permissions.length === 0) {
    errorMessage.value = "직접 설정을 쓰려면 권한을 하나 이상 골라 주세요.";
    return;
  }

  isCreating.value = true;

  try {
    await createEmployee({
      loginId,
      name,
      title: createForm.title.trim(),
      password: createForm.password,
      role: createForm.role,
      permissions:
        createForm.useCustom && !isOwnerRole(createForm.role)
          ? [...createForm.permissions]
          : null,
    });

    noticeMessage.value = `${loginId} 계정을 만들었어요.`;
    resetCreateForm();
    await loadEmployees();
  } catch (error) {
    errorMessage.value = error?.message || "직원을 추가하지 못했어요.";
  } finally {
    isCreating.value = false;
  }
}

function startEdit(employee) {
  clearMessages();
  passwordTarget.value = null;
  editTarget.value = employee;
  editForm.name = employee.name || "";
  editForm.title = employee.title || "";
  editForm.role = employee.role;
  editForm.isActive = employee.isActive !== false;
  editForm.useCustom = Boolean(employee.permissionOverrides);

  if (editForm.useCustom) {
    editForm.permissions = [...employee.permissionOverrides];
  } else {
    editForm.permissions = [...defaultPermissionsOf(employee.role)];
  }
}

function handleEditCustomChange() {
  // 직접 설정을 켤 때는 지금 적용 중인 권한에서 시작합니다.
  if (editForm.useCustom && editForm.permissions.length === 0) {
    editForm.permissions = [...defaultPermissionsOf(editForm.role)];
  }
}

function cancelEdit() {
  editTarget.value = null;
}

async function submitEdit() {
  clearMessages();

  if (!editTarget.value) {
    return;
  }

  const name = editForm.name.trim();

  if (!name) {
    errorMessage.value = "이름을 입력해 주세요.";
    return;
  }

  if (
    editForm.useCustom &&
    !isOwnerRole(editForm.role) &&
    editForm.permissions.length === 0
  ) {
    errorMessage.value = "직접 설정을 쓰려면 권한을 하나 이상 골라 주세요.";
    return;
  }

  const payload = {
    name,
    title: editTarget.value.isArcDirector ? undefined : editForm.title.trim(),
    role: editForm.role,
    isActive: editForm.isActive,
  };

  if (isOwnerRole(editForm.role)) {
    payload.permissions = null;
  } else {
    payload.permissions = editForm.useCustom ? [...editForm.permissions] : null;
  }

  isSaving.value = true;

  try {
    await updateEmployee(editTarget.value.id, payload);
    noticeMessage.value = `${editTarget.value.loginId} 계정을 저장했어요.`;
    editTarget.value = null;
    await loadEmployees();
  } catch (error) {
    errorMessage.value = error?.message || "저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

function startPasswordReset(employee) {
  clearMessages();
  editTarget.value = null;
  passwordTarget.value = employee;
  passwordForm.password = "";
}

function cancelPassword() {
  passwordTarget.value = null;
  passwordForm.password = "";
}

async function submitPassword() {
  clearMessages();

  if (!passwordTarget.value) {
    return;
  }

  if (!passwordForm.password) {
    errorMessage.value = "새 비밀번호를 입력해 주세요.";
    return;
  }

  isResetting.value = true;

  try {
    await resetEmployeePassword(passwordTarget.value.id, passwordForm.password);
    noticeMessage.value = `${passwordTarget.value.loginId} 비밀번호를 변경했어요.`;
    cancelPassword();
  } catch (error) {
    errorMessage.value = error?.message || "비밀번호를 변경하지 못했어요.";
  } finally {
    isResetting.value = false;
  }
}

onMounted(async () => {
  if (!canManage.value) {
    return;
  }

  await loadCatalog();
  await loadEmployees();
});
</script>

<style scoped>
.admin-employee-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: #ffffff;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.55);
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 24px;
  color: #ffffff;
}

.description {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.66);
}

.notice {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
}

.notice.error {
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
}

.notice.success {
  background: rgba(52, 211, 153, 0.14);
  color: #6ee7b7;
}

.empty-box {
  padding: 28px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.66);
}

.card {
  padding: 20px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.card-head h2 {
  margin: 0;
  font-size: 17px;
  color: #ffffff;
}

.hint {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.employee-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.72);
}

.form-group input,
.form-group select {
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 14px;
}

.form-group select option {
  color: #ffffff;
  background: #111827;
}

.form-group input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.permission-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
}

.permission-groups {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.permission-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.permission-group h3 {
  margin: 0 0 2px;
  font-size: 13px;
  color: #c7d2fe;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
}

.arc-locked {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.25);

  .hint {
    margin: 0;
    color: rgba(253, 230, 138, 0.9);

    a {
      color: #fcd34d;
      font-weight: 700;
    }
  }
}

.arc-current {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: #fcd34d;
}

.title-chip {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.18);
  color: #7dd3fc;
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.primary-button {
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  background: #6366f1;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.ghost-button {
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  cursor: pointer;
}

.ghost-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.table-wrap {
  overflow-x: auto;
}

.employee-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.employee-table th,
.employee-table td {
  padding: 10px 12px;
  text-align: left;
  white-space: nowrap;
}

.employee-table th {
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.05);
  font-weight: 600;
}

.employee-table tbody tr {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.mono {
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.78);
}

.permission-cell {
  color: rgba(255, 255, 255, 0.72);
}

.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.status-chip.active {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}

.status-chip.inactive {
  background: rgba(248, 113, 113, 0.16);
  color: #fca5a5;
}

.action-cell {
  display: flex;
  gap: 8px;
}

@media (max-width: 640px) {
  .card {
    padding: 16px;
  }

  .action-cell {
    flex-direction: column;
  }
}
</style>
