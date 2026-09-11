// Table gifts: the sender pays, the order is booked on the sender's sheet and
// staff delivers the menu to the receiving table (tablet shows a 🎁 badge).
import { fetchList, insertRow, newId, nowIso } from "@/lib/supabase";
import { recalculateOrderSheetTotals } from "@/lib/orderSheetTotals";
import { normalizeTableNumber } from "@/lib/orderSheet";
import {
  CHAT_MESSAGE_TYPE,
  CHAT_ROOM_TYPE,
  GLOBAL_ROOM_KEY,
  buildDirectRoomKey,
  formatTableLabel,
  sendChatMessage,
} from "@/lib/chat";

export function buildGiftItemSummary(items) {
  return (items || [])
    .map(
      (item) =>
        `${String(item?.productName || "메뉴").trim()} ${Number(
          item?.quantity || 0
        )}개`
    )
    .join(", ");
}

export function buildGiftOrderRequestMessage({ toLabel, requestMessage }) {
  const memo = String(requestMessage || "").trim();

  return memo ? `🎁 ${toLabel} 선물 · ${memo}` : `🎁 ${toLabel} 선물`;
}

function getTodayStartIso() {
  const start = new Date();

  start.setHours(0, 0, 0, 0);

  return start.toISOString();
}

function formatRankingPrice(price) {
  return Number(price || 0).toLocaleString("ko-KR");
}

// Today's gift ranking: one row per sending table, sorted by total price.
export async function fetchTodayGiftRanking({ limit = 300 } = {}) {
  const orders = await fetchList("orders", {
    columns: [
      "id",
      "orderSheetId",
      "tableNumber",
      "displayName",
      "totalPrice",
      "createdAt",
    ],
    filters: [
      ["isGift", "eq", true],
      ["status", "neq", "CANCELLED"],
      ["createdAt", "gte", getTodayStartIso()],
    ],
    order: ["createdAt", "desc"],
    limit,
  });

  const sheetIds = [
    ...new Set(orders.map((order) => order.orderSheetId).filter(Boolean)),
  ];
  const nicknameMap = {};

  if (sheetIds.length > 0) {
    const sheetRows = await fetchList("orderSheets", {
      columns: ["id", "tableNickname"],
      filters: [["id", "in", sheetIds]],
    });

    sheetRows.forEach((row) => {
      nicknameMap[row.orderSheetId] = row.tableNickname || "";
    });
  }

  const rankingMap = new Map();

  orders.forEach((order) => {
    const tableNumber = normalizeTableNumber(order.tableNumber);

    if (!tableNumber) {
      return;
    }

    const entry = rankingMap.get(tableNumber) || {
      tableNumber,
      nickname: "",
      totalPrice: 0,
      count: 0,
    };

    entry.nickname = nicknameMap[order.orderSheetId] || entry.nickname;
    entry.totalPrice += Number(order.totalPrice || 0);
    entry.count += 1;
    rankingMap.set(tableNumber, entry);
  });

  return [...rankingMap.values()]
    .sort((a, b) => b.totalPrice - a.totalPrice)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      label: formatTableLabel(entry.tableNumber, entry.nickname),
    }));
}

export function buildGiftRankingLine(ranking, { limit = 1 } = {}) {
  const top = (ranking || []).slice(0, limit);

  if (top.length === 0) {
    return "";
  }

  const medals = ["🥇", "🥈", "🥉"];

  return top
    .map(
      (entry, index) =>
        `${medals[index] || `${entry.rank}위`} ${
          entry.label
        } ${formatRankingPrice(entry.totalPrice)}원`
    )
    .join(" · ");
}

export async function sendGiftOrder({
  orderSheetId,
  fromTableNumber,
  fromNickname,
  fromDisplayName,
  toTableNumber,
  toNickname,
  items,
  requestMessage = "",
}) {
  const safeOrderSheetId = String(orderSheetId || "").trim();
  const senderTableNumber = normalizeTableNumber(fromTableNumber);
  const receiverTableNumber = normalizeTableNumber(toTableNumber);

  if (!safeOrderSheetId) {
    throw new Error("주문서 정보가 없어요.");
  }

  if (!senderTableNumber || !receiverTableNumber) {
    throw new Error("선물할 테이블을 선택해주세요.");
  }

  if (senderTableNumber === receiverTableNumber) {
    throw new Error("우리 테이블에는 선물할 수 없어요.");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("선물할 메뉴를 선택해주세요.");
  }

  const totalCount = items.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );
  const totalPrice = items.reduce(
    (total, item) => total + Number(item.totalPrice || 0),
    0
  );
  const toLabel = formatTableLabel(receiverTableNumber, toNickname);
  const fromLabel = formatTableLabel(senderTableNumber, fromNickname);
  const summary = buildGiftItemSummary(items);
  const now = nowIso();
  const orderId = newId();

  await insertRow("orders", {
    id: orderId,
    orderSheetId: safeOrderSheetId,
    tableNumber: senderTableNumber,
    displayName: String(fromDisplayName || "").trim(),
    requestMessage: buildGiftOrderRequestMessage({
      toLabel,
      requestMessage,
    }),
    items,
    totalCount,
    totalPrice,
    status: "REQUESTED",
    isGift: true,
    giftToTableNumber: receiverTableNumber,
    giftToNickname: String(toNickname || "").trim(),
    createdAt: now,
    updatedAt: now,
  });

  await recalculateOrderSheetTotals(safeOrderSheetId);

  // Ranking failures must not break the gift itself.
  let ranking = [];

  try {
    ranking = await fetchTodayGiftRanking();
  } catch (error) {
    console.error("선물 랭킹 조회 실패:", error);
  }

  const rankingLine =
    ranking.length > 0
      ? `🏆 오늘 1위 ${ranking[0].label} ${formatRankingPrice(
          ranking[0].totalPrice
        )}원`
      : "";
  const sender = {
    tableNumber: senderTableNumber,
    nickname: String(fromNickname || "").trim(),
  };
  const giftMessage = `🎁 ${fromLabel}님이 ${toLabel}님께 선물을 보냈어요! (${summary})`;
  const notices = [];

  const directRoomKey = buildDirectRoomKey(
    senderTableNumber,
    receiverTableNumber
  );

  if (directRoomKey) {
    notices.push(
      sendChatMessage({
        roomType: CHAT_ROOM_TYPE.DIRECT,
        roomKey: directRoomKey,
        message: giftMessage,
        sender,
        recipientTableNumber: receiverTableNumber,
        messageType: CHAT_MESSAGE_TYPE.SYSTEM,
        senderLabel: "선물 알림",
      })
    );
  }

  notices.push(
    sendChatMessage({
      roomType: CHAT_ROOM_TYPE.GLOBAL,
      roomKey: GLOBAL_ROOM_KEY,
      message: `🎁 ${fromLabel} → ${toLabel} · ${summary}${
        rankingLine ? ` · ${rankingLine}` : ""
      }`,
      sender,
      messageType: CHAT_MESSAGE_TYPE.SYSTEM,
      senderLabel: "선물 알림",
    })
  );

  await Promise.all(notices);

  return { orderId, totalCount, totalPrice, summary, ranking };
}
