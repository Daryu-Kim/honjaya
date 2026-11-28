<template>
  <div class="admin-arc-usage-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>사용대장 · 소모금액</h1>
        <p class="description">
          육하원칙으로 남기면 재고 차감과 소모금액이 자동으로 계산돼요.
        </p>
      </div>
      <div class="header-actions">
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
        <router-link to="/admin/arc/stock" class="link-button">
          재고
        </router-link>
        <router-link
          v-if="canExpense"
          to="/admin/arc/expenses"
          class="link-button"
        >
          비용·정산
        </router-link>
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">이번 달 소모금액</span>
        <strong>{{ formatArcMoney(summary?.monthAmount) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">이번 달 사용 건</span>
        <strong>{{ summary?.monthCount ?? 0 }}건</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary?.unbilledAmount ?? 0) > 0 }"
      >
        <span class="summary-label">아직 청구 전인 금액</span>
        <strong>{{ formatArcMoney(summary?.unbilledAmount) }}</strong>
        <small class="dim">{{ summary?.unbilledCount ?? 0 }}건</small>
      </article>
    </section>

    <section v-if="canManagePrices" class="panel price-panel">
      <div class="panel-head">
        <h2>기준단가 미리 등록 (ARC 총괄)</h2>
        <span class="dim">등록한 단가로 소모금액이 바로 계산돼요.</span>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>품목</span>
          <select v-model="priceForm.itemId">
            <option value="">품목 선택</option>
            <option v-for="item in itemOptions" :key="item.id" :value="item.id">
              {{ item.code }} · {{ item.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>단가(원)</span>
          <input
            v-model.number="priceForm.unitPrice"
            type="number"
            min="0"
            step="10"
          />
        </label>

        <label class="field">
          <span>적용 시작일</span>
          <input v-model="priceForm.effectiveFrom" type="date" />
        </label>

        <label class="field wide">
          <span>메모(선택)</span>
          <input
            v-model.trim="priceForm.note"
            type="text"
            placeholder="예: 2026년 약국 구매가 기준"
          />
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="preset-button"
          :disabled="isSavingPrice"
          @click="submitUnitPrice"
        >
          단가 등록
        </button>
        <span class="dim">등록 {{ priceList.length }}건</span>
      </div>

      <p v-if="!priceList.length" class="empty-box">
        아직 등록한 기준단가가 없어요. 등록 전에는 최근 구매 단가로 계산돼요.
      </p>
      <div v-else class="price-list">
        <div v-for="price in priceList" :key="price.id" class="price-row">
          <span class="mono">{{ price.itemCode }}</span>
          <span>{{ price.itemName }}</span>
          <strong>{{ formatArcMoney(price.unitPrice) }}</strong>
          <span class="dim">{{ price.effectiveFrom }}부터</span>
          <span class="dim">{{ price.note || "-" }}</span>
          <button
            type="button"
            class="text-button"
            :disabled="isSavingPrice"
            @click="removeUnitPrice(price)"
          >
            삭제
          </button>
        </div>
      </div>
    </section>

    <section v-if="canCreate" class="panel">
      <h2>사용 기록 추가 (육하원칙)</h2>
      <p class="dim section-hint">
        ①~⑥ 중 왜(사유)만 필수예요. 나머지는 비워 두어도 저장돼요.
      </p>
      <p class="dim section-hint">
        상세 건강정보는 사건 접수·응급기록(AS-CARE)에만 적어 주세요.
      </p>

      <div class="field-grid">
        <label class="field">
          <span>① 언제 썼나요</span>
          <input v-model="form.usedAt" type="datetime-local" />
        </label>

        <label class="field">
          <span>② 누가 썼나요 · 대상 구분</span>
          <select v-model="form.targetKind">
            <option
              v-for="(label, value) in ARC_USAGE_TARGET_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>② 대상 이름·좌석(선택)</span>
          <input
            v-model.trim="form.targetName"
            type="text"
            placeholder="예: 3번 테이블 손님 / 박직원"
          />
        </label>

        <label class="field">
          <span>③ 어디서 썼나요</span>
          <input
            v-model.trim="form.place"
            type="text"
            placeholder="예: 홀 카운터"
          />
        </label>

        <label class="field wide">
          <span>⑤ 어떻게 썼나요(조치 내용)</span>
          <input
            v-model.trim="form.howUsed"
            type="text"
            placeholder="예: 생리식염수로 세척 후 거즈·반창고로 덮음"
          />
        </label>

        <label class="field wide">
          <span>⑥ 왜 썼나요 (필수)</span>
          <input
            v-model.trim="form.purpose"
            type="text"
            placeholder="예: 손님 손가락 열상 소독·지혈"
          />
        </label>

        <label class="field">
          <span>확인자(같이 본 사람)</span>
          <input
            v-model.trim="form.witnessName"
            type="text"
            placeholder="예: 박직원"
          />
        </label>

        <label class="field">
          <span>연결 사건번호(선택)</span>
          <input
            v-model.trim="form.incidentNo"
            type="text"
            placeholder="예: INC-20261127-01"
          />
        </label>

        <label class="field wide">
          <span>⑦ 기타 메모(선택)</span>
          <input
            v-model.trim="form.note"
            type="text"
            placeholder="예: 남은 수량이 2개뿐이라 보충 요청함"
          />
        </label>
      </div>

      <div class="usage-lines">
        <p class="dim section-hint">④ 무엇을 얼마나 썼나요</p>
        <div
          v-for="(line, index) in form.items"
          :key="index"
          class="usage-line"
        >
          <label class="field">
            <span>품목 {{ index + 1 }}</span>
            <select v-model="line.itemId" @change="syncUnitPrice(line)">
              <option value="">품목 선택</option>
              <option
                v-for="item in itemOptions"
                :key="item.id"
                :value="item.id"
              >
                {{ item.code }} · {{ item.name }} (재고 {{ item.qty
                }}{{ item.unit }})
              </option>
            </select>
          </label>

          <label class="field">
            <span>수량</span>
            <input
              v-model.number="line.qty"
              type="number"
              min="0"
              step="0.01"
            />
          </label>

          <label class="field">
            <span>단가(원)</span>
            <input
              v-model.number="line.unitPrice"
              type="number"
              min="0"
              step="10"
              :disabled="line.isDevice"
            />
            <small v-if="line.isDevice">내구재는 금액 0원</small>
            <small v-else-if="priceMap[line.itemId]">
              최근 구매 단가 {{ formatArcMoney(priceMap[line.itemId]) }}
            </small>
          </label>

          <div class="line-amount">
            <span>금액</span>
            <strong>{{ formatArcMoney(lineAmount(line)) }}</strong>
          </div>

          <button
            type="button"
            class="text-button"
            :disabled="form.items.length === 1"
            @click="removeLine(index)"
          >
            삭제
          </button>
        </div>

        <div class="actions">
          <button type="button" class="preset-button" @click="addLine">
            + 품목 추가
          </button>
          <span class="dim">합계 {{ formatArcMoney(formTotal) }}</span>
        </div>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitUsage"
        >
          사용 기록 저장 ({{ formatArcMoney(formTotal) }})
        </button>
        <span class="dim">저장하면 재고가 차감되고 금액이 확정돼요.</span>
      </div>
    </section>

    <section v-if="canExpense" class="panel settle-panel">
      <div class="panel-head">
        <h2>합본 · 비용·실비정산으로 넘기기</h2>
        <span class="dim">
          {{ periodLabel }}에 아직 묶지 않은 사용대장을 한 장으로 합칩니다.
        </span>
      </div>

      <div class="summary-grid">
        <article class="summary-card">
          <span class="summary-label">합본 대상</span>
          <strong>{{ pendingUsage?.usageCount ?? 0 }}건</strong>
        </article>
        <article class="summary-card">
          <span class="summary-label">합본 금액</span>
          <strong>{{ formatArcMoney(pendingUsage?.total) }}</strong>
        </article>
        <article class="summary-card">
          <span class="summary-label">정산 담당</span>
          <strong>최윤희</strong>
        </article>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>청구인(정산 받을 사람)</span>
          <input
            v-model.trim="settleForm.claimant"
            type="text"
            placeholder="예: 최윤희"
          />
        </label>
        <label class="field wide">
          <span>합본 메모(선택)</span>
          <input
            v-model.trim="settleForm.note"
            type="text"
            placeholder="예: 11월 소모품 일괄 청구"
          />
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSettling || !(pendingUsage?.usageCount ?? 0)"
          @click="submitSettle"
        >
          이번 달 사용대장 합본 만들기
        </button>
        <router-link to="/admin/arc/expenses" class="link-button">
          비용·실비정산 열기
        </router-link>
      </div>

      <p v-if="!(pendingUsage?.usageCount ?? 0)" class="empty-box">
        이 달에 합본할 사용대장이 없어요. 사용 기록을 먼저 저장해 주세요.
      </p>
      <ul v-else class="settle-list">
        <li v-for="item in pendingUsage.usages" :key="item.id">
          <span class="mono">{{ item.usageNo }}</span>
          <span class="dim">{{ formatArcDateTime(item.usedAt) }}</span>
          <strong>{{ formatArcMoney(item.totalAmount) }}</strong>
        </li>
      </ul>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>사용대장</h2>
        <div class="panel-actions">
          <input
            v-model="period"
            class="inline-input"
            type="month"
            @change="load"
          />
          <select v-model="statusFilter" class="inline-input" @change="load">
            <option value="">전체</option>
            <option value="ACTIVE">유효</option>
            <option value="VOID">취소</option>
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
      <p v-else-if="!usages.length" class="empty-box">
        이 기간에 기록된 사용대장이 없어요.
      </p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>① 언제</th>
              <th>번호</th>
              <th>② 누가</th>
              <th>③ 어디서</th>
              <th>④ 무엇을</th>
              <th>⑤ 어떻게 · ⑥ 왜</th>
              <th class="num">소모금액</th>
              <th>정산</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in usages" :key="row.id">
              <td>
                {{ formatArcDateTime(row.usedAt) }}
                <div class="dim">{{ row.employeeName || "-" }} 기록</div>
              </td>
              <td>
                <span class="mono">{{ row.usageNo }}</span>
                <div v-if="row.incidentNo" class="mono dim">
                  {{ row.incidentNo }}
                </div>
              </td>
              <td class="dim">
                {{ row.targetLabel || "-" }}
                <div v-if="row.targetName">{{ row.targetName }}</div>
              </td>
              <td class="dim">{{ row.place || "-" }}</td>
              <td>
                {{ row.itemText || "-" }}
                <div v-if="row.witnessName" class="dim">
                  확인자 {{ row.witnessName }}
                </div>
              </td>
              <td>
                <div>{{ row.howUsed || "-" }}</div>
                <div class="dim">{{ row.purpose }}</div>
              </td>
              <td class="num">
                {{ formatArcMoney(row.totalAmount) }}
                <div v-if="!row.billable" class="dim">정산 제외</div>
              </td>
              <td>
                <span
                  class="status-badge"
                  :class="
                    row.status === 'VOID'
                      ? 'tone-muted'
                      : row.expenseNo
                      ? 'tone-ok'
                      : 'tone-warn'
                  "
                >
                  {{
                    row.status === "VOID"
                      ? ARC_USAGE_STATUS_LABELS.VOID
                      : row.expenseNo || "청구 전"
                  }}
                </span>
                <div v-if="row.status === 'VOID'" class="dim">
                  {{ row.voidReason || "취소" }}
                </div>
                <div v-else-if="row.expenseNo" class="mono dim">
                  {{ row.expenseNo }}
                </div>
              </td>
              <td>
                <div
                  v-if="canApprove && row.status === 'ACTIVE' && !row.expenseNo"
                  class="row-actions"
                >
                  <template v-if="voidingId === row.id">
                    <input
                      v-model.trim="voidReason"
                      class="inline-input"
                      type="text"
                      placeholder="취소 사유"
                    />
                    <button
                      type="button"
                      class="text-button"
                      :disabled="isSaving"
                      @click="confirmVoid(row)"
                    >
                      취소 확정
                    </button>
                    <button
                      type="button"
                      class="text-button"
                      @click="cancelVoid"
                    >
                      닫기
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    class="text-button"
                    @click="startVoid(row)"
                  >
                    사용 취소
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
  ARC_USAGE_STATUS_LABELS,
  ARC_USAGE_TARGET_LABELS,
  createArcExpenseFromUsageMonth,
  createArcUnitPrice,
  createArcUsage,
  deleteArcUnitPrice,
  fetchArcStock,
  fetchArcUsages,
  formatArcDateTime,
  formatArcMoney,
  voidArcUsage,
} from "@/lib/arc";

function pad(value) {
  return String(value).padStart(2, "0");
}

function nowLocalInput() {
  const now = new Date();

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function currentMonthInput() {
  const now = new Date();

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function emptyLine() {
  return { itemId: "", qty: 1, unitPrice: 0, isDevice: false };
}

function todayInput() {
  const now = new Date();

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
}

const items = ref([]);
const usages = ref([]);
const summary = ref(null);
const priceMap = ref({});
const priceList = ref([]);
const pendingUsage = ref(null);
const period = ref(currentMonthInput());
const statusFilter = ref("");
const canCreate = ref(false);
const canExpense = ref(false);
const canApprove = ref(false);
const canManagePrices = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const isSavingPrice = ref(false);
const isSettling = ref(false);
const errorMessage = ref("");
const okMessage = ref("");
const voidingId = ref("");
const voidReason = ref("");

const form = reactive({
  usedAt: nowLocalInput(),
  targetKind: "GUEST",
  targetName: "",
  purpose: "",
  place: "",
  howUsed: "",
  witnessName: "",
  incidentNo: "",
  note: "",
  items: [emptyLine()],
});

const priceForm = reactive({
  itemId: "",
  unitPrice: 0,
  effectiveFrom: todayInput(),
  note: "",
});

const settleForm = reactive({
  claimant: "",
  note: "",
});

const periodLabel = computed(() => period.value || currentMonthInput());

const itemOptions = computed(() =>
  items.value.filter((item) => item.active !== false)
);

const itemMap = computed(
  () => new Map(items.value.map((item) => [item.id, item]))
);

function lineAmount(line) {
  if (line.isDevice) return 0;

  const qty = Number(line.qty);
  const unitPrice = Number(line.unitPrice);

  if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return 0;

  return Math.max(Math.round(qty * unitPrice), 0);
}

const formTotal = computed(() =>
  form.items.reduce((sum, line) => sum + lineAmount(line), 0)
);

function syncUnitPrice(line) {
  const item = itemMap.value.get(line.itemId);

  line.isDevice = Boolean(item?.isDevice);
  line.unitPrice = line.isDevice ? 0 : priceMap.value[line.itemId] ?? 0;
}

function addLine() {
  form.items.push(emptyLine());
}

function removeLine(index) {
  if (form.items.length > 1) {
    form.items.splice(index, 1);
  }
}

async function load() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const [usageData, stockData] = await Promise.all([
      fetchArcUsages({
        period: period.value,
        status: statusFilter.value,
        limit: 200,
      }),
      fetchArcStock({ includeInactive: false }),
    ]);

    usages.value = usageData.usages;
    summary.value = usageData.summary;
    priceMap.value = usageData.priceMap;
    priceList.value = usageData.prices ?? [];
    pendingUsage.value = usageData.pendingUsage ?? null;
    canCreate.value = usageData.canCreate;
    canExpense.value = usageData.canExpense;
    canApprove.value = usageData.canApprove;
    canManagePrices.value = usageData.canManagePrices;
    items.value = stockData.items;

    if (!settleForm.claimant) {
      settleForm.claimant = usageData.viewerName || "";
    }
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "사용대장을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
  } finally {
    isLoading.value = false;
  }
}

async function submitUsage() {
  if (isSaving.value) return;

  const lines = form.items.filter(
    (line) => line.itemId && Number(line.qty) > 0
  );

  if (lines.length === 0) {
    errorMessage.value = "사용한 품목과 수량을 입력해 주세요.";
    return;
  }

  if (!form.purpose.trim()) {
    errorMessage.value = "사용 사유를 입력해 주세요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const result = await createArcUsage({
      usedAt: form.usedAt,
      targetKind: form.targetKind,
      targetName: form.targetName,
      purpose: form.purpose,
      place: form.place,
      howUsed: form.howUsed,
      witnessName: form.witnessName,
      incidentNo: form.incidentNo,
      note: form.note,
      items: lines.map((line) => ({
        itemId: line.itemId,
        qty: Number(line.qty),
        unitPrice: line.isDevice ? 0 : Number(line.unitPrice),
      })),
    });

    okMessage.value = `${
      result.usage?.usageNo ?? "사용 기록"
    }을 저장하고 재고를 차감했어요.`;

    form.usedAt = nowLocalInput();
    form.targetKind = "GUEST";
    form.targetName = "";
    form.purpose = "";
    form.place = "";
    form.howUsed = "";
    form.witnessName = "";
    form.incidentNo = "";
    form.note = "";
    form.items = [emptyLine()];

    await load();
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "사용 기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
  } finally {
    isSaving.value = false;
  }
}

async function submitUnitPrice() {
  if (isSavingPrice.value) return;

  if (!priceForm.itemId) {
    errorMessage.value = "단가를 등록할 품목을 선택해 주세요.";
    return;
  }

  if (!(Number(priceForm.unitPrice) > 0)) {
    errorMessage.value = "단가는 0원보다 커야 해요.";
    return;
  }

  isSavingPrice.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const price = await createArcUnitPrice({
      itemId: priceForm.itemId,
      unitPrice: Number(priceForm.unitPrice),
      effectiveFrom: priceForm.effectiveFrom,
      note: priceForm.note,
    });

    okMessage.value = `${price?.itemName ?? "품목"} 기준단가를 ${
      price?.effectiveFrom ?? ""
    }부터 ${formatArcMoney(price?.unitPrice)}으로 등록했어요.`;

    priceForm.itemId = "";
    priceForm.unitPrice = 0;
    priceForm.note = "";

    await load();
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "기준단가를 등록하지 못했어요. 품목과 단가를 확인해 주세요.";
  } finally {
    isSavingPrice.value = false;
  }
}

async function removeUnitPrice(price) {
  if (isSavingPrice.value) return;

  isSavingPrice.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await deleteArcUnitPrice(price.id);
    okMessage.value = `${price.itemName} 기준단가를 삭제했어요.`;
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "기준단가를 삭제하지 못했어요.";
  } finally {
    isSavingPrice.value = false;
  }
}

async function submitSettle() {
  if (isSettling.value) return;

  isSettling.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const result = await createArcExpenseFromUsageMonth({
      period: period.value,
      claimant: settleForm.claimant,
      note: settleForm.note,
    });

    okMessage.value = `${
      result.expense?.expenseNo ?? "정산서"
    }로 합본했어요. 비용·실비정산에서 이어서 처리해 주세요.`;
    settleForm.note = "";

    await load();
  } catch (error) {
    errorMessage.value = error?.message || "사용대장 합본을 만들지 못했어요.";
  } finally {
    isSettling.value = false;
  }
}

function startVoid(row) {
  voidingId.value = row.id;
  voidReason.value = "";
}

function cancelVoid() {
  voidingId.value = "";
  voidReason.value = "";
}

async function confirmVoid(row) {
  if (isSaving.value) return;

  if (!voidReason.value.trim()) {
    errorMessage.value = "취소 사유를 입력해 주세요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await voidArcUsage(row.id, voidReason.value.trim());
    okMessage.value = `${row.usageNo} 사용을 취소하고 재고를 되돌렸어요.`;
    voidingId.value = "";
    voidReason.value = "";

    await load();
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "사용 기록을 취소하지 못했어요. 정산서 연결 여부를 확인해 주세요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(load);
</script>
<style scoped lang="scss">
.admin-arc-usage-view {
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

  input:disabled {
    opacity: 0.55;
  }

  small {
    color: rgba(255, 255, 255, 0.48);
    line-height: 1.5;
  }
}

.usage-lines {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.usage-line {
  display: grid;
  grid-template-columns:
    minmax(220px, 2fr) minmax(90px, 0.6fr) minmax(110px, 0.8fr)
    minmax(110px, 0.7fr) auto;
  align-items: end;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
}

.line-amount {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);

  strong {
    font-size: 14px;
    font-weight: 800;
    color: #ffffff;
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

.section-hint {
  margin: 0 0 4px;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.6);

  strong {
    color: #fcd34d;
  }
}

.price-panel {
  border: 1px solid rgba(99, 102, 241, 0.32);
}

.price-list,
.settle-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.price-row {
  display: grid;
  grid-template-columns:
    minmax(70px, 0.6fr) minmax(140px, 1.6fr) minmax(90px, 0.7fr)
    minmax(110px, 0.9fr) minmax(120px, 1.4fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 13px;
}

.settle-panel {
  border: 1px solid rgba(52, 211, 153, 0.32);
}

.settle-list {
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    font-size: 13px;
  }
}

@media (max-width: 900px) {
  .usage-line {
    grid-template-columns: 1fr;
  }

  .field.wide {
    grid-column: span 1;
  }
}
</style>
