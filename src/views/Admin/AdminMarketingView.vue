<template>
  <div class="admin-marketing-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN MARKETING</p>
        <h1>마케팅</h1>
        <p class="description">
          마케팅 수신에 동의한 회원에게 문자·알림톡을 보냅니다. 손님은 카카오
          가입 없이 휴대폰 번호로만 관리돼요.
        </p>
      </div>
    </header>

    <p v-if="settings.dryRun" class="notice-box">
      검수용 모드예요. 지금은 실제로 발송되지 않고, 누구에게 몇 건 나갈지만
      확인할 수 있어요.
    </p>

    <section class="summary-grid">
      <button
        v-for="segment in segments"
        :key="segment.value"
        type="button"
        class="summary-card"
        :class="{ active: segment.value === selectedSegment }"
        @click="selectSegment(segment.value)"
      >
        <span class="summary-label">{{ segment.label }}</span>
        <strong>{{ formatNumber(segment.count) }}명</strong>
        <span class="summary-hint">{{ segment.description }}</span>
      </button>
    </section>

    <section class="composer-section">
      <div class="section-head">
        <div>
          <h2>보낼 내용 작성</h2>
          <p class="description">
            <code>#{이름}</code> · <code>#{포인트}</code> 를 넣으면 회원별
            값으로 바뀌어 발송돼요.
          </p>
        </div>
        <button
          type="button"
          class="preset-button"
          :disabled="isExporting"
          @click="downloadAudienceCsv"
        >
          명단 CSV 받기
        </button>
      </div>

      <div class="filter-grid">
        <div class="filter-group">
          <label for="campaignSegment">발송 대상</label>
          <select id="campaignSegment" v-model="form.segment">
            <option
              v-for="segment in segments"
              :key="segment.value"
              :value="segment.value"
            >
              {{ segment.label }} ({{ formatNumber(segment.count) }}명)
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label for="campaignChannel">발송 방식</label>
          <select id="campaignChannel" v-model="form.channel">
            <option
              v-for="channel in settings.channels"
              :key="channel.value"
              :value="channel.value"
            >
              {{ channel.label }}
            </option>
          </select>
        </div>

        <div class="filter-group wide">
          <label for="campaignTitle">제목 (관리용)</label>
          <input
            id="campaignTitle"
            v-model="form.title"
            type="text"
            :maxlength="settings.maxTitle"
            placeholder="예: 12월 재방문 감사 쿠폰 안내"
          />
        </div>
      </div>

      <div class="filter-group wide">
        <label for="campaignBody">내용</label>
        <textarea
          id="campaignBody"
          v-model="form.body"
          rows="6"
          :maxlength="settings.maxBody"
          placeholder="예: #{이름}님, 그동안 1,000P 넘게 모으셨어요. 이번 주에 오시면 바로 사용하실 수 있어요."
        ></textarea>
        <span class="counter">
          {{ form.body.length }} / {{ settings.maxBody }}자
        </span>
      </div>

      <p v-if="audienceError" class="error-box">{{ audienceError }}</p>

      <div class="audience-box">
        <div class="audience-head">
          <strong>{{ audience.segmentLabel || "발송 대상" }}</strong>
          <span>받는 사람 {{ formatNumber(audience.total) }}명</span>
          <button
            type="button"
            class="link-button"
            :disabled="isLoadingAudience"
            @click="loadAudience"
          >
            미리보기 새로고침
          </button>
        </div>

        <p v-if="audience.total === 0" class="empty-inline">
          이 조건에 해당하는 동의 회원이 없어요.
        </p>

        <ul v-else class="audience-list">
          <li v-for="row in audience.sample" :key="row.id">
            <span>{{ row.phoneText }}</span>
            <span>{{ row.name || "이름 없음" }}</span>
            <span>방문 {{ formatNumber(row.visitCount) }}회</span>
            <span>{{ formatNumber(row.balance) }}P</span>
          </li>
        </ul>
      </div>

      <div class="filter-actions">
        <button
          type="button"
          class="preset-button primary"
          :disabled="isSaving || !canManage"
          @click="saveCampaign"
        >
          {{ isSaving ? "저장 중..." : "발송 목록에 저장" }}
        </button>
        <span v-if="!canManage" class="hint-text">
          실제 발송은 사장 권한만 할 수 있어요.
        </span>
        <span v-else class="hint-text">
          저장만으로는 발송되지 않아요. 아래 목록에서 발송을 눌러 주세요.
        </span>
      </div>

      <p v-if="formMessage" class="success-box">{{ formMessage }}</p>
      <p v-if="formError" class="error-box">{{ formError }}</p>
    </section>

    <section class="list-section">
      <div class="section-head">
        <div>
          <h2>발송 목록</h2>
          <p class="description">저장한 캠페인을 확인하고 발송·재발송합니다.</p>
        </div>
        <button
          type="button"
          class="preset-button"
          :disabled="isLoadingCampaigns"
          @click="loadCampaigns"
        >
          새로고침
        </button>
      </div>

      <p v-if="listError" class="error-box">{{ listError }}</p>

      <div v-if="isLoadingCampaigns" class="empty-box">
        <p>발송 목록을 불러오는 중이에요.</p>
      </div>

      <div v-else-if="campaigns.length === 0" class="empty-box">
        <p>아직 저장한 캠페인이 없어요.</p>
      </div>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>제목</th>
              <th>대상</th>
              <th>방식</th>
              <th>상태</th>
              <th>대상 / 성공 / 실패</th>
              <th>작성</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="campaign in campaigns" :key="campaign.id">
              <td class="strong-cell">{{ campaign.title }}</td>
              <td>{{ campaign.segmentLabel }}</td>
              <td>{{ campaign.channelLabel }}</td>
              <td>
                <span
                  class="status-chip"
                  :class="campaign.status.toLowerCase()"
                >
                  {{ statusLabel(campaign.status) }}
                </span>
              </td>
              <td>
                {{ formatNumber(campaign.targetCount) }} /
                {{ formatNumber(campaign.sentCount) }} /
                {{ formatNumber(campaign.failedCount) }}
              </td>
              <td>
                {{ formatDateTime(campaign.createdAt) }}
                <span class="sub-text">{{ campaign.createdByName }}</span>
              </td>
              <td class="action-cell">
                <button
                  type="button"
                  class="link-button"
                  @click="openCampaign(campaign.id)"
                >
                  상세
                </button>
                <button
                  v-if="campaign.status === 'DRAFT'"
                  type="button"
                  class="link-button"
                  :disabled="!canManage || isSending"
                  @click="sendCampaignNow(campaign)"
                >
                  발송
                </button>
                <button
                  v-else
                  type="button"
                  class="link-button"
                  :disabled="!canManage || isSending"
                  @click="retryCampaignNow(campaign)"
                >
                  재발송
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="detail.campaign" class="detail-section">
      <div class="section-head">
        <div>
          <h2>{{ detail.campaign.title }}</h2>
          <p class="description">
            {{ detail.campaign.segmentLabel }} · 대상
            {{ formatNumber(detail.campaign.targetCount) }}명 ·
            {{ detail.campaign.provider }}
          </p>
        </div>
        <button type="button" class="preset-button" @click="closeDetail">
          닫기
        </button>
      </div>

      <p v-if="detail.campaign.providerNote" class="notice-box small">
        {{ detail.campaign.providerNote }}
      </p>

      <pre class="body-preview">{{ detail.campaign.body }}</pre>

      <div v-if="detail.logs.length === 0" class="empty-box">
        <p>아직 발송 기록이 없어요.</p>
      </div>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>받는 번호</th>
              <th>이름</th>
              <th>상태</th>
              <th>시도</th>
              <th>발송 시각</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in detail.logs" :key="log.id">
              <td>{{ log.phoneText }}</td>
              <td>{{ log.name || "-" }}</td>
              <td>{{ logStatusLabel(log.status) }}</td>
              <td>{{ log.attempts }}</td>
              <td>{{ formatDateTime(log.sentAt) }}</td>
              <td class="error-text">{{ log.error }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";

import {
  createCampaign,
  exportAudienceCsv,
  fetchAudience,
  fetchCampaign,
  fetchCampaigns,
  fetchMarketingSettings,
  fetchSegments,
  formatDateTime,
  formatNumber,
  LOG_STATUS_LABELS,
  retryCampaign,
  sendCampaign,
  CAMPAIGN_STATUS_LABELS,
} from "@/lib/marketing";
import { hasPermission } from "@/lib/staffAuth";

const canManage = computed(() => hasPermission("marketing.manage"));

const settings = ref({
  dryRun: true,
  channels: [],
  segments: [],
  maxTitle: 60,
  maxBody: 1000,
});

const segments = ref([]);
const selectedSegment = ref("CONSENTED");

const form = ref({
  title: "",
  body: "",
  channel: "SMS",
  segment: "CONSENTED",
});

const audience = ref({ segmentLabel: "", total: 0, sample: [] });
const audienceError = ref("");
const isLoadingAudience = ref(false);

const campaigns = ref([]);
const isLoadingCampaigns = ref(false);
const listError = ref("");

const detail = ref({ campaign: null, logs: [] });
const isSaving = ref(false);
const isSending = ref(false);
const isExporting = ref(false);
const formMessage = ref("");
const formError = ref("");

function statusLabel(status) {
  return CAMPAIGN_STATUS_LABELS[status] || status;
}

function logStatusLabel(status) {
  return LOG_STATUS_LABELS[status] || status;
}

async function loadSettings() {
  try {
    const result = await fetchMarketingSettings();

    settings.value = {
      dryRun: Boolean(result?.dryRun),
      channels: Array.isArray(result?.channels) ? result.channels : [],
      segments: Array.isArray(result?.segments) ? result.segments : [],
      maxTitle: Number(result?.maxTitle || 60),
      maxBody: Number(result?.maxBody || 1000),
    };

    if (settings.value.channels.length > 0) {
      form.value.channel = settings.value.channels[0].value;
    }
  } catch (error) {
    console.error("마케팅 설정 조회 실패:", error);
    formError.value = error?.message || "마케팅 설정을 불러오지 못했어요.";
  }
}

async function loadSegments() {
  try {
    const result = await fetchSegments();
    const list = Array.isArray(result?.segments) ? result.segments : [];

    segments.value = list;

    if (
      list.length > 0 &&
      !list.some((row) => row.value === form.value.segment)
    ) {
      form.value.segment = list[0].value;
    }
  } catch (error) {
    console.error("발송 대상 집계 실패:", error);
    audienceError.value = error?.message || "발송 대상을 불러오지 못했어요.";
  }
}

async function loadAudience() {
  isLoadingAudience.value = true;
  audienceError.value = "";

  try {
    const result = await fetchAudience(form.value.segment);

    audience.value = {
      segmentLabel: result?.segmentLabel || "",
      total: Number(result?.total || 0),
      sample: Array.isArray(result?.sample) ? result.sample : [],
    };
    selectedSegment.value = form.value.segment;
  } catch (error) {
    console.error("발송 대상 미리보기 실패:", error);
    audienceError.value = error?.message || "발송 대상을 불러오지 못했어요.";
    audience.value = { segmentLabel: "", total: 0, sample: [] };
  } finally {
    isLoadingAudience.value = false;
  }
}

function selectSegment(value) {
  form.value.segment = value;
  loadAudience();
}

async function loadCampaigns() {
  isLoadingCampaigns.value = true;
  listError.value = "";

  try {
    const result = await fetchCampaigns({ limit: 30 });

    campaigns.value = Array.isArray(result?.campaigns) ? result.campaigns : [];
  } catch (error) {
    console.error("캠페인 목록 조회 실패:", error);
    listError.value = error?.message || "발송 목록을 불러오지 못했어요.";
    campaigns.value = [];
  } finally {
    isLoadingCampaigns.value = false;
  }
}

async function saveCampaign() {
  isSaving.value = true;
  formMessage.value = "";
  formError.value = "";

  try {
    const created = await createCampaign({
      title: form.value.title.trim(),
      body: form.value.body.trim(),
      channel: form.value.channel,
      segment: form.value.segment,
    });

    formMessage.value = `"${
      created.title
    }" 캠페인을 저장했어요. 대상 ${formatNumber(
      created.targetCount
    )}명 — 아래 목록에서 발송해 주세요.`;
    form.value.title = "";
    form.value.body = "";
    await Promise.all([loadCampaigns(), loadSegments()]);
  } catch (error) {
    console.error("캠페인 저장 실패:", error);
    formError.value = error?.message || "캠페인을 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function sendCampaignNow(campaign) {
  const confirmed = window.confirm(
    `"${campaign.title}" 을(를) ${formatNumber(
      campaign.targetCount
    )}명에게 발송할까요? 발송한 문자는 취소할 수 없어요.`
  );

  if (!confirmed) return;

  isSending.value = true;
  formMessage.value = "";
  formError.value = "";

  try {
    const result = await sendCampaign(campaign.id);

    formMessage.value = `발송 완료 — 성공 ${formatNumber(
      result?.sent
    )}건, 실패 ${formatNumber(result?.failed)}건`;
    await Promise.all([
      loadCampaigns(),
      loadSegments(),
      openCampaign(campaign.id),
    ]);
  } catch (error) {
    console.error("캠페인 발송 실패:", error);
    formError.value = error?.message || "캠페인을 발송하지 못했어요.";
  } finally {
    isSending.value = false;
  }
}

async function retryCampaignNow(campaign) {
  const confirmed = window.confirm(
    `"${campaign.title}" 의 실패·대기 건만 다시 발송할까요?`
  );

  if (!confirmed) return;

  isSending.value = true;
  formMessage.value = "";
  formError.value = "";

  try {
    const result = await retryCampaign(campaign.id);

    formMessage.value = `재발송 완료 — 성공 ${formatNumber(
      result?.sent
    )}건, 실패 ${formatNumber(result?.failed)}건`;
    await Promise.all([loadCampaigns(), openCampaign(campaign.id)]);
  } catch (error) {
    console.error("캠페인 재발송 실패:", error);
    formError.value = error?.message || "캠페인을 재발송하지 못했어요.";
  } finally {
    isSending.value = false;
  }
}

async function openCampaign(campaignId) {
  try {
    const result = await fetchCampaign(campaignId);

    detail.value = {
      campaign: result?.campaign || null,
      logs: Array.isArray(result?.logs) ? result.logs : [],
    };
  } catch (error) {
    console.error("캠페인 상세 조회 실패:", error);
    listError.value = error?.message || "캠페인 상세를 불러오지 못했어요.";
  }
}

function closeDetail() {
  detail.value = { campaign: null, logs: [] };
}

async function downloadAudienceCsv() {
  isExporting.value = true;
  formError.value = "";

  try {
    const csv = await exportAudienceCsv(form.value.segment);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `honjaya-audience-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("명단 내려받기 실패:", error);
    formError.value = error?.message || "명단을 내려받지 못했어요.";
  } finally {
    isExporting.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadSegments()]);
  await Promise.all([loadAudience(), loadCampaigns()]);
});
</script>

<style scoped lang="scss">
.admin-marketing-view {
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
.notice-box {
  margin: 0;
  padding: 12px 16px;
  border-radius: 14px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  color: #3730a3;
  font-size: 13px;
  font-weight: 700;
}
.notice-box.small {
  margin-bottom: 12px;
  font-weight: 600;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.summary-card.active {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}
.summary-label {
  font-size: 12px;
  font-weight: 700;
  color: #6366f1;
}
.summary-card strong {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
}
.summary-hint {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}
.composer-section,
.list-section,
.detail-section {
  padding: 18px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.section-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}
.section-head h2 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
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
  grid-column: 1 / -1;
}
.filter-group label {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}
.filter-group input,
.filter-group select,
.filter-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  color: #0f172a;
  background: #fff;
}
.filter-group textarea {
  resize: vertical;
  line-height: 1.6;
}
.counter {
  align-self: flex-end;
  font-size: 12px;
  color: #94a3b8;
}
.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 14px;
}
.preset-button {
  padding: 9px 16px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.preset-button.primary {
  border-color: #4f46e5;
  background: #4f46e5;
  color: #fff;
}
.preset-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hint-text {
  font-size: 12px;
  color: #94a3b8;
}
.audience-box {
  margin-top: 14px;
  padding: 14px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.audience-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #475569;
}
.audience-head strong {
  font-size: 14px;
  color: #0f172a;
}
.audience-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.audience-list li {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr 0.8fr;
  gap: 8px;
  font-size: 13px;
  color: #475569;
}
.empty-inline {
  margin: 10px 0 0;
  font-size: 13px;
  color: #94a3b8;
}
.link-button {
  padding: 0;
  border: none;
  background: none;
  color: #4f46e5;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.link-button:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
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
  padding: 10px 8px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  vertical-align: top;
  color: #334155;
}
.data-table th {
  font-size: 12px;
  font-weight: 800;
  color: #64748b;
  white-space: nowrap;
}
.strong-cell {
  font-weight: 700;
  color: #0f172a;
}
.sub-text {
  display: block;
  font-size: 11px;
  color: #94a3b8;
}
.action-cell {
  display: flex;
  gap: 10px;
  white-space: nowrap;
}
.status-chip {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  background: #f1f5f9;
  color: #475569;
}
.status-chip.sent {
  background: #dcfce7;
  color: #15803d;
}
.status-chip.draft {
  background: #fef3c7;
  color: #b45309;
}
.body-preview {
  margin: 0 0 14px;
  padding: 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 13px;
  color: #0f172a;
  white-space: pre-wrap;
  font-family: inherit;
}
.error-text {
  color: #dc2626;
  font-size: 12px;
}
.error-box,
.success-box,
.empty-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
}
.error-box {
  background: #fef2f2;
  color: #b91c1c;
}
.success-box {
  background: #ecfdf5;
  color: #047857;
  margin-top: 12px;
}
.empty-box {
  background: #f8fafc;
  color: #94a3b8;
  text-align: center;
}
code {
  padding: 1px 5px;
  border-radius: 6px;
  background: #f1f5f9;
  font-size: 12px;
  color: #4f46e5;
}
</style>
