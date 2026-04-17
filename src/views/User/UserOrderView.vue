<template>
  <div class="user-order-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>주문 기능은 모바일 환경에서만 사용할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="order-container">
      <header class="order-header">
        <div class="header-top">
          <button type="button" class="back-button" @click="goBack">←</button>

          <div class="header-title">
            <p class="eyebrow">ORDER</p>
            <h1>주문하기</h1>
          </div>
        </div>

        <div class="session-card">
          <div class="session-row">
            <span>테이블</span>
            <strong>{{ tableText }}</strong>
          </div>
          <div class="session-row">
            <span>표시명</span>
            <strong>{{ displayNameText }}</strong>
          </div>
          <div class="session-row">
            <span>주문서 번호</span>
            <strong>{{ orderSheetIdText }}</strong>
          </div>
        </div>

        <div class="search-box">
          <input
            v-model.trim="searchText"
            type="text"
            placeholder="상품명을 검색해보세요"
          />
        </div>
      </header>

      <section class="category-section">
        <div class="category-scroll">
          <button
            v-for="category in categoryTabList"
            :key="category.id"
            type="button"
            class="category-chip"
            :class="{ active: selectedCategory === category.id }"
            @click="selectedCategory = category.id"
          >
            {{ category.name }}
          </button>
        </div>
      </section>

      <section class="product-section">
        <div v-if="isLoadingProducts" class="empty-box">
          <p>상품을 불러오는 중이에요.</p>
        </div>

        <div v-else-if="filteredProductList.length === 0" class="empty-box">
          <p>조건에 맞는 상품이 없어요.</p>
        </div>

        <div v-else class="product-list">
          <article
            v-for="product in filteredProductList"
            :key="product.id"
            class="product-card"
            :class="{ soldout: isSoldOutProduct(product) }"
            @click="openProductOptionSheet(product)"
          >
            <div class="product-image-wrap">
              <img
                v-if="product.imageUrl"
                :src="product.imageUrl"
                :alt="product.productName"
              />
              <div v-else class="product-image-empty">이미지 없음</div>
            </div>

            <div class="product-info">
              <div class="product-top">
                <div class="badge-wrap">
                  <span
                    v-if="isSoldOutProduct(product)"
                    class="product-badge soldout"
                  >
                    SOLD OUT
                  </span>
                  <span
                    v-else-if="Number(product.stock || 0) <= 3"
                    class="product-badge lowstock"
                  >
                    LOW STOCK
                  </span>
                  <span
                    v-if="(product.optionGroups || []).length > 0"
                    class="product-badge option"
                  >
                    옵션
                  </span>
                </div>

                <h2>{{ product.productName }}</h2>
                <p class="product-description">
                  {{ product.description || "상품 설명이 없습니다." }}
                </p>
              </div>

              <div class="product-bottom">
                <strong class="product-price">
                  {{ formatPrice(product.basePrice) }}원~
                </strong>

                <div class="product-actions">
                  <button
                    v-if="!isSoldOutProduct(product)"
                    type="button"
                    class="add-button"
                    @click.stop="openProductOptionSheet(product)"
                  >
                    선택
                  </button>

                  <button
                    v-else
                    type="button"
                    class="soldout-button"
                    disabled
                    @click.stop
                  >
                    품절
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <div class="cart-bar-space"></div>

      <transition name="fade">
        <section v-if="cartList.length > 0" class="cart-bar">
          <div class="cart-summary">
            <div class="cart-summary-text">
              <strong>{{ totalCartCount }}개 담김</strong>
              <p>총 {{ formatPrice(totalCartPrice) }}원</p>
            </div>

            <button type="button" class="cart-button" @click="goCart">
              주문하기
            </button>
          </div>
        </section>
      </transition>

      <transition name="sheet-fade">
        <div
          v-if="selectedProduct"
          class="option-sheet-overlay"
          @click.self="closeProductOptionSheet"
        >
          <div class="option-sheet">
            <div class="sheet-handle"></div>

            <div class="option-sheet-header">
              <div class="sheet-title-wrap">
                <h3>{{ selectedProduct.productName }}</h3>
                <p>
                  {{ selectedProduct.description || "상품 설명이 없습니다." }}
                </p>
              </div>

              <button
                type="button"
                class="sheet-close-button"
                @click="closeProductOptionSheet"
              >
                ✕
              </button>
            </div>

            <div class="sheet-price-box">
              <span>기본 가격</span>
              <strong>{{ formatPrice(selectedProduct.basePrice) }}원</strong>
            </div>

            <div
              v-for="group in sortedOptionGroups"
              :key="group.groupId"
              class="option-group-box"
            >
              <div class="option-group-header">
                <div>
                  <h4>{{ group.groupName }}</h4>
                  <p>
                    {{
                      group.isRequired
                        ? `필수 · 최소 ${group.minSelectCount}개`
                        : `선택 · 최대 ${group.maxSelectCount}개`
                    }}
                  </p>
                </div>
                <span class="group-badge">
                  {{ group.isMultiple ? "다중선택" : "단일선택" }}
                </span>
              </div>

              <div class="option-item-list">
                <button
                  v-for="option in getActiveOptions(group)"
                  :key="option.optionId"
                  type="button"
                  class="option-item-button"
                  :class="{
                    selected: isOptionSelected(group.groupId, option.optionId),
                    soldout: option.isSoldOut,
                  }"
                  :disabled="option.isSoldOut"
                  @click="toggleOption(group, option)"
                >
                  <div class="option-item-left">
                    <strong>{{ option.optionName }}</strong>
                    <span v-if="Number(option.additionalPrice || 0) > 0">
                      +{{ formatPrice(option.additionalPrice) }}원
                    </span>
                    <span v-else>추가금액 없음</span>
                  </div>

                  <div class="option-item-right">
                    <span v-if="option.isSoldOut" class="option-state soldout">
                      품절
                    </span>
                    <span
                      v-else-if="
                        isOptionSelected(group.groupId, option.optionId)
                      "
                      class="option-state selected"
                    >
                      선택됨
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div class="option-error-box" v-if="optionValidationMessage">
              {{ optionValidationMessage }}
            </div>

            <div class="sheet-quantity-row">
              <span>수량</span>

              <div class="quantity-controller">
                <button type="button" @click="decreaseSheetQuantity">-</button>
                <span>{{ sheetQuantity }}</span>
                <button type="button" @click="increaseSheetQuantity">+</button>
              </div>
            </div>

            <div class="sheet-bottom">
              <div class="sheet-total">
                <span>총 금액</span>
                <strong>{{ formatPrice(sheetTotalPrice) }}원</strong>
              </div>

              <button
                type="button"
                class="sheet-submit-button"
                @click="addSelectedProductToCart"
              >
                장바구니 담기
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

const router = useRouter();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");

const searchText = ref("");
const selectedCategory = ref("all");
const isLoadingProducts = ref(true);

const categoryList = ref([]);
const productList = ref([]);
const cartList = ref([]);

const selectedProduct = ref(null);
const selectedOptionMap = ref({});
const sheetQuantity = ref(1);
const optionValidationMessage = ref("");

let unsubscribeCategories = null;
let unsubscribeProducts = null;

const tableText = computed(() => {
  return tableNumber.value
    ? `${tableNumber.value}번 테이블`
    : "테이블 정보 없음";
});

const displayNameText = computed(() => {
  return displayName.value || "표시명 없음";
});

const orderSheetIdText = computed(() => {
  return orderSheetId.value || "주문서 없음";
});

const categoryTabList = computed(() => {
  return [
    { id: "all", name: "전체" },
    ...categoryList.value
      .filter((item) => item.isActive !== false)
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      .map((item) => ({
        id: item.id,
        name: item.name,
      })),
  ];
});

const filteredProductList = computed(() => {
  const keyword = searchText.value.toLowerCase();

  return [...productList.value]
    .filter((item) => {
      if (item.isActive === false) return false;
      if (item.isDeleted === true) return false;

      const matchCategory =
        selectedCategory.value === "all" ||
        item.categoryId === selectedCategory.value;

      const matchKeyword =
        !keyword ||
        String(item.productName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.description || "")
          .toLowerCase()
          .includes(keyword);

      return matchCategory && matchKeyword;
    })
    .sort((a, b) => {
      const aSoldOut = isSoldOutProduct(a) ? 1 : 0;
      const bSoldOut = isSoldOutProduct(b) ? 1 : 0;

      if (aSoldOut !== bSoldOut) return aSoldOut - bSoldOut;

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

const totalCartCount = computed(() => {
  return cartList.value.reduce(
    (acc, item) => acc + Number(item.quantity || 0),
    0
  );
});

const totalCartPrice = computed(() => {
  return cartList.value.reduce(
    (acc, item) => acc + Number(item.totalPrice || 0),
    0
  );
});

const sortedOptionGroups = computed(() => {
  if (!selectedProduct.value?.optionGroups) return [];

  return [...selectedProduct.value.optionGroups].sort(
    (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)
  );
});

const selectedOptionsFlat = computed(() => {
  const result = [];

  for (const [groupId, options] of Object.entries(
    selectedOptionMap.value || {}
  )) {
    for (const option of options) {
      result.push({
        groupId,
        groupName: option.groupName,
        optionId: option.optionId,
        optionName: option.optionName,
        additionalPrice: Number(option.additionalPrice || 0),
      });
    }
  }

  return result;
});

const sheetUnitPrice = computed(() => {
  if (!selectedProduct.value) return 0;

  const additionalPrice = selectedOptionsFlat.value.reduce(
    (acc, item) => acc + Number(item.additionalPrice || 0),
    0
  );

  return Number(selectedProduct.value.basePrice || 0) + additionalPrice;
});

const sheetTotalPrice = computed(() => {
  return sheetUnitPrice.value * Number(sheetQuantity.value || 1);
});

function detectMobile() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  isMobile.value =
    /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua) ||
    window.innerWidth <= 1024;
}

function loadEntryInfo() {
  try {
    const entryInfo = JSON.parse(
      sessionStorage.getItem("userEntryInfo") || "{}"
    );
    tableNumber.value = entryInfo.tableNumber || "";
    displayName.value = entryInfo.displayName || "";
    orderSheetId.value = entryInfo.orderSheetId || "";
  } catch (error) {
    tableNumber.value = "";
    displayName.value = "";
    orderSheetId.value = "";
  }
}

function loadCart() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("userCart") || "[]");
    cartList.value = Array.isArray(saved) ? saved : [];
  } catch (error) {
    cartList.value = [];
  }
}

function saveCart() {
  sessionStorage.setItem("userCart", JSON.stringify(cartList.value));
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

function subscribeProducts() {
  const productQuery = query(
    collection(db, "products"),
    orderBy("createdAt", "desc")
  );

  unsubscribeProducts = onSnapshot(
    productQuery,
    (snapshot) => {
      productList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingProducts.value = false;
    },
    (error) => {
      console.error("상품 조회 실패:", error);
      isLoadingProducts.value = false;
    }
  );
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function isSoldOutProduct(product) {
  return product.isSoldOut === true || Number(product.stock ?? 0) <= 0;
}

function getActiveOptions(group) {
  return [...(group.options || [])]
    .filter((item) => item.isActive !== false)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
}

function openProductOptionSheet(product) {
  if (isSoldOutProduct(product)) return;

  selectedProduct.value = JSON.parse(JSON.stringify(product));
  selectedOptionMap.value = {};
  sheetQuantity.value = 1;
  optionValidationMessage.value = "";

  for (const group of selectedProduct.value.optionGroups || []) {
    const activeOptions = getActiveOptions(group);
    const defaultOptions = activeOptions.filter(
      (item) => item.isDefault === true
    );

    if (group.isMultiple) {
      selectedOptionMap.value[group.groupId] = defaultOptions
        .filter((item) => item.isSoldOut !== true)
        .map((item) => ({
          ...item,
          groupName: group.groupName,
        }));
    } else {
      const defaultOne = defaultOptions.find((item) => item.isSoldOut !== true);
      selectedOptionMap.value[group.groupId] = defaultOne
        ? [{ ...defaultOne, groupName: group.groupName }]
        : [];
    }
  }
}

function closeProductOptionSheet() {
  selectedProduct.value = null;
  selectedOptionMap.value = {};
  sheetQuantity.value = 1;
  optionValidationMessage.value = "";
}

function isOptionSelected(groupId, optionId) {
  const selected = selectedOptionMap.value[groupId] || [];
  return selected.some((item) => item.optionId === optionId);
}

function toggleOption(group, option) {
  optionValidationMessage.value = "";

  const groupId = group.groupId;
  const selected = [...(selectedOptionMap.value[groupId] || [])];
  const exists = selected.findIndex(
    (item) => item.optionId === option.optionId
  );

  if (group.isMultiple) {
    if (exists > -1) {
      selected.splice(exists, 1);
    } else {
      if (selected.length >= Number(group.maxSelectCount || 999)) {
        optionValidationMessage.value = `${group.groupName}은(는) 최대 ${group.maxSelectCount}개까지 선택할 수 있어요.`;
        return;
      }

      selected.push({
        ...option,
        groupName: group.groupName,
      });
    }
  } else {
    if (exists > -1) {
      selectedOptionMap.value[groupId] = [];
      return;
    }

    selectedOptionMap.value[groupId] = [
      {
        ...option,
        groupName: group.groupName,
      },
    ];
    return;
  }

  selectedOptionMap.value[groupId] = selected;
}

function validateSelectedOptions() {
  if (!selectedProduct.value) return false;

  for (const group of sortedOptionGroups.value) {
    const activeOptions = getActiveOptions(group).filter(
      (item) => item.isSoldOut !== true
    );

    const selected = selectedOptionMap.value[group.groupId] || [];
    const minSelectCount = Number(group.minSelectCount || 0);
    const maxSelectCount = Number(group.maxSelectCount || 0);

    if (group.isRequired && activeOptions.length === 0) {
      optionValidationMessage.value = `${group.groupName}에 선택 가능한 옵션이 없어요. 직원에게 문의해주세요.`;
      return false;
    }

    if (group.isRequired && selected.length < minSelectCount) {
      optionValidationMessage.value = `${group.groupName} 항목을 선택해주세요.`;
      return false;
    }

    if (maxSelectCount > 0 && selected.length > maxSelectCount) {
      optionValidationMessage.value = `${group.groupName}은(는) 최대 ${maxSelectCount}개까지 선택할 수 있어요.`;
      return false;
    }

    if (!group.isMultiple && selected.length > 1) {
      optionValidationMessage.value = `${group.groupName}은(는) 하나만 선택할 수 있어요.`;
      return false;
    }
  }

  optionValidationMessage.value = "";
  return true;
}

function increaseSheetQuantity() {
  sheetQuantity.value += 1;
}

function decreaseSheetQuantity() {
  if (sheetQuantity.value <= 1) return;
  sheetQuantity.value -= 1;
}

function buildCartItemKey(productId, selectedOptions) {
  const optionKey = [...selectedOptions]
    .sort((a, b) => {
      const left = `${a.groupId}_${a.optionId}`;
      const right = `${b.groupId}_${b.optionId}`;
      return left.localeCompare(right);
    })
    .map((item) => `${item.groupId}:${item.optionId}`)
    .join("|");

  return `${productId}__${optionKey}`;
}

function addSelectedProductToCart() {
  if (!selectedProduct.value) return;
  if (!validateSelectedOptions()) return;

  const cartItem = {
    cartItemId: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    cartItemKey: buildCartItemKey(
      selectedProduct.value.id,
      selectedOptionsFlat.value
    ),
    orderSheetId: orderSheetId.value,
    tableNumber: tableNumber.value,
    displayName: displayName.value,
    productId: selectedProduct.value.id,
    productName: selectedProduct.value.productName,
    basePrice: Number(selectedProduct.value.basePrice || 0),
    imageUrl: selectedProduct.value.imageUrl || "",
    quantity: Number(sheetQuantity.value || 1),
    selectedOptions: selectedOptionsFlat.value,
    unitPrice: sheetUnitPrice.value,
    totalPrice: sheetTotalPrice.value,
  };

  const foundIndex = cartList.value.findIndex(
    (item) => item.cartItemKey === cartItem.cartItemKey
  );

  if (foundIndex > -1) {
    cartList.value[foundIndex].quantity += cartItem.quantity;
    cartList.value[foundIndex].totalPrice =
      Number(cartList.value[foundIndex].unitPrice || 0) *
      Number(cartList.value[foundIndex].quantity || 0);
  } else {
    cartList.value.push(cartItem);
  }

  saveCart();
  closeProductOptionSheet();
}

function goBack() {
  router.push("/user/main");
}

function goCart() {
  router.push("/user/cart");
}

onMounted(() => {
  detectMobile();
  loadEntryInfo();
  loadCart();
  subscribeCategories();
  subscribeProducts();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
  }
});

onUnmounted(() => {
  if (unsubscribeCategories) {
    unsubscribeCategories();
    unsubscribeCategories = null;
  }

  if (unsubscribeProducts) {
    unsubscribeProducts();
    unsubscribeProducts = null;
  }
});
</script>

<style scoped lang="scss">
.user-order-view {
  min-height: 100dvh;
  background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  color: #ffffff;
}

.desktop-block {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.desktop-card {
  width: 100%;
  max-width: 420px;
  padding: 28px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  text-align: center;

  .desktop-eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.6);
  }

  h1 {
    margin: 0 0 12px;
    font-size: 28px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 15px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.76);
  }
}

.order-container {
  min-height: 100dvh;
  padding: 16px 16px 0;
}

.order-header {
  margin-bottom: 16px;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.back-button {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
}

.header-title {
  .eyebrow {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.6);
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 800;
    line-height: 1.2;
  }
}

.session-card {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;

  .session-row {
    display: flex;
    align-items: center;
    justify-content: space-between;

    &:not(:last-child) {
      margin-bottom: 10px;
    }

    span {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.65);
    }

    strong {
      font-size: 16px;
      font-weight: 800;
      text-align: right;
      word-break: break-all;
    }
  }
}

.search-box {
  input {
    width: 100%;
    height: 50px;
    padding: 0 16px;
    border: none;
    outline: none;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;

    &::placeholder {
      color: rgba(255, 255, 255, 0.45);
    }
  }
}

.category-section {
  margin-bottom: 16px;
}

.category-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;

  &::-webkit-scrollbar {
    display: none;
  }
}

.category-chip {
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;

  &.active {
    background: #ffffff;
    color: #111827;
  }
}

.product-section {
  padding-bottom: 24px;
}

.empty-box {
  padding: 28px 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  text-align: center;

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
  }
}

.product-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.product-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;

  &.soldout {
    opacity: 0.72;
  }
}

.product-image-wrap {
  width: 96px;
  height: 96px;
  border-radius: 18px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.product-image-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.product-info {
  min-width: 0;
  flex: 1;
}

.badge-wrap {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.product-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;

  &.soldout {
    background: rgba(252, 165, 165, 0.14);
    color: #fecaca;
  }

  &.lowstock {
    background: rgba(250, 204, 21, 0.18);
    color: #fde68a;
  }

  &.option {
    background: rgba(96, 165, 250, 0.18);
    color: #bfdbfe;
  }
}

.product-top {
  h2 {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 800;
    line-height: 1.4;
  }
}

.product-description {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.68);
}

.product-bottom {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.product-price {
  font-size: 18px;
  font-weight: 800;
}

.product-actions {
  flex-shrink: 0;
}

.add-button,
.soldout-button {
  min-width: 72px;
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
}

.add-button {
  background: #ffffff;
  color: #111827;
  cursor: pointer;
}

.soldout-button {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.58);
  cursor: not-allowed;
}

.cart-bar-space {
  height: 92px;
}

.cart-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0) 0%,
    rgba(15, 23, 42, 0.88) 20%,
    rgba(15, 23, 42, 0.96) 100%
  );
}

.cart-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 560px;
  margin: 0 auto;
  padding: 14px;
  border-radius: 22px;
  background: #ffffff;
  color: #111827;
}

.cart-summary-text {
  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 13px;
    color: rgba(17, 24, 39, 0.72);
  }
}

.cart-button {
  min-width: 104px;
  height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: 14px;
  background: #111827;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.option-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.62);
  display: flex;
  align-items: flex-end;
  z-index: 100;
}

.option-sheet {
  width: 100%;
  max-height: 88dvh;
  overflow-y: auto;
  background: #111827;
  border-top-left-radius: 28px;
  border-top-right-radius: 28px;
  padding: 14px 16px calc(20px + env(safe-area-inset-bottom));
  box-shadow: 0 -24px 60px rgba(0, 0, 0, 0.32);
}

.sheet-handle {
  width: 48px;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.24);
  margin: 0 auto 14px;
}

.option-sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.sheet-title-wrap {
  h3 {
    margin: 0 0 6px;
    font-size: 24px;
    font-weight: 800;
    line-height: 1.3;
  }

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.72);
  }
}

.sheet-close-button {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
}

.sheet-price-box,
.option-group-box,
.option-error-box,
.sheet-bottom {
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
}

.sheet-price-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  margin-bottom: 14px;

  span {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.62);
  }

  strong {
    font-size: 18px;
    font-weight: 800;
  }
}

.option-group-box {
  padding: 14px;
  margin-bottom: 14px;
}

.option-group-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;

  h4 {
    margin: 0 0 4px;
    font-size: 17px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.58);
  }
}

.group-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 11px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.9);
}

.option-item-list {
  display: grid;
  gap: 10px;
}

.option-item-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  cursor: pointer;
  text-align: left;

  &.selected {
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.14);
  }

  &.soldout {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.option-item-left {
  min-width: 0;

  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 14px;
    font-weight: 800;
  }

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
}

.option-item-right {
  flex-shrink: 0;
}

.option-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;

  &.selected {
    background: rgba(52, 211, 153, 0.18);
    color: #a7f3d0;
  }

  &.soldout {
    background: rgba(252, 165, 165, 0.14);
    color: #fecaca;
  }
}

.option-error-box {
  margin-bottom: 14px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.6;
  color: #fecaca;
  background: rgba(252, 165, 165, 0.12);
}

.sheet-quantity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 0 4px;

  span {
    font-size: 15px;
    font-weight: 700;
  }
}

.quantity-controller {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.12);

  button {
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }

  span {
    min-width: 18px;
    text-align: center;
    font-size: 14px;
    font-weight: 800;
  }
}

.sheet-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  position: sticky;
  bottom: 0;
  margin-top: 10px;
  background: rgba(17, 24, 39, 0.96);
  backdrop-filter: blur(10px);
}

.sheet-total {
  span {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  strong {
    font-size: 20px;
    font-weight: 800;
  }
}

.sheet-submit-button {
  min-width: 132px;
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

.fade-enter-active,
.fade-leave-active,
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to,
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

@media (min-width: 768px) {
  .order-container {
    max-width: 560px;
    margin: 0 auto;
    padding-top: 20px;
  }
}
</style>
