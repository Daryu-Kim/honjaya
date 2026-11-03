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
            <span>닉네임</span>
            <div class="session-nickname">
              <strong>{{ tableNicknameText }}</strong>
              <button
                type="button"
                class="nickname-edit-button"
                @click="openNicknameEditor"
              >
                변경
              </button>
            </div>
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

        <button type="button" class="menu-card" @click="goOrderHistory">
          <div class="menu-icon">📋</div>
          <div class="menu-text">
            <strong>주문 내역</strong>
            <p>지금까지 주문한 모든 내역을 확인할 수 있어요.</p>
          </div>
        </button>

        <button type="button" class="menu-card" @click="goChat">
          <div class="menu-icon">💬</div>
          <div class="menu-text">
            <strong>
              채팅
              <span v-if="unreadChatCount > 0" class="menu-badge">
                {{ unreadChatCount > 99 ? "99+" : unreadChatCount }}
              </span>
            </strong>
            <p>전체 채팅과 1:1 채팅으로 다른 테이블과 대화할 수 있어요.</p>
          </div>
        </button>

        <button type="button" class="menu-card" @click="goGift">
          <div class="menu-icon">🎁</div>
          <div class="menu-text">
            <strong>선물 보내기</strong>
            <p>다른 테이블에 메뉴를 선물할 수 있어요.</p>
          </div>
        </button>
      </section>

      <section class="external-links-section">
        <a
          href="https://www.instagram.com/honjaya_daegu"
          target="_blank"
          rel="noopener noreferrer"
          class="external-link-button instagram"
        >
          <span class="link-icon">📸</span>
          <span class="link-text">인스타그램</span>
        </a>

        <a
          href="https://m.place.naver.com/my/checkin"
          target="_blank"
          rel="noopener noreferrer"
          class="external-link-button naver"
        >
          <span class="link-icon">⭐</span>
          <span class="link-text">리뷰 쓰러가기</span>
        </a>

        <a
          href="https://open.kakao.com/o/pwJYvVMi"
          target="_blank"
          rel="noopener noreferrer"
          class="external-link-button kakao"
        >
          <span class="link-icon">💛</span>
          <span class="link-text">카카오톡 오픈채팅</span>
          <span class="link-description">
            가게 소식과 기존 이용자들과의 친목을 위한 공간이에요.
          </span>
        </a>
      </section>

      <PushNotificationToggle />

      <div class="session-card" style="margin-top: 20px">
        <div class="session-row">
          <span>WIFI 이름</span>
          <strong>U+NetB1D9</strong>
        </div>
        <div class="session-row">
          <span>WIFI 비밀번호</span>
          <strong>6D99493BM*</strong>
        </div>
      </div>
    </div>

    <transition name="fade">
      <div
        v-if="isNicknameEditorOpen"
        class="nickname-editor-overlay"
        @click.self="closeNicknameEditor"
      >
        <div class="nickname-editor-card">
          <h3>닉네임 변경</h3>
          <p class="nickname-editor-description">
            주문서 마감 전까지 언제든 바꿀 수 있어요.
          </p>

          <input
            v-model="nicknameDraft"
            type="text"
            class="nickname-editor-input"
            placeholder="닉네임을 입력해주세요"
            autocomplete="off"
          />
          <p class="nickname-editor-helper">
            한글 8자, 영문·숫자 16자까지 입력할 수 있어요.
          </p>
          <p class="nickname-editor-notice">
            비속어나 불쾌감을 주는 닉네임은 안내 없이 강제로 변경될 수 있어요.
          </p>
          <p v-if="nicknameDraftError" class="nickname-editor-error">
            {{ nicknameDraftError }}
          </p>

          <div class="nickname-editor-actions">
            <button
              type="button"
              class="nickname-cancel-button"
              :disabled="isSavingNickname"
              @click="closeNicknameEditor"
            >
              취소
            </button>
            <button
              type="button"
              class="nickname-save-button"
              :disabled="isSavingNickname || Boolean(nicknameDraftError)"
              @click="saveNickname"
            >
              {{ isSavingNickname ? "저장 중..." : "저장" }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import PushNotificationToggle from "@/components/PushNotificationToggle.vue";
import { totalUnread } from "@/lib/chatAlerts";
import { runGlobalBusy } from "@/lib/globalBusy";
import {
  getActiveOrderSheetInfo,
  getTableNicknameErrorMessage,
  updateOrderSheetNickname,
} from "@/lib/orderSheet";

const router = useRouter();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");
const tableNickname = ref("");
const isNicknameEditorOpen = ref(false);
const nicknameDraft = ref("");
const isSavingNickname = ref(false);

const tableText = computed(() => {
  return tableNumber.value
    ? `${tableNumber.value}번 테이블`
    : "테이블 정보 없음";
});

const unreadChatCount = computed(() => totalUnread.value);

const displayNameText = computed(() => {
  return displayName.value || "표시명 없음";
});

const orderSheetIdText = computed(() => {
  return orderSheetId.value || "주문서 없음";
});

const tableNicknameText = computed(() => {
  return tableNickname.value || "설정 안 함";
});

const nicknameDraftError = computed(() => {
  return isNicknameEditorOpen.value
    ? getTableNicknameErrorMessage(nicknameDraft.value)
    : "";
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
    tableNickname.value = entryInfo.tableNickname || "";
  } catch (error) {
    tableNumber.value = "";
    displayName.value = "";
    orderSheetId.value = "";
    tableNickname.value = "";
  }
}

function persistTableNickname(nickname) {
  try {
    const entryInfo = JSON.parse(
      sessionStorage.getItem("userEntryInfo") || "{}"
    );

    entryInfo.tableNickname = nickname || "";
    sessionStorage.setItem("userEntryInfo", JSON.stringify(entryInfo));
  } catch (error) {
    console.error("입장 정보 저장 실패:", error);
  }
}

async function refreshTableNickname() {
  if (!tableNumber.value || !orderSheetId.value) return;

  try {
    const activeInfo = await getActiveOrderSheetInfo(tableNumber.value);

    if (!activeInfo || activeInfo.orderSheetId !== orderSheetId.value) return;

    tableNickname.value = activeInfo.tableNickname || "";
    persistTableNickname(tableNickname.value);
  } catch (error) {
    console.error("닉네임 정보 조회 실패:", error);
  }
}

function openNicknameEditor() {
  nicknameDraft.value = tableNickname.value;
  isNicknameEditorOpen.value = true;
}

function closeNicknameEditor() {
  if (isSavingNickname.value) return;

  isNicknameEditorOpen.value = false;
}

async function saveNickname() {
  if (isSavingNickname.value || nicknameDraftError.value) return;
  if (!orderSheetId.value) return;

  await runGlobalBusy(async () => {
    isSavingNickname.value = true;

    try {
      const savedNickname = await updateOrderSheetNickname({
        orderSheetId: orderSheetId.value,
        nickname: nicknameDraft.value,
      });

      tableNickname.value = savedNickname;
      persistTableNickname(savedNickname);
      isNicknameEditorOpen.value = false;
    } catch (error) {
      console.error("닉네임 저장 실패:", error);
      alert("닉네임 저장 중 문제가 발생했어요.");
    } finally {
      isSavingNickname.value = false;
    }
  }, "닉네임을 저장하는 중이에요.");
}

function goOrder() {
  router.push("/user/order");
}

function goOrderHistory() {
  router.push("/user/order-history");
}

function goChat() {
  router.push("/user/chat");
}

function goGift() {
  router.push("/user/gift");
}

onMounted(() => {
  detectMobile();
  loadEntryInfo();
  refreshTableNickname();

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

.session-nickname {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.nickname-edit-button {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
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

.menu-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  margin-left: 6px;
  padding: 0 7px;
  border-radius: 11px;
  background: #ff4d6d;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  vertical-align: middle;
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

.external-links-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 20px;
}

.external-link-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border: none;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
}

.link-icon {
  font-size: 24px;
  line-height: 1;
}

.link-text {
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}

.external-link-button.kakao {
  grid-column: 1 / -1;
  background: rgba(254, 229, 0, 0.12);

  &:hover {
    background: rgba(254, 229, 0, 0.2);
  }
}

.link-description {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
  color: rgba(255, 255, 255, 0.72);
}

.nickname-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 23, 0.72);
}

.nickname-editor-card {
  width: 100%;
  max-width: 420px;
  padding: 24px 20px;
  border-radius: 24px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);

  h3 {
    margin: 0 0 6px;
    font-size: 20px;
    font-weight: 800;
  }
}

.nickname-editor-description {
  margin: 0 0 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}

.nickname-editor-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.75);
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

.nickname-editor-helper {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.6);
}

.nickname-editor-notice {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(252, 211, 77, 0.85);
}

.nickname-editor-error {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: #fca5a5;
}

.nickname-editor-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.nickname-cancel-button,
.nickname-save-button {
  flex: 1;
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.nickname-cancel-button {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.nickname-save-button {
  background: #ffffff;
  color: #111827;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (min-width: 768px) {
  .main-container {
    max-width: 560px;
    margin: 0 auto;
    padding-top: 20px;
  }
}
</style>
