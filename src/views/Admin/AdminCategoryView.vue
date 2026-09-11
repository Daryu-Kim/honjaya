<template>
  <div class="admin-category-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN CATEGORY PANEL</p>
        <h1>카테고리 관리</h1>
        <p class="description">
          상품에서 사용할 카테고리를 등록하고 정렬 및 사용 여부를 관리할 수
          있어요.
        </p>
      </div>
    </header>

    <section class="form-section">
      <div class="form-card">
        <div class="form-header">
          <h2>{{ editingCategoryId ? "카테고리 수정" : "카테고리 등록" }}</h2>
        </div>

        <form class="category-form" @submit.prevent="handleSubmit">
          <div class="form-grid">
            <div class="form-group">
              <label for="categoryName">카테고리명</label>
              <input
                id="categoryName"
                v-model.trim="form.name"
                type="text"
                placeholder="예: 칵테일"
              />
            </div>

            <div class="form-group">
              <label for="categoryCode">카테고리 코드</label>
              <input
                id="categoryCode"
                v-model.trim="form.code"
                type="text"
                placeholder="예: cocktail"
              />
            </div>

            <div class="form-group">
              <label for="sortOrder">정렬 순서</label>
              <input
                id="sortOrder"
                v-model.number="form.sortOrder"
                type="number"
                min="0"
                placeholder="0"
              />
            </div>

            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input v-model="form.isActive" type="checkbox" />
                <span>사용 상태</span>
              </label>
            </div>
          </div>

          <div class="form-actions">
            <button
              v-if="editingCategoryId"
              type="button"
              class="secondary-button"
              @click="resetForm"
            >
              취소
            </button>

            <button
              type="submit"
              class="primary-button"
              :disabled="isSubmitting"
            >
              {{
                isSubmitting
                  ? editingCategoryId
                    ? "수정 중..."
                    : "등록 중..."
                  : editingCategoryId
                  ? "카테고리 수정"
                  : "카테고리 등록"
              }}
            </button>
          </div>
        </form>
      </div>
    </section>

    <section class="list-section">
      <div v-if="isLoadingCategories" class="empty-box">
        <h2>카테고리를 불러오는 중이에요</h2>
        <p>잠시만 기다려주세요.</p>
      </div>

      <div v-else-if="categoryList.length === 0" class="empty-box">
        <h2>등록된 카테고리가 없어요</h2>
        <p>위 폼에서 첫 카테고리를 등록해보세요.</p>
      </div>

      <div v-else class="table-wrap">
        <table class="category-table">
          <thead>
            <tr>
              <th>카테고리명</th>
              <th>코드</th>
              <th>정렬순서</th>
              <th>상태</th>
              <th>수정</th>
              <th>사용토글</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="item in sortedCategoryList" :key="item.id">
              <td>
                <strong>{{ item.name }}</strong>
              </td>
              <td>{{ item.code }}</td>
              <td>{{ item.sortOrder ?? 0 }}</td>
              <td>
                <span
                  class="status-chip"
                  :class="item.isActive ? 'active' : 'inactive'"
                >
                  {{ item.isActive ? "사용중" : "비활성" }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="edit-button"
                  @click="startEdit(item)"
                >
                  수정
                </button>
              </td>
              <td>
                <button
                  type="button"
                  class="toggle-button"
                  :class="item.isActive ? 'deactivate' : 'activate'"
                  :disabled="isToggleMap[item.id]"
                  @click="toggleCategoryActive(item)"
                >
                  {{ item.isActive ? "비활성화" : "활성화" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  fetchList,
  insertRow,
  newId,
  nowIso,
  subscribeTable,
  updateRow,
} from "@/lib/supabase";
import { runGlobalBusy } from "@/lib/globalBusy";

const isLoadingCategories = ref(true);
const isSubmitting = ref(false);
const isToggleMap = ref({});
const categoryList = ref([]);
const editingCategoryId = ref("");

const form = ref({
  name: "",
  code: "",
  sortOrder: 0,
  isActive: true,
});

let unsubscribeCategories = null;

const sortedCategoryList = computed(() => {
  return [...categoryList.value].sort((a, b) => {
    const aOrder = Number(a.sortOrder ?? 0);
    const bOrder = Number(b.sortOrder ?? 0);
    return aOrder - bOrder;
  });
});

async function loadCategories() {
  try {
    categoryList.value = await fetchList("categories", {
      order: ["createdAt", "desc"],
    });
  } catch (error) {
    console.error("카테고리 조회 실패:", error);
  } finally {
    isLoadingCategories.value = false;
  }
}

function subscribeCategories() {
  unsubscribeCategories = subscribeTable("categories", loadCategories);
}

function resetForm() {
  editingCategoryId.value = "";
  form.value = {
    name: "",
    code: "",
    sortOrder: 0,
    isActive: true,
  };
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function validateForm() {
  if (!form.value.name) {
    alert("카테고리명을 입력해주세요.");
    return false;
  }

  const normalizedCode = normalizeCode(form.value.code);

  if (!normalizedCode) {
    alert("카테고리 코드를 입력해주세요.");
    return false;
  }

  form.value.code = normalizedCode;

  if (
    form.value.sortOrder === null ||
    form.value.sortOrder === "" ||
    form.value.sortOrder < 0
  ) {
    alert("정렬 순서를 올바르게 입력해주세요.");
    return false;
  }

  return true;
}

async function handleSubmit() {
  if (!validateForm() || isSubmitting.value) return;

  await runGlobalBusy(async () => {
    isSubmitting.value = true;

    try {
      const payload = {
        name: form.value.name,
        code: form.value.code,
        sortOrder: Number(form.value.sortOrder || 0),
        isActive: form.value.isActive,
        updatedAt: nowIso(),
      };

      if (editingCategoryId.value) {
        await updateRow("categories", editingCategoryId.value, payload);
        alert("카테고리가 수정되었어요.");
      } else {
        await insertRow("categories", {
          id: newId(),
          ...payload,
          createdAt: nowIso(),
        });
        alert("카테고리가 등록되었어요.");
      }

      resetForm();
      await loadCategories();
    } catch (error) {
      console.error("카테고리 저장 실패:", error);
      alert("카테고리 저장 중 문제가 발생했어요.");
    } finally {
      isSubmitting.value = false;
    }
  }, "카테고리를 저장하는 중이에요.");
}

function startEdit(item) {
  editingCategoryId.value = item.id;
  form.value = {
    name: item.name || "",
    code: item.code || "",
    sortOrder: item.sortOrder ?? 0,
    isActive: item.isActive !== false,
  };
}

async function toggleCategoryActive(item) {
  await runGlobalBusy(async () => {
    isToggleMap.value = {
      ...isToggleMap.value,
      [item.id]: true,
    };

    try {
      await updateRow("categories", item.id, {
        isActive: !item.isActive,
        updatedAt: nowIso(),
      });
      await loadCategories();
    } catch (error) {
      console.error("카테고리 상태 변경 실패:", error);
      alert("카테고리 상태 변경 중 문제가 발생했어요.");
    } finally {
      isToggleMap.value = {
        ...isToggleMap.value,
        [item.id]: false,
      };
    }
  }, "카테고리 상태를 변경하는 중이에요.");
}

onMounted(() => {
  subscribeCategories();
});

onUnmounted(() => {
  if (unsubscribeCategories) {
    unsubscribeCategories();
    unsubscribeCategories = null;
  }
});
</script>

<style scoped lang="scss">
.admin-category-view {
  min-height: 100%;
  padding: 24px;
  color: #fff;
}

.page-header {
  margin-bottom: 20px;

  .eyebrow {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.55);
  }

  h1 {
    margin: 0 0 8px;
    font-size: 32px;
    font-weight: 800;
  }

  .description {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.form-section,
.list-section {
  margin-bottom: 20px;
}

.form-card,
.empty-box,
.table-wrap {
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
}

.form-card {
  padding: 20px;
}

.form-header {
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
  }
}

.category-form {
  .form-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
}

.form-group {
  label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.72);
  }

  input {
    width: 100%;
    height: 46px;
    padding: 0 14px;
    border: none;
    outline: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;
  }
}

.checkbox-group {
  display: flex;
  align-items: end;
}

.checkbox-label {
  display: inline-flex !important;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px !important;
  cursor: pointer;

  input {
    width: 18px;
    height: 18px;
    margin: 0;
  }

  span {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.primary-button,
.secondary-button {
  height: 46px;
  padding: 0 18px;
  border: none;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.primary-button {
  background: #fff;
  color: #111827;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.secondary-button {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.empty-box {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px;

  h2 {
    margin: 0 0 10px;
    font-size: 24px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.table-wrap {
  overflow: hidden;
}

.category-table {
  width: 100%;
  border-collapse: collapse;

  thead th {
    padding: 16px;
    text-align: left;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.62);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  tbody td {
    padding: 16px;
    vertical-align: middle;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 14px;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;

  &.active {
    background: rgba(52, 211, 153, 0.18);
    color: #a7f3d0;
  }

  &.inactive {
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.88);
  }
}

.edit-button,
.toggle-button {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.edit-button {
  background: #ffffff;
  color: #111827;
}

.toggle-button {
  &.activate {
    background: rgba(52, 211, 153, 0.18);
    color: #a7f3d0;
  }

  &.deactivate {
    background: rgba(252, 165, 165, 0.14);
    color: #fecaca;
  }
}

@media (max-width: 1200px) {
  .category-form .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .table-wrap {
    overflow-x: auto;
  }

  .category-table {
    min-width: 760px;
  }
}

@media (max-width: 768px) {
  .category-form .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
