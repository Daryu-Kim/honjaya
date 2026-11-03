<template>
  <div
    v-if="alerts.length > 0"
    class="chat-alert-stack"
    role="status"
    aria-live="polite"
  >
    <div
      v-for="alert in alerts"
      :key="alert.id"
      class="chat-alert-card"
      role="button"
      tabindex="0"
      @click="openChat"
      @keyup.enter="openChat"
    >
      <span class="chat-alert-icon" aria-hidden="true">{{ alert.icon }}</span>
      <span class="chat-alert-body">
        <strong class="chat-alert-title">{{ alert.title }}</strong>
        <span class="chat-alert-preview">{{ alert.preview }}</span>
      </span>
      <button
        type="button"
        class="chat-alert-close"
        aria-label="알림 닫기"
        @click.stop="dismissAlert(alert.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { alertList, dismissAlert } from "@/lib/chatAlerts";

const router = useRouter();
const alerts = computed(() => alertList.value);

function openChat() {
  alertList.value.map((alert) => alert.id).forEach(dismissAlert);

  if (router.currentRoute.value.path !== "/user/chat") {
    router.push("/user/chat");
  }
}
</script>

<style scoped>
.chat-alert-stack {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  z-index: 9000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.chat-alert-card {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 18px;
  background: rgba(20, 22, 30, 0.94);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.4);
  color: #fff;
  text-align: left;
  cursor: pointer;
  animation: chat-alert-in 0.24s ease-out;
}

.chat-alert-icon {
  flex-shrink: 0;
  font-size: 22px;
  line-height: 1;
}

.chat-alert-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.chat-alert-title {
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-alert-preview {
  font-size: 13px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.78);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-alert-close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.75);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

@keyframes chat-alert-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
