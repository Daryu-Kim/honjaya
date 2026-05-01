<template>
  <div class="projector-view">
    <div class="main-layout">
      <div class="left-panel">
        <div class="video-section">
          <video class="main-video" src="" controls autoplay loop muted></video>
        </div>

        <div class="notice-section">
          <div class="notice-marquee-wrap">
            <div class="notice-marquee-track">
              <div class="notice-marquee-content">
                <span
                  v-for="(notice, index) in noticeTextListForRender"
                  :key="`notice-a-${index}`"
                  class="notice-item"
                >
                  {{ notice }}
                </span>
              </div>

              <div class="notice-marquee-content clone">
                <span
                  v-for="(notice, index) in noticeTextListForRender"
                  :key="`notice-b-${index}`"
                  class="notice-item"
                >
                  {{ notice }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="right-panel">
        <section class="side-card chat-card">
          <div class="side-head">
            <h2>실시간 채팅</h2>
            <span>{{ recentChatList.length }}개</span>
          </div>

          <div v-if="isLoadingMessages" class="side-empty">
            <p>채팅을 불러오는 중이에요.</p>
          </div>

          <div v-else-if="recentChatList.length === 0" class="side-empty">
            <p>최근 채팅이 없어요.</p>
          </div>

          <div v-else class="chat-list">
            <div
              v-for="message in recentChatList.slice(0, 20)"
              :key="message.id"
              class="chat-row"
              :class="String(message.messageType || '').toLowerCase()"
            >
              <div class="chat-meta">
                <strong>{{ buildChatSender(message) }}</strong>
                <span>{{ formatDateTime(message.createdAt) }}</span>
              </div>
              <p>{{ message.message }}</p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const chatMessageList = ref([]);
const noticeList = ref([]);

const isLoadingMessages = ref(true);
const isLoadingNotices = ref(true);

let unsubscribeMessages = null;
let unsubscribeNotices = null;

const recentChatList = computed(() => {
  return [...chatMessageList.value].sort((a, b) => {
    const aTime =
      typeof a.createdAt?.toDate === "function"
        ? a.createdAt.toDate().getTime()
        : 0;
    const bTime =
      typeof b.createdAt?.toDate === "function"
        ? b.createdAt.toDate().getTime()
        : 0;

    return bTime - aTime;
  });
});

const noticeTextListForRender = computed(() => {
  const activeNotices = [...noticeList.value]
    .filter((item) => item.isActive !== false)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
    .map((item) => String(item.content || "").trim())
    .filter(Boolean);

  if (activeNotices.length > 0) {
    return activeNotices;
  }

  return [
    "직원 호출은 채팅 또는 결제 요청 기능을 이용해주세요.",
    "과도한 음주와 타인에게 불편을 주는 행동은 제한될 수 있습니다.",
  ];
});

function convertToDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value) {
  const date = convertToDate(value);
  if (!date) return "";

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function buildChatSender(message) {
  if (message.messageType === "SYSTEM") return "시스템";
  if (message.messageType === "ADMIN") return message.senderLabel || "직원";
  if (message.displayName) return message.displayName;
  if (message.tableNumber) return `No.${message.tableNumber}`;
  return "알 수 없음";
}

function subscribeMessages() {
  const q = query(
    collection(db, "chatMessages"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  unsubscribeMessages = onSnapshot(
    q,
    (snapshot) => {
      chatMessageList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingMessages.value = false;
    },
    (error) => {
      console.error("채팅 구독 실패:", error);
      isLoadingMessages.value = false;
    }
  );
}

function subscribeNotices() {
  const q = query(
    collection(db, "projectorNotices"),
    orderBy("sortOrder", "asc"),
    limit(50)
  );

  unsubscribeNotices = onSnapshot(
    q,
    (snapshot) => {
      noticeList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingNotices.value = false;
    },
    (error) => {
      console.error("공지사항 구독 실패:", error);
      isLoadingNotices.value = false;
    }
  );
}

onMounted(() => {
  subscribeMessages();
  subscribeNotices();
});

onUnmounted(() => {
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeNotices) unsubscribeNotices();
});
</script>

<style scoped lang="scss">
.projector-view {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #050816;
  color: #fff;
}

.main-layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  width: 100%;
  height: 100%;
}

.left-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.video-section {
  flex: 1;
  min-height: 0;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.notice-section {
  flex-shrink: 0;
}

.notice-marquee-wrap {
  height: 64px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
  display: flex;
  align-items: center;
}

.notice-marquee-track {
  display: flex;
  width: max-content;
  animation: marquee-left 28s linear infinite;
}

.notice-marquee-content {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.notice-item {
  display: inline-flex;
  align-items: center;
  height: 64px;
  padding: 0 40px;
  font-size: 22px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);

  &::after {
    content: "•";
    margin-left: 40px;
    color: rgba(255, 255, 255, 0.4);
  }
}

.right-panel {
  height: 100%;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.side-card {
  min-height: 0;
  height: 100%;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 800;
  }

  span {
    font-size: 14px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.68);
  }
}

.side-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  p {
    margin: 0;
    font-size: 15px;
    color: rgba(255, 255, 255, 0.68);
  }
}

.chat-list {
  flex: 1;
  overflow-y: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-row {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  padding: 12px;

  &.user {
    background: rgba(96, 165, 250, 0.1);
  }

  &.admin {
    background: rgba(52, 211, 153, 0.1);
  }

  &.system {
    background: rgba(255, 255, 255, 0.06);
  }

  p {
    margin: 0;
    font-size: 16px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 8px;
  }
}

.chat-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;

  strong {
    font-size: 14px;
    font-weight: 800;
  }

  span {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.52);
  }
}

@keyframes marquee-left {
  0% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(-50%);
  }
}
</style>
