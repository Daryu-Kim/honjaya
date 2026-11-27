<template>
  <div class="admin-arc-otc-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>직원 개인 상비약</h1>
        <p class="description">
          직원이 각자 보관하는 상비약은 사업장 재고와 섞지 않아요. 월 1회 본인이
          직접 수량·유효기간·보관 상태를 확인하고 기록합니다.
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
        <h2>
          내 상비약 <span class="dim">({{ viewerName || "본인" }})</span>
        </h2>
        <div class="panel-actions">
          <input
            v-model="period"
            class="inline-input"
            type="month"
            @change="load"
          />
          <label v-if="canManageAll" class="checkbox-field">
            <input v-model="scopeAll" type="checkbox" @change="load" />
            <span>전체 직원 보기</span>
          </label>
          <button
            type="button"
            class="preset-button"
            :disabled="isSaving"
            @click="claim"
          >
            내 이름으로 지정
          </button>
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

      <p class="helper-text">
        소유자가 비어 있는 상비약은 '내 이름으로 지정'으로 한 번에 가져올 수
        있어요. 수량·유효기간을 고친 뒤 입력란에서 포커스를 옮기면 저장돼요.
      </p>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!items.length" class="empty-box">표시할 상비약이 없어요.</p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>코드</th>
              <th>품명</th>
              <th class="num">수량</th>
              <th>유효기간</th>
              <th>소유자</th>
              <th>{{ period }} 점검</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td class="mono">{{ item.code }}</td>
              <td>
                {{ item.name }}
                <div class="dim">{{ item.category }}</div>
              </td>
              <td class="num">
                <input
                  v-model.number="item.qty"
                  class="qty-input"
                  type="number"
                  min="0"
                  step="0.5"
                  :disabled="!canEdit(item)"
                  @change="saveItem(item)"
                />
                <span class="dim">{{ item.unit }}</span>
              </td>
              <td>
                <input
                  v-model="item.expiresOn"
                  class="date-input"
                  type="date"
                  :disabled="!canEdit(item)"
                  @change="saveItem(item)"
                />
                <div v-if="item.daysLeft !== null" class="dim">
                  {{ item.daysLeft }}일 남음
                </div>
              </td>
              <td class="dim">{{ item.ownerName || "미지정" }}</td>
              <td>
                <span
                  class="status-badge"
                  :class="item.checkedThisPeriod ? 'tone-ok' : 'tone-warn'"
                >
                  {{ item.checkedThisPeriod ? "완료" : "미점검" }}
                </span>
              </td>
              <td>
                <button
                  v-if="canEdit(item)"
                  type="button"
                  class="text-button"
                  @click="openCheck(item)"
                >
                  점검 기록
                </button>
                <span v-else class="dim">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="checkForm.open" class="panel">
      <h2>
        {{ checkForm.code }} {{ checkForm.name }} · {{ checkForm.period }} 점검
      </h2>

      <div class="field-grid">
        <label class="field">
          <span>수량 ({{ checkForm.unit }})</span>
          <input
            v-model.number="checkForm.qty"
            type="number"
            min="0"
            step="0.5"
          />
        </label>

        <label class="field">
          <span>유효기간</span>
          <input v-model="checkForm.expiresOn" type="date" />
        </label>

        <label class="field checkbox-field">
          <input v-model="checkForm.packageOk" type="checkbox" />
          <span>포장·라벨이 온전해요</span>
        </label>

        <label class="field checkbox-field">
          <input v-model="checkForm.storageOk" type="checkbox" />
          <span>보관 상태가 적정해요</span>
        </label>

        <label class="field checkbox-field">
          <input v-model="checkForm.noSharingOk" type="checkbox" />
          <span>타인에게 넘기지 않았어요</span>
        </label>

        <label class="field wide">
          <span>메모</span>
          <input
            v-model.trim="checkForm.note"
            type="text"
            placeholder="예: 교체 필요, 이상 없음"
          />
        </label>
      </div>

      <p class="helper-text">
        증상·복용 시간 같은 건강 상세는 이 화면에 적지 않아요. 필요하면
        돌봄기록(AS-CARE)에 따로 남겨 주세요.
      </p>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitCheck"
        >
          점검 완료
        </button>
        <button
          type="button"
          class="preset-button"
          @click="checkForm.open = false"
        >
          취소
        </button>
      </div>
    </section>

    <section class="panel">
      <h2>점검 이력</h2>

      <p v-if="!checks.length" class="empty-box">점검 이력이 없어요.</p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>기간</th>
              <th>점검일</th>
              <th>품목</th>
              <th class="num">수량</th>
              <th>유효기간</th>
              <th>확인</th>
              <th>기록자</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in checks" :key="row.id">
              <td class="mono">{{ row.period }}</td>
              <td>{{ row.checkedOn }}</td>
              <td>{{ row.name }}</td>
              <td class="num">{{ row.qty }}</td>
              <td>{{ row.expiresOn || "-" }}</td>
              <td>
                <span
                  :class="{
                    critical:
                      !row.packageOk || !row.storageOk || !row.noSharingOk,
                  }"
                >
                  {{
                    row.packageOk && row.storageOk && row.noSharingOk
                      ? "정상"
                      : "확인 필요"
                  }}
                </span>
              </td>
              <td class="dim">{{ row.employeeName || "-" }}</td>
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
  claimArcOtcItems,
  createArcOtcCheck,
  fetchArcOtc,
  updateArcOtcItem,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";

const items = ref([]);
const checks = ref([]);
const viewerId = ref(null);
const viewerName = ref("");
const canManageAll = ref(false);
const scopeAll = ref(false);
const period = ref(currentMonth());
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const checkForm = reactive({
  open: false,
  otcItemId: "",
  code: "",
  name: "",
  unit: "정",
  period: "",
  qty: 0,
  expiresOn: "",
  packageOk: true,
  storageOk: true,
  noSharingOk: true,
  note: "",
});

const canStock = computed(() => hasPermission("arc.stock"));

function currentMonth() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function flash(message) {
  okMessage.value = message;
  errorMessage.value = "";
}

function canEdit(item) {
  if (!canStock.value) return false;

  return canManageAll.value || item.ownerEmployeeId === viewerId.value;
}

async function load() {
  isLoading.value = true;

  try {
    const data = await fetchArcOtc({
      period: period.value,
      scopeAll: scopeAll.value,
    });

    items.value = data.items;
    checks.value = data.checks;
    viewerId.value = data.viewerId;
    viewerName.value = data.viewerName;
    canManageAll.value = data.canManageAll;
  } catch (error) {
    errorMessage.value = error?.message || "상비약 목록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function claim() {
  isSaving.value = true;

  try {
    const claimed = await claimArcOtcItems();

    flash(
      claimed
        ? `소유자 없는 상비약 ${claimed}개를 내 이름으로 지정했어요.`
        : "내 이름으로 지정할 상비약이 없어요."
    );
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "소유자 지정에 실패했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function saveItem(item) {
  try {
    await updateArcOtcItem(item.id, {
      qty: item.qty,
      expiresOn: item.expiresOn || "",
      note: item.note,
    });
    okMessage.value = `${item.code} 저장했어요.`;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = error?.message || "저장에 실패했어요.";
    await load();
  }
}

function openCheck(item) {
  Object.assign(checkForm, {
    open: true,
    otcItemId: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    period: period.value,
    qty: item.qty,
    expiresOn: item.expiresOn || "",
    packageOk: true,
    storageOk: true,
    noSharingOk: true,
    note: "",
  });
}

async function submitCheck() {
  isSaving.value = true;

  try {
    await createArcOtcCheck(checkForm.otcItemId, {
      period: checkForm.period,
      qty: checkForm.qty,
      expiresOn: checkForm.expiresOn || "",
      packageOk: checkForm.packageOk,
      storageOk: checkForm.storageOk,
      noSharingOk: checkForm.noSharingOk,
      note: checkForm.note,
    });

    checkForm.open = false;
    flash("점검을 기록했어요.");
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "점검 기록에 실패했어요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.admin-arc-otc-view {
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

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
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

.critical {
  color: #fca5a5;
}

.qty-input {
  width: 76px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 12px;
  text-align: right;
}

.date-input {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 12px;
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

  input {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    font-size: 13px;
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
