<template>
  <div class="arc-otc-ledger">
    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">사용액</span>
        <strong>{{ money(summary.usedAmount) }}</strong>
        <span class="summary-sub">
          {{ summary.usageCount ?? 0 }}건 · {{ summary.usedQty ?? 0 }}개
        </span>
      </article>
      <article class="summary-card">
        <span class="summary-label">지급받은 금액</span>
        <strong>{{ money(summary.paidAmount) }}</strong>
        <span class="summary-sub">사장이 지급 완료한 금액</span>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary.unsettledAmount ?? 0) > 0 }"
      >
        <span class="summary-label">아직 정산 전</span>
        <strong>{{ money(summary.unsettledAmount) }}</strong>
        <span class="summary-sub">정산 요청에 아직 안 묶인 금액</span>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary.outstanding ?? 0) > 0 }"
      >
        <span class="summary-label">미지급 차액</span>
        <strong>{{ money(summary.outstanding) }}</strong>
        <span class="summary-sub">사용액 − 지급액</span>
      </article>
    </section>

    <p v-if="guide.length" class="guide-box">
      <strong>기록 원칙</strong>
      <span v-for="line in guide" :key="line" class="guide-line">{{
        line
      }}</span>
    </p>

    <!-- 사용 기록 -->
    <section class="panel">
      <div class="panel-head">
        <h2>사용대장 쓰기 (육하원칙)</h2>
        <div class="panel-actions">
          <button
            type="button"
            class="mini-button"
            :disabled="isLoading"
            @click="reload"
          >
            새로고침
          </button>
        </div>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>무엇을 (상비약)</span>
          <select v-model="usageForm.otcItemId">
            <option value="">선택해 주세요</option>
            <option v-for="item in itemOptions" :key="item.id" :value="item.id">
              {{ item.name }} ({{ item.qty }}{{ item.unit }} 남음)
            </option>
          </select>
        </label>
        <label class="field">
          <span>얼마나 (수량)</span>
          <input
            v-model.number="usageForm.qty"
            type="number"
            min="0.5"
            step="0.5"
          />
        </label>
        <label class="field">
          <span>언제 (날짜)</span>
          <input v-model="usageForm.usedOn" type="date" />
        </label>
        <label class="field">
          <span>몇 시쯤</span>
          <input v-model.trim="usageForm.usedTime" type="time" />
        </label>
        <label class="field">
          <span>어디서</span>
          <input
            v-model.trim="usageForm.place"
            type="text"
            maxlength="120"
            placeholder="예: 1층 바 카운터"
          />
        </label>
        <label class="field">
          <span>누가 (대상)</span>
          <select v-model="usageForm.targetKind">
            <option
              v-for="item in targetKinds"
              :key="item.key"
              :value="item.key"
            >
              {{ item.label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>대상 이름 (선택)</span>
          <input
            v-model.trim="usageForm.targetName"
            type="text"
            maxlength="60"
            placeholder="비우면 본인 이름으로 남습니다"
          />
        </label>
      </div>

      <label class="field">
        <span>왜 (증상·상황 — 필수)</span>
        <textarea
          v-model.trim="usageForm.reason"
          rows="2"
          maxlength="600"
          placeholder="예: 오후 9시경 손님이 넘어져 무릎이 긁혀 소독 후 밴드를 붙였습니다."
        ></textarea>
      </label>
      <label class="field">
        <span>증상 메모 (선택)</span>
        <textarea
          v-model.trim="usageForm.symptom"
          rows="2"
          maxlength="400"
          placeholder="예: 찰과상, 출혈 소량, 알레르기 없음"
        ></textarea>
      </label>
      <div class="field-grid">
        <label class="field">
          <span>연결 사건번호 (선택)</span>
          <input
            v-model.trim="usageForm.careIncidentNo"
            type="text"
            maxlength="40"
            placeholder="예: AS-CARE-2026-031"
          />
        </label>
        <label class="field">
          <span>기타 메모</span>
          <input
            v-model.trim="usageForm.note"
            type="text"
            maxlength="1000"
            placeholder="추가로 남길 말"
          />
        </label>
      </div>

      <div class="form-actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitUsage"
        >
          {{ isSaving ? "저장 중…" : "사용대장에 기록" }}
        </button>
        <span class="helper-text">
          금액은 서버가 그날의 단가로 계산해 바로 반영합니다.
        </span>
      </div>
    </section>

    <!-- 단가 -->
    <section class="panel">
      <div class="panel-head">
        <h2>단가 등록 (ARC 대표 전용)</h2>
        <span class="panel-note"
          >단가가 없으면 사용 금액은 0원으로 계산돼요</span
        >
      </div>

      <p v-if="!canPrice" class="helper-text restricted">
        단가는 ARC 대표(최윤희)만 등록할 수 있어요. 아래 표에서 현재 단가를
        확인해 주세요.
      </p>

      <div v-else class="field-grid">
        <label class="field">
          <span>상비약</span>
          <select v-model="priceForm.otcItemId">
            <option value="">선택해 주세요</option>
            <option v-for="item in itemOptions" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>1개 단가 (원)</span>
          <input
            v-model.number="priceForm.unitPrice"
            type="number"
            min="0"
            step="100"
          />
        </label>
        <label class="field">
          <span>적용 시작일</span>
          <input v-model="priceForm.effectiveFrom" type="date" />
        </label>
        <label class="field">
          <span>메모</span>
          <input
            v-model.trim="priceForm.note"
            type="text"
            maxlength="400"
            placeholder="예: 2026년 3월 약국 구매가"
          />
        </label>
      </div>

      <div v-if="canPrice" class="form-actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitPrice"
        >
          단가 등록
        </button>
        <span class="helper-text">
          적용 시작일 이후 사용 기록에만 쓰입니다(과거 기록은 그대로).
        </span>
      </div>

      <div v-if="prices.length" class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>품목</th>
              <th class="num">단가</th>
              <th>적용 시작일</th>
              <th>등록자</th>
              <th>메모</th>
              <th v-if="canPrice">작업</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in prices" :key="row.id">
              <td>{{ row.itemName }}</td>
              <td class="num">{{ money(row.unitPrice) }}</td>
              <td class="mono">{{ row.effectiveFrom }}</td>
              <td class="dim">{{ row.employeeName || "-" }}</td>
              <td class="dim">{{ row.note || "-" }}</td>
              <td v-if="canPrice">
                <button
                  type="button"
                  class="mini-button danger"
                  @click="removePrice(row)"
                >
                  삭제
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 사용 기록 목록 -->
    <section class="panel">
      <div class="panel-head">
        <h2>사용 기록</h2>
        <div class="panel-actions">
          <select v-model="usageFilter" class="inline-input">
            <option value="">이 달 전체</option>
            <option value="ACTIVE">정상 기록</option>
            <option value="VOID">취소 기록</option>
          </select>
        </div>
      </div>

      <p v-if="filteredUsages.length === 0" class="empty-box">
        이 기간에 사용 기록이 없어요.
      </p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>사용일</th>
              <th>품목</th>
              <th class="num">수량</th>
              <th class="num">금액</th>
              <th>대상</th>
              <th>사유</th>
              <th>장소</th>
              <th>기록자</th>
              <th>상태</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredUsages" :key="row.id">
              <td class="mono">{{ row.usageNo }}</td>
              <td>
                {{ formatArcDate(row.usedOn) }}
                <div v-if="row.usedTime" class="dim">{{ row.usedTime }}</div>
              </td>
              <td>{{ row.itemName }}</td>
              <td class="num">{{ row.qty }}{{ row.itemUnit }}</td>
              <td class="num">{{ money(row.amount) }}</td>
              <td>
                {{ row.targetName || "-" }}
                <div class="dim">{{ targetLabel(row.targetKind) }}</div>
              </td>
              <td class="reason-cell">{{ row.reason }}</td>
              <td class="dim">{{ row.place || "-" }}</td>
              <td class="dim">{{ row.employeeName || "-" }}</td>
              <td>
                <span :class="{ critical: row.status === 'VOID' }">
                  {{
                    row.status === "VOID"
                      ? "취소"
                      : row.settlementId
                      ? "정산 포함"
                      : "정산 전"
                  }}
                </span>
              </td>
              <td>
                <button
                  v-if="row.status === 'ACTIVE' && !row.settlementId"
                  type="button"
                  class="mini-button danger"
                  @click="voidUsage(row)"
                >
                  취소
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 정산 -->
    <section class="panel">
      <div class="panel-head">
        <h2>정산 (사용액 → 사장 지급)</h2>
        <div class="panel-actions">
          <span class="panel-note">{{ period }} 기준</span>
        </div>
      </div>

      <div v-if="canSettle" class="settle-request">
        <label class="field">
          <span>요청 메모 (선택)</span>
          <input
            v-model.trim="settleNote"
            type="text"
            maxlength="1000"
            placeholder="예: 3월 직원 상비약 사용분 정산 요청드립니다."
          />
        </label>
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitSettlement"
        >
          {{ period }} 정산 요청
        </button>
        <span class="helper-text">
          아직 정산에 묶이지 않은 기록만 한 번에 묶입니다(중복 지급 방지).
        </span>
      </div>
      <p v-else class="helper-text restricted">
        정산 요청은 ARC 대표(최윤희)만 만들 수 있어요. 사장은 아래 목록에서 지급
        확인만 하면 됩니다.
      </p>

      <p v-if="settlements.length === 0" class="empty-box">
        이 기간 정산 기록이 없어요.
      </p>

      <div v-else class="settle-list">
        <article v-for="row in settlements" :key="row.id" class="settle-card">
          <header>
            <strong>{{ row.settlementNo }}</strong>
            <span :class="['settle-chip', row.status.toLowerCase()]">
              {{ settlementLabel(row.status) }}
            </span>
            <span class="settle-amount">{{ money(row.totalAmount) }}</span>
            <span class="dim">
              {{ row.usageCount }}건 · 요청 {{ row.requestedOn }}
            </span>
          </header>
          <p v-if="row.requestNote" class="settle-note dim">
            {{ row.requestNote }}
          </p>
          <p v-if="row.status === 'PAID'" class="settle-paid">
            지급 완료: {{ money(row.paidAmount) }} ·
            {{ formatArcDate(row.paidOn) }} ·
            {{ payMethodLabel(row.paidMethod) }} · {{ row.paidBy }}
          </p>

          <details v-if="row.detail?.length" class="settle-detail">
            <summary>내역 {{ row.detail.length }}건 보기</summary>
            <ul>
              <li v-for="line in row.detail" :key="line.usageNo">
                {{ formatArcDate(line.usedOn) }} · {{ line.itemName }}
                {{ line.qty }}개 · {{ money(line.amount) }} ·
                {{ line.targetName }} · {{ line.employeeName }}
              </li>
            </ul>
          </details>

          <div v-if="row.status === 'REQUESTED'" class="settle-actions">
            <template v-if="canPay">
              <label class="field inline">
                <span>지급일</span>
                <input v-model="payForm.paidOn" type="date" />
              </label>
              <label class="field inline">
                <span>지급 금액</span>
                <input
                  v-model.number="payForm.paidAmount"
                  type="number"
                  min="0"
                  step="100"
                  :placeholder="String(row.totalAmount)"
                />
              </label>
              <label class="field inline">
                <span>방법</span>
                <select v-model="payForm.paidMethod">
                  <option
                    v-for="item in payMethods"
                    :key="item.key"
                    :value="item.key"
                  >
                    {{ item.label }}
                  </option>
                </select>
              </label>
              <label class="field inline">
                <span>메모</span>
                <input
                  v-model.trim="payForm.paidNote"
                  type="text"
                  maxlength="1000"
                  placeholder="예: 3/31 계좌이체"
                />
              </label>
              <button
                type="button"
                class="primary-button small"
                :disabled="isSaving"
                @click="paySettlement(row)"
              >
                지급 완료 처리
              </button>
            </template>
            <button
              v-if="canSettle"
              type="button"
              class="mini-button danger"
              :disabled="isSaving"
              @click="cancelSettlement(row)"
            >
              요청 취소
            </button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";

import {
  cancelArcOtcSettlement,
  createArcOtcUsage,
  deleteArcOtcPrice,
  fetchArcOtcLedger,
  formatArcDate,
  payArcOtcSettlement,
  requestArcOtcSettlement,
  saveArcOtcPrice,
  voidArcOtcUsage,
} from "@/lib/arc";

const props = defineProps({
  period: { type: String, default: "" },
});

const usages = ref([]);
const prices = ref([]);
const settlements = ref([]);
const items = ref([]);
const summary = ref({});
const catalog = ref({ targetKinds: [], payMethods: [], guide: [] });
const canPrice = ref(false);
const canSettle = ref(false);
const canPay = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");
const usageFilter = ref("");
const settleNote = ref("");

const usageForm = reactive({
  otcItemId: "",
  qty: 1,
  usedOn: todayIso(),
  usedTime: "",
  place: "",
  targetKind: "SELF",
  targetName: "",
  reason: "",
  symptom: "",
  careIncidentNo: "",
  note: "",
});

const priceForm = reactive({
  otcItemId: "",
  unitPrice: 0,
  effectiveFrom: todayIso(),
  note: "",
});

const payForm = reactive({
  paidOn: todayIso(),
  paidAmount: null,
  paidMethod: "TRANSFER",
  paidNote: "",
});

const targetKinds = computed(
  () =>
    catalog.value.targetKinds ?? [
      { key: "SELF", label: "본인" },
      { key: "STAFF", label: "다른 직원" },
      { key: "OWNER", label: "사장" },
      { key: "ETC", label: "기타" },
    ]
);

const payMethods = computed(
  () =>
    catalog.value.payMethods ?? [
      { key: "TRANSFER", label: "계좌이체" },
      { key: "CASH", label: "현금" },
      { key: "CARD", label: "카드" },
      { key: "ETC", label: "기타" },
    ]
);

const guide = computed(() => catalog.value.guide ?? []);

const itemOptions = computed(() => items.value ?? []);

const filteredUsages = computed(() => {
  if (!usageFilter.value) return usages.value;
  return usages.value.filter((row) => row.status === usageFilter.value);
});

function todayIso() {
  const now = new Date();
  const offset = -now.getTimezoneOffset();
  return new Date(now.getTime() + offset * 60_000).toISOString().slice(0, 10);
}

function money(value) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

function targetLabel(key) {
  return targetKinds.value.find((item) => item.key === key)?.label ?? key;
}

function payMethodLabel(key) {
  return payMethods.value.find((item) => item.key === key)?.label ?? key;
}

function settlementLabel(status) {
  if (status === "PAID") return "지급 완료";
  if (status === "CANCELED") return "요청 취소";
  return "지급 요청";
}

function flash(message) {
  okMessage.value = message;
  window.setTimeout(() => {
    if (okMessage.value === message) okMessage.value = "";
  }, 3200);
}

async function reload() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchArcOtcLedger({ period: props.period });

    usages.value = data?.usages ?? [];
    prices.value = data?.prices?.prices ?? data?.prices ?? [];
    settlements.value = data?.settlements ?? [];
    items.value = data?.items ?? [];
    summary.value = data?.summary ?? {};
    if (data?.catalog) catalog.value = data.catalog;
    canPrice.value = Boolean(data?.canPrice);
    canSettle.value = Boolean(data?.canSettle);
    canPay.value = Boolean(data?.canPay);
  } catch (error) {
    errorMessage.value = error?.message ?? "사용대장을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function submitUsage() {
  errorMessage.value = "";

  if (!usageForm.otcItemId) {
    errorMessage.value = "어떤 상비약을 썼는지 선택해 주세요.";
    return;
  }

  if (!usageForm.reason) {
    errorMessage.value = "왜 사용했는지(증상·상황)를 적어 주세요.";
    return;
  }

  isSaving.value = true;

  try {
    const data = await createArcOtcUsage({ ...usageForm });
    const usage = data?.usage ?? data;

    flash(
      `${usage.itemName ?? "상비약"} ${
        usage.qty ?? usageForm.qty
      }개 기록 완료 · ${money(usage.amount)}`
    );

    usageForm.reason = "";
    usageForm.symptom = "";
    usageForm.note = "";
    usageForm.careIncidentNo = "";
    usageForm.qty = 1;
    await reload();
  } catch (error) {
    errorMessage.value = error?.message ?? "사용 기록을 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function voidUsage(row) {
  const reason = window.prompt(
    "취소 사유를 적어 주세요. (예: 수량을 잘못 적었습니다)"
  );

  if (reason === null) return;
  if (reason.trim().length < 3) {
    errorMessage.value = "취소 사유를 3자 이상 적어 주세요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await voidArcOtcUsage(row.id, { reason: reason.trim() });
    flash("사용 기록을 취소했어요. 재고가 되돌아갑니다.");
    await reload();
  } catch (error) {
    errorMessage.value = error?.message ?? "기록을 취소하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function submitPrice() {
  errorMessage.value = "";

  if (!priceForm.otcItemId) {
    errorMessage.value = "단가를 등록할 상비약을 선택해 주세요.";
    return;
  }

  isSaving.value = true;

  try {
    await saveArcOtcPrice({ ...priceForm });
    flash("단가를 등록했어요. 이제 사용 기록에 금액이 자동 계산됩니다.");
    priceForm.unitPrice = 0;
    priceForm.note = "";
    await reload();
  } catch (error) {
    errorMessage.value = error?.message ?? "단가를 등록하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function removePrice(row) {
  if (
    !window.confirm(`${row.itemName} ${money(row.unitPrice)} 단가를 지울까요?`)
  ) {
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await deleteArcOtcPrice(row.id);
    flash("단가 기록을 지웠어요.");
    await reload();
  } catch (error) {
    errorMessage.value = error?.message ?? "단가를 지우지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function submitSettlement() {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    const data = await requestArcOtcSettlement({
      period: props.period,
      note: settleNote.value,
    });
    const settlement = data?.settlement ?? data;

    settleNote.value = "";
    flash(
      `정산 요청을 만들었어요 · ${money(settlement.totalAmount)} (${
        settlement.usageCount
      }건)`
    );
    await reload();
  } catch (error) {
    errorMessage.value = error?.message ?? "정산 요청을 만들지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function paySettlement(row) {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    await payArcOtcSettlement(row.id, {
      paidOn: payForm.paidOn,
      paidAmount: payForm.paidAmount ?? row.totalAmount,
      paidMethod: payForm.paidMethod,
      paidNote: payForm.paidNote,
    });
    flash("지급 완료로 처리했어요.");
    payForm.paidAmount = null;
    payForm.paidNote = "";
    await reload();
  } catch (error) {
    errorMessage.value = error?.message ?? "지급 처리를 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function cancelSettlement(row) {
  if (!window.confirm(`${row.settlementNo} 정산 요청을 취소할까요?`)) return;

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await cancelArcOtcSettlement(row.id, { note: "요청 취소" });
    flash("정산 요청을 취소했어요. 사용 기록은 다시 정산 전으로 돌아갑니다.");
    await reload();
  } catch (error) {
    errorMessage.value = error?.message ?? "정산 요청을 취소하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

watch(() => props.period, reload);

onMounted(reload);
</script>

<style lang="scss" scoped>
@use "../../scss/_arc-ui" as *;
.arc-otc-ledger {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: rgba(255, 255, 255, 0.86);
}

.summary-card {
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.summary-card.alert {
  border-color: rgba(251, 191, 36, 0.36);
}

.summary-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.guide-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid rgba(96, 165, 250, 0.36);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 12px;
  color: #93c5fd;
}

.guide-line {
  line-height: 1.6;
}

.panel {
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.panel-note {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.64);
}

.field {
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.86);
}

.field.inline {
  margin-bottom: 0;
  min-width: 130px;
}

.field input,
.field select,
.field textarea {
  font-weight: 400;
}

.form-actions {
  margin: 8px 0 14px;
}

.primary-button.small {
  padding: 8px 14px;
  font-size: 12px;
}

.primary-button:disabled {
  background: rgba(255, 255, 255, 0.16);
}

.mini-button.danger {
  border-color: rgba(248, 113, 113, 0.36);
  color: #fca5a5;
  background: rgba(248, 113, 113, 0.14);
}

.helper-text.restricted {
  padding: 12px 14px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.table-wrap {
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.data-table {
  min-width: 720px;

  color: rgba(255, 255, 255, 0.86);
}

.data-table th,
.data-table td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.data-table .num {
  white-space: nowrap;
}

.mono {
  color: rgba(255, 255, 255, 0.74);
  white-space: nowrap;
}

.critical {
  color: #fca5a5;
  font-weight: 700;
}

.reason-cell {
  max-width: 260px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.86);
}

.empty-box {
  border: 1px dashed rgba(255, 255, 255, 0.16);
}

.settle-request {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 14px;
}

.settle-request .field {
  flex: 1 1 260px;
  margin-bottom: 0;
}

.settle-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settle-card {
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
}

.settle-card header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: #ffffff;
}

.settle-amount {
  font-size: 14px;
  font-weight: 800;
  color: #ffffff;
}

.settle-chip {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}

.settle-chip.requested {
  background: rgba(251, 191, 36, 0.14);
  color: #fcd34d;
}

.settle-chip.paid {
  background: rgba(52, 211, 153, 0.14);
  color: #6ee7b7;
}

.settle-chip.canceled {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.64);
}

.settle-note {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.64);
}

.settle-paid {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: #6ee7b7;
}

.settle-detail {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.74);
}

.settle-detail ul {
  margin: 6px 0 0;
  padding-left: 18px;
  line-height: 1.7;
}

.settle-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.12);
}
</style>
