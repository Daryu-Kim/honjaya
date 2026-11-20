<template>
  <div class="admin-customer-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN CUSTOMERS</p>
        <h1>고객 관리</h1>
        <p class="description">
          전화번호로 손님을 찾아 방문 이력·누적 결제·보유 포인트를 확인하고,
          메모와 마케팅 수신 동의를 관리할 수 있어요.
        </p>
      </div>
    </header>

    <section class="filter-section">
      <div class="filter-card">
        <div class="filter-grid">
          <div class="filter-group wide">
            <label for="customerQuery">전화번호 또는 이름</label>
            <input
              id="customerQuery"
              v-model="queryInput"
              type="search"
              maxlength="30"
              placeholder="010-0000-0000 또는 홍길동"
              @keyup.enter="applyFilters"
            />
          </div>

          <div class="filter-group">
            <label for="customerConsent">마케팅 동의</label>
            <select id="customerConsent" v-model="consentFilter">
              <option
                v-for="option in consentFilters"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>

          <div class="filter-group">
            <label for="customerSort">정렬</label>
            <select id="customerSort" v-model="sortOption">
              <option
                v-for="option in sortOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="filter-actions">
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="applyFilters"
          >
            조회
          </button>
          <button type="button" class="preset-button" @click="resetFilters">
            조건 초기화
          </button>
        </div>
      </div>
    </section>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">전체 고객</span>
        <strong>{{ summary.total.toLocaleString("ko-KR") }}명</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">마케팅 동의</span>
        <strong>{{ summary.consented.toLocaleString("ko-KR") }}명</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">미사용 포인트(전체)</span>
        <strong>{{ formatPointValue(summary.liability) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">조회 결과</span>
        <strong>{{ total.toLocaleString("ko-KR") }}명</strong>
      </article>
    </section>

    <section class="list-section">
      <div class="section-head">
        <div>
          <h2>고객 목록</h2>
          <p class="description">
            행을 누르면 방문 이력과 메모를 볼 수 있어요.
          </p>
        </div>
        <button
          type="button"
          class="preset-button"
          :disabled="isLoading"
          @click="loadCustomers"
        >
          새로고침
        </button>
      </div>

      <p v-if="listError" class="error-box">{{ listError }}</p>

      <div v-if="isLoading" class="empty-box">
        <p>고객 목록을 불러오는 중이에요.</p>
      </div>

      <div v-else-if="customers.length === 0" class="empty-box">
        <p>조건에 맞는 고객이 없어요.</p>
      </div>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>전화번호</th>
              <th>고객명</th>
              <th>마케팅 동의</th>
              <th>보유 포인트</th>
              <th>방문</th>
              <th>누적 결제</th>
              <th>최근 방문</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="customer in customers"
              :key="customer.id"
              class="clickable-row"
              :class="{ selected: customer.id === selectedId }"
              @click="selectCustomer(customer.id)"
            >
              <td>{{ customer.phoneText || customer.phone }}</td>
              <td>
                {{ customer.name || "미등록" }}
                <span v-if="customer.nickname" class="sub-text">
                  {{ customer.nickname }}
                </span>
              </td>
              <td>
                <span
                  class="badge"
                  :class="customer.marketingConsent ? 'badge-on' : 'badge-off'"
                >
                  {{ customer.marketingConsent ? "동의" : "미동의" }}
                </span>
              </td>
              <td>{{ formatPointValue(customer.balance) }}</td>
              <td>{{ customer.visitCount }}회</td>
              <td>{{ formatWon(customer.paidTotal) }}</td>
              <td>{{ formatVisitDate(customer.lastVisitAt) }}</td>
              <td class="memo-cell">{{ customer.memo || "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="selectedId" class="detail-section">
      <div class="section-head">
        <div>
          <h2>
            {{ profile.customer?.name || "미등록 고객" }}
            <span class="sub-text">{{ profile.customer?.phoneText }}</span>
          </h2>
          <p class="description">
            최근 방문 {{ visits.length }}건을 보여 줍니다.
          </p>
        </div>
        <div class="head-actions">
          <button type="button" class="preset-button" @click="goToPoints">
            포인트 관리에서 보기
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoadingProfile"
            @click="loadProfile(selectedId)"
          >
            새로고침
          </button>
        </div>
      </div>

      <p v-if="profileError" class="error-box">{{ profileError }}</p>
      <p v-if="saveMessage" class="success-box">{{ saveMessage }}</p>

      <div v-if="isLoadingProfile" class="empty-box">
        <p>고객 정보를 불러오는 중이에요.</p>
      </div>

      <template v-else-if="profile.customer">
        <div class="summary-grid detail-summary">
          <article class="summary-card">
            <span class="summary-label">보유 포인트</span>
            <strong>{{ formatPointValue(profile.customer.balance) }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label">방문 횟수</span>
            <strong>{{ profile.customer.visitCount }}회</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label">누적 결제</span>
            <strong>{{ formatWon(profile.customer.paidTotal) }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label">최근 방문</span>
            <strong>{{ formatVisitDate(profile.customer.lastVisitAt) }}</strong>
          </article>
        </div>

        <div class="consent-row">
          <div>
            <strong>마케팅 수신 동의</strong>
            <p class="description">
              {{ consentDescription }}
            </p>
          </div>
          <button
            type="button"
            class="preset-button"
            :class="profile.customer.marketingConsent ? 'danger' : 'primary'"
            :disabled="isSaving"
            @click="toggleConsent"
          >
            {{
              profile.customer.marketingConsent ? "동의 철회" : "동의로 변경"
            }}
          </button>
        </div>

        <form class="edit-form" @submit.prevent="saveProfile">
          <h3>고객 정보 수정</h3>
          <div class="filter-grid">
            <div class="filter-group">
              <label for="customerName">고객명</label>
              <input
                id="customerName"
                v-model="editForm.name"
                type="text"
                maxlength="30"
                placeholder="예: 김혼자"
              />
            </div>
            <div class="filter-group">
              <label for="customerNickname">닉네임</label>
              <input
                id="customerNickname"
                v-model="editForm.nickname"
                type="text"
                maxlength="30"
                placeholder="선택 입력"
              />
            </div>
            <div class="filter-group wide">
              <label for="customerMemo">메모</label>
              <input
                id="customerMemo"
                v-model="editForm.memo"
                type="text"
                maxlength="200"
                placeholder="예: 매운 안주 선호, 단골"
              />
            </div>
          </div>
          <div class="filter-actions">
            <button
              type="submit"
              class="preset-button primary"
              :disabled="isSaving"
            >
              저장
            </button>
          </div>
        </form>

        <div class="visit-block">
          <h3>방문 이력</h3>
          <div v-if="visits.length === 0" class="empty-box">
            <p>아직 결제 기록이 없어요.</p>
          </div>
          <div v-else class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>테이블</th>
                  <th>주문서</th>
                  <th>결제 금액</th>
                  <th>환불</th>
                  <th>수단</th>
                  <th>처리자</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="visit in visits" :key="visit.id">
                  <td>{{ formatVisitDateTime(visit.occurredAt) }}</td>
                  <td>{{ visit.tableNumber || "-" }}</td>
                  <td>{{ visit.orderSheetId || "-" }}</td>
                  <td>{{ formatWon(visit.amount) }}</td>
                  <td>
                    {{
                      visit.refundedAmount
                        ? formatWon(visit.refundedAmount)
                        : "-"
                    }}
                  </td>
                  <td>{{ paymentMethodLabel(visit.method) }}</td>
                  <td>{{ visit.employeeName || "-" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  CONSENT_FILTERS,
  CUSTOMER_SORTS,
  fetchCustomerList,
  fetchCustomerProfile,
  formatVisitDate,
  formatVisitDateTime,
  formatWon,
  updateCustomerProfile,
} from "@/lib/crm";
import { formatPointValue } from "@/lib/points";
import { getPaymentMethodLabel } from "@/lib/payments";

const route = useRoute();
const router = useRouter();

const consentFilters = CONSENT_FILTERS;
const sortOptions = CUSTOMER_SORTS;

const queryInput = ref("");
const consentFilter = ref("");
const sortOption = ref("recent");

const isLoading = ref(false);
const listError = ref("");
const customers = ref([]);
const total = ref(0);
const summary = ref({ total: 0, consented: 0, liability: 0 });

const selectedId = ref("");
const isLoadingProfile = ref(false);
const profileError = ref("");
const saveMessage = ref("");
const isSaving = ref(false);
const profile = ref({ customer: null, visits: [] });
const editForm = ref({ name: "", nickname: "", memo: "" });

const visits = computed(() =>
  Array.isArray(profile.value.visits) ? profile.value.visits : []
);

const consentDescription = computed(() => {
  const customer = profile.value.customer;

  if (!customer) return "";
  if (!customer.marketingConsent) return "아직 동의를 받지 않았어요.";

  return `동의 시각 ${formatVisitDateTime(customer.marketingConsentAt)}`;
});

function paymentMethodLabel(method) {
  return getPaymentMethodLabel(method);
}

async function loadCustomers() {
  isLoading.value = true;
  listError.value = "";

  try {
    const result = await fetchCustomerList({
      q: queryInput.value.trim(),
      consent: consentFilter.value,
      sort: sortOption.value,
      limit: 100,
    });

    customers.value = Array.isArray(result?.customers) ? result.customers : [];
    total.value = Number(result?.total || 0);
    summary.value = {
      total: Number(result?.summary?.total || 0),
      consented: Number(result?.summary?.consented || 0),
      liability: Number(result?.summary?.liability || 0),
    };
  } catch (error) {
    console.error("고객 목록 조회 실패:", error);
    listError.value = error?.message || "고객 목록을 불러오지 못했어요.";
    customers.value = [];
    total.value = 0;
  } finally {
    isLoading.value = false;
  }
}

function syncEditForm(customer) {
  editForm.value = {
    name: customer?.name || "",
    nickname: customer?.nickname || "",
    memo: customer?.memo || "",
  };
}

async function loadProfile(customerId) {
  if (!customerId) return;

  isLoadingProfile.value = true;
  profileError.value = "";

  try {
    const result = await fetchCustomerProfile(customerId, { visitLimit: 20 });

    profile.value = {
      customer: result?.customer || null,
      visits: Array.isArray(result?.visits) ? result.visits : [],
    };
    selectedId.value = customerId;
    syncEditForm(result?.customer);
  } catch (error) {
    console.error("고객 정보 조회 실패:", error);
    profileError.value = error?.message || "고객 정보를 불러오지 못했어요.";
    profile.value = { customer: null, visits: [] };
  } finally {
    isLoadingProfile.value = false;
  }
}

function selectCustomer(customerId) {
  if (customerId === selectedId.value) return;

  saveMessage.value = "";
  loadProfile(customerId);
}

function applyFilters() {
  loadCustomers();
}

function resetFilters() {
  queryInput.value = "";
  consentFilter.value = "";
  sortOption.value = "recent";
  loadCustomers();
}

async function saveProfile() {
  const customer = profile.value.customer;

  if (!customer) return;

  isSaving.value = true;
  saveMessage.value = "";
  profileError.value = "";

  try {
    const result = await updateCustomerProfile(customer.id, {
      name: editForm.value.name.trim(),
      nickname: editForm.value.nickname.trim(),
      memo: editForm.value.memo.trim(),
    });

    profile.value = {
      customer: result?.customer || customer,
      visits: Array.isArray(result?.visits) ? result.visits : visits.value,
    };
    syncEditForm(result?.customer);
    saveMessage.value = "고객 정보를 저장했어요.";
    await loadCustomers();
  } catch (error) {
    console.error("고객 정보 저장 실패:", error);
    profileError.value = error?.message || "고객 정보를 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function toggleConsent() {
  const customer = profile.value.customer;

  if (!customer) return;

  const nextConsent = !customer.marketingConsent;
  const label = nextConsent ? "동의로 변경" : "동의 철회";
  const confirmed = window.confirm(
    `${customer.phoneText || customer.phone} 고객을 마케팅 수신 ${label}할까요?`
  );

  if (!confirmed) return;

  isSaving.value = true;
  saveMessage.value = "";
  profileError.value = "";

  try {
    const result = await updateCustomerProfile(customer.id, {
      marketingConsent: nextConsent,
    });

    profile.value = {
      customer: result?.customer || customer,
      visits: Array.isArray(result?.visits) ? result.visits : visits.value,
    };
    saveMessage.value = nextConsent
      ? "마케팅 수신 동의로 저장했어요."
      : "마케팅 수신 동의를 철회했어요.";
    await loadCustomers();
  } catch (error) {
    console.error("마케팅 동의 변경 실패:", error);
    profileError.value = error?.message || "마케팅 동의를 변경하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

function goToPoints() {
  const customer = profile.value.customer;

  if (!customer) return;

  router.push({
    path: "/admin/points",
    query: { phone: customer.phoneText || customer.phone },
  });
}

onMounted(async () => {
  const phoneQuery = String(route.query.phone || "");

  if (phoneQuery) {
    queryInput.value = phoneQuery;
  }

  await loadCustomers();

  if (phoneQuery && customers.value.length === 1) {
    await loadProfile(customers.value[0].id);
  }
});
</script>

<style scoped lang="scss">
.admin-customer-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background: #f8fafc;
  min-height: 100vh;
}
.page-header .eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #6366f1;
}
.page-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
  color: #0f172a;
}
.description {
  margin: 0;
  font-size: 14px;
  color: #64748b;
}
.filter-card,
.list-section,
.detail-section {
  padding: 18px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.filter-grid {
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
  color: #475569;
}
.filter-group input,
.filter-group select {
  height: 40px;
  padding: 0 12px;
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
  color: #0f172a;
}
.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.preset-button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.preset-button.primary {
  background: #4338ca;
  color: #fff;
}
.preset-button.danger {
  background: #fee2e2;
  color: #b91c1c;
}
.preset-button:disabled {
  opacity: 0.6;
  cursor: default;
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
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.summary-label {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}
.summary-card strong {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.section-head h2 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.table-wrap {
  overflow-x: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th,
.data-table td {
  padding: 10px 12px;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid #e2e8f0;
}
.data-table th {
  font-size: 12px;
  font-weight: 800;
  color: #475569;
  background: #f8fafc;
}
.clickable-row {
  cursor: pointer;
}
.clickable-row:hover {
  background: #f8fafc;
}
.clickable-row.selected {
  background: #eef2ff;
}
.memo-cell {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub-text {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}
.badge-on {
  background: #dcfce7;
  color: #047857;
}
.badge-off {
  background: #f1f5f9;
  color: #64748b;
}
.detail-summary {
  margin-top: 4px;
}
.consent-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #f8fafc;
}
.consent-row strong {
  font-size: 14px;
  color: #0f172a;
}
.edit-form {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed #cbd5f5;
}
.edit-form h3,
.visit-block h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}
.visit-block {
  margin-top: 18px;
}
.error-box {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
  font-weight: 700;
}
.success-box {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #047857;
  font-size: 13px;
  font-weight: 700;
}
.empty-box {
  padding: 28px 16px;
  border-radius: 14px;
  background: #f8fafc;
  text-align: center;
  color: #64748b;
  font-size: 14px;
}
</style>
