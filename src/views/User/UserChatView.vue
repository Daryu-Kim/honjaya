<template>
  <div class="user-chat-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>이 서비스는 모바일 환경에서 이용할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="chat-container">
      <header class="chat-header">
        <button type="button" class="header-icon-button" @click="handleBack">
          ←
        </button>
        <div class="chat-header-text">
          <p class="eyebrow">TABLE CHAT</p>
          <h1>{{ headerTitle }}</h1>
        </div>
        <button type="button" class="header-gift-button" @click="goGift">
          🎁
        </button>
      </header>

      <nav v-if="!activeRoomKey" class="tab-bar">
        <button
          type="button"
          :class="{ active: activeTab === 'global' }"
          @click="activeTab = 'global'"
        >
          전체 채팅
          <span v-if="globalUnreadCount > 0" class="unread-badge">
            {{ globalUnreadCount }}
          </span>
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'direct' }"
          @click="activeTab = 'direct'"
        >
          1:1 채팅
          <span v-if="directUnreadCount > 0" class="unread-badge">
            {{ directUnreadCount }}
          </span>
        </button>
      </nav>

      <section
        v-if="activeTab === 'direct' && !activeRoomKey"
        class="partner-section"
      >
        <button
          v-for="partner in partnerList"
          :key="partner.roomKey"
          type="button"
          class="partner-card"
          @click="openRoom(partner)"
        >
          <span class="partner-icon">{{ partner.icon }}</span>
          <span class="partner-text">
            <strong>
              {{ partner.label }}
              <span
                v-if="partner.statusLabel"
                class="partner-status"
                :class="partner.statusTone"
              >
                {{ partner.statusLabel }}
              </span>
            </strong>
            <small>{{ getRoomPreview(partner.roomKey) }}</small>
          </span>
          <span
            v-if="getRoomUnreadCount(partner.roomKey) > 0"
            class="unread-badge"
          >
            {{ getRoomUnreadCount(partner.roomKey) }}
          </span>
        </button>

        <p v-if="partnerList.length === 0" class="empty-text">
          지금 함께 이용 중인 테이블이 없어요.
        </p>
      </section>

      <template v-else>
        <div v-if="blockedMessageCount > 0" class="blocked-notice">
          <span
            >차단한 테이블 메시지 {{ blockedMessageCount }}개를 숨겼어요</span
          >
          <button type="button" @click="unblockAllTables">숨김 해제</button>
        </div>

        <section ref="messageAreaRef" class="message-section">
          <p v-if="isLoading" class="empty-text">불러오는 중이에요...</p>
          <p v-else-if="visibleMessages.length === 0" class="empty-text">
            아직 메시지가 없어요. 먼저 인사해보세요!
          </p>

          <div
            v-for="message in visibleMessages"
            :key="message.id"
            class="message-row"
            :class="{
              mine: isOwnMessage(message, tableNumber),
              system: message.messageType === 'SYSTEM',
            }"
          >
            <div class="message-bubble">
              <p v-if="message.messageType !== 'SYSTEM'" class="message-sender">
                {{ getSenderLabel(message) }}
              </p>
              <p class="message-text">{{ message.message }}</p>
              <span class="message-time">{{
                formatTime(message.createdAt)
              }}</span>
            </div>

            <button
              v-if="canReportMessage(message)"
              type="button"
              class="message-report-button"
              @click="handleReport(message)"
            >
              신고
            </button>
          </div>
        </section>

        <div v-if="activeRoom" class="gift-row">
          <button
            v-if="activeRoom.targetType === 'DIRECT'"
            type="button"
            class="gift-send-button"
            @click="goGift(activeRoom)"
          >
            🎁 {{ activeRoom.label }}에 선물 보내기
          </button>
        </div>

        <footer class="composer">
          <div class="call-row">
            <button
              v-for="action in QUICK_CALL_ACTIONS"
              :key="action.id"
              type="button"
              class="call-button"
              :disabled="isSendingAlert"
              @click="sendQuickCall(action)"
            >
              {{ action.icon }} {{ action.label }}
            </button>
            <button
              type="button"
              class="call-button event"
              :disabled="isSendingAlert"
              @click="openEventSheet"
            >
              🎉 이벤트 신청
            </button>
          </div>

          <p v-if="alertFeedback" class="call-feedback">{{ alertFeedback }}</p>

          <div class="quick-phrase-row">
            <button
              v-for="phrase in QUICK_PHRASES"
              :key="phrase"
              type="button"
              class="quick-phrase-button"
              :disabled="isSending"
              @click="sendQuickPhrase(phrase)"
            >
              {{ phrase }}
            </button>
          </div>

          <div class="composer-row">
            <input
              v-model="draft"
              type="text"
              class="composer-input"
              :placeholder="composerPlaceholder"
              autocomplete="off"
              :maxlength="CHAT_MESSAGE_MAX_LENGTH"
              @keyup.enter="handleSend"
            />
            <button
              type="button"
              class="composer-send-button"
              :disabled="isSending || !draft.trim()"
              @click="handleSend"
            >
              전송
            </button>
          </div>
        </footer>
      </template>

      <div
        v-if="isEventSheetOpen"
        class="sheet-backdrop"
        @click="closeEventSheet"
      >
        <div class="sheet" @click.stop>
          <header class="sheet-header">
            <div>
              <p class="eyebrow">EVENT REQUEST</p>
              <h2>이벤트 · 노래 신청</h2>
            </div>
            <button type="button" class="sheet-close" @click="closeEventSheet">
              닫기
            </button>
          </header>

          <div class="event-chip-row">
            <button
              v-for="event in EVENT_REQUESTS"
              :key="event.id"
              type="button"
              class="event-chip"
              :class="{ active: selectedEventId === event.id }"
              @click="selectEventRequest(event)"
            >
              {{ event.icon }} {{ event.label }}
            </button>
          </div>

          <input
            v-model="eventNote"
            type="text"
            class="sheet-input"
            :placeholder="eventPlaceholder"
            autocomplete="off"
            maxlength="60"
          />

          <label class="event-announce-row">
            <input v-model="announceEventGlobal" type="checkbox" />
            <span>전체 채팅에도 알리기</span>
          </label>

          <button
            type="button"
            class="sheet-submit"
            :disabled="!selectedEvent || isSendingAlert"
            @click="submitEventRequest"
          >
            {{ isSendingAlert ? "전달하는 중..." : "직원에게 신청하기" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { fetchList, subscribeTable, toTime } from "@/lib/supabase";
import { normalizeTableNumber } from "@/lib/orderSheet";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGE_TYPE,
  CHAT_ROOM_TYPE,
  EVENT_REQUESTS,
  GLOBAL_ROOM_KEY,
  QUICK_CALL_ACTIONS,
  QUICK_PHRASES,
  blockTableNumber,
  buildDirectRoomKey,
  buildStaffRoomKey,
  clearBlockedTableNumbers,
  countUnreadMessages,
  formatTableLabel,
  getBlockedTableNumbers,
  isBlockedTableNumber,
  isOwnMessage,
  markRoomRead,
  reportChatMessage,
  sendChatMessage,
  sendStaffAlert,
} from "@/lib/chat";

const router = useRouter();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const orderSheetId = ref("");
const tableNickname = ref("");

const activeTab = ref("global");
const activeRoom = ref(null);
const partnerList = ref([]);
const messages = ref([]);
const draft = ref("");
const isLoading = ref(true);
const isSending = ref(false);
const isSendingAlert = ref(false);
const alertFeedback = ref("");
const blockedTableNumbers = ref([]);
const isEventSheetOpen = ref(false);
const selectedEventId = ref("");
const eventNote = ref("");
const announceEventGlobal = ref(false);
const messageAreaRef = ref(null);
const readTick = ref(0);

let unsubscribeMessages = null;
let unsubscribePartners = null;
let alertFeedbackTimer = null;

const activeRoomKey = computed(() => activeRoom.value?.roomKey || "");

const headerTitle = computed(() => {
  if (activeRoom.value) {
    return activeRoom.value.label;
  }

  return activeTab.value === "global" ? "전체 채팅" : "1:1 채팅";
});

const composerPlaceholder = computed(() => {
  if (activeRoom.value) {
    return `${activeRoom.value.label}에게 메시지 보내기`;
  }

  return "모든 테이블에게 메시지 보내기";
});

function sortByCreatedAtAsc(list) {
  return [...list].sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));
}

const globalMessages = computed(() =>
  sortByCreatedAtAsc(
    messages.value.filter((message) => message.roomKey === GLOBAL_ROOM_KEY)
  )
);

const activeRoomMessages = computed(() => {
  if (!activeRoomKey.value) {
    return [];
  }

  return sortByCreatedAtAsc(
    messages.value.filter((message) => message.roomKey === activeRoomKey.value)
  );
});

const visibleMessages = computed(() =>
  activeRoomKey.value
    ? filterBlockedMessages(activeRoomMessages.value)
    : filterBlockedMessages(globalMessages.value)
);

const blockedMessageCount = computed(() => {
  const source = activeRoomKey.value
    ? activeRoomMessages.value
    : globalMessages.value;

  return source.length - visibleMessages.value.length;
});

const selectedEvent = computed(() =>
  EVENT_REQUESTS.find((event) => event.id === selectedEventId.value)
);

const eventPlaceholder = computed(() => {
  return selectedEvent.value?.placeholder || "요청 내용을 적어주세요";
});

const globalUnreadCount = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  readTick.value;

  return countUnreadMessages(messages.value, {
    roomKey: GLOBAL_ROOM_KEY,
    tableNumber: tableNumber.value,
  });
});

const directUnreadCount = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  readTick.value;

  return partnerList.value.reduce(
    (total, partner) => total + getRoomUnreadCount(partner.roomKey),
    0
  );
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

function getRoomMessages(roomKey) {
  // messages are fetched newest first
  return messages.value.filter((message) => message.roomKey === roomKey);
}

function getRoomPreview(roomKey) {
  const latest = getRoomMessages(roomKey)[0];

  if (!latest) {
    return "대화를 시작해보세요";
  }

  return latest.message.length > 26
    ? `${latest.message.slice(0, 26)}...`
    : latest.message;
}

function getRoomUnreadCount(roomKey) {
  // eslint-disable-next-line no-unused-expressions
  readTick.value;

  return countUnreadMessages(messages.value, {
    roomKey,
    tableNumber: tableNumber.value,
  });
}

// 차단한 테이블의 메시지는 목록에서 숨긴다(서버 데이터는 그대로 둔다).
function filterBlockedMessages(list) {
  if (blockedTableNumbers.value.length === 0) {
    return list;
  }

  return list.filter(
    (message) =>
      !isBlockedTableNumber(message.tableNumber, blockedTableNumbers.value)
  );
}

function canReportMessage(message) {
  if (!message || message.messageType === CHAT_MESSAGE_TYPE.SYSTEM) {
    return false;
  }

  return !isOwnMessage(message, tableNumber.value);
}

function showAlertFeedback(text) {
  alertFeedback.value = text;

  if (alertFeedbackTimer) {
    clearTimeout(alertFeedbackTimer);
  }

  alertFeedbackTimer = setTimeout(() => {
    alertFeedback.value = "";
    alertFeedbackTimer = null;
  }, 3000);
}

function resolvePartnerStatus(sheetRow) {
  if (!sheetRow) {
    return { statusLabel: "", statusTone: "" };
  }

  if (
    sheetRow.status === "PAYMENT_REQUESTED" ||
    sheetRow.paymentStatus === "REQUESTED"
  ) {
    return { statusLabel: "💳 결제 중", statusTone: "payment" };
  }

  if (sheetRow.paymentStatus === "COMPLETED") {
    return { statusLabel: "✅ 결제 완료", statusTone: "paid" };
  }

  const orderCount = Number(sheetRow.orderCount || 0);

  if (orderCount > 0) {
    return { statusLabel: `🍽️ 주문 ${orderCount}건`, statusTone: "ordering" };
  }

  return { statusLabel: "🪑 착석", statusTone: "seated" };
}

function getSenderLabel(message) {
  if (message.messageType === CHAT_MESSAGE_TYPE.SYSTEM) {
    return "선물 알림";
  }

  if (message.messageType === CHAT_MESSAGE_TYPE.ADMIN) {
    return "직원";
  }

  return formatTableLabel(message.tableNumber, message.nickname);
}

function formatTime(value) {
  const date = new Date(toTime(value));

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function buildRoomKeys() {
  const keys = [GLOBAL_ROOM_KEY];
  const staffRoomKey = buildStaffRoomKey(tableNumber.value);

  if (staffRoomKey) {
    keys.push(staffRoomKey);
  }

  partnerList.value.forEach((partner) => {
    if (partner.roomKey && partner.roomKey !== staffRoomKey) {
      keys.push(partner.roomKey);
    }
  });

  return [...new Set(keys)];
}

async function loadMessages() {
  try {
    messages.value = await fetchList("chatMessages", {
      filters: [
        ["roomKey", "in", buildRoomKeys()],
        ["isDeleted", "eq", false],
      ],
      order: ["createdAt", "desc"],
      limit: 400,
    });
  } catch (error) {
    console.error("채팅 메시지 조회 실패:", error);
  } finally {
    isLoading.value = false;
  }
}

async function loadPartners() {
  const myTableNumber = normalizeTableNumber(tableNumber.value);

  if (!myTableNumber) {
    return;
  }

  const staffRoomKey = buildStaffRoomKey(myTableNumber);
  const partners = [
    {
      targetType: CHAT_ROOM_TYPE.STAFF,
      tableNumber: "",
      nickname: "",
      roomKey: staffRoomKey,
      label: "직원 (문의·호출)",
      icon: "🧑‍🍳",
    },
  ];

  try {
    const activeSheets = await fetchList("activeOrderSheets", {});
    const otherSheets = activeSheets.filter((sheet) => {
      return (
        normalizeTableNumber(sheet.tableNumber) !== myTableNumber &&
        sheet.orderSheetId
      );
    });

    const nicknameMap = {};
    const sheetRowMap = {};

    if (otherSheets.length > 0) {
      const sheetRows = await fetchList("orderSheets", {
        filters: [["id", "in", otherSheets.map((sheet) => sheet.orderSheetId)]],
      });

      sheetRows.forEach((row) => {
        nicknameMap[row.orderSheetId] = row.tableNickname || "";
        sheetRowMap[row.orderSheetId] = row;
      });
    }

    otherSheets
      .map((sheet) => {
        const targetTableNumber = normalizeTableNumber(sheet.tableNumber);
        const nickname = nicknameMap[sheet.orderSheetId] || "";
        const status = resolvePartnerStatus(sheetRowMap[sheet.orderSheetId]);

        return {
          targetType: CHAT_ROOM_TYPE.DIRECT,
          tableNumber: targetTableNumber,
          nickname,
          roomKey: buildDirectRoomKey(myTableNumber, targetTableNumber),
          label: formatTableLabel(targetTableNumber, nickname),
          icon: "🎉",
          statusLabel: status.statusLabel,
          statusTone: status.statusTone,
        };
      })
      .filter((partner) => partner.roomKey)
      .sort((a, b) => Number(a.tableNumber) - Number(b.tableNumber))
      .forEach((partner) => partners.push(partner));

    partnerList.value = partners;

    if (
      activeRoom.value &&
      !partners.some((partner) => partner.roomKey === activeRoom.value.roomKey)
    ) {
      activeRoom.value = null;
    }
  } catch (error) {
    console.error("채팅 상대 조회 실패:", error);
    partnerList.value = partners;
  }

  await loadMessages();
}

function openRoom(partner) {
  if (!partner?.roomKey) {
    return;
  }

  activeRoom.value = partner;
  markActiveRoomRead();
  scrollToBottom();
}

function closeRoom() {
  activeRoom.value = null;
}

function handleBack() {
  if (activeRoom.value) {
    closeRoom();
    return;
  }

  goBack();
}

function markActiveRoomRead() {
  const roomKey = activeRoomKey.value || GLOBAL_ROOM_KEY;

  markRoomRead(roomKey);
  readTick.value += 1;
}

function scrollToBottom() {
  nextTick(() => {
    const element = messageAreaRef.value;

    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  });
}

async function handleSend() {
  const text = draft.value.trim();

  if (!text || isSending.value) {
    return;
  }

  const roomKey = activeRoomKey.value || GLOBAL_ROOM_KEY;
  const roomType = activeRoom.value
    ? activeRoom.value.targetType
    : CHAT_ROOM_TYPE.GLOBAL;

  isSending.value = true;

  try {
    await sendChatMessage({
      roomType,
      roomKey,
      message: text,
      sender: {
        tableNumber: tableNumber.value,
        nickname: tableNickname.value,
      },
      recipientTableNumber:
        activeRoom.value?.targetType === CHAT_ROOM_TYPE.DIRECT
          ? activeRoom.value.tableNumber
          : "",
    });

    draft.value = "";
    await loadMessages();
    scrollToBottom();
  } catch (error) {
    console.error("메시지 전송 실패:", error);
    alert("메시지를 보내지 못했어요. 잠시 후 다시 시도해주세요.");
  } finally {
    isSending.value = false;
  }
}

function sendQuickPhrase(phrase) {
  draft.value = phrase;
  handleSend();
}

async function sendQuickCall(action) {
  if (isSendingAlert.value) {
    return;
  }

  isSendingAlert.value = true;

  try {
    await sendStaffAlert({
      tableNumber: tableNumber.value,
      nickname: tableNickname.value,
      message: action.message,
      senderLabel: action.label,
    });

    showAlertFeedback(`${action.icon} ${action.label} · 직원에게 전달했어요`);
    await loadMessages();
  } catch (error) {
    console.error("호출 전달 실패:", error);
    alert("호출을 전달하지 못했어요. 잠시 후 다시 시도해주세요.");
  } finally {
    isSendingAlert.value = false;
  }
}

function openEventSheet() {
  isEventSheetOpen.value = true;
  selectedEventId.value = EVENT_REQUESTS[0]?.id || "";
  eventNote.value = "";
  announceEventGlobal.value = false;
}

function closeEventSheet() {
  isEventSheetOpen.value = false;
}

function selectEventRequest(event) {
  selectedEventId.value = event.id;
}

async function submitEventRequest() {
  const event = selectedEvent.value;

  if (!event || isSendingAlert.value) {
    return;
  }

  const note = eventNote.value.trim();
  const message = `${event.icon} ${event.label} 신청${
    note ? ` · ${note}` : ""
  }`;

  isSendingAlert.value = true;

  try {
    await sendStaffAlert({
      tableNumber: tableNumber.value,
      nickname: tableNickname.value,
      message,
      senderLabel: "이벤트 신청",
      announceGlobal: announceEventGlobal.value,
    });

    isEventSheetOpen.value = false;
    showAlertFeedback(`${event.icon} ${event.label} 신청을 전달했어요`);
    await loadMessages();
  } catch (error) {
    console.error("이벤트 신청 실패:", error);
    alert("이벤트 신청을 전달하지 못했어요. 잠시 후 다시 시도해주세요.");
  } finally {
    isSendingAlert.value = false;
  }
}

async function handleReport(message) {
  const targetLabel = formatTableLabel(message.tableNumber, message.nickname);
  const confirmed = window.confirm(
    `${targetLabel}님의 메시지를 신고하고, 이 테이블의 메시지를 숨길까요?`
  );

  if (!confirmed) {
    return;
  }

  try {
    await reportChatMessage({
      tableNumber: tableNumber.value,
      nickname: tableNickname.value,
      targetLabel,
      message: message.message,
    });

    blockedTableNumbers.value = blockTableNumber(message.tableNumber);
    showAlertFeedback("신고를 접수하고 해당 테이블 메시지를 숨겼어요");
  } catch (error) {
    console.error("신고 접수 실패:", error);
    alert("신고를 접수하지 못했어요. 잠시 후 다시 시도해주세요.");
  }
}

function unblockAllTables() {
  blockedTableNumbers.value = clearBlockedTableNumbers();
  showAlertFeedback("숨긴 테이블 메시지를 다시 표시해요");
}

function goBack() {
  router.push("/user/main");
}

function goGift(partner = null) {
  const target = partner || activeRoom.value;
  const query =
    target?.targetType === CHAT_ROOM_TYPE.DIRECT && target.tableNumber
      ? { table: target.tableNumber }
      : undefined;

  router.push({ path: "/user/gift", query });
}

watch(visibleMessages, () => {
  markActiveRoomRead();
  scrollToBottom();
});

watch(activeTab, () => {
  if (!activeRoom.value) {
    markActiveRoomRead();
    scrollToBottom();
  }
});

onMounted(() => {
  detectMobile();
  loadEntryInfo();
  blockedTableNumbers.value = getBlockedTableNumbers();

  if (!tableNumber.value || !displayName.value || !orderSheetId.value) {
    router.replace("/enter");
    return;
  }

  unsubscribeMessages = subscribeTable("chatMessages", loadMessages, {
    pollMs: 45000,
  });
  unsubscribePartners = subscribeTable("activeOrderSheets", loadPartners, {
    pollMs: 60000,
  });
});

onUnmounted(() => {
  if (alertFeedbackTimer) {
    clearTimeout(alertFeedbackTimer);
    alertFeedbackTimer = null;
  }

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  if (unsubscribePartners) {
    unsubscribePartners();
    unsubscribePartners = null;
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
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: 14px 14px 0;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
}

.header-icon-button,
.header-gift-button {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: none;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
}

.chat-header-text {
  flex: 1;
  min-width: 0;

  .eyebrow {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.55);
  }

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.tab-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;

  button {
    position: relative;
    height: 46px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;

    &.active {
      background: #ffffff;
      color: #111827;
      border-color: #ffffff;
    }
  }
}

.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: #ef4444;
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
}

.partner-section {
  display: grid;
  gap: 10px;
  padding-bottom: 20px;
  overflow-y: auto;
}

.partner-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: none;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  text-align: left;
  cursor: pointer;
}

.partner-icon {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 20px;
}

.partner-text {
  flex: 1;
  min-width: 0;

  strong {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 800;
  }

  small {
    display: block;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.partner-status {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.82);

  &.payment {
    background: rgba(248, 113, 113, 0.22);
    color: #fecaca;
  }

  &.paid {
    background: rgba(74, 222, 128, 0.2);
    color: #bbf7d0;
  }

  &.ordering {
    background: rgba(96, 165, 250, 0.2);
    color: #bfdbfe;
  }
}

.blocked-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(148, 163, 184, 0.16);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);

  button {
    flex-shrink: 0;
    padding: 6px 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    background: transparent;
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }
}

.message-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 2px 12px;
  overflow-y: auto;
  min-height: 0;
}

.empty-text {
  margin: 24px 0;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.message-row {
  display: flex;
  justify-content: flex-start;

  &.mine {
    justify-content: flex-end;

    .message-bubble {
      background: #ffffff;
      color: #111827;
    }

    .message-sender,
    .message-time {
      color: rgba(17, 24, 39, 0.6);
    }
  }

  &.system {
    justify-content: center;

    .message-bubble {
      max-width: 90%;
      background: rgba(252, 211, 77, 0.16);
      border: 1px solid rgba(252, 211, 77, 0.35);
      text-align: center;
    }
  }
}

.message-bubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.1);
}

.message-report-button {
  align-self: flex-end;
  flex-shrink: 0;
  margin-left: 6px;
  padding: 4px 8px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 10px;
  background: transparent;
  color: rgba(254, 202, 202, 0.9);
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  opacity: 0.75;

  &:hover {
    opacity: 1;
  }
}

.message-sender {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.62);
}

.message-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.message-time {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  text-align: right;
  color: rgba(255, 255, 255, 0.45);
}

.gift-row {
  padding-bottom: 10px;
}

.gift-send-button {
  width: 100%;
  height: 46px;
  border: 1px solid rgba(252, 211, 77, 0.4);
  border-radius: 16px;
  background: rgba(252, 211, 77, 0.16);
  color: #fde68a;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.composer {
  position: sticky;
  bottom: 0;
  padding: 8px 0 14px;
  background: linear-gradient(180deg, rgba(17, 24, 39, 0) 0%, #111827 40%);
}

.call-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;

  &::-webkit-scrollbar {
    display: none;
  }
}

.call-button {
  flex-shrink: 0;
  padding: 9px 12px;
  border: 1px solid rgba(129, 140, 248, 0.4);
  border-radius: 999px;
  background: rgba(129, 140, 248, 0.18);
  color: #e0e7ff;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;

  &.event {
    border-color: rgba(244, 114, 182, 0.4);
    background: rgba(244, 114, 182, 0.18);
    color: #fbcfe8;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.call-feedback {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: #bbf7d0;
}

.quick-phrase-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;

  &::-webkit-scrollbar {
    display: none;
  }
}

.quick-phrase-button {
  flex-shrink: 0;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
  }
}

.composer-row {
  display: flex;
  gap: 8px;
}

.composer-input {
  flex: 1;
  height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.75);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  outline: none;

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
  }

  &:focus {
    border-color: rgba(255, 255, 255, 0.4);
  }
}

.composer-send-button {
  width: 72px;
  height: 48px;
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

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(2, 6, 23, 0.66);
  padding: 16px;
}

.sheet {
  width: 100%;
  max-width: 520px;
  padding: 18px;
  border-radius: 22px;
  background: #1f2937;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  .eyebrow {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.5);
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
  }
}

.sheet-close {
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.event-chip-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;

  &::-webkit-scrollbar {
    display: none;
  }
}

.event-chip {
  flex-shrink: 0;
  padding: 9px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;

  &.active {
    background: #ffffff;
    color: #111827;
    border-color: #ffffff;
  }
}

.sheet-input {
  width: 100%;
  height: 46px;
  margin-bottom: 10px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.75);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  outline: none;

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
  }
}

.event-announce-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.78);
  cursor: pointer;

  input {
    width: 16px;
    height: 16px;
  }
}

.sheet-submit {
  width: 100%;
  height: 50px;
  border: none;
  border-radius: 16px;
  background: #ffffff;
  color: #111827;
  font-size: 15px;
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
  }
}
</style>
