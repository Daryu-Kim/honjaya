<template>
  <div class="admin-arc-purchase-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>보충·구매·실비정산</h1>
        <p class="description">
          구급상자 보충에 쓴 비용을 남겨요. 대표가 개인결제한 건은 승인 후
          정산완료로 바뀌고, 누가 얼마를 결제했는지 그대로 남습니다.
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

    <section class="summary-grid">
      <article class="summary-card" :class="{ alert: unsettledCount > 0 }">
        <span class="summary-label">미정산 건</span>
        <strong>{{ unsettledCount }}건</strong>
      </article>
      <article class="summary-card" :class="{ alert: unsettledAmount > 0 }">
        <span class="summary-label">미정산 금액</span>
        <strong>{{ unsettledAmount.toLocaleString("ko-KR") }}원</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">이번 목록 합계</span>
        <strong>{{ totalAmount.toLocaleString("ko-KR") }}원</strong>
      </article>
    </section>

    <section v-if="canCreate" class="panel">
      <h2>구매 기록 추가</h2>

      <div class="field-grid">
        <label class="field">
          <span>품목</span>
          <select v-model="form.itemId">
            <option value="">직접 입력</option>
            <option v-for="item in items" :key="item.id" :value="item.id">
              {{ item.code }} · {{ item.name }}
            </option>
          </select>
        </label>

        <label v-if="!form.itemId" class="field">
          <span>품목명</span>
          <input v-model.trim="form.itemName" type="text" />
        </label>

        <label class="field">
          <span>수량</span>
          <input v-model.number="form.qty" type="number" min="0" step="0.01" />
        </label>

        <label class="field">
          <span>단가(원)</span>
          <input
            v-model.number="form.unitPrice"
            type="number"
            min="0"
            step="10"
          />
        </label>

        <label class="field">
          <span>금액(원)</span>
          <input v-model.number="form.amount" type="number" min="0" step="10" />
          <small>비우면 단가 × 수량으로 계산해요.</small>
        </label>

        <label class="field">
          <span>구매일</span>
          <input v-model="form.purchasedOn" type="date" />
        </label>

        <label class="field">
          <span>구매처</span>
          <input
            v-model.trim="form.vendor"
            type="text"
            placeholder="예: 약국"
          />
        </label>

        <label class="field">
          <span>영수증 번호</span>
          <input v-model.trim="form.receiptNo" type="text" />
        </label>

        <label class="field">
          <span>결제 주체</span>
          <select v-model="form.paidBy">
            <option value="SHOP">사업장 법인카드</option>
            <option value="OWNER">대표 개인결제</option>
            <option value="RN">최윤희 RN 개인결제</option>
            <option value="OTHER">기타</option>
          </select>
        </label>

        <label class="field">
          <span>유효기간(입고 시)</span>
          <input v-model="form.expiresOn" type="date" />
        </label>

        <label class="field wide">
          <span>사유·메모</span>
          <input
            v-model.trim="form.reason"
            type="text"
            placeholder="예: 생리식염수 2개 보충"
          />
        </label>

        <label class="field checkbox-field">
          <input v-model="form.applyToStock" type="checkbox" />
          <span>재고에도 바로 반영(입고)</span>
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitPurchase"
        >
          구매 기록 저장
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>구매·정산 대장</h2>
        <div class="panel-actions">
          <input
            v-model="period"
            class="inline-input"
            type="month"
            @change="load"
          />
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="load"
          >
            새로고침
          </button>
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!purchases.length" class="empty-box">
        이 기간에 기록된 구매가 없어요.
      </p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>구매일</th>
              <th>품목</th>
              <th class="num">수량</th>
              <th class="num">금액</th>
              <th>결제 주체</th>
              <th>구매처</th>
              <th>정산</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in purchases" :key="row.id">
              <td>{{ row.purchasedOn || "-" }}</td>
              <td>
                {{ row.itemName || "-" }}
                <div class="mono dim">{{ row.itemCode }}</div>
              </td>
              <td class="num">{{ row.qty }}</td>
              <td class="num">{{ row.amount.toLocaleString("ko-KR") }}</td>
              <td class="dim">
                {{ ARC_PAID_BY_LABELS[row.paidBy] || row.paidBy }}
              </td>
              <td class="dim">{{ row.vendor || "-" }}</td>
              <td>
                <span
                  class="status-badge"
                  :class="
                    row.settleStatus === 'SETTLED' ? 'tone-ok' : 'tone-warn'
                  "
                >
                  {{
                    ARC_SETTLE_STATUS_LABELS[row.settleStatus] ||
                    row.settleStatus
                  }}
                </span>
                <div v-if="row.settledAmount" class="dim">
                  {{ row.settledAmount.toLocaleString("ko-KR") }}원
                </div>
              </td>
              <td>
                <div v-if="canSettle" class="row-actions">
                  <input
                    v-model.number="settleInputs[row.id]"
                    class="qty-input"
                    type="number"
                    min="0"
                    step="10"
                  />
                  <button
                    type="button"
                    class="text-button"
                    @click="settle(row, false)"
                  >
                    정산 저장
                  </button>
                  <button
                    type="button"
                    class="text-button"
                    @click="settle(row, true)"
                  >
                    승인
                  </button>
                </div>
                <span v-else class="dim">-</span>
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
  ARC_PAID_BY_LABELS,
  ARC_SETTLE_STATUS_LABELS,
  createArcPurchase,
  fetchArcPurchases,
  fetchArcStock,
  settleArcPurchase,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";

const purchases = ref([]);
const items = ref([]);
const period = ref(currentMonth());
const settleInputs = reactive({});
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const form = reactive({
  itemId: "",
  itemName: "",
  qty: 1,
  unitPrice: 0,
  amount: 0,
  purchasedOn: today(),
  vendor: "",
  receiptNo: "",
  paidBy: "SHOP",
  expiresOn: "",
  reason: "",
  applyToStock: true,
});

const canCreate = computed(() => hasPermission("arc.stock"));
const canSettle = computed(() => hasPermission("arc.approve"));

const unsettledCount = computed(
  () => purchases.value.filter((row) => row.settleStatus !== "SETTLED").length
);

const unsettledAmount = computed(() =>
  purchases.value.reduce(
    (sum, row) =>
      row.settleStatus === "SETTLED"
        ? sum
        : sum + (row.amount - row.settledAmount),
    0
  )
);

const totalAmount = computed(() =>
  purchases.value.reduce((sum, row) => sum + row.amount, 0)
);

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

function currentMonth() {
  return today().slice(0, 7);
}

function flash(message) {
  okMessage.value = message;
  errorMessage.value = "";
}

async function load() {
  isLoading.value = true;

  try {
    const data = await fetchArcPurchases({ period: period.value });

    purchases.value = data.purchases;
    purchases.value.forEach((row) => {
      if (settleInputs[row.id] === undefined) {
        settleInputs[row.id] = row.amount;
      }
    });
  } catch (error) {
    errorMessage.value = error?.message || "구매 대장을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function loadItems() {
  try {
    const data = await fetchArcStock();

    items.value = data.items;
  } catch {
    items.value = [];
  }
}

async function submitPurchase() {
  isSaving.value = true;

  try {
    await createArcPurchase({
      itemId: form.itemId || undefined,
      itemName: form.itemName,
      qty: form.qty,
      unitPrice: form.unitPrice,
      amount: form.amount || form.unitPrice * form.qty,
      purchasedOn: form.purchasedOn,
      vendor: form.vendor,
      receiptNo: form.receiptNo,
      paidBy: form.paidBy,
      expiresOn: form.expiresOn,
      reason: form.reason,
      applyToStock: form.applyToStock,
    });

    form.itemName = "";
    form.qty = 1;
    form.unitPrice = 0;
    form.amount = 0;
    form.vendor = "";
    form.receiptNo = "";
    form.reason = "";
    form.expiresOn = "";
    flash("구매 기록을 저장했어요.");
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "저장에 실패했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function settle(row, approve) {
  try {
    await settleArcPurchase(row.id, {
      settledAmount: settleInputs[row.id] ?? row.amount,
      approve,
    });

    flash(approve ? "정산을 승인했어요." : "정산 금액을 저장했어요.");
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "정산 처리에 실패했어요.";
  }
}

onMounted(async () => {
  await Promise.all([load(), loadItems()]);
});
</script>

<style scoped lang="scss">
.admin-arc-purchase-view {
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);

  &.alert {
    background: rgba(248, 113, 113, 0.16);
  }

  strong {
    font-size: 19px;
    font-weight: 800;
  }
}

.summary-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
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
  padding: 11px 20px;
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.28);
  color: #e0e7ff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);

  &.wide {
    grid-column: span 2;
  }

  input,
  select {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    font-size: 13px;
  }

  small {
    color: rgba(255, 255, 255, 0.48);
    line-height: 1.5;
  }
}

.checkbox-field.field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
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
    vertical-align: top;
  }

  th {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
  }

  .num {
    text-align: right;
    white-space: nowrap;
  }
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.dim {
  color: rgba(255, 255, 255, 0.5);
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

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.qty-input {
  width: 96px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 12px;
  text-align: right;
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
