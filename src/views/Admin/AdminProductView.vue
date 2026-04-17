<template>
  <div class="admin-product-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN PRODUCT PANEL</p>
        <h1>상품 관리</h1>
        <p class="description">
          상품을 조회하고 상태를 확인하며 등록/수정 화면으로 이동할 수 있어요.
        </p>
      </div>

      <div class="header-right">
        <button type="button" class="create-button" @click="goCreate">
          + 상품 등록
        </button>
      </div>
    </header>

    <section class="filter-section">
      <div class="filter-card">
        <div class="filter-group">
          <label>검색</label>
          <input
            v-model.trim="searchText"
            type="text"
            placeholder="상품명 검색"
          />
        </div>

        <div class="filter-group">
          <label>카테고리</label>
          <select v-model="selectedCategory">
            <option value="ALL">전체</option>
            <option
              v-for="category in categoryList"
              :key="category.id"
              :value="category.id"
            >
              {{ category.name }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>상태</label>
          <select v-model="selectedStatus">
            <option value="ALL">전체</option>
            <option value="ACTIVE">노출중</option>
            <option value="INACTIVE">비노출</option>
            <option value="SOLD_OUT">품절</option>
          </select>
        </div>
      </div>
    </section>

    <section class="summary-section">
      <div class="summary-card">
        <span class="summary-label">표시 중 상품</span>
        <strong>{{ filteredProductList.length }}개</strong>
      </div>
    </section>

    <section class="table-section">
      <div v-if="isLoadingProducts" class="empty-box">
        <h2>상품을 불러오는 중이에요</h2>
        <p>잠시만 기다려주세요.</p>
      </div>

      <div v-else-if="filteredProductList.length === 0" class="empty-box">
        <h2>표시할 상품이 없어요</h2>
        <p>검색어나 필터 조건을 바꿔보세요.</p>
      </div>

      <div v-else class="table-wrap">
        <table class="product-table">
          <thead>
            <tr>
              <th>상품명</th>
              <th>카테고리</th>
              <th>가격</th>
              <th>재고</th>
              <th>정렬</th>
              <th>옵션</th>
              <th>상태</th>
              <th>수정</th>
              <th>복제</th>
              <th>삭제</th>
              <th>노출토글</th>
              <th>품절토글</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="item in filteredProductList" :key="item.id">
              <td>
                <div class="product-name-cell">
                  <div class="thumb-wrap">
                    <img :src="item.imageUrl" :alt="item.productName" />
                  </div>
                  <div class="name-wrap">
                    <strong>{{ item.productName }}</strong>
                    <span>{{ item.description }}</span>
                  </div>
                </div>
              </td>

              <td>{{ getCategoryName(item.categoryId) }}</td>
              <td>{{ formatPrice(item.basePrice || item.price) }}원</td>
              <td>{{ item.stock }}</td>
              <td>
                <div class="sort-order-cell">
                  <input
                    v-model.number="sortOrderMap[item.id]"
                    type="number"
                    min="0"
                    class="sort-order-input"
                  />
                  <button
                    type="button"
                    class="sort-save-button"
                    :disabled="isSavingSortMap[item.id]"
                    @click="saveSortOrder(item)"
                  >
                    {{ isSavingSortMap[item.id] ? "저장중" : "저장" }}
                  </button>
                </div>
              </td>

              <td>
                <div class="option-summary-cell">
                  <span
                    class="option-chip"
                    :class="
                      getOptionGroupCount(item) > 0 ? 'has-option' : 'no-option'
                    "
                  >
                    {{
                      getOptionGroupCount(item) > 0
                        ? `옵션 ${getOptionGroupCount(item)}그룹`
                        : "단품형"
                    }}
                  </span>

                  <small v-if="getOptionGroupCount(item) > 0">
                    항목 {{ getOptionItemCount(item) }}개
                  </small>
                </div>
              </td>

              <td>
                <span class="status-chip" :class="convertStatusClass(item)">
                  {{ convertStatusText(item) }}
                </span>
              </td>

              <td>
                <button
                  type="button"
                  class="edit-button"
                  @click="goEdit(item.id)"
                >
                  수정
                </button>
              </td>

              <td>
                <button
                  type="button"
                  class="duplicate-button"
                  @click="duplicateProduct(item)"
                >
                  복제
                </button>
              </td>

              <td>
                <button
                  type="button"
                  class="delete-product-button"
                  @click="deleteProduct(item)"
                >
                  삭제
                </button>
              </td>
              <td>
                <button
                  type="button"
                  class="toggle-inline-button"
                  :class="item.isActive === false ? 'activate' : 'deactivate'"
                  :disabled="isTogglingActiveMap[item.id]"
                  @click="toggleProductActive(item)"
                >
                  {{
                    isTogglingActiveMap[item.id]
                      ? "처리중"
                      : item.isActive === false
                      ? "노출"
                      : "숨김"
                  }}
                </button>
              </td>

              <td>
                <button
                  type="button"
                  class="toggle-inline-button"
                  :class="item.isSoldOut === true ? 'unsoldout' : 'soldout'"
                  :disabled="isTogglingSoldOutMap[item.id]"
                  @click="toggleProductSoldOut(item)"
                >
                  {{
                    isTogglingSoldOutMap[item.id]
                      ? "처리중"
                      : item.isSoldOut === true
                      ? "품절해제"
                      : "품절처리"
                  }}
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
import { useRouter } from "vue-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const router = useRouter();

const isLoadingProducts = ref(true);
const productList = ref([]);
const searchText = ref("");
const selectedCategory = ref("ALL");
const selectedStatus = ref("ALL");
const sortOrderMap = ref({});
const isSavingSortMap = ref({});

const isTogglingActiveMap = ref({});
const isTogglingSoldOutMap = ref({});

const categoryList = ref([]);

let unsubscribeProducts = null;
let unsubscribeCategories = null;

const filteredProductList = computed(() => {
  const keyword = searchText.value.toLowerCase();

  return [...productList.value]
    .filter((item) => {
      const matchKeyword =
        !keyword ||
        String(item.productName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.description || "")
          .toLowerCase()
          .includes(keyword);

      const matchCategory =
        selectedCategory.value === "ALL" ||
        item.categoryId === selectedCategory.value;

      const currentStatus = convertStatusCode(item);
      const matchStatus =
        selectedStatus.value === "ALL" ||
        currentStatus === selectedStatus.value;

      return matchKeyword && matchCategory && matchStatus;
    })
    .sort((a, b) => {
      const aOrder = Number(a.sortOrder ?? 0);
      const bOrder = Number(b.sortOrder ?? 0);

      if (aOrder !== bOrder) return aOrder - bOrder;

      const aCreated =
        typeof a.createdAt?.toDate === "function"
          ? a.createdAt.toDate().getTime()
          : 0;

      const bCreated =
        typeof b.createdAt?.toDate === "function"
          ? b.createdAt.toDate().getTime()
          : 0;

      return bCreated - aCreated;
    });
});

function subscribeProducts() {
  const productQuery = query(
    collection(db, "products"),
    orderBy("createdAt", "desc")
  );

  unsubscribeProducts = onSnapshot(
    productQuery,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      productList.value = list;

      const nextSortMap = {};
      list.forEach((item) => {
        nextSortMap[item.id] = Number(item.sortOrder ?? 0);
      });
      sortOrderMap.value = nextSortMap;

      isLoadingProducts.value = false;
    },
    (error) => {
      console.error("상품 조회 실패:", error);
      isLoadingProducts.value = false;
    }
  );
}

function subscribeCategories() {
  const categoryQuery = query(
    collection(db, "categories"),
    orderBy("sortOrder", "asc")
  );

  unsubscribeCategories = onSnapshot(
    categoryQuery,
    (snapshot) => {
      categoryList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
    },
    (error) => {
      console.error("카테고리 조회 실패:", error);
    }
  );
}

function getCategoryName(categoryId) {
  const found = categoryList.value.find(
    (item) => item.id === categoryId || item.code === categoryId
  );

  return found ? found.name : "미분류";
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function convertStatusCode(item) {
  if (item.isSoldOut) return "SOLD_OUT";
  if (item.isActive === false) return "INACTIVE";
  return "ACTIVE";
}

function convertStatusText(item) {
  const status = convertStatusCode(item);

  if (status === "ACTIVE") return "노출중";
  if (status === "INACTIVE") return "비노출";
  if (status === "SOLD_OUT") return "품절";
  return status;
}

function convertStatusClass(item) {
  const status = convertStatusCode(item);

  if (status === "ACTIVE") return "active";
  if (status === "INACTIVE") return "inactive";
  if (status === "SOLD_OUT") return "soldout";
  return "";
}

function goCreate() {
  router.push("/admin/products/create");
}

function goEdit(productId) {
  router.push(`/admin/products/${productId}`);
}

function getOptionGroupCount(item) {
  return Array.isArray(item.optionGroups) ? item.optionGroups.length : 0;
}

function getOptionItemCount(item) {
  if (!Array.isArray(item.optionGroups)) return 0;

  return item.optionGroups.reduce((acc, group) => {
    return acc + (Array.isArray(group.options) ? group.options.length : 0);
  }, 0);
}

async function duplicateProduct(item) {
  try {
    const duplicatedName = `${item.productName} 복사본`;

    const payload = {
      productName: duplicatedName,
      description: item.description || "",
      categoryId: item.categoryId || "",
      basePrice: Number(item.basePrice ?? item.price ?? 0),
      stock: Number(item.stock ?? 0),
      imageUrl: item.imageUrl || "",
      isActive: item.isActive !== false,
      sortOrder: Number(item.sortOrder ?? 0) + 1,
      isSoldOut: item.isSoldOut === true,
      optionGroups: Array.isArray(item.optionGroups)
        ? JSON.parse(JSON.stringify(item.optionGroups))
        : [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await addDoc(collection(db, "products"), payload);
    alert("상품이 복제되었어요.");
  } catch (error) {
    console.error("상품 복제 실패:", error);
    alert("상품 복제 중 문제가 발생했어요.");
  }
}

async function deleteProduct(item) {
  const ok = window.confirm(
    `"${item.productName}" 상품을 삭제할까요?\n삭제 후 되돌릴 수 없어요.`
  );

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "products", item.id));
    alert("상품이 삭제되었어요.");
  } catch (error) {
    console.error("상품 삭제 실패:", error);
    alert("상품 삭제 중 문제가 발생했어요.");
  }
}

async function saveSortOrder(item) {
  const nextSortOrder = Number(sortOrderMap.value[item.id] ?? 0);

  if (Number.isNaN(nextSortOrder) || nextSortOrder < 0) {
    alert("정렬 순서는 0 이상의 숫자로 입력해주세요.");
    sortOrderMap.value[item.id] = Number(item.sortOrder ?? 0);
    return;
  }

  isSavingSortMap.value = {
    ...isSavingSortMap.value,
    [item.id]: true,
  };

  try {
    await updateDoc(doc(db, "products", item.id), {
      sortOrder: nextSortOrder,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("정렬 순서 저장 실패:", error);
    alert("정렬 순서 저장 중 문제가 발생했어요.");
    sortOrderMap.value[item.id] = Number(item.sortOrder ?? 0);
  } finally {
    isSavingSortMap.value = {
      ...isSavingSortMap.value,
      [item.id]: false,
    };
  }
}

async function toggleProductActive(item) {
  isTogglingActiveMap.value = {
    ...isTogglingActiveMap.value,
    [item.id]: true,
  };

  try {
    await updateDoc(doc(db, "products", item.id), {
      isActive: item.isActive === false ? true : false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("상품 노출 상태 변경 실패:", error);
    alert("노출 상태 변경 중 문제가 발생했어요.");
  } finally {
    isTogglingActiveMap.value = {
      ...isTogglingActiveMap.value,
      [item.id]: false,
    };
  }
}

async function toggleProductSoldOut(item) {
  isTogglingSoldOutMap.value = {
    ...isTogglingSoldOutMap.value,
    [item.id]: true,
  };

  try {
    await updateDoc(doc(db, "products", item.id), {
      isSoldOut: item.isSoldOut === true ? false : true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("상품 품절 상태 변경 실패:", error);
    alert("품절 상태 변경 중 문제가 발생했어요.");
  } finally {
    isTogglingSoldOutMap.value = {
      ...isTogglingSoldOutMap.value,
      [item.id]: false,
    };
  }
}

onMounted(() => {
  subscribeCategories();
  subscribeProducts();
});

onUnmounted(() => {
  if (unsubscribeProducts) {
    unsubscribeProducts();
    unsubscribeProducts = null;
  }

  if (unsubscribeCategories) {
    unsubscribeCategories();
    unsubscribeCategories = null;
  }
});
</script>

<style scoped lang="scss">
.admin-product-view {
  min-height: 100vh;
  padding: 24px;
  background: #0f172a;
  color: #fff;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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

.create-button {
  height: 46px;
  padding: 0 18px;
  border: none;
  border-radius: 14px;
  background: #ffffff;
  color: #111827;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.filter-section,
.summary-section {
  margin-bottom: 16px;
}

.filter-card,
.summary-card,
.empty-box,
.table-wrap {
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
}

.filter-card {
  padding: 16px;
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 16px;
}

.filter-group {
  label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.72);
  }

  input,
  select {
    width: 100%;
    height: 44px;
    padding: 0 14px;
    border: none;
    outline: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;
  }
}

.summary-card {
  padding: 16px;

  .summary-label {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }

  strong {
    font-size: 24px;
    font-weight: 800;
  }
}

.empty-box {
  min-height: 300px;
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

.product-table {
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

.product-name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.thumb-wrap {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.name-wrap {
  min-width: 0;

  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 800;
  }

  span {
    display: block;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
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

  &.soldout {
    background: rgba(252, 165, 165, 0.14);
    color: #fecaca;
  }
}

.edit-button {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.option-summary-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;

  small {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
  }
}

.option-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;

  &.has-option {
    background: rgba(96, 165, 250, 0.18);
    color: #bfdbfe;
  }

  &.no-option {
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.88);
  }
}

.duplicate-button {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: rgba(96, 165, 250, 0.18);
  color: #bfdbfe;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.delete-product-button {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: rgba(252, 165, 165, 0.14);
  color: #fecaca;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.sort-order-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-order-input {
  width: 72px;
  height: 36px;
  padding: 0 10px;
  border: none;
  outline: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.sort-save-button {
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: rgba(52, 211, 153, 0.18);
  color: #a7f3d0;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.toggle-inline-button {
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.activate {
    background: rgba(52, 211, 153, 0.18);
    color: #a7f3d0;
  }

  &.deactivate {
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.9);
  }

  &.soldout {
    background: rgba(252, 165, 165, 0.14);
    color: #fecaca;
  }

  &.unsoldout {
    background: rgba(250, 204, 21, 0.18);
    color: #fde68a;
  }
}

@media (max-width: 1920px) {
  .filter-card {
    grid-template-columns: 1fr;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .product-table {
    min-width: 1520px;
  }
}
</style>
