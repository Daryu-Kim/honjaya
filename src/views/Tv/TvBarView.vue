<template>
  <div
    class="tv-root"
    :class="{ 'is-cursor-visible': isCursorVisible }"
    @mousemove="revealCursor"
  >
    <div class="tv-stage" :style="stageStyle">
      <svg class="sprite-defs" aria-hidden="true" focusable="false">
        <defs>
          <template v-for="furniture in furnitureSprites" :key="furniture.key">
            <g
              v-for="part in furniture.parts"
              :id="`tv-${furniture.key}-${part.tone}`"
              :key="`${furniture.key}-${part.tone}`"
            >
              <path :d="part.d" />
            </g>
          </template>
        </defs>
      </svg>

      <header class="tv-header">
        <div class="tv-brand">
          <span class="tv-brand-name">혼자야</span>
          <span class="tv-brand-sub">PIXEL BAR</span>
        </div>

        <div class="tv-status">
          <span v-if="!isSoundUnlocked" class="tv-sound-hint">
            🔇 화면을 한 번 터치하면 알림음이 켜져요
          </span>
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

          <div
            v-for="zone in seatZones"
            :key="zone.key"
            class="scene-zone"
            :class="`is-${zone.key}`"
            :style="{ zIndex: zoneZIndexOf(zone) }"
          >
            <div
              v-for="slot in zone.slots"
              :key="slot.tableNumber"
              class="seat"
              :class="{
                'is-empty': !slot.seat,
                'is-stool': slot.furniture === 'stool',
                'is-gap-before': slot.gapBefore,
                'has-bubble': Boolean(bubbles[slot.tableNumber]),
              }"
              :style="slot.style"
            >
              <transition name="bubble-pop">
                <div
                  v-if="bubbles[slot.tableNumber]"
                  class="seat-bubble"
                  :class="`is-align-${slot.align}`"
                >
                  <span class="seat-bubble-from">
                    {{ bubbles[slot.tableNumber].label }}
                  </span>
                  <span class="seat-bubble-text">
                    {{ bubbles[slot.tableNumber].text }}
                  </span>
                </div>
              </transition>

              <div
                v-if="heartBursts[slot.tableNumber]"
                :key="heartBursts[slot.tableNumber].key"
                class="seat-heart-burst"
                aria-hidden="true"
              >
                <span
                  v-for="particle in heartBursts[slot.tableNumber].particles"
                  :key="particle.key"
                  class="seat-heart-particle"
                  :style="particle.style"
                  >💗</span
                >
              </div>

              <div class="seat-figure">
                <svg
                  v-if="slot.seat"
                  class="seat-guest"
                  :viewBox="GUEST_SPRITE_VIEW_BOX"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    v-for="part in seatParts(slot.seat)"
                    :key="part.fill"
                    :d="part.d"
                    :fill="part.fill"
                  />
                </svg>

                <svg
                  class="seat-furniture"
                  viewBox="0 0 24 12"
                  aria-hidden="true"
                  focusable="false"
                >
                  <use
                    v-for="part in furnitureParts[slot.furniture]"
                    :key="part.tone"
                    :href="`#tv-${slot.furniture}-${part.tone}`"
                    :class="`furniture-${part.tone}`"
                  />
                </svg>
              </div>

              <div class="seat-plate">
                <span class="seat-plate-name">
                  {{ slot.seat ? slot.seat.label : "빈자리" }}
                </span>
                <span class="seat-plate-table">{{ slot.tableNumber }}번</span>
                <span
                  v-if="heartCountOf(slot.tableNumber) > 0"
                  class="seat-plate-heart"
                  >💗 {{ heartCountOf(slot.tableNumber) }}</span
                >
              </div>
            </div>
          </div>

          <div class="scene-counter" aria-hidden="true">
            <div class="counter-top"></div>
            <div class="counter-front">
              <div class="counter-staff">
                <svg
                  class="staff-figure"
                  :viewBox="STAFF_SPRITE_VIEW_BOX"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    v-for="part in staffParts"
                    :key="part.fill"
                    :d="part.d"
                    :fill="part.fill"
                  />
                </svg>
                <span class="staff-plate">직원</span>
              </div>
            </div>
          </div>
        </section>

        <aside class="tv-side">
          <div class="tv-chat">
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
                바 {{ barSeats.length }} · 홀 {{ hallSeats.length }}
                <template v-if="seatOverflow > 0"
                  >· 외 {{ seatOverflow }}팀</template
                >
              </span>
              <span class="tv-chat-foot-dot">●</span>
            </div>
          </div>
        </aside>
      </main>

      <transition name="banner-fade">
        <footer v-if="banner" class="tv-banner" :class="`is-${banner.tone}`">
          <span class="tv-banner-tag">{{ banner.tag }}</span>
          <span class="tv-banner-text">{{ banner.text }}</span>
        </footer>
      </transition>

      <transition name="announce-fade">
        <div v-if="announcement" class="tv-announce" role="status">
          <div
            :key="announcement.key"
            class="tv-announce-card"
            :class="announcementSize"
          >
            <span class="tv-announce-tag">{{ announcement.tag }}</span>
            <p class="tv-announce-text">{{ announcement.text }}</p>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { fetchList, subscribeTable } from "@/lib/supabase";
import {
  GLOBAL_ROOM_KEY,
  formatTableLabel,
  getChatDayStartIso,
} from "@/lib/chat";
import { normalizeTableNumber } from "@/lib/orderSheet";
import { normalizeCharacterStyle } from "@/lib/characterStyle";
import {
  GUEST_SPRITE_VIEW_BOX,
  STAFF_PARTS,
  STAFF_SPRITE_VIEW_BOX,
  buildGuestParts,
  buildSpritePaths,
} from "@/lib/pixelGuest";
import { fetchTodayHearts } from "@/lib/hearts";
import {
  TV_CHIME,
  isSoundUnlocked,
  playNotificationChime,
  primeNotificationSound,
} from "@/lib/notificationSound";

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
// 실제 매장 배치(사진) 기준 좌석 번호입니다. 배열 순서 = 화면 왼쪽 → 오른쪽.
// 바 카운터는 3~12번, 홀은 1~2번 · 13~24번 · 26~32번이고 25번 테이블은 없습니다.
// 홀은 사진처럼 세 줄입니다. 13번에서 시작해 32번까지 지그재그로 이어집니다.
const BAR_TABLE_NUMBERS = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3];
const HALL_BACK_TABLE_NUMBERS = [13, 14, 15, 16, 17, 18, 19];
const HALL_MIDDLE_TABLE_NUMBERS = [27, 26, 24, 23, 22, 21, 20];
const HALL_FRONT_TABLE_NUMBERS = [28, 29, 30, 31, 32];
const SIDE_TABLE_NUMBERS = [2, 1];
const PANEL_LIMIT = 8;
const BUBBLE_DURATION_MS = 6000;
const BANNER_DURATION_MS = 9000;
const ANNOUNCE_DURATION_MS = 8000;
const ANNOUNCE_GAP_MS = 500;
const ANNOUNCE_TEXT_LIMIT = 140;
const MESSAGE_FETCH_LIMIT = 60;
const BUBBLE_TEXT_LIMIT = 60;
const PANEL_TEXT_LIMIT = 54;
const CURSOR_IDLE_MS = 3000;
const DAWN_RELOAD_HOUR = 5;
const HEART_BURST_MS = 5200;
const HEART_PARTICLE_COUNT = 7;

// The TV only ever renders the global room. Direct (1:1) and staff rooms are
// deliberately never queried here so private chats cannot leak onto the screen.
const ROOM_TYPE_GLOBAL = "GLOBAL";
const MESSAGE_TYPE_STAFF = "ADMIN";
const MESSAGE_TYPE_SYSTEM = "SYSTEM";

// 따뜻한 바 분위기에 맞춘 병 색(앰버·로즈·민트).
const SHELF_COLORS = ["#ffb066", "#ff7a90", "#8ce6d2", "#ffd166", "#c9a2ff"];

const staffParts = STAFF_PARTS;

// 가구는 24x12 픽셀 그리드입니다. w = 나무, d = 그늘.
const FURNITURE_TONES = {
  w: "wood",
  d: "dark",
};

// 바 좌석(스툴): 넓은 상판 + 가운데 기둥 + 발판.
const STOOL_SPRITE = [
  "....wwwwwwwwwwwwwwww....",
  "....wwwwwwwwwwwwwwww....",
  "....dddddddddddddddd....",
  ".........dddddd.........",
  ".........dddddd.........",
  ".........dddddd.........",
  "....dddddddddddddddd....",
  "....dddddddddddddddd....",
  ".........dddddd.........",
  ".........dddddd.........",
  "........dd....dd........",
  ".......dd......dd.......",
];

// 홀 테이블: 상판 + 다리 + 양옆 의자.
const TABLE_SPRITE = [
  "....wwwwwwwwwwwwwwww....",
  "....wwwwwwwwwwwwwwww....",
  "....dddddddddddddddd....",
  "ww..d..............d..ww",
  "ww..d..............d..ww",
  "ww..d..............d..ww",
  "ww..d..............d..ww",
  "....d..............d....",
  "....d..............d....",
  "....dddddddddddddddd....",
  "....dddddddddddddddd....",
  "....dddddddddddddddd....",
];

const furnitureParts = {
  stool: buildSpritePaths(STOOL_SPRITE, FURNITURE_TONES),
  table: buildSpritePaths(TABLE_SPRITE, FURNITURE_TONES),
};

const furnitureSprites = [
  { key: "stool", parts: furnitureParts.stool },
  { key: "table", parts: furnitureParts.table },
];

const shelfBottles = Array.from({ length: 13 }, (_, index) => {
  const height = 12 + ((index * 7) % 22);
  const color = SHELF_COLORS[index % SHELF_COLORS.length];

  return {
    key: `bottle-${index}`,
    style: {
      height: `${height}px`,
      background: color,
      opacity: String(0.6 + (index % 3) * 0.15),
    },
  };
});

const stageScale = ref(1);
const isCursorVisible = ref(false);
const isOnline = ref(true);
const clockText = ref("");
const seats = ref([]);
const messages = ref([]);
const hearts = ref([]);
const bubbles = reactive({});
const heartBursts = reactive({});
// 말풍선이 뜬 순서를 기억해 가장 최근 대화한 좌석이 맨 앞에 오도록 합니다.
const bubbleOrder = ref([]);
const banner = ref(null);
const announcement = ref(null);

const stageStyle = computed(() => ({
  transform: `scale(${stageScale.value})`,
}));

const BAR_TABLE_SET = new Set(BAR_TABLE_NUMBERS.map(String));
const HALL_TABLE_SET = new Set(
  [
    ...SIDE_TABLE_NUMBERS,
    ...HALL_BACK_TABLE_NUMBERS,
    ...HALL_MIDDLE_TABLE_NUMBERS,
    ...HALL_FRONT_TABLE_NUMBERS,
  ].map(String)
);

const barSeats = computed(() => {
  return seats.value.filter((seat) =>
    BAR_TABLE_SET.has(String(seat.tableNumber))
  );
});

const hallSeats = computed(() => {
  return seats.value.filter((seat) =>
    HALL_TABLE_SET.has(String(seat.tableNumber))
  );
});

// 배치에 없는 번호(예: 사라진 25번)의 주문은 좌석 대신 인원 집계로만 표시합니다.
const seatOverflow = computed(() => {
  return seats.value.filter((seat) => {
    const key = String(seat.tableNumber);

    return !BAR_TABLE_SET.has(key) && !HALL_TABLE_SET.has(key);
  }).length;
});

function buildTableSlots(tableNumbers, occupiedMap, furniture, options = {}) {
  return tableNumbers.map((tableNumber, index) => {
    const key = String(tableNumber);
    const slot = {
      tableNumber: key,
      seat: occupiedMap.get(key) || null,
      furniture,
      gapBefore: Boolean(options.gapBefore) && index === 0,
    };

    return { ...slot, style: seatStyle(slot) };
  });
}

const occupiedTableMap = computed(() => {
  const map = new Map();

  seats.value.forEach((seat) => map.set(String(seat.tableNumber), seat));

  return map;
});

// 빈자리도 항상 그려야 해서 좌석은 고정 슬롯입니다.
// 사진처럼 홀 안쪽 줄 → 홀 가운데 줄 → 홀 바깥 줄(1·2번 테이블 + 28~32번) → 바 카운터 순서입니다.
const hallBackSlots = computed(() =>
  buildTableSlots(HALL_BACK_TABLE_NUMBERS, occupiedTableMap.value, "table")
);

const hallMiddleSlots = computed(() =>
  buildTableSlots(HALL_MIDDLE_TABLE_NUMBERS, occupiedTableMap.value, "table")
);

const hallFrontSlots = computed(() => [
  ...buildTableSlots(SIDE_TABLE_NUMBERS, occupiedTableMap.value, "table"),
  ...buildTableSlots(
    HALL_FRONT_TABLE_NUMBERS,
    occupiedTableMap.value,
    "stool",
    { gapBefore: true }
  ),
]);

const barSlots = computed(() =>
  buildTableSlots(BAR_TABLE_NUMBERS, occupiedTableMap.value, "stool")
);

// 말풍선이 화면 밖으로 잘리지 않도록 줄의 양 끝 좌석은 안쪽으로 정렬합니다.
function withBubbleAlign(slots) {
  return slots.map((slot, index) => {
    if (index === 0) {
      return { ...slot, align: "start" };
    }

    if (index === slots.length - 1) {
      return { ...slot, align: "end" };
    }

    return { ...slot, align: "center" };
  });
}

const seatZones = computed(() => [
  { key: "hall-back", slots: withBubbleAlign(hallBackSlots.value) },
  { key: "hall-middle", slots: withBubbleAlign(hallMiddleSlots.value) },
  { key: "hall-front", slots: withBubbleAlign(hallFrontSlots.value) },
  { key: "bar", slots: withBubbleAlign(barSlots.value) },
]);

// 최근 대화 순서를 뒤로 밀어 두고, 늦게 말한 좌석일수록 높은 층에 그립니다.
function promoteBubble(tableNumber) {
  const key = String(tableNumber);

  bubbleOrder.value = bubbleOrder.value
    .filter((item) => item !== key)
    .concat(key);
}

function releaseBubble(tableNumber) {
  const key = String(tableNumber);

  bubbleOrder.value = bubbleOrder.value.filter((item) => item !== key);
}

function bubbleLayerOf(tableNumber) {
  const index = bubbleOrder.value.indexOf(String(tableNumber));

  return index === -1 ? 0 : index + 1;
}

// 좌석은 자기 줄 안에서 겹치고, 줄끼리는 말풍선이 위로 솟을 때만 겹칩니다.
function zoneZIndexOf(zone) {
  const layer = zone.slots.reduce((max, slot) => {
    return Math.max(max, bubbleLayerOf(slot.tableNumber));
  }, 0);

  return 2 + layer;
}

// 테이블별로 오늘 받은 하트 개수 (좌석 명패에 표시).
const heartCounts = computed(() => {
  const counts = new Map();

  hearts.value.forEach((heart) => {
    const tableNumber = normalizeTableNumber(heart.toTableNumber);

    if (!tableNumber) {
      return;
    }

    counts.set(tableNumber, (counts.get(tableNumber) || 0) + 1);
  });

  return counts;
});

function heartCountOf(tableNumber) {
  return heartCounts.value.get(normalizeTableNumber(tableNumber)) || 0;
}

const announcementSize = computed(() => {
  const length = announcement.value ? announcement.value.text.length : 0;

  if (length > 90) {
    return "is-long";
  }

  if (length > 40) {
    return "is-medium";
  }

  return "";
});

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
const seenHeartIds = new Set();
const bubbleTimers = new Map();
const heartBurstTimers = new Map();
const subscriptionStops = [];
const announceQueue = [];
let announceSequence = 0;
let hasLoadedMessages = false;
let hasLoadedHearts = false;
let bannerTimer = null;
let announceTimer = null;
let cursorTimer = null;
let clockTimer = null;
let dawnTimer = null;
let seatsReloadTimer = null;

function truncate(value, limit) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function seatStyle(slot) {
  // buildTableSlots() passes a slot; the guest's own styling lives on slot.seat.
  const tableNumber = String(slot.tableNumber || "");
  const layer = bubbleLayerOf(tableNumber);
  const delaySeed = Math.abs(Number(tableNumber) || 0) % 7;

  return {
    // 테이블마다 숨쉬는 타이밍을 어긋나게 해서 한꺼번에 움직이지 않게 합니다.
    "--breath-delay": `${(delaySeed * 0.31).toFixed(2)}s`,
    ...(layer > 0 ? { zIndex: String(6 + layer) } : {}),
  };
}

// 좌석 손님의 스킨 path입니다. 스킨은 닉네임별로 한 번만 불러오므로
// 화면이 그릴 때 계산해 두면 로딩이 끝난 뒤 저절로 다시 그려집니다.
function seatParts(seat) {
  if (!seat) return [];

  return buildGuestParts(seat.characterStyle, seat.tableNumber);
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

async function fetchSeatProfiles(sheetIds) {
  try {
    return await fetchList("orderSheets", {
      columns: ["id", "tableNickname", "characterStyle"],
      filters: [["id", "in", sheetIds]],
    });
  } catch (error) {
    // character_style 패치(patch-010) 적용 전 DB에서도 TV가 멈추지 않게 합니다.
    return fetchList("orderSheets", {
      columns: ["id", "tableNickname"],
      filters: [["id", "in", sheetIds]],
    });
  }
}

async function loadSeats() {
  try {
    const activeSheets = await fetchList("activeOrderSheets", {
      order: ["tableNumber", "asc"],
    });

    const sheetIds = activeSheets
      .map((sheet) => sheet.orderSheetId)
      .filter(Boolean);

    const sheetInfoMap = {};

    if (sheetIds.length > 0) {
      const sheetRows = await fetchSeatProfiles(sheetIds);

      sheetRows.forEach((row) => {
        sheetInfoMap[row.id] = {
          nickname: row.tableNickname || "",
          characterStyle: normalizeCharacterStyle(row.characterStyle),
        };
      });
    }

    const sortedSeats = activeSheets
      .map((sheet) => {
        const tableNumber = normalizeTableNumber(sheet.tableNumber);
        const sheetInfo = sheetInfoMap[sheet.orderSheetId] || {};
        const nickname = String(sheetInfo.nickname || "").trim();

        return {
          tableNumber,
          nickname,
          characterStyle: sheetInfo.characterStyle || {},
          label: nickname || "손님",
        };
      })
      .filter((seat) => Boolean(seat.tableNumber))
      .sort((first, second) => {
        return Number(first.tableNumber) - Number(second.tableNumber);
      });

    seats.value = sortedSeats;
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
        ["createdAt", "gte", getChatDayStartIso()],
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
      queueAnnouncement(message.message, { tag: "직원" });
      return;
    }

    const tableNumber = normalizeTableNumber(message.tableNumber);

    if (tableNumber) {
      showBubble(tableNumber, message);
    }
  });
}

async function loadHearts() {
  try {
    const rows = await fetchTodayHearts();

    hearts.value = rows;
    announceNewHearts(rows);
  } catch (error) {
    console.error("[tv] 하트 정보를 불러오지 못했어요", error);
  }
}

function announceNewHearts(rows) {
  if (!hasLoadedHearts) {
    hasLoadedHearts = true;
    rows.forEach((heart) => seenHeartIds.add(heart.id));
    return;
  }

  const fresh = rows.filter((heart) => !seenHeartIds.has(heart.id));

  fresh.forEach((heart) => seenHeartIds.add(heart.id));

  fresh
    .slice()
    .reverse()
    .forEach((heart) => showAnonymousHeart(heart));
}

function seatNicknameOf(tableNumber) {
  const seat = seats.value.find((item) => item.tableNumber === tableNumber);

  return seat ? seat.nickname : "";
}

// 익명 하트는 받는 테이블 좌석 위로만 하트가 떠오릅니다.
// 서로 하트 성사는 TV에 노출하지 않고 두 테이블의 1:1 채팅 알림으로만 알려줍니다.
function showAnonymousHeart(heart) {
  const toTableNumber = normalizeTableNumber(heart.toTableNumber);

  if (!toTableNumber) {
    return;
  }

  const toLabel = formatTableLabel(
    toTableNumber,
    heart.toNickname || seatNicknameOf(toTableNumber)
  );

  showHeartBurst(toTableNumber);

  showBanner(`💗 ${toLabel}님에게 익명 하트가 도착했어요`, {
    tag: "하트",
    tone: "heart",
  });
}

function buildHeartParticles() {
  return Array.from({ length: HEART_PARTICLE_COUNT }, (_, index) => ({
    key: index,
    style: {
      left: `${8 + ((index * 37) % 78)}%`,
      fontSize: `${18 + ((index * 7) % 14)}px`,
      animationDelay: `${(index % 5) * 130}ms`,
      animationDuration: `${2600 + ((index * 313) % 900)}ms`,
    },
  }));
}

function showHeartBurst(tableNumber) {
  const currentTimer = heartBurstTimers.get(tableNumber);

  if (currentTimer) {
    clearTimeout(currentTimer);
  }

  heartBursts[tableNumber] = {
    key: Date.now() + Math.random(),
    particles: buildHeartParticles(),
  };

  heartBurstTimers.set(
    tableNumber,
    setTimeout(() => {
      delete heartBursts[tableNumber];
      heartBurstTimers.delete(tableNumber);
    }, HEART_BURST_MS)
  );
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

  promoteBubble(tableNumber);

  const currentTimer = bubbleTimers.get(tableNumber);

  if (currentTimer) {
    clearTimeout(currentTimer);
  }

  bubbleTimers.set(
    tableNumber,
    setTimeout(() => {
      delete bubbles[tableNumber];
      releaseBubble(tableNumber);
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

// 직원 메시지는 화면 가운데에 크게 띄웠다가 페이드아웃으로 사라집니다.
// 여러 건이 한 번에 들어오면 순서대로 하나씩 보여줍니다.
function queueAnnouncement(message, { tag = "직원" } = {}) {
  const text = truncate(message, ANNOUNCE_TEXT_LIMIT);

  if (!text) {
    return;
  }

  announceSequence += 1;
  announceQueue.push({ key: announceSequence, tag, text });

  if (!announcement.value) {
    playNextAnnouncement();
  }
}

function playNextAnnouncement() {
  const next = announceQueue.shift();

  if (!next) {
    announcement.value = null;
    announceTimer = null;
    return;
  }

  announcement.value = next;
  playNotificationChime(TV_CHIME);

  announceTimer = setTimeout(() => {
    announcement.value = null;
    announceTimer = setTimeout(playNextAnnouncement, ANNOUNCE_GAP_MS);
  }, ANNOUNCE_DURATION_MS);
}

function handleOnline() {
  isOnline.value = true;
  loadSeats();
  loadMessages();
  loadHearts();
}

// 캐릭터 꾸미기는 order_sheets에 저장되기 때문에 주문서 변경도 좌석 갱신 대상입니다.
// 주문 한 건마다 이벤트가 오므로 잠깐 모아서 한 번만 다시 그립니다.
function scheduleSeatsReload() {
  if (seatsReloadTimer) {
    clearTimeout(seatsReloadTimer);
  }

  seatsReloadTimer = setTimeout(() => {
    seatsReloadTimer = null;
    loadSeats();
  }, 1500);
}

function handleOffline() {
  isOnline.value = false;
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    loadSeats();
    loadMessages();
    loadHearts();
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
  document.body.style.background = "#0b0709";
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
  primeNotificationSound();

  window.addEventListener("resize", updateStageScale);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  clockTimer = setInterval(updateClock, 15000);

  subscriptionStops.push(
    subscribeTable("activeOrderSheets", loadSeats, { pollMs: 60000 }),
    subscribeTable("orderSheets", scheduleSeatsReload, { pollMs: 0 }),
    subscribeTable("chatMessages", loadMessages, { pollMs: 20000 }),
    subscribeTable("hearts", loadHearts, { pollMs: 20000 })
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

  heartBurstTimers.forEach((timer) => clearTimeout(timer));
  heartBurstTimers.clear();

  [
    clockTimer,
    bannerTimer,
    announceTimer,
    dawnTimer,
    cursorTimer,
    seatsReloadTimer,
  ].forEach((timer) => {
    if (timer) {
      clearTimeout(timer);
    }
  });

  announceQueue.length = 0;
  announcement.value = null;

  clockTimer = null;
  bannerTimer = null;
  announceTimer = null;
  dawnTimer = null;
  cursorTimer = null;
  seatsReloadTimer = null;
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
  background: radial-gradient(circle at 50% 15%, #2a1a22 0%, #0b0709 72%);
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
    #170f16 0 40px,
    #1d141c 40px 80px
  );
  color: #fdf3f6;
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

.tv-sound-hint {
  padding: 8px 16px;
  font-size: 17px;
  color: #2b1b00;
  background: #ffe066;
  box-shadow: 4px 4px 0 #7a4b00;
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
  gap: 8px;
  overflow: hidden;
  background: linear-gradient(180deg, #2b1a22 0%, #34202a 46%, #402733 100%);
  box-shadow: inset 0 0 0 6px #120b10;
}

.scene-wall {
  position: absolute;
  inset: 0 0 52% 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 8px;
  gap: 6px;
}

.scene-neon {
  font-size: 44px;
  letter-spacing: 0.28em;
  color: #ff5d8f;
  text-shadow: 0 0 16px rgba(255, 93, 143, 0.72),
    0 0 36px rgba(255, 93, 143, 0.36), 5px 5px 0 rgba(48, 0, 22, 0.6);
}

.scene-shelf {
  display: flex;
  align-items: flex-end;
  gap: 9px;
  padding: 0 30px 4px;
  height: 38px;
  border-bottom: 5px solid #6a4632;
  box-shadow: 0 8px 14px rgba(0, 0, 0, 0.35);
}

.shelf-bottle {
  display: block;
  width: 11px;
  box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.25);
}

.scene-zone {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-end;
  justify-content: center;
  gap: 8px 10px;
  padding: 0 26px;
  --avatar: 128px;
  --name-size: 16px;
  --no-size: 13px;
  --wood: #b9793f;
  --wood-dark: #7a4a2b;
}

/* 홀은 사진처럼 세 줄입니다. 안쪽 13~19번, 가운데 20~27번, 바깥 1·2번 + 28~32번. */
.scene-zone.is-hall-back,
.scene-zone.is-hall-middle,
.scene-zone.is-hall-front {
  gap: 8px 10px;
}

.scene-zone.is-bar {
  gap: 4px;
  padding: 0 8px;
  --name-size: 19px;
  --no-size: 15px;
  --wood: #d99a5f;
  --wood-dark: #96603a;
}

.seat {
  position: relative;
  width: var(--avatar);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.seat.has-bubble {
  z-index: 6;
}

.seat-figure {
  position: relative;
  width: var(--avatar);
  height: var(--avatar);
}

.seat-guest {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  filter: drop-shadow(0 8px 0 rgba(0, 0, 0, 0.28));
  animation: guest-breathe 3.6s steps(1, end) infinite;
  animation-delay: var(--breath-delay, 0s);
  will-change: transform;
}

/* 숨쉬기는 스프라이트 2픽셀만큼 딱 내려갔다 올라오는 2프레임 움직임입니다.
   64 유닛 스프라이트를 --avatar(128px)로 그리므로 1유닛 = 2px입니다. */
@keyframes guest-breathe {
  0%,
  49.99% {
    transform: translateY(0);
  }

  50%,
  100% {
    transform: translateY(calc(var(--avatar, 128px) / -32));
  }
}

/* 가구는 캐릭터 앞쪽에 겹쳐 그려서 앉아 있는 것처럼 보이게 합니다. */
.seat-furniture {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 76%;
  height: auto;
  aspect-ratio: 24 / 12;
  transform: translateX(-50%);
  image-rendering: pixelated;
  filter: drop-shadow(0 4px 0 rgba(0, 0, 0, 0.32));
}

.furniture-wood {
  fill: var(--wood);
}

.furniture-dark {
  fill: var(--wood-dark);
}

/* 바 스툴은 캐릭터 다리만 가리도록 더 작게 그립니다. */
.seat.is-stool .seat-furniture {
  width: 62%;
}

.seat.is-gap-before {
  margin-left: 46px;
}

.seat.is-empty .seat-furniture {
  opacity: 0.6;
}

.seat.is-empty .seat-plate-name {
  color: #a88a95;
}

.seat-plate {
  position: relative;
  width: calc(100% - 12px);
  box-sizing: border-box;
  margin-top: -2px;
  padding: 4px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  background: #1a1018;
  box-shadow: 0 0 0 4px #4a2f3a, 4px 4px 0 4px rgba(0, 0, 0, 0.4);
}

.seat-plate-name {
  font-size: var(--name-size);
  line-height: 1.15;
  color: #ffd166;
  text-align: center;
  min-height: calc(1.15em + 1px);
  max-height: calc(2.3em + 1px);
  word-break: keep-all;
  overflow-wrap: anywhere;
  overflow: hidden;
}

.seat-plate-table {
  font-size: var(--no-size);
  line-height: 1.2;
  color: #c9a3b4;
}

/* 명패 레이아웃을 밀지 않도록 하트 배지는 절대 위치로 띄웁니다. */
.seat-plate-heart {
  position: absolute;
  top: -16px;
  right: -8px;
  padding: 2px 7px;
  font-size: 14px;
  color: #22102a;
  background: #ff9ad5;
  box-shadow: 0 0 0 3px #120b10;
  white-space: nowrap;
}

.seat-heart-burst {
  position: absolute;
  bottom: calc(100% - 10px);
  left: 0;
  right: 0;
  height: 130px;
  pointer-events: none;
  z-index: 8;
}

.seat-heart-particle {
  position: absolute;
  bottom: 0;
  color: #ff5d8f;
  text-shadow: 0 0 10px rgba(255, 93, 143, 0.85), 2px 2px 0 rgba(0, 0, 0, 0.35);
  animation-name: heart-float;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}

@keyframes heart-float {
  0% {
    transform: translate(-50%, 0) scale(0.5);
    opacity: 0;
  }

  18% {
    opacity: 1;
  }

  100% {
    transform: translate(-50%, -120px) scale(1.15);
    opacity: 0;
  }
}

.seat-bubble {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(var(--bubble-x, -50%));
  display: flex;
  flex-direction: column;
  gap: 5px;
  box-sizing: border-box;
  min-width: 260px;
  max-width: 500px;
  padding: 14px 18px;
  background: #fff8f3;
  color: #1a1530;
  box-shadow: 0 0 0 4px #120b10, 6px 6px 0 4px rgba(0, 0, 0, 0.35);
  z-index: 5;
}

/* 줄의 양 끝 좌석은 말풍선을 안쪽으로 붙여 화면 밖으로 잘리지 않게 합니다. */
.seat-bubble.is-align-start {
  --bubble-x: -16%;
}

.seat-bubble.is-align-end {
  --bubble-x: -84%;
}

.seat-bubble::after {
  content: "";
  position: absolute;
  bottom: -12px;
  left: 50%;
  width: 16px;
  height: 16px;
  transform: translateX(-50%) rotate(45deg);
  background: #fff8f3;
  box-shadow: 4px 4px 0 0 rgba(18, 11, 16, 1);
}

.seat-bubble.is-align-start::after {
  left: 16%;
}

.seat-bubble.is-align-end::after {
  left: 84%;
}

.seat-bubble-from {
  font-size: 17px;
  color: #c2415f;
  word-break: keep-all;
}

.seat-bubble-text {
  font-size: 26px;
  line-height: 1.32;
  word-break: keep-all;
  overflow-wrap: break-word;
}

.scene-counter {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  height: 112px;
}

.counter-top {
  height: 14px;
  background: repeating-linear-gradient(
    90deg,
    #b9793f 0 34px,
    #c6884a 34px 68px
  );
  box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.28),
    inset 0 4px 0 rgba(255, 255, 255, 0.18);
}

.counter-front {
  position: relative;
  height: 98px;
  background: repeating-linear-gradient(
    90deg,
    #7a4a2b 0 68px,
    #845230 68px 136px
  );
  box-shadow: inset 0 8px 0 rgba(0, 0, 0, 0.35);
}

/* 직원은 카운터 앞쪽에 서 있는 픽셀 캐릭터로 그립니다. */
.counter-staff {
  position: absolute;
  bottom: 4px;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(-50%);
}

.staff-figure {
  width: 128px;
  height: 88px;
  image-rendering: pixelated;
  filter: drop-shadow(0 6px 0 rgba(0, 0, 0, 0.3));
  animation: staff-breathe 4.4s steps(1, end) infinite;
  will-change: transform;
}

/* staff SVG는 viewBox 높이가 44라서 1픽셀당 2px입니다. */
@keyframes staff-breathe {
  0%,
  49.99% {
    transform: translateY(0);
  }

  50%,
  100% {
    transform: translateY(-4px);
  }
}

.staff-plate {
  margin-top: 3px;
  padding: 2px 9px;
  font-size: 12px;
  color: #ffd166;
  background: #1a1018;
  box-shadow: 0 0 0 3px #4a2f3a;
}

.tv-side {
  flex: 0 0 440px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
}

.tv-chat {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #1a1018;
  box-shadow: inset 0 0 0 6px #3a2028;
  padding: 22px 22px 16px;
  box-sizing: border-box;
}

.tv-chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 4px solid #3a2028;
}

.tv-chat-head h2 {
  margin: 0;
  font-size: 30px;
  color: #ffd166;
}

.tv-chat-room {
  font-size: 18px;
  color: #e4b7c4;
  padding: 4px 12px;
  background: #2a1820;
}

.tv-chat-list {
  list-style: none;
  margin: 0;
  padding: 14px 0 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
  overflow: hidden;
}

.tv-chat-item {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 4px;
  padding: 11px 13px;
  background: #221419;
  box-shadow: inset 0 0 0 3px #3a2028;
}

.tv-chat-item.is-staff {
  background: #2b1c22;
  box-shadow: inset 0 0 0 3px #6b3a44;
}

.tv-chat-from {
  font-size: 18px;
  color: #ffb066;
}

.tv-chat-text {
  font-size: 24px;
  line-height: 1.35;
  color: #fdf3f6;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.tv-chat-empty {
  font-size: 21px;
  color: #c9a3b4;
  line-height: 1.45;
}

.tv-chat-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  margin-top: 12px;
  border-top: 4px solid #3a2028;
  font-size: 18px;
  color: #c9a3b4;
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
  background: #241419;
  box-shadow: 0 0 0 6px #ffd166, 8px 8px 0 6px rgba(0, 0, 0, 0.4);
  z-index: 60;
}

.tv-banner.is-staff {
  box-shadow: 0 0 0 6px #7cf29c, 8px 8px 0 6px rgba(0, 0, 0, 0.4);
}

.tv-banner-tag {
  font-size: 19px;
  padding: 4px 11px;
  color: #241419;
  background: #ffd166;
}

.tv-banner.is-staff .tv-banner-tag {
  background: #7cf29c;
}

.tv-banner.is-heart {
  box-shadow: 0 0 0 6px #ff5d8f, 8px 8px 0 6px rgba(0, 0, 0, 0.4);
}

.tv-banner.is-heart .tv-banner-tag {
  background: #ff5d8f;
}

.tv-banner-text {
  font-size: 30px;
  color: #fff8f3;
  word-break: keep-all;
}

.bubble-pop-enter-active,
.bubble-pop-leave-active {
  transition: transform 160ms steps(3, end), opacity 160ms steps(3, end);
}

.bubble-pop-enter-from,
.bubble-pop-leave-to {
  opacity: 0;
  transform: translateX(var(--bubble-x, -50%)) translateY(12px) scale(0.92);
}

.banner-fade-enter-active,
.banner-fade-leave-active {
  transition: opacity 200ms steps(3, end);
}

.banner-fade-enter-from,
.banner-fade-leave-to {
  opacity: 0;
}

.tv-announce {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 90px;
  background: rgba(8, 4, 6, 0.66);
  z-index: 70;
  pointer-events: none;
}

.tv-announce-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
  max-width: 1440px;
  padding: 56px 78px;
  text-align: center;
  background: #1a1435;
  box-shadow: 0 0 0 10px #7cf29c, 22px 22px 0 10px rgba(0, 0, 0, 0.45);
}

.tv-announce-tag {
  font-size: 30px;
  padding: 8px 24px;
  color: #10102a;
  background: #7cf29c;
}

.tv-announce-text {
  margin: 0;
  font-size: 68px;
  line-height: 1.34;
  color: #fdfbff;
  word-break: keep-all;
  overflow-wrap: anywhere;
  text-shadow: 5px 5px 0 rgba(0, 0, 0, 0.55);
}

.tv-announce-card.is-medium .tv-announce-text {
  font-size: 54px;
}

.tv-announce-card.is-long .tv-announce-text {
  font-size: 42px;
}

.announce-fade-enter-active,
.announce-fade-leave-active {
  transition: opacity 420ms ease;
}

.announce-fade-enter-active .tv-announce-card,
.announce-fade-leave-active .tv-announce-card {
  transition: transform 420ms cubic-bezier(0.22, 1.2, 0.36, 1),
    opacity 420ms ease;
}

.announce-fade-enter-from,
.announce-fade-leave-to {
  opacity: 0;
}

.announce-fade-enter-from .tv-announce-card,
.announce-fade-leave-to .tv-announce-card {
  opacity: 0;
  transform: translateY(30px) scale(0.9);
}

@keyframes tv-blink {
  50% {
    opacity: 0.2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .seat-guest,
  .staff-figure {
    animation: none;
  }
}
</style>
