<template>
  <div class="gift-card-page" :class="`theme-${themeClass}`">
    <div class="gift-card-shell">
      <p class="gift-brand">혼자야 · HONJAYA</p>

      <div v-if="isLoading" class="state-box">
        <p>기프티콘을 확인하는 중이에요...</p>
      </div>

      <div v-else-if="loadError" class="state-box error">
        <p class="state-title">기프티콘을 확인할 수 없어요</p>
        <p class="state-sub">{{ loadError }}</p>
        <p class="state-sub">코드를 다시 확인해 주세요.</p>
      </div>

      <template v-else-if="gift">
        <p class="gift-theme">{{ gift.themeLabel }}</p>

        <div class="gift-card">
          <p class="gift-kind">{{ gift.kindLabel }}</p>
          <h1 class="gift-name">{{ gift.productName || gift.kindLabel }}</h1>

          <p class="gift-amount">{{ formatGiftWon(gift.faceValue) }}</p>

          <p v-if="gift.message" class="gift-message">“{{ gift.message }}”</p>

          <div class="gift-code-box">
            <span class="gift-code-label">사용 코드</span>
            <strong class="gift-code">{{ gift.code }}</strong>
            <button type="button" class="copy-button" @click="copyCode">
              {{ copied ? "복사됨" : "코드 복사" }}
            </button>
          </div>
        </div>

        <div class="gift-meta">
          <div class="meta-row">
            <span>상태</span>
            <strong :class="`status-${gift.status.toLowerCase()}`">
              {{ gift.statusLabel }}
            </strong>
          </div>
          <div v-if="gift.recipientName" class="meta-row">
            <span>받는 분</span>
            <strong>{{ gift.recipientName }}</strong>
          </div>
          <div v-if="gift.buyerName" class="meta-row">
            <span>보낸 분</span>
            <strong>{{ gift.buyerName }}</strong>
          </div>
          <div class="meta-row">
            <span>유효기간</span>
            <strong>
              {{
                gift.expiresAt
                  ? `${formatGiftDate(gift.expiresAt)}까지`
                  : "제한 없음"
              }}
            </strong>
          </div>
        </div>

        <p class="gift-usage">
          혼자야 매장에서 계산할 때 이 화면의 코드를 직원에게 보여 주세요.
          액면가보다 결제 금액이 적으면 남은 금액은 소멸돼요.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { fetchPublicGift, formatGiftDate, formatGiftWon } from "@/lib/gifts";

const route = useRoute();

const gift = ref(null);
const isLoading = ref(true);
const loadError = ref("");
const copied = ref(false);

const themeClass = computed(() => {
  const theme = String(gift.value?.theme || "SOLO_NIGHT").toLowerCase();

  return theme.replace(/_/g, "-");
});

async function loadGift() {
  const code = String(route.params.code || "").trim();

  if (!code) {
    isLoading.value = false;
    loadError.value = "주소에 기프티콘 코드가 없어요.";
    return;
  }

  isLoading.value = true;
  loadError.value = "";

  try {
    const result = await fetchPublicGift(code);

    gift.value = result?.gift || null;

    if (!gift.value) {
      loadError.value = "등록되지 않은 기프티콘 코드예요.";
    }
  } catch (error) {
    console.error("기프티콘 조회 실패:", error);
    gift.value = null;
    loadError.value = error?.message || "기프티콘을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function copyCode() {
  if (!gift.value) return;

  try {
    await navigator.clipboard.writeText(gift.value.code);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    window.prompt("아래 코드를 복사해 주세요.", gift.value.code);
  }
}

onMounted(loadGift);

watch(() => route.params.code, loadGift);
</script>

<style scoped lang="scss">
.gift-card-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: radial-gradient(circle at top, #1e1b4b 0%, #05060f 65%);
  color: #eef2ff;
}

.gift-card-page.theme-cheers {
  background: radial-gradient(circle at top, #3f1d2e 0%, #05060f 65%);
}

.gift-card-page.theme-birthday {
  background: radial-gradient(circle at top, #422006 0%, #05060f 65%);
}

.gift-card-page.theme-thanks {
  background: radial-gradient(circle at top, #0f2f2a 0%, #05060f 65%);
}

.gift-card-shell {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gift-brand {
  margin: 0;
  text-align: center;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.28em;
  color: rgba(238, 242, 255, 0.55);
}

.gift-theme {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: rgba(238, 242, 255, 0.7);
}

.gift-card {
  padding: 26px 22px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: linear-gradient(
    160deg,
    rgba(99, 102, 241, 0.28) 0%,
    rgba(15, 18, 40, 0.9) 60%
  );
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: center;
}

.gift-kind {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(238, 242, 255, 0.6);
}

.gift-name {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.3;
}

.gift-amount {
  margin: 0;
  font-size: 30px;
  font-weight: 800;
  color: #c7d2fe;
}

.gift-message {
  margin: 6px 0 0;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 14px;
  line-height: 1.5;
  color: rgba(238, 242, 255, 0.9);
  white-space: pre-wrap;
  word-break: break-word;
}

.gift-code-box {
  margin-top: 12px;
  padding-top: 16px;
  border-top: 1px dashed rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.gift-code-label {
  font-size: 11px;
  letter-spacing: 0.2em;
  color: rgba(238, 242, 255, 0.55);
}

.gift-code {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.copy-button {
  padding: 9px 16px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  color: #e0e7ff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.gift-meta {
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  display: grid;
  gap: 10px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;

  span {
    color: rgba(238, 242, 255, 0.6);
  }

  strong {
    font-weight: 700;
  }
}

.status-active {
  color: #6ee7b7;
}
.status-used {
  color: rgba(238, 242, 255, 0.6);
}
.status-expired,
.status-void {
  color: #fca5a5;
}

.gift-usage {
  margin: 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(238, 242, 255, 0.55);
}

.state-box {
  padding: 40px 20px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  text-align: center;
  font-size: 14px;
  color: rgba(238, 242, 255, 0.75);

  p {
    margin: 0;
  }

  &.error {
    border: 1px solid rgba(248, 113, 113, 0.4);
  }
}

.state-title {
  font-size: 16px;
  font-weight: 800;
  color: #fca5a5;
}

.state-sub {
  margin-top: 6px !important;
  font-size: 13px;
  color: rgba(238, 242, 255, 0.6);
}
</style>
