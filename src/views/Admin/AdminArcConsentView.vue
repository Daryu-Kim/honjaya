<template>
  <div class="admin-arc-consent-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>동의서 관리</h1>
        <p class="description">
          응급처치 뒤에 상세 건강기록(AS-CARE)을 남기려면 어떤 동의서를 받아야
          하는지, 서명 뒤 무엇을 확인해야 하는지 이 화면에서 안내해요. 종이
          동의서에 서명을 받은 뒤 직원이 '동의 확인'을 누르면 효력이 생겨요.
        </p>
      </div>
      <router-link to="/admin/arc" class="link-button">
        응급안전 홈
      </router-link>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="panel guide-panel">
      <h2>어떤 동의서를 받아야 하나요</h2>
      <p class="helper-text">
        아래 세 가지가 ARC에서 실제로 쓰는 동의서예요. 응급처치 자체는 동의를
        기다리지 않고 먼저 합니다. 동의서는 <strong>처치 후 상세 기록</strong>을
        남길 때 필요해요.
      </p>

      <div class="guide-grid">
        <article class="guide-card">
          <p class="guide-code">AS-REC-F27</p>
          <h3>비응급 고객 개인정보·건강정보 처리 동의서</h3>
          <p class="guide-line">
            <span class="guide-tag">대상</span> 술을 마신 손님,
            어지럼·구토·찰과상 등 <strong>비응급</strong> 상황에서
            이름·연락처·증상·처치 내용을 남겨야 할 때
          </p>
          <p class="guide-line">
            <span class="guide-tag">받는 법</span> 종이 서식에 손님 성명·연락처,
            보유기간(예: 1년), 수집 항목을 적고
            <strong>손님 본인 서명</strong>을 받아요. 대신 서명은 원칙적으로
            인정되지 않아요.
          </p>
          <p class="guide-line">
            <span class="guide-tag">설명 멘트</span> "지금 처치한 내용을
            기록으로 남기려고 합니다. 이름과 연락처, 처치 경과만 보관하고 응급
            상황 대응·사후 안내 목적으로만 씁니다. 원하시면 지금 거절하거나
            나중에 철회하실 수 있어요."
          </p>
          <p class="guide-line">
            <span class="guide-tag">거절하면</span> 실명·증상·처치 내용은 적지
            않고, <strong>비식별 운영 건수</strong>만 남겨요. 응급·119 이송은
            거절과 무관하게 생명·신체 보호를 위해 필요한 범위에서 기록해요.
          </p>
        </article>

        <article class="guide-card">
          <p class="guide-code">AS-REC-F25</p>
          <h3>직원 건강정보·민감정보 처리 별도 동의서</h3>
          <p class="guide-line">
            <span class="guide-tag">대상</span> 직원이 개인 상비약을
            자가복용했거나 증상·복용 시각·상태 변화를 AS-CARE에 남겨야 할 때
          </p>
          <p class="guide-line">
            <span class="guide-tag">받는 법</span> 직원 본인이 서명하고, 보유
            기간의 <strong>시작일과 종료일을 모두</strong> 적어요. 종료일이 비어
            있으면 나중에 파기 기준을 증명할 수 없어요.
          </p>
          <p class="guide-line">
            <span class="guide-tag">설명 멘트</span> "복용 기록을 남기면 다음에
            같은 증상이 생겼을 때 도움이 됩니다. 다만 건강정보라서 따로 동의를
            받습니다. 동의하지 않으시면 개인을 특정할 수 있는 기록은 남기지
            않습니다."
          </p>
          <p class="guide-line">
            <span class="guide-tag">거절하면</span> 제품명·복용 시각·상태 변화를
            장부에 남기지 않아요. 상비약 재고 수량만 관리해요.
          </p>
        </article>

        <article class="guide-card">
          <p class="guide-code">AS-REC-F26</p>
          <h3>개인정보 권리행사·열람·제공 요청 처리기록</h3>
          <p class="guide-line">
            <span class="guide-tag">대상</span> 손님·직원이 "내 기록을 보여 달라
            / 지워 달라 / 처리 정지해 달라"고 요청했을 때
          </p>
          <p class="guide-line">
            <span class="guide-tag">받는 법</span> 요청자와 요청 내용, 본인 확인
            방법, 처리 결과·처리일을 적고 담당자가 서명해요. 요청은
            <strong>지체 없이(10일 이내)</strong> 처리해요.
          </p>
          <p class="guide-line">
            <span class="guide-tag">연결</span> 요청에 따라 기록을
            열람·정정·삭제한 사실은 이 화면의 동의서 이력과 사건 기록에 함께
            남겨요.
          </p>
        </article>
      </div>

      <div class="guide-steps">
        <h3>서명 받고 나서 이 순서로 처리하세요</h3>
        <ol>
          <li>
            <strong>서식 확인</strong> — 위 세 가지 중 맞는 서식을 골라요.
            고객은 F27, 직원은 F25, 요청 처리는 F26이에요.
          </li>
          <li>
            <strong>기재 누락 확인</strong> —
            성명·연락처·보유기간(시작일~종료일)· 수집 항목·동의 여부 체크가 모두
            채워졌는지 봐요.
          </li>
          <li>
            <strong>원본 보관</strong> — 종이 원본은 잠금 보관하고, 스캔본은
            AS-CARE 파일함에 올려요. 스캔본만 남기면 원본 분실 시 증명이
            어려워요.
          </li>
          <li>
            <strong>이 화면에 등록</strong> — 사건 번호·표시명·동의 방식·보존
            만료일을 넣고 등록해요. 등록만으로는 효력이 없어요.
          </li>
          <li>
            <strong>'동의 확인' 누르기</strong> — 서명 원본을 눈으로 확인한
            담당자가 눌러야 유효 동의가 돼요. 이때부터 상세 건강기록을 저장할 수
            있어요.
          </li>
          <li>
            <strong>철회·만료 관리</strong> — 철회 요청이 오면 '철회 포함'을
            켜고 해당 동의를 철회 처리해요. 보존기간이 끝나면 F31 파기대장에
            남기고 파기해요.
          </li>
        </ol>
      </div>
    </section>

    <section v-if="canWrite" class="panel">
      <h2>동의서 등록</h2>

      <div class="field-grid">
        <label class="field">
          <span>사건 번호</span>
          <input
            v-model="form.incidentNo"
            type="text"
            placeholder="예: INC-20250101-01"
          />
        </label>
        <label class="field">
          <span>동의 대상 표시명</span>
          <input
            v-model="form.subjectLabel"
            type="text"
            placeholder="예: 3번 테이블 손님"
          />
          <small
            >화면에 그대로 보이는 이름이에요. 실명은 아래 “가려서 보관” 항목에
            적어요.</small
          >
        </label>
        <label class="field">
          <span>성명 (가려서 보관)</span>
          <input v-model="form.subjectName" type="text" autocomplete="off" />
        </label>
        <label class="field">
          <span>연락처 (가려서 보관)</span>
          <input
            v-model="form.subjectPhone"
            type="text"
            inputmode="tel"
            autocomplete="off"
          />
        </label>
        <label class="field">
          <span>동의 방식</span>
          <select v-model="form.kind">
            <option
              v-for="(label, value) in ARC_CONSENT_KIND_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>보존기간 만료일</span>
          <input v-model="form.retentionUntil" type="date" />
        </label>
        <label class="field wide">
          <span>동의서 서식</span>
          <select v-model="form.formCode" @change="applyFormPreset">
            <option
              v-for="preset in CONSENT_FORM_PRESETS"
              :key="preset.code"
              :value="preset.code"
            >
              {{ preset.code }} · {{ preset.short }}
            </option>
          </select>
          <small>{{ selectedFormHint }}</small>
        </label>
        <label class="field wide">
          <span>수집 목적</span>
          <input
            v-model="form.purpose"
            type="text"
            placeholder="예: 응급상황 대응 및 사후 안내"
          />
        </label>
        <label class="field wide">
          <span>수집 항목</span>
          <input
            v-model="form.scope"
            type="text"
            placeholder="예: 성명, 연락처, 응급처치 경과"
          />
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submit"
        >
          {{ isSaving ? "등록 중이에요..." : "동의서 등록" }}
        </button>
        <span class="helper-text">
          등록만으로는 효력이 없어요. 서명을 받은 뒤 목록에서 '동의 확인'을 눌러
          주세요.
        </span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>동의서 목록</h2>
        <div class="panel-actions">
          <label class="checkbox-field">
            <input
              v-model="includeInactive"
              type="checkbox"
              @change="loadConsents"
            />
            <span>철회 포함</span>
          </label>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="loadConsents"
          >
            새로고침
          </button>
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>
      <p v-else-if="!consents.length" class="empty-box">
        등록된 동의서가 없어요.
      </p>

      <ul v-else class="consent-list">
        <li v-for="consent in consents" :key="consent.id" class="consent-row">
          <div class="row-head">
            <strong class="row-title">{{ consent.subjectLabel }}</strong>
            <span class="status-chip" :class="statusTone(consent.status)">
              {{ ARC_CONSENT_STATUS_LABELS[consent.status] ?? consent.status }}
            </span>
            <span v-if="consent.formCode" class="kind-chip">
              {{ consent.formCode }}
            </span>
            <span class="kind-chip">
              {{ ARC_CONSENT_KIND_LABELS[consent.kind] ?? consent.kind }}
            </span>
            <span v-if="consent.incidentNo" class="incident-no">
              {{ consent.incidentNo }}
            </span>
          </div>

          <dl class="meta-grid">
            <div>
              <dt>목적</dt>
              <dd>{{ consent.purpose || "-" }}</dd>
            </div>
            <div>
              <dt>항목</dt>
              <dd>{{ consent.scope || "-" }}</dd>
            </div>
            <div>
              <dt>확인</dt>
              <dd>
                {{ consent.confirmedByName || "미확인" }}
                <template v-if="consent.confirmedAt">
                  · {{ formatArcDateTime(consent.confirmedAt) }}
                </template>
              </dd>
            </div>
            <div>
              <dt>보존 만료</dt>
              <dd>
                {{
                  consent.retentionUntil
                    ? formatArcDate(consent.retentionUntil)
                    : "-"
                }}
              </dd>
            </div>
            <div v-if="consent.withdrawnAt">
              <dt>철회</dt>
              <dd>
                {{ formatArcDateTime(consent.withdrawnAt) }}
                <template v-if="consent.withdrawnReason">
                  · {{ consent.withdrawnReason }}
                </template>
              </dd>
            </div>
          </dl>

          <div class="row-actions">
            <button
              v-if="canWrite && consent.status === 'PENDING'"
              type="button"
              class="preset-button"
              :disabled="isSaving"
              @click="confirm(consent)"
            >
              동의 확인
            </button>
            <button
              v-if="canWrite && consent.status !== 'WITHDRAWN'"
              type="button"
              class="preset-button danger"
              :disabled="isSaving"
              @click="withdraw(consent)"
            >
              철회
            </button>
            <span class="row-note">
              등록 {{ consent.createdByName || "-" }}
            </span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  ARC_CONSENT_KIND_LABELS,
  ARC_CONSENT_STATUS_LABELS,
  confirmArcConsent,
  createArcConsent,
  fetchArcConsents,
  formatArcDate,
  formatArcDateTime,
  withdrawArcConsent,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";

const consents = ref([]);
const includeInactive = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const canWrite = computed(() => hasPermission("arc.consent"));

const CONSENT_FORM_PRESETS = [
  {
    code: "AS-REC-F27",
    short: "비응급 고객 상세기록 동의",
    hint: "손님에게 받는 서식이에요. 성명·연락처·처치 경과를 남길 때 사용해요.",
    purpose: "응급처치 경과 기록 및 사후 안내",
    scope: "성명, 연락처, 증상, 처치 내용, 경과",
  },
  {
    code: "AS-REC-F25",
    short: "직원 건강정보·민감정보 동의",
    hint: "직원 본인에게 받는 서식이에요. 복용 기록·상태 변화를 남길 때 사용해요.",
    purpose: "직원 건강 상태 확인 및 상비약 복용 이력 관리",
    scope: "성명, 증상, 복용 약품, 복용 시각, 상태 변화",
  },
  {
    code: "AS-REC-F26",
    short: "권리행사·열람·제공 요청 처리기록",
    hint: "열람·정정·삭제·처리정지 요청을 접수하고 결과를 남기는 서식이에요.",
    purpose: "개인정보 열람·정정·삭제·처리정지 요청 처리",
    scope: "요청자, 요청 내용, 본인 확인 방법, 처리 결과, 처리일",
  },
];

const form = reactive({
  formCode: "AS-REC-F27",
  incidentNo: "",
  subjectLabel: "",
  subjectName: "",
  subjectPhone: "",
  kind: "PAPER",
  purpose: CONSENT_FORM_PRESETS[0].purpose,
  scope: CONSENT_FORM_PRESETS[0].scope,
  retentionUntil: "",
});

const selectedFormHint = computed(() => {
  const preset = CONSENT_FORM_PRESETS.find(
    (item) => item.code === form.formCode
  );
  return preset ? preset.hint : "";
});

function applyFormPreset() {
  const preset = CONSENT_FORM_PRESETS.find(
    (item) => item.code === form.formCode
  );
  if (!preset) return;
  form.purpose = preset.purpose;
  form.scope = preset.scope;
}

function statusTone(status) {
  if (status === "ACTIVE") return "active";
  if (status === "PENDING") return "pending";
  return "muted";
}

function resetForm() {
  form.formCode = "AS-REC-F27";
  form.incidentNo = "";
  form.subjectLabel = "";
  form.subjectName = "";
  form.subjectPhone = "";
  form.kind = "PAPER";
  form.purpose = CONSENT_FORM_PRESETS[0].purpose;
  form.scope = CONSENT_FORM_PRESETS[0].scope;
  form.retentionUntil = "";
}

async function loadConsents() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchArcConsents({
      includeInactive: includeInactive.value,
    });

    consents.value = data.consents;
  } catch (error) {
    errorMessage.value = error?.message || "동의서를 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function submit() {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    if (!form.retentionUntil) {
      errorMessage.value =
        "보존기간 만료일을 입력해 주세요. 시작일과 종료일이 모두 있어야 파기 기준을 증명할 수 있어요.";
      return;
    }

    await createArcConsent({ ...form });
    okMessage.value =
      "동의서를 등록했어요. 서명 확인 후 '동의 확인'을 눌러 주세요.";
    resetForm();
    await loadConsents();
  } catch (error) {
    errorMessage.value = error?.message || "동의서를 등록하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function confirm(consent) {
  if (isSaving.value) return;

  const confirmed = window.confirm(
    `${consent.subjectLabel} 동의서의 서명을 확인했나요? 확인을 누르면 효력이 생겨요.`
  );

  if (!confirmed) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await confirmArcConsent(consent.id);
    okMessage.value = "동의 확인을 기록했어요.";
    await loadConsents();
  } catch (error) {
    errorMessage.value = error?.message || "동의 확인을 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function withdraw(consent) {
  if (isSaving.value) return;

  const reason = window.prompt(
    `${consent.subjectLabel} 동의서를 철회할까요? 사유를 적어 주세요.`,
    ""
  );

  if (reason === null) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await withdrawArcConsent(consent.id, reason);
    okMessage.value = "동의 철회를 기록했어요.";
    await loadConsents();
  } catch (error) {
    errorMessage.value = error?.message || "동의 철회를 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

onMounted(loadConsents);
</script>

<style scoped lang="scss">
.admin-arc-consent-view {
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
}

.description {
  margin: 0;
  max-width: 660px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}

.link-button {
  flex-shrink: 0;
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
  gap: 10px;
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
    grid-column: 1 / -1;
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

  small {
    color: rgba(255, 255, 255, 0.48);
    line-height: 1.5;
  }
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
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

.preset-button {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &.danger {
    border-color: rgba(248, 113, 113, 0.4);
    color: #fca5a5;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.helper-text {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
}

.guide-panel {
  gap: 16px;
}

.guide-panel .helper-text strong {
  color: #fde68a;
  font-weight: 700;
}

.guide-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}

.guide-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.28);

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.45;
    color: #f8fafc;
  }
}

.guide-code {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #7dd3fc;
}

.guide-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.82);

  strong {
    color: #fef3c7;
    font-weight: 700;
  }
}

.guide-tag {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.18);
  color: #bae6fd;
  font-size: 11px;
  font-weight: 700;
}

.guide-steps {
  padding: 16px;
  border-radius: 16px;
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.22);

  h3 {
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 800;
    color: #fde68a;
  }

  ol {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding-left: 20px;
  }

  li {
    font-size: 12px;
    line-height: 1.7;
    color: rgba(226, 232, 240, 0.85);
  }

  strong {
    color: #f8fafc;
    font-weight: 800;
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
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
}

.consent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.consent-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
}

.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.row-title {
  font-size: 14px;
  font-weight: 800;
}

.incident-no {
  font-family: monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin: 0;
  font-size: 12px;

  dt {
    margin: 0 0 2px;
    color: rgba(255, 255, 255, 0.45);
    font-weight: 700;
  }

  dd {
    margin: 0;
    color: rgba(255, 255, 255, 0.75);
  }
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.row-note {
  margin-left: auto;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.status-chip {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;

  &.active {
    background: rgba(52, 211, 153, 0.18);
    color: #6ee7b7;
  }

  &.pending {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.muted {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
  }
}

.kind-chip {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}
</style>
