<template>
  <section v-if="isVisible" class="push-card">
    <div class="push-icon">🔔</div>
    <div class="push-body">
      <strong>채팅 알림</strong>
      <p class="push-description">{{ statusText }}</p>
      <p v-if="hintText" class="push-hint">{{ hintText }}</p>
    </div>
    <button
      v-if="isToggleVisible"
      type="button"
      class="push-toggle"
      :class="{ 'is-on': isEnabled }"
      :disabled="isBusy || isBlocked"
      @click="toggle"
    >
      {{ toggleLabel }}
    </button>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { normalizeTableNumber } from "@/lib/orderSheet";
import {
  disablePushNotifications,
  enablePushNotifications,
  getExistingSubscription,
  getPushSupport,
  syncPushSubscription,
} from "@/lib/webPush";

const ENTRY_STORAGE_KEY = "userEntryInfo";

const isSupported = ref(true);
const needsHomeScreen = ref(false);
const permission = ref("default");
const isSubscribed = ref(false);
const isBusy = ref(false);
const errorMessage = ref("");

function readTableNumber() {
  try {
    const entryInfo = JSON.parse(
      sessionStorage.getItem(ENTRY_STORAGE_KEY) || "{}"
    );

    return normalizeTableNumber(entryInfo.tableNumber);
  } catch (error) {
    console.warn("[push] failed to read entry info", error);

    return "";
  }
}

const isEnabled = computed(
  () => permission.value === "granted" && isSubscribed.value
);
const isBlocked = computed(() => permission.value === "denied");
const isVisible = computed(
  () => isSupported.value || needsHomeScreen.value || isBlocked.value
);
const isToggleVisible = computed(() => isSupported.value && !isBlocked.value);

const statusText = computed(() => {
  if (isBlocked.value) {
    return "브라우저에서 알림이 차단되어 있어요. 설정에서 허용해주세요.";
  }

  if (isEnabled.value) {
    return "새 채팅이 오면 알림으로 알려드려요.";
  }

  return "알림을 켜면 화면을 꺼도 새 채팅을 놓치지 않아요.";
});

const hintText = computed(() => {
  if (errorMessage.value) {
    return errorMessage.value;
  }

  if (needsHomeScreen.value) {
    return "아이폰은 공유 → 홈 화면에 추가 후 알림을 켤 수 있어요.";
  }

  if (!isSupported.value && !isBlocked.value) {
    return "이 브라우저는 알림을 지원하지 않아요.";
  }

  return "";
});

const toggleLabel = computed(() => {
  if (isBusy.value) {
    return "처리 중...";
  }

  return isEnabled.value ? "알림 끄기" : "알림 켜기";
});

async function refreshState() {
  const support = getPushSupport();

  isSupported.value = support.supported;
  needsHomeScreen.value = support.needsHomeScreen;
  permission.value = support.permission;

  if (!support.supported || support.permission !== "granted") {
    isSubscribed.value = false;

    return;
  }

  try {
    const subscription = await getExistingSubscription();
    isSubscribed.value = Boolean(subscription);
  } catch (error) {
    console.warn("[push] failed to read subscription", error);
    isSubscribed.value = false;
  }
}

async function toggle() {
  if (isBusy.value) {
    return;
  }

  const tableNumber = readTableNumber();

  if (!tableNumber) {
    errorMessage.value = "테이블 정보를 확인하지 못했어요.";

    return;
  }

  isBusy.value = true;
  errorMessage.value = "";

  try {
    if (isEnabled.value) {
      await disablePushNotifications();
    } else {
      await enablePushNotifications(tableNumber);
    }
  } catch (error) {
    errorMessage.value = error?.message || "알림 설정을 변경하지 못했어요.";
  } finally {
    await refreshState();
    isBusy.value = false;
  }
}

onMounted(async () => {
  await refreshState();

  const tableNumber = readTableNumber();

  if (isEnabled.value && tableNumber) {
    syncPushSubscription(tableNumber);
  }
});
</script>

<style scoped>
.push-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.push-icon {
  font-size: 22px;
  line-height: 1;
}

.push-body {
  flex: 1;
  min-width: 0;
}

.push-body strong {
  display: block;
  font-size: 15px;
  color: #ffffff;
}

.push-description {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.7);
}

.push-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(252, 211, 77, 0.9);
}

.push-toggle {
  flex-shrink: 0;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  background: transparent;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.push-toggle.is-on {
  border-color: #fcd34d;
  background: #fcd34d;
  color: #111827;
}

.push-toggle:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
