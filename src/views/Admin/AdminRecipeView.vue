<template>
  <div class="admin-recipe-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN RECIPE PANEL</p>
        <h1>레시피 관리</h1>
        <p class="description">상품별 레시피를 등록, 수정, 삭제할 수 있어요.</p>
      </div>
    </header>

    <section class="filter-section">
      <div class="filter-card">
        <div class="filter-group">
          <label>검색</label>
          <input
            v-model.trim="searchText"
            type="text"
            placeholder="상품명 또는 레시피 검색"
          />
        </div>
      </div>
    </section>

    <section class="content-section">
      <div class="recipe-layout">
        <div class="recipe-list-card">
          <div class="section-title">
            <h2>제품 목록</h2>
          </div>

          <div v-if="isLoadingProducts" class="empty-box">
            <h2>상품을 불러오는 중이에요</h2>
            <p>잠시만 기다려주세요.</p>
          </div>

          <div v-else-if="filteredProductList.length === 0" class="empty-box">
            <h2>표시할 상품이 없어요</h2>
            <p>검색어를 바꿔보세요.</p>
          </div>

          <div v-else class="product-list">
            <button
              v-for="product in filteredProductList"
              :key="product.id"
              type="button"
              class="product-list-item"
              :class="{ active: selectedProduct?.id === product.id }"
              @click="selectProduct(product)"
            >
              <div>
                <strong>{{ product.productName }}</strong>
                <span>{{ getRecipeStatus(product) }}</span>
              </div>
              <small>{{ getProductCategoryNames(product) }}</small>
            </button>
          </div>
        </div>

        <div ref="editCardRef" class="recipe-edit-card">
          <div v-if="!selectedProduct" class="empty-box">
            <h2>레시피 편집할 상품을 선택해주세요</h2>
            <p>왼쪽 목록에서 상품을 선택하면 레시피를 등록할 수 있어요.</p>
          </div>

          <form v-else class="recipe-form" @submit.prevent="handleSubmit">
            <div class="section-title">
              <h2>{{ selectedProduct.productName }}</h2>
              <span class="recipe-status">{{
                getRecipeStatus(selectedProduct)
              }}</span>
            </div>

            <div class="form-group">
              <label>간단 레시피 설명</label>
              <textarea
                v-model.trim="form.recipeDescription"
                placeholder="예: 달콤한 소스와 잘 어울립니다."
              ></textarea>
            </div>

            <div class="form-group">
              <label>레시피 전문</label>
              <textarea
                v-model.trim="form.recipeText"
                placeholder="요리 순서나 설명을 입력하세요."
              ></textarea>
            </div>

            <div class="array-section">
              <div class="array-row">
                <label>재료</label>
                <button
                  type="button"
                  class="inline-button"
                  @click="addArrayItem('ingredients')"
                >
                  + 추가
                </button>
              </div>
              <div v-if="form.ingredients.length === 0" class="helper-text">
                재료 항목이 없습니다.
              </div>
              <div
                v-for="(ingredient, index) in form.ingredients"
                :key="`ingredient-${index}`"
                class="array-item-row"
              >
                <input
                  v-model.trim="form.ingredients[index].name"
                  type="text"
                  placeholder="재료 입력"
                />
                <input
                  v-model.trim="form.ingredients[index].amount"
                  type="text"
                  placeholder="용량 입력 (예: 100g, 1개)"
                  class="amount-input"
                />
                <button
                  type="button"
                  class="remove-button"
                  @click="removeArrayItem('ingredients', index)"
                >
                  삭제
                </button>
              </div>
            </div>

            <div class="array-section">
              <div class="array-row">
                <label>만드는 법</label>
                <button
                  type="button"
                  class="inline-button"
                  @click="addArrayItem('steps')"
                >
                  + 추가
                </button>
              </div>
              <div v-if="form.steps.length === 0" class="helper-text">
                조리 단계가 없습니다.
              </div>
              <div
                v-for="(item, index) in form.steps"
                :key="`step-${index}`"
                class="array-item-row"
              >
                <input
                  v-model.trim="form.steps[index]"
                  type="text"
                  placeholder="단계 입력"
                />
                <button
                  type="button"
                  class="remove-button"
                  @click="removeArrayItem('steps', index)"
                >
                  삭제
                </button>
              </div>
            </div>

            <div class="array-section">
              <div class="array-row">
                <label>팁</label>
                <button
                  type="button"
                  class="inline-button"
                  @click="addArrayItem('tips')"
                >
                  + 추가
                </button>
              </div>
              <div v-if="form.tips.length === 0" class="helper-text">
                팁 항목이 없습니다.
              </div>
              <div
                v-for="(item, index) in form.tips"
                :key="`tip-${index}`"
                class="array-item-row"
              >
                <input
                  v-model.trim="form.tips[index]"
                  type="text"
                  placeholder="팁 입력"
                />
                <button
                  type="button"
                  class="remove-button"
                  @click="removeArrayItem('tips', index)"
                >
                  삭제
                </button>
              </div>
            </div>

            <div class="form-actions">
              <button
                type="button"
                class="secondary-button"
                @click="clearRecipe"
                :disabled="!hasRecipe || isSaving"
              >
                레시피 삭제
              </button>
              <button type="submit" class="primary-button" :disabled="isSaving">
                {{ isSaving ? "저장 중..." : "레시피 저장" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { runGlobalBusy } from "@/lib/globalBusy";

const searchText = ref("");
const isLoadingProducts = ref(true);
const productList = ref([]);
const categoryList = ref([]);
const selectedProduct = ref(null);
const isSaving = ref(false);
const editCardRef = ref(null);
let unsubscribeProducts = null;
let unsubscribeCategories = null;

const form = ref({
  recipeDescription: "",
  recipeText: "",
  ingredients: [],
  steps: [],
  tips: [],
});

const filteredProductList = computed(() => {
  const keyword = String(searchText.value || "")
    .trim()
    .toLowerCase();
  return productList.value.filter((product) => {
    if (!keyword) return true;

    const name = String(product.productName || "").toLowerCase();
    const description = String(product.description || "").toLowerCase();
    const recipeText = String(product.recipeText || "").toLowerCase();
    const recipeDescription = String(
      product.recipeInfo?.description || ""
    ).toLowerCase();
    return (
      name.includes(keyword) ||
      description.includes(keyword) ||
      recipeText.includes(keyword) ||
      recipeDescription.includes(keyword)
    );
  });
});

const hasRecipe = computed(() => {
  if (!selectedProduct.value) return false;
  return Boolean(
    String(selectedProduct.value.recipeText || "").trim() ||
      (selectedProduct.value.recipeInfo &&
        (String(selectedProduct.value.recipeInfo.description || "").trim() ||
          (Array.isArray(selectedProduct.value.recipeInfo.ingredients) &&
            selectedProduct.value.recipeInfo.ingredients.length > 0) ||
          (Array.isArray(selectedProduct.value.recipeInfo.steps) &&
            selectedProduct.value.recipeInfo.steps.length > 0) ||
          (Array.isArray(selectedProduct.value.recipeInfo.tips) &&
            selectedProduct.value.recipeInfo.tips.length > 0)))
  );
});

function getRecipeStatus(product) {
  const recipeText = String(product.recipeText || "").trim();
  const recipeInfo = product.recipeInfo || {};
  const hasStructured = Boolean(
    String(recipeInfo.description || "").trim() ||
      (Array.isArray(recipeInfo.ingredients) &&
        recipeInfo.ingredients.length > 0) ||
      (Array.isArray(recipeInfo.steps) && recipeInfo.steps.length > 0) ||
      (Array.isArray(recipeInfo.tips) && recipeInfo.tips.length > 0)
  );
  return recipeText || hasStructured ? "등록됨" : "미등록";
}

function getProductCategoryIds(product) {
  if (Array.isArray(product.categoryIds) && product.categoryIds.length > 0) {
    return product.categoryIds.map((item) => String(item));
  }

  return product.categoryId ? [String(product.categoryId)] : [];
}

function getCategoryName(categoryId) {
  const categoryKey = String(categoryId || "");
  const category = categoryList.value.find(
    (item) => item.id === categoryKey || item.code === categoryKey
  );
  return category?.name || "카테고리 미지정";
}

function getProductCategoryNames(product) {
  const names = getProductCategoryIds(product).map(getCategoryName);
  return names.length > 0 ? names.join(", ") : "카테고리 미지정";
}

function normalizeList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter((item) => item)
    : [];
}

function normalizeIngredientItem(item) {
  if (typeof item === "string") {
    const text = item.trim();
    if (!text) return { name: "", amount: "" };

    const separator = text.includes(" - ")
      ? " - "
      : text.includes("-")
      ? "-"
      : null;

    if (separator) {
      const [name, amount] = text.split(separator).map((part) => part.trim());
      return { name: name || "", amount: amount || "" };
    }

    return { name: text, amount: "" };
  }

  if (item && typeof item === "object") {
    return {
      name: String(item.name || item.ingredient || "").trim(),
      amount: String(item.amount || item.quantity || item.value || "").trim(),
    };
  }

  return { name: String(item || "").trim(), amount: "" };
}

function normalizeIngredientList(value) {
  return Array.isArray(value)
    ? value
        .map((item) => normalizeIngredientItem(item))
        .filter((item) => item.name || item.amount)
    : [];
}

function initializeForm(product) {
  form.value = {
    recipeDescription: String(product.recipeInfo?.description || "").trim(),
    recipeText: String(product.recipeText || "").trim(),
    ingredients: Array.isArray(product.recipeInfo?.ingredients)
      ? product.recipeInfo.ingredients.map(normalizeIngredientItem)
      : [],
    steps: Array.isArray(product.recipeInfo?.steps)
      ? [...product.recipeInfo.steps]
      : [],
    tips: Array.isArray(product.recipeInfo?.tips)
      ? [...product.recipeInfo.tips]
      : [],
  };
}

async function selectProduct(product) {
  selectedProduct.value = product;
  initializeForm(product);

  await nextTick();

  if (window.innerWidth <= 900 && editCardRef.value) {
    editCardRef.value.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

function addArrayItem(key) {
  if (key === "ingredients") {
    form.value[key].push({ name: "", amount: "" });
  } else {
    form.value[key].push("");
  }
}

function removeArrayItem(key, index) {
  form.value[key].splice(index, 1);
}

async function handleSubmit() {
  if (!selectedProduct.value || isSaving.value) return;

  await runGlobalBusy(async () => {
    isSaving.value = true;

    try {
      const recipeInfo = {
        description: String(form.value.recipeDescription || "").trim(),
        ingredients: normalizeIngredientList(form.value.ingredients),
        steps: normalizeList(form.value.steps),
        tips: normalizeList(form.value.tips),
      };

      const payload = {
        recipeText: String(form.value.recipeText || "").trim(),
        recipeInfo: recipeInfo,
        updatedAt: serverTimestamp(),
      };

      if (
        !payload.recipeText &&
        !recipeInfo.description &&
        recipeInfo.ingredients.length === 0 &&
        recipeInfo.steps.length === 0 &&
        recipeInfo.tips.length === 0
      ) {
        payload.recipeInfo = {};
        payload.recipeText = "";
      }

      await updateDoc(doc(db, "products", selectedProduct.value.id), payload);

      const updated = {
        ...selectedProduct.value,
        recipeText: payload.recipeText,
        recipeInfo: payload.recipeInfo,
      };
      selectedProduct.value = updated;
      const index = productList.value.findIndex(
        (item) => item.id === updated.id
      );
      if (index !== -1) productList.value[index] = updated;

      alert("레시피가 저장되었어요.");
    } catch (error) {
      console.error("레시피 저장 실패:", error);
      alert("레시피 저장 중 문제가 발생했어요.");
    } finally {
      isSaving.value = false;
    }
  }, "레시피를 저장하는 중이에요.");
}

async function clearRecipe() {
  if (!selectedProduct.value || isSaving.value) return;
  const confirmed = window.confirm("이 상품의 레시피 내용을 삭제하시겠어요?");
  if (!confirmed) return;

  await runGlobalBusy(async () => {
    isSaving.value = true;

    try {
      await updateDoc(doc(db, "products", selectedProduct.value.id), {
        recipeText: "",
        recipeInfo: {},
        updatedAt: serverTimestamp(),
      });

      selectedProduct.value = {
        ...selectedProduct.value,
        recipeText: "",
        recipeInfo: {},
      };
      const index = productList.value.findIndex(
        (item) => item.id === selectedProduct.value.id
      );
      if (index !== -1) productList.value[index] = selectedProduct.value;
      initializeForm(selectedProduct.value);

      alert("레시피가 삭제되었어요.");
    } catch (error) {
      console.error("레시피 삭제 실패:", error);
      alert("레시피 삭제 중 문제가 발생했어요.");
    } finally {
      isSaving.value = false;
    }
  }, "레시피를 삭제하는 중이에요.");
}

function subscribeCategories() {
  const q = query(collection(db, "categories"), orderBy("sortOrder", "asc"));
  unsubscribeCategories = onSnapshot(
    q,
    (snapshot) => {
      categoryList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
    },
    (error) => {
      console.error("카테고리 구독 실패:", error);
    }
  );
}

function subscribeProducts() {
  const q = query(collection(db, "products"), orderBy("sortOrder", "asc"));
  unsubscribeProducts = onSnapshot(
    q,
    (snapshot) => {
      productList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingProducts.value = false;

      if (selectedProduct.value) {
        const updated = productList.value.find(
          (item) => item.id === selectedProduct.value.id
        );
        if (updated) selectedProduct.value = updated;
      }
    },
    (error) => {
      console.error("상품 구독 실패:", error);
      isLoadingProducts.value = false;
    }
  );
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
.admin-recipe-view {
  min-height: 100%;
  padding: 24px;
  color: #fff;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}

.description {
  margin: 8px 0 0;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
}

.filter-section {
  margin-bottom: 20px;
}

.filter-card {
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-group input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  padding: 12px 14px;
}

.content-section {
  display: flex;
}

.recipe-layout {
  width: 100%;
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 22px;
}

.recipe-list-card,
.recipe-edit-card {
  padding: 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.product-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.product-list-item {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.02);
  padding: 14px 16px;
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product-list-item.active {
  border-color: #60a5fa;
  background: rgba(96, 165, 250, 0.12);
}

.product-list-item strong {
  display: block;
  font-size: 15px;
  margin-bottom: 4px;
}

.product-list-item span {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}

.product-list-item small {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
}

.empty-box {
  padding: 28px 16px;
  text-align: center;
}

.empty-box h2 {
  margin: 0 0 10px;
}

.empty-box p {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
}

.recipe-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.recipe-form textarea,
.recipe-form input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  padding: 12px 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.array-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.array-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.inline-button,
.remove-button,
.primary-button,
.secondary-button {
  border: none;
  border-radius: 14px;
  cursor: pointer;
  padding: 10px 14px;
}

.inline-button {
  background: rgba(96, 165, 250, 0.12);
  color: #60a5fa;
}

.remove-button {
  background: rgba(244, 63, 94, 0.12);
  color: #f43f5e;
}

.array-item-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.secondary-button {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.primary-button {
  background: #60a5fa;
  color: #111827;
}

.recipe-status {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.helper-text {
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

@media (max-width: 900px) {
  .admin-recipe-view {
    padding: 16px;
  }

  .page-header {
    margin-bottom: 16px;
  }

  .recipe-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .recipe-list-card,
  .recipe-edit-card {
    padding: 16px;
  }

  .product-list {
    max-height: 42vh;
    overflow-y: auto;
    padding-right: 2px;
  }

  .recipe-edit-card {
    scroll-margin-top: 16px;
  }

  .section-title {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .array-item-row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .array-item-row .amount-input {
    width: 100%;
  }

  .inline-button,
  .remove-button,
  .primary-button,
  .secondary-button {
    min-height: 44px;
  }

  .remove-button,
  .form-actions button {
    width: 100%;
  }

  .form-actions {
    position: sticky;
    bottom: 0;
    z-index: 5;
    padding-top: 12px;
    background: linear-gradient(
      to top,
      rgba(18, 11, 22, 0.98) 72%,
      rgba(18, 11, 22, 0)
    );
  }
}
</style>
