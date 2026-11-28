<template>
  <div class="admin-arc-care-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY · AS-CARE</p>
        <h1>
          <span class="mono">{{ incident?.incidentNo || incidentId }}</span>
          사건 상세기록
        </h1>
        <div v-if="incident" class="badge-row">
          <span class="kind-badge" :class="incident.kind.toLowerCase()">
            {{ ARC_INCIDENT_KIND_LABELS[incident.kind] || incident.kind }}
          </span>
          <span class="status-tag" :class="incident.status.toLowerCase()">
            {{ ARC_INCIDENT_STATUS_LABELS[incident.status] || incident.status }}
          </span>
          <span class="plain-tag">
            {{ ARC_RECORD_MODE_LABELS[incident.recordMode] || "-" }}
          </span>
          <span class="plain-tag">
            {{ formatArcDateTime(incident.occurredAt) }}
          </span>
        </div>
      </div>
      <div class="header-actions">
        <router-link to="/admin/arc/incidents" class="link-button">
          사건 목록
        </router-link>
        <router-link to="/admin/arc/consents" class="link-button">
          동의서 관리
        </router-link>
        <router-link
          v-if="canApprove"
          to="/admin/arc/access"
          class="link-button"
        >
          열람 승인
        </router-link>
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>
    <p v-if="isLoading" class="empty-box">불러오는 중이에요.</p>

    <template v-if="!isLoading && incident">
      <section class="panel">
        <div class="panel-head">
          <h2>사건 정보</h2>
          <div class="panel-actions">
            <button
              v-if="canCare && !editOpen"
              type="button"
              class="preset-button"
              @click="openEdit"
            >
              사건 수정
            </button>
            <button
              v-else-if="editOpen"
              type="button"
              class="preset-button"
              @click="editOpen = false"
            >
              닫기
            </button>
          </div>
        </div>

        <dl class="meta-grid">
          <div>
            <dt>비식별 표시명</dt>
            <dd>{{ incident.subjectLabel || "-" }}</dd>
          </div>
          <div>
            <dt>발생 위치</dt>
            <dd>{{ incident.place || "-" }}</dd>
          </div>
          <div>
            <dt>개인정보 처리근거</dt>
            <dd>
              {{ ARC_LEGAL_BASIS_LABELS[incident.legalBasis] || "-" }}
            </dd>
          </div>
          <div>
            <dt>119 이송·인계</dt>
            <dd>{{ incident.transferred119 ? "예" : "아니오" }}</dd>
          </div>
          <div>
            <dt>처리 담당자</dt>
            <dd>{{ incident.handlerName || "-" }}</dd>
          </div>
          <div>
            <dt>접수자</dt>
            <dd>{{ incident.createdByName || "-" }}</dd>
          </div>
          <div class="wide">
            <dt>비식별 요약</dt>
            <dd>{{ incident.summary || "-" }}</dd>
          </div>
          <div v-if="incident.status === 'CLOSED'" class="wide">
            <dt>종결</dt>
            <dd>
              {{ formatArcDateTime(incident.closedAt) }} ·
              {{ incident.closedByName || "-" }} ·
              {{ incident.closeNote || "사유 없음" }}
            </dd>
          </div>
        </dl>

        <template v-if="editOpen && canCare">
          <div class="field-grid">
            <label class="field">
              <span>발생 일시</span>
              <input v-model="editForm.occurredAt" type="datetime-local" />
            </label>
            <label class="field">
              <span>발생 위치</span>
              <input v-model.trim="editForm.place" type="text" maxlength="80" />
            </label>
            <label class="field">
              <span>비식별 표시명</span>
              <input
                v-model.trim="editForm.subjectLabel"
                type="text"
                maxlength="60"
              />
            </label>
            <label class="field">
              <span>처리 담당자</span>
              <input
                v-model.trim="editForm.handlerName"
                type="text"
                maxlength="60"
              />
            </label>
            <label class="field wide">
              <span>비식별 요약</span>
              <textarea
                v-model.trim="editForm.summary"
                rows="3"
                maxlength="500"
              ></textarea>
            </label>
            <label class="field">
              <span>개인정보 처리근거</span>
              <select v-model="editForm.legalBasis">
                <option
                  v-for="(label, code) in ARC_LEGAL_BASIS_LABELS"
                  :key="code"
                  :value="code"
                >
                  {{ label }}
                </option>
              </select>
            </label>
            <label v-if="editForm.legalBasis === 'OTHER_LEGAL'" class="field">
              <span>적법근거 사유</span>
              <input
                v-model.trim="editForm.legalBasisNote"
                type="text"
                maxlength="500"
              />
            </label>
            <label class="field checkbox-field">
              <input v-model="editForm.transferred119" type="checkbox" />
              <span>119 이송·인계</span>
            </label>
            <label class="field">
              <span>종결 사유</span>
              <input
                v-model.trim="editForm.closeNote"
                type="text"
                maxlength="500"
                placeholder="종결 시 기록"
              />
            </label>
          </div>

          <div class="actions">
            <button
              type="button"
              class="primary-button"
              :disabled="isSaving"
              @click="saveIncidentPatch({})"
            >
              사건 정보 저장
            </button>
            <template v-if="incident.status === 'OPEN'">
              <button
                v-if="!confirmClose"
                type="button"
                class="preset-button"
                @click="confirmClose = true"
              >
                종결 처리
              </button>
              <template v-else>
                <span class="warn-text">이 사건을 종결할까요?</span>
                <button
                  type="button"
                  class="preset-button danger"
                  :disabled="isSaving"
                  @click="closeIncident"
                >
                  종결 확정
                </button>
                <button
                  type="button"
                  class="preset-button"
                  @click="confirmClose = false"
                >
                  취소
                </button>
              </template>
            </template>
            <button
              v-else
              type="button"
              class="preset-button"
              :disabled="isSaving"
              @click="reopenIncident"
            >
              진행 중으로 되돌리기
            </button>
          </div>
        </template>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>동의서 (F25 / F27)</h2>
          <div class="panel-actions">
            <span v-if="activeConsent" class="ok-tag">동의 확인 완료</span>
            <span v-else class="warn-tag">동의서 필요</span>
            <button
              v-if="canCare"
              type="button"
              class="preset-button"
              @click="consentOpen = !consentOpen"
            >
              {{ consentOpen ? "닫기" : "동의서 등록" }}
            </button>
          </div>
        </div>

        <p class="helper-text">
          종이 서식(F25 직원·F27 비응급 고객)에 서명을 받은 뒤 이 화면에서
          등록하고 '동의 확인'을 눌러요. 상세기록 저장은 '동의 확인' 상태의
          동의서가 있어야 가능해요.
        </p>

        <p v-if="!consents.length" class="empty-box">
          이 사건에 연결된 동의서가 없어요.
        </p>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>표시명</th>
                <th>구분</th>
                <th>목적</th>
                <th>상태</th>
                <th>확인</th>
                <th>보존 만료</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="consent in consents" :key="consent.id">
                <td>{{ consent.subjectLabel || "-" }}</td>
                <td>
                  {{ ARC_CONSENT_KIND_LABELS[consent.kind] || consent.kind }}
                </td>
                <td class="summary-cell">{{ consent.purpose || "-" }}</td>
                <td>
                  <span
                    class="status-tag"
                    :class="consent.status.toLowerCase()"
                  >
                    {{
                      ARC_CONSENT_STATUS_LABELS[consent.status] ||
                      consent.status
                    }}
                  </span>
                </td>
                <td class="nowrap">
                  {{ consent.confirmedByName || "-" }}
                  <span class="dim">
                    {{ formatArcDateTime(consent.confirmedAt) }}
                  </span>
                </td>
                <td class="nowrap">
                  {{ formatArcDate(consent.retentionUntil) }}
                </td>
                <td>
                  <button
                    v-if="canCare && consent.status !== 'ACTIVE'"
                    type="button"
                    class="preset-button"
                    :disabled="isSavingConsent"
                    @click="submitConfirmConsent(consent.id)"
                  >
                    동의 확인
                  </button>
                  <span v-else class="dim">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <template v-if="consentOpen && canCare">
          <div class="field-grid">
            <label class="field">
              <span>동의 대상 표시명</span>
              <input
                v-model.trim="consentForm.subjectLabel"
                type="text"
                maxlength="80"
                placeholder="예: 손님A"
              />
            </label>
            <label class="field">
              <span>성명 (가려서 보관)</span>
              <input
                v-model.trim="consentForm.subjectName"
                type="text"
                maxlength="60"
              />
            </label>
            <label class="field">
              <span>연락처 (가려서 보관)</span>
              <input
                v-model.trim="consentForm.subjectPhone"
                type="text"
                maxlength="40"
              />
            </label>
            <label class="field">
              <span>동의 구분</span>
              <select v-model="consentForm.kind">
                <option value="PAPER">종이 서명</option>
                <option value="ELECTRONIC">전자 동의</option>
              </select>
            </label>
            <label class="field">
              <span>보존 만료일</span>
              <input v-model="consentForm.retentionUntil" type="date" />
            </label>
            <label class="field wide">
              <span>수집 목적</span>
              <input
                v-model.trim="consentForm.purpose"
                type="text"
                maxlength="300"
                placeholder="예: 응급처치 및 인계 경과 기록"
              />
            </label>
            <label class="field wide">
              <span>수집 항목·범위</span>
              <input
                v-model.trim="consentForm.scope"
                type="text"
                maxlength="300"
                placeholder="예: 성명·연락처·증상·처치 경과"
              />
            </label>
          </div>
          <div class="actions">
            <button
              type="button"
              class="primary-button"
              :disabled="isSavingConsent"
              @click="submitCreateConsent"
            >
              동의서 등록
            </button>
            <p class="helper-text">
              등록 후 서명본을 확인하고 목록에서 '동의 확인'을 눌러 주세요.
            </p>
          </div>
        </template>
      </section>
      <section class="panel">
        <div class="panel-head">
          <h2>상세기록 열람 승인</h2>
          <div class="panel-actions">
            <span v-if="careAccess" class="ok-tag">열람 가능</span>
            <span v-else-if="careDenied" class="warn-tag">승인 필요</span>
          </div>
        </div>

        <p v-if="!canSensitive" class="helper-text">
          상세 건강기록은 ARC 총괄 전용이에요. 열람이 필요하면 사장님을 통해
          요청해 주세요.
        </p>
        <template v-else>
          <p class="helper-text">
            상세 건강기록 작성·조회는 ARC 총괄(최윤희) 전용이에요. 그 밖의
            직원은 사유와 증빙을 남기고 총괄의 승인을 받아야 하며, 승인은
            만료되면 다시 요청해야 해요. 열람·작성 이력은 모두 기록돼요.
          </p>

          <div v-if="careDenied" class="gate-box">
            <p class="gate-text">
              이 사건의 상세기록 열람 승인이 없어요. 정당한 사유와 증빙을 적고
              ARC 총괄(최윤희)님께 승인을 요청해 주세요.
            </p>
            <div class="gate-form">
              <input
                v-model.trim="accessPurpose"
                class="inline-input wide"
                type="text"
                maxlength="300"
                placeholder="열람 사유 (10자 이상) 예: 119 인계 경과 확인"
              />
              <input
                v-model.trim="accessEvidence"
                class="inline-input wide"
                type="text"
                maxlength="500"
                placeholder="증빙 자료 예: 보호자 요청 메시지, 119 이송 기록지 번호"
              />
              <button
                type="button"
                class="primary-button small"
                :disabled="isSavingAccess"
                @click="submitAccessRequest"
              >
                열람 승인 요청
              </button>
            </div>
          </div>

          <div v-if="accessRequests.length" class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>요청자</th>
                  <th>사유</th>
                  <th>상태</th>
                  <th>요청</th>
                  <th>만료</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in accessRequests" :key="row.id">
                  <td>{{ row.requestedByName || "-" }}</td>
                  <td class="summary-cell">{{ row.purpose || "-" }}</td>
                  <td>
                    <span class="status-tag" :class="row.status.toLowerCase()">
                      {{ ARC_ACCESS_STATUS_LABELS[row.status] || row.status }}
                    </span>
                  </td>
                  <td class="nowrap">
                    {{ formatArcDateTime(row.requestedAt) }}
                  </td>
                  <td class="nowrap">
                    {{ formatArcDateTime(row.expiresAt) }}
                  </td>
                  <td class="nowrap">
                    <template v-if="canApprove && row.status === 'PENDING'">
                      <button
                        type="button"
                        class="preset-button"
                        :disabled="isSavingAccess"
                        @click="submitDecideAccess(row.id, true)"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        class="preset-button danger"
                        :disabled="isSavingAccess"
                        @click="submitDecideAccess(row.id, false)"
                      >
                        거부
                      </button>
                    </template>
                    <span v-else class="dim">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>AS-CARE 상세기록</h2>
          <div class="panel-actions">
            <span v-if="careData?.care" class="dim">
              최근 저장 {{ formatArcDateTime(careData.care.updatedAt) }} ·
              {{ careData.care.recordedByName || "-" }}
            </span>
          </div>
        </div>

        <p v-if="!canSensitive" class="empty-box">
          상세기록은 arc.sensitive 권한이 있는 직원만 볼 수 있어요.
        </p>
        <p v-else-if="careDenied" class="empty-box">
          열람 승인을 받은 뒤 상세기록을 볼 수 있어요.
        </p>
        <p v-else-if="careData?.care?.decryptFailed" class="error-box">
          저장된 기록 일부를 읽지 못했어요. 기록이 오래되었거나 형식이 바뀐
          경우입니다. ARC 대표(최윤희)에게 화면을 캡처해 전달해 주세요.
        </p>
        <template v-else>
          <p v-if="!canCare" class="helper-text">
            열람 전용 화면이에요. 상세 건강기록 작성·수정은 ARC 총괄(최윤희)만
            할 수 있어요.
          </p>

          <h3 class="section-title">01 · 사건 개요</h3>
          <div class="field-grid">
            <label class="field">
              <span>성명</span>
              <input
                v-model.trim="careForm.subjectName"
                type="text"
                maxlength="60"
                :readonly="!canCare"
              />
            </label>
            <label class="field">
              <span>연락처</span>
              <input
                v-model.trim="careForm.subjectPhone"
                type="text"
                maxlength="40"
                :readonly="!canCare"
              />
            </label>
            <label class="field">
              <span>생년월일</span>
              <input
                v-model.trim="careForm.subjectBirth"
                type="text"
                maxlength="20"
                placeholder="YYYY-MM-DD"
                :readonly="!canCare"
              />
            </label>
            <label class="field">
              <span>성별</span>
              <input
                v-model.trim="careForm.subjectGender"
                type="text"
                maxlength="20"
                :readonly="!canCare"
              />
            </label>
            <label class="field">
              <span>연령</span>
              <input
                v-model.trim="careForm.subjectAge"
                type="text"
                maxlength="20"
                :readonly="!canCare"
              />
            </label>
            <label class="field wide">
              <span>주호소</span>
              <textarea
                v-model.trim="careForm.chiefComplaint"
                rows="2"
                maxlength="500"
                :readonly="!canCare"
              ></textarea>
            </label>
            <label class="field wide">
              <span>상황 요약</span>
              <textarea
                v-model.trim="careForm.summary"
                rows="3"
                maxlength="4000"
                :readonly="!canCare"
              ></textarea>
            </label>
            <label class="field wide">
              <span>병력·복용약·알레르기</span>
              <textarea
                v-model.trim="careForm.history"
                rows="3"
                maxlength="4000"
                :readonly="!canCare"
              ></textarea>
            </label>
          </div>

          <h3 class="section-title">측정 기록 (시간대별)</h3>
          <p class="helper-text">
            직접 확인한 값은 '직접 확인', 다른 사람에게 보고받은 값은
            '보고받음'으로 구분해요.
          </p>
          <div v-if="!careForm.timeline.length" class="empty-box small">
            측정 기록이 없어요.
          </div>
          <div v-else class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>출처</th>
                  <th>시각</th>
                  <th>체온</th>
                  <th>혈압</th>
                  <th>맥박</th>
                  <th>SpO2</th>
                  <th>상태</th>
                  <th v-if="canCare"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in careForm.timeline" :key="index">
                  <td>
                    <select
                      v-model="row.source"
                      class="cell-input"
                      :disabled="!canCare"
                    >
                      <option value="DIRECT">직접 확인</option>
                      <option value="REPORT">보고받음</option>
                    </select>
                  </td>
                  <td>
                    <input
                      v-model.trim="row.measuredAt"
                      class="cell-input narrow"
                      type="text"
                      maxlength="5"
                      placeholder="HH:MM"
                      :readonly="!canCare"
                    />
                  </td>
                  <td>
                    <input
                      v-model.trim="row.temp"
                      class="cell-input narrow"
                      type="text"
                      maxlength="20"
                      :readonly="!canCare"
                    />
                  </td>
                  <td>
                    <input
                      v-model.trim="row.bp"
                      class="cell-input narrow"
                      type="text"
                      maxlength="30"
                      :readonly="!canCare"
                    />
                  </td>
                  <td>
                    <input
                      v-model.trim="row.pulse"
                      class="cell-input narrow"
                      type="text"
                      maxlength="20"
                      :readonly="!canCare"
                    />
                  </td>
                  <td>
                    <input
                      v-model.trim="row.spo2"
                      class="cell-input narrow"
                      type="text"
                      maxlength="20"
                      :readonly="!canCare"
                    />
                  </td>
                  <td>
                    <input
                      v-model.trim="row.condition"
                      class="cell-input wide"
                      type="text"
                      maxlength="500"
                      :readonly="!canCare"
                    />
                  </td>
                  <td v-if="canCare">
                    <button
                      type="button"
                      class="preset-button tiny"
                      @click="removeTimelineRow(index)"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="canCare" class="actions">
            <button type="button" class="preset-button" @click="addTimelineRow">
              측정 기록 추가
            </button>
          </div>
          <h3 class="section-title">02 · 약품·물품 사용과 교육</h3>
          <div v-if="!careForm.meds.length" class="empty-box small">
            사용한 약품·물품이 없어요.
          </div>
          <div v-else class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>명칭</th>
                  <th>수량</th>
                  <th>분류</th>
                  <th>교육·안내</th>
                  <th>비고</th>
                  <th v-if="canCare"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in careForm.meds" :key="index">
                  <td>
                    <input
                      v-model.trim="row.name"
                      class="cell-input wide"
                      type="text"
                      maxlength="120"
                      :readonly="!canCare"
                    />
                  </td>
                  <td>
                    <input
                      v-model.trim="row.qty"
                      class="cell-input narrow"
                      type="text"
                      maxlength="40"
                      :readonly="!canCare"
                    />
                  </td>
                  <td>
                    <input
                      v-model.trim="row.category"
                      class="cell-input"
                      type="text"
                      maxlength="60"
                      :readonly="!canCare"
                    />
                  </td>
                  <td>
                    <input
                      v-model.trim="row.education"
                      class="cell-input wide"
                      type="text"
                      maxlength="500"
                      :readonly="!canCare"
                    />
                  </td>
                  <td>
                    <input
                      v-model.trim="row.note"
                      class="cell-input"
                      type="text"
                      maxlength="300"
                      :readonly="!canCare"
                    />
                  </td>
                  <td v-if="canCare">
                    <button
                      type="button"
                      class="preset-button tiny"
                      @click="removeMedRow(index)"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="canCare" class="actions">
            <button type="button" class="preset-button" @click="addMedRow">
              약품·물품 추가
            </button>
          </div>

          <h3 class="section-title">03 · 현장 조치·교육·최종 계획</h3>
          <div class="field-grid">
            <label class="field wide">
              <span>직접 사정·현장 조치</span>
              <textarea
                v-model.trim="careForm.treatment"
                rows="3"
                maxlength="4000"
                :readonly="!canCare"
              ></textarea>
            </label>
            <label class="field wide">
              <span>최종 결과·인계(Disposition)</span>
              <textarea
                v-model.trim="careForm.disposition"
                rows="3"
                maxlength="2000"
                :readonly="!canCare"
              ></textarea>
            </label>
            <label class="field wide">
              <span>사후 안내·Follow-up</span>
              <textarea
                v-model.trim="careForm.followup"
                rows="3"
                maxlength="2000"
                :readonly="!canCare"
              ></textarea>
            </label>
            <template v-if="incident.recordMode === 'OFF_SITE'">
              <p class="sub-title">보고 정보 출처 (비현장·사후 보고 서식)</p>
              <label class="field">
                <span>보고정보 발생시각</span>
                <input
                  v-model.trim="careForm.reportOccurredAt"
                  type="text"
                  maxlength="5"
                  placeholder="HH:MM"
                  :readonly="!canCare"
                />
              </label>
              <label class="field">
                <span>보고받은 시각</span>
                <input
                  v-model.trim="careForm.reportReceivedAt"
                  type="text"
                  maxlength="5"
                  placeholder="HH:MM"
                  :readonly="!canCare"
                />
              </label>
              <label class="field">
                <span>보고자</span>
                <input
                  v-model.trim="careForm.reporter"
                  type="text"
                  maxlength="60"
                  placeholder="예) 홀 담당 직원"
                  :readonly="!canCare"
                />
              </label>
              <label class="field">
                <span>보고수단</span>
                <input
                  v-model.trim="careForm.reportChannel"
                  type="text"
                  maxlength="40"
                  placeholder="예) 대면 · 전화 · 메시지"
                  :readonly="!canCare"
                />
              </label>
              <label class="field wide">
                <span>보고 범위</span>
                <textarea
                  v-model.trim="careForm.reportScope"
                  rows="2"
                  maxlength="1000"
                  placeholder="예) 상태 확인 보조 · 약물·물품 관련 · 대상자 표현·경과"
                  :readonly="!canCare"
                ></textarea>
              </label>
              <label class="field wide">
                <span>보고 출처·경위</span>
                <textarea
                  v-model.trim="careForm.reportSource"
                  rows="2"
                  maxlength="500"
                  :readonly="!canCare"
                ></textarea>
              </label>
              <label class="field wide">
                <span>미확인 사항</span>
                <textarea
                  v-model.trim="careForm.unconfirmed"
                  rows="2"
                  maxlength="1000"
                  :readonly="!canCare"
                ></textarea>
              </label>
            </template>
            <label class="field">
              <span>기록 근거</span>
              <select v-model="careForm.legalBasis" :disabled="!canCare">
                <option
                  v-for="code in careBasisOptions"
                  :key="code"
                  :value="code"
                >
                  {{ ARC_LEGAL_BASIS_LABELS[code] || code }}
                </option>
              </select>
            </label>
            <label v-if="careForm.legalBasis === 'OTHER_LEGAL'" class="field">
              <span>적법근거 사유</span>
              <input
                v-model.trim="careForm.legalBasisNote"
                type="text"
                maxlength="500"
                :readonly="!canCare"
              />
            </label>
            <label class="field">
              <span>기록자 확인(서명)</span>
              <input
                v-model.trim="careForm.recorderSign"
                type="text"
                maxlength="60"
                placeholder="예) 최윤희 (서명)"
                :readonly="!canCare"
              />
            </label>
          </div>

          <div class="notice-box">
            <strong>기록 성격</strong>
            <p>
              이 기록은 기록자가 현장에서 직접 확인한 상태와 실제 시행한
              조치·교육을 사실 중심으로 남기는 내부 업무기록이에요. 보고받은
              정보와 직접 확인한 정보를 구분하고, 실제로 하지 않은 조치나 의학적
              판정은 적지 않아요. 의료기관의 진료기록·진단서·처방전을 대체하지
              않아요.
            </p>
          </div>

          <div v-if="canCare" class="actions">
            <button
              type="button"
              class="primary-button"
              :disabled="isSaving"
              @click="submitCare"
            >
              상세기록 저장
            </button>
            <p class="helper-text">
              저장하면 작성자에게 이 사건 열람 권한이 자동으로 부여되고,
              열람·작성 이력이 기록돼요.
            </p>
          </div>

          <h3 class="section-title">추가 기록 (수정 불가)</h3>
          <div v-if="!careData?.care" class="empty-box small">
            상세기록을 먼저 저장하면 추가 기록을 남길 수 있어요.
          </div>
          <template v-else>
            <p v-if="!careData.addenda.length" class="empty-box small">
              추가 기록이 없어요.
            </p>
            <ul v-else class="addenda-list">
              <li v-for="row in careData.addenda" :key="row.id">
                <div class="addenda-head">
                  <strong>{{ row.authorName || "-" }}</strong>
                  <span class="dim">
                    {{ formatArcDateTime(row.createdAt) }}
                  </span>
                </div>
                <p class="addenda-body">
                  {{ row.decryptFailed ? "(기록을 읽지 못함)" : row.body }}
                </p>
              </li>
            </ul>
            <div v-if="canSensitive" class="gate-form">
              <input
                v-model.trim="addendumBody"
                class="inline-input wide"
                type="text"
                maxlength="2000"
                placeholder="추가로 남길 내용"
              />
              <button
                type="button"
                class="primary-button small"
                :disabled="isSavingAddendum"
                @click="submitAddendum"
              >
                추가 기록 저장
              </button>
            </div>
          </template>

          <h3 class="section-title">
            04 · 서식 원본 첨부 (한글·워드·PDF·사진)
          </h3>
          <p class="helper-text">
            손으로 적고 서명한 AS-CARE 원본을 올려 두면 종이 서식과 전자기록을
            함께 남길 수 있어요. HWP · HWPX · DOC · DOCX · XLS · XLSX · PDF ·
            JPG · PNG · TXT 파일을 한 개 20MB까지 올릴 수 있어요.
          </p>
          <p v-if="!canCare" class="helper-text">
            서식 원본 등록·삭제는 ARC 총괄(최윤희)만 할 수 있어요. 내려받기는 이
            사건의 열람 승인을 받은 직원도 가능해요.
          </p>
          <p v-if="careFileError" class="error-box">{{ careFileError }}</p>
          <p v-else-if="careFileOk" class="ok-box">{{ careFileOk }}</p>
          <div v-if="!careFiles.length" class="empty-box small">
            아직 첨부된 서식이 없어요. 서명본·스캔본을 올려 주세요.
          </div>
          <ul v-else class="care-file-list">
            <li v-for="row in careFiles" :key="row.id">
              <div class="care-file-main">
                <strong>{{ row.fileName }}</strong>
                <span class="care-file-meta">
                  {{ ARC_CARE_FILE_KIND_LABELS[row.kind] || row.kind }} ·
                  {{ (row.ext || "").toUpperCase() }} ·
                  {{ formatBytes(row.bytes) }} ·
                  {{ row.uploadedByName || "-" }} ·
                  {{ formatArcDateTime(row.createdAt) }}
                </span>
                <span v-if="row.note" class="dim">{{ row.note }}</span>
              </div>
              <div class="care-file-actions">
                <button
                  type="button"
                  class="preset-button tiny"
                  :disabled="isFileBusy"
                  @click="downloadFile(row)"
                >
                  내려받기
                </button>
                <button
                  v-if="canCare"
                  type="button"
                  class="preset-button tiny danger"
                  :disabled="isFileBusy"
                  @click="removeFile(row)"
                >
                  삭제
                </button>
              </div>
            </li>
          </ul>
          <div v-if="canCare" class="care-file-form">
            <label class="field">
              <span>파일</span>
              <input
                ref="careFileInput"
                type="file"
                accept=".hwp,.hwpx,.doc,.docx,.xls,.xlsx,.pdf,.jpg,.jpeg,.png,.txt"
              />
            </label>
            <label class="field">
              <span>자료 종류</span>
              <select v-model="careFileKind">
                <option
                  v-for="(label, code) in ARC_CARE_FILE_KIND_LABELS"
                  :key="code"
                  :value="code"
                >
                  {{ label }}
                </option>
              </select>
            </label>
            <label class="field wide">
              <span>메모(선택)</span>
              <input
                v-model.trim="careFileNote"
                type="text"
                maxlength="300"
                placeholder="예) 종이 서식 서명 후 스캔, 원본은 사무실 보관"
              />
            </label>
            <div class="actions">
              <button
                type="button"
                class="primary-button small"
                :disabled="isUploadingFile"
                @click="submitCareFile"
              >
                {{ isUploadingFile ? "올리는 중…" : "서식 파일 올리기" }}
              </button>
            </div>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";

import {
  ARC_ACCESS_STATUS_LABELS,
  ARC_CARE_FILE_KIND_LABELS,
  ARC_CONSENT_KIND_LABELS,
  ARC_CONSENT_STATUS_LABELS,
  ARC_INCIDENT_KIND_LABELS,
  ARC_INCIDENT_STATUS_LABELS,
  ARC_LEGAL_BASIS_LABELS,
  ARC_RECORD_MODE_LABELS,
  addArcCareAddendum,
  confirmArcConsent,
  createArcConsent,
  decideArcAccess,
  deleteArcCareFile,
  downloadArcCareFile,
  fetchArcAccessRequests,
  fetchArcCare,
  fetchArcCareFiles,
  fetchArcConsents,
  fetchArcIncident,
  formatArcDate,
  formatArcDateTime,
  requestArcAccess,
  saveArcCare,
  updateArcIncident,
  uploadArcCareFile,
} from "@/lib/arc";

const route = useRoute();
const incidentId = String(route.params.incidentId || "");

const incident = ref(null);
const canCare = ref(false);
const canSensitive = ref(false);
const canApprove = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const editOpen = ref(false);
const confirmClose = ref(false);
const editForm = reactive({
  occurredAt: "",
  place: "",
  subjectLabel: "",
  summary: "",
  handlerName: "",
  legalBasis: "NOT_APPLICABLE",
  legalBasisNote: "",
  transferred119: false,
  closeNote: "",
});

const consents = ref([]);
const consentOpen = ref(false);
const isSavingConsent = ref(false);
const consentForm = reactive({
  subjectLabel: "",
  subjectName: "",
  subjectPhone: "",
  kind: "PAPER",
  purpose: "",
  scope: "",
  retentionUntil: "",
});

const accessRequests = ref([]);
const accessPurpose = ref("");
const accessEvidence = ref("");
const isSavingAccess = ref(false);
const careDenied = ref(false);

const careData = ref(null);
const careAccess = ref(null);
// 승인 요청을 특정 AS-CARE 기록에 묶기 위한 ID입니다.
const careRecordId = ref("");
const careForm = reactive({
  subjectName: "",
  subjectPhone: "",
  subjectBirth: "",
  subjectGender: "",
  subjectAge: "",
  chiefComplaint: "",
  summary: "",
  history: "",
  treatment: "",
  disposition: "",
  followup: "",
  reportSource: "",
  unconfirmed: "",
  reportOccurredAt: "",
  reportReceivedAt: "",
  reportChannel: "",
  reporter: "",
  reportScope: "",
  recorderSign: "",
  legalBasis: "CONSENT_F27",
  legalBasisNote: "",
  timeline: [],
  meds: [],
});

const addendumBody = ref("");
const isSavingAddendum = ref(false);

// AS-CARE 서식 원본 첨부(HWP·DOCX·PDF·사진). 올리기·삭제는 ARC 총괄만 됩니다.
const careFiles = ref([]);
const careFileKind = ref("CARE_SHEET");
const careFileNote = ref("");
const careFileInput = ref(null);
const careFileError = ref("");
const careFileOk = ref("");
const isUploadingFile = ref(false);
const isFileBusy = ref(false);

const activeConsent = computed(() =>
  consents.value.find((row) => row.status === "ACTIVE")
);

const careBasisOptions = computed(() => {
  const kind = incident.value?.kind;

  if (kind === "EMERGENCY") {
    return ["NOT_APPLICABLE", "CONSENT_F27", "OTHER_LEGAL"];
  }

  if (kind === "STAFF_OTC") {
    return ["CONSENT_F25", "OTHER_LEGAL"];
  }

  return ["CONSENT_F27", "OTHER_LEGAL"];
});

function toLocalInput(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function resetEditForm() {
  const row = incident.value;

  if (!row) return;

  editForm.occurredAt = toLocalInput(row.occurredAt);
  editForm.place = row.place || "";
  editForm.subjectLabel = row.subjectLabel || "";
  editForm.summary = row.summary || "";
  editForm.handlerName = row.handlerName || "";
  editForm.legalBasis = row.legalBasis || "NOT_APPLICABLE";
  editForm.legalBasisNote = row.legalBasisNote || "";
  editForm.transferred119 = Boolean(row.transferred119);
  editForm.closeNote = row.closeNote || "";
}

function fillCareForm(data) {
  const care = data?.care;
  const options = careBasisOptions.value;

  careForm.subjectName = care?.subjectName ?? "";
  careForm.subjectPhone = care?.subjectPhone ?? "";
  careForm.subjectBirth = care?.subjectBirth ?? "";
  careForm.subjectGender = care?.subjectGender ?? "";
  careForm.subjectAge = care?.subjectAge ?? "";
  careForm.chiefComplaint = care?.chiefComplaint ?? "";
  careForm.summary = care?.summary ?? "";
  careForm.history = care?.history ?? "";
  careForm.treatment = care?.treatment ?? "";
  careForm.disposition = care?.disposition ?? "";
  careForm.followup = care?.followup ?? "";
  careForm.reportSource = care?.reportSource ?? "";
  careForm.unconfirmed = care?.unconfirmed ?? "";
  careForm.reportOccurredAt = care?.reportOccurredAt ?? "";
  careForm.reportReceivedAt = care?.reportReceivedAt ?? "";
  careForm.reportChannel = care?.reportChannel ?? "";
  careForm.reporter = care?.reporter ?? "";
  careForm.reportScope = care?.reportScope ?? "";
  careForm.recorderSign = care?.recorderSign ?? "";
  careForm.legalBasis =
    care?.legalBasis && options.includes(care.legalBasis)
      ? care.legalBasis
      : options[0];
  careForm.legalBasisNote = care?.legalBasisNote ?? "";
  careForm.timeline = (data?.timeline ?? []).map((row) => ({
    source: row.source === "REPORT" ? "REPORT" : "DIRECT",
    measuredAt: row.measuredAt ?? "",
    temp: row.temp ?? "",
    bp: row.bp ?? "",
    pulse: row.pulse ?? "",
    spo2: row.spo2 ?? "",
    condition: row.condition ?? "",
  }));
  careForm.meds = (data?.meds ?? []).map((row) => ({
    itemId: row.itemId ?? "",
    name: row.name ?? "",
    qty: row.qty ?? "",
    category: row.category ?? "",
    education: row.education ?? "",
    note: row.note ?? "",
  }));
}

async function loadConsents() {
  if (!incident.value) return;

  try {
    const data = await fetchArcConsents({
      incidentNo: incident.value.incidentNo,
    });

    consents.value = data.consents;
  } catch (error) {
    errorMessage.value = error?.message || "동의서를 불러오지 못했어요.";
  }
}

async function loadAccessRequests() {
  if (!incident.value) return;

  try {
    const data = await fetchArcAccessRequests({
      incidentNo: incident.value.incidentNo,
      scopeAll: canApprove.value,
    });

    accessRequests.value = data.requests;
  } catch (error) {
    if (error?.status !== 403) {
      errorMessage.value =
        error?.message || "열람 승인 내역을 불러오지 못했어요.";
    }
  }
}

async function loadCare() {
  careDenied.value = false;
  careData.value = null;
  careAccess.value = null;

  if (!canSensitive.value) {
    return;
  }

  try {
    const data = await fetchArcCare(incidentId);

    careData.value = data;
    careAccess.value = data.access;
    careRecordId.value = data.care?.id || careRecordId.value;
    fillCareForm(data);
  } catch (error) {
    if (error?.status === 403) {
      careDenied.value = true;
      fillCareForm(null);

      return;
    }

    errorMessage.value = error?.message || "상세기록을 불러오지 못했어요.";
  }
}

async function loadAll() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const detail = await fetchArcIncident(incidentId);

    incident.value = detail.incident;
    careRecordId.value = detail.careRecordId || "";
    // 작성·수정은 ARC 총괄 전용입니다(서버가 다시 확인합니다).
    canCare.value = Boolean(detail.canCare && detail.canWriteCare);
    canSensitive.value = detail.canSensitive;
    canApprove.value = detail.canApprove;
    resetEditForm();
    await Promise.all([loadConsents(), loadAccessRequests()]);
    await loadCare();
    await loadCareFiles();
  } catch (error) {
    errorMessage.value = error?.message || "사건을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

function openEdit() {
  resetEditForm();
  confirmClose.value = false;
  editOpen.value = true;
}

async function saveIncidentPatch(extra) {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const updated = await updateArcIncident(incidentId, {
      ...editForm,
      ...extra,
    });

    if (updated) {
      incident.value = updated;
      resetEditForm();
    }

    okMessage.value = "사건 정보를 저장했어요.";
    confirmClose.value = false;
  } catch (error) {
    errorMessage.value = error?.message || "사건 정보를 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

function closeIncident() {
  return saveIncidentPatch({ status: "CLOSED" });
}

function reopenIncident() {
  return saveIncidentPatch({ status: "OPEN" });
}

async function submitCreateConsent() {
  if (isSavingConsent.value) return;

  isSavingConsent.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await createArcConsent({
      ...consentForm,
      incidentNo: incident.value.incidentNo,
    });

    consentForm.subjectLabel = "";
    consentForm.subjectName = "";
    consentForm.subjectPhone = "";
    consentForm.purpose = "";
    consentForm.scope = "";
    consentForm.retentionUntil = "";
    consentOpen.value = false;
    okMessage.value =
      "동의서를 등록했어요. 서명본을 확인한 뒤 '동의 확인'을 눌러 주세요.";
    await loadConsents();
  } catch (error) {
    errorMessage.value = error?.message || "동의서를 등록하지 못했어요.";
  } finally {
    isSavingConsent.value = false;
  }
}

async function submitConfirmConsent(consentId) {
  if (isSavingConsent.value) return;

  isSavingConsent.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await confirmArcConsent(consentId);
    okMessage.value = "동의 확인을 기록했어요.";
    await loadConsents();
  } catch (error) {
    errorMessage.value = error?.message || "동의 확인을 저장하지 못했어요.";
  } finally {
    isSavingConsent.value = false;
  }
}

async function submitAccessRequest() {
  if (isSavingAccess.value) return;

  isSavingAccess.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await requestArcAccess({
      incidentNo: incident.value.incidentNo,
      purpose: accessPurpose.value,
      evidence: accessEvidence.value,
      careRecordId: careRecordId.value,
    });

    accessPurpose.value = "";
    accessEvidence.value = "";
    okMessage.value =
      "열람 승인을 요청했어요. 승인되면 상세기록을 볼 수 있어요.";
    await loadAccessRequests();
    await loadCare();
  } catch (error) {
    errorMessage.value = error?.message || "열람 승인을 요청하지 못했어요.";
  } finally {
    isSavingAccess.value = false;
  }
}

async function submitDecideAccess(accessId, approve) {
  if (isSavingAccess.value) return;

  isSavingAccess.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await decideArcAccess(accessId, { approve });
    okMessage.value = approve
      ? "열람을 승인했어요."
      : "열람 요청을 거부했어요.";
    await loadAccessRequests();
    await loadCare();
  } catch (error) {
    errorMessage.value = error?.message || "승인 처리를 하지 못했어요.";
  } finally {
    isSavingAccess.value = false;
  }
}

function addTimelineRow() {
  careForm.timeline.push({
    source: "DIRECT",
    measuredAt: "",
    temp: "",
    bp: "",
    pulse: "",
    spo2: "",
    condition: "",
  });
}

function removeTimelineRow(index) {
  careForm.timeline.splice(index, 1);
}

function addMedRow() {
  careForm.meds.push({
    itemId: "",
    name: "",
    qty: "",
    category: "",
    education: "",
    note: "",
  });
}

function removeMedRow(index) {
  careForm.meds.splice(index, 1);
}

async function submitCare() {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const data = await saveArcCare(incidentId, { ...careForm });

    careData.value = {
      ...(careData.value ?? {}),
      care: data.care,
      timeline: data.timeline,
      meds: data.meds,
      addenda: data.addenda,
    };
    careAccess.value = data.access;
    careDenied.value = false;
    fillCareForm(data);
    okMessage.value = "상세기록을 저장했어요.";
    await loadAccessRequests();
  } catch (error) {
    errorMessage.value = error?.message || "상세기록을 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function submitAddendum() {
  if (isSavingAddendum.value) return;

  isSavingAddendum.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    await addArcCareAddendum(incidentId, addendumBody.value);
    addendumBody.value = "";
    okMessage.value = "추가 기록을 남겼어요.";
    await loadCare();
  } catch (error) {
    errorMessage.value = error?.message || "추가 기록을 저장하지 못했어요.";
  } finally {
    isSavingAddendum.value = false;
  }
}

// ── 서식 원본 첨부 ─────────────────────────────────────────────────────

function formatBytes(bytes) {
  const size = Number(bytes ?? 0);

  if (!size) return "-";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10}KB`;

  return `${Math.round(size / (1024 * 102.4)) / 10}MB`;
}

async function loadCareFiles() {
  careFiles.value = [];

  if (!canSensitive.value) return;

  try {
    const data = await fetchArcCareFiles(incidentId);

    careFiles.value = data.files;
  } catch (error) {
    if (error?.status !== 403) {
      careFileError.value =
        error?.message || "첨부된 서식 목록을 불러오지 못했어요.";
    }
  }
}

async function submitCareFile() {
  if (isUploadingFile.value) return;

  const file = careFileInput.value?.files?.[0];

  careFileError.value = "";
  careFileOk.value = "";

  if (!file) {
    careFileError.value = "올릴 파일을 선택해 주세요.";

    return;
  }

  isUploadingFile.value = true;

  try {
    const result = await uploadArcCareFile(incidentId, {
      file,
      kind: careFileKind.value,
      note: careFileNote.value,
    });

    careFileOk.value = result.duplicated
      ? "같은 파일이 이미 첨부되어 있어요. 기존 파일을 그대로 두었어요."
      : `'${result.file?.fileName || file.name}' 파일을 첨부했어요.`;
    careFileNote.value = "";

    if (careFileInput.value) {
      careFileInput.value.value = "";
    }

    await loadCareFiles();
  } catch (error) {
    careFileError.value = error?.message || "파일을 첨부하지 못했어요.";
  } finally {
    isUploadingFile.value = false;
  }
}

async function downloadFile(row) {
  if (isFileBusy.value) return;

  isFileBusy.value = true;
  careFileError.value = "";

  try {
    await downloadArcCareFile(row);
  } catch (error) {
    careFileError.value = error?.message || "파일을 내려받지 못했어요.";
  } finally {
    isFileBusy.value = false;
  }
}

async function removeFile(row) {
  if (isFileBusy.value) return;

  if (
    !window.confirm(
      `'${row.fileName}' 파일을 지울까요? 지운 파일은 되돌릴 수 없어요.`
    )
  ) {
    return;
  }

  isFileBusy.value = true;
  careFileError.value = "";
  careFileOk.value = "";

  try {
    await deleteArcCareFile(row.id);
    careFileOk.value = "첨부 파일을 지웠어요.";
    await loadCareFiles();
  } catch (error) {
    careFileError.value = error?.message || "파일을 지우지 못했어요.";
  } finally {
    isFileBusy.value = false;
  }
}

onMounted(loadAll);
</script>
<style scoped lang="scss">
@use "../../scss/_arc-ui" as *;
.admin-arc-care-view {
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

.badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.section-title {
  margin: 6px 0 0;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.86);
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px 18px;
  margin: 0;

  div {
    display: flex;
    flex-direction: column;
    gap: 4px;

    &.wide {
      grid-column: 1 / -1;
    }
  }

  dt {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  dd {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.86);
  }
}

.field {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);

  input,
  select,
  textarea {
    &:read-only,
    &:disabled {
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.7);
    }
  }
}

.checkbox-field.field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.inline-input {
  &.wide {
    flex: 1;
    min-width: 220px;
  }
}

.gate-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(251, 191, 36, 0.12);
}

.gate-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #fcd34d;
}

.gate-form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cell-input {
  width: 100%;
  min-width: 80px;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 12px;
  font-family: inherit;

  &.narrow {
    min-width: 64px;
  }

  &.wide {
    min-width: 160px;
  }

  &:read-only,
  &:disabled {
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.7);
  }
}

.nowrap {
  white-space: nowrap;
}

.summary-cell {
  max-width: 280px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.78);
}

.kind-badge,
.status-tag,
.plain-tag,
.ok-tag,
.warn-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.kind-badge {
  background: rgba(255, 255, 255, 0.12);

  &.emergency {
    background: rgba(248, 113, 113, 0.22);
    color: #fca5a5;
  }

  &.staff_otc {
    background: rgba(96, 165, 250, 0.2);
    color: #bfdbfe;
  }
}

.plain-tag {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.status-tag {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;

  &.open,
  &.active,
  &.approved {
    background: rgba(52, 211, 153, 0.18);
    color: #6ee7b7;
  }

  &.pending {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.denied,
  &.withdrawn {
    background: rgba(248, 113, 113, 0.18);
    color: #fca5a5;
  }
}

.ok-tag {
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
}

.warn-tag {
  background: rgba(251, 191, 36, 0.18);
  color: #fcd34d;
}

.warn-text {
  font-size: 12px;
  color: #fcd34d;
}

.primary-button {
  &.small {
    padding: 8px 14px;
    font-size: 13px;
  }
}

.preset-button {
  &.tiny {
    padding: 5px 10px;
    font-size: 12px;
  }

  &.danger {
    border-color: rgba(248, 113, 113, 0.4);
    color: #fca5a5;
  }
}

.sub-title {
  grid-column: 1 / -1;
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: rgba(147, 197, 253, 0.9);
}

.notice-box {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(96, 165, 250, 0.28);
  font-size: 12px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.72);

  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: #bfdbfe;
  }

  p {
    margin: 0;
  }
}

.addenda-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
  }
}

.addenda-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.addenda-body {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.82);
  white-space: pre-wrap;
}

.care-file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
  }
}

.care-file-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  strong {
    font-size: 13px;
    word-break: break-all;
  }
}

.care-file-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.care-file-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.care-file-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-top: 12px;
  padding: 14px;
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
}

.empty-box {
  &.small {
    padding: 10px 12px;
    font-size: 12px;
  }
}
</style>
