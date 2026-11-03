// 익명 하트: 보낸 사람은 상대 테이블에도 TV 화면에도 공개되지 않습니다.
// 서로 하트가 성사되면 TV에는 아무것도 띄우지 않고, 두 테이블의 1:1 채팅방에만
// 시스템 메시지를 남겨 두 테이블이 알림을 받고 바로 대화를 열 수 있게 합니다.
import {
  deleteWhere,
  fetchList,
  insertRow,
  newId,
  nowIso,
  updateRow,
} from "@/lib/supabase";
import {
  getBusinessDayStartIso,
  getCurrentBusinessDateInput,
} from "@/lib/businessDay";
import {
  CHAT_MESSAGE_TYPE,
  CHAT_ROOM_TYPE,
  buildDirectRoomKey,
  formatTableLabel,
  sendChatMessage,
} from "@/lib/chat";
import { normalizeTableNumber } from "@/lib/orderSheet";

export const HEART_COOLDOWN_MS = 30 * 1000;
export const HEART_DAILY_LIMIT = 20;

const HEART_FETCH_LIMIT = 200;
const HEART_PURGE_STORAGE_KEY = "honjaya.heartsPurgedDate";

let purgedBusinessDate = "";

// 오늘(영업일 기준) 하트만 조회합니다.
export async function fetchTodayHearts({ limit = HEART_FETCH_LIMIT } = {}) {
  return fetchList("hearts", {
    filters: [["businessDate", "gte", getBusinessDayStartIso()]],
    order: ["createdAt", "desc"],
    limit,
  });
}

// 하트를 보낼 수 있는 다른 테이블 목록 (현재 주문서가 열려 있는 테이블).
export async function fetchHeartTargets(myTableNumber) {
  const safeMyTableNumber = normalizeTableNumber(myTableNumber);
  const activeSheets = await fetchList("activeOrderSheets", {});
  const otherSheets = activeSheets.filter((sheet) => {
    return (
      normalizeTableNumber(sheet.tableNumber) !== safeMyTableNumber &&
      Boolean(sheet.orderSheetId)
    );
  });

  const nicknameMap = {};

  if (otherSheets.length > 0) {
    const sheetRows = await fetchList("orderSheets", {
      columns: ["id", "tableNickname"],
      filters: [["id", "in", otherSheets.map((sheet) => sheet.orderSheetId)]],
    });

    sheetRows.forEach((row) => {
      nicknameMap[row.orderSheetId] = row.tableNickname || "";
    });
  }

  return otherSheets
    .map((sheet) => {
      const tableNumber = normalizeTableNumber(sheet.tableNumber);
      const nickname = String(nicknameMap[sheet.orderSheetId] || "").trim();

      return {
        tableNumber,
        nickname,
        label: formatTableLabel(tableNumber, nickname),
      };
    })
    .filter((target) => target.tableNumber)
    .sort((first, second) => {
      return Number(first.tableNumber) - Number(second.tableNumber);
    });
}

export function getHeartCooldownRemainingMs(
  hearts,
  fromTableNumber,
  now = Date.now()
) {
  const safeFromTableNumber = normalizeTableNumber(fromTableNumber);

  if (!safeFromTableNumber) {
    return 0;
  }

  const last = (hearts || []).find((heart) => {
    return normalizeTableNumber(heart.fromTableNumber) === safeFromTableNumber;
  });

  if (!last) {
    return 0;
  }

  const elapsed = now - new Date(last.createdAt).getTime();

  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return 0;
  }

  return Math.max(0, HEART_COOLDOWN_MS - elapsed);
}

export function countHeartsSentBy(hearts, fromTableNumber) {
  const safeFromTableNumber = normalizeTableNumber(fromTableNumber);

  return (hearts || []).filter((heart) => {
    return normalizeTableNumber(heart.fromTableNumber) === safeFromTableNumber;
  }).length;
}

function findHeartCounterpart(hearts, fromTableNumber, toTableNumber) {
  return (
    (hearts || []).find((heart) => {
      return (
        normalizeTableNumber(heart.fromTableNumber) === toTableNumber &&
        normalizeTableNumber(heart.toTableNumber) === fromTableNumber
      );
    }) || null
  );
}

// 상호 하트 성사는 기록용으로만 표시하고 TV에는 노출하지 않습니다.
async function markMutualHearts(rows) {
  const now = nowIso();

  await Promise.all(
    rows.map((row) => {
      return updateRow("hearts", row.id, {
        isRevealed: true,
        updatedAt: now,
      });
    })
  );
}

// 서로 하트가 성사되면 두 테이블의 1:1 채팅방에 시스템 메시지를 남깁니다.
// 채팅 알림 파이프라인을 그대로 타기 때문에 상대 테이블 폰에 토스트/진동이 뜹니다.
async function notifyMutualHeart({
  senderTableNumber,
  senderNickname,
  receiverTableNumber,
  receiverNickname,
}) {
  const senderLabel = formatTableLabel(senderTableNumber, senderNickname);
  const receiverLabel = formatTableLabel(receiverTableNumber, receiverNickname);

  await sendChatMessage({
    roomType: CHAT_ROOM_TYPE.DIRECT,
    roomKey: buildDirectRoomKey(senderTableNumber, receiverTableNumber),
    message: `💗 서로 하트 성사! ${senderLabel} ↔ ${receiverLabel} 1:1 채팅이 열렸어요.`,
    sender: {
      tableNumber: senderTableNumber,
      nickname: senderNickname,
    },
    messageType: CHAT_MESSAGE_TYPE.SYSTEM,
  });
}

// ---- 영업일 하트 정리 -------------------------------------------------
// 하트는 당일 영업일 표시용이므로 지난 영업일 하트는 삭제합니다.

export async function clearHeartsBeforeToday(date = new Date()) {
  const removedIds = await deleteWhere("hearts", [
    ["businessDate", "lt", getBusinessDayStartIso(date)],
  ]);

  return removedIds.length;
}

export async function ensureHeartsClearedForToday(date = new Date()) {
  const todayInput = getCurrentBusinessDateInput(date);

  if (purgedBusinessDate === todayInput) {
    return 0;
  }

  try {
    if (localStorage.getItem(HEART_PURGE_STORAGE_KEY) === todayInput) {
      purgedBusinessDate = todayInput;
      return 0;
    }
  } catch (error) {
    // 저장소를 못 읽어도 정리는 그대로 진행합니다.
  }

  let removedCount = 0;

  try {
    removedCount = await clearHeartsBeforeToday(date);
  } catch (error) {
    console.error("[hearts] 지난 영업일 하트를 정리하지 못했어요", error);
    return 0;
  }

  purgedBusinessDate = todayInput;

  try {
    localStorage.setItem(HEART_PURGE_STORAGE_KEY, todayInput);
  } catch (error) {
    // 메모리 값으로 중복 실행을 막습니다.
  }

  return removedCount;
}

export async function sendAnonymousHeart({
  fromTableNumber,
  fromNickname = "",
  toTableNumber,
  toNickname = "",
}) {
  const senderTableNumber = normalizeTableNumber(fromTableNumber);
  const receiverTableNumber = normalizeTableNumber(toTableNumber);

  if (!senderTableNumber) {
    throw new Error("테이블 정보가 없어 하트를 보낼 수 없어요.");
  }

  if (!receiverTableNumber) {
    throw new Error("하트를 보낼 테이블을 선택해주세요.");
  }

  if (senderTableNumber === receiverTableNumber) {
    throw new Error("우리 테이블에는 하트를 보낼 수 없어요.");
  }

  const todayHearts = await fetchTodayHearts();
  const cooldownMs = getHeartCooldownRemainingMs(
    todayHearts,
    senderTableNumber
  );

  if (cooldownMs > 0) {
    throw new Error(
      `하트는 ${Math.ceil(cooldownMs / 1000)}초 뒤에 다시 보낼 수 있어요.`
    );
  }

  if (countHeartsSentBy(todayHearts, senderTableNumber) >= HEART_DAILY_LIMIT) {
    throw new Error(`하트는 하루 ${HEART_DAILY_LIMIT}개까지 보낼 수 있어요.`);
  }

  const now = nowIso();
  const senderNickname = String(fromNickname || "").trim();
  const receiverNickname = String(toNickname || "").trim();
  const heart = await insertRow("hearts", {
    id: newId(),
    fromTableNumber: senderTableNumber,
    fromNickname: senderNickname,
    toTableNumber: receiverTableNumber,
    toNickname: receiverNickname,
    businessDate: getBusinessDayStartIso(),
    isRevealed: false,
    createdAt: now,
    updatedAt: now,
  });

  const counterpart = findHeartCounterpart(
    todayHearts,
    senderTableNumber,
    receiverTableNumber
  );

  if (!counterpart) {
    return { heart, mutual: false, counterpart: null };
  }

  try {
    await markMutualHearts([heart, counterpart]);
  } catch (error) {
    // 기록 실패가 하트 전송 자체를 막지 않게 합니다.
    console.error("상호 하트 기록 실패:", error);
  }

  try {
    await notifyMutualHeart({
      senderTableNumber,
      senderNickname: senderNickname || counterpart.toNickname || "",
      receiverTableNumber,
      receiverNickname: receiverNickname || counterpart.fromNickname || "",
    });
  } catch (error) {
    // 1:1 채팅 알림 실패도 하트 전송 결과를 뒤집지 않습니다.
    console.error("상호 하트 채팅 알림 실패:", error);
  }

  return { heart, mutual: true, counterpart };
}
