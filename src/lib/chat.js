// Chat helpers for the table room system.
//
// Rooms are encoded in chat_messages.room_key:
//   global            -> every table shares one lounge chat
//   staff_3           -> table 3 <-> staff (admin)
//   dm_3_7            -> table 3 <-> table 7 (numbers sorted ascending)
import {
  deleteWhere,
  fetchList,
  insertRow,
  newId,
  nowIso,
  toTime,
} from "@/lib/supabase";
import {
  getBusinessDayStartIso,
  getCurrentBusinessDateInput,
} from "@/lib/businessDay";
import { normalizeTableNumber } from "@/lib/orderSheet";

export const CHAT_ROOM_TYPE = {
  GLOBAL: "GLOBAL",
  STAFF: "STAFF",
  DIRECT: "DIRECT",
};

export const CHAT_MESSAGE_TYPE = {
  USER: "USER",
  ADMIN: "ADMIN",
  SYSTEM: "SYSTEM",
};

export const GLOBAL_ROOM_KEY = "global";
export const STAFF_LABEL = "직원";
export const CHAT_MESSAGE_MAX_LENGTH = 300;

const CHAT_READ_STORAGE_KEY = "honjaya.chat.readAt";
const CHAT_BLOCK_STORAGE_KEY = "honjaya.chat.blockedTables";
const CHAT_PURGE_STORAGE_KEY = "honjaya.chat.purgedBusinessDate";

export const QUICK_PHRASES = [
  "안녕하세요! 🍻",
  "이거 하나 더 주문할게요 🍺",
  "물 좀 주세요 💧",
  "우리 테이블에 놀러오세요 🎉",
  "노래 한 곡 신청할게요 🎤",
  "건배! 🥂",
];

// One-touch calls: the message goes to the table's staff room so only the
// staff sees it (no need to type anything).
export const QUICK_CALL_ACTIONS = [
  {
    id: "staff",
    icon: "🔔",
    label: "직원 호출",
    message: "🔔 직원 호출합니다",
  },
  { id: "water", icon: "💧", label: "물 주세요", message: "💧 물 주세요" },
  { id: "plate", icon: "🍽️", label: "앞접시", message: "🍽️ 앞접시 주세요" },
  {
    id: "utensil",
    icon: "🥢",
    label: "수저·젓가락",
    message: "🥢 수저·젓가락 주세요",
  },
  { id: "tissue", icon: "🧻", label: "물티슈", message: "🧻 물티슈 주세요" },
];

// Event requests for parties: staff sees them highlighted in the staff room.
export const EVENT_REQUESTS = [
  {
    id: "song",
    icon: "🎤",
    label: "노래 신청",
    placeholder: "신청할 곡명이나 가수를 적어주세요",
  },
  {
    id: "birthday",
    icon: "🎂",
    label: "생일 이벤트",
    placeholder: "생일인 분의 이름을 적어주세요",
  },
  {
    id: "cheer",
    icon: "🥂",
    label: "건배 이벤트",
    placeholder: "건배 멘트를 적어주세요",
  },
  {
    id: "anniversary",
    icon: "💐",
    label: "기념일 이벤트",
    placeholder: "기념일 종류를 적어주세요",
  },
  {
    id: "dance",
    icon: "🕺",
    label: "댄스 타임",
    placeholder: "원하는 곡이나 요청사항을 적어주세요",
  },
];

// Messages starting with these icons are calls/event requests: staff UIs show
// them with a highlight and count them as alerts.
export const CHAT_ALERT_PREFIXES = [
  "🔔",
  "💧",
  "🍽️",
  "🥢",
  "🧻",
  "🎤",
  "🎂",
  "🥂",
  "💐",
  "🕺",
  "⚠️",
];

export function buildStaffRoomKey(tableNumber) {
  const safeTableNumber = normalizeTableNumber(tableNumber);

  return safeTableNumber ? `staff_${safeTableNumber}` : "";
}

export function buildDirectRoomKey(firstTableNumber, secondTableNumber) {
  const first = normalizeTableNumber(firstTableNumber);
  const second = normalizeTableNumber(secondTableNumber);

  if (!first || !second || first === second) {
    return "";
  }

  const [small, large] = [first, second].sort((a, b) => Number(a) - Number(b));

  return `dm_${small}_${large}`;
}

export function parseDirectRoomKey(roomKey) {
  const match = /^dm_(\d+)_(\d+)$/.exec(String(roomKey || "").trim());

  if (!match) {
    return [];
  }

  return [match[1], match[2]];
}

// "staff_3" -> "3" (empty string when the key is not a staff room)
export function parseStaffRoomKey(roomKey) {
  const match = /^staff_(\d+)$/.exec(String(roomKey || "").trim());

  return match ? match[1] : "";
}

// "홍길동(3번)" / "3번 테이블"
export function formatTableLabel(tableNumber, nickname) {
  const safeTableNumber = normalizeTableNumber(tableNumber);
  const safeNickname = String(nickname || "").trim();

  if (safeTableNumber && safeNickname) {
    return `${safeNickname}(${safeTableNumber}번)`;
  }

  if (safeTableNumber) {
    return `${safeTableNumber}번 테이블`;
  }

  return safeNickname || "테이블";
}

export function isOwnMessage(message, tableNumber) {
  const myTableNumber = normalizeTableNumber(tableNumber);
  const messageTableNumber = normalizeTableNumber(message?.tableNumber);

  return Boolean(myTableNumber) && myTableNumber === messageTableNumber;
}

function readChatReadMap() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(CHAT_READ_STORAGE_KEY) || "{}"
    );

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

export function getRoomLastReadAt(roomKey) {
  if (!roomKey) {
    return "";
  }

  return readChatReadMap()[roomKey] || "";
}

export function markRoomRead(roomKey, readAt = nowIso()) {
  if (!roomKey) {
    return;
  }

  try {
    const readMap = readChatReadMap();

    readMap[roomKey] = readAt;
    localStorage.setItem(CHAT_READ_STORAGE_KEY, JSON.stringify(readMap));
  } catch (error) {
    // 읽음 표시는 저장 실패해도 채팅 흐름을 막지 않는다.
  }
}

// messages: already filtered to the room (or not - rows of another room are skipped)
export function countUnreadMessages(messages, options = {}) {
  const { roomKey, tableNumber } = options;
  const readTime = toTime(getRoomLastReadAt(roomKey));

  return (messages || []).filter((message) => {
    if (!message || message.isDeleted || message.roomKey !== roomKey) {
      return false;
    }

    if (isOwnMessage(message, tableNumber)) {
      return false;
    }

    return toTime(message.createdAt) > readTime;
  }).length;
}

export async function sendChatMessage({
  roomType,
  roomKey,
  message,
  sender = {},
  recipientTableNumber = "",
  messageType = CHAT_MESSAGE_TYPE.USER,
  senderLabel = "",
}) {
  const text = String(message || "").trim();

  if (!text) {
    throw new Error("보낼 메시지를 입력해주세요.");
  }

  if (text.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new Error(
      `메시지는 ${CHAT_MESSAGE_MAX_LENGTH}자까지 보낼 수 있어요.`
    );
  }

  const now = nowIso();

  return insertRow("chatMessages", {
    id: newId(),
    message: text,
    messageType,
    tableNumber: normalizeTableNumber(sender.tableNumber),
    nickname: String(sender.nickname || "").trim(),
    senderLabel: String(senderLabel || "").trim(),
    isDeleted: false,
    roomType: roomType || CHAT_ROOM_TYPE.GLOBAL,
    roomKey: roomKey || GLOBAL_ROOM_KEY,
    recipientTableNumber: normalizeTableNumber(recipientTableNumber),
    createdAt: now,
    updatedAt: now,
  });
}

// Calls / event requests always land in the table's staff room.
export function isAlertMessage(message) {
  const text = String(message?.message || "").trim();

  if (!text) {
    return false;
  }

  return CHAT_ALERT_PREFIXES.some((prefix) => text.startsWith(prefix));
}

export async function sendStaffAlert({
  tableNumber,
  nickname,
  message,
  senderLabel = "호출",
  announceGlobal = false,
}) {
  const safeTableNumber = normalizeTableNumber(tableNumber);
  const staffRoomKey = buildStaffRoomKey(safeTableNumber);
  const text = String(message || "").trim();

  if (!staffRoomKey) {
    throw new Error("테이블 정보가 없어 알림을 보낼 수 없어요.");
  }

  if (!text) {
    throw new Error("알림 내용이 없어요.");
  }

  const sender = {
    tableNumber: safeTableNumber,
    nickname: String(nickname || "").trim(),
  };
  const tasks = [
    sendChatMessage({
      roomType: CHAT_ROOM_TYPE.STAFF,
      roomKey: staffRoomKey,
      message: text,
      sender,
      messageType: CHAT_MESSAGE_TYPE.USER,
      senderLabel,
    }),
  ];

  if (announceGlobal) {
    tasks.push(
      sendChatMessage({
        roomType: CHAT_ROOM_TYPE.GLOBAL,
        roomKey: GLOBAL_ROOM_KEY,
        message: `${formatTableLabel(safeTableNumber, nickname)} · ${text}`,
        sender,
        messageType: CHAT_MESSAGE_TYPE.SYSTEM,
        senderLabel: "이벤트 알림",
      })
    );
  }

  await Promise.all(tasks);
}

// Reporting a message keeps a trace in the staff room; the reporter also hides
// that table locally (see the block helpers below).
export async function reportChatMessage({
  tableNumber,
  nickname,
  targetLabel,
  message,
}) {
  const safeTableNumber = normalizeTableNumber(tableNumber);
  const staffRoomKey = buildStaffRoomKey(safeTableNumber);

  if (!staffRoomKey) {
    throw new Error("테이블 정보가 없어 신고할 수 없어요.");
  }

  const preview = String(message || "")
    .trim()
    .slice(0, 100);

  await sendChatMessage({
    roomType: CHAT_ROOM_TYPE.STAFF,
    roomKey: staffRoomKey,
    message: `⚠️ 신고 접수 · ${targetLabel || "알 수 없음"} · "${preview}"`,
    sender: {
      tableNumber: safeTableNumber,
      nickname: String(nickname || "").trim(),
    },
    messageType: CHAT_MESSAGE_TYPE.USER,
    senderLabel: "신고 접수",
  });
}

function readBlockedTableNumbers() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(CHAT_BLOCK_STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeTableNumber(item))
      .filter((item) => Boolean(item));
  } catch (error) {
    return [];
  }
}

function writeBlockedTableNumbers(list) {
  try {
    localStorage.setItem(
      CHAT_BLOCK_STORAGE_KEY,
      JSON.stringify([...new Set(list.filter(Boolean))])
    );
  } catch (error) {
    // 차단 목록 저장이 실패해도 채팅 흐름은 계속 진행한다.
  }
}

export function getBlockedTableNumbers() {
  return readBlockedTableNumbers();
}

export function blockTableNumber(tableNumber) {
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeTableNumber) {
    return readBlockedTableNumbers();
  }

  const nextList = [...readBlockedTableNumbers(), safeTableNumber];

  writeBlockedTableNumbers(nextList);

  return [...new Set(nextList)];
}

export function unblockTableNumber(tableNumber) {
  const safeTableNumber = normalizeTableNumber(tableNumber);
  const nextList = readBlockedTableNumbers().filter(
    (item) => item !== safeTableNumber
  );

  writeBlockedTableNumbers(nextList);

  return nextList;
}

export function clearBlockedTableNumbers() {
  writeBlockedTableNumbers([]);

  return [];
}

export function isBlockedTableNumber(tableNumber, blockedList) {
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeTableNumber) {
    return false;
  }

  return (blockedList || []).includes(safeTableNumber);
}

// ---- 영업일 채팅 정리 -------------------------------------------------
// 채팅은 영업일(KST 15:00 ~ 익일 14:59:59) 안에서만 유지합니다.

let purgedBusinessDate = "";

// 지금 영업일이 시작된 시각(ISO). 이 시각 이전 메시지는 지난 영업일 것입니다.
export function getChatDayStartIso(date = new Date()) {
  return getBusinessDayStartIso(date);
}

// 지난 영업일 채팅(전체/직원/1:1)을 모두 삭제합니다.
export async function clearChatMessagesBeforeToday(date = new Date()) {
  const removedIds = await deleteWhere("chatMessages", [
    ["createdAt", "lt", getChatDayStartIso(date)],
  ]);

  return removedIds.length;
}

// 앱이 켜져 있을 때 호출합니다. 기기마다 영업일당 한 번만 정리합니다.
export async function ensureChatMessagesClearedForToday() {
  const todayInput = getCurrentBusinessDateInput();

  if (purgedBusinessDate === todayInput) {
    return 0;
  }

  try {
    if (localStorage.getItem(CHAT_PURGE_STORAGE_KEY) === todayInput) {
      purgedBusinessDate = todayInput;
      return 0;
    }
  } catch (error) {
    // 저장소를 못 읽어도 정리는 그대로 진행합니다.
  }

  let removedCount = 0;

  try {
    removedCount = await clearChatMessagesBeforeToday();
  } catch (error) {
    console.error("[chat] 지난 영업일 채팅을 정리하지 못했어요", error);
    return 0;
  }

  purgedBusinessDate = todayInput;

  try {
    localStorage.setItem(CHAT_PURGE_STORAGE_KEY, todayInput);
  } catch (error) {
    // 메모리 값으로 중복 실행을 막습니다.
  }

  return removedCount;
}

// 손님이 결제하고 나가면 그 테이블의 1:1 채팅을 통째로 지웁니다.
// 방 테이블이 따로 없으므로 room_key(dm_3_7)의 메시지가 곧 채팅방입니다.
export async function clearDirectChatMessagesForTable(tableNumber) {
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeTableNumber) {
    return 0;
  }

  const directRows = await fetchList("chatMessages", {
    columns: ["id", "roomKey"],
    filters: [["roomType", "eq", CHAT_ROOM_TYPE.DIRECT]],
    limit: 1000,
  });

  const targetIds = directRows
    .filter((row) => parseDirectRoomKey(row.roomKey).includes(safeTableNumber))
    .map((row) => row.id);

  if (targetIds.length === 0) {
    return 0;
  }

  await deleteWhere("chatMessages", [["id", "in", targetIds]]);

  return targetIds.length;
}
