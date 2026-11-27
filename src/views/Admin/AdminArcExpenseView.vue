<template>
  <div class="admin-arc-expense-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>비용 · 실비정산</h1>
        <p class="description">
          구급상자 소모품·인쇄·교통 등 실제 발생한 비용과 정산 내역을 남겨요. 월
          소모금액을 한 번에 정산서로 묶을 수 있고, 입금은 나눠 받은 만큼
          부분입금으로 기록해요. 정산 원칙은 월말 또는 청구 후 14일 이내예요.
        </p>
      </div>
      <div class="header-actions">
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
        <router-link to="/admin/arc/usages" class="link-button">
          사용대장
        </router-link>
        <router-link to="/admin/arc/stock" class="link-button">
          재고
        </router-link>
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="summary-grid">
      <article
        class="summary-card"
        :class="{ alert: (summary?.openAmount ?? 0) > 0 }"
      >
        <span class="summary-label">미정산 금액</span>
        <strong>{{ formatArcMoney(summary?.openAmount) }}</strong>
        <small class="dim">{{ summary?.openCount ?? 0 }}건</small>
      </article>
      <article class="summary-card">
        <span class="summary-label">이번 달 지출</span>
        <strong>{{ formatArcMoney(summary?.monthAmount) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">이번 달 입금</span>
        <strong>{{ formatArcMoney(summary?.paidThisMonth) }}</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary?.overdueCount ?? 0) > 0 }"
      >
        <span class="summary-label">기한 지난 건</span>
        <strong>{{ summary?.overdueCount ?? 0 }}건</strong>
      </article>
    </section>

    <section v-if="canCreate" class="panel">
      <h2>월 소모금액 일괄 정산</h2>
      <p class="hint">
        사용대장에 기록된 소모금액 중 아직 정산서로 묶지 않은 건을 한 장의
        정산서로 만들어요. 내구재만 사용한 기록은 대상이 아니에요.
      </p>

      <div class="field-grid">
        <label class="field">
          <span>정산 기간</span>
          <input v-model="monthForm.period" type="month" @change="load" />
        </label>

        <label class="field">
          <span>청구인</span>
          <input
            v-model.trim="monthForm.claimant"
            type="text"
            placeholder="비우면 내 이름으로 기록돼요"
          />
        </label>

        <label class="field">
          <span>부담 주체</span>
          <select v-model="monthForm.paidBy">
            <option value="RN">최윤희 RN 개인결제</option>
            <option value="OWNER">대표 개인결제</option>
            <option value="SHOP">사업장 법인카드</option>
            <option value="OTHER">기타</option>
          </select>
        </label>

        <div class="pending-box">
          <span class="summary-label">대상 사용대장</span>
          <strong>
            {{ pendingUsage?.usageCount ?? 0 }}건 ·
            {{ formatArcMoney(pendingUsage?.total) }}
          </strong>
        </div>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving || (pendingUsage?.usageCount ?? 0) === 0"
          @click="submitMonthExpense"
        >
          이 기간으로 정산서 만들기
        </button>
      </div>
    </section>

    <section v-if="canCreate" class="panel">
      <h2>정산 항목 직접 등록</h2>

      <div class="field-grid">
        <label class="field">
          <span>일자</span>
          <input v-model="form.spentOn" type="date" />
        </label>

        <label class="field">
          <span>비용 구분</span>
          <select v-model="form.category">
            <option
              v-for="(label, value) in ARC_EXPENSE_CATEGORY_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </label>

        <label class="field wide">
          <span>목적·품목</span>
          <input
            v-model.trim="form.purpose"
            type="text"
            placeholder="예: 소독약·거즈 보충"
          />
        </label>

        <label class="field">
          <span>금액(원)</span>
          <input v-model.number="form.amount" type="number" min="0" step="10" />
        </label>

        <label class="field">
          <span>청구인</span>
          <input v-model.trim="form.claimant" type="text" />
        </label>

        <label class="field">
          <span>부담 주체</span>
          <select v-model="form.paidBy">
            <option value="RN">최윤희 RN 개인결제</option>
            <option value="OWNER">대표 개인결제</option>
            <option value="SHOP">사업장 법인카드</option>
            <option value="OTHER">기타</option>
          </select>
        </label>

        <label class="field">
          <span>구매처</span>
          <input v-model.trim="form.vendor" type="text" />
        </label>

        <label class="field">
          <span>영수증 번호</span>
          <input v-model.trim="form.receiptNo" type="text" />
        </label>

        <label class="field">
          <span>지급 기한</span>
          <input v-model="form.dueOn" type="date" />
        </label>

        <label class="field wide">
          <span>메모</span>
          <input v-model.trim="form.note" type="text" />
        </label>

        <label class="field checkbox-field">
          <input v-model="form.preApproved" type="checkbox" />
          <span>사전 승인된 비용</span>
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitExpense"
        >
          정산 항목 저장
        </button>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>정산 대장</h2>
        <div class="panel-actions">
          <input
            v-model="period"
            class="inline-input"
            type="month"
            @change="load"
          />
          <select v-model="statusFilter" class="inline-input" @change="load">
            <option value="">전체</option>
            <option value="UNSETTLED">미정산</option>
            <option value="PARTIAL">일부정산</option>
            <option value="SETTLED">정산완료</option>
          </select>
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
      <p v-else-if="!expenses.length" class="empty-box">
        이 기간에 등록된 정산 항목이 없어요.
      </p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>일자</th>
              <th>번호</th>
              <th>구분</th>
              <th>목적·품목</th>
              <th class="num">금액</th>
              <th class="num">입금</th>
              <th>정산</th>
              <th>기한</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in expenses" :key="row.id">
              <tr :class="{ selected: expandedId === row.id }">
                <td>{{ row.spentOn || "-" }}</td>
                <td>
                  <span class="mono">{{ row.expenseNo }}</span>
                  <div v-if="row.period" class="dim">{{ row.period }}</div>
                </td>
                <td class="dim">
                  {{ row.categoryLabel || row.category }}
                  <div v-if="row.sourceType === 'USAGE_MONTH'" class="dim">
                    월 소모금액
                  </div>
                </td>
                <td>
                  {{ row.purpose }}
                  <div v-if="row.vendor" class="dim">{{ row.vendor }}</div>
                </td>
                <td class="num">{{ formatArcMoney(row.amount) }}</td>
                <td class="num">
                  {{ formatArcMoney(row.settledAmount) }}
                  <div class="dim">
                    남은 {{ formatArcMoney(row.remainingAmount) }}
                  </div>
                </td>
                <td>
                  <span
                    class="status-badge"
                    :class="
                      row.settleStatus === 'SETTLED'
                        ? 'tone-ok'
                        : row.settleStatus === 'PARTIAL'
                        ? 'tone-warn'
                        : 'tone-muted'
                    "
                  >
                    {{
                      ARC_SETTLE_STATUS_LABELS[row.settleStatus] ||
                      row.settleStatus
                    }}
                  </span>
                  <div v-if="row.approvedByName" class="dim">
                    대표확인 {{ row.approvedByName }}
                  </div>
                </td>
                <td class="dim">
                  {{ row.dueOn || "-" }}
                </td>
                <td>
                  <div class="row-actions">
                    <button
                      type="button"
                      class="text-button"
                      @click="toggleDetail(row)"
                    >
                      {{ expandedId === row.id ? "닫기" : "입금·이력" }}
                    </button>
                    <button
                      v-if="
                        canApprove &&
                        !row.approvedAt &&
                        row.settleStatus !== 'SETTLED'
                      "
                      type="button"
                      class="text-button"
                      :disabled="isSaving"
                      @click="approveExpense(row)"
                    >
                      대표확인
                    </button>
                  </div>
                </td>
              </tr>

              <tr v-if="expandedId === row.id" class="detail-row">
                <td colspan="9">
                  <div class="detail-panel">
                    <div class="detail-head">
                      <h3>입금 이력</h3>
                      <span class="dim">
                        {{ row.paymentCount }}건 ·
                        {{ formatArcMoney(row.settledAmount) }} /
                        {{ formatArcMoney(row.amount) }}
                      </span>
                    </div>

                    <p v-if="!detailPayments.length" class="empty-box">
                      아직 입금 기록이 없어요.
                    </p>

                    <table v-else class="data-table inner-table">
                      <thead>
                        <tr>
                          <th>입금일</th>
                          <th>방법</th>
                          <th class="num">금액</th>
                          <th>메모</th>
                          <th>작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="payment in detailPayments" :key="payment.id">
                          <td>{{ payment.paidOn }}</td>
                          <td class="dim">
                            {{
                              ARC_PAYMENT_METHOD_LABELS[payment.method] ||
                              payment.method
                            }}
                          </td>
                          <td class="num">
                            {{ formatArcMoney(payment.amount) }}
                          </td>
                          <td class="dim">{{ payment.note || "-" }}</td>
                          <td>
                            <button
                              v-if="canCreate"
                              type="button"
                              class="text-button"
                              :disabled="isSaving"
                              @click="removePayment(row, payment)"
                            >
                              삭제
                            </button>
                            <span v-else class="dim">-</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div
                      v-if="canCreate && row.remainingAmount > 0"
                      class="field-grid compact"
                    >
                      <label class="field">
                        <span>입금일</span>
                        <input v-model="paymentForm.paidOn" type="date" />
                      </label>
                      <label class="field">
                        <span>입금액(원)</span>
                        <input
                          v-model.number="paymentForm.amount"
                          type="number"
                          min="0"
                          step="10"
                        />
                      </label>
                      <label class="field">
                        <span>방법</span>
                        <select v-model="paymentForm.method">
                          <option
                            v-for="(label, value) in ARC_PAYMENT_METHOD_LABELS"
                            :key="value"
                            :value="value"
                          >
                            {{ label }}
                          </option>
                        </select>
                      </label>
                      <label class="field wide">
                        <span>메모</span>
                        <input v-model.trim="paymentForm.note" type="text" />
                      </label>
                    </div>

                    <div
                      v-if="canCreate && row.remainingAmount > 0"
                      class="actions"
                    >
                      <button
                        type="button"
                        class="primary-button"
                        :disabled="isSaving"
                        @click="submitPayment(row)"
                      >
                        입금 기록
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  ARC_EXPENSE_CATEGORY_LABELS,
  ARC_PAYMENT_METHOD_LABELS,
  ARC_SETTLE_STATUS_LABELS,
  addArcExpensePayment,
  approveArcExpense,
  createArcExpense,
  createArcExpenseFromUsageMonth,
  fetchArcExpense,
  fetchArcExpenses,
  formatArcMoney,
  removeArcExpensePayment,
} from "@/lib/arc";

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayInput() {
  const now = new Date();

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
}

function currentMonthInput() {
  const now = new Date();

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function defaultDue() {
  const due = new Date();
  due.setDate(due.getDate() + 14);

  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(
    due.getDate()
  )}`;
}

const expenses = ref([]);
const summary = ref(null);
const pendingUsage = ref(null);
const canCreate = ref(false);
const canApprove = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");
const statusFilter = ref("");
const expandedId = ref("");
const detailPayments = ref([]);

const monthForm = reactive({
  period: currentMonthInput(),
  claimant: "",
  paidBy: "RN",
});

// 월 일괄 정산 패널과 정산 대장 필터가 항상 같은 달을 보도록 하나로 묶습니다.
const period = computed({
  get: () => monthForm.period,
  set: (value) => {
    monthForm.period = value;
  },
});

const form = reactive({
  spentOn: todayInput(),
  category: "SUPPLY",
  purpose: "",
  amount: 0,
  claimant: "",
  paidBy: "RN",
  vendor: "",
  receiptNo: "",
  dueOn: defaultDue(),
  note: "",
  preApproved: false,
});

const paymentForm = reactive({
  paidOn: todayInput(),
  amount: 0,
  method: "TRANSFER",
  note: "",
});

function resetForm() {
  form.spentOn = todayInput();
  form.category = "SUPPLY";
  form.purpose = "";
  form.amount = 0;
  form.claimant = "";
  form.paidBy = "RN";
  form.vendor = "";
  form.receiptNo = "";
  form.dueOn = defaultDue();
  form.note = "";
  form.preApproved = false;
}

async function refreshDetail(expenseId) {
  const data = await fetchArcExpense(expenseId);

  detailPayments.value = data.payments;

  const target = expenses.value.find((row) => row.id === expenseId);

  if (target && data.expense) {
    Object.assign(target, data.expense);
  }

  paymentForm.amount = data.expense?.remainingAmount ?? 0;
}

async function load() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchArcExpenses({
      period: monthForm.period,
      status: statusFilter.value,
      limit: 200,
    });

    expenses.value = data.expenses;
    summary.value = data.summary;
    pendingUsage.value = data.pendingUsage;
    canCreate.value = data.canCreate;
    canApprove.value = data.canApprove;

    if (expandedId.value) {
      await refreshDetail(expandedId.value);
    }
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "정산 대장을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
  } finally {
    isLoading.value = false;
  }
}

async function submitMonthExpense() {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const result = await createArcExpenseFromUsageMonth({
      period: monthForm.period,
      claimant: monthForm.claimant,
      paidBy: monthForm.paidBy,
    });

    okMessage.value = `${
      result.expense?.expenseNo ?? "정산서"
    }를 만들었어요. 대상 ${
      result.applied?.usageCount ?? 0
    }건 · ${formatArcMoney(result.applied?.total)}`;

    await load();
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "정산서를 만들지 못했어요. 대상 사용대장을 확인해 주세요.";
  } finally {
    isSaving.value = false;
  }
}

async function submitExpense() {
  if (isSaving.value) return;

  if (!form.purpose.trim()) {
    errorMessage.value = "목적·품목을 입력해 주세요.";
    return;
  }

  if (!(Number(form.amount) > 0)) {
    errorMessage.value = "금액은 0보다 커야 해요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const result = await createArcExpense({
      spentOn: form.spentOn,
      category: form.category,
      purpose: form.purpose,
      amount: Number(form.amount),
      claimant: form.claimant,
      paidBy: form.paidBy,
      vendor: form.vendor,
      receiptNo: form.receiptNo,
      dueOn: form.dueOn,
      note: form.note,
      preApproved: form.preApproved,
    });

    okMessage.value = `${
      result.expense?.expenseNo ?? "정산 항목"
    }을 등록했어요.`;
    resetForm();

    await load();
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "정산 항목을 저장하지 못했어요. 입력값을 확인해 주세요.";
  } finally {
    isSaving.value = false;
  }
}

async function toggleDetail(row) {
  if (expandedId.value === row.id) {
    expandedId.value = "";
    detailPayments.value = [];

    return;
  }

  expandedId.value = row.id;
  errorMessage.value = "";

  try {
    await refreshDetail(row.id);
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "입금 이력을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

async function submitPayment(row) {
  if (isSaving.value) return;

  const amount = Number(paymentForm.amount);

  if (!(amount > 0)) {
    errorMessage.value = "입금액은 0보다 커야 해요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await addArcExpensePayment(row.id, {
      paidOn: paymentForm.paidOn,
      amount,
      method: paymentForm.method,
      note: paymentForm.note,
    });

    okMessage.value = `${formatArcMoney(amount)} 입금을 기록했어요.`;
    paymentForm.note = "";

    await load();
  } catch (error) {
    errorMessage.value =
      error?.message || "입금을 기록하지 못했어요. 남은 금액을 확인해 주세요.";
  } finally {
    isSaving.value = false;
  }
}

async function removePayment(row, payment) {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await removeArcExpensePayment(row.id, payment.id);
    okMessage.value = "입금 기록을 삭제하고 정산 상태를 다시 계산했어요.";

    await load();
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "입금 기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.";
  } finally {
    isSaving.value = false;
  }
}

async function approveExpense(row) {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await approveArcExpense(row.id);
    okMessage.value = `${row.expenseNo} 대표확인을 기록했어요.`;

    await load();
  } catch (error) {
    errorMessage.value =
      error?.message || "대표확인을 기록하지 못했어요. 권한을 확인해 주세요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.admin-arc-expense-view {
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

.header-left {
  display: flex;
  flex-direction: column;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
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
  max-width: 760px;
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
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
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
    background: rgba(251, 191, 36, 0.16);
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

  &.compact {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
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

  &.checkbox-field {
    flex-direction: row;
    align-items: center;
    gap: 8px;

    input[type="checkbox"] {
      width: 16px;
      height: 16px;
    }
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

  input:disabled {
    opacity: 0.55;
  }
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.pending-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.14);

  strong {
    font-size: 15px;
    font-weight: 800;
  }
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

  tr.selected td {
    background: rgba(99, 102, 241, 0.12);
  }

  &.inner-table {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 12px;
  }
}

.detail-row > td {
  background: rgba(255, 255, 255, 0.03);
}

.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-size: 14px;
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

.tone-muted {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.text-button {
  padding: 0;
  border: none;
  background: none;
  color: #c7d2fe;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
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
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

@media (max-width: 900px) {
  .page-header {
    flex-direction: column;
  }

  .field.wide {
    grid-column: span 1;
  }
}
</style>
