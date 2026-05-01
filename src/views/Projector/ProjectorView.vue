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

const noticeList = ref([]);

const isLoadingNotices = ref(true);

let unsubscribeNotices = null;

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
  subscribeNotices();
});

onUnmounted(() => {
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

@keyframes marquee-left {
  0% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(-50%);
  }
}
</style>
