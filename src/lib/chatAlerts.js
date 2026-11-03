// App-wide chat notifications for customer phones.
//
// The chat view owns the room UI, but a customer who is ordering or browsing
// the menu still has to notice a new message. This module keeps one light
// chat_messages subscription alive for every /user/* route and exposes toast
// alerts, a sound/vibration cue, a document title badge and the unread count
// used by the main menu card.
import { computed, ref, watch } from "vue";
import { fetchList, subscribeTable, toTime } from "@/lib/supabase";
import {
  CHAT_MESSAGE_TYPE,
  CHAT_ROOM_TYPE,
  GLOBAL_ROOM_KEY,
  buildStaffRoomKey,
  countUnreadMessages,
  formatTableLabel,
  getChatDayStartIso,
  isAlertMessage,
  isOwnMessage,
  parseDirectRoomKey,
} from "@/lib/chat";
import { normalizeTableNumber } from "@/lib/orderSheet";
import {
  playNotificationChime,
  registerSoundUnlock,
} from "@/lib/notificationSound";

const ENTRY_STORAGE_KEY = "userEntryInfo";
const CHAT_ROUTE_PATH = "/user/chat";
const POLL_MS = 15000;
const MESSAGE_LIMIT = 150;
const SEEN_ID_LIMIT = 600;
const ALERT_LIMIT = 3;
const ALERT_LIFETIME_MS = 7000;

export const totalUnread = ref(0);
export const alertList = ref([]);

const tableNumber = ref("");
const isRunning = ref(false);

let cachedMessages = [];
const seenMessageIds = new Set();
const alertTimers = new Map();

let isPrimed = false;
let sessionStartedAt = "";
let unsubscribeMessages = null;
let titleBeforeBadge = "";
let hasVisibilityListener = false;

function readEntryTableNumber() {
  try {
    const entryInfo = JSON.parse(
      sessionStorage.getItem(ENTRY_STORAGE_KEY) || "{}"
    );

    return normalizeTableNumber(entryInfo.tableNumber);
  } catch (error) {
    return "";
  }
}

function isViewingChat() {
  return String(window.location.pathname || "")
    .replace(/\/+$/, "")
    .endsWith(CHAT_ROUTE_PATH);
}

function isRelevantRoom(message, myTableNumber) {
  if (!message || message.isDeleted) {
    return false;
  }

  const roomKey = String(message.roomKey || "");
  const roomType = String(message.roomType || "");

  if (roomType === CHAT_ROOM_TYPE.GLOBAL || roomKey === GLOBAL_ROOM_KEY) {
    return true;
  }

  if (roomType === CHAT_ROOM_TYPE.STAFF || roomKey.startsWith("staff_")) {
    return roomKey === buildStaffRoomKey(myTableNumber);
  }

  if (roomType === CHAT_ROOM_TYPE.DIRECT || roomKey.startsWith("dm_")) {
    return parseDirectRoomKey(roomKey).includes(myTableNumber);
  }

  return false;
}

function refreshUnreadCount() {
  const myTableNumber = tableNumber.value;

  if (!myTableNumber) {
    totalUnread.value = 0;
    return;
  }

  // Only count messages that arrived during this session: the history that was
  // already there when the customer sat down is not "unread" for them.
  const sessionStartTime = toTime(sessionStartedAt);
  const sessionMessages = cachedMessages.filter(
    (message) => toTime(message.createdAt) > sessionStartTime
  );
  const roomKeys = new Set();

  sessionMessages.forEach((message) => {
    if (isRelevantRoom(message, myTableNumber)) {
      roomKeys.add(message.roomKey);
    }
  });

  let total = 0;

  roomKeys.forEach((roomKey) => {
    total += countUnreadMessages(sessionMessages, {
      roomKey,
      tableNumber: myTableNumber,
    });
  });

  totalUnread.value = total;
}

function describeAlert(message) {
  const roomKey = String(message.roomKey || "");
  const isSystemMessage = message.messageType === CHAT_MESSAGE_TYPE.SYSTEM;

  const icon = isSystemMessage || isAlertMessage(message) ? "🔔" : "💬";

  if (roomKey === GLOBAL_ROOM_KEY) {
    return {
      icon,
      title: formatTableLabel(message.tableNumber, message.nickname),
    };
  }

  if (roomKey.startsWith("staff_")) {
    return { icon, title: "직원 메시지" };
  }

  return {
    icon,
    title: `${
      normalizeTableNumber(message.tableNumber) || "?"
    }번 테이블 1:1 채팅`,
  };
}

function previewMessage(message) {
  const text = String(message.message || "")
    .trim()
    .replace(/\s+/g, " ");

  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function vibrate() {
  if (typeof navigator.vibrate !== "function") {
    return;
  }

  navigator.vibrate([14, 40, 14]);
}

function applyTitleBadge(count) {
  if (!titleBeforeBadge) {
    titleBeforeBadge = String(document.title || "").replace(/^\(\d+\)\s+/, "");
  }

  document.title =
    count > 0
      ? `(${Math.min(count, 99)}) ${titleBeforeBadge}`
      : titleBeforeBadge;
}

export function dismissAlert(alertId) {
  const timer = alertTimers.get(alertId);

  if (timer) {
    clearTimeout(timer);
    alertTimers.delete(alertId);
  }

  alertList.value = alertList.value.filter((alert) => alert.id !== alertId);
}

function pushAlert(message) {
  const { icon, title } = describeAlert(message);
  const alert = {
    id: message.id,
    icon,
    title,
    preview: previewMessage(message),
  };

  const nextAlerts = alertList.value.filter((item) => item.id !== alert.id);

  nextAlerts.push(alert);
  alertList.value = nextAlerts.slice(-ALERT_LIMIT);
  alertTimers.set(
    alert.id,
    setTimeout(() => dismissAlert(alert.id), ALERT_LIFETIME_MS)
  );

  playNotificationChime();
  vibrate();
}

function trimSeenIds() {
  if (seenMessageIds.size <= SEEN_ID_LIMIT) {
    return;
  }

  const overflow = seenMessageIds.size - SEEN_ID_LIMIT;
  let removed = 0;

  for (const messageId of seenMessageIds) {
    if (removed >= overflow) {
      break;
    }

    seenMessageIds.delete(messageId);
    removed += 1;
  }
}

// SupabaseRealtime refresh handlers can fire twice for the same row, so new
// alerts are decided by message id instead of by timestamp.
function handleIncomingMessages(rows) {
  const myTableNumber = tableNumber.value;

  if (!isPrimed) {
    rows.forEach((message) => {
      if (message && message.id) {
        seenMessageIds.add(message.id);
      }
    });
    isPrimed = true;
    return;
  }

  const freshMessages = rows.filter(
    (message) => message && message.id && !seenMessageIds.has(message.id)
  );

  freshMessages.forEach((message) => seenMessageIds.add(message.id));
  trimSeenIds();

  freshMessages
    .slice()
    .reverse()
    .forEach((message) => {
      if (
        !isRelevantRoom(message, myTableNumber) ||
        isOwnMessage(message, myTableNumber)
      ) {
        return;
      }

      // Global toasts would duplicate the room the customer is already in.
      if (message.roomKey === GLOBAL_ROOM_KEY && isViewingChat()) {
        return;
      }

      pushAlert(message);
    });
}

async function loadMessages() {
  if (!isRunning.value) {
    return;
  }

  try {
    const rows = await fetchList("chatMessages", {
      filters: [
        ["isDeleted", "eq", false],
        ["createdAt", "gte", getChatDayStartIso()],
      ],
      order: ["createdAt", "desc"],
      limit: MESSAGE_LIMIT,
    });

    cachedMessages = rows;
    refreshUnreadCount();
    handleIncomingMessages(rows);
  } catch (error) {
    console.error("[chatAlerts] failed to load chat messages", error);
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    loadMessages();
  }
}

function resetState() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  alertTimers.forEach((timer) => clearTimeout(timer));
  alertTimers.clear();
  alertList.value = [];
  seenMessageIds.clear();
  cachedMessages = [];
  totalUnread.value = 0;
  isPrimed = false;
  sessionStartedAt = "";
  applyTitleBadge(0);
}

export function stopChatAlerts() {
  isRunning.value = false;
  tableNumber.value = "";
  resetState();
}

export function startChatAlerts() {
  const nextTableNumber = readEntryTableNumber();

  if (!nextTableNumber) {
    stopChatAlerts();
    return;
  }

  if (isRunning.value && tableNumber.value === nextTableNumber) {
    loadMessages();
    return;
  }

  stopChatAlerts();
  tableNumber.value = nextTableNumber;
  isRunning.value = true;
  sessionStartedAt = new Date().toISOString();
  registerSoundUnlock();

  if (!hasVisibilityListener) {
    hasVisibilityListener = true;
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  unsubscribeMessages = subscribeTable("chatMessages", loadMessages, {
    pollMs: POLL_MS,
  });
}

// Called when the customer leaves the chat view so the badge reflects the
// read markers that the chat view just stored in localStorage.
export function refreshChatAlerts() {
  if (isRunning.value) {
    loadMessages();
  }
}

watch(totalUnread, (count) => {
  if (typeof document !== "undefined") {
    applyTitleBadge(count);
  }
});

export function useChatAlerts() {
  return {
    alertList: computed(() => alertList.value),
    totalUnread: computed(() => totalUnread.value),
    dismissAlert,
    refreshChatAlerts,
  };
}
