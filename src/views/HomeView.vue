<template>
  <div class="user-entry-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>QR 입장은 모바일 환경에서만 진행할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="entry-container">
      <section class="entry-card">
        <div class="icon-wrap">📋</div>

        <p class="eyebrow">TABLE ENTRY</p>
        <h1>테이블 입장</h1>
        <p class="description">테이블 정보를 확인한 뒤 시작해주세요.</p>

        <div class="info-box">
          <div class="info-row">
            <span>테이블</span>
            <strong>{{ tableText }}</strong>
          </div>
          <div class="info-row">
            <span>표시명</span>
            <strong>{{ displayNameText }}</strong>
          </div>
        </div>

        <div v-if="entryErrorMessage" class="error-box">
          {{ entryErrorMessage }}
        </div>

        <button
          type="button"
          class="start-button"
          :disabled="!canStart || isPreparingEntry"
          @click="handleStart"
        >
          {{ isPreparingEntry ? "입장 준비 중..." : "시작하기" }}
        </button>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getOrCreateOpenOrderSheet } from "@/lib/orderSheet";

const router = useRouter();
const route = useRoute();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const isPreparingEntry = ref(false);
const entryErrorMessage = ref("");

const tableText = computed(() => {
  return tableNumber.value
    ? `${tableNumber.value}번 테이블`
    : "테이블 정보 없음";
});

const displayNameText = computed(() => {
  return displayName.value || "표시명 없음";
});

const canStart = computed(() => {
  return Boolean(tableNumber.value) && Boolean(displayName.value);
});

function detectMobile() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  isMobile.value =
    /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua) ||
    window.innerWidth <= 1024;
}

function resolveTableNumberFromRoute() {
  const queryTable = String(route.query.table || "").trim();
  const paramsTable = String(route.params.tableNumber || "").trim();

  const resolved = queryTable || paramsTable;

  if (!resolved) {
    return "";
  }

  return resolved.replace(/[^\d]/g, "");
}

function initializeEntryInfo() {
  const resolvedTableNumber = resolveTableNumberFromRoute();

  tableNumber.value = resolvedTableNumber;
  displayName.value = resolvedTableNumber ? `No.${resolvedTableNumber}` : "";
}

async function handleStart() {
  if (!canStart.value || isPreparingEntry.value) return;

  isPreparingEntry.value = true;
  entryErrorMessage.value = "";

  try {
    const result = await getOrCreateOpenOrderSheet(tableNumber.value);

    sessionStorage.setItem(
      "userEntryInfo",
      JSON.stringify({
        tableNumber: tableNumber.value,
        displayName: result.displayName,
        orderSheetId: result.orderSheetId,
        enteredAt: Date.now(),
      })
    );

    router.push("/user/main");
  } catch (error) {
    console.error("주문서 준비 실패:", error);
    entryErrorMessage.value =
      error?.message || "입장 준비 중 문제가 발생했어요.";
  } finally {
    isPreparingEntry.value = false;
  }
}

onMounted(() => {
  detectMobile();
  initializeEntryInfo();

  if (!tableNumber.value) {
    entryErrorMessage.value = "테이블 번호를 확인할 수 없어요.";
  }
});
</script>

<style scoped lang="scss">
.user-entry-view {
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

.entry-container {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
}

.entry-card {
  width: 100%;
  max-width: 520px;
  padding: 28px 20px 20px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.24);

  .icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    margin: 0 auto 16px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.12);
    font-size: 34px;
  }

  .eyebrow {
    margin: 0 0 8px;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.6);
  }

  h1 {
    margin: 0;
    text-align: center;
    font-size: 28px;
    font-weight: 800;
    line-height: 1.25;
  }

  .description {
    margin: 12px 0 20px;
    text-align: center;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.75);
  }
}

.info-box {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

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
  }
}

.error-box {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(252, 165, 165, 0.14);
  color: #fecaca;
  font-size: 13px;
  line-height: 1.6;
}

.start-button {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 16px;
  background: #ffffff;
  color: #111827;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
