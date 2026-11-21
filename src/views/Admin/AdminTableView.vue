<template>
  <div class="admin-table-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN TABLE PANEL</p>
        <h1>테이블 관리</h1>
        <p class="description">
          매장 테이블의 구역, 좌석 수, 표시 이름을 관리할 수 있어요. 비활성으로
          바꾼 테이블은 태블릿 운영판에서 손님이 없는 상태로만 남습니다.
        </p>
      </div>
      <div class="header-summary">
        <span class="summary-item">전체 {{ tableList.length }}개</span>
        <span class="summary-item">사용중 {{ activeCount }}개</span>
      </div>
    </header>

    <section class="zone-summary-section">
      <div v-for="zone in zoneSummaryList" :key="zone.key" class="zone-summary">
        <p class="zone-summary-label">{{ zone.label }}</p>
        <strong class="zone-summary-value">{{ zone.count }}개</strong>
        <p class="zone-summary-hint">{{ zone.rangeText }}</p>
      </div>
    </section>

    <section class="list-section">
      <div v-if="isLoadingTables" class="empty-box">
        <h2>테이블 정보를 불러오는 중이에요</h2>
        <p>잠시만 기다려주세요.</p>
      </div>

      <div v-else-if="tableList.length === 0" class="empty-box">
        <h2>등록된 테이블이 없어요</h2>
        <p>서버에서 스키마를 적용하면 1~30번 테이블이 자동으로 생성됩니다.</p>
      </div>

      <template v-else>
        <div v-if="!canManageTables" class="notice-box">
          <p>
            테이블 설정을 변경하려면 관리자 권한이 필요해요. 조회만 가능합니다.
          </p>
        </div>

        <div v-else-if="currentEditingNumber" class="form-card">
          <div class="form-header">
            <h2>{{ editingLabel }} 설정</h2>
            <p class="form-hint">
              변경 후 저장하면 태블릿 운영판에 바로 반영돼요.
            </p>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label for="tableDisplayName">표시 이름</label>
              <input
                id="tableDisplayName"
                v-model.trim="editForm.displayName"
                type="text"
                maxlength="40"
                :placeholder="editingDefaultLabel"
              />
              <p class="field-hint">비워두면 기본 이름을 사용해요.</p>
            </div>

            <div class="form-group">
              <label for="tableZone">구역</label>
              <select id="tableZone" v-model="editForm.zone">
                <option
                  v-for="zone in zoneOptions"
                  :key="zone.value"
                  :value="zone.value"
                >
                  {{ zone.label }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="tableSeatCapacity">좌석 수</label>
              <input
                id="tableSeatCapacity"
                v-model.number="editForm.seatCapacity"
                type="number"
                min="1"
                max="50"
                step="1"
              />
            </div>

            <div class="form-group">
              <label for="tableSortOrder">정렬 순서</label>
              <input
                id="tableSortOrder"
                v-model.number="editForm.sortOrder"
                type="number"
                min="0"
                max="9999"
                step="1"
              />
              <p class="field-hint">숫자가 작을수록 먼저 보여요.</p>
            </div>

            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input v-model="editForm.isActive" type="checkbox" />
                <span>사용중</span>
              </label>
            </div>

            <div class="form-group form-group-wide">
              <label for="tableNote">메모</label>
              <input
                id="tableNote"
                v-model.trim="editForm.note"
                type="text"
                maxlength="200"
                placeholder="예: 창가 자리, 예약석"
              />
            </div>
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="isSubmitting"
              @click="cancelEdit"
            >
              취소
            </button>
            <button
              type="button"
              class="primary-button"
              :disabled="isSubmitting"
              @click="handleSubmit"
            >
              {{ isSubmitting ? "저장 중..." : "저장" }}
            </button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="table-admin-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>표시 이름</th>
                <th>구역</th>
                <th>좌석</th>
                <th>정렬</th>
                <th>메모</th>
                <th>상태</th>
                <th>수정</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="item in tableList"
                :key="item.tableNumber"
                :class="{ inactive: item.isActive === false }"
              >
                <td>
                  <strong>{{ item.tableNumber }}</strong>
                </td>
                <td>{{ item.displayName || "-" }}</td>
                <td>
                  <span class="zone-chip" :class="item.zone.toLowerCase()">
                    {{ zoneLabel(item.zone) }}
                  </span>
                </td>
                <td>{{ item.seatCapacity }}석</td>
                <td>{{ item.sortOrder ?? 0 }}</td>
                <td class="note-cell">{{ item.note || "-" }}</td>
                <td>
                  <span
                    class="status-chip"
                    :class="item.isActive ? 'active' : 'inactive'"
                  >
                    {{ item.isActive ? "사용중" : "비활성" }}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    class="edit-button"
                    :disabled="!canManageTables"
                    @click="startEdit(item)"
                  >
                    수정
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { runGlobalBusy } from "@/lib/globalBusy";
import {
  TABLE_ZONES,
  fetchTableMaster,
  subscribeTableMaster,
  tableLabelOf,
  updateTableMaster,
  zoneLabel,
} from "@/lib/tableMaster";
import { hasPermission } from "@/lib/staffAuth";

// 테이블 마스터는 매장 구조 설정이므로 사장(settings.manage)만 수정할 수 있습니다.
const TABLE_MANAGE_PERMISSION = "settings.manage";

const zoneOptions = [
  { value: "BAR", label: TABLE_ZONES.BAR },
  { value: "LARGE", label: TABLE_ZONES.LARGE },
];

const isLoadingTables = ref(true);
const isSubmitting = ref(false);
const tableList = ref([]);
const editingTableNumber = ref(0);

const editForm = ref({
  displayName: "",
  zone: "BAR",
  seatCapacity: 4,
  sortOrder: 0,
  isActive: true,
  note: "",
});

let unsubscribeTableMaster = null;

const canManageTables = computed(() => {
  return hasPermission(TABLE_MANAGE_PERMISSION);
});

const activeCount = computed(
  () => tableList.value.filter((item) => item.isActive !== false).length
);

const currentEditingNumber = computed(() => editingTableNumber.value);

const editingTable = computed(() => {
  return (
    tableList.value.find(
      (item) => Number(item.tableNumber) === Number(editingTableNumber.value)
    ) || null
  );
});

const editingLabel = computed(() => {
  return editingTable.value
    ? tableLabelOf(editingTable.value)
    : `${editingTableNumber.value}번 테이블`;
});

const editingDefaultLabel = computed(() => {
  if (!editingTable.value) return "";

  return tableLabelOf({
    tableNumber: editingTable.value.tableNumber,
    zone: editForm.value.zone,
    displayName: "",
  });
});

const zoneSummaryList = computed(() => {
  return zoneOptions.map((zone) => {
    const rows = tableList.value.filter(
      (item) => String(item.zone || "").toUpperCase() === zone.value
    );
    const numbers = rows
      .map((item) => Number(item.tableNumber))
      .sort((a, b) => a - b);
    const rangeText =
      numbers.length === 0
        ? "등록된 테이블 없음"
        : numbers.length === 1
        ? `${numbers[0]}번`
        : `${numbers[0]}~${numbers[numbers.length - 1]}번`;

    return {
      key: zone.value,
      label: zone.label,
      count: rows.length,
      rangeText,
    };
  });
});

async function loadTables() {
  try {
    tableList.value = await fetchTableMaster();
  } catch (error) {
    console.error("테이블 조회 실패:", error);
  } finally {
    isLoadingTables.value = false;
  }
}

function subscribeTables() {
  unsubscribeTableMaster = subscribeTableMaster(loadTables);
}

function startEdit(item) {
  if (!canManageTables.value) return;

  editingTableNumber.value = Number(item.tableNumber);
  editForm.value = {
    displayName: item.displayName || "",
    zone: String(item.zone || "BAR").toUpperCase(),
    seatCapacity: Number(item.seatCapacity ?? 4),
    sortOrder: Number(item.sortOrder ?? 0),
    isActive: item.isActive !== false,
    note: item.note || "",
  };
}

function cancelEdit() {
  editingTableNumber.value = 0;
}

function validateForm() {
  const seatCapacity = Number(editForm.value.seatCapacity);

  if (
    !Number.isInteger(seatCapacity) ||
    seatCapacity < 1 ||
    seatCapacity > 50
  ) {
    alert("좌석 수는 1~50 사이 숫자로 입력해주세요.");
    return null;
  }

  const sortOrder = Number(editForm.value.sortOrder ?? 0);

  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    alert("정렬 순서는 0~9999 사이 숫자로 입력해주세요.");
    return null;
  }

  if (editForm.value.displayName.length > 40) {
    alert("표시 이름은 40자 이내로 입력해주세요.");
    return null;
  }

  if (editForm.value.note.length > 200) {
    alert("메모는 200자 이내로 입력해주세요.");
    return null;
  }

  return {
    displayName: editForm.value.displayName,
    zone: editForm.value.zone,
    seatCapacity,
    sortOrder,
    isActive: editForm.value.isActive,
    note: editForm.value.note,
  };
}

async function handleSubmit() {
  if (isSubmitting.value || !editingTableNumber.value) return;

  const payload = validateForm();
  if (!payload) return;

  await runGlobalBusy(async () => {
    isSubmitting.value = true;

    try {
      await updateTableMaster(editingTableNumber.value, payload);
      editingTableNumber.value = 0;
      await loadTables();
      alert("테이블 설정이 저장되었어요.");
    } catch (error) {
      console.error("테이블 저장 실패:", error);
      alert(error?.message || "테이블 설정 저장 중 문제가 발생했어요.");
    } finally {
      isSubmitting.value = false;
    }
  }, "테이블 설정을 저장하는 중이에요.");
}

onMounted(() => {
  // 라우터 가드가 직원 세션을 먼저 확인하므로 권한 정보는 이미 준비되어 있습니다.
  subscribeTables();
});

onUnmounted(() => {
  if (unsubscribeTableMaster) {
    unsubscribeTableMaster();
    unsubscribeTableMaster = null;
  }
});
</script>

<style scoped lang="scss">
.admin-table-view {
  min-height: 100%;
  padding: 24px;
  color: #fff;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;

  .eyebrow {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.55);
  }

  h1 {
    margin: 0 0 8px;
    font-size: 32px;
    font-weight: 800;
  }

  .description {
    margin: 0;
    max-width: 640px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.header-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.summary-item {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 13px;
  font-weight: 700;
}

.zone-summary-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.zone-summary {
  padding: 16px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);

  .zone-summary-label {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.55);
  }

  .zone-summary-value {
    display: block;
    font-size: 24px;
    font-weight: 800;
  }

  .zone-summary-hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }
}

.list-section {
  margin-bottom: 20px;
}

.form-card,
.empty-box,
.notice-box,
.table-wrap {
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
}

.form-card {
  padding: 20px;
  margin-bottom: 20px;
}

.form-header {
  margin-bottom: 16px;

  h2 {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 800;
  }

  .form-hint {
    margin: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.62);
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.form-group-wide {
  grid-column: 1 / -1;
}

.form-group {
  label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.72);
  }

  input,
  select {
    width: 100%;
    height: 46px;
    padding: 0 14px;
    border: none;
    outline: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;
  }

  select option {
    color: #ffffff;
    background: #111827;
  }

  .field-hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }
}

.checkbox-group {
  display: flex;
  align-items: flex-end;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 14px;
  cursor: pointer;

  input {
    width: 18px;
    height: 18px;
  }
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.primary-button,
.secondary-button,
.edit-button {
  border: none;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  height: 46px;
  padding: 0 22px;
  background: #6366f1;
  color: #fff;
}

.secondary-button {
  height: 46px;
  padding: 0 22px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.edit-button {
  height: 34px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.primary-button:disabled,
.secondary-button:disabled,
.edit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-box {
  padding: 36px;
  text-align: center;

  h2 {
    margin: 0 0 8px;
    font-size: 20px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.62);
  }
}

.notice-box {
  padding: 16px 20px;
  margin-bottom: 20px;
  background: rgba(251, 191, 36, 0.14);

  p {
    margin: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
  }
}

.table-wrap {
  overflow-x: auto;
}

.table-admin-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 780px;

  th,
  td {
    padding: 14px 16px;
    text-align: left;
    font-size: 14px;
    white-space: nowrap;
  }

  th {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.55);
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }

  tbody tr {
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  tbody tr.inactive {
    opacity: 0.55;
  }

  .note-cell {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.zone-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.12);

  &.bar {
    background: rgba(99, 102, 241, 0.28);
  }

  &.large {
    background: rgba(16, 185, 129, 0.28);
  }
}

.status-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;

  &.active {
    background: rgba(52, 211, 153, 0.24);
    color: #6ee7b7;
  }

  &.inactive {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
  }
}
</style>
