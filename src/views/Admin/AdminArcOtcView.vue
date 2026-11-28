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

    <div class="view-tabs">
      <button
        type="button"
        :class="['view-tab', { active: tab === 'stock' }]"
        @click="tab = 'stock'"
      >
        재고·점검
      </button>
      <button
        type="button"
        :class="['view-tab', { active: tab === 'ledger' }]"
        @click="tab = 'ledger'"
      >
        사용·정산
      </button>
    </div>

    <ArcOtcLedgerPanel v-if="tab === 'ledger'" :period="period" />

    <div v-show="tab === 'stock'" class="tab-body">
      <section class="panel">
        <div class="panel-head">
          <h2>
            {{ panelTitle }}
            <span class="dim">({{ viewerName || "본인" }})</span>
          </h2>
          <div class="panel-actions">
            <input
              v-model="period"
              class="inline-input"
              type="month"
              @change="load"
            />
            <label
              v-if="canManageAll && !viewerIsDirector"
              class="checkbox-field"
            >
              <input v-model="scopeAll" type="checkbox" @change="load" />
              <span>전체 직원 보기</span>
            </label>
            <button
              v-if="!viewerIsDirector"
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

        <p v-if="viewerIsDirector" class="helper-text restricted">
          ARC 총괄은 개인 상비약 관리 대상이 아니에요. 이 화면에서 최윤희를 뺀
          직원·사장의 상비약만 관리해요. 새로 등록할 때도 소유자를 직원 또는
          사장으로 골라야 하고, 최윤희 본인은 소유자로 지정할 수 없어요.
        </p>
        <p v-else class="helper-text">
          소유자가 비어 있는 상비약은 '내 이름으로 지정'으로 한 번에 가져올 수
          있어요. 수량·유효기간을 고친 뒤 입력란에서 포커스를 옮기면 저장돼요.
        </p>

        <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
        <p v-else-if="!items.length" class="empty-box">
          표시할 상비약이 없어요.
        </p>

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
                  <div v-if="item.lowStock" class="dim restock-hint">
                    최소 {{ item.minQty }}{{ item.unit }} ·
                    {{ item.suggestedOrderQty }}{{ item.unit }} 보충
                  </div>
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
          {{ checkForm.code }} {{ checkForm.name }} ·
          {{ checkForm.period }} 점검
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

      <section v-if="canStock" class="panel">
        <h2>상비약 등록</h2>
        <p class="helper-text">
          {{
            viewerIsDirector
              ? "직원·사장이 보관하는 상비약을 대신 등록해요. 소유자를 반드시 골라 주세요. 사업장 재고("
              : "내가 보관하는 상비약을 새로 등록해요. 사업장 재고("
          }}<router-link to="/admin/arc/stock">재고</router-link>)와 섞이지 않게
          별도 대장(OTC-###)으로 번호가 자동 부여돼요. 코드를 비우면 다음 번호가
          붙어요.
        </p>

        <div class="field-grid">
          <label v-if="canManageAll" class="field">
            <span>소유자 (직원·사장)</span>
            <select v-model="createForm.ownerEmployeeId">
              <option value="">선택해 주세요</option>
              <option v-for="owner in owners" :key="owner.id" :value="owner.id">
                {{ owner.name }} ({{ roleLabel(owner.role) }})
              </option>
            </select>
          </label>
          <label class="field">
            <span>품명</span>
            <input
              v-model.trim="createForm.name"
              type="text"
              placeholder="예: 타이레놀 500mg"
            />
          </label>
          <label class="field">
            <span>분류</span>
            <input
              v-model.trim="createForm.category"
              type="text"
              placeholder="예: 진통·해열"
            />
          </label>
          <label class="field">
            <span>수량</span>
            <input
              v-model.number="createForm.qty"
              type="number"
              min="0"
              step="0.5"
            />
          </label>
          <label class="field">
            <span>단위</span>
            <input
              v-model.trim="createForm.unit"
              type="text"
              placeholder="정"
            />
          </label>
          <label class="field">
            <span>유효기간</span>
            <input v-model="createForm.expiresOn" type="date" />
          </label>
          <label class="field">
            <span>코드 (선택)</span>
            <input
              v-model.trim="createForm.code"
              type="text"
              placeholder="비우면 자동 부여"
            />
          </label>
          <label class="field wide">
            <span>메모</span>
            <input
              v-model.trim="createForm.note"
              type="text"
              placeholder="예: 본인 개인 구입, 교체 주기 6개월"
            />
          </label>
        </div>

        <div class="actions">
          <button
            type="button"
            class="primary-button"
            :disabled="isSaving"
            @click="submitCreate"
          >
            {{ isSaving ? "등록 중이에요..." : "상비약 등록" }}
          </button>
          <span class="helper-text">
            등록 후에도 월 1회 점검 기록은 따로 남겨 주세요. 타인과 나눠 쓰지
            않는 개인 보관 원칙이에요.
          </span>
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
                <td>
                  {{ row.expiresOn ? formatArcDate(row.expiresOn) : "-" }}
                </td>
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
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  claimArcOtcItems,
  createArcOtcCheck,
  createArcOtcItem,
  fetchArcOtc,
  formatArcDate,
  updateArcOtcItem,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";
import ArcOtcLedgerPanel from "@/components/arc/ArcOtcLedgerPanel.vue";

const tab = ref("stock");
const items = ref([]);
const checks = ref([]);
const owners = ref([]);
const viewerId = ref(null);
const viewerName = ref("");
const canManageAll = ref(false);
const viewerIsDirector = ref(false);
const scopeAll = ref(false);
const period = ref(currentMonth());
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const createForm = reactive({
  ownerEmployeeId: "",
  name: "",
  category: "",
  qty: 0,
  unit: "정",
  expiresOn: "",
  code: "",
  note: "",
});

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
const panelTitle = computed(() =>
  viewerIsDirector.value
    ? "직원·사장 상비약 관리"
    : canManageAll.value && scopeAll.value
    ? "전체 직원 상비약"
    : "내 상비약"
);

const ROLE_LABELS = { OWNER: "사장", MANAGER: "매니저", STAFF: "직원" };

function roleLabel(role) {
  return ROLE_LABELS[role] || role || "";
}

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
    owners.value = data.owners;
    viewerId.value = data.viewerId;
    viewerName.value = data.viewerName;
    canManageAll.value = data.canManageAll;
    viewerIsDirector.value = data.viewerIsDirector;

    if (data.viewerIsDirector) {
      scopeAll.value = true;
    }
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

async function submitCreate() {
  if (isSaving.value) return;

  if (!createForm.name) {
    errorMessage.value = "품명을 입력해 주세요.";
    return;
  }

  if (canManageAll.value && !createForm.ownerEmployeeId) {
    errorMessage.value = "상비약 소유자(직원·사장)를 골라 주세요.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";

  try {
    const created = await createArcOtcItem({
      ownerEmployeeId: canManageAll.value ? createForm.ownerEmployeeId : "",
      name: createForm.name,
      category: createForm.category,
      qty: createForm.qty,
      unit: createForm.unit,
      expiresOn: createForm.expiresOn || "",
      code: createForm.code,
      note: createForm.note,
    });

    flash(`${created?.code ?? "상비약"} 등록했어요.`);
    Object.assign(createForm, {
      ownerEmployeeId: "",
      name: "",
      category: "",
      qty: 0,
      unit: "정",
      expiresOn: "",
      code: "",
      note: "",
    });
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "상비약을 등록하지 못했어요.";
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
@use "../../scss/_arc-ui" as *;
.admin-arc-otc-view {
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

.view-tabs {
  display: flex;
  gap: 8px;
}

.view-tab {
  padding: 9px 18px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.view-tab:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

.view-tab.active {
  background: rgba(59, 130, 246, 0.28);
  border-color: rgba(96, 165, 250, 0.7);
  color: #ffffff;
}

.tab-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.critical {
  color: #fca5a5;
}

.restock-hint {
  margin-top: 2px;
  font-size: 11px;
  color: #fcd34d;
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

.tone-ok {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}

.tone-warn {
  background: rgba(251, 191, 36, 0.16);
  color: #fcd34d;
}

.field {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.checkbox-field.field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
</style>
