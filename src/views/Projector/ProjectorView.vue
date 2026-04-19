<template>
  <div class="projector-view">
    <div class="main-layout">
      <section class="video-section">
        <div class="video-frame-wrap">
          <div v-if="!currentVideoRequest" class="video-empty">
            <div class="video-empty-inner">
              <p class="video-empty-eyebrow">PROJECTOR</p>
              <h1>재생할 영상이 없어요</h1>
              <p>신청된 영상이 들어오면 자동으로 재생을 시작해요.</p>
            </div>
          </div>

          <div v-else class="video-player-shell">
            <div id="projector-youtube-player" class="youtube-player"></div>
          </div>
        </div>

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
      </section>

      <aside class="side-panel">
        <section class="side-card queue-card">
          <div class="side-head">
            <h2>신청 영상</h2>
            <span>{{ queuedVideoList.length }}개</span>
          </div>

          <div v-if="isLoadingYoutubeRequests" class="side-empty">
            <p>영상 목록을 불러오는 중이에요.</p>
          </div>

          <div v-else-if="queuedVideoList.length === 0" class="side-empty">
            <p>신청된 영상이 없어요.</p>
          </div>

          <div v-else class="queue-list">
            <article
              v-for="request in queuedVideoList.slice(0, 10)"
              :key="request.id"
              class="queue-item"
              :class="{ playing: currentVideoRequest?.id === request.id }"
            >
              <div class="queue-thumb">
                <img
                  :src="request.thumbnailUrl"
                  :alt="request.title || 'thumbnail'"
                />
              </div>

              <div class="queue-body">
                <strong>{{
                  request.displayName || `No.${request.tableNumber}`
                }}</strong>
                <p>{{ request.title }}</p>
              </div>
            </article>
          </div>
        </section>

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
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  completeYoutubeRequest,
  normalizeYoutubeQueueState,
  startNextQueuedYoutubeRequest,
} from "@/lib/youtubeQueue";

const youtubeRequestList = ref([]);
const chatMessageList = ref([]);
const noticeList = ref([]);

const isLoadingYoutubeRequests = ref(true);
const isLoadingMessages = ref(true);
const isLoadingNotices = ref(true);

const currentVideoRequest = ref(null);

const ytReady = ref(false);
const player = ref(null);
const currentLoadedVideoId = ref("");
const isAdvancingVideo = ref(false);

let unsubscribeYoutube = null;
let unsubscribeMessages = null;
let unsubscribeNotices = null;
let youtubeApiScriptPromise = null;

const queuedVideoList = computed(() => {
  return [...youtubeRequestList.value].sort((a, b) => {
    const aPlaying = a.status === "PLAYING" ? 0 : 1;
    const bPlaying = b.status === "PLAYING" ? 0 : 1;

    if (aPlaying !== bPlaying) return aPlaying - bPlaying;

    const aTime =
      typeof a.createdAt?.toDate === "function"
        ? a.createdAt.toDate().getTime()
        : 0;
    const bTime =
      typeof b.createdAt?.toDate === "function"
        ? b.createdAt.toDate().getTime()
        : 0;

    return aTime - bTime;
  });
});

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
    "신청 영상은 재생 순서에 따라 자동으로 이어집니다.",
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

function subscribeYoutubeRequests() {
  const q = query(
    collection(db, "youtubeRequests"),
    where("status", "in", ["QUEUED", "PLAYING"]),
    orderBy("createdAt", "asc")
  );

  unsubscribeYoutube = onSnapshot(
    q,
    async (snapshot) => {
      youtubeRequestList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const playing =
        youtubeRequestList.value.find((item) => item.status === "PLAYING") ||
        null;

      currentVideoRequest.value = playing;
      isLoadingYoutubeRequests.value = false;

      if (!playing) {
        await ensureCurrentPlayableVideo();
        return;
      }

      await ensurePlayerForCurrentVideo();
    },
    (error) => {
      console.error("영상 신청 구독 실패:", error);
      isLoadingYoutubeRequests.value = false;
    }
  );
}

async function ensureCurrentPlayableVideo() {
  try {
    const normalized = await normalizeYoutubeQueueState();

    if (normalized) {
      currentVideoRequest.value = normalized;
      return;
    }

    currentVideoRequest.value = null;
  } catch (error) {
    console.error("현재 재생 영상 보정 실패:", error);
  }
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

async function advanceToNextVideo() {
  if (isAdvancingVideo.value) return;
  isAdvancingVideo.value = true;

  try {
    const current = currentVideoRequest.value;

    if (current?.id) {
      await completeYoutubeRequest(current.id);
    }

    const next = await startNextQueuedYoutubeRequest();
    currentLoadedVideoId.value = "";

    if (next) {
      currentVideoRequest.value = next;
      await ensurePlayerForCurrentVideo();
    } else {
      currentVideoRequest.value = null;
      if (player.value?.stopVideo) {
        player.value.stopVideo();
      }
    }
  } catch (error) {
    console.error("다음 영상 전환 실패:", error);
  } finally {
    isAdvancingVideo.value = false;
  }
}

function loadYouTubeIframeApi() {
  if (window.YT && window.YT.Player) {
    ytReady.value = true;
    return Promise.resolve();
  }

  if (youtubeApiScriptPromise) {
    return youtubeApiScriptPromise;
  }

  youtubeApiScriptPromise = new Promise((resolve) => {
    const existingScript = document.getElementById("youtube-iframe-api");

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      ytReady.value = true;
      resolve();
    };
  });

  return youtubeApiScriptPromise;
}

async function ensurePlayerForCurrentVideo() {
  const current = currentVideoRequest.value;
  if (!current?.youtubeVideoId) return;

  await loadYouTubeIframeApi();

  if (!window.YT || !window.YT.Player) return;

  if (!player.value) {
    player.value = new window.YT.Player("projector-youtube-player", {
      videoId: current.youtubeVideoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onReady: (event) => {
          currentLoadedVideoId.value = current.youtubeVideoId;
          event.target.playVideo();
        },
        onStateChange: async (event) => {
          if (event.data === window.YT.PlayerState.ENDED) {
            await advanceToNextVideo();
          }
        },
      },
    });

    return;
  }

  if (currentLoadedVideoId.value !== current.youtubeVideoId) {
    currentLoadedVideoId.value = current.youtubeVideoId;
    player.value.loadVideoById(current.youtubeVideoId);
  }
}

watch(
  () => currentVideoRequest.value?.youtubeVideoId,
  async () => {
    if (!currentVideoRequest.value?.youtubeVideoId) return;
    await ensurePlayerForCurrentVideo();
  }
);

onMounted(async () => {
  await loadYouTubeIframeApi();
  await ensureCurrentPlayableVideo();
  subscribeYoutubeRequests();
  subscribeMessages();
  subscribeNotices();
});

onUnmounted(() => {
  if (unsubscribeYoutube) unsubscribeYoutube();
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeNotices) unsubscribeNotices();

  if (player.value?.destroy) {
    player.value.destroy();
    player.value = null;
  }
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

.video-section {
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.video-frame-wrap {
  flex: 1;
  min-height: 0;
  background: #000;
  position: relative;
}

.video-player-shell,
.youtube-player,
.video-empty {
  width: 100%;
  height: 100%;
}

.video-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-empty-inner {
  text-align: center;

  .video-empty-eyebrow {
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.5);
  }

  h1 {
    margin: 0 0 12px;
    font-size: 42px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 18px;
    color: rgba(255, 255, 255, 0.72);
  }
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

.side-panel {
  height: 100%;
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.side-card {
  min-height: 0;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

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

.queue-list,
.chat-list {
  overflow-y: auto;
  display: grid;
  gap: 10px;
  min-height: 0;
}

.queue-item,
.chat-row {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}

.queue-item {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 10px;
  padding: 10px;

  &.playing {
    outline: 2px solid rgba(96, 165, 250, 0.35);
  }
}

.queue-thumb {
  width: 100px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.queue-body {
  min-width: 0;

  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 14px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.78);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.chat-row {
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
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.chat-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;

  strong {
    font-size: 13px;
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
