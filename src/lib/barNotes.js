// 오늘의 한 줄: 손님이 주문서마다 한 줄을 남기고 매장 TV 보드에 노출됩니다.
// 한 주문서(테이블)당 영업일 하루 1개이며, 작성 후 수정·삭제할 수 있습니다.
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
import { normalizeTableNumber } from "@/lib/orderSheet";
import { maskProfanity } from "@/lib/profanity";

export const BAR_NOTE_MAX_LENGTH = 10;
export const BAR_NOTE_EDIT_COOLDOWN_MS = 30 * 1000;

const BAR_NOTE_FETCH_LIMIT = 200;
const BAR_NOTE_PURGE_STORAGE_KEY = "honjaya.barNotesPurgedDate";

let purgedBusinessDate = "";

export function countBarNoteLength(text) {
  return [...String(text || "").trim()].length;
}

export function getBarNoteErrorMessage(text) {
  const value = String(text || "").trim();

  if (!value) {
    return "오늘의 한 줄을 입력해주세요.";
  }

  if (countBarNoteLength(value) > BAR_NOTE_MAX_LENGTH) {
    return `한 줄은 ${BAR_NOTE_MAX_LENGTH}자까지 쓸 수 있어요.`;
  }

  return "";
}

// TV 보드에 뿌릴 오늘의 한 줄 (최신순).
export async function fetchTodayBarNotes({
  limit = BAR_NOTE_FETCH_LIMIT,
} = {}) {
  const dayMs = 24 * 60 * 60 * 1000;
  const nextDayStartIso = getBusinessDayStartIso(new Date(Date.now() + dayMs));
  const rows = await fetchList("barNotes", {
    filters: [
      ["businessDate", "gte", getBusinessDayStartIso()],
      ["businessDate", "lt", nextDayStartIso],
      ["isHidden", "eq", false],
    ],
    order: ["createdAt", "desc"],
    limit,
  });

  return rows;
}

// 내 주문서의 오늘 한 줄.
export async function fetchMyBarNote({ orderSheetId, date = new Date() }) {
  const safeOrderSheetId = String(orderSheetId || "").trim();

  if (!safeOrderSheetId) {
    return null;
  }

  const rows = await fetchList("barNotes", {
    filters: [
      ["orderSheetId", "eq", safeOrderSheetId],
      ["businessDate", "eq", getBusinessDayStartIso(date)],
    ],
    limit: 1,
  });

  return rows[0] || null;
}

export async function saveMyBarNote({
  orderSheetId,
  tableNumber,
  nickname = "",
  message,
  date = new Date(),
}) {
  const safeOrderSheetId = String(orderSheetId || "").trim();

  if (!safeOrderSheetId) {
    throw new Error("주문서 정보가 없어 한 줄을 남길 수 없어요.");
  }

  const errorMessage = getBarNoteErrorMessage(message);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const safeMessage = maskProfanity(String(message || "").trim());
  const businessDate = getBusinessDayStartIso(date);
  const existing = await fetchMyBarNote({
    orderSheetId: safeOrderSheetId,
    date,
  });
  const now = nowIso();

  if (existing) {
    const updatedAt = new Date(existing.updatedAt).getTime();
    const elapsed = Date.now() - updatedAt;

    if (
      Number.isFinite(elapsed) &&
      elapsed >= 0 &&
      elapsed < BAR_NOTE_EDIT_COOLDOWN_MS
    ) {
      throw new Error(
        `한 줄은 ${Math.ceil(
          (BAR_NOTE_EDIT_COOLDOWN_MS - elapsed) / 1000
        )}초 뒤에 다시 수정할 수 있어요.`
      );
    }

    const updatedRow = await updateRow("barNotes", existing.id, {
      message: safeMessage,
      nickname: String(nickname || "").trim(),
      updatedAt: now,
    });

    return (
      updatedRow || {
        ...existing,
        message: safeMessage,
        nickname: String(nickname || "").trim(),
        updatedAt: now,
      }
    );
  }

  return insertRow("barNotes", {
    id: newId(),
    orderSheetId: safeOrderSheetId,
    tableNumber: normalizeTableNumber(tableNumber),
    nickname: String(nickname || "").trim(),
    message: safeMessage,
    businessDate,
    isHidden: false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteMyBarNote(noteId) {
  const safeNoteId = String(noteId || "").trim();

  if (!safeNoteId) {
    return 0;
  }

  const removedIds = await deleteWhere("barNotes", [["id", "eq", safeNoteId]]);

  return removedIds.length;
}

// 테이블 정리/결제 완료 시 그 테이블의 한 줄을 지웁니다.
export async function clearBarNotesForTable(tableNumber) {
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeTableNumber) {
    return 0;
  }

  const removedIds = await deleteWhere("barNotes", [
    ["tableNumber", "eq", safeTableNumber],
  ]);

  return removedIds.length;
}

// 지난 영업일 한 줄은 TV 보드에 남기지 않으므로 삭제합니다.
export async function clearBarNotesBeforeToday(date = new Date()) {
  const removedIds = await deleteWhere("barNotes", [
    ["businessDate", "lt", getBusinessDayStartIso(date)],
  ]);

  return removedIds.length;
}

export async function ensureBarNotesClearedForToday(date = new Date()) {
  const todayInput = getCurrentBusinessDateInput(date);

  if (purgedBusinessDate === todayInput) {
    return 0;
  }

  try {
    if (localStorage.getItem(BAR_NOTE_PURGE_STORAGE_KEY) === todayInput) {
      purgedBusinessDate = todayInput;
      return 0;
    }
  } catch (error) {
    // 저장소를 못 읽어도 정리는 그대로 진행합니다.
  }

  let removedCount = 0;

  try {
    removedCount = await clearBarNotesBeforeToday(date);
  } catch (error) {
    console.error("[barNotes] 지난 영업일 한 줄을 정리하지 못했어요", error);
    return 0;
  }

  purgedBusinessDate = todayInput;

  try {
    localStorage.setItem(BAR_NOTE_PURGE_STORAGE_KEY, todayInput);
  } catch (error) {
    // 메모리 값으로 중복 실행을 막습니다.
  }

  return removedCount;
}
