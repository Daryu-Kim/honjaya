<template>
  <div class="admin-arc-stock-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>구급상자 재고·유효기간</h1>
        <p class="description">
          실물 재고는 로트별로 관리해요. 유효기간이 짧은 로트부터 먼저 쓰고,
          개봉한 품목은 개봉 후 사용기한이 지나면 자동으로 알림이 쌓여요.
        </p>
      </div>
      <div class="header-actions">
        <router-link to="/admin/arc" class="link-button"
          >응급안전 홈</router-link
        >
        <router-link to="/admin/arc/purchases" class="link-button"
          >보충·정산</router-link
        >
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <!-- 등급(A·B·C) 안내: 처음 보는 사람도 바로 이해할 수 있게 위에 고정 -->
    <section class="grade-legend">
      <div class="grade-legend-head">
        <h2>등급 표기 안내</h2>
        <span class="grade-legend-sub">품목마다 접근 등급이 정해져 있어요</span>
      </div>
      <ul class="grade-legend-list">
        <li v-for="row in GRADE_LEGEND" :key="row.key">
          <span :class="['grade-chip', `grade-${row.key.toLowerCase()}`]">
            {{ row.key }}
          </span>
          <div class="grade-body">
            <strong>{{ row.label }}</strong>
            <span class="grade-desc">{{ row.desc }}</span>
            <span class="grade-who">{{ row.who }}</span>
          </div>
        </li>
      </ul>
      <p class="grade-note">
        ※ 등급은 '누가 꺼내 쓸 수 있는지'를 정한 표시예요. 유효기간(만료일)과는
        별개이며, 만료·개봉 후 기한 초과 품목은 등급과 상관없이 사용 금지입니다.
      </p>
    </section>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">사용 중 품목</span>
        <strong>{{ summary.totalItems ?? 0 }}종</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary.lowStock ?? 0) > 0 }"
      >
        <span class="summary-label">재고 부족</span>
        <strong>{{ summary.lowStock ?? 0 }}종</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary.expiring30 ?? 0) > 0 }"
      >
        <span class="summary-label">30일 내 만료</span>
        <strong>{{ summary.expiring30 ?? 0 }}종</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary.expired ?? 0) > 0 }"
      >
        <span class="summary-label">유효기간 지남</span>
        <strong>{{ summary.expired ?? 0 }}종</strong>
      </article>
      <article
        class="summary-card"
        :class="{ alert: (summary.openedOverdue ?? 0) > 0 }"
      >
        <span class="summary-label">개봉 후 기한 초과</span>
        <strong>{{ summary.openedOverdue ?? 0 }}종</strong>
      </article>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>품목</h2>
        <div class="panel-actions">
          <input
            v-model.trim="filters.search"
            class="inline-input"
            type="search"
            placeholder="코드·품명 검색"
            @keyup.enter="loadItems"
          />
          <select v-model="filters.accessLevel" class="inline-input">
            <option value="">전체 등급</option>
            <option value="A">A · 응급·SOP</option>
            <option value="B">B · 교육·승인</option>
            <option value="C">C · RN 제한</option>
          </select>
          <label class="checkbox-field">
            <input
              v-model="filters.lowOnly"
              type="checkbox"
              @change="loadItems"
            />
            <span>부족·만료만</span>
          </label>
          <label class="checkbox-field">
            <input
              v-model="filters.includeInactive"
              type="checkbox"
              @change="loadItems"
            />
            <span>사용중지 포함</span>
          </label>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadItems"
          >
            새로고침
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="isScanning"
            @click="runScan"
          >
            만료 알림 점검
          </button>
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!items.length" class="empty-box">
        조건에 맞는 품목이 없어요.
      </p>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>코드</th>
              <th>품명</th>
              <th>규격</th>
              <th>등급</th>
              <th class="num">현재고</th>
              <th class="num">기준</th>
              <th>가장 빠른 EXP</th>
              <th>상태</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in items"
              :key="item.id"
              :class="{ selected: selectedId === item.id, muted: !item.active }"
            >
              <td class="mono">{{ item.code }}</td>
              <td>{{ item.name }}</td>
              <td class="dim">{{ item.spec || "-" }}</td>
              <td>
                <span class="level-badge" :class="`level-${item.accessLevel}`">
                  {{ item.accessLevel }}
                </span>
              </td>
              <td class="num">
                {{ item.qty }}{{ item.unit }}
                <span v-if="item.lotCount > 1" class="dim">
                  ({{ item.lotCount }}개 로트)
                </span>
              </td>
              <td class="num dim">
                {{ item.baselineQty }}
                <span v-if="item.minQty > 0"> / 최소 {{ item.minQty }}</span>
              </td>
              <td>
                <span v-if="item.expiresOn">
                  유효기간 {{ formatArcDate(item.expiresOn) }}
                  <span class="dim">({{ item.daysLeft }}일)</span>
                </span>
                <span v-else class="dim">-</span>
              </td>
              <td>
                <span v-if="!item.active" class="status-badge tone-muted"
                  >사용중지</span
                >
                <span
                  v-else-if="item.openedOverdue"
                  class="status-badge tone-critical"
                  >개봉기한 초과</span
                >
                <span
                  v-else-if="item.daysLeft !== null && item.daysLeft < 0"
                  class="status-badge tone-critical"
                  >유효기간 지남</span
                >
                <span
                  v-else-if="item.lowStock || item.belowBaseline"
                  class="status-badge tone-warn"
                  >보충 필요<span v-if="item.suggestedOrderQty > 0" class="dim">
                    (+{{ item.suggestedOrderQty }}{{ item.unit }})</span
                  ></span
                >
                <span
                  v-else-if="item.daysLeft !== null && item.daysLeft <= 30"
                  class="status-badge tone-warn"
                  >만료 임박</span
                >
                <span v-else class="status-badge tone-ok">정상</span>
              </td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="text-button"
                    @click="openItem(item)"
                  >
                    이력
                  </button>
                  <button
                    v-if="canStock"
                    type="button"
                    class="text-button"
                    @click="openMove(item, 'IN')"
                  >
                    입고
                  </button>
                  <button
                    v-if="canStock"
                    type="button"
                    class="text-button"
                    @click="openMove(item, 'OUT')"
                  >
                    사용
                  </button>
                  <button
                    v-if="canStock && !item.isDevice"
                    type="button"
                    class="text-button"
                    @click="openMove(item, 'OPEN')"
                  >
                    개봉
                  </button>
                  <button
                    v-if="canStock"
                    type="button"
                    class="text-button danger"
                    @click="openMove(item, 'DISPOSE')"
                  >
                    폐기
                  </button>
                  <button
                    v-if="canStock"
                    type="button"
                    class="text-button"
                    @click="openEdit(item)"
                  >
                    수정
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="activeItem" class="panel">
      <div class="panel-head">
        <h2>
          {{ activeItem.code }} {{ activeItem.name }}
          <span class="dim">이력</span>
        </h2>
        <button type="button" class="preset-button" @click="closeItem">
          닫기
        </button>
      </div>

      <h3 class="sub-title">로트</h3>
      <p v-if="!lots.length" class="empty-box">로트가 없어요.</p>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>로트</th>
            <th class="num">수량</th>
            <th>유효기간</th>
            <th>개봉</th>
            <th>개봉 후 사용기한</th>
            <th>폐기</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="lot in lots" :key="lot.id">
            <td class="mono">{{ lot.lotNo || "-" }}</td>
            <td class="num">{{ lot.qty }}</td>
            <td>
              <span v-if="lot.expiresOn">
                {{ formatArcDate(lot.expiresOn) }}
                <span class="dim">({{ lot.daysLeft }}일)</span>
              </span>
              <span v-else class="dim">-</span>
            </td>
            <td>{{ lot.openedAt ? formatArcDateTime(lot.openedAt) : "-" }}</td>
            <td>
              <span v-if="lot.useByAt" :class="{ critical: lot.useByOverdue }">
                {{ formatArcDateTime(lot.useByAt) }}
              </span>
              <span v-else class="dim">-</span>
            </td>
            <td>
              <span v-if="lot.disposedAt" class="dim">
                {{ formatArcDateTime(lot.disposedAt) }}
              </span>
              <span v-else class="dim">-</span>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 class="sub-title">최근 수불</h3>
      <p v-if="!moves.length" class="empty-box">수불 기록이 없어요.</p>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>일시</th>
            <th>구분</th>
            <th class="num">수량</th>
            <th>사유</th>
            <th>기록자</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="move in moves" :key="move.id">
            <td>{{ formatArcDateTime(move.createdAt) }}</td>
            <td>{{ ARC_MOVE_KIND_LABELS[move.kind] || move.kind }}</td>
            <td class="num">{{ move.qty > 0 ? `+${move.qty}` : move.qty }}</td>
            <td class="dim">{{ move.reason || "-" }}</td>
            <td class="dim">{{ move.employeeName || "-" }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="moveForm.open" class="panel">
      <h2>
        {{ ARC_MOVE_KIND_LABELS[moveForm.kind] }} · {{ moveForm.itemCode }}
        {{ moveForm.itemName }}
      </h2>

      <div class="field-grid">
        <label v-if="moveForm.kind !== 'OPEN'" class="field">
          <span>수량 ({{ moveForm.unit }})</span>
          <input
            v-model.number="moveForm.qty"
            type="number"
            min="0"
            step="0.01"
          />
          <small v-if="moveForm.kind === 'DISPOSE'">
            현재고 {{ moveForm.available }} 까지 폐기할 수 있어요.
          </small>
        </label>

        <label v-if="moveForm.kind === 'IN'" class="field">
          <span>유효기간 (비우면 기존 로트에 합칩니다)</span>
          <input v-model="moveForm.expiresOn" type="date" />
        </label>

        <label v-if="moveForm.kind !== 'OPEN'" class="field wide">
          <span>사유</span>
          <input
            v-model.trim="moveForm.reason"
            type="text"
            placeholder="예: 응급처치 사용, 정기 보충"
          />
        </label>

        <label v-if="moveForm.kind === 'OPEN'" class="field wide">
          <span>메모</span>
          <input
            v-model.trim="moveForm.reason"
            type="text"
            placeholder="예: 현장 사용을 위해 개봉"
          />
          <small>
            개봉 시각이 기록되고, 개봉 후 사용기한이 있는 품목은 기한이 지나면
            알림이 만들어져요.
          </small>
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitMove"
        >
          {{ ARC_MOVE_KIND_LABELS[moveForm.kind] }} 기록
        </button>
        <button
          type="button"
          class="preset-button"
          @click="moveForm.open = false"
        >
          취소
        </button>
      </div>
    </section>

    <section v-if="canStock && editForm.open" class="panel">
      <h2>{{ editForm.id ? "품목 수정" : "품목 추가" }}</h2>

      <div class="field-grid">
        <label class="field">
          <span>코드</span>
          <input
            v-model.trim="editForm.code"
            type="text"
            placeholder="예: IRR-1000"
          />
        </label>
        <label class="field">
          <span>품명</span>
          <input v-model.trim="editForm.name" type="text" />
        </label>
        <label class="field">
          <span>분류</span>
          <input
            v-model.trim="editForm.category"
            type="text"
            placeholder="예: 세정"
          />
        </label>
        <label class="field">
          <span>규격</span>
          <input v-model.trim="editForm.spec" type="text" />
        </label>
        <label class="field">
          <span>단위</span>
          <input v-model.trim="editForm.unit" type="text" placeholder="개" />
        </label>
        <label class="field">
          <span>접근등급</span>
          <select v-model="editForm.accessLevel">
            <option value="A">A · 응급·SOP 승인사용</option>
            <option value="B">B · 교육·승인사용</option>
            <option value="C">C · RN 제한관리</option>
          </select>
        </label>
        <label class="field">
          <span>기준수량</span>
          <input
            v-model.number="editForm.baselineQty"
            type="number"
            min="0"
            step="0.01"
          />
        </label>
        <label class="field">
          <span>재고 알림 기준 (0이면 알림 없음)</span>
          <input
            v-model.number="editForm.minQty"
            type="number"
            min="0"
            step="0.01"
          />
        </label>
        <label class="field">
          <span>보충 주문량 (권장 발주 수량)</span>
          <input
            v-model.number="editForm.reorderQty"
            type="number"
            min="0"
            step="0.01"
          />
        </label>
        <label class="field">
          <span>보관 위치</span>
          <input v-model.trim="editForm.storageLocation" type="text" />
        </label>
        <label class="field">
          <span>소유 구분</span>
          <select v-model="editForm.ownerKind">
            <option value="SHOP">사업장</option>
            <option value="RN">최윤희 RN</option>
            <option value="STAFF">직원 개인</option>
          </select>
        </label>
        <label class="field wide">
          <span>점검 메모</span>
          <input v-model.trim="editForm.checkNote" type="text" />
        </label>
        <label class="field checkbox-field">
          <input v-model="editForm.isDevice" type="checkbox" />
          <span>기기(충전·작동 확인 대상)</span>
        </label>
        <label class="field checkbox-field">
          <input v-model="editForm.active" type="checkbox" />
          <span>사용 중</span>
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitEdit"
        >
          저장
        </button>
        <button
          type="button"
          class="preset-button"
          @click="editForm.open = false"
        >
          취소
        </button>
      </div>
    </section>

    <section v-if="canStock" class="panel">
      <div class="panel-head">
        <h2>품목 마스터</h2>
        <button type="button" class="preset-button" @click="openCreate">
          품목 추가
        </button>
      </div>
      <p class="helper-text">
        마스터를 새로 만들면 재고는 0으로 시작해요. 실제 보충은 '입고'로 기록해
        주세요.
      </p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  ARC_MOVE_KIND_LABELS,
  createArcStockItem,
  fetchArcStock,
  fetchArcStockItem,
  formatArcDate,
  formatArcDateTime,
  recordArcStockMove,
  runArcExpiryScan,
  updateArcStockItem,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";

const items = ref([]);
const summary = ref({});
const lots = ref([]);
const moves = ref([]);
// 등급 표기(A/B/C)는 처음 보는 사람이 가장 많이 헷갈려 하는 부분이라 화면 위에 풀어 씁니다.
const GRADE_LEGEND = [
  {
    key: "A",
    label: "A · 응급·SOP",
    desc: "심정지·질식·대량출혈처럼 즉시 써야 하는 품목이에요.",
    who: "현장에 있는 누구나 바로 사용 가능 (사용 후 즉시 기록)",
  },
  {
    key: "B",
    label: "B · 교육·승인",
    desc: "교육을 이수한 사람이 쓰거나, 사용 전 확인이 필요한 품목이에요.",
    who: "ARC 교육 이수자 · 담당 확인 후 사용",
  },
  {
    key: "C",
    label: "C · RN 제한",
    desc: "판단이 어렵거나 잘못 쓰면 위험한 품목(주사·전문 처치 등)이에요.",
    who: "ARC 대표(RN)만 취급 · 무단 개봉 금지",
  },
];
const activeItem = ref(null);
const isLoading = ref(false);
const isSaving = ref(false);
const isScanning = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const filters = reactive({
  search: "",
  accessLevel: "",
  lowOnly: false,
  includeInactive: false,
});

const moveForm = reactive({
  open: false,
  kind: "IN",
  itemId: "",
  itemCode: "",
  itemName: "",
  unit: "개",
  available: 0,
  qty: 1,
  expiresOn: "",
  reason: "",
});

const editForm = reactive({
  open: false,
  id: "",
  code: "",
  name: "",
  category: "",
  spec: "",
  unit: "개",
  accessLevel: "A",
  baselineQty: 0,
  minQty: 0,
  reorderQty: 0,
  storageLocation: "",
  ownerKind: "SHOP",
  checkNote: "",
  isDevice: false,
  active: true,
});

const canStock = computed(() => hasPermission("arc.stock"));
const selectedId = computed(() => activeItem.value?.id ?? "");

function flash(message) {
  okMessage.value = message;
  errorMessage.value = "";
}

async function loadItems() {
  isLoading.value = true;

  try {
    const data = await fetchArcStock({ ...filters });

    items.value = data.items;
    summary.value = data.summary ?? {};
  } catch (error) {
    errorMessage.value = error?.message || "재고를 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function runScan() {
  isScanning.value = true;

  try {
    const result = await runArcExpiryScan({ force: true });

    flash(
      result?.created
        ? `알림 ${result.created}건을 새로 만들었어요.`
        : "새로 만들 알림이 없어요."
    );
    await loadItems();
  } catch (error) {
    errorMessage.value = error?.message || "만료 점검에 실패했어요.";
  } finally {
    isScanning.value = false;
  }
}

async function openItem(item) {
  try {
    const data = await fetchArcStockItem(item.id);

    activeItem.value = data.item;
    lots.value = data.lots;
    moves.value = data.moves;
  } catch (error) {
    errorMessage.value = error?.message || "이력을 불러오지 못했어요.";
  }
}

function closeItem() {
  activeItem.value = null;
  lots.value = [];
  moves.value = [];
}

function openMove(item, kind) {
  moveForm.open = true;
  moveForm.kind = kind;
  moveForm.itemId = item.id;
  moveForm.itemCode = item.code;
  moveForm.itemName = item.name;
  moveForm.unit = item.unit;
  moveForm.available = item.qty;
  moveForm.qty = kind === "OPEN" ? 0 : 1;
  moveForm.expiresOn = "";
  moveForm.reason = "";
  okMessage.value = "";
  errorMessage.value = "";
}

async function submitMove() {
  isSaving.value = true;

  try {
    await recordArcStockMove({
      kind: moveForm.kind,
      itemId: moveForm.itemId,
      qty: moveForm.kind === "OPEN" ? 0 : moveForm.qty,
      expiresOn: moveForm.kind === "IN" ? moveForm.expiresOn : "",
      reason: moveForm.reason,
    });

    moveForm.open = false;
    flash("수불을 기록했어요.");
    await loadItems();

    if (activeItem.value?.id === moveForm.itemId) {
      await openItem({ id: moveForm.itemId });
    }
  } catch (error) {
    errorMessage.value = error?.message || "수불 기록에 실패했어요.";
  } finally {
    isSaving.value = false;
  }
}

function openCreate() {
  Object.assign(editForm, {
    open: true,
    id: "",
    code: "",
    name: "",
    category: "",
    spec: "",
    unit: "개",
    accessLevel: "A",
    baselineQty: 0,
    minQty: 0,
    reorderQty: 0,
    storageLocation: "",
    ownerKind: "SHOP",
    checkNote: "",
    isDevice: false,
    active: true,
  });
}

function openEdit(item) {
  Object.assign(editForm, {
    open: true,
    id: item.id,
    code: item.code,
    name: item.name,
    category: item.category,
    spec: item.spec,
    unit: item.unit,
    accessLevel: item.accessLevel,
    baselineQty: item.baselineQty,
    minQty: item.minQty,
    reorderQty: item.reorderQty,
    storageLocation: item.storageLocation,
    ownerKind: item.ownerKind,
    checkNote: item.checkNote,
    isDevice: item.isDevice,
    active: item.active,
  });
}

async function submitEdit() {
  isSaving.value = true;

  const payload = {
    code: editForm.code,
    name: editForm.name,
    category: editForm.category,
    spec: editForm.spec,
    unit: editForm.unit,
    accessLevel: editForm.accessLevel,
    baselineQty: editForm.baselineQty,
    minQty: editForm.minQty,
    reorderQty: editForm.reorderQty,
    storageLocation: editForm.storageLocation,
    ownerKind: editForm.ownerKind,
    checkNote: editForm.checkNote,
    isDevice: editForm.isDevice,
    active: editForm.active,
  };

  try {
    if (editForm.id) {
      await updateArcStockItem(editForm.id, payload);
    } else {
      await createArcStockItem(payload);
    }

    editForm.open = false;
    flash("품목 마스터를 저장했어요.");
    await loadItems();
  } catch (error) {
    errorMessage.value = error?.message || "저장에 실패했어요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(loadItems);
</script>

<style scoped lang="scss">
@use "../../scss/_arc-ui" as *;
.admin-arc-stock-view {
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

.grade-legend {
  padding: 14px 16px;
  border: 1px solid rgba(96, 165, 250, 0.36);
  border-radius: 14px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.08) 100%
  );
}

.grade-legend-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;

  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    color: #1e3a8a;
  }
}

.grade-legend-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.64);
}

.grade-legend-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.08);
  }
}

.grade-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  color: #fff;

  &.grade-a {
    background: #dc2626;
  }

  &.grade-b {
    background: #d97706;
  }

  &.grade-c {
    background: #4338ca;
  }
}

.grade-body {
  display: flex;
  flex-direction: column;
  gap: 3px;

  strong {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
  }
}

.grade-desc {
  font-size: 12px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.86);
}

.grade-who {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.64);
}

.grade-note {
  margin: 10px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.64);
}

.data-table {
  th,
  td {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  tr.selected {
    background: rgba(99, 102, 241, 0.14);
  }

  tr.muted {
    opacity: 0.5;
  }

  .num {
    white-space: nowrap;
  }
}

.critical {
  color: #fca5a5;
}

.level-badge {
  display: inline-block;
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}

.level-A {
  background: rgba(52, 211, 153, 0.2);
  color: #6ee7b7;
}

.level-B {
  background: rgba(251, 191, 36, 0.2);
  color: #fcd34d;
}

.level-C {
  background: rgba(248, 113, 113, 0.2);
  color: #fca5a5;
}

.tone-ok {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}

.tone-warn {
  background: rgba(251, 191, 36, 0.16);
  color: #fcd34d;
}

.tone-critical {
  background: rgba(248, 113, 113, 0.18);
  color: #fca5a5;
}

.tone-muted {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
}

.text-button {
  &.danger {
    color: #fca5a5;
  }
}

.sub-title {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.8);
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
