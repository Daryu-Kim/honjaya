<template>
  <div class="admin-arc-usage-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>사용대장 · 소모금액</h1>
        <p class="description">
          구급상자를 쓴 품목·수량·대상자 구분·사유·시각을 남겨요. 저장하면
          재고가 바로 차감되고, 단가는 최근 구매 단가로 계산돼요. 내구재는 정상
          사용만으로 비용을 청구하지 않아 금액이 0원이에요.
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

    <section v-if="canCreate" class="panel">
      <h2>사용 기록 추가</h2>

      <div class="field-grid">
        <label class="field">
          <span>사용 일시</span>
          <input v-model="form.usedAt" type="datetime-local" />
        </label>

        <label class="field">
          <span>대상자 구분</span>
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

        <label class="field wide">
          <span>사용 사유</span>
          <input
            v-model.trim="form.purpose"
            type="text"
            placeholder="예: 손님 손가락 열상 소독·반창고 처치"
          />
        </label>

        <label class="field">
          <span>사용 장소</span>
          <input
            v-model.trim="form.place"
            type="text"
            placeholder="예: 홀 카운터"
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
          <span>메모(선택)</span>
          <input
            v-model.trim="form.note"
            type="text"
            placeholder="상세 건강정보는 사건 상세기록에만 입력해 주세요."
          />
        </label>
      </div>

      <div class="usage-lines">
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
          사용 기록 저장
        </button>
      </div>
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
              <th>사용 일시</th>
              <th>번호</th>
              <th>대상</th>
              <th>품목</th>
              <th class="num">소모금액</th>
              <th>정산</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in usages" :key="row.id">
              <td>
                {{ formatArcDateTime(row.usedAt) }}
                <div class="dim">{{ row.employeeName || "-" }}</div>
              </td>
              <td>
                <span class="mono">{{ row.usageNo }}</span>
                <div v-if="row.incidentNo" class="mono dim">
                  {{ row.incidentNo }}
                </div>
              </td>
              <td class="dim">{{ row.targetLabel || "-" }}</td>
              <td>
                {{ row.itemText || "-" }}
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
  createArcUsage,
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

const items = ref([]);
const usages = ref([]);
const summary = ref(null);
const priceMap = ref({});
const period = ref(currentMonthInput());
const statusFilter = ref("");
const canCreate = ref(false);
const canExpense = ref(false);
const canApprove = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");
const voidingId = ref("");
const voidReason = ref("");

const form = reactive({
  usedAt: nowLocalInput(),
  targetKind: "GUEST",
  purpose: "",
  place: "",
  incidentNo: "",
  note: "",
  items: [emptyLine()],
});

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
    canCreate.value = usageData.canCreate;
    canExpense.value = usageData.canExpense;
    canApprove.value = usageData.canApprove;
    items.value = stockData.items;
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
      purpose: form.purpose,
      place: form.place,
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
    form.purpose = "";
    form.place = "";
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

@media (max-width: 900px) {
  .usage-line {
    grid-template-columns: 1fr;
  }

  .field.wide {
    grid-column: span 1;
  }
}
</style>
