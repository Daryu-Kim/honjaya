<template>
  <div class="admin-prepaid-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN PREPAID</p>
        <h1>선불권 관리</h1>
        <p class="description">
          회원에게 귀속되는 선불권 상품을 만들고, 판매·잔액·사용 내역을
          관리해요.
        </p>
      </div>
    </header>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">판매 금액</span>
        <strong>{{ formatWon(summary.totals.sold) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">사용 금액</span>
        <strong>-{{ formatWon(summary.totals.used) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">발급 건수</span>
        <strong>{{ summary.totals.issuedCount }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">미사용 잔액(부채)</span>
        <strong>{{ formatWon(summary.totals.liability) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">사용 가능 선불권</span>
        <strong>{{ summary.totals.activeCount }}건</strong>
      </article>
    </section>

    <section class="tab-row">
      <button
        type="button"
        class="tab-button"
        :class="{ active: activeTab === 'plans' }"
        @click="activeTab = 'plans'"
      >
        상품 설정
      </button>
      <button
        type="button"
        class="tab-button"
        :class="{ active: activeTab === 'passes' }"
        @click="switchToPasses"
      >
        발급·잔액 현황
      </button>
    </section>

    <!-- 상품 설정 -->
    <section v-if="activeTab === 'plans'" class="panel">
      <div class="panel-head">
        <h2>선불권 상품</h2>
        <div class="panel-actions">
          <button
            type="button"
            class="preset-button"
            :disabled="!canManage"
            @click="startCreatePlan"
          >
            새 상품 만들기
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoadingPlans"
            @click="loadPlans"
          >
            새로고침
          </button>
        </div>
      </div>

      <p v-if="!canManage" class="notice-text">
        상품 설정은 사장 권한에서만 수정할 수 있어요.
      </p>
      <p v-if="planError" class="error-box">{{ planError }}</p>

      <div v-if="isLoadingPlans" class="empty-box">
        <p>상품을 불러오는 중이에요.</p>
      </div>
      <div v-else-if="plans.length === 0" class="empty-box">
        <p>등록된 선불권 상품이 없어요.</p>
      </div>
      <div v-else class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>상품</th>
              <th>판매가</th>
              <th>충전금액</th>
              <th>유효기간</th>
              <th>사용 조건</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="plan in plans" :key="plan.id">
              <td>{{ plan.name }}</td>
              <td>{{ formatWon(plan.price) }}</td>
              <td>
                {{ formatWon(plan.faceValue) }}
                <span v-if="plan.bonusAmount > 0" class="bonus-text">
                  (+{{ formatWon(plan.bonusAmount) }})
                </span>
              </td>
              <td>
                {{
                  plan.validityMonths > 0
                    ? `${plan.validityMonths}개월`
                    : "무제한"
                }}
              </td>
              <td class="rule-cell">{{ describePlanRule(plan) }}</td>
              <td>
                <span :class="plan.isActive ? 'badge-on' : 'badge-off'">
                  {{ plan.isActive ? "판매중" : "판매중지" }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="preset-button"
                  :disabled="!canManage"
                  @click="startEditPlan(plan)"
                >
                  수정
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form
        v-if="canManage && planFormOpen"
        class="plan-form"
        @submit.prevent="submitPlan"
      >
        <h3>{{ planForm.id ? "상품 수정" : "새 상품" }}</h3>

        <div class="form-grid">
          <div class="filter-group">
            <label for="planName">상품 이름</label>
            <input
              id="planName"
              v-model.trim="planForm.name"
              type="text"
              maxlength="40"
              placeholder="예: 10만원 충전권"
            />
          </div>
          <div class="filter-group">
            <label for="planPrice">판매가(실제 결제)</label>
            <input
              id="planPrice"
              v-model.number="planForm.price"
              type="number"
              min="0"
              step="1000"
            />
          </div>
          <div class="filter-group">
            <label for="planFaceValue">충전 금액</label>
            <input
              id="planFaceValue"
              v-model.number="planForm.faceValue"
              type="number"
              min="0"
              step="1000"
            />
          </div>
          <div class="filter-group">
            <label for="planValidity">유효기간(개월, 0=무제한)</label>
            <input
              id="planValidity"
              v-model.number="planForm.validityMonths"
              type="number"
              min="0"
              max="120"
            />
          </div>
          <div class="filter-group">
            <label for="planMinPayment">최소 결제 금액(원)</label>
            <input
              id="planMinPayment"
              v-model.number="planForm.minPaymentAmount"
              type="number"
              min="0"
              step="1000"
            />
          </div>
          <div class="filter-group">
            <label for="planMinUse">최소 사용 금액(원)</label>
            <input
              id="planMinUse"
              v-model.number="planForm.minUseAmount"
              type="number"
              min="0"
              step="1000"
            />
          </div>
          <div class="filter-group">
            <label for="planMaxPercent">결제액 대비 사용 한도(%)</label>
            <input
              id="planMaxPercent"
              v-model.number="planForm.maxUsePercent"
              type="number"
              min="1"
              max="100"
            />
          </div>
          <div class="filter-group">
            <label for="planSortOrder">정렬 순서</label>
            <input
              id="planSortOrder"
              v-model.number="planForm.sortOrder"
              type="number"
              min="0"
            />
          </div>
          <div class="filter-group">
            <label for="planFromTime">사용 시작 시간</label>
            <input
              id="planFromTime"
              v-model="planForm.usableFromTime"
              type="time"
            />
          </div>
          <div class="filter-group">
            <label for="planToTime">사용 종료 시간</label>
            <input
              id="planToTime"
              v-model="planForm.usableToTime"
              type="time"
            />
          </div>
        </div>

        <div class="filter-group">
          <label>사용 가능 요일 (선택 없음 = 매일)</label>
          <div class="weekday-row">
            <label
              v-for="day in PREPAID_WEEKDAYS"
              :key="day.value"
              class="weekday-chip"
              :class="{ active: planForm.usableDays.includes(day.value) }"
            >
              <input
                type="checkbox"
                :value="day.value"
                :checked="planForm.usableDays.includes(day.value)"
                @change="togglePlanDay(day.value)"
              />
              <span>{{ day.label }}</span>
            </label>
          </div>
        </div>

        <div class="check-row">
          <label class="check-item">
            <input v-model="planForm.usableFromNextVisit" type="checkbox" />
            <span>구매 다음 영업일부터 사용</span>
          </label>
          <label class="check-item">
            <input v-model="planForm.allowMultiple" type="checkbox" />
            <span>같은 상품 중복 구매 허용</span>
          </label>
          <label class="check-item">
            <input v-model="planForm.isActive" type="checkbox" />
            <span>판매 중</span>
          </label>
        </div>

        <div class="filter-group">
          <label for="planMemo">메모</label>
          <input
            id="planMemo"
            v-model.trim="planForm.memo"
            type="text"
            maxlength="200"
          />
        </div>

        <p v-if="planFormMessage" class="adjust-message">
          {{ planFormMessage }}
        </p>

        <div class="filter-actions">
          <button type="submit" class="preset-button" :disabled="isSavingPlan">
            {{ isSavingPlan ? "저장 중..." : "저장" }}
          </button>
          <button type="button" class="preset-button" @click="closePlanForm">
            취소
          </button>
        </div>
      </form>
    </section>

    <!-- 발급·잔액 현황 -->
    <section v-else class="panel">
      <div class="panel-head">
        <h2>발급 현황</h2>
        <div class="panel-actions">
          <button
            type="button"
            class="preset-button"
            :disabled="isLoadingPasses"
            @click="loadPasses"
          >
            새로고침
          </button>
        </div>
      </div>

      <div class="filter-grid">
        <div class="filter-group wide">
          <label for="passPhone">고객 전화번호</label>
          <input
            id="passPhone"
            :value="passPhoneInput"
            type="tel"
            inputmode="numeric"
            maxlength="13"
            placeholder="010-0000-0000"
            @input="onPassPhoneInput"
            @keyup.enter="loadPasses"
          />
        </div>
        <div class="filter-group">
          <label for="passStatus">상태</label>
          <select id="passStatus" v-model="passStatus">
            <option value="">전체</option>
            <option
              v-for="(label, value) in PREPAID_STATUS_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </div>
        <div class="filter-group">
          <label for="passFrom">시작일</label>
          <input id="passFrom" v-model="passFrom" type="date" />
        </div>
        <div class="filter-group">
          <label for="passTo">종료일</label>
          <input id="passTo" v-model="passTo" type="date" />
        </div>
      </div>

      <div class="filter-actions">
        <button
          type="button"
          class="preset-button"
          :disabled="isLoadingPasses"
          @click="loadPasses"
        >
          조회
        </button>
        <button type="button" class="preset-button" @click="resetPassFilters">
          전체 기간
        </button>
      </div>

      <p v-if="passError" class="error-box">{{ passError }}</p>

      <div v-if="isLoadingPasses" class="empty-box">
        <p>선불권을 불러오는 중이에요.</p>
      </div>
      <div v-else-if="passes.length === 0" class="empty-box">
        <p>선불권이 없어요.</p>
      </div>
      <div v-else class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>고객</th>
              <th>상품</th>
              <th>잔액</th>
              <th>사용 가능일</th>
              <th>유효기간</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pass in passes" :key="pass.id">
              <td>
                {{ pass.customerName || "고객" }}
                <span class="sub-text">{{ pass.customerPhoneText }}</span>
              </td>
              <td>
                {{ pass.planName }}
                <span class="sub-text"
                  >{{ formatWon(pass.faceValue) }} 충전</span
                >
              </td>
              <td>{{ formatWon(pass.balance) }}</td>
              <td>{{ pass.usableFromDate || "-" }}</td>
              <td>
                {{
                  pass.expiresAt ? formatPrepaidDate(pass.expiresAt) : "무제한"
                }}
              </td>
              <td>
                <span :class="statusClass(pass.status)">
                  {{ getPrepaidStatusLabel(pass.status) }}
                </span>
              </td>
              <td class="action-cell">
                <button
                  type="button"
                  class="preset-button"
                  @click="openLedger(pass)"
                >
                  원장
                </button>
                <button
                  type="button"
                  class="preset-button"
                  :disabled="!canManage || pass.status === 'VOID'"
                  @click="openAdjust(pass)"
                >
                  조정
                </button>
                <button
                  type="button"
                  class="danger-button"
                  :disabled="!canManage || pass.status === 'VOID'"
                  @click="submitVoid(pass)"
                >
                  취소
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form
        v-if="adjustTarget"
        class="plan-form"
        @submit.prevent="submitAdjust"
      >
        <h3>잔액 조정 · {{ adjustTarget.planName }}</h3>
        <p class="notice-text">
          현재 잔액 {{ formatWon(adjustTarget.balance) }} ·
          {{ adjustTarget.customerPhoneText }}
        </p>
        <div class="form-grid">
          <div class="filter-group">
            <label for="adjustAmount">조정 금액 (음수 가능)</label>
            <input
              id="adjustAmount"
              v-model.number="adjustForm.amount"
              type="number"
              step="1000"
              placeholder="예: 10000 / -5000"
            />
          </div>
          <div class="filter-group wide">
            <label for="adjustReason">사유</label>
            <input
              id="adjustReason"
              v-model.trim="adjustForm.reason"
              type="text"
              maxlength="200"
              placeholder="예: 서비스 보상"
            />
          </div>
        </div>
        <p v-if="adjustMessage" class="adjust-message">{{ adjustMessage }}</p>
        <div class="filter-actions">
          <button type="submit" class="preset-button" :disabled="isAdjusting">
            {{ isAdjusting ? "처리 중..." : "조정 적용" }}
          </button>
          <button type="button" class="preset-button" @click="closeAdjust">
            닫기
          </button>
        </div>
      </form>

      <div v-if="ledgerPass" class="ledger-block">
        <div class="panel-head">
          <h3>
            원장 · {{ ledgerPass.planName }}
            <span class="sub-text">{{ ledgerPass.customerPhoneText }}</span>
          </h3>
          <button type="button" class="preset-button" @click="closeLedger">
            닫기
          </button>
        </div>

        <p v-if="ledgerError" class="error-box">{{ ledgerError }}</p>

        <div v-if="ledgerTransactions.length === 0" class="empty-box">
          <p>원장 기록이 없어요.</p>
        </div>
        <div v-else class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>구분</th>
                <th>금액</th>
                <th>잔액</th>
                <th>사유</th>
                <th>처리자</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in ledgerTransactions" :key="entry.id">
                <td>{{ formatPrepaidDateTime(entry.occurredAt) }}</td>
                <td>{{ getPrepaidEntryLabel(entry.entryType) }}</td>
                <td :class="entry.amount >= 0 ? 'amount-plus' : 'amount-minus'">
                  {{ entry.amount >= 0 ? "+" : ""
                  }}{{ formatWon(entry.amount) }}
                </td>
                <td>{{ formatWon(entry.balanceAfter) }}</td>
                <td>{{ entry.reason || "-" }}</td>
                <td>{{ entry.employeeName || "-" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";

import { formatPhoneInput, normalizePhoneNumber } from "@/lib/points";
import {
  PREPAID_STATUS_LABELS,
  PREPAID_WEEKDAYS,
  adjustPrepaidPass,
  createPrepaidPlan,
  describePlanRule,
  fetchPrepaidPassLedger,
  fetchPrepaidPasses,
  fetchPrepaidPlans,
  fetchPrepaidSummary,
  formatPrepaidDate,
  formatPrepaidDateTime,
  formatWon,
  getPrepaidEntryLabel,
  getPrepaidStatusLabel,
  updatePrepaidPlan,
  voidPrepaidPass,
} from "@/lib/prepaid";
import { hasPermission } from "@/lib/staffAuth";

const canManage = computed(() => hasPermission("prepaid.manage"));

const activeTab = ref("plans");

const summary = ref({
  totals: {
    sold: 0,
    used: 0,
    expired: 0,
    adjusted: 0,
    restored: 0,
    issuedCount: 0,
    liability: 0,
    activeCount: 0,
  },
});

const plans = ref([]);
const isLoadingPlans = ref(false);
const planError = ref("");
const planFormOpen = ref(false);
const planFormMessage = ref("");
const isSavingPlan = ref(false);

function emptyPlanForm() {
  return {
    id: "",
    name: "",
    price: 0,
    faceValue: 0,
    validityMonths: 3,
    minPaymentAmount: 0,
    minUseAmount: 0,
    maxUsePercent: 100,
    usableDays: [],
    usableFromTime: "",
    usableToTime: "",
    usableFromNextVisit: true,
    allowMultiple: true,
    isActive: true,
    sortOrder: 0,
    memo: "",
  };
}

const planForm = ref(emptyPlanForm());

const passes = ref([]);
const passPhoneInput = ref("");
const passStatus = ref("");
const passFrom = ref("");
const passTo = ref("");
const isLoadingPasses = ref(false);
const passError = ref("");

const adjustTarget = ref(null);
const adjustForm = ref({ amount: null, reason: "" });
const adjustMessage = ref("");
const isAdjusting = ref(false);

const ledgerPass = ref(null);
const ledgerTransactions = ref([]);
const ledgerError = ref("");

function statusClass(status) {
  if (status === "ACTIVE") return "badge-on";
  if (status === "EXHAUSTED") return "badge-muted";

  return "badge-off";
}

function onPassPhoneInput(event) {
  const formatted = formatPhoneInput(event.target.value);

  passPhoneInput.value = formatted;

  if (event.target.value !== formatted) {
    event.target.value = formatted;
  }
}

async function loadSummary() {
  try {
    const result = await fetchPrepaidSummary();
    const totals = result?.totals || {};

    summary.value = {
      totals: {
        sold: Number(totals.sold || 0),
        used: Number(totals.used || 0),
        expired: Number(totals.expired || 0),
        adjusted: Number(totals.adjusted || 0),
        restored: Number(totals.restored || 0),
        issuedCount: Number(totals.issuedCount || 0),
        liability: Number(totals.liability || 0),
        activeCount: Number(totals.activeCount || 0),
      },
    };
  } catch (error) {
    console.error("선불권 요약 조회 실패:", error);
  }
}

async function loadPlans() {
  isLoadingPlans.value = true;
  planError.value = "";

  try {
    const result = await fetchPrepaidPlans({ includeInactive: true });

    plans.value = Array.isArray(result?.plans) ? result.plans : [];
  } catch (error) {
    console.error("선불권 상품 조회 실패:", error);
    planError.value = error?.message || "상품을 불러오지 못했어요.";
  } finally {
    isLoadingPlans.value = false;
  }
}

function startCreatePlan() {
  planForm.value = emptyPlanForm();
  planFormMessage.value = "";
  planFormOpen.value = true;
}

function startEditPlan(plan) {
  planForm.value = {
    id: plan.id,
    name: plan.name,
    price: plan.price,
    faceValue: plan.faceValue,
    validityMonths: plan.validityMonths,
    minPaymentAmount: plan.minPaymentAmount,
    minUseAmount: plan.minUseAmount,
    maxUsePercent: plan.maxUsePercent,
    usableDays: [...(plan.usableDays || [])],
    usableFromTime: plan.usableFromTime || "",
    usableToTime: plan.usableToTime || "",
    usableFromNextVisit: plan.usableFromNextVisit,
    allowMultiple: plan.allowMultiple,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    memo: plan.memo,
  };
  planFormMessage.value = "";
  planFormOpen.value = true;
}

function closePlanForm() {
  planFormOpen.value = false;
  planFormMessage.value = "";
  planForm.value = emptyPlanForm();
}

function togglePlanDay(day) {
  const days = new Set(planForm.value.usableDays);

  if (days.has(day)) {
    days.delete(day);
  } else {
    days.add(day);
  }

  planForm.value.usableDays = [...days].sort((a, b) => a - b);
}

async function submitPlan() {
  if (isSavingPlan.value) return;

  const payload = {
    name: planForm.value.name,
    price: Number(planForm.value.price || 0),
    faceValue: Number(planForm.value.faceValue || 0),
    validityMonths: Number(planForm.value.validityMonths || 0),
    minPaymentAmount: Number(planForm.value.minPaymentAmount || 0),
    minUseAmount: Number(planForm.value.minUseAmount || 0),
    maxUsePercent: Number(planForm.value.maxUsePercent || 100),
    usableDays: planForm.value.usableDays,
    usableFromTime: planForm.value.usableFromTime || "",
    usableToTime: planForm.value.usableToTime || "",
    usableFromNextVisit: planForm.value.usableFromNextVisit === true,
    allowMultiple: planForm.value.allowMultiple === true,
    isActive: planForm.value.isActive === true,
    sortOrder: Number(planForm.value.sortOrder || 0),
    memo: planForm.value.memo,
  };

  if (!payload.name) {
    planFormMessage.value = "상품 이름을 입력해 주세요.";
    return;
  }

  if (payload.faceValue <= 0) {
    planFormMessage.value = "충전 금액을 1원 이상 입력해 주세요.";
    return;
  }

  isSavingPlan.value = true;
  planFormMessage.value = "";

  try {
    if (planForm.value.id) {
      await updatePrepaidPlan(planForm.value.id, payload);
    } else {
      await createPrepaidPlan(payload);
    }

    planFormMessage.value = "저장했어요.";
    planFormOpen.value = false;
    planForm.value = emptyPlanForm();
    await loadPlans();
  } catch (error) {
    console.error("선불권 상품 저장 실패:", error);
    planFormMessage.value = error?.message || "상품을 저장하지 못했어요.";
  } finally {
    isSavingPlan.value = false;
  }
}

async function loadPasses() {
  isLoadingPasses.value = true;
  passError.value = "";

  try {
    const result = await fetchPrepaidPasses({
      phone: passPhoneInput.value
        ? normalizePhoneNumber(passPhoneInput.value)
        : "",
      status: passStatus.value,
      from: passFrom.value,
      to: passTo.value,
    });

    passes.value = Array.isArray(result?.passes) ? result.passes : [];
  } catch (error) {
    console.error("선불권 목록 조회 실패:", error);
    passError.value = error?.message || "선불권을 불러오지 못했어요.";
  } finally {
    isLoadingPasses.value = false;
  }
}

function resetPassFilters() {
  passPhoneInput.value = "";
  passStatus.value = "";
  passFrom.value = "";
  passTo.value = "";

  loadPasses();
}

function switchToPasses() {
  activeTab.value = "passes";

  if (passes.value.length === 0) {
    loadPasses();
  }
}

function openAdjust(pass) {
  adjustTarget.value = pass;
  adjustForm.value = { amount: null, reason: "" };
  adjustMessage.value = "";
}

function closeAdjust() {
  adjustTarget.value = null;
  adjustForm.value = { amount: null, reason: "" };
  adjustMessage.value = "";
}

async function submitAdjust() {
  if (isAdjusting.value || !adjustTarget.value) return;

  const amount = Number(adjustForm.value.amount || 0);

  if (!Number.isInteger(amount) || amount === 0) {
    adjustMessage.value = "조정 금액을 0이 아닌 정수로 입력해 주세요.";
    return;
  }

  if (!adjustForm.value.reason.trim()) {
    adjustMessage.value = "조정 사유를 입력해 주세요.";
    return;
  }

  isAdjusting.value = true;
  adjustMessage.value = "";

  try {
    const result = await adjustPrepaidPass({
      passId: adjustTarget.value.id,
      amount,
      reason: adjustForm.value.reason.trim(),
    });

    adjustMessage.value = `조정 완료 · 잔액 ${formatWon(result?.balance)}`;
    await Promise.all([loadPasses(), loadSummary()]);
  } catch (error) {
    console.error("선불권 조정 실패:", error);
    adjustMessage.value = error?.message || "선불권을 조정하지 못했어요.";
  } finally {
    isAdjusting.value = false;
  }
}

async function submitVoid(pass) {
  const reason = window.prompt(
    `${
      pass.customerPhoneText || "고객"
    } 선불권을 취소할까요?\n사유를 입력해 주세요.`,
    "관리자 취소"
  );

  if (reason === null) return;

  try {
    await voidPrepaidPass({ passId: pass.id, reason });
    await Promise.all([loadPasses(), loadSummary()]);
  } catch (error) {
    console.error("선불권 취소 실패:", error);
    alert(error?.message || "선불권을 취소하지 못했어요.");
  }
}

async function openLedger(pass) {
  ledgerPass.value = pass;
  ledgerTransactions.value = [];
  ledgerError.value = "";

  try {
    const result = await fetchPrepaidPassLedger(pass.id);

    ledgerTransactions.value = Array.isArray(result?.transactions)
      ? result.transactions
      : [];

    if (result?.pass) {
      ledgerPass.value = result.pass;
    }
  } catch (error) {
    console.error("선불권 원장 조회 실패:", error);
    ledgerError.value = error?.message || "원장을 불러오지 못했어요.";
  }
}

function closeLedger() {
  ledgerPass.value = null;
  ledgerTransactions.value = [];
  ledgerError.value = "";
}

onMounted(() => {
  loadSummary();
  loadPlans();
});
</script>

<style scoped lang="scss">
.admin-prepaid-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}
.page-header .eyebrow {
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
  color: #ffffff;
}
.description {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}
.summary-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.66);
}
.summary-card strong {
  font-size: 20px;
  font-weight: 800;
  color: #ffffff;
}
.tab-row {
  display: flex;
  gap: 8px;
}
.tab-button {
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.tab-button.active {
  background: rgba(99, 102, 241, 0.24);
  color: #c7d2fe;
}
.panel {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.panel-head h2,
.panel-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #ffffff;
}
.panel-actions {
  display: flex;
  gap: 8px;
}
.filter-grid,
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filter-group.wide {
  grid-column: span 2;
}
.filter-group label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}
.filter-group input,
.filter-group select {
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}
.filter-group ::placeholder {
  color: rgba(255, 255, 255, 0.4);
}
.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset-button,
.danger-button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.danger-button {
  background: rgba(248, 113, 113, 0.18);
  color: #fca5a5;
}
.preset-button:disabled,
.danger-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.weekday-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.weekday-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 13px;
  cursor: pointer;

  &.active {
    background: rgba(99, 102, 241, 0.3);
    color: #e0e7ff;
  }
}
.weekday-chip input {
  display: none;
}
.check-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.check-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}
.table-wrap {
  overflow-x: auto;
}
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.admin-table th,
.admin-table td {
  padding: 10px 12px;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.admin-table th {
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.05);
}
.rule-cell {
  max-width: 320px;
  white-space: normal;
  color: rgba(255, 255, 255, 0.66);
}
.sub-text {
  margin-left: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
}
.bonus-text {
  margin-left: 6px;
  font-size: 12px;
  color: #6ee7b7;
}
.action-cell {
  display: flex;
  gap: 6px;
}
.badge-on,
.badge-off,
.badge-muted {
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
}
.badge-on {
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
}
.badge-off {
  background: rgba(248, 113, 113, 0.18);
  color: #fca5a5;
}
.badge-muted {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.66);
}
.plan-form {
  margin-top: 6px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.plan-form h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
}
.notice-text {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.66);
}
.adjust-message {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #c7d2fe;
}
.error-box {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
  font-size: 13px;
  font-weight: 700;
}
.empty-box {
  padding: 28px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  text-align: center;
  color: rgba(255, 255, 255, 0.66);
  font-size: 14px;
}
.ledger-block {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px dashed rgba(255, 255, 255, 0.16);
}
.amount-plus {
  color: #6ee7b7;
  font-weight: 800;
}
.amount-minus {
  color: #fca5a5;
  font-weight: 800;
}
</style>
