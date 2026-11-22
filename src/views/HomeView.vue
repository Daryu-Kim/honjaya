<template>
  <div class="user-entry-view">
    <div v-if="!isMobile" class="desktop-block">
      <div class="desktop-card">
        <p class="desktop-eyebrow">MOBILE ONLY</p>
        <h1>모바일로 이용해주세요</h1>
        <p>QR 입장은 모바일 환경에서만 진행할 수 있어요.</p>
      </div>
    </div>

    <div v-else class="entry-container">
      <section class="entry-card">
        <div class="icon-wrap">📋</div>

        <p class="eyebrow">TABLE ENTRY</p>
        <h1>{{ entryTitle }}</h1>
        <p class="description">{{ entryDescription }}</p>

        <template v-if="!hasTableInfo">
          <div v-if="isLoadingTableMaster" class="picker-state">
            자리 목록을 불러오는 중이에요.
          </div>

          <div v-else-if="tableMasterError" class="picker-state picker-error">
            <p>{{ tableMasterError }}</p>
            <button type="button" class="retry-button" @click="loadTableMaster">
              다시 시도
            </button>
          </div>

          <div v-else-if="!tableZoneGroups.length" class="picker-state">
            사용할 수 있는 자리가 없어요. 직원에게 문의해주세요.
          </div>

          <div v-else class="table-picker">
            <div
              v-for="group in tableZoneGroups"
              :key="group.zone"
              class="zone-group"
            >
              <p class="zone-title">{{ group.label }}</p>
              <div class="zone-grid">
                <button
                  v-for="table in group.tables"
                  :key="table.number"
                  type="button"
                  class="table-tile"
                  :aria-label="`${table.ariaLabel}로 입장`"
                  @click="selectTable(table)"
                >
                  <span class="tile-number">{{ table.shortLabel }}</span>
                </button>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="info-box">
            <div class="info-row">
              <span>테이블</span>
              <strong>{{ tableText }}</strong>
            </div>
            <div class="info-row">
              <span>표시명</span>
              <strong>{{ displayNameText }}</strong>
            </div>
          </div>

          <div class="nickname-box">
            <label class="nickname-label" for="table-nickname-input">
              주문자 닉네임
            </label>
            <input
              id="table-nickname-input"
              v-model="tableNickname"
              type="text"
              class="nickname-input"
              placeholder="예: 홍길동"
              autocomplete="off"
            />
            <p class="nickname-helper">
              누가 주문했는지 표시되는 이름이에요. 한글 8자, 영문·숫자 16자까지
              입력할 수 있어요.
            </p>
            <p class="nickname-notice">
              비속어나 불쾌감을 주는 닉네임은 안내 없이 강제로 변경될 수 있어요.
            </p>
            <p v-if="nicknameErrorMessage" class="nickname-error">
              {{ nicknameErrorMessage }}
            </p>
          </div>
        </template>

        <div v-if="entryErrorMessage" class="error-box">
          {{ entryErrorMessage }}
        </div>

        <button
          v-if="hasTableInfo"
          type="button"
          class="start-button"
          :disabled="!canStart || isPreparingEntry"
          @click="handleStart"
        >
          {{ startButtonText }}
        </button>

        <button
          v-if="hasTableInfo"
          type="button"
          class="reset-table-button"
          @click="resetTableSelection"
        >
          다른 자리 선택
        </button>
      </section>
    </div>

    <!-- 사장님·직원용 진입점. 손님에게 보이지 않아도 되므로 아주 작게 둡니다. -->
    <router-link to="/admin" class="staff-entry-link">관리자</router-link>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { runGlobalBusy } from "@/lib/globalBusy";
import { loadGuestTableInfo, startGuestSession } from "@/lib/guestAuth";
import {
  getTableNicknameErrorMessage,
  normalizeTableNumber,
} from "@/lib/orderSheet";
import { fetchTableMaster, tableLabelOf, zoneLabel } from "@/lib/tableMaster";

const router = useRouter();
const route = useRoute();

const isMobile = ref(false);
const tableNumber = ref("");
const displayName = ref("");
const tableNickname = ref("");
const isPreparingEntry = ref(false);
const entryErrorMessage = ref("");

const tableMaster = ref([]);
const isLoadingTableMaster = ref(false);
const tableMasterError = ref("");

const nicknameErrorMessage = computed(() => {
  return getTableNicknameErrorMessage(tableNickname.value);
});

const tableText = computed(() => {
  const number = Number(tableNumber.value);

  return Number.isFinite(number) && number > 0
    ? `${number}번 테이블`
    : "테이블 정보 없음";
});

const displayNameText = computed(() => {
  return displayName.value || "표시명 없음";
});

const canStart = computed(() => {
  return hasTableInfo.value && !nicknameErrorMessage.value;
});

const hasTableInfo = computed(() => {
  return Boolean(tableNumber.value) && Boolean(displayName.value);
});

const tableZoneGroups = computed(() => {
  const groups = new Map();

  for (const table of tableMaster.value) {
    const number = normalizeTableNumber(table.tableNumber);

    if (!number) continue;

    const zone =
      String(table.zone || "").toUpperCase() === "BAR" ? "BAR" : "LARGE";

    if (!groups.has(zone)) {
      groups.set(zone, { zone, label: zoneLabel(zone), tables: [] });
    }

    groups.get(zone).tables.push({
      number,
      shortLabel: number,
      ariaLabel: tableLabelOf(table),
    });
  }

  return [...groups.values()];
});

const entryTitle = computed(() => {
  return hasTableInfo.value ? "테이블 입장" : "몇 번 자리에 앉으셨나요?";
});

const entryDescription = computed(() => {
  return hasTableInfo.value
    ? "테이블 정보를 확인한 뒤 시작해주세요."
    : "자리 번호를 선택하면 바로 주문을 시작할 수 있어요.";
});

const startButtonText = computed(() => {
  return isPreparingEntry.value ? "입장 준비 중..." : "시작하기";
});

function detectMobile() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  isMobile.value =
    /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua) ||
    window.innerWidth <= 1024;
}

function resolveTableNumberFromRoute() {
  const queryTable = String(route.query.table || "").trim();
  const paramsTable = String(route.params.tableNumber || "").trim();

  return normalizeTableNumber(queryTable || paramsTable);
}

function initializeEntryInfo() {
  const resolvedTableNumber = resolveTableNumberFromRoute();

  tableNumber.value = resolvedTableNumber;
  displayName.value = resolvedTableNumber ? `No.${resolvedTableNumber}` : "";
}

async function prefillEntryInfo() {
  if (!tableNumber.value) return;

  try {
    const tableInfo = await loadGuestTableInfo(tableNumber.value);

    if (tableInfo) {
      displayName.value = tableInfo.displayName || displayName.value;
      tableNickname.value = tableInfo.tableNickname || "";
    }
  } catch (error) {
    console.error("입장 정보 조회 실패:", error);
    entryErrorMessage.value =
      error?.message || "테이블 정보를 확인하지 못했어요.";
  }
}

async function loadTableMaster() {
  if (isLoadingTableMaster.value) return;

  isLoadingTableMaster.value = true;
  tableMasterError.value = "";

  try {
    const rows = await fetchTableMaster();

    tableMaster.value = rows.filter((table) => table.isActive !== false);
  } catch (error) {
    console.error("테이블 목록 조회 실패:", error);
    tableMasterError.value =
      "자리 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
  } finally {
    isLoadingTableMaster.value = false;
  }
}

async function selectTable(table) {
  if (!table?.number || isPreparingEntry.value) return;

  tableNumber.value = table.number;
  displayName.value = `No.${table.number}`;
  tableNickname.value = "";
  entryErrorMessage.value = "";

  await prefillEntryInfo();
}

function resetTableSelection() {
  tableNumber.value = "";
  displayName.value = "";
  tableNickname.value = "";
  entryErrorMessage.value = "";

  if (route.query.table) {
    const restQuery = { ...route.query };
    delete restQuery.table;
    router.replace({ path: route.path, query: restQuery });
  }

  if (!tableMaster.value.length) {
    loadTableMaster();
  }
}

async function handleStart() {
  if (!canStart.value || isPreparingEntry.value) return;

  await runGlobalBusy(async () => {
    isPreparingEntry.value = true;
    entryErrorMessage.value = "";

    try {
      await startGuestSession({
        tableNumber: tableNumber.value,
        nickname: tableNickname.value,
      });

      router.push("/user/main");
    } catch (error) {
      console.error("주문서 준비 실패:", error);
      entryErrorMessage.value =
        error?.message || "입장 준비 중 문제가 발생했어요.";
    } finally {
      isPreparingEntry.value = false;
    }
  }, "입장 정보를 준비하는 중이에요.");
}

onMounted(() => {
  detectMobile();
  initializeEntryInfo();

  if (tableNumber.value) {
    prefillEntryInfo();
    return;
  }

  loadTableMaster();
});
</script>

<style scoped lang="scss">
.user-entry-view {
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

.entry-container {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
}

.entry-card {
  width: 100%;
  max-width: 520px;
  padding: 28px 20px 20px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.24);

  .icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    margin: 0 auto 16px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.12);
    font-size: 34px;
  }

  .eyebrow {
    margin: 0 0 8px;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.6);
  }

  h1 {
    margin: 0;
    text-align: center;
    font-size: 28px;
    font-weight: 800;
    line-height: 1.25;
  }

  .description {
    margin: 12px 0 20px;
    text-align: center;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.75);
  }
}

.info-box {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.info-row {
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
    font-size: 16px;
    font-weight: 800;
    text-align: right;
  }
}

.nickname-box {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.nickname-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.75);
}

.nickname-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.6);
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

.nickname-helper {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.6);
}

.nickname-notice {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(252, 211, 77, 0.85);
}

.nickname-error {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: #fca5a5;
}

.error-box {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(252, 165, 165, 0.14);
  color: #fecaca;
  font-size: 13px;
  line-height: 1.6;
}

.start-button {
  width: 100%;
  height: 52px;
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

.reset-table-button {
  width: 100%;
  height: 44px;
  margin-top: 10px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:active {
    background: rgba(255, 255, 255, 0.08);
  }
}

.table-picker {
  display: grid;
  gap: 18px;
  margin-bottom: 8px;
}

.zone-group {
  display: grid;
}

.zone-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.6);
}

.zone-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 8px;
}

.table-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;

  &:active {
    background: rgba(255, 255, 255, 0.18);
    transform: scale(0.96);
  }

  &:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.5);
    outline-offset: 2px;
  }
}

.picker-state {
  margin-bottom: 8px;
  padding: 24px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  text-align: center;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);

  p {
    margin: 0;
  }
}

.picker-error {
  background: rgba(252, 165, 165, 0.12);
  color: #fecaca;
}

.retry-button {
  margin-top: 12px;
  height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

// PWA 로 설치하면 루트로 진입하므로 관리자 페이지로 가는 통로를 남겨 둡니다.
// 손님이 누를 버튼이 아니라서 화면 구석에 아주 작게 둡니다.
.staff-entry-link {
  position: fixed;
  right: 10px;
  bottom: 8px;
  padding: 4px 6px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.22);
  text-decoration: none;
  z-index: 5;

  &:hover,
  &:focus-visible {
    color: rgba(255, 255, 255, 0.55);
  }
}
</style>
