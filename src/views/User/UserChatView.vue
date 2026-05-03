<template>
  <div class="user-chat-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>채팅 기능은 모바일 환경에서만 사용할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="chat-container">
      <header class="chat-header">
        <div class="header-top">
          <button type="button" class="back-button" @click="goBack">←</button>

          <div class="header-title">
            <p class="eyebrow">GLOBAL CHAT</p>
            <h1>전체 채팅</h1>
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
      </header>

      <section ref="messageSectionRef" class="message-section">
        <div v-if="isLoadingMessages" class="empty-box">
          <p>채팅을 불러오는 중이에요.</p>
        </div>

        <div v-else-if="messageList.length === 0" class="empty-box">
          <p>아직 채팅이 없어요. 첫 메시지를 남겨보세요.</p>
        </div>

        <div v-else class="message-list">
          <div
            v-for="message in messageList"
            :key="message.id"
            class="message-row"
            :class="getMessageRowClass(message)"
          >
            <div v-if="message.messageType === 'SYSTEM'" class="system-message">
              <p>{{ message.message }}</p>
              <span>{{ formatDateTime(message.createdAt) }}</span>
            </div>

            <template v-else>
              <div class="message-meta">
                <span class="sender-label">
                  {{ buildSenderLabel(message) }}
                </span>
                <span
                  class="message-type"
                  :class="String(message.messageType || '').toLowerCase()"
                >
                  {{ convertMessageTypeText(message.messageType) }}
                </span>
              </div>

              <div class="message-bubble">
                <p>{{ message.message }}</p>
              </div>

              <div class="message-time">
                {{ formatDateTime(message.createdAt) }}
              </div>
            </template>
          </div>
        </div>
      </section>

      <section class="input-section">
        <div class="input-card">
          <textarea
            v-model.trim="messageText"
            placeholder="전체 채팅에 메시지를 입력해주세요"
            maxlength="300"
            @keydown.enter.exact.prevent="handleSend"
          ></textarea>

          <div class="input-bottom">
            <p class="helper-text">
              모든 테이블과 직원이 함께 보는 채팅방이에요.
            </p>

            <button
              type="button"
              class="send-button"
              :disabled="!canSend || isSending"
              @click="handleSend"
            >
              {{ isSending ? "전송중..." : "전송" }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const router = useRouter();

const messageSectionRef = ref(null);

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");

const isLoadingMessages = ref(true);
const isSending = ref(false);
const messageText = ref("");
const messageList = ref([]);

let unsubscribeMessages = null;

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

const canSend = computed(() => {
  return Boolean(messageText.value.trim());
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

function subscribeMessages() {
  const messagesQuery = query(
    collection(db, "chatMessages"),
    orderBy("createdAt", "asc"),
    limit(300)
  );

  unsubscribeMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      messageList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      isLoadingMessages.value = false;
      scrollToBottom();
    },
    (error) => {
      console.error("채팅 조회 실패:", error);
      isLoadingMessages.value = false;
    }
  );
}

function convertToDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value) {
  const date = convertToDate(value);
  if (!date) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}.${day} ${hours}:${minutes}`;
}

function convertMessageTypeText(messageType) {
  if (messageType === "USER") return "유저";
  if (messageType === "ADMIN") return "직원";
  if (messageType === "SYSTEM") return "시스템";
  return messageType || "알 수 없음";
}

function buildSenderLabel(message) {
  if (message.messageType === "ADMIN") {
    return message.senderLabel || "직원";
  }

  if (message.messageType === "SYSTEM") {
    return "시스템";
  }

  if (message.displayName) {
    return message.displayName;
  }

  if (message.tableNumber) {
    return `No.${message.tableNumber}`;
  }

  return "알 수 없음";
}

function isMyMessage(message) {
  return (
    message.messageType === "USER" &&
    String(message.orderSheetId || "") === String(orderSheetId.value || "") &&
    String(message.displayName || "") === String(displayName.value || "") &&
    String(message.tableNumber || "") === String(tableNumber.value || "")
  );
}

function getMessageRowClass(message) {
  if (message.messageType === "SYSTEM") return "system";
  if (message.messageType === "ADMIN") return "admin";
  if (isMyMessage(message)) return "mine";
  return "user";
}

function scrollToBottom() {
  nextTick(() => {
    const el = messageSectionRef.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
}

async function handleSend() {
  if (!canSend.value || isSending.value) return;
  if (!tableNumber.value || !displayName.value || !orderSheetId.value) return;

  const safeMessage = messageText.value.trim().slice(0, 300);
  if (!safeMessage) return;

  isSending.value = true;

  try {
    await addDoc(collection(db, "chatMessages"), {
      orderSheetId: orderSheetId.value,
      message: safeMessage,
      messageType: "USER",
      tableNumber: tableNumber.value,
      displayName: displayName.value,
      senderLabel: displayName.value,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    });

    messageText.value = "";
  } catch (error) {
    console.error("메시지 전송 실패:", error);
    alert("메시지 전송 중 문제가 발생했어요.");
  } finally {
    isSending.value = false;
  }
}

function goBack() {
  router.push("/user/main");
}

watch(
  () => messageList.value.length,
  () => {
    scrollToBottom();
  }
);

onMounted(() => {
  detectMobile();
  loadEntryInfo();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
    return;
  }

  subscribeMessages();
});

onUnmounted(() => {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
});
</script>

<style scoped lang="scss">
.user-chat-view {
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

.chat-container {
  min-height: 100dvh;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.chat-header {
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

.session-card,
.message-section,
.input-card,
.empty-box {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.session-card {
  padding: 16px;

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
      font-size: 15px;
      font-weight: 800;
      text-align: right;
      word-break: break-all;
    }
  }
}

.message-section {
  flex: 1;
  min-height: 0;
  max-height: calc(
    100dvh - 280px
  ); /* 헤더(약 120px) + 입력창(약 120px) + 여백 고려 */
  padding: 16px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.empty-box {
  padding: 28px 16px;
  text-align: center;

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.message-row {
  display: flex;
  flex-direction: column;

  &.mine {
    align-items: flex-end;

    .message-bubble {
      background: rgba(96, 165, 250, 0.2);
    }

    .message-meta,
    .message-time {
      text-align: right;
    }
  }

  &.user {
    align-items: flex-start;

    .message-bubble {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  &.admin {
    align-items: flex-start;

    .message-bubble {
      background: rgba(52, 211, 153, 0.16);
    }
  }

  &.system {
    align-items: center;
  }
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.sender-label {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.84);
}

.message-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;

  &.user {
    background: rgba(96, 165, 250, 0.18);
    color: #bfdbfe;
  }

  &.admin {
    background: rgba(52, 211, 153, 0.18);
    color: #a7f3d0;
  }

  &.system {
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.88);
  }
}

.message-bubble {
  max-width: 85%;
  padding: 12px 14px;
  border-radius: 18px;

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.message-time {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.48);
}

.system-message {
  display: inline-flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);

  p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    text-align: center;
    line-height: 1.6;
  }

  span {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.48);
  }
}

.input-section {
  margin-top: auto;
}

.input-card {
  padding: 14px;

  textarea {
    width: 100%;
    min-height: 96px;
    resize: none;
    border: none;
    outline: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    padding: 14px;
    font-size: 14px;
    line-height: 1.6;

    &::placeholder {
      color: rgba(255, 255, 255, 0.45);
    }
  }
}

.input-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.helper-text {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.58);
}

.send-button {
  flex-shrink: 0;
  min-width: 84px;
  height: 42px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: #ffffff;
  color: #111827;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

@media (min-width: 768px) {
  .chat-container {
    max-width: 560px;
    margin: 0 auto;
    padding-top: 20px;
  }
}
</style>
