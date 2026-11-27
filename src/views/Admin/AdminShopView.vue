<template>
  <div class="admin-shop-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN SHOP</p>
        <h1>전자담배 상품 관리</h1>
        <p class="description">
          예약(픽업) 판매용 전자담배 상품과 카테고리를 관리해요. 매장
          메뉴(주류·안주) 상품과는 완전히 분리되어 있어요.
        </p>
      </div>
      <router-link to="/admin/shop/reservations" class="link-button">
        예약 관리 바로가기
      </router-link>
    </header>

    <section class="tab-row">
      <button
        type="button"
        class="tab-button"
        :class="{ active: activeTab === 'products' }"
        @click="activeTab = 'products'"
      >
        상품 ({{ products.length }})
      </button>
      <button
        type="button"
        class="tab-button"
        :class="{ active: activeTab === 'categories' }"
        @click="activeTab = 'categories'"
      >
        카테고리 ({{ categories.length }})
      </button>
    </section>

    <p v-if="!canManage" class="notice-text">
      상품·카테고리 수정은 사장 권한에서만 가능해요. 조회만 할 수 있어요.
    </p>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>

    <!-- 상품 탭 -->
    <section v-if="activeTab === 'products'" class="panel">
      <div class="panel-head">
        <h2>상품 목록</h2>
        <div class="panel-actions">
          <button
            type="button"
            class="preset-button"
            :disabled="!canManage"
            @click="startCreateProduct"
          >
            새 상품 만들기
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadAll"
          >
            새로고침
          </button>
        </div>
      </div>

      <div class="filter-row">
        <select v-model="productFilterCategoryId" class="filter-input">
          <option value="">전체 카테고리</option>
          <option
            v-for="category in categories"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
        <input
          v-model="productFilterKeyword"
          type="search"
          class="filter-input"
          placeholder="상품명·브랜드 검색"
        />
        <label class="filter-check">
          <input v-model="includeInactive" type="checkbox" />
          <span>판매중지 포함</span>
        </label>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>

      <p v-else-if="!filteredProducts.length" class="empty-box">
        등록된 전자담배 상품이 없어요. “새 상품 만들기”로 추가해 주세요.
      </p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>상품</th>
              <th>카테고리</th>
              <th>가격</th>
              <th>재고</th>
              <th>예약</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in filteredProducts" :key="product.id">
              <td>
                <p class="cell-strong">{{ product.name }}</p>
                <p v-if="product.brand" class="cell-sub">{{ product.brand }}</p>
              </td>
              <td>{{ categoryName(product.categoryId) }}</td>
              <td>{{ formatShopWon(product.price) }}</td>
              <td>{{ product.stock }}개</td>
              <td>
                <span class="cell-sub">
                  {{ product.reservedQuantity }}건 / 가능
                  {{ product.availableStock }}개
                </span>
              </td>
              <td>
                <span class="status-chip" :class="statusClass(product)">
                  {{ statusLabel(product) }}
                </span>
              </td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="small-button"
                    :disabled="!canManage"
                    @click="startEditProduct(product)"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    class="small-button"
                    :disabled="!canManage"
                    @click="toggleSoldOut(product)"
                  >
                    {{ product.isSoldOut ? "판매재개" : "품절" }}
                  </button>
                  <button
                    type="button"
                    class="small-button danger"
                    :disabled="!canManage"
                    @click="removeProduct(product)"
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 카테고리 탭 -->
    <section v-else class="panel">
      <div class="panel-head">
        <h2>카테고리</h2>
        <div class="panel-actions">
          <button
            type="button"
            class="preset-button"
            :disabled="!canManage"
            @click="startCreateCategory"
          >
            새 카테고리
          </button>
        </div>
      </div>

      <p v-if="!categories.length" class="empty-box">
        카테고리가 없어요. 액상·기기·악세서리처럼 먼저 분류를 만들어 주세요.
      </p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>상품 수</th>
              <th>정렬</th>
              <th>노출</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="category in categories" :key="category.id">
              <td>
                <p class="cell-strong">{{ category.name }}</p>
                <p v-if="category.memo" class="cell-sub">{{ category.memo }}</p>
              </td>
              <td>{{ category.productCount }}개</td>
              <td>{{ category.sortOrder }}</td>
              <td>
                <span
                  class="status-chip"
                  :class="category.isActive ? 'on' : 'off'"
                >
                  {{ category.isActive ? "노출" : "숨김" }}
                </span>
              </td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="small-button"
                    :disabled="!canManage"
                    @click="startEditCategory(category)"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    class="small-button danger"
                    :disabled="!canManage"
                    @click="removeCategory(category)"
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 상품 편집 모달 -->
    <div
      v-if="productForm.open"
      class="modal-backdrop"
      @click.self="closeProductForm"
    >
      <div class="modal">
        <div class="modal-head">
          <h3>{{ productForm.id ? "상품 수정" : "새 상품" }}</h3>
          <button type="button" class="close-button" @click="closeProductForm">
            ×
          </button>
        </div>

        <div class="modal-body">
          <label class="field">
            <span>상품 이름 *</span>
            <input v-model="productForm.name" type="text" maxlength="60" />
          </label>

          <div class="field-grid">
            <label class="field">
              <span>브랜드</span>
              <input v-model="productForm.brand" type="text" maxlength="40" />
            </label>
            <label class="field">
              <span>카테고리</span>
              <select v-model="productForm.categoryId">
                <option value="">선택 안 함</option>
                <option
                  v-for="category in categories"
                  :key="category.id"
                  :value="category.id"
                >
                  {{ category.name }}
                </option>
              </select>
            </label>
          </div>

          <div class="field-grid">
            <label class="field">
              <span>판매가(원) *</span>
              <input
                v-model.number="productForm.price"
                type="number"
                min="0"
                step="100"
              />
            </label>
            <label class="field">
              <span>재고 수량</span>
              <input
                v-model.number="productForm.stock"
                type="number"
                min="0"
                step="1"
              />
            </label>
          </div>

          <div class="field-grid">
            <label class="field">
              <span>맛 프로필</span>
              <input
                v-model="productForm.flavorProfile"
                type="text"
                maxlength="100"
                placeholder="예: 청포도·아이스"
              />
            </label>
            <label class="field">
              <span>니코틴 타입</span>
              <input
                v-model="productForm.nicotineType"
                type="text"
                maxlength="40"
                placeholder="예: 0.98% / 무니코틴"
              />
            </label>
          </div>

          <label class="field">
            <span>이미지 URL</span>
            <input v-model="productForm.imageUrl" type="text" maxlength="500" />
          </label>

          <label class="field">
            <span>설명</span>
            <textarea
              v-model="productForm.description"
              rows="3"
              maxlength="1000"
            />
          </label>

          <div class="check-grid">
            <label class="check-item">
              <input v-model="productForm.isActive" type="checkbox" />
              <span>판매중</span>
            </label>
            <label class="check-item">
              <input v-model="productForm.isSoldOut" type="checkbox" />
              <span>품절</span>
            </label>
            <label class="check-item">
              <input v-model="productForm.isNicotineFree" type="checkbox" />
              <span>무니코틴</span>
            </label>
            <label class="check-item">
              <input v-model="productForm.isAdultOnly" type="checkbox" />
              <span>19세 이상 전용</span>
            </label>
            <label class="check-item">
              <span>정렬</span>
              <input
                v-model.number="productForm.sortOrder"
                type="number"
                step="1"
              />
            </label>
          </div>

          <div class="option-section">
            <div class="option-head">
              <p class="option-title">옵션 그룹</p>
              <button
                type="button"
                class="small-button"
                @click="addOptionGroup"
              >
                + 옵션 그룹
              </button>
            </div>

            <p v-if="!productForm.optionGroups.length" class="cell-sub">
              옵션이 없으면 상품만 선택하고 예약할 수 있어요.
            </p>

            <div
              v-for="(group, groupIndex) in productForm.optionGroups"
              :key="groupIndex"
              class="option-group"
            >
              <div class="option-group-head">
                <input
                  v-model="group.groupName"
                  type="text"
                  class="group-name"
                  maxlength="60"
                  placeholder="옵션 그룹 이름 (예: 니코틴 농도)"
                />
                <button
                  type="button"
                  class="small-button danger"
                  @click="removeOptionGroup(groupIndex)"
                >
                  그룹 삭제
                </button>
              </div>

              <div class="check-grid compact">
                <label class="check-item">
                  <input v-model="group.isRequired" type="checkbox" />
                  <span>필수 선택</span>
                </label>
                <label class="check-item">
                  <input v-model="group.isMultiple" type="checkbox" />
                  <span>복수 선택</span>
                </label>
                <label class="check-item">
                  <span>최대</span>
                  <input
                    v-model.number="group.maxSelectCount"
                    type="number"
                    min="0"
                    step="1"
                    :disabled="!group.isMultiple"
                  />
                </label>
              </div>

              <div class="option-list">
                <div
                  v-for="(option, optionIndex) in group.options"
                  :key="optionIndex"
                  class="option-row"
                >
                  <input
                    v-model="option.optionName"
                    type="text"
                    maxlength="60"
                    placeholder="옵션 이름"
                  />
                  <input
                    v-model.number="option.additionalPrice"
                    type="number"
                    step="100"
                    placeholder="추가금"
                  />
                  <label class="check-item">
                    <input v-model="option.isSoldOut" type="checkbox" />
                    <span>품절</span>
                  </label>
                  <button
                    type="button"
                    class="icon-button"
                    aria-label="옵션 삭제"
                    @click="removeOption(group, optionIndex)"
                  >
                    ×
                  </button>
                </div>
              </div>

              <button
                type="button"
                class="small-button"
                @click="addOption(group)"
              >
                + 옵션 추가
              </button>
            </div>
          </div>

          <p v-if="formError" class="error-box">{{ formError }}</p>
        </div>

        <div class="modal-foot">
          <button
            type="button"
            class="secondary-button"
            @click="closeProductForm"
          >
            닫기
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="isSaving"
            @click="saveProduct"
          >
            {{ isSaving ? "저장 중…" : "저장" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 카테고리 편집 모달 -->
    <div
      v-if="categoryForm.open"
      class="modal-backdrop"
      @click.self="closeCategoryForm"
    >
      <div class="modal modal-small">
        <div class="modal-head">
          <h3>{{ categoryForm.id ? "카테고리 수정" : "새 카테고리" }}</h3>
          <button type="button" class="close-button" @click="closeCategoryForm">
            ×
          </button>
        </div>

        <div class="modal-body">
          <label class="field">
            <span>이름 *</span>
            <input v-model="categoryForm.name" type="text" maxlength="40" />
          </label>
          <label class="field">
            <span>메모</span>
            <input v-model="categoryForm.memo" type="text" maxlength="200" />
          </label>
          <div class="field-grid">
            <label class="field">
              <span>정렬</span>
              <input
                v-model.number="categoryForm.sortOrder"
                type="number"
                step="1"
              />
            </label>
            <label class="check-item">
              <input v-model="categoryForm.isActive" type="checkbox" />
              <span>손님 화면에 노출</span>
            </label>
          </div>

          <p v-if="formError" class="error-box">{{ formError }}</p>
        </div>

        <div class="modal-foot">
          <button
            type="button"
            class="secondary-button"
            @click="closeCategoryForm"
          >
            닫기
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="isSaving"
            @click="saveCategory"
          >
            {{ isSaving ? "저장 중…" : "저장" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import { hasPermission } from "@/lib/staffAuth";
import {
  deleteShopCategory,
  deleteShopProduct,
  fetchShopCategories,
  fetchShopProducts,
  formatShopWon,
  saveShopCategory,
  saveShopProduct,
} from "@/lib/shop";

const activeTab = ref("products");
const categories = ref([]);
const products = ref([]);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const formError = ref("");

const includeInactive = ref(true);
const productFilterCategoryId = ref("");
const productFilterKeyword = ref("");

const canManage = computed(() => hasPermission("shop.manage"));

function emptyProductForm() {
  return {
    open: false,
    id: "",
    name: "",
    brand: "",
    categoryId: "",
    price: 0,
    stock: 0,
    imageUrl: "",
    description: "",
    flavorProfile: "",
    nicotineType: "",
    isNicotineFree: false,
    isAdultOnly: true,
    isActive: true,
    isSoldOut: false,
    sortOrder: 0,
    optionGroups: [],
  };
}

function emptyCategoryForm() {
  return {
    open: false,
    id: "",
    name: "",
    memo: "",
    sortOrder: 0,
    isActive: true,
  };
}

const productForm = reactive(emptyProductForm());
const categoryForm = reactive(emptyCategoryForm());

const filteredProducts = computed(() => {
  const keyword = productFilterKeyword.value.trim().toLowerCase();

  return products.value.filter((product) => {
    if (
      productFilterCategoryId.value &&
      product.categoryId !== productFilterCategoryId.value
    ) {
      return false;
    }

    if (!keyword) return true;

    return `${product.name} ${product.brand}`.toLowerCase().includes(keyword);
  });
});

function categoryName(categoryId) {
  return (
    categories.value.find((category) => category.id === categoryId)?.name ?? "-"
  );
}

function statusLabel(product) {
  if (!product.isActive) return "판매중지";
  if (product.isSoldOut || product.availableStock <= 0) return "품절";
  if (product.availableStock <= 3) return "재고 적음";

  return "판매중";
}

function statusClass(product) {
  const label = statusLabel(product);

  if (label === "판매중") return "on";
  if (label === "재고 적음") return "warn";

  return "off";
}

async function loadAll() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const [categoryList, productList] = await Promise.all([
      fetchShopCategories({ includeInactive: true }),
      fetchShopProducts({ includeInactive: includeInactive.value }),
    ]);

    categories.value = categoryList;
    products.value = productList;
  } catch (error) {
    errorMessage.value = error?.message || "목록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

function startCreateProduct() {
  Object.assign(productForm, emptyProductForm(), { open: true });
  formError.value = "";
}

function startEditProduct(product) {
  Object.assign(productForm, emptyProductForm(), {
    open: true,
    id: product.id,
    name: product.name,
    brand: product.brand ?? "",
    categoryId: product.categoryId ?? "",
    price: product.price ?? 0,
    stock: product.stock ?? 0,
    imageUrl: product.imageUrl ?? "",
    description: product.description ?? "",
    flavorProfile: product.flavorProfile ?? "",
    nicotineType: product.nicotineType ?? "",
    isNicotineFree: product.isNicotineFree === true,
    isAdultOnly: product.isAdultOnly !== false,
    isActive: product.isActive !== false,
    isSoldOut: product.isSoldOut === true,
    sortOrder: product.sortOrder ?? 0,
    optionGroups: (product.optionGroups ?? []).map((group) => ({
      ...group,
      options: (group.options ?? []).map((option) => ({ ...option })),
    })),
  });
  formError.value = "";
}

function closeProductForm() {
  Object.assign(productForm, emptyProductForm());
  formError.value = "";
}

function addOptionGroup() {
  const index = productForm.optionGroups.length;

  productForm.optionGroups.push({
    groupId: `group_${Date.now()}_${index}`,
    groupName: "",
    isRequired: true,
    isMultiple: false,
    minSelectCount: 1,
    maxSelectCount: 0,
    sortOrder: index,
    options: [],
  });
}

function removeOptionGroup(index) {
  productForm.optionGroups.splice(index, 1);
}

function addOption(group) {
  const index = group.options.length;

  group.options.push({
    optionId: `option_${Date.now()}_${index}`,
    optionName: "",
    additionalPrice: 0,
    isActive: true,
    isSoldOut: false,
    isDefault: false,
    sortOrder: index,
  });
}

function removeOption(group, index) {
  group.options.splice(index, 1);
}

function buildProductPayload() {
  return {
    name: productForm.name.trim(),
    brand: productForm.brand.trim(),
    categoryId: productForm.categoryId || "",
    price: Number(productForm.price ?? 0),
    stock: Number(productForm.stock ?? 0),
    imageUrl: productForm.imageUrl.trim(),
    description: productForm.description.trim(),
    flavorProfile: productForm.flavorProfile.trim(),
    nicotineType: productForm.nicotineType.trim(),
    isNicotineFree: productForm.isNicotineFree,
    isAdultOnly: productForm.isAdultOnly,
    isActive: productForm.isActive,
    isSoldOut: productForm.isSoldOut,
    sortOrder: Number(productForm.sortOrder ?? 0),
    optionGroups: productForm.optionGroups
      .filter((group) => group.groupName.trim())
      .map((group, groupIndex) => ({
        ...group,
        sortOrder: groupIndex,
        options: group.options
          .filter((option) => option.optionName.trim())
          .map((option, optionIndex) => ({
            ...option,
            sortOrder: optionIndex,
          })),
      })),
  };
}

async function saveProduct() {
  if (isSaving.value) return;

  if (!productForm.name.trim()) {
    formError.value = "상품 이름을 입력해 주세요.";

    return;
  }

  isSaving.value = true;
  formError.value = "";

  try {
    await saveShopProduct(productForm.id || "", buildProductPayload());
    closeProductForm();
    await loadAll();
  } catch (error) {
    formError.value = error?.message || "저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function toggleSoldOut(product) {
  try {
    await saveShopProduct(product.id, { isSoldOut: !product.isSoldOut });
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message || "상태를 바꾸지 못했어요.";
  }
}

async function removeProduct(product) {
  const confirmed = window.confirm(
    `“${product.name}” 상품을 삭제할까요?\n지난 예약 기록은 그대로 남아요.`
  );

  if (!confirmed) return;

  try {
    await deleteShopProduct(product.id);
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message || "삭제하지 못했어요.";
  }
}

function startCreateCategory() {
  Object.assign(categoryForm, emptyCategoryForm(), { open: true });
  formError.value = "";
}

function startEditCategory(category) {
  Object.assign(categoryForm, emptyCategoryForm(), {
    open: true,
    id: category.id,
    name: category.name,
    memo: category.memo ?? "",
    sortOrder: category.sortOrder ?? 0,
    isActive: category.isActive !== false,
  });
  formError.value = "";
}

function closeCategoryForm() {
  Object.assign(categoryForm, emptyCategoryForm());
  formError.value = "";
}

async function saveCategory() {
  if (isSaving.value) return;

  if (!categoryForm.name.trim()) {
    formError.value = "카테고리 이름을 입력해 주세요.";

    return;
  }

  isSaving.value = true;
  formError.value = "";

  try {
    await saveShopCategory(categoryForm.id || "", {
      name: categoryForm.name.trim(),
      memo: categoryForm.memo.trim(),
      sortOrder: Number(categoryForm.sortOrder ?? 0),
      isActive: categoryForm.isActive,
    });
    closeCategoryForm();
    await loadAll();
  } catch (error) {
    formError.value = error?.message || "저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function removeCategory(category) {
  const confirmed = window.confirm(`“${category.name}” 카테고리를 삭제할까요?`);

  if (!confirmed) return;

  try {
    await deleteShopCategory(category.id);
    await loadAll();
  } catch (error) {
    errorMessage.value = error?.message || "삭제하지 못했어요.";
  }
}

onMounted(loadAll);
</script>

<style scoped lang="scss">
.admin-shop-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
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
  max-width: 640px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
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
}

.tab-row {
  display: flex;
  gap: 8px;
}

.tab-button {
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &.active {
    background: rgba(99, 102, 241, 0.24);
    color: #c7d2fe;
  }
}

.notice-text {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(251, 191, 36, 0.12);
  color: #fcd34d;
  font-size: 13px;
}

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
  font-size: 13px;
}

.panel {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.preset-button {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.filter-input {
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
}

.filter-check,
.check-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  cursor: pointer;
}

.empty-box {
  margin: 0;
  padding: 24px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th {
    padding: 10px 8px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.5);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    white-space: nowrap;
  }

  td {
    padding: 12px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    vertical-align: top;
  }
}

.cell-strong {
  margin: 0;
  font-weight: 700;
}

.cell-sub {
  margin: 2px 0 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.status-chip {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);

  &.on {
    background: rgba(34, 197, 94, 0.18);
    color: #86efac;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.off {
    background: rgba(148, 163, 184, 0.18);
    color: #cbd5e1;
  }
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.small-button {
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &.danger {
    background: rgba(248, 113, 113, 0.16);
    color: #fca5a5;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 23, 0.78);
}

.modal {
  width: 100%;
  max-width: 680px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.1);

  &.modal-small {
    max-width: 420px;
  }
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
  }
}

.close-button {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

.modal-body {
  padding: 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  input,
  select,
  textarea {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: #ffffff;
    font-size: 13px;
    outline: none;
    resize: vertical;

    &:focus {
      border-color: rgba(99, 102, 241, 0.6);
    }
  }
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  align-items: end;
}

.check-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;

  &.compact {
    gap: 10px;
  }
}

.option-section {
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.option-title {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
}

.option-group {
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.option-group-head {
  display: flex;
  gap: 8px;
  align-items: center;
}

.group-name {
  flex: 1;
  padding: 9px 11px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 13px;
  outline: none;
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.option-row {
  display: grid;
  grid-template-columns: 1fr 110px auto 30px;
  gap: 7px;
  align-items: center;

  input {
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-size: 12px;
    outline: none;
  }
}

.icon-button {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.16);
  color: #fca5a5;
  font-size: 14px;
  cursor: pointer;
}

.primary-button,
.secondary-button {
  height: 38px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  border: none;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #fff;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.secondary-button {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.82);
}
</style>
