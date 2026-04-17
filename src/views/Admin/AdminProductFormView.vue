<template>
  <div class="admin-product-form-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN PRODUCT FORM</p>
        <h1>{{ isEditMode ? "상품 수정" : "상품 등록" }}</h1>
        <p class="description">
          상품 기본 정보와 키오스크형 옵션 구성을 설정할 수 있어요.
        </p>
      </div>

      <div class="header-right">
        <button type="button" class="back-button" @click="goBack">
          목록으로
        </button>
      </div>
    </header>

    <section class="form-section">
      <div v-if="isLoadingProduct" class="empty-box">
        <h2>상품 정보를 불러오는 중이에요</h2>
        <p>잠시만 기다려주세요.</p>
      </div>

      <form v-else class="form-card" @submit.prevent="handleSubmit">
        <div class="section-title">
          <h2>기본 정보</h2>
        </div>

        <div class="form-grid">
          <div class="form-group full">
            <label for="productName">상품명</label>
            <input
              id="productName"
              v-model.trim="form.productName"
              type="text"
              placeholder="상품명을 입력해주세요"
            />
          </div>

          <div class="form-group full">
            <label for="description">상품 설명</label>
            <textarea
              id="description"
              v-model.trim="form.description"
              placeholder="상품 설명을 입력해주세요"
            ></textarea>
          </div>

          <div class="form-group">
            <label for="categoryId">카테고리</label>
            <select id="categoryId" v-model="form.categoryId">
              <option value="">카테고리 선택</option>
              <option
                v-for="category in categoryList"
                :key="category.id"
                :value="category.id"
              >
                {{ category.name }}
              </option>
            </select>
            <p v-if="categoryList.length === 0" class="helper-text">
              등록된 활성 카테고리가 없어요. 먼저 카테고리를 만들어주세요.
            </p>
          </div>

          <div class="form-group">
            <label for="basePrice">기본 가격</label>
            <input
              id="basePrice"
              v-model.number="form.basePrice"
              type="number"
              min="0"
              placeholder="기본 가격 입력"
            />
          </div>

          <div class="form-group">
            <label for="stock">재고</label>
            <input
              id="stock"
              v-model.number="form.stock"
              type="number"
              min="0"
              placeholder="재고 입력"
            />
          </div>

          <div class="form-group">
            <label for="imageUrl">썸네일 이미지 URL</label>
            <input
              id="imageUrl"
              v-model.trim="form.imageUrl"
              type="text"
              placeholder="이미지 URL 입력"
            />
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input v-model="form.isActive" type="checkbox" />
              <span>노출 상태</span>
            </label>
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input v-model="form.isSoldOut" type="checkbox" />
              <span>품절 처리</span>
            </label>
          </div>

          <div class="form-group full">
            <label>미리보기</label>
            <div class="preview-card">
              <div class="preview-thumb">
                <img
                  v-if="form.imageUrl"
                  :src="form.imageUrl"
                  :alt="form.productName || '상품 이미지'"
                />
                <div v-else class="preview-empty">이미지 없음</div>
              </div>

              <div class="preview-content">
                <strong>{{ form.productName || "상품명 미입력" }}</strong>
                <p>
                  {{ form.description || "상품 설명이 여기에 표시됩니다." }}
                </p>
                <span>
                  {{
                    form.basePrice || form.basePrice === 0
                      ? `${formatPrice(form.basePrice)}원`
                      : "가격 미입력"
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="section-title option-title-row">
          <h2>옵션 그룹</h2>
          <button
            type="button"
            class="add-group-button"
            @click="addOptionGroup"
          >
            + 옵션 그룹 추가
          </button>
        </div>

        <div v-if="form.optionGroups.length === 0" class="option-empty">
          <p>등록된 옵션 그룹이 없어요. 필요한 경우 추가해주세요.</p>
        </div>

        <div v-else class="option-group-list">
          <article
            v-for="(group, groupIndex) in form.optionGroups"
            :key="group.groupId"
            class="option-group-card"
          >
            <div class="option-group-header">
              <h3>옵션 그룹 {{ groupIndex + 1 }}</h3>
              <button
                type="button"
                class="delete-group-button"
                @click="removeOptionGroup(groupIndex)"
              >
                그룹 삭제
              </button>
            </div>

            <div class="group-grid">
              <div class="form-group">
                <label>그룹명</label>
                <input
                  v-model.trim="group.groupName"
                  type="text"
                  placeholder="예: 사이즈 선택"
                />
              </div>

              <div class="form-group">
                <label>그룹 ID</label>
                <input
                  v-model.trim="group.groupId"
                  type="text"
                  placeholder="예: size"
                />
              </div>

              <div class="form-group">
                <label>정렬 순서</label>
                <input
                  v-model.number="group.sortOrder"
                  type="number"
                  min="0"
                  placeholder="0"
                />
              </div>

              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input v-model="group.isRequired" type="checkbox" />
                  <span>필수 옵션</span>
                </label>
              </div>

              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input v-model="group.isMultiple" type="checkbox" />
                  <span>다중 선택</span>
                </label>
              </div>

              <div class="form-group">
                <label>최소 선택 수</label>
                <input
                  v-model.number="group.minSelectCount"
                  type="number"
                  min="0"
                  placeholder="0"
                />
              </div>

              <div class="form-group">
                <label>최대 선택 수</label>
                <input
                  v-model.number="group.maxSelectCount"
                  type="number"
                  min="0"
                  placeholder="1"
                />
              </div>
            </div>

            <div class="option-row-header">
              <h4>옵션 항목</h4>
              <button
                type="button"
                class="add-option-button"
                @click="addOptionItem(groupIndex)"
              >
                + 옵션 항목 추가
              </button>
            </div>

            <div v-if="group.options.length === 0" class="option-empty inner">
              <p>옵션 항목이 없어요.</p>
            </div>

            <div v-else class="option-item-list">
              <div
                v-for="(option, optionIndex) in group.options"
                :key="option.optionId"
                class="option-item-card"
              >
                <div class="option-item-top">
                  <h5>옵션 {{ optionIndex + 1 }}</h5>
                  <button
                    type="button"
                    class="delete-option-button"
                    @click="removeOptionItem(groupIndex, optionIndex)"
                  >
                    삭제
                  </button>
                </div>

                <div class="option-item-grid">
                  <div class="form-group">
                    <label>옵션명</label>
                    <input
                      v-model.trim="option.optionName"
                      type="text"
                      placeholder="예: 라지"
                    />
                  </div>

                  <div class="form-group">
                    <label>옵션 ID</label>
                    <input
                      v-model.trim="option.optionId"
                      type="text"
                      placeholder="예: size_l"
                    />
                  </div>

                  <div class="form-group">
                    <label>추가 금액</label>
                    <input
                      v-model.number="option.additionalPrice"
                      type="number"
                      min="0"
                      placeholder="0"
                    />
                  </div>

                  <div class="form-group">
                    <label for="sortOrder">상품 정렬 순서</label>
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
                      <input v-model="option.isActive" type="checkbox" />
                      <span>사용 상태</span>
                    </label>
                  </div>

                  <div class="form-group checkbox-group">
                    <label class="checkbox-label">
                      <input v-model="option.isSoldOut" type="checkbox" />
                      <span>품절</span>
                    </label>
                  </div>

                  <div class="form-group checkbox-group">
                    <label class="checkbox-label">
                      <input v-model="option.isDefault" type="checkbox" />
                      <span>기본 선택</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div class="form-actions">
          <button type="button" class="secondary-button" @click="goBack">
            취소
          </button>

          <button type="submit" class="primary-button" :disabled="isSubmitting">
            {{
              isSubmitting
                ? isEditMode
                  ? "수정 중..."
                  : "등록 중..."
                : isEditMode
                ? "상품 수정"
                : "상품 등록"
            }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const router = useRouter();
const route = useRoute();

const isSubmitting = ref(false);
const isLoadingProduct = ref(false);
const categoryList = ref([]);

let unsubscribeCategories = null;

const form = ref({
  productName: "",
  description: "",
  categoryId: "",
  basePrice: 0,
  stock: 0,
  imageUrl: "",
  isActive: true,
  isSoldOut: false,
  sortOrder: 0,
  optionGroups: [],
});

const isEditMode = computed(() => {
  return Boolean(route.params.productId);
});

function createEmptyOption() {
  return {
    optionId: `option_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    optionName: "",
    additionalPrice: 0,
    isActive: true,
    isSoldOut: false,
    isDefault: false,
    sortOrder: 0,
  };
}

function createEmptyOptionGroup() {
  return {
    groupId: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    groupName: "",
    isRequired: false,
    minSelectCount: 0,
    maxSelectCount: 1,
    isMultiple: false,
    sortOrder: form.value.optionGroups.length,
    options: [createEmptyOption()],
  };
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function subscribeCategories() {
  const categoryQuery = query(
    collection(db, "categories"),
    orderBy("sortOrder", "asc")
  );

  unsubscribeCategories = onSnapshot(
    categoryQuery,
    (snapshot) => {
      categoryList.value = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .filter((item) => item.isActive !== false);
    },
    (error) => {
      console.error("카테고리 조회 실패:", error);
    }
  );
}

function addOptionGroup() {
  form.value.optionGroups.push(createEmptyOptionGroup());
}

function removeOptionGroup(groupIndex) {
  form.value.optionGroups.splice(groupIndex, 1);
}

function addOptionItem(groupIndex) {
  form.value.optionGroups[groupIndex].options.push(createEmptyOption());
}

function removeOptionItem(groupIndex, optionIndex) {
  form.value.optionGroups[groupIndex].options.splice(optionIndex, 1);
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function normalizeOptionGroups() {
  return form.value.optionGroups.map((group, groupIndex) => {
    const normalizedGroupId = normalizeCode(
      group.groupId || group.groupName || `group_${groupIndex}`
    );

    const normalizedOptions = (group.options || []).map(
      (option, optionIndex) => ({
        optionId: normalizeCode(
          option.optionId || option.optionName || `option_${optionIndex}`
        ),
        optionName: option.optionName,
        additionalPrice: Number(option.additionalPrice || 0),
        isActive: option.isActive !== false,
        isSoldOut: option.isSoldOut === true,
        isDefault: option.isDefault === true,
        sortOrder: Number(option.sortOrder || 0),
      })
    );

    return {
      groupId: normalizedGroupId,
      groupName: group.groupName,
      isRequired: group.isRequired === true,
      minSelectCount: Number(group.minSelectCount || 0),
      maxSelectCount: Number(group.maxSelectCount || 0),
      isMultiple: group.isMultiple === true,
      sortOrder: Number(group.sortOrder || 0),
      options: normalizedOptions,
    };
  });
}

function validateForm() {
  if (!form.value.productName) {
    alert("상품명을 입력해주세요.");
    return false;
  }

  if (!form.value.categoryId) {
    alert("카테고리를 선택해주세요.");
    return false;
  }

  if (
    form.value.sortOrder === null ||
    form.value.sortOrder === "" ||
    form.value.sortOrder < 0
  ) {
    alert("상품 정렬 순서를 올바르게 입력해주세요.");
    return false;
  }

  if (
    form.value.basePrice === "" ||
    form.value.basePrice === null ||
    form.value.basePrice < 0
  ) {
    alert("기본 가격을 올바르게 입력해주세요.");
    return false;
  }

  if (
    form.value.stock === "" ||
    form.value.stock === null ||
    form.value.stock < 0
  ) {
    alert("재고를 올바르게 입력해주세요.");
    return false;
  }

  for (const group of form.value.optionGroups) {
    if (!group.groupName) {
      alert("옵션 그룹명을 입력해주세요.");
      return false;
    }

    if ((group.options || []).length === 0) {
      alert(`"${group.groupName}" 그룹에 옵션 항목을 하나 이상 추가해주세요.`);
      return false;
    }

    if (Number(group.maxSelectCount || 0) < Number(group.minSelectCount || 0)) {
      alert(
        `"${group.groupName}" 그룹의 최대 선택 수는 최소 선택 수보다 작을 수 없어요.`
      );
      return false;
    }

    for (const option of group.options) {
      if (!option.optionName) {
        alert(`"${group.groupName}" 그룹의 옵션명을 입력해주세요.`);
        return false;
      }

      if (option.additionalPrice === null || option.additionalPrice < 0) {
        alert(`"${group.groupName}" 그룹의 추가 금액을 올바르게 입력해주세요.`);
        return false;
      }
    }
  }

  return true;
}

async function loadProduct() {
  if (!isEditMode.value) return;

  isLoadingProduct.value = true;

  try {
    const productId = String(route.params.productId);
    const snapshot = await getDoc(doc(db, "products", productId));

    if (!snapshot.exists()) {
      alert("상품 정보를 찾을 수 없어요.");
      router.replace("/admin/products");
      return;
    }

    const data = snapshot.data();

    form.value = {
      productName: data.productName || "",
      description: data.description || "",
      categoryId: data.categoryId || "",
      basePrice: data.basePrice ?? data.price ?? 0,
      stock: data.stock ?? 0,
      imageUrl: data.imageUrl || "",
      isActive: data.isActive !== false,
      isSoldOut: data.isSoldOut === true,
      sortOrder: data.sortOrder ?? 0,
      optionGroups: Array.isArray(data.optionGroups) ? data.optionGroups : [],
    };
  } catch (error) {
    console.error("상품 조회 실패:", error);
    alert("상품 정보를 불러오는 중 문제가 발생했어요.");
  } finally {
    isLoadingProduct.value = false;
  }
}

async function handleSubmit() {
  if (!validateForm() || isSubmitting.value) return;

  isSubmitting.value = true;

  try {
    const payload = {
      productName: form.value.productName,
      description: form.value.description,
      categoryId: form.value.categoryId,
      basePrice: Number(form.value.basePrice || 0),
      stock: Number(form.value.stock || 0),
      imageUrl: form.value.imageUrl,
      isActive: form.value.isActive,
      isSoldOut: form.value.isSoldOut,
      optionGroups: normalizeOptionGroups(),
      updatedAt: serverTimestamp(),
      sortOrder: Number(form.value.sortOrder || 0),
    };

    if (isEditMode.value) {
      const productId = String(route.params.productId);
      await updateDoc(doc(db, "products", productId), payload);
      alert("상품이 수정되었어요.");
    } else {
      await addDoc(collection(db, "products"), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      alert("상품이 등록되었어요.");
    }

    router.push("/admin/products");
  } catch (error) {
    console.error("상품 저장 실패:", error);
    alert("상품 저장 중 문제가 발생했어요.");
  } finally {
    isSubmitting.value = false;
  }
}

function goBack() {
  router.push("/admin/products");
}

onMounted(() => {
  subscribeCategories();
  loadProduct();
});

onUnmounted(() => {
  if (unsubscribeCategories) {
    unsubscribeCategories();
    unsubscribeCategories = null;
  }
});
</script>

<style scoped lang="scss">
.admin-product-form-view {
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

.back-button {
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.empty-box,
.form-card,
.option-group-card,
.option-item-card {
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
}

.empty-box {
  min-height: 320px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

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

.form-card {
  padding: 20px;
}

.section-title {
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
  }
}

.option-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
}

.add-group-button,
.add-option-button,
.delete-group-button,
.delete-option-button {
  height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.add-group-button,
.add-option-button {
  background: #ffffff;
  color: #111827;
}

.delete-group-button,
.delete-option-button {
  background: rgba(252, 165, 165, 0.14);
  color: #fecaca;
}

.form-grid,
.group-grid,
.option-item-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.form-group {
  label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.72);
  }

  input,
  select,
  textarea {
    width: 100%;
    border: none;
    outline: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;
  }

  input,
  select {
    height: 46px;
    padding: 0 14px;
  }

  textarea {
    min-height: 120px;
    resize: none;
    padding: 14px;
    line-height: 1.6;
  }

  &.full {
    grid-column: 1 / -1;
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

.preview-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
}

.preview-thumb {
  width: 120px;
  height: 120px;
  border-radius: 18px;
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

.preview-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.preview-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;

  strong {
    display: block;
    margin-bottom: 8px;
    font-size: 18px;
    font-weight: 800;
  }

  p {
    margin: 0 0 8px;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.72);
  }

  span {
    font-size: 14px;
    font-weight: 800;
  }
}

.helper-text {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.option-empty {
  margin-bottom: 12px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);

  p {
    margin: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.68);
  }

  &.inner {
    margin-top: 12px;
    margin-bottom: 0;
  }
}

.option-group-list {
  display: grid;
  gap: 16px;
}

.option-group-card {
  padding: 16px;
}

.option-group-header,
.option-row-header,
.option-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.option-group-header {
  margin-bottom: 16px;

  h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
  }
}

.option-row-header {
  margin-top: 18px;
  margin-bottom: 12px;

  h4 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }
}

.option-item-list {
  display: grid;
  gap: 12px;
}

.option-item-card {
  padding: 14px;
}

.option-item-top {
  margin-bottom: 12px;

  h5 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
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

@media (max-width: 1024px) {
  .form-grid,
  .group-grid,
  .option-item-grid {
    grid-template-columns: 1fr;
  }

  .preview-card {
    flex-direction: column;
  }

  .preview-thumb {
    width: 100%;
    height: 220px;
  }

  .option-title-row,
  .option-group-header,
  .option-row-header,
  .option-item-top {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
