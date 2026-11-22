<template>
  <div v-if="open" class="gift-sell-overlay" @click.self="emit('close')">
    <div class="gift-sell-modal">
      <div class="gift-sell-head">
        <h3>혼자야 기프티콘 판매</h3>
        <button type="button" class="close-button" @click="emit('close')">
          닫기
        </button>
      </div>

      <div class="gift-sell-body">
        <div class="field">
          <label>기프티콘 상품</label>
          <div v-if="loading" class="helper">상품을 불러오는 중이에요...</div>
          <div v-else-if="products.length === 0" class="helper">
            판매 중인 기프티콘 상품이 없어요. 관리자 페이지에서 먼저 만들어
            주세요.
          </div>
          <div v-else class="product-list">
            <button
              v-for="product in products"
              :key="product.id"
              type="button"
              class="product-item"
              :class="{ active: selectedProductId === product.id }"
              @click="selectProduct(product)"
            >
              <span class="product-name">{{ product.name }}</span>
              <span class="product-price">
                {{ formatGiftWon(product.price) }} 결제 → 액면가
                {{ formatGiftWon(product.faceValue) }}
              </span>
              <span class="product-rule">
                {{ describeGiftProduct(product) }}
              </span>
            </button>
          </div>
        </div>

        <div class="field">
          <label>받는 분</label>
          <div class="field-row">
            <input
              v-model.trim="recipientName"
              type="text"
              maxlength="40"
              placeholder="이름 (선택)"
            />
            <input
              :value="recipientPhoneInput"
              type="tel"
              inputmode="numeric"
              maxlength="13"
              placeholder="010-0000-0000"
              @input="onRecipientPhoneInput"
            />
          </div>
          <p class="helper">
            번호를 넣어야 문자로 바로 보낼 수 있어요. 비워두면 코드를 직접
            전달하면 됩니다.
          </p>
        </div>

        <div class="field">
          <label>메시지 (선택)</label>
          <textarea
            v-model="message"
            rows="3"
            :maxlength="messageMaxLength"
            placeholder="예: 생일 축하해! 오늘 한잔해 🍸"
          ></textarea>
        </div>

        <div class="field">
          <label>구매자 (선택)</label>
          <div class="field-row">
            <input
              v-model.trim="buyerName"
              type="text"
              maxlength="40"
              placeholder="이름"
            />
            <input
              :value="buyerPhoneInput"
              type="tel"
              inputmode="numeric"
              maxlength="13"
              placeholder="010-0000-0000"
              @input="onBuyerPhoneInput"
            />
          </div>
          <p class="helper">
            전화번호를 넣으면 회원으로 등록되어 판매 금액의 1%가 적립돼요.
          </p>
        </div>

        <div class="field">
          <label>결제 수단</label>
          <select v-model="paymentMethod">
            <option
              v-for="option in GIFT_PAYMENT_METHODS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <label class="check-row">
          <input v-model="sendBySms" type="checkbox" />
          <span>등록과 동시에 받는 분께 문자로 보내기</span>
        </label>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

        <div v-if="issuedGift" class="issued-box">
          <p class="issued-title">발급 완료</p>
          <p class="issued-code">{{ issuedGift.code }}</p>
          <p>
            {{ issuedGift.productName || issuedGift.kindLabel }} · 액면가
            {{ formatGiftWon(issuedGift.faceValue) }}
          </p>
          <p v-if="issuedGift.recipientName">
            받는 분 {{ issuedGift.recipientName }}
            <template v-if="issuedGift.recipientPhoneText">
              ({{ issuedGift.recipientPhoneText }})
            </template>
          </p>
          <p v-if="issuedGift.expiresAt">
            유효기간 {{ formatGiftDate(issuedGift.expiresAt) }}까지
          </p>
          <p
            v-if="Number(issuedGift.pointsEarned || 0) > 0"
            class="issued-points"
          >
            구매자 포인트
            {{ Number(issuedGift.pointsEarned).toLocaleString("ko-KR") }}P 적립
          </p>
          <p
            v-if="sendBySms && issuedGift.recipientPhoneText"
            class="issued-points"
          >
            문자 발송을 시도했어요. 실패했다면 다시 보내 주세요.
          </p>
          <div class="issued-actions">
            <button type="button" class="ghost-small" @click="copyLink">
              {{ copied ? "복사됨" : "링크 복사" }}
            </button>
            <button
              v-if="issuedGift.recipientPhoneText"
              type="button"
              class="ghost-small"
              :disabled="resending"
              @click="resend"
            >
              {{ resending ? "발송 중..." : "문자 다시 보내기" }}
            </button>
          </div>
        </div>
      </div>

      <div class="gift-sell-foot">
        <button type="button" class="ghost-button" @click="emit('close')">
          닫기
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="submitting || !selectedProductId"
          @click="submit"
        >
          {{
            submitting
              ? "등록 중..."
              : issuedGift
              ? "한 장 더 판매"
              : "판매 등록"
          }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";

import {
  GIFT_PAYMENT_METHODS,
  buildGiftLink,
  describeGiftProduct,
  fetchGiftProducts,
  formatGiftDate,
  formatGiftWon,
  issueGift,
  resendGift,
} from "@/lib/gifts";
import { formatPhoneInput, normalizePhoneNumber } from "@/lib/points";

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "issued"]);

const products = ref([]);
const loading = ref(false);
const submitting = ref(false);
const resending = ref(false);
const copied = ref(false);

const selectedProductId = ref("");
const paymentMethod = ref("CARD");
const recipientName = ref("");
const recipientPhoneInput = ref("");
const buyerName = ref("");
const buyerPhoneInput = ref("");
const message = ref("");
const sendBySms = ref(false);

const errorMessage = ref("");
const issuedGift = ref(null);

const selectedProduct = computed(() =>
  products.value.find((product) => product.id === selectedProductId.value)
);

const messageMaxLength = computed(() =>
  Math.min(
    500,
    Math.max(0, Number(selectedProduct.value?.messageMaxLength || 100))
  )
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;

    errorMessage.value = "";
    issuedGift.value = null;
    copied.value = false;
    message.value = "";

    loadProducts();
  },
  { immediate: true }
);

async function loadProducts() {
  loading.value = true;

  try {
    const result = await fetchGiftProducts();
    const list = Array.isArray(result?.products) ? result.products : [];

    products.value = list.filter((product) => product.isActive);

    if (
      !products.value.some((product) => product.id === selectedProductId.value)
    ) {
      selectProduct(products.value[0] || null);
    }
  } catch (error) {
    console.error("기프티콘 상품 조회 실패:", error);
    errorMessage.value = error?.message || "기프티콘 상품을 불러오지 못했어요.";
  } finally {
    loading.value = false;
  }
}

function selectProduct(product) {
  selectedProductId.value = product?.id || "";
  message.value = "";

  // 상품을 바꾸면 이미 발급한 결과는 접어 둡니다.
  issuedGift.value = null;
}

function onRecipientPhoneInput(event) {
  const formatted = formatPhoneInput(event.target.value);

  recipientPhoneInput.value = formatted;

  if (event.target.value !== formatted) {
    event.target.value = formatted;
  }

  if (normalizePhoneNumber(formatted)) {
    sendBySms.value = true;
  }
}

function onBuyerPhoneInput(event) {
  const formatted = formatPhoneInput(event.target.value);

  buyerPhoneInput.value = formatted;

  if (event.target.value !== formatted) {
    event.target.value = formatted;
  }
}

async function copyLink() {
  if (!issuedGift.value) return;

  const link = buildGiftLink(issuedGift.value.code);

  try {
    await navigator.clipboard.writeText(link);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    window.prompt("아래 링크를 복사해 주세요.", link);
  }
}

async function resend() {
  if (!issuedGift.value || resending.value) return;

  resending.value = true;

  try {
    await resendGift(issuedGift.value.id);
    alert("문자를 다시 보냈어요.");
  } catch (error) {
    alert(error?.message || "문자를 보내지 못했어요.");
  } finally {
    resending.value = false;
  }
}

async function submit() {
  if (submitting.value) return;

  if (!selectedProductId.value) {
    errorMessage.value = "기프티콘 상품을 선택해 주세요.";
    return;
  }

  const recipientPhone = normalizePhoneNumber(recipientPhoneInput.value);

  if (recipientPhoneInput.value && recipientPhone.length < 10) {
    errorMessage.value = "받는 분 전화번호를 정확히 입력해 주세요.";
    return;
  }

  if (sendBySms.value && !recipientPhone) {
    errorMessage.value = "문자로 보내려면 받는 분 전화번호가 필요해요.";
    return;
  }

  submitting.value = true;
  errorMessage.value = "";

  try {
    const result = await issueGift({
      productId: selectedProductId.value,
      buyerName: buyerName.value,
      buyerPhone: buyerPhoneInput.value,
      recipientName: recipientName.value,
      recipientPhone: recipientPhone,
      message: message.value,
      paymentMethod: paymentMethod.value,
      send: sendBySms.value,
      channel: "SMS",
    });

    issuedGift.value = result?.gift || null;
    message.value = "";
    emit("issued", result?.gift || null);
  } catch (error) {
    console.error("기프티콘 발급 실패:", error);
    errorMessage.value = error?.message || "기프티콘을 등록하지 못했어요.";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
.gift-sell-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 6, 20, 0.72);
  backdrop-filter: blur(6px);
}

.gift-sell-modal {
  width: min(560px, 100%);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #10142c;
  color: #e8ecff;
}

.gift-sell-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 22px 12px;

  h3 {
    margin: 0;
    font-size: 18px;
  }
}

.close-button {
  border: none;
  border-radius: 10px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5ff;
  cursor: pointer;
}

.gift-sell-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 22px 12px;
  display: grid;
  gap: 16px;
}

.field {
  display: grid;
  gap: 8px;

  label {
    font-size: 13px;
    color: rgba(226, 232, 255, 0.7);
  }

  input,
  select,
  textarea {
    width: 100%;
    padding: 11px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: #e8ecff;
    font-size: 14px;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
  }
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.helper {
  margin: 0;
  font-size: 12px;
  color: rgba(226, 232, 255, 0.55);
}

.product-list {
  display: grid;
  gap: 8px;
}

.product-item {
  display: grid;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;

  &.active {
    border-color: rgba(129, 140, 248, 0.9);
    background: rgba(99, 102, 241, 0.18);
  }
}

.product-name {
  font-weight: 600;
}

.product-price {
  font-size: 13px;
  color: #a5b4fc;
}

.product-rule {
  font-size: 12px;
  color: rgba(226, 232, 255, 0.55);
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(226, 232, 255, 0.75);

  input {
    width: 18px;
    height: 18px;
  }
}

.error-text {
  margin: 0;
  font-size: 13px;
  color: #fda4af;
}

.issued-box {
  padding: 14px;
  border-radius: 14px;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
  font-size: 13px;
  display: grid;
  gap: 4px;

  p {
    margin: 0;
  }
}

.issued-title {
  font-weight: 700;
  color: #86efac;
}

.issued-code {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
}

.issued-points {
  color: #86efac;
}

.issued-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.ghost-small {
  padding: 8px 12px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #dbeafe;
  font-size: 12px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.gift-sell-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ghost-button,
.primary-button {
  padding: 11px 18px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  cursor: pointer;
}

.ghost-button {
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5ff;
}

.primary-button {
  background: #c7d2fe;
  color: #1e1b4b;
  font-weight: 600;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
