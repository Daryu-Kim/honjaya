<template>
  <div class="admin-arc-stocktake-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>월 1회 실사</h1>
        <p class="description">
          한 달에 한 번 실제 수량과 시스템 재고를 맞춰요. 실사를 확정하면 차이가
          나는 품목에만 정정 수불이 남고, 그 이력은 지워지지 않아요.
        </p>
      </div>
      <div class="header-actions">
        <router-link to="/admin/arc" class="link-button"
          >응급안전 홈</router-link
        >
        <router-link to="/admin/arc/stock" class="link-button"
          >재고</router-link
        >
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="panel">
      <div class="panel-head">
        <h2>실사 목록</h2>
        <div class="panel-actions">
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadList"
          >
            새로고침
          </button>
        </div>
      </div>

      <div class="start-bar">
        <label class="inline-field">
          <span>실사 월</span>
          <input v-model="newPeriod" class="inline-input" type="month" />
        </label>
        <button
          v-if="canCount"
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="startStocktake"
        >
          {{ startButtonLabel }}
        </button>
        <p class="helper-text">
          실사를 시작하면 그 달의 사용 중 품목이 시스템 수량과 함께 자동으로
          채워지고 바로 실사표가 열려요. 같은 달 실사가 이미 있으면 새로 만들지
          않고 그 실사를 이어서 열어요. 참관자는 실사표에서 따로 적을 수 있어요.
        </p>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!stocktakes.length" class="empty-box">
        아직 만든 실사가 없어요.
      </p>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>기간</th>
            <th>실사일</th>
            <th>실사자</th>
            <th class="num">입력/전체</th>
            <th class="num">차이</th>
            <th>상태</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in stocktakes"
            :key="row.id"
            :class="{ selected: selectedId === row.id }"
          >
            <td class="mono">{{ formatArcPeriod(row.period) }}</td>
            <td>{{ row.countedOn ? formatArcDate(row.countedOn) : "-" }}</td>
            <td class="dim">{{ row.countedByName || "-" }}</td>
            <td class="num">{{ row.countedItems }} / {{ row.totalItems }}</td>
            <td class="num">{{ row.diffItems }}</td>
            <td>
              <span
                class="status-badge"
                :class="row.status === 'APPLIED' ? 'tone-ok' : 'tone-warn'"
              >
                {{ ARC_STOCKTAKE_STATUS_LABELS[row.status] || row.status }}
              </span>
            </td>
            <td>
              <button
                type="button"
                class="text-button"
                @click="openStocktake(row)"
              >
                열기
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="detail.stocktake" class="panel">
      <div class="panel-head">
        <h2>
          {{ detail.stocktake.period }} 실사
          <span class="dim">
            ({{ ARC_STOCKTAKE_STATUS_LABELS[detail.stocktake.status] }})
          </span>
        </h2>
        <div class="panel-actions">
          <button
            v-if="canApply && detail.stocktake.status === 'DRAFT'"
            type="button"
            class="primary-button"
            :disabled="isSaving"
            @click="applyCurrent"
          >
            실사 확정
          </button>
          <button type="button" class="preset-button" @click="closeDetail">
            닫기
          </button>
        </div>
      </div>

      <p class="helper-text">
        실제 수량을 세어 입력하고 입력란에서 포커스를 옮기면 자동으로 저장돼요.
        개수가 시스템 수량과 같으면 「전체 일치」로 한 번에 채우고, 차이가 나는
        품목만 사유를 남기면 돼요. 실사를 확정하면 이 화면은 더 이상 수정할 수
        없어요.
      </p>

      <div v-if="!isLocked && canCount" class="quick-bar">
        <button
          type="button"
          class="preset-button"
          :disabled="isSaving || bulkFilling"
          @click="fillMatched"
        >
          {{ bulkFilling ? "채우는 중..." : "전체 시스템 수량과 일치" }}
        </button>
        <button
          type="button"
          class="preset-button"
          :disabled="isSaving || bulkFilling"
          @click="clearCounted"
        >
          실사 수량 비우기
        </button>
        <label class="inline-check">
          <input v-model="onlyPending" type="checkbox" />
          미입력·차이 품목만 보기
        </label>
        <span class="helper-text">
          진행 {{ detail.stocktake.countedItems }} /
          {{ detail.stocktake.totalItems }} · 차이
          {{ detail.stocktake.diffItems }}건
        </span>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>실사일</span>
          <input
            v-model="headerForm.countedOn"
            type="date"
            :disabled="isLocked"
          />
        </label>
        <label class="field">
          <span>실사 방법</span>
          <select v-model="headerForm.method" :disabled="isLocked">
            <option
              v-for="(label, value) in ARC_STOCKTAKE_METHOD_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>참관자(입회자)</span>
          <input
            v-model.trim="headerForm.witnessName"
            type="text"
            placeholder="예: 김원재 대표"
            :disabled="isLocked"
          />
        </label>
        <label class="field">
          <span>메모</span>
          <input
            v-model.trim="headerForm.note"
            type="text"
            placeholder="예: 영업 종료 후 실시"
            :disabled="isLocked"
          />
        </label>
        <label class="field wide">
          <span>특이사항</span>
          <input
            v-model.trim="headerForm.issuesNote"
            type="text"
            placeholder="예: 소독용 알코올 2병 부족 → 다음 구매 시 3병 요청"
            :disabled="isLocked"
          />
        </label>
      </div>

      <div class="actions">
        <button
          v-if="!isLocked"
          type="button"
          class="preset-button"
          :disabled="isSaving || !canCount"
          @click="saveHeader"
        >
          실사 정보 저장
        </button>
        <span class="helper-text">
          월 1회 실사는 실사자 + 참관자를 함께 남겨요(AS-KIT-001 §06). 확정
          후에는 수정할 수 없어요.
        </span>
      </div>

      <p v-if="!detail.items.length" class="empty-box">
        실사 품목이 아직 없어요. 「재고」 화면에서 품목을 먼저 등록하면 실사를
        만들 때 시스템 수량과 함께 자동으로 채워져요.
      </p>
      <p v-else-if="!visibleItems.length" class="empty-box">
        미입력·차이 품목이 없어요. 모든 품목이 시스템 수량과 일치해요.
      </p>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>코드</th>
              <th>품명</th>
              <th class="num">시스템</th>
              <th class="num">실사 수량</th>
              <th class="num">차이</th>
              <th>사유</th>
              <th>상태</th>
              <th>조치</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleItems" :key="row.itemId">
              <td class="mono">{{ row.code }}</td>
              <td>
                {{ row.name }}
                <span class="dim">{{ row.unit }}</span>
              </td>
              <td class="num">{{ row.systemQty }}</td>
              <td class="num">
                <input
                  v-model.number="row.countedQty"
                  class="qty-input"
                  type="number"
                  min="0"
                  step="0.01"
                  :disabled="isLocked || !canCount"
                  @change="saveRow(row)"
                />
              </td>
              <td class="num" :class="{ diff: (row.diffQty ?? 0) !== 0 }">
                {{
                  row.countedQty === null ? "-" : row.countedQty - row.systemQty
                }}
              </td>
              <td>
                <input
                  v-model.trim="row.reason"
                  class="reason-input"
                  type="text"
                  placeholder="차이 사유"
                  :disabled="isLocked || !canCount"
                  @change="saveRow(row)"
                />
              </td>
              <td>
                <select
                  v-model="row.state"
                  class="state-select"
                  :disabled="isLocked || !canCount"
                  @change="saveRow(row)"
                >
                  <option
                    v-for="(label, value) in ARC_STOCKTAKE_STATE_LABELS"
                    :key="value"
                    :value="value"
                  >
                    {{ label }}
                  </option>
                </select>
              </td>
              <td>
                <input
                  v-model.trim="row.action"
                  class="reason-input"
                  type="text"
                  placeholder="예: 교체 구매 요청"
                  :disabled="isLocked || !canCount"
                  @change="saveRow(row)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  ARC_STOCKTAKE_METHOD_LABELS,
  ARC_STOCKTAKE_STATE_LABELS,
  ARC_STOCKTAKE_STATUS_LABELS,
  applyArcStocktake,
  createArcStocktake,
  fetchArcStocktake,
  fetchArcStocktakes,
  formatArcDate,
  formatArcPeriod,
  saveArcStocktakeItem,
  updateArcStocktake,
} from "@/lib/arc";

const stocktakes = ref([]);
const detail = ref({ stocktake: null, items: [] });
const canCount = ref(false);
const canApply = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const bulkFilling = ref(false);
const onlyPending = ref(false);
const errorMessage = ref("");
const okMessage = ref("");
const newPeriod = ref(currentMonth());

const headerForm = reactive({
  countedOn: "",
  method: "FULL",
  witnessName: "",
  note: "",
  issuesNote: "",
});

const selectedId = computed(() => detail.value.stocktake?.id ?? "");
const isLocked = computed(() => detail.value.stocktake?.status === "APPLIED");
const startButtonLabel = computed(() =>
  newPeriod.value === currentMonth()
    ? "이번 달 실사 시작"
    : "선택한 달 실사 시작"
);
const visibleItems = computed(() => {
  const rows = detail.value.items ?? [];

  if (!onlyPending.value) {
    return rows;
  }

  return rows.filter(
    (row) =>
      row.countedQty === null ||
      Number(row.countedQty) !== Number(row.systemQty)
  );
});

function currentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${now.getFullYear()}-${month}`;
}

function flash(message) {
  okMessage.value = message;
  errorMessage.value = "";
}

async function loadList() {
  isLoading.value = true;

  try {
    const data = await fetchArcStocktakes();

    stocktakes.value = data.stocktakes;
    canCount.value = data.canCount;
    canApply.value = data.canApply;
  } catch (error) {
    errorMessage.value = error?.message || "실사 목록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function startStocktake() {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    const result = await createArcStocktake({
      period: newPeriod.value || currentMonth(),
    });

    if (!result.stocktake) {
      throw new Error("실사를 만들지 못했어요.");
    }

    flash(
      result.reused
        ? `${result.stocktake.period} 실사는 이미 있어서 그 실사를 열었어요.`
        : `${result.stocktake.period} 실사를 만들었어요. 품목이 자동으로 채워졌어요.`
    );
    await loadList();
    await openStocktake(result.stocktake);
    onlyPending.value = false;
  } catch (error) {
    errorMessage.value = error?.message || "실사를 만들지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

// 실사는 대부분 "시스템 수량과 같음"이라, 전체를 먼저 채우고 차이 나는 품목만 고칩니다.
async function fillMatched() {
  const stocktakeId = detail.value.stocktake?.id;

  if (!stocktakeId || isLocked.value) return;

  bulkFilling.value = true;
  errorMessage.value = "";

  try {
    const targets = detail.value.items.filter(
      (row) =>
        row.countedQty === null ||
        Number(row.countedQty) !== Number(row.systemQty)
    );

    for (const row of targets) {
      row.countedQty = row.systemQty;
      detail.value = await saveArcStocktakeItem(stocktakeId, row.itemId, {
        countedQty: row.systemQty,
        reason: row.reason,
        state: row.state,
        action: row.action,
      });
    }

    flash(
      targets.length
        ? `${targets.length}개 품목을 시스템 수량과 일치하게 채웠어요.`
        : "이미 모든 품목이 시스템 수량과 같아요."
    );
  } catch (error) {
    errorMessage.value = error?.message || "전체 채우기에 실패했어요.";
  } finally {
    bulkFilling.value = false;
  }
}

async function clearCounted() {
  const stocktakeId = detail.value.stocktake?.id;

  if (!stocktakeId || isLocked.value) return;

  bulkFilling.value = true;
  errorMessage.value = "";

  try {
    const targets = detail.value.items.filter((row) => row.countedQty !== null);

    for (const row of targets) {
      row.countedQty = null;
      detail.value = await saveArcStocktakeItem(stocktakeId, row.itemId, {
        countedQty: null,
        reason: row.reason,
        state: row.state,
        action: row.action,
      });
    }

    flash("실사 수량을 모두 비웠어요. 처음부터 다시 세면 돼요.");
  } catch (error) {
    errorMessage.value = error?.message || "실사 수량을 비우지 못했어요.";
  } finally {
    bulkFilling.value = false;
  }
}

function syncHeaderForm(stocktake) {
  Object.assign(headerForm, {
    countedOn: stocktake?.countedOn || "",
    method: stocktake?.method || "FULL",
    witnessName: stocktake?.witnessName || "",
    note: stocktake?.note || "",
    issuesNote: stocktake?.issuesNote || "",
  });
}

async function openStocktake(row) {
  try {
    detail.value = await fetchArcStocktake(row.id);
    syncHeaderForm(detail.value.stocktake);
  } catch (error) {
    errorMessage.value = error?.message || "실사를 불러오지 못했어요.";
  }
}

function closeDetail() {
  detail.value = { stocktake: null, items: [] };
}

async function saveHeader() {
  const stocktakeId = detail.value.stocktake?.id;

  if (!stocktakeId) return;

  isSaving.value = true;

  try {
    detail.value = await updateArcStocktake(stocktakeId, {
      countedOn: headerForm.countedOn,
      method: headerForm.method,
      witnessName: headerForm.witnessName,
      note: headerForm.note,
      issuesNote: headerForm.issuesNote,
    });
    syncHeaderForm(detail.value.stocktake);
    await loadList();
    okMessage.value = "실사 정보를 저장했어요.";
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = error?.message || "실사 정보를 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function saveRow(row) {
  const stocktakeId = detail.value.stocktake?.id;

  if (!stocktakeId) return;

  try {
    detail.value = await saveArcStocktakeItem(stocktakeId, row.itemId, {
      countedQty: row.countedQty,
      reason: row.reason,
      state: row.state,
      action: row.action,
    });
    okMessage.value = `${row.code} 저장했어요.`;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = error?.message || "저장에 실패했어요.";
  }
}

async function applyCurrent() {
  const stocktakeId = detail.value.stocktake?.id;

  if (!stocktakeId) return;

  // eslint-disable-next-line no-alert
  if (
    !window.confirm(
      "실사를 확정하면 재고가 조정되고 되돌릴 수 없어요. 확정할까요?"
    )
  ) {
    return;
  }

  isSaving.value = true;

  try {
    const result = await applyArcStocktake(stocktakeId);

    flash(
      result.adjusted.length
        ? `${result.adjusted.length}개 품목의 재고를 조정했어요.`
        : "차이가 없어서 조정 없이 확정했어요."
    );
    await loadList();
    detail.value = await fetchArcStocktake(stocktakeId);
    syncHeaderForm(detail.value.stocktake);
  } catch (error) {
    errorMessage.value = error?.message || "확정에 실패했어요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(loadList);
</script>

<style scoped lang="scss">
@use "../../scss/_arc-ui" as *;
.admin-arc-stocktake-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.header-actions {
  flex-shrink: 0;
}

.start-bar,
.quick-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
}

.quick-bar {
  border-color: rgba(129, 140, 248, 0.36);
  background: rgba(99, 102, 241, 0.12);
}

.start-bar .helper-text,
.quick-bar .helper-text {
  flex: 1 1 260px;
  line-height: 1.5;
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}

.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
  cursor: pointer;
}

.field {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.data-table {
  th,
  td {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  tr.selected {
    background: rgba(99, 102, 241, 0.14);
  }

  .num {
    white-space: nowrap;
  }

  .diff {
    color: #fcd34d;
    font-weight: 800;
  }
}

.qty-input {
  width: 90px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
  text-align: right;
}

.reason-input {
  width: 100%;
  min-width: 160px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
}

.state-select {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
}

.tone-ok {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}

.tone-warn {
  background: rgba(251, 191, 36, 0.16);
  color: #fcd34d;
}
</style>
