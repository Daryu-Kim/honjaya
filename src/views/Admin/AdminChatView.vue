<template>
  <div class="admin-chat-view">
    <header class="chat-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN CHAT</p>
        <h1>채팅 관리</h1>
        <p class="description">
          전체 채팅과 테이블 간 1:1 채팅, 직원 1:1 채팅을 한 곳에서 확인할 수
          있어요.
        </p>
      </div>

      <div class="header-right">
        <div class="status-card">
          <span class="label">호출·이벤트</span>
          <strong>{{ alertMessageCount }}건</strong>
        </div>

        <div class="status-card">
          <span class="label">총 메시지</span>
          <strong>{{ messageList.length }}개</strong>
        </div>
      </div>
    </header>

    <section class="chat-layout">
      <aside class="chat-sidebar">
        <div class="sidebar-card">
          <h2>채팅방</h2>

          <div class="room-list">
            <button
              v-for="room in roomList"
              :key="room.roomKey"
              type="button"
              class="room-button"
              :class="{ active: room.roomKey === selectedRoomKey }"
              @click="selectRoom(room.roomKey)"
            >
              <span class="room-label">{{ room.label }}</span>
              <span class="room-count">{{ room.count }}</span>
            </button>
          </div>
        </div>

        <div class="sidebar-card">
          <h2>필터</h2>

          <div class="filter-group">
            <label>메시지 유형</label>
            <select v-model="selectedType">
              <option value="ALL">전체</option>
              <option value="ALERT">호출·이벤트</option>
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
              :class="[
                message.messageType.toLowerCase(),
                {
                  alert: isAlertMessage(message),
                  hidden: message.isDeleted,
                },
              ]"
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
                  <span v-if="message.isDeleted" class="message-hidden-tag">
                    숨김 처리됨
                  </span>
                </div>

                <div class="message-bubble">
                  <p>{{ message.message }}</p>
                </div>

                <div class="message-time">
                  <span>{{ formatDateTime(message.createdAt) }}</span>
                  <button
                    type="button"
                    class="message-action-button"
                    @click="toggleMessageVisibility(message)"
                  >
                    {{ message.isDeleted ? "복구" : "숨김" }}
                  </button>
                </div>
              </template>
            </div>
          </div>
        </section>

        <section class="input-section">
          <div class="input-card">
            <textarea
              v-model.trim="messageText"
              :placeholder="composerPlaceholder"
              :maxlength="CHAT_MESSAGE_MAX_LENGTH"
              @keydown.enter.exact.prevent="handleSend"
            ></textarea>

            <div class="input-bottom">
              <p class="helper-text">{{ composerHelperText }}</p>

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
  fetchList,
  nowIso,
  subscribeTable,
  toTime,
  updateRow,
} from "@/lib/supabase";
import { runGlobalBusy } from "@/lib/globalBusy";
import { normalizeTableNumber } from "@/lib/orderSheet";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGE_TYPE,
  CHAT_ROOM_TYPE,
  GLOBAL_ROOM_KEY,
  buildStaffRoomKey,
  formatTableLabel,
  getChatDayStartIso,
  isAlertMessage,
  parseDirectRoomKey,
  parseStaffRoomKey,
  sendChatMessage,
} from "@/lib/chat";

const messageSectionRef = ref(null);

const isLoadingMessages = ref(true);
const isSending = ref(false);
const messageText = ref("");
const searchText = ref("");
const selectedType = ref("ALL");
const selectedRoomKey = ref(GLOBAL_ROOM_KEY);

const messageList = ref([]);
const activeTableList = ref([]);

let unsubscribeMessages = null;
let unsubscribeActiveSheets = null;

const canSend = computed(() => {
  return Boolean(messageText.value.trim());
});

const alertMessageCount = computed(() => {
  return messageList.value.filter((item) => isAlertMessage(item)).length;
});

const activeTableNicknameMap = computed(() => {
  const nicknameMap = {};

  activeTableList.value.forEach((table) => {
    nicknameMap[table.tableNumber] = table.nickname;
  });

  return nicknameMap;
});

const selectedRoomLabel = computed(() => {
  const room = roomList.value.find(
    (item) => item.roomKey === selectedRoomKey.value
  );

  return room?.label || "전체 채팅";
});

const composerPlaceholder = computed(() => {
  return `${selectedRoomLabel.value}에 직원 메시지를 입력해주세요`;
});

const composerHelperText = computed(() => {
  return `이 메시지는 ${selectedRoomLabel.value}에 직원 메시지로 표시됩니다.`;
});

function getNicknameForTable(tableNumber) {
  const normalized = normalizeTableNumber(tableNumber);

  for (let index = messageList.value.length - 1; index >= 0; index -= 1) {
    const message = messageList.value[index];

    if (
      normalizeTableNumber(message.tableNumber) === normalized &&
      String(message.nickname || "").trim()
    ) {
      return message.nickname;
    }
  }

  return activeTableNicknameMap.value[normalized] || "";
}

function buildStaffRoomLabel(tableNumber) {
  return `직원 ↔ ${formatTableLabel(
    tableNumber,
    getNicknameForTable(tableNumber)
  )}`;
}

function buildRoomLabel(roomKey) {
  if (roomKey === GLOBAL_ROOM_KEY) {
    return "전체 채팅";
  }

  const staffTableNumber = parseStaffRoomKey(roomKey);

  if (staffTableNumber) {
    return buildStaffRoomLabel(staffTableNumber);
  }

  const directTables = parseDirectRoomKey(roomKey);

  if (directTables.length === 2) {
    const left = formatTableLabel(
      directTables[0],
      getNicknameForTable(directTables[0])
    );
    const right = formatTableLabel(
      directTables[1],
      getNicknameForTable(directTables[1])
    );

    return `${left} ↔ ${right}`;
  }

  return roomKey;
}

const roomList = computed(() => {
  const roomMap = new Map();

  // seated tables get a room up front so staff can start the conversation
  activeTableList.value.forEach((table) => {
    const staffRoomKey = buildStaffRoomKey(table.tableNumber);

    if (staffRoomKey && !roomMap.has(staffRoomKey)) {
      roomMap.set(staffRoomKey, { roomKey: staffRoomKey, count: 0 });
    }
  });

  messageList.value.forEach((message) => {
    const roomKey = message.roomKey || GLOBAL_ROOM_KEY;
    const room = roomMap.get(roomKey) || { roomKey, count: 0 };

    room.count += 1;
    roomMap.set(roomKey, room);
  });

  if (!roomMap.has(GLOBAL_ROOM_KEY)) {
    roomMap.set(GLOBAL_ROOM_KEY, { roomKey: GLOBAL_ROOM_KEY, count: 0 });
  }

  return [...roomMap.values()]
    .map((room) => ({ ...room, label: buildRoomLabel(room.roomKey) }))
    .sort((a, b) => {
      if (a.roomKey === GLOBAL_ROOM_KEY) return -1;
      if (b.roomKey === GLOBAL_ROOM_KEY) return 1;

      const aStaff = parseStaffRoomKey(a.roomKey);
      const bStaff = parseStaffRoomKey(b.roomKey);

      if (aStaff && bStaff) {
        return Number(aStaff) - Number(bStaff);
      }

      if (aStaff) return -1;
      if (bStaff) return 1;

      return a.roomKey.localeCompare(b.roomKey);
    });
});

const filteredMessageList = computed(() => {
  const keyword = searchText.value.toLowerCase();

  return messageList.value.filter((item) => {
    const matchRoom =
      (item.roomKey || GLOBAL_ROOM_KEY) === selectedRoomKey.value;

    const matchType =
      selectedType.value === "ALL" ||
      (selectedType.value === "ALERT"
        ? isAlertMessage(item)
        : item.messageType === selectedType.value);

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

    return matchRoom && matchType && matchKeyword;
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

  const date = new Date(toTime(value));

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

async function loadMessages() {
  try {
    // 최신 500건만 받아 표시용으로 오래된 순으로 뒤집는다.
    const recentMessages = await fetchList("chatMessages", {
      filters: [["createdAt", "gte", getChatDayStartIso()]],
      order: ["createdAt", "desc"],
      limit: 500,
    });

    messageList.value = [...recentMessages].reverse();

    isLoadingMessages.value = false;
    scrollToBottom();
  } catch (error) {
    console.error("관리자 채팅 조회 실패:", error);
    isLoadingMessages.value = false;
  }
}

function subscribeMessages() {
  unsubscribeMessages = subscribeTable("chatMessages", loadMessages);
}

async function loadActiveTables() {
  try {
    const activeSheets = await fetchList("activeOrderSheets", {});
    const seatedSheets = activeSheets.filter((sheet) => sheet.orderSheetId);
    const nicknameMap = {};

    if (seatedSheets.length > 0) {
      const sheetIds = seatedSheets.map((sheet) => sheet.orderSheetId);
      const sheetRows = await fetchList("orderSheets", {
        filters: [["id", "in", sheetIds]],
      });

      sheetRows.forEach((row) => {
        nicknameMap[row.orderSheetId] = row.tableNickname || "";
      });
    }

    activeTableList.value = seatedSheets
      .map((sheet) => {
        const tableNumber = normalizeTableNumber(sheet.tableNumber);

        return {
          tableNumber,
          nickname: nicknameMap[sheet.orderSheetId] || "",
        };
      })
      .filter((table) => table.tableNumber);
  } catch (error) {
    console.error("운영 중인 테이블 조회 실패:", error);
  }
}

function subscribeActiveTables() {
  unsubscribeActiveSheets = subscribeTable(
    "activeOrderSheets",
    loadActiveTables,
    { pollMs: 60000 }
  );
}

function selectRoom(roomKey) {
  selectedRoomKey.value = roomKey;
  scrollToBottom();
}

// 신고/부적절 메시지는 소프트 삭제(is_deleted)로 숨긴다.
async function toggleMessageVisibility(message) {
  const nextDeleted = !message.isDeleted;
  const label = buildSenderLabel(message);
  const confirmed = window.confirm(
    nextDeleted
      ? `${label} 메시지를 숨김 처리할까요?`
      : `${label} 메시지 숨김을 해제할까요?`
  );

  if (!confirmed) {
    return;
  }

  await runGlobalBusy(
    async () => {
      try {
        await updateRow("chatMessages", message.id, {
          isDeleted: nextDeleted,
          updatedAt: nowIso(),
        });

        await loadMessages();
      } catch (error) {
        console.error("메시지 숨김 처리 실패:", error);
        alert("메시지 숨김 처리 중 문제가 발생했어요.");
      }
    },
    nextDeleted ? "메시지를 숨기는 중이에요." : "숨김을 해제하는 중이에요."
  );
}

function resolveRoomType(roomKey) {
  if (roomKey === GLOBAL_ROOM_KEY) {
    return CHAT_ROOM_TYPE.GLOBAL;
  }

  return parseStaffRoomKey(roomKey)
    ? CHAT_ROOM_TYPE.STAFF
    : CHAT_ROOM_TYPE.DIRECT;
}

function resolveRoomRecipient(roomKey) {
  return parseStaffRoomKey(roomKey);
}

async function handleSend() {
  if (!canSend.value || isSending.value) return;

  const safeMessage = messageText.value
    .trim()
    .slice(0, CHAT_MESSAGE_MAX_LENGTH);
  if (!safeMessage) return;

  const roomKey = selectedRoomKey.value || GLOBAL_ROOM_KEY;

  await runGlobalBusy(async () => {
    isSending.value = true;

    try {
      await sendChatMessage({
        roomType: resolveRoomType(roomKey),
        roomKey,
        message: safeMessage,
        sender: { tableNumber: "", nickname: "" },
        recipientTableNumber: resolveRoomRecipient(roomKey),
        messageType: CHAT_MESSAGE_TYPE.ADMIN,
        senderLabel: "직원",
      });

      messageText.value = "";
      await loadMessages();
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
  subscribeActiveTables();
});

onUnmounted(() => {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  if (unsubscribeActiveSheets) {
    unsubscribeActiveSheets();
    unsubscribeActiveSheets = null;
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

.header-right {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
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

.room-list {
  display: grid;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.room-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;

  &.active {
    background: #fff;
    color: #111827;
  }
}

.room-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-count {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 11px;
  font-weight: 800;
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

  &.alert .message-bubble {
    background: rgba(251, 191, 36, 0.22);
    border: 1px solid rgba(251, 191, 36, 0.5);
  }

  &.alert .sender-label {
    color: #fcd34d;
  }

  &.hidden {
    opacity: 0.5;

    .message-bubble p {
      text-decoration: line-through;
    }
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
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.48);
}

.message-action-button {
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    border-color: rgba(255, 255, 255, 0.4);
    color: #ffffff;
  }
}

.message-hidden-tag {
  padding: 3px 8px;
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
  font-size: 10px;
  font-weight: 700;
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
