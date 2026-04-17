<template>
  <div class="user-song-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>영상 신청은 모바일 환경에서만 사용할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="song-container">
      <header class="song-header">
        <div class="header-top">
          <button type="button" class="back-button" @click="goBack">←</button>

          <div class="header-title">
            <p class="eyebrow">VIDEO REQUEST</p>
            <h1>영상 신청</h1>
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

        <div class="search-box">
          <input
            v-model.trim="searchKeyword"
            type="text"
            placeholder="유튜브 영상을 검색해보세요"
            @keydown.enter.prevent="searchYoutubeVideos"
          />
          <button
            type="button"
            class="search-button"
            :disabled="isSearching"
            @click="searchYoutubeVideos"
          >
            {{ isSearching ? "검색중..." : "검색" }}
          </button>
        </div>
      </header>

      <section v-if="myRequestList.length > 0" class="my-request-section">
        <div class="section-head">
          <h2>내 신청 영상</h2>
        </div>

        <div class="request-list">
          <article
            v-for="request in myRequestList"
            :key="request.id"
            class="request-card"
          >
            <div class="request-thumb">
              <img :src="request.thumbnailUrl" :alt="request.title" />
            </div>

            <div class="request-content">
              <strong>{{ request.title }}</strong>
              <p>{{ request.youtubeChannelTitle }}</p>
              <span>{{ convertStatusText(request.status) }}</span>
            </div>

            <button
              v-if="canCancelRequest(request)"
              type="button"
              class="cancel-button"
              @click="cancelRequest(request.id)"
            >
              취소
            </button>
          </article>
        </div>
      </section>

      <section class="result-section">
        <div v-if="isSearching" class="empty-box">
          <p>영상을 검색하는 중이에요.</p>
        </div>

        <div
          v-else-if="hasSearched && youtubeResultList.length === 0"
          class="empty-box"
        >
          <p>검색 결과가 없어요.</p>
        </div>

        <div v-else-if="!hasSearched" class="empty-box">
          <p>검색어를 입력하고 영상을 찾아보세요.</p>
        </div>

        <div v-else class="result-list">
          <article
            v-for="video in youtubeResultList"
            :key="video.videoId"
            class="result-card"
          >
            <div class="result-thumb">
              <img :src="video.thumbnailUrl" :alt="video.title" />
            </div>

            <div class="result-content">
              <strong>{{ video.title }}</strong>
              <p>{{ video.channelTitle }}</p>
            </div>

            <button
              type="button"
              class="request-button"
              :disabled="isSubmitting"
              @click="requestYoutubeVideo(video)"
            >
              신청
            </button>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createSystemChatMessage } from "@/lib/chat";
import { searchYoutubeVideosFunc } from "@/lib/youtube";

const router = useRouter();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");

const searchKeyword = ref("");
const isSearching = ref(false);
const isSubmitting = ref(false);
const hasSearched = ref(false);

const youtubeResultList = ref([]);
const myRequestList = ref([]);

let unsubscribeMyRequests = null;

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

function subscribeMyRequests() {
  if (!orderSheetId.value) return;

  const requestQuery = query(
    collection(db, "youtubeRequests"),
    where("orderSheetId", "==", orderSheetId.value),
    orderBy("createdAt", "desc")
  );

  unsubscribeMyRequests = onSnapshot(
    requestQuery,
    (snapshot) => {
      myRequestList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
    },
    (error) => {
      console.error("내 영상 신청 조회 실패:", error);
    }
  );
}

async function searchYoutubeVideos() {
  const keyword = searchKeyword.value.trim();

  if (!keyword || isSearching.value) return;

  isSearching.value = true;
  hasSearched.value = true;

  try {
    const result = await searchYoutubeVideosFunc(encodeURIComponent(keyword));
    // const response = await fetch(
    //   `/api/youtube/search?q=${encodeURIComponent(keyword)}`
    // );

    // if (!response.ok) {
    //   throw new Error("유튜브 검색 요청 실패");
    // }

    // const result = await response.json();

    youtubeResultList.value = Array.isArray(result?.items)
      ? result.items.map((item) => ({
          videoId: item.videoId,
          title: item.title,
          channelTitle: item.channelTitle,
          thumbnailUrl: item.thumbnailUrl,
        }))
      : [];
  } catch (error) {
    console.error("유튜브 검색 실패:", error);
    youtubeResultList.value = [];
    alert("영상 검색 중 문제가 발생했어요.");
  } finally {
    isSearching.value = false;
  }
}

function convertStatusText(status) {
  if (status === "QUEUED") return "신청됨";
  if (status === "PLAYING") return "재생중";
  if (status === "DONE") return "재생완료";
  if (status === "CANCELLED") return "취소됨";
  return status || "알 수 없음";
}

function canCancelRequest(request) {
  return request.status === "QUEUED";
}

async function requestYoutubeVideo(video) {
  if (!tableNumber.value || !displayName.value || !orderSheetId.value) return;
  if (isSubmitting.value) return;

  isSubmitting.value = true;

  try {
    await addDoc(collection(db, "youtubeRequests"), {
      orderSheetId: orderSheetId.value,
      tableNumber: tableNumber.value,
      displayName: displayName.value,
      requestType: "YOUTUBE",
      youtubeVideoId: video.videoId,
      youtubeChannelTitle: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
      title: video.title,
      status: "QUEUED",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "orderSheets", orderSheetId.value), {
      youtubeRequestCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    await createSystemChatMessage({
      orderSheetId: orderSheetId.value,
      tableNumber: tableNumber.value,
      displayName: displayName.value,
      message: `${displayName.value}에서 영상을 신청했어요.`,
    });

    alert("영상 신청이 접수되었어요.");
  } catch (error) {
    console.error("영상 신청 실패:", error);
    alert("영상 신청 중 문제가 발생했어요.");
  } finally {
    isSubmitting.value = false;
  }
}

async function cancelRequest(requestId) {
  try {
    await updateDoc(doc(db, "youtubeRequests", requestId), {
      status: "CANCELLED",
      updatedAt: serverTimestamp(),
    });

    await createSystemChatMessage({
      orderSheetId: orderSheetId.value,
      tableNumber: tableNumber.value,
      displayName: displayName.value,
      message: `${displayName.value}에서 영상 신청을 취소했어요.`,
    });
  } catch (error) {
    console.error("영상 신청 취소 실패:", error);
    alert("영상 신청 취소 중 문제가 발생했어요.");
  }
}

function goBack() {
  router.push("/user/main");
}

onMounted(() => {
  detectMobile();
  loadEntryInfo();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
    return;
  }

  subscribeMyRequests();
});

onUnmounted(() => {
  if (unsubscribeMyRequests) {
    unsubscribeMyRequests();
    unsubscribeMyRequests = null;
  }
});
</script>

<style scoped lang="scss">
.user-song-view {
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

.song-container {
  min-height: 100dvh;
  padding: 16px 16px 24px;
}

.song-header {
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

.session-card {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}

.session-row {
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
    font-size: 15px;
    font-weight: 800;
    text-align: right;
    word-break: break-all;
  }
}

.search-box {
  display: flex;
  gap: 8px;

  input {
    flex: 1;
    height: 50px;
    padding: 0 16px;
    border: none;
    outline: none;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;

    &::placeholder {
      color: rgba(255, 255, 255, 0.45);
    }
  }
}

.search-button {
  flex-shrink: 0;
  min-width: 82px;
  height: 50px;
  border: none;
  border-radius: 16px;
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

.my-request-section,
.result-section {
  margin-bottom: 16px;
}

.section-head {
  margin-bottom: 10px;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
  }
}

.request-list,
.result-list {
  display: grid;
  gap: 12px;
}

.request-card,
.result-card,
.empty-box {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.request-card,
.result-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  align-items: center;
}

.request-thumb,
.result-thumb {
  width: 108px;
  height: 64px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.request-content,
.result-content {
  min-width: 0;
  flex: 1;

  strong {
    display: block;
    margin-bottom: 6px;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.45;
  }

  p {
    margin: 0 0 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
    line-height: 1.5;
  }

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.84);
  }
}

.cancel-button,
.request-button {
  flex-shrink: 0;
  min-width: 72px;
  height: 38px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.cancel-button {
  background: rgba(252, 165, 165, 0.14);
  color: #fecaca;
}

.request-button {
  background: #ffffff;
  color: #111827;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.empty-box {
  padding: 28px 16px;
  text-align: center;

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
  }
}

@media (min-width: 768px) {
  .song-container {
    max-width: 560px;
    margin: 0 auto;
    padding-top: 20px;
  }
}
</style>
