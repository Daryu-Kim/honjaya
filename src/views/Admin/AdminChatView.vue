<template>
  <div class="admin-chat-view">
    <header class="chat-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN CHAT</p>
        <h1>전체 채팅 관리</h1>
        <p class="description">전체 테이블과 직원이 함께 보는 채팅방입니다.</p>
      </div>

      <div class="header-right">
        <div class="status-card">
          <span class="label">총 메시지</span>
          <strong>{{ messageList.length }}개</strong>
        </div>
      </div>
    </header>

    <section class="chat-layout">
      <aside class="chat-sidebar">
        <div class="sidebar-card">
          <h2>필터</h2>

          <div class="filter-group">
            <label>메시지 유형</label>
            <select v-model="selectedType">
              <option value="ALL">전체</option>
              <option value="USER">유저</option>
              <option value="ADMIN">직원</option>
              <option value="SYSTEM">시스템</option>
            </select>
          </div>

          <div class="filter-group">
            <label>검색</label>
            <input
              v-model.trim="searchText"
              type="text"
              placeholder="메시지, 닉네임, 테이블 검색"
            />
          </div>
        </div>
      </aside>

      <main class="chat-main">
        <section ref="messageSectionRef" class="message-section">
          <div v-if="isLoadingMessages" class="empty-box">
            <h2>채팅을 불러오는 중이에요</h2>
            <p>잠시만 기다려주세요.</p>
          </div>

          <div v-else-if="filteredMessageList.length === 0" class="empty-box">
            <h2>표시할 메시지가 없어요</h2>
            <p>필터를 바꾸거나 새로운 메시지를 기다려주세요.</p>
          </div>

          <div v-else class="message-list">
            <div
              v-for="message in filteredMessageList"
              :key="message.id"
              class="message-row"
              :class="message.messageType.toLowerCase()"
            >
              <div
                v-if="message.messageType === 'SYSTEM'"
                class="system-message"
              >
                <p>{{ message.message }}</p>
                <span>{{ formatDateTime(message.createdAt) }}</span>
              </div>

              <template v-else>
                <div class="message-meta">
                  <span class="sender-label">
                    {{ message.senderLabel || buildSenderLabel(message) }}
                  </span>
                  <span
                    class="message-type"
                    :class="message.messageType.toLowerCase()"
                  >
                    {{ message.messageType }}
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
              placeholder="전체 채팅에 직원 메시지를 입력해주세요"
              maxlength="500"
              @keydown.enter.exact.prevent="handleSend"
            ></textarea>

            <div class="input-bottom">
              <p class="helper-text">
                이 메시지는 전체 채팅방에 직원 메시지로 표시됩니다.
              </p>

              <button
                type="button"
                class="send-button"
                :disabled="!canSend || isSending"
                @click="handleSend"
              >
                {{ isSending ? "전송중..." : "직원 메시지 전송" }}
              </button>
            </div>
          </div>
        </section>
      </main>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
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
import { runGlobalBusy } from "@/lib/globalBusy";

const messageSectionRef = ref(null);

const isLoadingMessages = ref(true);
const isSending = ref(false);
const messageText = ref("");
const searchText = ref("");
const selectedType = ref("ALL");

const messageList = ref([]);

let unsubscribeMessages = null;

const canSend = computed(() => {
  return Boolean(messageText.value.trim());
});

const filteredMessageList = computed(() => {
  const keyword = searchText.value.toLowerCase();

  return messageList.value.filter((item) => {
    const matchType =
      selectedType.value === "ALL" || item.messageType === selectedType.value;

    const matchKeyword =
      !keyword ||
      String(item.message || "")
        .toLowerCase()
        .includes(keyword) ||
      String(item.senderLabel || "")
        .toLowerCase()
        .includes(keyword) ||
      String(item.nickname || "")
        .toLowerCase()
        .includes(keyword) ||
      String(item.tableNumber || "")
        .toLowerCase()
        .includes(keyword);

    return matchType && matchKeyword;
  });
});

function buildSenderLabel(message) {
  if (message.messageType === "ADMIN") {
    return message.senderLabel || "직원";
  }

  if (message.tableNumber && message.nickname) {
    return `${message.tableNumber}번 테이블 · ${message.nickname}`;
  }

  if (message.tableNumber) {
    return `${message.tableNumber}번 테이블`;
  }

  return message.nickname || "알 수 없음";
}

function formatDateTime(value) {
  if (!value) return "";

  const date =
    typeof value?.toDate === "function" ? value.toDate() : new Date(value);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}.${day} ${hours}:${minutes}`;
}

function scrollToBottom() {
  nextTick(() => {
    const el = messageSectionRef.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
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
      console.error("관리자 채팅 조회 실패:", error);
      isLoadingMessages.value = false;
    }
  );
}

async function handleSend() {
  if (!canSend.value || isSending.value) return;

  const safeMessage = messageText.value.trim().slice(0, 500);
  if (!safeMessage) return;

  await runGlobalBusy(async () => {
    isSending.value = true;

    try {
      await addDoc(collection(db, "chatMessages"), {
        message: safeMessage,
        messageType: "ADMIN",
        tableNumber: "",
        nickname: "",
        senderLabel: "직원",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
      });

      messageText.value = "";
    } catch (error) {
      console.error("직원 메시지 전송 실패:", error);
      alert("메시지 전송 중 문제가 발생했어요.");
    } finally {
      isSending.value = false;
    }
  }, "메시지를 전송하는 중이에요.");
}

watch(
  () => messageList.value.length,
  () => {
    scrollToBottom();
  }
);

onMounted(() => {
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
.admin-chat-view {
  min-height: 100%;
  padding: 24px;
  color: #fff;
}

.chat-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;

  .eyebrow {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.55);
  }

  h1 {
    margin: 0 0 8px;
    font-size: 30px;
    font-weight: 800;
  }

  .description {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.status-card {
  min-width: 160px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);

  .label {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }

  strong {
    font-size: 24px;
    font-weight: 800;
  }
}

.chat-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  min-height: calc(100% - 180px);
}

.sidebar-card,
.input-card,
.message-section {
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
}

.sidebar-card {
  padding: 18px;

  h2 {
    margin: 0 0 16px;
    font-size: 20px;
    font-weight: 800;
  }
}

.filter-group {
  &:not(:last-child) {
    margin-bottom: 16px;
  }

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.72);
  }

  input,
  select {
    width: 100%;
    height: 44px;
    padding: 0 14px;
    border: none;
    outline: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;
  }
}

.chat-main {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 16px;
}

.message-section {
  overflow-y: auto;
  padding: 18px;
  min-height: 0;
}

.empty-box {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  h2 {
    margin: 0 0 10px;
    font-size: 24px;
    font-weight: 800;
  }

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
  &.user .message-bubble {
    background: rgba(96, 165, 250, 0.18);
  }

  &.admin .message-bubble {
    background: rgba(255, 255, 255, 0.12);
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
  color: rgba(255, 255, 255, 0.82);
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
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.88);
  }

  &.system {
    background: rgba(52, 211, 153, 0.18);
    color: #a7f3d0;
  }
}

.message-bubble {
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
  }

  span {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.48);
  }
}

.input-card {
  padding: 16px;

  textarea {
    width: 100%;
    min-height: 110px;
    resize: none;
    border: none;
    outline: none;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    padding: 14px;
    font-size: 14px;
    line-height: 1.6;
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
  min-width: 150px;
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 14px;
  background: #fff;
  color: #111827;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

@media (max-width: 1024px) {
  .chat-layout {
    grid-template-columns: 1fr;
  }

  .chat-main {
    grid-template-rows: 520px auto;
  }
}
</style>
