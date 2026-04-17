<template>
  <div class="user-main-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>이 서비스는 모바일 환경에서 이용할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="main-container">
      <header class="main-header">
        <div class="header-top">
          <div class="header-title">
            <p class="eyebrow">TABLE SERVICE</p>
            <h1>{{ tableText }}</h1>
          </div>
        </div>

        <div class="session-card">
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

      <section class="menu-section">
        <button type="button" class="menu-card" @click="goOrder">
          <div class="menu-icon">🛍️</div>
          <div class="menu-text">
            <strong>주문하기</strong>
            <p>메뉴를 보고 장바구니에 담을 수 있어요.</p>
          </div>
        </button>

        <button type="button" class="menu-card" @click="goChat">
          <div class="menu-icon">💬</div>
          <div class="menu-text">
            <strong>전체 채팅</strong>
            <p>다른 테이블과 직원이 함께 참여하는 채팅방이에요.</p>
          </div>
        </button>

        <button type="button" class="menu-card" @click="goSong">
          <div class="menu-icon">🎬</div>
          <div class="menu-text">
            <strong>영상 신청</strong>
            <p>유튜브 영상을 검색하고 신청할 수 있어요.</p>
          </div>
        </button>

        <button type="button" class="menu-card" @click="goCheckout">
          <div class="menu-icon">💳</div>
          <div class="menu-text">
            <strong>결제 요청</strong>
            <p>직원에게 결제 요청을 보낼 수 있어요.</p>
          </div>
        </button>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");

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

function goOrder() {
  router.push("/user/order");
}

function goChat() {
  router.push("/user/chat");
}

function goSong() {
  router.push("/user/song");
}

function goCheckout() {
  router.push("/user/checkout");
}

onMounted(() => {
  detectMobile();
  loadEntryInfo();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
  }
});
</script>

<style scoped lang="scss">
.user-main-view {
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

.main-container {
  min-height: 100dvh;
  padding: 16px;
}

.main-header {
  margin-bottom: 18px;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
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
    font-size: 30px;
    font-weight: 800;
    line-height: 1.2;
  }
}

.session-card {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
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

.menu-section {
  display: grid;
  gap: 14px;
}

.menu-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  border: none;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  text-align: left;
  cursor: pointer;
}

.menu-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  flex-shrink: 0;
}

.menu-text {
  min-width: 0;

  strong {
    display: block;
    margin-bottom: 6px;
    font-size: 18px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.72);
  }
}

@media (min-width: 768px) {
  .main-container {
    max-width: 560px;
    margin: 0 auto;
    padding-top: 20px;
  }
}
</style>
