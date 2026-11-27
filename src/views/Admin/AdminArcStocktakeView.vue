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
          <input v-model="newPeriod" class="inline-input" type="month" />
          <button
            v-if="canCount"
            type="button"
            class="preset-button"
            :disabled="isSaving"
            @click="startStocktake"
          >
            선택한 달 실사 시작
          </button>
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
            <td class="mono">{{ row.period }}</td>
            <td>{{ row.countedOn || "-" }}</td>
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
        실사를 확정하면 이 화면은 더 이상 수정할 수 없어요.
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
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in detail.items" :key="row.itemId">
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
                  :disabled="detail.stocktake.status === 'APPLIED' || !canCount"
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
                  :disabled="detail.stocktake.status === 'APPLIED' || !canCount"
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
import { computed, onMounted, ref } from "vue";

import {
  ARC_STOCKTAKE_STATUS_LABELS,
  applyArcStocktake,
  createArcStocktake,
  fetchArcStocktake,
  fetchArcStocktakes,
  saveArcStocktakeItem,
} from "@/lib/arc";

const stocktakes = ref([]);
const detail = ref({ stocktake: null, items: [] });
const canCount = ref(false);
const canApply = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");
const newPeriod = ref(currentMonth());

const selectedId = computed(() => detail.value.stocktake?.id ?? "");

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

  try {
    const stocktake = await createArcStocktake({ period: newPeriod.value });

    flash(`${stocktake.period} 실사를 만들었어요.`);
    await loadList();
    await openStocktake(stocktake);
  } catch (error) {
    errorMessage.value = error?.message || "실사를 만들지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function openStocktake(row) {
  try {
    detail.value = await fetchArcStocktake(row.id);
  } catch (error) {
    errorMessage.value = error?.message || "실사를 불러오지 못했어요.";
  }
}

function closeDetail() {
  detail.value = { stocktake: null, items: [] };
}

async function saveRow(row) {
  const stocktakeId = detail.value.stocktake?.id;

  if (!stocktakeId) return;

  try {
    detail.value = await saveArcStocktakeItem(stocktakeId, row.itemId, {
      countedQty: row.countedQty,
      reason: row.reason,
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
  } catch (error) {
    errorMessage.value = error?.message || "확정에 실패했어요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(loadList);
</script>

<style scoped lang="scss">
.admin-arc-stocktake-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
}

.description {
  margin: 0;
  max-width: 700px;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.66);
}

.link-button {
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.inline-input {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
}

.preset-button {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.86);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.primary-button {
  padding: 9px 16px;
  border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.28);
  color: #e0e7ff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 9px 10px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    vertical-align: middle;
  }

  th {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
  }

  tr.selected {
    background: rgba(99, 102, 241, 0.14);
  }

  .num {
    text-align: right;
    white-space: nowrap;
  }

  .diff {
    color: #fcd34d;
    font-weight: 800;
  }
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.dim {
  color: rgba(255, 255, 255, 0.5);
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

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.tone-ok {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}

.tone-warn {
  background: rgba(251, 191, 36, 0.16);
  color: #fcd34d;
}

.text-button {
  padding: 0;
  border: none;
  background: none;
  color: #c7d2fe;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.helper-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
}

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
  font-size: 13px;
}

.ok-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(52, 211, 153, 0.14);
  color: #6ee7b7;
  font-size: 13px;
}

.empty-box {
  margin: 0;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
