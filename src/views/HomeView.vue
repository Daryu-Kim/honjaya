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
        <h1>{{ entryTitle }}</h1>
        <p class="description">{{ entryDescription }}</p>

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

        <div class="nickname-box">
          <label class="nickname-label" for="table-nickname-input">
            닉네임
          </label>
          <input
            id="table-nickname-input"
            v-model="tableNickname"
            type="text"
            class="nickname-input"
            placeholder="예: 홍길동, 생일팀"
            autocomplete="off"
          />
          <p class="nickname-helper">
            한글 8자, 영문·숫자 16자까지 입력할 수 있어요.
          </p>
          <p class="nickname-notice">
            비속어나 불쾌감을 주는 닉네임은 안내 없이 강제로 변경될 수 있어요.
          </p>
          <p v-if="nicknameErrorMessage" class="nickname-error">
            {{ nicknameErrorMessage }}
          </p>
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
          {{ startButtonText }}
        </button>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { runGlobalBusy } from "@/lib/globalBusy";
import {
  getActiveOrderSheetInfo,
  getOrCreateOpenOrderSheet,
  getTableNicknameErrorMessage,
  updateOrderSheetNickname,
} from "@/lib/orderSheet";

const router = useRouter();
const route = useRoute();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const tableNickname = ref("");
const isPreparingEntry = ref(false);
const entryErrorMessage = ref("");

const nicknameErrorMessage = computed(() => {
  return getTableNicknameErrorMessage(tableNickname.value);
});

const tableText = computed(() => {
  return tableNumber.value
    ? `${tableNumber.value}번 테이블`
    : "테이블 정보 없음";
});

const displayNameText = computed(() => {
  return displayName.value || "표시명 없음";
});

const canStart = computed(() => {
  return hasTableInfo.value && !nicknameErrorMessage.value;
});

const hasTableInfo = computed(() => {
  return Boolean(tableNumber.value) && Boolean(displayName.value);
});

const entryTitle = computed(() => {
  return hasTableInfo.value ? "테이블 입장" : "테이블 오더 카드가 필요해요";
});

const entryDescription = computed(() => {
  return hasTableInfo.value
    ? "테이블 정보를 확인한 뒤 시작해주세요."
    : "만료된 주문서이거나 테이블 정보가 없어요. 자리의 테이블 오더 카드를 다시 접촉해주세요.";
});

const startButtonText = computed(() => {
  if (isPreparingEntry.value) return "입장 준비 중...";
  return hasTableInfo.value
    ? "시작하기"
    : "테이블 오더 카드를 다시 접촉해주세요";
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

async function prefillTableNickname() {
  if (!tableNumber.value) return;

  try {
    const activeInfo = await getActiveOrderSheetInfo(tableNumber.value);

    if (activeInfo?.isReusable) {
      tableNickname.value = activeInfo.tableNickname || "";
    }
  } catch (error) {
    console.error("닉네임 정보 조회 실패:", error);
  }
}

async function handleStart() {
  if (!canStart.value || isPreparingEntry.value) return;

  await runGlobalBusy(async () => {
    isPreparingEntry.value = true;
    entryErrorMessage.value = "";

    try {
      const result = await getOrCreateOpenOrderSheet(tableNumber.value);

      const submittedNickname = tableNickname.value.trim();
      let savedNickname = result.tableNickname || "";

      if (submittedNickname && submittedNickname !== savedNickname) {
        savedNickname = await updateOrderSheetNickname({
          orderSheetId: result.orderSheetId,
          nickname: submittedNickname,
        });
      }

      sessionStorage.setItem(
        "userEntryInfo",
        JSON.stringify({
          tableNumber: tableNumber.value,
          displayName: result.displayName,
          orderSheetId: result.orderSheetId,
          tableNickname: savedNickname,
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
  }, "입장 정보를 준비하는 중이에요.");
}

onMounted(() => {
  detectMobile();
  initializeEntryInfo();
  prefillTableNickname();

  if (!tableNumber.value) {
    entryErrorMessage.value =
      "주문서가 만료되었거나 테이블 번호를 확인할 수 없어요. 테이블 오더 카드를 다시 접촉해주세요.";
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

.nickname-box {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.nickname-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.75);
}

.nickname-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.6);
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  outline: none;

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
  }

  &:focus {
    border-color: rgba(255, 255, 255, 0.4);
  }
}

.nickname-helper {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.6);
}

.nickname-notice {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(252, 211, 77, 0.85);
}

.nickname-error {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: #fca5a5;
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
