<template>
  <div
    class="tv-root"
    :class="{ 'is-cursor-visible': isCursorVisible }"
    @mousemove="revealCursor"
  >
    <div class="tv-stage" :style="stageStyle">
      <svg class="sprite-defs" aria-hidden="true" focusable="false">
        <defs>
          <g id="tv-guest">
            <rect
              v-for="rect in guestRects"
              :key="rect.key"
              :x="rect.x"
              :y="rect.y"
              width="1"
              height="1"
              :fill="rect.fill"
            />
          </g>
        </defs>
      </svg>

      <header class="tv-header">
        <div class="tv-brand">
          <span class="tv-brand-name">혼자야</span>
          <span class="tv-brand-sub">PIXEL BAR</span>
        </div>

        <div class="tv-status">
          <span class="tv-live" :class="{ 'is-offline': !isOnline }">
            {{ isOnline ? "LIVE" : "OFFLINE" }}
          </span>
          <span class="tv-clock">{{ clockText }}</span>
        </div>
      </header>

      <main class="tv-main">
        <section class="tv-scene">
          <div class="scene-wall" aria-hidden="true">
            <div class="scene-neon">BAR</div>
            <div class="scene-shelf">
              <span
                v-for="bottle in shelfBottles"
                :key="bottle.key"
                class="shelf-bottle"
                :style="bottle.style"
              ></span>
            </div>
          </div>

          <div class="scene-seats">
            <div
              v-for="(seat, index) in seats"
              :key="seat.tableNumber"
              class="seat"
              :style="seatStyle(index)"
            >
              <transition name="bubble-pop">
                <div v-if="bubbles[seat.tableNumber]" class="seat-bubble">
                  <span class="seat-bubble-from">
                    {{ bubbles[seat.tableNumber].label }}
                  </span>
                  <span class="seat-bubble-text">
                    {{ bubbles[seat.tableNumber].text }}
                  </span>
                </div>
              </transition>

              <svg
                class="seat-guest"
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
              >
                <use href="#tv-guest" />
              </svg>

              <div class="seat-plate">
                <span class="seat-plate-name">{{ seat.label }}</span>
                <span class="seat-plate-table">{{ seat.tableNumber }}번</span>
              </div>
            </div>

            <p v-if="seats.length === 0" class="scene-empty">
              아직 자리에 앉은 손님이 없어요
            </p>
          </div>

          <div class="scene-counter" aria-hidden="true">
            <div class="counter-top"></div>
            <div class="counter-front"></div>
          </div>
        </section>

        <aside class="tv-chat">
          <div class="tv-chat-head">
            <h2>최근 채팅</h2>
            <span class="tv-chat-room">전체</span>
          </div>

          <ul class="tv-chat-list">
            <li
              v-for="message in panelMessages"
              :key="message.id"
              class="tv-chat-item"
              :class="{ 'is-staff': message.isStaff }"
            >
              <span class="tv-chat-from">{{ message.from }}</span>
              <span class="tv-chat-text">{{ message.text }}</span>
            </li>
            <li v-if="panelMessages.length === 0" class="tv-chat-empty">
              아직 대화가 없어요. 첫 인사를 건네보세요.
            </li>
          </ul>

          <div class="tv-chat-foot">
            <span>
              {{ seats.length }}팀 참여 중
              <template v-if="seatOverflow > 0"
                >· 외 {{ seatOverflow }}팀</template
              >
            </span>
            <span class="tv-chat-foot-dot">●</span>
          </div>
        </aside>
      </main>

      <transition name="banner-fade">
        <footer v-if="banner" class="tv-banner" :class="`is-${banner.tone}`">
          <span class="tv-banner-tag">{{ banner.tag }}</span>
          <span class="tv-banner-text">{{ banner.text }}</span>
        </footer>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { fetchList, subscribeTable } from "@/lib/supabase";
import { GLOBAL_ROOM_KEY, formatTableLabel } from "@/lib/chat";
import { normalizeTableNumber } from "@/lib/orderSheet";

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const SEAT_LIMIT = 12;
const PANEL_LIMIT = 6;
const BUBBLE_DURATION_MS = 6000;
const BANNER_DURATION_MS = 9000;
const MESSAGE_FETCH_LIMIT = 60;
const BUBBLE_TEXT_LIMIT = 60;
const PANEL_TEXT_LIMIT = 54;
const CURSOR_IDLE_MS = 3000;
const DAWN_RELOAD_HOUR = 5;

// The TV only ever renders the global room. Direct (1:1) and staff rooms are
// deliberately never queried here so private chats cannot leak onto the screen.
const ROOM_TYPE_GLOBAL = "GLOBAL";
const MESSAGE_TYPE_STAFF = "ADMIN";
const MESSAGE_TYPE_SYSTEM = "SYSTEM";

const CELL_FILL = {
  h: "var(--hair)",
  f: "var(--skin)",
  e: "var(--eye)",
  m: "var(--mouth)",
  t: "var(--shirt)",
  s: "var(--skin)",
};

const GUEST_SPRITE = [
  "................",
  "................",
  ".....hhhhhh.....",
  "....hhhhhhhh....",
  "....hffffffh....",
  "....ffeffeff....",
  "....ffffffff....",
  ".....fmmmff.....",
  "......ffff......",
  "....tttttttt....",
  "...tttttttttt...",
  "..sttttttttts...",
  "..sttttttttts...",
  "...tttttttttt...",
  "....tttttttt....",
  "................",
];

const SEAT_PALETTES = [
  { hair: "#241f33", shirt: "#ff8a5c" },
  { hair: "#4a2f1f", shirt: "#5bc0eb" },
  { hair: "#1b2430", shirt: "#9ee37d" },
  { hair: "#5c3b6e", shirt: "#ffd166" },
  { hair: "#2b2b2b", shirt: "#ef476f" },
  { hair: "#6b3f1d", shirt: "#2ec4b6" },
];

const SHELF_COLORS = ["#7bdff2", "#f7a072", "#c6f68d", "#f6c667", "#a99bf5"];

const guestRects = [];

GUEST_SPRITE.forEach((row, y) => {
  [...row].forEach((cell, x) => {
    const fill = CELL_FILL[cell];

    if (fill) {
      guestRects.push({ key: `${x}-${y}`, x, y, fill });
    }
  });
});

const shelfBottles = Array.from({ length: 14 }, (_, index) => {
  const height = 26 + ((index * 13) % 34);
  const color = SHELF_COLORS[index % SHELF_COLORS.length];

  return {
    key: `bottle-${index}`,
    style: {
      height: `${height}px`,
      background: color,
      opacity: String(0.55 + (index % 3) * 0.15),
    },
  };
});

const stageScale = ref(1);
const isCursorVisible = ref(false);
const isOnline = ref(true);
const clockText = ref("");
const seats = ref([]);
const seatOverflow = ref(0);
const messages = ref([]);
const bubbles = reactive({});
const banner = ref(null);

const stageStyle = computed(() => ({
  transform: `scale(${stageScale.value})`,
}));

const panelMessages = computed(() => {
  return messages.value
    .filter((message) => {
      return (
        message.roomType === ROOM_TYPE_GLOBAL &&
        message.roomKey === GLOBAL_ROOM_KEY &&
        !message.isDeleted
      );
    })
    .slice(0, PANEL_LIMIT)
    .map((message) => {
      const isStaff = message.messageType === MESSAGE_TYPE_STAFF;

      return {
        id: message.id,
        isStaff,
        from: isStaff
          ? "직원"
          : formatTableLabel(message.tableNumber, message.nickname),
        text: truncate(message.message, PANEL_TEXT_LIMIT),
      };
    });
});

const seenMessageIds = new Set();
const bubbleTimers = new Map();
const subscriptionStops = [];
let hasLoadedMessages = false;
let bannerTimer = null;
let cursorTimer = null;
let clockTimer = null;
let dawnTimer = null;

function truncate(value, limit) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function seatStyle(index) {
  const palette = SEAT_PALETTES[index % SEAT_PALETTES.length];

  return {
    "--hair": palette.hair,
    "--shirt": palette.shirt,
  };
}

function updateStageScale() {
  const width = window.innerWidth || DESIGN_WIDTH;
  const height = window.innerHeight || DESIGN_HEIGHT;

  stageScale.value = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
}

function revealCursor() {
  isCursorVisible.value = true;

  if (cursorTimer) {
    clearTimeout(cursorTimer);
  }

  cursorTimer = setTimeout(() => {
    isCursorVisible.value = false;
    cursorTimer = null;
  }, CURSOR_IDLE_MS);
}

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  clockText.value = `${hours}:${minutes}`;
}

async function loadSeats() {
  try {
    const activeSheets = await fetchList("activeOrderSheets", {
      order: ["tableNumber", "asc"],
    });

    const sheetIds = activeSheets
      .map((sheet) => sheet.orderSheetId)
      .filter(Boolean);

    const nicknameMap = {};

    if (sheetIds.length > 0) {
      const sheetRows = await fetchList("orderSheets", {
        columns: ["id", "tableNickname"],
        filters: [["id", "in", sheetIds]],
      });

      sheetRows.forEach((row) => {
        nicknameMap[row.id] = row.tableNickname || "";
      });
    }

    const sortedSeats = activeSheets
      .map((sheet) => {
        const tableNumber = normalizeTableNumber(sheet.tableNumber);
        const nickname = String(nicknameMap[sheet.orderSheetId] || "").trim();

        return {
          tableNumber,
          nickname,
          label: nickname || "손님",
        };
      })
      .filter((seat) => Boolean(seat.tableNumber))
      .sort((first, second) => {
        return Number(first.tableNumber) - Number(second.tableNumber);
      });

    seatOverflow.value = Math.max(0, sortedSeats.length - SEAT_LIMIT);
    seats.value = sortedSeats.slice(0, SEAT_LIMIT);
  } catch (error) {
    console.error("[tv] 좌석 정보를 불러오지 못했어요", error);
  }
}

async function loadMessages() {
  try {
    const rows = await fetchList("chatMessages", {
      filters: [
        ["roomType", "eq", ROOM_TYPE_GLOBAL],
        ["roomKey", "eq", GLOBAL_ROOM_KEY],
        ["isDeleted", "eq", false],
      ],
      order: ["createdAt", "desc"],
      limit: MESSAGE_FETCH_LIMIT,
    });

    messages.value = rows;
    announceNewMessages(rows);
  } catch (error) {
    console.error("[tv] 채팅을 불러오지 못했어요", error);
  }
}

function announceNewMessages(rows) {
  const fresh = rows.filter((message) => !seenMessageIds.has(message.id));

  fresh.forEach((message) => seenMessageIds.add(message.id));

  if (!hasLoadedMessages) {
    hasLoadedMessages = true;
    return;
  }

  fresh.reverse().forEach((message) => {
    if (message.messageType === MESSAGE_TYPE_SYSTEM) {
      showBanner(message.message, { tag: "공지", tone: "notice" });
      return;
    }

    if (message.messageType === MESSAGE_TYPE_STAFF) {
      showBanner(message.message, { tag: "직원", tone: "staff" });
      return;
    }

    const tableNumber = normalizeTableNumber(message.tableNumber);

    if (tableNumber) {
      showBubble(tableNumber, message);
    }
  });
}

function showBubble(tableNumber, message) {
  const seat = seats.value.find((item) => item.tableNumber === tableNumber);
  const label = formatTableLabel(
    tableNumber,
    seat ? seat.nickname : message.nickname
  );

  bubbles[tableNumber] = {
    label,
    text: truncate(message.message, BUBBLE_TEXT_LIMIT),
  };

  const currentTimer = bubbleTimers.get(tableNumber);

  if (currentTimer) {
    clearTimeout(currentTimer);
  }

  bubbleTimers.set(
    tableNumber,
    setTimeout(() => {
      delete bubbles[tableNumber];
      bubbleTimers.delete(tableNumber);
    }, BUBBLE_DURATION_MS)
  );
}

function showBanner(message, { tag = "공지", tone = "notice" } = {}) {
  banner.value = {
    tag,
    tone,
    text: truncate(message, BUBBLE_TEXT_LIMIT * 2),
  };

  if (bannerTimer) {
    clearTimeout(bannerTimer);
  }

  bannerTimer = setTimeout(() => {
    banner.value = null;
    bannerTimer = null;
  }, BANNER_DURATION_MS);
}

function handleOnline() {
  isOnline.value = true;
  loadSeats();
  loadMessages();
}

function handleOffline() {
  isOnline.value = false;
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    loadSeats();
    loadMessages();
  }
}

function scheduleDawnReload() {
  const now = new Date();
  const next = new Date(now.getTime());

  next.setHours(DAWN_RELOAD_HOUR, 0, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  dawnTimer = setTimeout(() => {
    window.location.reload();
  }, next.getTime() - now.getTime());
}

function lockPageScroll() {
  document.body.style.overflow = "hidden";
  document.body.style.background = "#06060f";
}

function releasePageScroll() {
  document.body.style.overflow = "";
  document.body.style.background = "";
}

onMounted(() => {
  lockPageScroll();
  updateStageScale();
  updateClock();
  revealCursor();

  window.addEventListener("resize", updateStageScale);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  clockTimer = setInterval(updateClock, 15000);

  subscriptionStops.push(
    subscribeTable("activeOrderSheets", loadSeats, { pollMs: 60000 }),
    subscribeTable("chatMessages", loadMessages, { pollMs: 20000 })
  );

  scheduleDawnReload();
});

onUnmounted(() => {
  releasePageScroll();

  window.removeEventListener("resize", updateStageScale);
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
  document.removeEventListener("visibilitychange", handleVisibilityChange);

  subscriptionStops.forEach((stop) => stop());
  subscriptionStops.length = 0;

  bubbleTimers.forEach((timer) => clearTimeout(timer));
  bubbleTimers.clear();

  [clockTimer, bannerTimer, dawnTimer, cursorTimer].forEach((timer) => {
    if (timer) {
      clearTimeout(timer);
    }
  });

  clockTimer = null;
  bannerTimer = null;
  dawnTimer = null;
  cursorTimer = null;
});
</script>

<style scoped>
.tv-root {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(circle at 50% 20%, #161230 0%, #06060f 70%);
  cursor: none;
  user-select: none;
}

.tv-root.is-cursor-visible {
  cursor: default;
}

.sprite-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.tv-stage {
  position: relative;
  width: 1920px;
  height: 1080px;
  flex: 0 0 auto;
  transform-origin: center center;
  display: flex;
  flex-direction: column;
  padding: 28px 40px 36px;
  box-sizing: border-box;
  background: repeating-linear-gradient(
    90deg,
    #141029 0 40px,
    #191433 40px 80px
  );
  color: #f7f3ff;
  font-family: "DungGeunMo", "NeoDunggeunmo", "Malgun Gothic",
    "Apple SD Gothic Neo", monospace;
  letter-spacing: 0.02em;
  image-rendering: pixelated;
}

.tv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 92px;
  flex: 0 0 auto;
}

.tv-brand {
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.tv-brand-name {
  font-size: 44px;
  font-weight: 700;
  color: #ffe066;
  text-shadow: 4px 4px 0 #7a4b00;
}

.tv-brand-sub {
  font-size: 18px;
  letter-spacing: 0.4em;
  color: #9d8fd0;
}

.tv-status {
  display: flex;
  align-items: center;
  gap: 22px;
}

.tv-live {
  padding: 8px 18px;
  font-size: 18px;
  color: #06210f;
  background: #7cf29c;
  box-shadow: 4px 4px 0 #1c6b36;
}

.tv-live.is-offline {
  color: #2b0c0c;
  background: #ff8a8a;
  box-shadow: 4px 4px 0 #7a2020;
}

.tv-clock {
  font-size: 40px;
  font-variant-numeric: tabular-nums;
  color: #e9e4ff;
}

.tv-main {
  flex: 1 1 auto;
  display: flex;
  gap: 28px;
  min-height: 0;
}

.tv-scene {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  background: linear-gradient(180deg, #1d1740 0%, #241a4d 46%, #2c1f57 100%);
  box-shadow: inset 0 0 0 6px #0d0a1c;
}

.scene-wall {
  position: absolute;
  inset: 0 0 46% 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 40px;
  gap: 34px;
}

.scene-neon {
  font-size: 76px;
  letter-spacing: 0.34em;
  color: #ff77c8;
  text-shadow: 0 0 18px rgba(255, 119, 200, 0.7),
    6px 6px 0 rgba(60, 0, 40, 0.55);
}

.scene-shelf {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 0 40px 12px;
  height: 120px;
  border-bottom: 8px solid #4a3a7a;
}

.shelf-bottle {
  display: block;
  width: 22px;
  box-shadow: inset 0 -8px 0 rgba(0, 0, 0, 0.25);
}

.scene-seats {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap-reverse;
  align-items: flex-end;
  justify-content: center;
  gap: 10px 18px;
  padding: 0 48px 6px;
  max-height: 100%;
}

.seat {
  position: relative;
  width: 132px;
  display: flex;
  flex-direction: column;
  align-items: center;
  --skin: #f7d5b5;
  --eye: #241b33;
  --mouth: #c8627a;
}

.seat-guest {
  width: 132px;
  height: 132px;
  image-rendering: pixelated;
  filter: drop-shadow(0 10px 0 rgba(0, 0, 0, 0.28));
}

.seat-plate {
  margin-top: -10px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: #120f24;
  box-shadow: 0 0 0 4px #3d3168, 4px 4px 0 4px rgba(0, 0, 0, 0.4);
  min-width: 92px;
}

.seat-plate-name {
  font-size: 20px;
  color: #ffe066;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 108px;
}

.seat-plate-table {
  font-size: 14px;
  color: #9d8fd0;
}

.seat-bubble {
  position: absolute;
  bottom: 158px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
  max-width: 260px;
  padding: 12px 14px;
  background: #fdfbff;
  color: #1a1530;
  box-shadow: 0 0 0 4px #0d0a1c, 6px 6px 0 4px rgba(0, 0, 0, 0.35);
  z-index: 5;
}

.seat-bubble::after {
  content: "";
  position: absolute;
  bottom: -12px;
  left: 50%;
  width: 16px;
  height: 16px;
  transform: translateX(-50%) rotate(45deg);
  background: #fdfbff;
  box-shadow: 4px 4px 0 0 rgba(13, 10, 28, 1);
}

.seat-bubble-from {
  font-size: 14px;
  color: #7a5cff;
}

.seat-bubble-text {
  font-size: 20px;
  line-height: 1.35;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.scene-empty {
  width: 100%;
  padding: 40px 0;
  text-align: center;
  font-size: 26px;
  color: #9d8fd0;
}

.scene-counter {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  height: 168px;
}

.counter-top {
  height: 22px;
  background: repeating-linear-gradient(
    90deg,
    #a86b45 0 34px,
    #b5764c 34px 68px
  );
  box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.28),
    inset 0 4px 0 rgba(255, 255, 255, 0.18);
}

.counter-front {
  height: 146px;
  background: repeating-linear-gradient(
    90deg,
    #6b3f2a 0 68px,
    #74452e 68px 136px
  );
  box-shadow: inset 0 8px 0 rgba(0, 0, 0, 0.35);
}

.tv-chat {
  flex: 0 0 400px;
  display: flex;
  flex-direction: column;
  background: #100d20;
  box-shadow: inset 0 0 0 6px #241d43;
  padding: 22px 22px 16px;
  box-sizing: border-box;
}

.tv-chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 4px solid #241d43;
}

.tv-chat-head h2 {
  margin: 0;
  font-size: 24px;
  color: #ffe066;
}

.tv-chat-room {
  font-size: 14px;
  color: #9d8fd0;
  padding: 4px 10px;
  background: #1b1533;
}

.tv-chat-list {
  list-style: none;
  margin: 0;
  padding: 14px 0 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.tv-chat-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  background: #17122c;
  box-shadow: inset 0 0 0 3px #241d43;
}

.tv-chat-item.is-staff {
  background: #1d1a38;
  box-shadow: inset 0 0 0 3px #4a3a7a;
}

.tv-chat-from {
  font-size: 14px;
  color: #7cf29c;
}

.tv-chat-text {
  font-size: 18px;
  line-height: 1.4;
  color: #efeaff;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.tv-chat-empty {
  font-size: 18px;
  color: #9d8fd0;
  line-height: 1.5;
}

.tv-chat-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  margin-top: 12px;
  border-top: 4px solid #241d43;
  font-size: 16px;
  color: #9d8fd0;
}

.tv-chat-foot-dot {
  color: #7cf29c;
  animation: tv-blink 1.6s steps(2, end) infinite;
}

.tv-banner {
  position: absolute;
  left: 50%;
  bottom: 190px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 26px;
  max-width: 1180px;
  background: #1a1435;
  box-shadow: 0 0 0 6px #ffe066, 8px 8px 0 6px rgba(0, 0, 0, 0.4);
  z-index: 10;
}

.tv-banner.is-staff {
  box-shadow: 0 0 0 6px #7cf29c, 8px 8px 0 6px rgba(0, 0, 0, 0.4);
}

.tv-banner-tag {
  font-size: 16px;
  padding: 4px 10px;
  color: #1a1435;
  background: #ffe066;
}

.tv-banner.is-staff .tv-banner-tag {
  background: #7cf29c;
}

.tv-banner-text {
  font-size: 26px;
  color: #fdfbff;
  word-break: keep-all;
}

.bubble-pop-enter-active,
.bubble-pop-leave-active {
  transition: transform 160ms steps(3, end), opacity 160ms steps(3, end);
}

.bubble-pop-enter-from,
.bubble-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px) scale(0.92);
}

.banner-fade-enter-active,
.banner-fade-leave-active {
  transition: opacity 200ms steps(3, end);
}

.banner-fade-enter-from,
.banner-fade-leave-to {
  opacity: 0;
}

@keyframes tv-blink {
  50% {
    opacity: 0.2;
  }
}
</style>
