<template>
  <div class="admin-gift-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN GIFTICON</p>
        <h1>기프티콘 관리</h1>
        <p class="description">
          혼자야 기프티콘 상품을 만들고, 판매된 기프티콘의 사용·취소를 관리해요.
          기프티콘은 코드로 사용되고 액면가보다 적게 결제하면 차액은 소멸해요.
        </p>
      </div>
    </header>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">판매 금액</span>
        <strong>{{ formatGiftWon(summary.sold) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">사용 금액</span>
        <strong>-{{ formatGiftWon(summary.used) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">소멸 금액(차액)</span>
        <strong>{{ formatGiftWon(summary.forfeited) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">발급 건수</span>
        <strong>{{ summary.issuedCount }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">사용 가능</span>
        <strong>{{ summary.activeCount }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">미사용 액면가</span>
        <strong>{{ formatGiftWon(summary.liability) }}</strong>
      </article>
    </section>

    <section class="tab-row">
      <button
        type="button"
        class="tab-button"
        :class="{ active: activeTab === 'products' }"
        @click="activeTab = 'products'"
      >
        상품 설정
      </button>
      <button
        type="button"
        class="tab-button"
        :class="{ active: activeTab === 'issued' }"
        @click="switchToIssued"
      >
        발급 내역
      </button>
    </section>

    <!-- 상품 설정 -->
    <section v-if="activeTab === 'products'" class="panel">
      <div class="panel-head">
        <h2>기프티콘 상품</h2>
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
            :disabled="isLoadingProducts"
            @click="loadProducts"
          >
            새로고침
          </button>
        </div>
      </div>

      <p v-if="!canManage" class="notice-text">
        상품 설정은 사장 권한에서만 수정할 수 있어요.
      </p>
      <p v-if="productError" class="error-box">{{ productError }}</p>

      <div v-if="isLoadingProducts" class="empty-box">
        <p>상품을 불러오는 중이에요.</p>
      </div>
      <div v-else-if="productList.length === 0" class="empty-box">
        <p>등록된 기프티콘 상품이 없어요.</p>
      </div>
      <div v-else class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>상품</th>
              <th>종류</th>
              <th>액면가</th>
              <th>판매가</th>
              <th>유효기간</th>
              <th>테마</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in productList" :key="product.id">
              <td>
                {{ product.name }}
                <span v-if="product.productName" class="sub-text">
                  {{ product.productName }}
                </span>
              </td>
              <td>{{ product.kindLabel }}</td>
              <td>{{ formatGiftWon(product.faceValue) }}</td>
              <td>{{ formatGiftWon(product.price) }}</td>
              <td>
                {{
                  product.validityDays > 0
                    ? `${product.validityDays}일`
                    : "무제한"
                }}
              </td>
              <td>{{ product.themeLabel }}</td>
              <td>
                <span :class="product.isActive ? 'badge-on' : 'badge-off'">
                  {{ product.isActive ? "판매중" : "판매중지" }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="preset-button"
                  :disabled="!canManage"
                  @click="startEditProduct(product)"
                >
                  수정
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form
        v-if="canManage && productFormOpen"
        class="plan-form"
        @submit.prevent="submitProduct"
      >
        <h3>{{ productForm.id ? "상품 수정" : "새 상품" }}</h3>

        <div class="form-grid">
          <div class="filter-group">
            <label for="giftName">상품 이름</label>
            <input
              id="giftName"
              v-model.trim="productForm.name"
              type="text"
              maxlength="40"
              placeholder="예: 혼자야 하이볼 교환권"
            />
          </div>
          <div class="filter-group">
            <label for="giftKind">종류</label>
            <select id="giftKind" v-model="productForm.kind">
              <option
                v-for="option in GIFT_KINDS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
          <div v-if="productForm.kind === 'ITEM'" class="filter-group">
            <label for="giftMenu">교환 메뉴</label>
            <select id="giftMenu" @change="applyMenuToProductForm($event)">
              <option value="">메뉴 선택</option>
              <option v-for="menu in menuList" :key="menu.id" :value="menu.id">
                {{ menu.productName }}
              </option>
            </select>
          </div>
          <div v-if="productForm.kind === 'ITEM'" class="filter-group">
            <label for="giftProductName">교환 메뉴 이름</label>
            <input
              id="giftProductName"
              v-model.trim="productForm.productName"
              type="text"
              maxlength="40"
              placeholder="손님에게 보여 줄 메뉴 이름"
            />
          </div>
          <div class="filter-group">
            <label for="giftFaceValue">액면가(원)</label>
            <input
              id="giftFaceValue"
              v-model.number="productForm.faceValue"
              type="number"
              min="0"
              step="500"
            />
          </div>
          <div class="filter-group">
            <label for="giftPrice">판매가(실제 결제)</label>
            <input
              id="giftPrice"
              v-model.number="productForm.price"
              type="number"
              min="0"
              step="500"
            />
          </div>
          <div class="filter-group">
            <label for="giftValidity">유효기간(일, 0=무제한)</label>
            <input
              id="giftValidity"
              v-model.number="productForm.validityDays"
              type="number"
              min="0"
              max="3650"
            />
          </div>
          <div class="filter-group">
            <label for="giftTheme">테마</label>
            <select id="giftTheme" v-model="productForm.theme">
              <option
                v-for="option in GIFT_THEMES"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
          <div class="filter-group">
            <label for="giftMessageLength">메시지 최대 글자수</label>
            <input
              id="giftMessageLength"
              v-model.number="productForm.messageMaxLength"
              type="number"
              min="0"
              max="500"
            />
          </div>
          <div class="filter-group">
            <label for="giftSortOrder">정렬 순서</label>
            <input
              id="giftSortOrder"
              v-model.number="productForm.sortOrder"
              type="number"
              min="0"
            />
          </div>
        </div>

        <div class="check-row">
          <label class="check-item">
            <input v-model="productForm.isActive" type="checkbox" />
            <span>판매 중</span>
          </label>
        </div>

        <div class="filter-group">
          <label for="giftMemo">메모</label>
          <input
            id="giftMemo"
            v-model.trim="productForm.memo"
            type="text"
            maxlength="200"
          />
        </div>

        <p v-if="productFormMessage" class="adjust-message">
          {{ productFormMessage }}
        </p>

        <div class="filter-actions">
          <button
            type="submit"
            class="preset-button"
            :disabled="isSavingProduct"
          >
            {{ isSavingProduct ? "저장 중..." : "저장" }}
          </button>
          <button type="button" class="preset-button" @click="closeProductForm">
            취소
          </button>
        </div>
      </form>
    </section>

    <!-- 발급 내역 -->
    <section v-else class="panel">
      <div class="panel-head">
        <h2>발급 현황</h2>
        <div class="panel-actions">
          <button
            type="button"
            class="preset-button"
            :disabled="isLoadingGifts"
            @click="loadGifts"
          >
            새로고침
          </button>
        </div>
      </div>

      <div class="filter-grid">
        <div class="filter-group">
          <label for="giftCodeSearch">기프티콘 코드</label>
          <input
            id="giftCodeSearch"
            v-model.trim="giftFilters.code"
            type="text"
            maxlength="20"
            placeholder="예: G-ABCD2345"
            @keyup.enter="loadGifts"
          />
        </div>
        <div class="filter-group">
          <label for="giftPhoneSearch">구매자 전화번호</label>
          <input
            id="giftPhoneSearch"
            :value="giftPhoneInput"
            type="tel"
            inputmode="numeric"
            maxlength="13"
            placeholder="010-0000-0000"
            @input="onGiftPhoneInput"
            @keyup.enter="loadGifts"
          />
        </div>
        <div class="filter-group">
          <label for="giftStatus">상태</label>
          <select id="giftStatus" v-model="giftFilters.status">
            <option value="">전체</option>
            <option
              v-for="(label, value) in GIFT_STATUS_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </div>
        <div class="filter-group">
          <label for="giftFrom">시작일</label>
          <input id="giftFrom" v-model="giftFilters.from" type="date" />
        </div>
        <div class="filter-group">
          <label for="giftTo">종료일</label>
          <input id="giftTo" v-model="giftFilters.to" type="date" />
        </div>
      </div>

      <div class="filter-actions">
        <button
          type="button"
          class="preset-button"
          :disabled="isLoadingGifts"
          @click="loadGifts"
        >
          조회
        </button>
        <button type="button" class="preset-button" @click="resetGiftFilters">
          전체 기간
        </button>
      </div>

      <p v-if="giftError" class="error-box">{{ giftError }}</p>

      <div v-if="isLoadingGifts" class="empty-box">
        <p>기프티콘을 불러오는 중이에요.</p>
      </div>
      <div v-else-if="gifts.length === 0" class="empty-box">
        <p>기프티콘이 없어요.</p>
      </div>
      <div v-else class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>코드</th>
              <th>상품</th>
              <th>액면가</th>
              <th>판매가</th>
              <th>구매자</th>
              <th>받는 분</th>
              <th>상태</th>
              <th>유효기간</th>
              <th>발급일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="gift in gifts" :key="gift.id">
              <td class="code-cell">{{ gift.code }}</td>
              <td>
                {{ gift.productName || gift.kindLabel }}
                <span class="sub-text">{{ gift.kindLabel }}</span>
              </td>
              <td>{{ formatGiftWon(gift.faceValue) }}</td>
              <td>
                {{ formatGiftWon(gift.pricePaid) }}
                <span class="sub-text">
                  {{ getPaymentMethodLabel(gift.paymentMethod) }}
                </span>
              </td>
              <td>
                {{ gift.buyerName || "-" }}
                <span v-if="gift.buyerPhoneText" class="sub-text">
                  {{ gift.buyerPhoneText }}
                </span>
              </td>
              <td>
                {{ gift.recipientName || "-" }}
                <span v-if="gift.recipientPhoneText" class="sub-text">
                  {{ gift.recipientPhoneText }}
                </span>
              </td>
              <td>
                <span :class="statusClass(gift.status)">
                  {{ gift.statusLabel }}
                </span>
                <span v-if="gift.forfeitedAmount > 0" class="sub-text">
                  차액 {{ formatGiftWon(gift.forfeitedAmount) }} 소멸
                </span>
              </td>
              <td>
                {{ gift.expiresAt ? formatGiftDate(gift.expiresAt) : "무제한" }}
              </td>
              <td>{{ formatGiftDateTime(gift.purchasedAt) }}</td>
              <td class="action-cell">
                <button
                  type="button"
                  class="preset-button"
                  @click="copyGiftLink(gift)"
                >
                  링크
                </button>
                <button
                  type="button"
                  class="preset-button"
                  :disabled="!gift.recipientPhoneText"
                  @click="submitResend(gift)"
                >
                  재발송
                </button>
                <button
                  type="button"
                  class="danger-button"
                  :disabled="!canManage || gift.status !== 'ACTIVE'"
                  @click="submitVoid(gift)"
                >
                  취소
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="notice-text">
        사용된 기프티콘의 결제 내역은 결제 현황에서 확인할 수 있어요.
      </p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";

import {
  GIFT_KINDS,
  GIFT_STATUS_LABELS,
  GIFT_THEMES,
  buildGiftLink,
  createGiftProduct,
  fetchGiftProducts,
  fetchGiftSummary,
  fetchGifts,
  formatGiftDate,
  formatGiftDateTime,
  formatGiftWon,
  resendGift,
  updateGiftProduct,
  voidGift,
} from "@/lib/gifts";
import { formatPhoneInput, normalizePhoneNumber } from "@/lib/points";
import { getPaymentMethodLabel } from "@/lib/payments";
import { hasPermission } from "@/lib/staffAuth";
import { fetchList } from "@/lib/supabase";

const canManage = computed(() => hasPermission("gift.manage"));

const activeTab = ref("products");

const summary = ref({
  sold: 0,
  used: 0,
  forfeited: 0,
  issuedCount: 0,
  usedCount: 0,
  activeCount: 0,
  expiredCount: 0,
  voidedCount: 0,
  liability: 0,
});

const productList = ref([]);
const menuList = ref([]);
const isLoadingProducts = ref(false);
const productError = ref("");
const productFormOpen = ref(false);
const productFormMessage = ref("");
const isSavingProduct = ref(false);

function emptyProductForm() {
  return {
    id: "",
    name: "",
    kind: "AMOUNT",
    productId: "",
    productName: "",
    faceValue: 0,
    price: 0,
    validityDays: 90,
    theme: "SOLO_NIGHT",
    messageMaxLength: 100,
    isActive: true,
    sortOrder: 0,
    memo: "",
  };
}

const productForm = ref(emptyProductForm());

const gifts = ref([]);
const giftFilters = ref({ code: "", status: "", from: "", to: "" });
const giftPhoneInput = ref("");
const isLoadingGifts = ref(false);
const giftError = ref("");

function statusClass(status) {
  if (status === "ACTIVE") return "badge-on";
  if (status === "USED") return "badge-muted";

  return "badge-off";
}

function onGiftPhoneInput(event) {
  const formatted = formatPhoneInput(event.target.value);

  giftPhoneInput.value = formatted;

  if (event.target.value !== formatted) {
    event.target.value = formatted;
  }
}

async function loadSummary() {
  try {
    const result = await fetchGiftSummary();
    const totals = result?.totals || {};

    summary.value = {
      sold: Number(totals.sold || 0),
      used: Number(totals.used || 0),
      forfeited: Number(totals.forfeited || 0),
      issuedCount: Number(totals.issuedCount || 0),
      usedCount: Number(totals.usedCount || 0),
      activeCount: Number(totals.activeCount || 0),
      expiredCount: Number(totals.expiredCount || 0),
      voidedCount: Number(totals.voidedCount || 0),
      liability: Number(totals.liability || 0),
    };
  } catch (error) {
    console.error("기프티콘 요약 조회 실패:", error);
  }
}

async function loadProductList() {
  isLoadingProducts.value = true;
  productError.value = "";

  try {
    const result = await fetchGiftProducts({ includeInactive: true });

    productList.value = Array.isArray(result?.products) ? result.products : [];
  } catch (error) {
    console.error("기프티콘 상품 조회 실패:", error);
    productError.value = error?.message || "상품을 불러오지 못했어요.";
  } finally {
    isLoadingProducts.value = false;
  }
}

// 메뉴 교환권을 만들 때 액면가/판매가를 메뉴 가격으로 채우기 위해 사용합니다.
async function loadMenuList() {
  try {
    menuList.value = await fetchList("products", {
      filters: [["deletedAt", "is", null]],
      order: ["sortOrder", "asc"],
    });
  } catch (error) {
    console.error("메뉴 조회 실패:", error);
  }
}

function applyMenuToProductForm(event) {
  const menu = menuList.value.find((item) => item.id === event.target.value);

  if (!menu) return;

  productForm.value.productId = menu.id;
  productForm.value.productName = menu.productName || "";

  const price = Number(menu.price || 0);

  if (price > 0) {
    productForm.value.faceValue = price;

    if (!productForm.value.price) {
      productForm.value.price = price;
    }
  }

  if (!productForm.value.name) {
    productForm.value.name = `${menu.productName} 교환권`;
  }
}

function startCreateProduct() {
  productForm.value = emptyProductForm();
  productFormMessage.value = "";
  productFormOpen.value = true;
}

function startEditProduct(product) {
  productForm.value = {
    id: product.id,
    name: product.name,
    kind: product.kind,
    productId: product.productId,
    productName: product.productName,
    faceValue: product.faceValue,
    price: product.price,
    validityDays: product.validityDays,
    theme: product.theme,
    messageMaxLength: product.messageMaxLength,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
    memo: product.memo,
  };
  productFormMessage.value = "";
  productFormOpen.value = true;
}

function closeProductForm() {
  productFormOpen.value = false;
  productFormMessage.value = "";
  productForm.value = emptyProductForm();
}

async function submitProduct() {
  if (isSavingProduct.value) return;

  const payload = {
    name: productForm.value.name,
    kind: productForm.value.kind,
    productId:
      productForm.value.kind === "ITEM" ? productForm.value.productId : "",
    productName:
      productForm.value.kind === "ITEM" ? productForm.value.productName : "",
    faceValue: Number(productForm.value.faceValue || 0),
    price: Number(productForm.value.price || 0),
    validityDays: Number(productForm.value.validityDays || 0),
    theme: productForm.value.theme,
    messageMaxLength: Number(productForm.value.messageMaxLength || 0),
    isActive: productForm.value.isActive === true,
    sortOrder: Number(productForm.value.sortOrder || 0),
    memo: productForm.value.memo,
  };

  if (!payload.name) {
    productFormMessage.value = "상품 이름을 입력해 주세요.";
    return;
  }

  if (payload.faceValue <= 0) {
    productFormMessage.value = "액면가를 1원 이상 입력해 주세요.";
    return;
  }

  if (payload.price <= 0) {
    productFormMessage.value = "판매가를 1원 이상 입력해 주세요.";
    return;
  }

  if (payload.kind === "ITEM" && !payload.productName) {
    productFormMessage.value = "교환할 메뉴 이름을 입력해 주세요.";
    return;
  }

  isSavingProduct.value = true;
  productFormMessage.value = "";

  try {
    if (productForm.value.id) {
      await updateGiftProduct(productForm.value.id, payload);
    } else {
      await createGiftProduct(payload);
    }

    productFormMessage.value = "저장했어요.";
    productFormOpen.value = false;
    productForm.value = emptyProductForm();
    await loadProductList();
  } catch (error) {
    console.error("기프티콘 상품 저장 실패:", error);
    productFormMessage.value = error?.message || "상품을 저장하지 못했어요.";
  } finally {
    isSavingProduct.value = false;
  }
}

async function loadGifts() {
  isLoadingGifts.value = true;
  giftError.value = "";

  try {
    const result = await fetchGifts({
      code: giftFilters.value.code,
      phone: giftPhoneInput.value
        ? normalizePhoneNumber(giftPhoneInput.value)
        : "",
      status: giftFilters.value.status,
      from: giftFilters.value.from,
      to: giftFilters.value.to,
    });

    gifts.value = Array.isArray(result?.gifts) ? result.gifts : [];
  } catch (error) {
    console.error("기프티콘 목록 조회 실패:", error);
    giftError.value = error?.message || "기프티콘을 불러오지 못했어요.";
  } finally {
    isLoadingGifts.value = false;
  }
}

function resetGiftFilters() {
  giftFilters.value = { code: "", status: "", from: "", to: "" };
  giftPhoneInput.value = "";

  loadGifts();
}

function switchToIssued() {
  activeTab.value = "issued";

  if (gifts.value.length === 0) {
    loadGifts();
  }
}

async function copyGiftLink(gift) {
  const link = buildGiftLink(gift.code);

  try {
    await navigator.clipboard.writeText(link);
    alert(`링크를 복사했어요.\n${link}`);
  } catch {
    window.prompt("아래 링크를 복사해 주세요.", link);
  }
}

async function submitResend(gift) {
  try {
    await resendGift(gift.id);
    alert(`${gift.code} 기프티콘을 다시 보냈어요.`);
    await loadGifts();
  } catch (error) {
    console.error("기프티콘 재발송 실패:", error);
    alert(error?.message || "기프티콘을 다시 보내지 못했어요.");
  }
}

async function submitVoid(gift) {
  const reason = window.prompt(
    `${gift.code} 기프티콘을 취소할까요?\n사유를 입력해 주세요.`,
    "관리자 취소"
  );

  if (reason === null) return;

  try {
    await voidGift({ giftId: gift.id, reason });
    await Promise.all([loadGifts(), loadSummary()]);
  } catch (error) {
    console.error("기프티콘 취소 실패:", error);
    alert(error?.message || "기프티콘을 취소하지 못했어요.");
  }
}

onMounted(() => {
  loadSummary();
  loadProductList();
  loadMenuList();
});
</script>

<style scoped lang="scss">
.admin-gift-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
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
  color: #ffffff;
}
.description {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}
.summary-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.66);
}
.summary-card strong {
  font-size: 20px;
  font-weight: 800;
  color: #ffffff;
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
}
.tab-button.active {
  background: rgba(99, 102, 241, 0.24);
  color: #c7d2fe;
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
}
.panel-head h2,
.panel-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #ffffff;
}
.panel-actions {
  display: flex;
  gap: 8px;
}
.filter-grid,
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filter-group label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}
.filter-group input,
.filter-group select {
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}
.filter-group ::placeholder {
  color: rgba(255, 255, 255, 0.4);
}
.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset-button,
.danger-button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.danger-button {
  background: rgba(248, 113, 113, 0.18);
  color: #fca5a5;
}
.preset-button:disabled,
.danger-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.check-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.check-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}
.table-wrap {
  overflow-x: auto;
}
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.admin-table th,
.admin-table td {
  padding: 10px 12px;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.admin-table th {
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.05);
}
.sub-text {
  margin-left: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
}
.code-cell {
  font-family: "SFMono-Regular", Consolas, monospace;
  letter-spacing: 0.08em;
  color: #c7d2fe;
}
.action-cell {
  display: flex;
  gap: 6px;
}
.badge-on,
.badge-off,
.badge-muted {
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
}
.badge-on {
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
}
.badge-off {
  background: rgba(248, 113, 113, 0.18);
  color: #fca5a5;
}
.badge-muted {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.66);
}
.plan-form {
  margin-top: 6px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.plan-form h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
}
.notice-text {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.66);
}
.adjust-message {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #c7d2fe;
}
.error-box {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
  font-size: 13px;
  font-weight: 700;
}
.empty-box {
  padding: 28px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  text-align: center;
  color: rgba(255, 255, 255, 0.66);
  font-size: 14px;
}
</style>
