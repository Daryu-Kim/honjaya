<template>
  <div class="user-gift-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>이 서비스는 모바일 환경에서 이용할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="gift-container">
      <header class="gift-header">
        <button type="button" class="header-icon-button" @click="goBack">
          ←
        </button>
        <div class="gift-header-text">
          <p class="eyebrow">TABLE GIFT</p>
          <h1>선물 보내기</h1>
        </div>
        <div class="gift-total-pill">{{ formatPrice(giftTotalPrice) }}원</div>
      </header>

      <section v-if="giftRankingList.length > 0" class="ranking-card">
        <div class="ranking-head">
          <h2>🏆 오늘의 선물 랭킹</h2>
          <button
            type="button"
            class="ranking-refresh"
            @click="loadGiftRanking"
          >
            새로고침
          </button>
        </div>

        <ol class="ranking-list">
          <li
            v-for="item in giftRankingList.slice(0, 3)"
            :key="item.tableNumber"
            class="ranking-item"
            :class="{ mine: item.tableNumber === normalizedTableNumber }"
          >
            <span class="ranking-medal">
              {{ rankingMedals[item.rank - 1] }}
            </span>
            <span class="ranking-label">{{ item.label }}</span>
            <span class="ranking-price">
              {{ formatPrice(item.totalPrice) }}원
            </span>
          </li>
        </ol>

        <p class="ranking-notice">
          오늘 선물을 많이 보낸 테이블 순서예요. 우리 테이블도 올라가 보세요!
        </p>
      </section>

      <section class="step-section">
        <h2><span class="step-no">1</span> 선물할 테이블</h2>

        <div v-if="targetTableList.length > 0" class="table-chip-row">
          <button
            v-for="target in targetTableList"
            :key="target.tableNumber"
            type="button"
            class="table-chip"
            :class="{ active: target.tableNumber === targetTableNumber }"
            @click="selectTarget(target)"
          >
            {{ target.label }}
          </button>
        </div>
        <p v-else class="empty-text">
          지금 함께 이용 중인 테이블이 없어요. 다른 테이블이 입장하면 선물할 수
          있어요.
        </p>
      </section>

      <section class="step-section">
        <h2><span class="step-no">2</span> 보낼 메뉴</h2>

        <div class="category-chip-row">
          <button
            v-for="category in categoryTabList"
            :key="category.id"
            type="button"
            class="category-chip"
            :class="{ active: activeCategoryId === category.id }"
            @click="activeCategoryId = category.id"
          >
            {{ category.name }}
          </button>
        </div>

        <p v-if="isLoadingProducts" class="empty-text">
          메뉴를 불러오는 중이에요...
        </p>

        <div v-else class="product-grid">
          <article
            v-for="product in filteredProductList"
            :key="product.id"
            class="product-card"
            :class="{ soldout: isSoldOutProduct(product) }"
            @click="openProductOptionSheet(product)"
          >
            <div class="product-thumb">
              <img
                v-if="product.imageUrl"
                :src="product.imageUrl"
                :alt="product.productName"
              />
              <span v-else>🍽️</span>
            </div>
            <strong>{{ product.productName }}</strong>
            <span class="product-price"
              >{{ formatPrice(product.basePrice) }}원</span
            >
            <span v-if="isSoldOutProduct(product)" class="soldout-text"
              >품절</span
            >
          </article>
        </div>
      </section>

      <section v-if="giftItems.length > 0" class="step-section basket-section">
        <h2><span class="step-no">3</span> 선물 목록</h2>

        <article
          v-for="item in giftItems"
          :key="item.giftItemId"
          class="basket-item"
        >
          <div class="basket-item-main">
            <strong>{{ item.productName }}</strong>
            <p v-if="item.selectedOptions.length > 0" class="basket-options">
              {{
                item.selectedOptions
                  .map((option) => option.optionName)
                  .join(" · ")
              }}
            </p>
            <span class="basket-price"
              >{{ formatPrice(item.totalPrice) }}원</span
            >
          </div>

          <div class="basket-item-side">
            <div class="quantity-control">
              <button type="button" @click="decreaseItemQuantity(item)">
                −
              </button>
              <span>{{ item.quantity }}</span>
              <button type="button" @click="increaseItemQuantity(item)">
                +
              </button>
            </div>
            <button
              type="button"
              class="remove-button"
              @click="removeGiftItem(item)"
            >
              삭제
            </button>
          </div>
        </article>

        <input
          v-model="requestMessage"
          type="text"
          class="memo-input"
          placeholder="전할 메시지 (선택)"
          maxlength="60"
          autocomplete="off"
        />

        <div class="basket-total-row">
          <span>선물 금액 합계</span>
          <strong>{{ formatPrice(giftTotalPrice) }}원</strong>
        </div>
        <p class="basket-notice">
          선물 금액은 우리 테이블 주문서에 합산되고, 직원이 상대 테이블로
          가져다드려요.
        </p>

        <button
          type="button"
          class="send-button"
          :disabled="isSending || !canSendGift"
          @click="handleSendGift"
        >
          {{ isSending ? "보내는 중..." : "🎁 선물 보내기" }}
        </button>
      </section>

      <transition name="fade">
        <div
          v-if="selectedProduct"
          class="option-sheet-overlay"
          @click.self="closeProductOptionSheet"
        >
          <div class="option-sheet">
            <h3>{{ selectedProduct.productName }}</h3>
            <p class="option-sheet-price">
              기본 {{ formatPrice(selectedProduct.basePrice) }}원
            </p>

            <div
              v-for="group in sortedOptionGroups"
              :key="group.groupId"
              class="option-group"
            >
              <div class="option-group-title">
                <strong>{{ group.groupName }}</strong>
                <span v-if="group.isRequired" class="required-tag">필수</span>
              </div>

              <div class="option-list">
                <button
                  v-for="option in getActiveOptions(group)"
                  :key="option.optionId"
                  type="button"
                  class="option-button"
                  :class="{
                    active: isOptionSelected(group.groupId, option.optionId),
                  }"
                  :disabled="option.isSoldOut === true"
                  @click="toggleOption(group, option)"
                >
                  <span>{{ option.optionName }}</span>
                  <span>
                    {{
                      Number(option.additionalPrice || 0) > 0
                        ? `+${formatPrice(option.additionalPrice)}원`
                        : "+0원"
                    }}
                  </span>
                </button>
              </div>
            </div>

            <div class="option-quantity-row">
              <span>수량</span>
              <div class="quantity-control">
                <button type="button" @click="decreaseSheetQuantity">−</button>
                <span>{{ sheetQuantity }}</span>
                <button type="button" @click="increaseSheetQuantity">+</button>
              </div>
            </div>

            <p v-if="optionValidationMessage" class="option-error">
              {{ optionValidationMessage }}
            </p>

            <div class="option-sheet-footer">
              <strong>합계 {{ formatPrice(sheetTotalPrice) }}원</strong>
              <div class="option-sheet-actions">
                <button
                  type="button"
                  class="option-cancel-button"
                  @click="closeProductOptionSheet"
                >
                  취소
                </button>
                <button
                  type="button"
                  class="option-add-button"
                  @click="addSelectedProduct"
                >
                  선물 목록에 담기
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <transition name="fade">
        <div v-if="isDone" class="done-overlay">
          <div class="done-card">
            <p class="done-icon">🎁</p>
            <h2>선물을 보냈어요!</h2>
            <p class="done-message">{{ doneMessage }}</p>
            <div class="done-actions">
              <button type="button" @click="goChat">채팅 보기</button>
              <button type="button" @click="goMain">메인으로</button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fetchList, subscribeTable } from "@/lib/supabase";
import { normalizeTableNumber } from "@/lib/orderSheet";
import { runGlobalBusy } from "@/lib/globalBusy";
import { formatTableLabel } from "@/lib/chat";
import { fetchTodayGiftRanking, sendGiftOrder } from "@/lib/gift";

const route = useRoute();
const router = useRouter();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");
const tableNickname = ref("");

const targetTableList = ref([]);
const targetTableNumber = ref("");
const categoryList = ref([]);
const productList = ref([]);
const activeCategoryId = ref("");
const isLoadingProducts = ref(true);

const giftItems = ref([]);
const requestMessage = ref("");
const isSending = ref(false);
const isDone = ref(false);
const doneMessage = ref("");

const giftRankingList = ref([]);
const rankingMedals = ["🥇", "🥈", "🥉"];

const selectedProduct = ref(null);
const selectedOptionMap = ref({});
const sheetQuantity = ref(1);
const optionValidationMessage = ref("");

let unsubscribeProducts = null;
let unsubscribeCategories = null;
let unsubscribeTargets = null;
let unsubscribeRanking = null;

const normalizedTableNumber = computed(() =>
  normalizeTableNumber(tableNumber.value)
);

const categoryTabList = computed(() =>
  [...categoryList.value]
    .filter((item) => item.isActive !== false)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
);

function syncActiveCategory() {
  const firstCategoryId = categoryTabList.value[0]?.id || "";

  if (
    !categoryTabList.value.some((item) => item.id === activeCategoryId.value)
  ) {
    activeCategoryId.value = firstCategoryId;
  }
}

const filteredProductList = computed(() => {
  const sorted = [...productList.value].sort(
    (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)
  );

  if (!activeCategoryId.value) {
    return sorted;
  }

  return sorted.filter((product) =>
    getProductCategoryIds(product).includes(String(activeCategoryId.value))
  );
});

const giftTotalPrice = computed(() => {
  return giftItems.value.reduce(
    (total, item) => total + Number(item.totalPrice || 0),
    0
  );
});

const canSendGift = computed(() => {
  return Boolean(targetTableNumber.value) && giftItems.value.length > 0;
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
    (total, option) => total + Number(option.additionalPrice || 0),
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
    tableNickname.value = entryInfo.tableNickname || "";
  } catch (error) {
    tableNumber.value = "";
    displayName.value = "";
    orderSheetId.value = "";
    tableNickname.value = "";
  }
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

async function loadGiftRanking() {
  try {
    giftRankingList.value = await fetchTodayGiftRanking({ limit: 300 });
  } catch (error) {
    console.error("선물 랭킹 조회 실패:", error);
    giftRankingList.value = [];
  }
}

function isSoldOutProduct(product) {
  return product.isSoldOut === true || Number(product.stock ?? 0) <= 0;
}

function getProductCategoryIds(product) {
  if (Array.isArray(product.categoryIds) && product.categoryIds.length > 0) {
    return product.categoryIds.map((item) => String(item));
  }

  return product.categoryId ? [String(product.categoryId)] : [];
}

function getActiveOptions(group) {
  return [...(group.options || [])]
    .filter((item) => item.isActive !== false)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
}

function selectTarget(target) {
  targetTableNumber.value = target.tableNumber;
}

async function loadTargetTables() {
  const myTableNumber = normalizeTableNumber(tableNumber.value);

  if (!myTableNumber) {
    return;
  }

  try {
    const activeSheets = await fetchList("activeOrderSheets", {});
    const otherSheets = activeSheets.filter((sheet) => {
      return (
        normalizeTableNumber(sheet.tableNumber) !== myTableNumber &&
        sheet.orderSheetId
      );
    });

    const nicknameMap = {};

    if (otherSheets.length > 0) {
      const sheetRows = await fetchList("orderSheets", {
        filters: [["id", "in", otherSheets.map((sheet) => sheet.orderSheetId)]],
      });

      sheetRows.forEach((row) => {
        nicknameMap[row.orderSheetId] = row.tableNickname || "";
      });
    }

    targetTableList.value = otherSheets
      .map((sheet) => {
        const safeTableNumber = normalizeTableNumber(sheet.tableNumber);
        const nickname = nicknameMap[sheet.orderSheetId] || "";

        return {
          tableNumber: safeTableNumber,
          nickname,
          label: formatTableLabel(safeTableNumber, nickname),
        };
      })
      .filter((target) => target.tableNumber)
      .sort((a, b) => Number(a.tableNumber) - Number(b.tableNumber));

    const preselect = normalizeTableNumber(route.query.table);
    const stillExists = targetTableList.value.some(
      (target) => target.tableNumber === preselect
    );

    if (stillExists) {
      targetTableNumber.value = preselect;
    } else if (
      !targetTableList.value.some(
        (target) => target.tableNumber === targetTableNumber.value
      )
    ) {
      targetTableNumber.value =
        targetTableList.value.length === 1
          ? targetTableList.value[0].tableNumber
          : "";
    }
  } catch (error) {
    console.error("선물 대상 테이블 조회 실패:", error);
  }
}

function subscribeCategories() {
  const loadCategories = async () => {
    try {
      categoryList.value = await fetchList("categories", {
        order: ["sortOrder", "asc"],
      });
      syncActiveCategory();
    } catch (error) {
      console.error("카테고리 조회 실패:", error);
    }
  };

  unsubscribeCategories = subscribeTable("categories", loadCategories);
}

function subscribeProducts() {
  const loadProducts = async () => {
    try {
      productList.value = await fetchList("products", {
        filters: [["deletedAt", "is", null]],
        order: ["createdAt", "desc"],
      });
    } catch (error) {
      console.error("상품 조회 실패:", error);
    } finally {
      isLoadingProducts.value = false;
    }
  };

  unsubscribeProducts = subscribeTable("products", loadProducts);
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

function buildGiftItemKey(productId, selectedOptions) {
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

function addSelectedProduct() {
  if (!selectedProduct.value) return;
  if (!validateSelectedOptions()) return;

  const giftItem = {
    giftItemId: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    giftItemKey: buildGiftItemKey(
      selectedProduct.value.id,
      selectedOptionsFlat.value
    ),
    productId: selectedProduct.value.id,
    productName: selectedProduct.value.productName,
    basePrice: Number(selectedProduct.value.basePrice || 0),
    imageUrl: selectedProduct.value.imageUrl || "",
    quantity: Number(sheetQuantity.value || 1),
    selectedOptions: selectedOptionsFlat.value,
    unitPrice: sheetUnitPrice.value,
    totalPrice: sheetTotalPrice.value,
  };

  const foundIndex = giftItems.value.findIndex(
    (item) => item.giftItemKey === giftItem.giftItemKey
  );

  if (foundIndex > -1) {
    const found = giftItems.value[foundIndex];

    found.quantity += giftItem.quantity;
    found.totalPrice =
      Number(found.unitPrice || 0) * Number(found.quantity || 0);
  } else {
    giftItems.value.push(giftItem);
  }

  closeProductOptionSheet();
}

function increaseItemQuantity(item) {
  item.quantity += 1;
  item.totalPrice = Number(item.unitPrice || 0) * Number(item.quantity || 0);
}

function decreaseItemQuantity(item) {
  if (item.quantity <= 1) return;

  item.quantity -= 1;
  item.totalPrice = Number(item.unitPrice || 0) * Number(item.quantity || 0);
}

function removeGiftItem(item) {
  giftItems.value = giftItems.value.filter(
    (candidate) => candidate.giftItemId !== item.giftItemId
  );
}

function buildOrderItems() {
  return giftItems.value.map((item) => ({
    orderSheetId: orderSheetId.value,
    tableNumber: tableNumber.value,
    displayName: displayName.value,
    productId: item.productId,
    productName: item.productName,
    basePrice: Number(item.basePrice || 0),
    unitPrice: Number(item.unitPrice || 0),
    totalPrice: Number(item.totalPrice || 0),
    quantity: Number(item.quantity || 0),
    imageUrl: item.imageUrl || "",
    selectedOptions: item.selectedOptions.map((option) => ({
      groupId: option.groupId,
      groupName: option.groupName,
      optionId: option.optionId,
      optionName: option.optionName,
      additionalPrice: Number(option.additionalPrice || 0),
    })),
  }));
}

async function handleSendGift() {
  if (!canSendGift.value || isSending.value) return;

  const target = targetTableList.value.find(
    (candidate) => candidate.tableNumber === targetTableNumber.value
  );

  if (!target) {
    alert("선물할 테이블을 선택해주세요.");
    return;
  }

  const confirmed = window.confirm(
    `${target.label}에 ${formatPrice(
      giftTotalPrice.value
    )}원 상당의 선물을 보낼까요?\n선물 금액은 우리 테이블 주문서에 합산돼요.`
  );

  if (!confirmed) return;

  await runGlobalBusy(async () => {
    isSending.value = true;

    try {
      const result = await sendGiftOrder({
        orderSheetId: orderSheetId.value,
        fromTableNumber: tableNumber.value,
        fromNickname: tableNickname.value,
        fromDisplayName: displayName.value,
        toTableNumber: target.tableNumber,
        toNickname: target.nickname,
        items: buildOrderItems(),
        requestMessage: requestMessage.value,
      });

      doneMessage.value = `${target.label}에 ${result.summary} 선물을 보냈어요.`;
      isDone.value = true;
      giftItems.value = [];
      requestMessage.value = "";
      await loadGiftRanking();
    } catch (error) {
      console.error("선물 보내기 실패:", error);
      alert(error?.message || "선물을 보내지 못했어요. 다시 시도해주세요.");
    } finally {
      isSending.value = false;
    }
  }, "선물을 보내는 중이에요.");
}

function goBack() {
  router.push("/user/chat");
}

function goChat() {
  router.push("/user/chat");
}

function goMain() {
  router.push("/user/main");
}

onMounted(() => {
  detectMobile();
  loadEntryInfo();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
    return;
  }

  subscribeCategories();
  subscribeProducts();
  unsubscribeTargets = subscribeTable("activeOrderSheets", loadTargetTables, {
    pollMs: 60000,
  });
  unsubscribeRanking = subscribeTable("orders", loadGiftRanking, {
    pollMs: 60000,
  });
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

  if (unsubscribeTargets) {
    unsubscribeTargets();
    unsubscribeTargets = null;
  }

  if (unsubscribeRanking) {
    unsubscribeRanking();
    unsubscribeRanking = null;
  }
});
</script>

<style scoped lang="scss">
.user-gift-view {
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

.gift-container {
  min-height: 100dvh;
  padding: 14px 14px 28px;
}

.gift-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.header-icon-button {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: none;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
}

.gift-header-text {
  flex: 1;
  min-width: 0;

  .eyebrow {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.55);
  }

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
  }
}

.gift-total-pill {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(252, 211, 77, 0.16);
  color: #fde68a;
  font-size: 13px;
  font-weight: 800;
}

.ranking-card {
  margin-bottom: 20px;
  padding: 16px;
  border-radius: 20px;
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.16),
    rgba(255, 255, 255, 0.05)
  );
  border: 1px solid rgba(251, 191, 36, 0.28);
}

.ranking-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }
}

.ranking-refresh {
  height: 30px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.ranking-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.5);
  font-size: 13px;

  &.mine {
    background: rgba(251, 191, 36, 0.22);
    box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.5);
  }
}

.ranking-medal {
  font-size: 16px;
}

.ranking-label {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-price {
  font-weight: 800;
  color: #fde68a;
}

.ranking-notice {
  margin: 12px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.6);
}

.step-section {
  margin-bottom: 20px;

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 800;
  }
}

.step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 12px;
}

.table-chip-row,
.category-chip-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;

  &::-webkit-scrollbar {
    display: none;
  }
}

.table-chip,
.category-chip {
  flex-shrink: 0;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;

  &.active {
    background: #ffffff;
    border-color: #ffffff;
    color: #111827;
  }
}

.empty-text {
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.6);
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.product-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;

  &.soldout {
    opacity: 0.5;
    cursor: not-allowed;
  }

  strong {
    font-size: 14px;
    font-weight: 800;
  }
}

.product-thumb {
  height: 84px;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.product-price {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.75);
}

.soldout-text {
  position: absolute;
  top: 14px;
  right: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.85);
  font-size: 11px;
  font-weight: 800;
}

.basket-section {
  padding: 16px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.06);
}

.basket-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);

  &:first-of-type {
    padding-top: 0;
  }
}

.basket-item-main {
  min-width: 0;

  strong {
    display: block;
    font-size: 14px;
    font-weight: 800;
  }
}

.basket-options {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.basket-price {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  font-weight: 800;
  color: #fde68a;
}

.basket-item-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 8px;

  button {
    width: 30px;
    height: 30px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
  }

  span {
    min-width: 20px;
    text-align: center;
    font-size: 14px;
    font-weight: 800;
  }
}

.remove-button {
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.memo-input {
  width: 100%;
  height: 46px;
  margin-top: 14px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.75);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  outline: none;

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
  }
}

.basket-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  font-size: 14px;

  span {
    color: rgba(255, 255, 255, 0.7);
  }

  strong {
    font-size: 18px;
    font-weight: 800;
  }
}

.basket-notice {
  margin: 8px 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(252, 211, 77, 0.85);
}

.send-button {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 18px;
  background: #ffffff;
  color: #111827;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.option-sheet-overlay,
.done-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(2, 6, 23, 0.72);
}

.option-sheet {
  width: 100%;
  max-width: 460px;
  max-height: 86dvh;
  overflow-y: auto;
  padding: 20px;
  border-radius: 24px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.12);

  h3 {
    margin: 0 0 4px;
    font-size: 18px;
    font-weight: 800;
  }
}

.option-sheet-price {
  margin: 0 0 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
}

.option-group {
  margin-bottom: 16px;
}

.option-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;

  strong {
    font-size: 14px;
    font-weight: 800;
  }
}

.required-tag {
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(252, 211, 77, 0.2);
  color: #fde68a;
  font-size: 10px;
  font-weight: 800;
}

.option-list {
  display: grid;
  gap: 8px;
}

.option-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &.active {
    background: #ffffff;
    border-color: #ffffff;
    color: #111827;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.option-quantity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 14px;
  font-weight: 800;
}

.option-error {
  margin: 10px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: #fca5a5;
}

.option-sheet-footer {
  margin-top: 18px;

  strong {
    display: block;
    margin-bottom: 12px;
    font-size: 18px;
    font-weight: 800;
  }
}

.option-sheet-actions {
  display: flex;
  gap: 10px;
}

.option-cancel-button,
.option-add-button {
  flex: 1;
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

.option-cancel-button {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.option-add-button {
  background: #ffffff;
  color: #111827;
}

.done-card {
  width: 100%;
  max-width: 380px;
  padding: 26px 22px;
  border-radius: 24px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.12);
  text-align: center;

  h2 {
    margin: 8px 0 10px;
    font-size: 22px;
    font-weight: 800;
  }
}

.done-icon {
  margin: 0;
  font-size: 44px;
}

.done-message {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.75);
}

.done-actions {
  display: flex;
  gap: 10px;

  button {
    flex: 1;
    height: 48px;
    border: none;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;

    &:last-child {
      background: #ffffff;
      color: #111827;
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (min-width: 768px) {
  .gift-container {
    max-width: 560px;
    margin: 0 auto;
  }
}
</style>
