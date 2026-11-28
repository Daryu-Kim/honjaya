<template>
  <div class="admin-arc-quality-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>품질관리 · 사후검토</h1>
        <p class="description">
          사건이 끝난 뒤에 하는 정리 기록이에요. ① 사후검토(F11) · ② Near
          Miss(F12) · ③ CAPA(F13) · ④ 재고이상(F14) 네 서식과, AS-CAL-001의 연간
          최소 성과기준을 한 화면에서 확인해요. 위에서부터 순서대로 보면 밀린 일
          → 작성 → 성과 확인 순으로 끝나요.
        </p>
      </div>
      <router-link to="/admin/arc" class="link-button">
        응급안전 홈
      </router-link>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="panel flow-panel">
      <h2>이 화면 쓰는 순서</h2>
      <ol class="flow-steps">
        <li>
          <strong>① 밀린 일부터 확인</strong>
          <p>
            아래 '사후검토가 필요한 사건'과 '기한이 지난 조치'를 먼저 봐요. 여기
            뜬 건은 마감이 임박했다는 뜻이에요.
          </p>
        </li>
        <li>
          <strong>② 서식 고르기</strong>
          <p>
            무슨 일이었는지에 따라 F11~F14 중 하나를 골라요. 잘 모르겠으면 아래
            '이런 상황엔 이 서식' 표를 봐요.
          </p>
        </li>
        <li>
          <strong>③ 사실대로 채우기</strong>
          <p>
            누가·언제·어디서·무엇을·어떻게 했는지 시간 순서로 적어요. 추측은
            [의견]이라고 표시해 사실과 구분해요.
          </p>
        </li>
        <li>
          <strong>④ 조치에 담당·기한 넣기</strong>
          <p>
            개선 조치는 담당자와 기한이 있어야 닫혀요. 담당·기한이 없으면 다음
            달에 확인할 수 없어요.
          </p>
        </li>
        <li>
          <strong>⑤ 끝난 조치 닫기</strong>
          <p>
            실제로 했는지 확인한 뒤 완료 처리해요. 효과가 없었으면 CAPA를 다시
            열어 원인부터 다시 봐요.
          </p>
        </li>
      </ol>
      <p class="flow-note">
        손님·직원의 상세 건강정보(약명·증상·복용 시각)는 여기 적지 않아요. 그
        내용은 AS-CARE에만 남기고, 이 화면에는 사실과 개선 내용만 적어요.
      </p>
    </section>

    <section class="panel picker-panel">
      <h2>이런 상황엔 이 서식</h2>
      <div class="picker-grid">
        <article class="picker-card">
          <p class="picker-code">F11 사후검토</p>
          <p class="picker-when">
            응급처치·119 이송처럼 <strong>실제 사건이 끝난 뒤</strong> 되짚을 때
          </p>
          <p class="picker-out">
            남기는 것 · 시각별 진행, 잘 된 점, 개선점, 재발방지 대책
          </p>
        </article>
        <article class="picker-card">
          <p class="picker-code">F12 Near Miss</p>
          <p class="picker-when">
            넘어질 뻔함, 약을 잘못 줄 뻔함처럼 <strong>사고 없이 지나간</strong>
            아슬아슬한 상황
          </p>
          <p class="picker-out">
            남기는 것 · 어떤 상황이었는지, 왜 하마터면 사고가 될 뻔했는지
          </p>
        </article>
        <article class="picker-card">
          <p class="picker-code">F13 CAPA</p>
          <p class="picker-when">
            같은 문제가 <strong>두 번 이상 반복</strong>될 때 (원인 분석 + 조치
            + 효과 확인)
          </p>
          <p class="picker-out">
            남기는 것 · 원인, 시정 조치, 담당·기한, 효과 검증 결과
          </p>
        </article>
        <article class="picker-card">
          <p class="picker-code">F14 재고이상</p>
          <p class="picker-when">
            실사·월 점검에서 <strong>수량이 안 맞거나</strong> 파손·분실·기록
            누락을 발견했을 때
          </p>
          <p class="picker-out">
            남기는 것 · 어떤 물품이 얼마나 어긋났는지, 원인, 정리 결과
          </p>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>올해 성과기준 달성 현황</h2>
        <span class="helper-text">
          {{ summary.kpi.windowLabel }} 기준 · 기준을 넘으면 초록색으로 바뀌어요
        </span>
      </div>

      <div class="kpi-grid">
        <div
          v-for="item in summary.kpi.items"
          :key="item.key"
          class="kpi-card"
          :class="{ reached: item.value >= item.target }"
        >
          <span class="kpi-label">{{ item.label }}</span>
          <strong class="kpi-value">
            {{ item.value }}<small>{{ item.unit }}</small>
          </strong>
          <span class="kpi-target">기준 {{ item.target }}{{ item.unit }}</span>
          <div class="kpi-bar">
            <span :style="{ width: kpiPercent(item) + '%' }"></span>
          </div>
          <span v-if="item.detail" class="kpi-detail">{{ item.detail }}</span>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-card" :class="{ alert: summary.reviewPending > 0 }">
          <span>사후검토 대기</span>
          <strong>{{ summary.reviewPending }}<small>건</small></strong>
        </div>
        <div class="stat-card">
          <span>진행 중 기록</span>
          <strong>{{ summary.openRecords }}<small>건</small></strong>
        </div>
        <div class="stat-card" :class="{ alert: summary.openCapa > 0 }">
          <span>열린 CAPA</span>
          <strong>{{ summary.openCapa }}<small>건</small></strong>
        </div>
        <div class="stat-card" :class="{ alert: summary.overdueActions > 0 }">
          <span>기한 지난 조치</span>
          <strong>{{ summary.overdueActions }}<small>건</small></strong>
        </div>
        <div class="stat-card">
          <span>최근 30일 Near Miss</span>
          <strong>{{ summary.nearMissLast30Days }}<small>건</small></strong>
        </div>
      </div>
    </section>

    <section
      v-if="canWrite && summary.reviewPendingIncidents.length"
      class="panel"
    >
      <div class="panel-head">
        <h2>사후검토가 필요한 사건</h2>
        <span class="helper-text">
          응급·119 사건은 100% 사후검토 대상이에요. 종결된 사건이 남아 있습니다.
        </span>
      </div>

      <ul class="compact-list">
        <li
          v-for="incident in summary.reviewPendingIncidents"
          :key="incident.incidentId"
        >
          <div class="compact-main">
            <span class="incident-no">{{ incident.incidentNo }}</span>
            <span class="compact-title">
              {{ incident.place || "장소 미기록" }} ·
              {{ formatArcDateTime(incident.occurredAt) }}
            </span>
            <span class="days-chip">종결 후 {{ incident.daysSince }}일</span>
          </div>
          <button
            type="button"
            class="preset-button"
            :disabled="isSaving"
            @click="startReview(incident)"
          >
            사후검토 작성
          </button>
        </li>
      </ul>
    </section>

    <section v-if="summary.overdueActionList.length" class="panel warn-panel">
      <div class="panel-head">
        <h2>기한이 지난 조치</h2>
        <span class="helper-text"
          >담당자에게 확인한 뒤 완료 처리해 주세요.</span
        >
      </div>

      <ul class="compact-list">
        <li v-for="action in summary.overdueActionList" :key="action.id">
          <div class="compact-main">
            <span class="compact-title">{{ action.action }}</span>
            <span class="helper-text">
              {{ action.recordNo }} · 담당 {{ action.owner || "미지정" }} · 기한
              {{ formatArcDate(action.dueOn) }}
            </span>
          </div>
          <button
            type="button"
            class="preset-button"
            :disabled="isLoading"
            @click="openRecordById(action.recordNo)"
          >
            기록 열기
          </button>
        </li>
      </ul>
    </section>

    <section v-if="canWrite" class="panel">
      <div class="panel-head">
        <h2>
          {{
            draftMode === "edit"
              ? `기록 수정 · ${draft.recordNo}`
              : "품질관리 기록 작성"
          }}
        </h2>
        <div class="panel-actions">
          <button
            v-if="draftMode"
            type="button"
            class="preset-button"
            @click="cancelDraft"
          >
            작성 취소
          </button>
        </div>
      </div>

      <div v-if="!draftMode" class="kind-picker">
        <button
          v-for="form in forms"
          :key="form.kind"
          type="button"
          class="kind-card"
          @click="startCreate(form.kind)"
        >
          <span class="kind-code">{{ form.code }}</span>
          <strong>{{ form.shortTitle }}</strong>
          <span class="kind-purpose">{{ form.purpose }}</span>
          <span class="kind-cadence">{{ form.cadence }}</span>
        </button>
      </div>
      <p v-if="!draftMode" class="helper-text">
        서식을 고르면 아래에 입력 칸과 작성 안내가 열려요. 작성 중에 다른
        서식으로 바꾸려면 '작성 취소'를 먼저 눌러 주세요.
      </p>

      <template v-if="activeForm">
        <div class="form-guide">
          <p class="guide-title">
            {{ activeForm.code }}. {{ activeForm.title }}
          </p>
          <p class="guide-purpose">{{ activeForm.purpose }}</p>
          <p class="guide-cadence">작성 주기 · {{ activeForm.cadence }}</p>
          <ul class="guide-list">
            <li v-for="line in activeForm.guide" :key="line">{{ line }}</li>
          </ul>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>기록 제목</span>
            <input
              v-model="draft.title"
              type="text"
              placeholder="비워 두면 서식명 · 날짜로 저장돼요"
            />
          </label>
          <label class="field">
            <span>작성일</span>
            <input v-model="draft.heldOn" type="date" />
          </label>
          <label class="field">
            <span>작성자</span>
            <input v-model="draft.authorName" type="text" placeholder="이름" />
          </label>
          <label class="field">
            <span>조치 기한</span>
            <input v-model="draft.dueOn" type="date" />
          </label>
          <label class="field">
            <span>관련 사건 번호</span>
            <input
              v-model="draft.incidentNo"
              type="text"
              placeholder="예: INC-20250101-01"
            />
          </label>
          <label class="field">
            <span>참석·확인 인원</span>
            <input
              v-model="draft.attendees"
              type="text"
              placeholder="예: 총괄 최윤희, 매니저 2명"
            />
          </label>
          <label class="field wide">
            <span>검토 방식·장소</span>
            <input
              v-model="draft.locationMethod"
              type="text"
              placeholder="예: 바 카운터에서 대면 검토 / 서면 회람"
            />
          </label>
          <label class="field wide">
            <span>관련 문서·증빙 ID</span>
            <input
              v-model="draft.relatedDocs"
              type="text"
              placeholder="예: AS-CARE 2025-014, SUP-20250110-01, EDU-20250115-01"
            />
          </label>
        </div>

        <div class="dynamic-fields">
          <template v-for="field in activeForm.fields" :key="field.key">
            <div v-if="field.type === 'check'" class="field wide">
              <span>
                {{ field.label }}
                <em v-if="field.required" class="required">필수</em>
              </span>
              <div class="check-row">
                <label
                  v-for="option in field.options"
                  :key="option.key"
                  class="checkbox-field"
                >
                  <input
                    type="checkbox"
                    :value="option.key"
                    :checked="hasPicked(field.key, option.key)"
                    @change="togglePicked(field.key, option.key)"
                  />
                  <span>{{ option.label }}</span>
                </label>
              </div>
              <small v-if="field.hint">{{ field.hint }}</small>
            </div>

            <label v-else class="field wide">
              <span>
                {{ field.label }}
                <em v-if="field.required" class="required">필수</em>
              </span>
              <textarea
                v-if="field.type === 'textarea'"
                v-model="draft.detail[field.key]"
                :rows="field.rows || 3"
              ></textarea>
              <input v-else v-model="draft.detail[field.key]" type="text" />
              <small v-if="field.hint">{{ field.hint }}</small>
            </label>
          </template>
        </div>

        <div class="action-editor">
          <div class="panel-head">
            <h3>조치 항목</h3>
            <button type="button" class="preset-button" @click="addActionRow">
              + 조치 추가
            </button>
          </div>
          <p v-if="!draft.actions.length" class="helper-text">
            담당자·기한이 있는 조치를 넣어 두면 다음 달 점검에서 자동으로
            확인합니다.
          </p>
          <div
            v-for="(action, index) in draft.actions"
            :key="`action-${index}`"
            class="action-row"
          >
            <label class="field wide">
              <span>조치 내용</span>
              <input
                v-model="action.action"
                type="text"
                placeholder="예: 구급상자 2층 위치 표시 라벨 교체"
              />
            </label>
            <label class="field">
              <span>담당</span>
              <input v-model="action.owner" type="text" placeholder="담당자" />
            </label>
            <label class="field">
              <span>기한</span>
              <input v-model="action.dueOn" type="date" />
            </label>
            <div class="field action-remove">
              <button
                type="button"
                class="preset-button danger"
                @click="draft.actions.splice(index, 1)"
              >
                삭제
              </button>
            </div>
          </div>
        </div>

        <div class="actions">
          <button
            type="button"
            class="primary-button"
            :disabled="isSaving"
            @click="submitDraft"
          >
            {{
              isSaving
                ? "저장 중이에요..."
                : draftMode === "edit"
                ? "수정 저장"
                : "기록 등록"
            }}
          </button>
          <span class="helper-text">
            필수 항목({{ requiredLabels }})은 비울 수 없어요. 기록은 증빙이라
            삭제하지 않고 상태로 닫습니다.
          </span>
        </div>
      </template>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>기록 목록</h2>
        <div class="panel-actions">
          <select v-model="filters.kind" @change="load">
            <option value="">전체 서식</option>
            <option v-for="form in forms" :key="form.kind" :value="form.kind">
              {{ form.code }} {{ form.shortTitle }}
            </option>
          </select>
          <select v-model="filters.status" @change="load">
            <option value="">전체 상태</option>
            <option
              v-for="(label, value) in ARC_QUALITY_STATUS_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
          <input
            v-model="filters.q"
            type="text"
            placeholder="기록번호·제목·본문 검색"
            @keyup.enter="load"
          />
          <button type="button" class="preset-button" @click="load">
            조회
          </button>
        </div>
      </div>

      <p v-if="isLoading" class="empty-box">불러오는 중이에요...</p>
      <p v-else-if="!records.length" class="empty-box">
        아직 기록이 없어요. 사건이 끝났다면 사후검토부터 남겨 주세요.
      </p>

      <ul v-else class="record-list">
        <li
          v-for="record in records"
          :key="record.id"
          class="record-row"
          :class="{ selected: selected?.id === record.id }"
        >
          <div class="row-head">
            <span
              class="kind-chip"
              :class="ARC_QUALITY_KIND_TONES[record.kind]"
            >
              {{ record.formCode }} {{ record.kindLabel }}
            </span>
            <span class="row-title">{{ record.title }}</span>
            <span
              class="status-chip"
              :class="ARC_QUALITY_STATUS_TONES[record.status]"
            >
              {{ ARC_QUALITY_STATUS_LABELS[record.status] || record.status }}
            </span>
            <span class="incident-no">{{ record.recordNo }}</span>
          </div>

          <p v-if="record.preview" class="row-preview">{{ record.preview }}</p>

          <dl class="meta-grid">
            <div>
              <dt>작성일</dt>
              <dd>{{ formatArcDate(record.heldOn) }}</dd>
            </div>
            <div>
              <dt>작성</dt>
              <dd>{{ record.authorName || "-" }}</dd>
            </div>
            <div>
              <dt>연결 사건</dt>
              <dd>{{ record.incidentNo || "-" }}</dd>
            </div>
            <div>
              <dt>조치</dt>
              <dd>
                {{ record.actionStats.done }}/{{ record.actionStats.total }}건
                <template v-if="record.actionStats.overdue">
                  · 기한 지남 {{ record.actionStats.overdue }}건
                </template>
              </dd>
            </div>
            <div>
              <dt>서식 충실도</dt>
              <dd>{{ record.completeness }}%</dd>
            </div>
          </dl>

          <div class="row-actions">
            <button
              type="button"
              class="preset-button"
              :disabled="isLoading"
              @click="openRecord(record.id)"
            >
              상세 보기
            </button>
            <button
              v-if="canWrite"
              type="button"
              class="preset-button"
              :disabled="isSaving"
              @click="startEdit(record.id)"
            >
              수정
            </button>
            <span class="row-note">
              조치 기한 {{ record.dueOn ? formatArcDate(record.dueOn) : "-" }}
            </span>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="selected" class="panel">
      <div class="panel-head">
        <h2>{{ selected.formCode }}. {{ selected.formTitle }}</h2>
        <div class="panel-actions">
          <button type="button" class="preset-button" @click="selected = null">
            닫기
          </button>
        </div>
      </div>

      <div class="row-head">
        <span class="kind-chip" :class="ARC_QUALITY_KIND_TONES[selected.kind]">
          {{ selected.formCode }} {{ selected.kindLabel }}
        </span>
        <span class="row-title">{{ selected.title }}</span>
        <span
          class="status-chip"
          :class="ARC_QUALITY_STATUS_TONES[selected.status]"
        >
          {{ ARC_QUALITY_STATUS_LABELS[selected.status] || selected.status }}
        </span>
        <span class="incident-no">{{ selected.recordNo }}</span>
      </div>

      <dl class="meta-grid">
        <div>
          <dt>작성일</dt>
          <dd>{{ formatArcDate(selected.heldOn) }}</dd>
        </div>
        <div>
          <dt>작성자</dt>
          <dd>{{ selected.authorName || "-" }}</dd>
        </div>
        <div>
          <dt>참석·확인</dt>
          <dd>{{ selected.attendees || "-" }}</dd>
        </div>
        <div>
          <dt>검토 방식</dt>
          <dd>{{ selected.locationMethod || "-" }}</dd>
        </div>
        <div>
          <dt>연결 사건</dt>
          <dd>{{ selected.incidentNo || "-" }}</dd>
        </div>
        <div>
          <dt>관련 문서</dt>
          <dd>{{ selected.relatedDocs || "-" }}</dd>
        </div>
        <div>
          <dt>조치 기한</dt>
          <dd>{{ selected.dueOn ? formatArcDate(selected.dueOn) : "-" }}</dd>
        </div>
        <div>
          <dt>검증·종결</dt>
          <dd>
            {{
              selected.verifiedOn
                ? `${formatArcDate(selected.verifiedOn)} · ${
                    selected.verifiedByName || "-"
                  }`
                : "-"
            }}
          </dd>
        </div>
      </dl>

      <div v-if="selectedIncident" class="linked-incident">
        <p class="guide-title">연결된 사건</p>
        <p class="helper-text">
          {{ selectedIncident.incidentNo }} ·
          {{ formatArcDateTime(selectedIncident.occurredAt) }} ·
          {{ selectedIncident.place || "장소 미기록" }} · 119 이송
          {{ selectedIncident.transferred119 ? "있음" : "없음" }}
        </p>
        <p v-if="selectedIncident.summary" class="row-preview">
          {{ selectedIncident.summary }}
        </p>
      </div>

      <div class="detail-fields">
        <div
          v-for="field in selectedFormFields"
          :key="field.key"
          class="detail-item"
        >
          <span class="detail-label">{{ field.label }}</span>
          <template v-if="field.type === 'check'">
            <div class="chip-row">
              <span
                v-for="key in checkoutList(field, selected.detail)"
                :key="key"
                class="option-chip"
              >
                {{ optionLabel(field, key) }}
              </span>
              <span
                v-if="!checkoutList(field, selected.detail).length"
                class="helper-text"
              >
                선택 없음
              </span>
            </div>
          </template>
          <p v-else class="detail-text">
            {{ selected.detail?.[field.key] || "-" }}
          </p>
        </div>
      </div>

      <div class="action-editor">
        <div class="panel-head">
          <h3>조치 항목</h3>
          <span class="helper-text">
            완료 {{ selected.actionStats.done }}/{{
              selected.actionStats.total
            }}건
          </span>
        </div>

        <p v-if="!selected.actions.length" class="helper-text">
          등록된 조치가 없어요.
        </p>

        <ul v-else class="action-list">
          <li
            v-for="action in selected.actions"
            :key="action.id"
            class="action-item"
            :class="{ done: action.doneOn, overdue: action.overdue }"
          >
            <div class="compact-main">
              <span class="compact-title"
                >{{ action.seq }}. {{ action.action }}</span
              >
              <span class="helper-text">
                담당 {{ action.owner || "미지정" }} · 기한
                {{ action.dueOn ? formatArcDate(action.dueOn) : "-" }} · 완료
                {{ action.doneOn ? formatArcDate(action.doneOn) : "-" }}
              </span>
              <span v-if="action.doneNote" class="helper-text">
                완료 메모 · {{ action.doneNote }}
              </span>
            </div>
            <div v-if="canWrite" class="row-actions">
              <button
                type="button"
                class="preset-button"
                :disabled="isSaving"
                @click="toggleAction(action)"
              >
                {{ action.doneOn ? "완료 취소" : "완료 처리" }}
              </button>
              <button
                type="button"
                class="preset-button danger"
                :disabled="isSaving"
                @click="removeAction(action)"
              >
                삭제
              </button>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="canWrite" class="status-bar">
        <label class="field">
          <span>기록 상태</span>
          <select v-model="statusDraft">
            <option
              v-for="option in statusOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <label v-if="selected.kind === 'CAPA'" class="field">
          <span>효과 검증 결과</span>
          <select v-model="verdictDraft">
            <option value="">미검증</option>
            <option
              v-for="(label, value) in ARC_QUALITY_VERDICT_LABELS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving || !statusDirty"
          @click="saveStatus"
        >
          상태 저장
        </button>
        <span class="helper-text">
          CAPA는 효과 검증 결과를 골라야 '효과 확인'으로 넘어갈 수 있어요.
        </span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";

import {
  ARC_QUALITY_KIND_TONES,
  ARC_QUALITY_STATUS_LABELS,
  ARC_QUALITY_STATUS_TONES,
  ARC_QUALITY_VERDICT_LABELS,
  createArcQuality,
  deleteArcQualityAction,
  fetchArcQuality,
  fetchArcQualityRecord,
  formatArcDate,
  formatArcDateTime,
  toggleArcQualityAction,
  updateArcQuality,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";

const records = ref([]);
const forms = ref([]);
const selected = ref(null);
const selectedIncident = ref(null);
const summary = ref(emptySummary());
const canWrite = ref(hasPermission("arc.quality"));
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const filters = reactive({ kind: "", status: "", q: "" });

const draftMode = ref("");
const draft = reactive(emptyDraft());
const statusDraft = ref("");
const verdictDraft = ref("");

function emptySummary() {
  return {
    openRecords: 0,
    openCapa: 0,
    overdueActions: 0,
    nearMissLast30Days: 0,
    reviewPending: 0,
    reviewPendingIncidents: [],
    overdueActionList: [],
    kpi: { windowLabel: "최근 12개월", items: [] },
  };
}

function emptyDraft() {
  return {
    recordId: "",
    recordNo: "",
    kind: "",
    title: "",
    heldOn: todayIso(),
    dueOn: "",
    authorName: "",
    attendees: "",
    locationMethod: "",
    incidentNo: "",
    relatedDocs: "",
    detail: {},
    actions: [],
  };
}

function todayIso() {
  const now = new Date();
  const offset = -now.getTimezoneOffset();

  return new Date(now.getTime() + offset * 60_000).toISOString().slice(0, 10);
}

const activeForm = computed(
  () => forms.value.find((form) => form.kind === draft.kind) ?? null
);

const requiredLabels = computed(() =>
  (activeForm.value?.fields ?? [])
    .filter((field) => field.required)
    .map((field) => field.label)
    .join(" · ")
);

const selectedFormFields = computed(
  () =>
    forms.value.find((form) => form.kind === selected.value?.kind)?.fields ?? []
);

const statusDirty = computed(
  () =>
    Boolean(selected.value) &&
    (statusDraft.value !== selected.value.status ||
      verdictDraft.value !== (selected.value.verdict || ""))
);

// CAPA만 '효과 확인'을 쓸 수 있고, 종결은 어느 서식이나 가능합니다.
const statusOptions = computed(() => {
  const base = [
    { value: "OPEN", label: ARC_QUALITY_STATUS_LABELS.OPEN },
    { value: "IN_PROGRESS", label: ARC_QUALITY_STATUS_LABELS.IN_PROGRESS },
  ];

  if (selected.value?.kind === "CAPA") {
    base.push({ value: "VERIFIED", label: ARC_QUALITY_STATUS_LABELS.VERIFIED });
  }

  base.push({ value: "CLOSED", label: ARC_QUALITY_STATUS_LABELS.CLOSED });

  return base;
});

watch(selected, (record) => {
  statusDraft.value = record?.status ?? "";
  verdictDraft.value = record?.verdict ?? "";
});

function kpiPercent(item) {
  const target = Number(item.target) || 0;
  const value = Number(item.value) || 0;

  if (!target) return 0;

  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function hasPicked(key, optionKey) {
  const picked = draft.detail[key];

  return Array.isArray(picked) && picked.includes(optionKey);
}

function togglePicked(key, optionKey) {
  const picked = Array.isArray(draft.detail[key]) ? [...draft.detail[key]] : [];
  const index = picked.indexOf(optionKey);

  if (index >= 0) {
    picked.splice(index, 1);
  } else {
    picked.push(optionKey);
  }

  draft.detail[key] = picked;
}

/** 서식이 바뀌면 상세 항목을 서식 정의에 맞춰 새로 만듭니다. */
function resetDetail() {
  const detail = {};

  for (const field of activeForm.value?.fields ?? []) {
    detail[field.key] = field.type === "check" ? [] : "";
  }

  draft.detail = detail;
}

function checkoutList(field, detail) {
  const picked = detail?.[field.key];

  return Array.isArray(picked) ? picked : [];
}

function optionLabel(field, key) {
  return field.options?.find((option) => option.key === key)?.label ?? key;
}

function addActionRow() {
  if (draft.actions.length >= 30) return;

  draft.actions.push({ action: "", owner: "", dueOn: "" });
}

function startCreate(kind) {
  const fresh = emptyDraft();

  Object.assign(draft, fresh, { kind });
  resetDetail();
  draftMode.value = "create";
  okMessage.value = "";
  errorMessage.value = "";
}

function startReview(incident) {
  startCreate("REVIEW");
  draft.incidentNo = incident.incidentNo;

  if (incident.place) {
    draft.detail.case_summary = `${formatArcDateTime(incident.occurredAt)} · ${
      incident.place
    }에서 발생한 사건입니다. `;
  }
}

function cancelDraft() {
  draftMode.value = "";
  Object.assign(draft, emptyDraft());
}

async function startEdit(recordId) {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchArcQualityRecord(recordId);
    const record = data.record;

    Object.assign(draft, {
      recordId: record.id,
      recordNo: record.recordNo,
      kind: record.kind,
      title: record.title,
      heldOn: record.heldOn,
      dueOn: record.dueOn,
      authorName: record.authorName,
      attendees: record.attendees,
      locationMethod: record.locationMethod,
      incidentNo: record.incidentNo,
      relatedDocs: record.relatedDocs,
      detail: { ...record.detail },
      actions: record.actions.map((action) => ({
        action: action.action,
        owner: action.owner,
        dueOn: action.dueOn,
        doneOn: action.doneOn,
        doneNote: action.doneNote,
      })),
    });

    for (const field of activeForm.value?.fields ?? []) {
      if (field.type === "check" && !Array.isArray(draft.detail[field.key])) {
        draft.detail[field.key] = [];
      }
    }

    draftMode.value = "edit";
    selected.value = record;
    selectedIncident.value = data.incident;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    errorMessage.value = error?.message || "기록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

function draftPayload() {
  return {
    title: draft.title,
    heldOn: draft.heldOn,
    dueOn: draft.dueOn,
    authorName: draft.authorName,
    attendees: draft.attendees,
    locationMethod: draft.locationMethod,
    incidentNo: draft.incidentNo,
    relatedDocs: draft.relatedDocs,
    detail: { ...draft.detail },
    actions: draft.actions
      .filter((action) => action.action || action.owner)
      .map((action) => ({
        action: action.action,
        owner: action.owner,
        dueOn: action.dueOn,
        doneOn: action.doneOn || "",
        doneNote: action.doneNote || "",
      })),
  };
}

async function submitDraft() {
  if (isSaving.value || !activeForm.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    const data =
      draftMode.value === "edit"
        ? await updateArcQuality(draft.recordId, draftPayload())
        : await createArcQuality({ kind: draft.kind, ...draftPayload() });

    applyRecord(data);
    okMessage.value =
      draftMode.value === "edit"
        ? "기록을 수정했어요."
        : "기록을 등록했어요. 조치 항목은 목록에서 완료 처리할 수 있어요.";
    cancelDraft();
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "기록을 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

function applyRecord(data) {
  selected.value = data.record;
  selectedIncident.value = data.incident ?? null;
}

async function openRecord(recordId) {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    applyRecord(await fetchArcQualityRecord(recordId));
  } catch (error) {
    errorMessage.value = error?.message || "기록을 열지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function openRecordById(recordNo) {
  const target = records.value.find((record) => record.recordNo === recordNo);

  if (target) {
    await openRecord(target.id);
    return;
  }

  okMessage.value = `${recordNo} 기록은 목록에서 눌러 열어 주세요.`;
}

async function toggleAction(action) {
  if (!selected.value || isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    applyRecord(
      await toggleArcQualityAction(selected.value.id, action.id, {
        done: !action.doneOn,
      })
    );
    okMessage.value = action.doneOn
      ? "완료를 취소했어요."
      : "완료로 처리했어요.";
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "조치 항목을 바꾸지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function removeAction(action) {
  if (!selected.value || isSaving.value) return;

  const confirmed = window.confirm(
    `"${action.action}" 조치 항목을 삭제할까요? 되돌릴 수 없어요.`
  );

  if (!confirmed) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    applyRecord(await deleteArcQualityAction(selected.value.id, action.id));
    okMessage.value = "조치 항목을 삭제했어요.";
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "조치 항목을 삭제하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function saveStatus() {
  if (!selected.value || isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = "";
  okMessage.value = "";

  try {
    applyRecord(
      await updateArcQuality(selected.value.id, {
        status: statusDraft.value,
        verdict: verdictDraft.value,
      })
    );
    okMessage.value = "기록 상태를 저장했어요.";
    await load();
  } catch (error) {
    errorMessage.value = error?.message || "기록 상태를 저장하지 못했어요.";
  } finally {
    isSaving.value = false;
  }
}

async function load() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchArcQuality({
      kind: filters.kind,
      status: filters.status,
      q: filters.q,
    });

    records.value = data.records ?? [];
    forms.value = data.forms ?? [];
    summary.value = data.summary ?? emptySummary();
    canWrite.value = Boolean(data.canWrite);
  } catch (error) {
    errorMessage.value = error?.message || "품질관리 기록을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.admin-arc-quality-view {
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
  flex-wrap: wrap;
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
  max-width: 720px;
  font-size: 14px;
  line-height: 1.7;
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

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
  }
}

.warn-panel {
  background: rgba(251, 191, 36, 0.1);
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

  select,
  input {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    font-size: 12px;
  }
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.kpi-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);

  &.reached {
    border-color: rgba(52, 211, 153, 0.4);
    background: rgba(52, 211, 153, 0.1);
  }

  .kpi-label {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.62);
  }

  .kpi-value {
    font-size: 24px;
    font-weight: 800;

    small {
      margin-left: 3px;
      font-size: 12px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.5);
    }
  }

  .kpi-target,
  .kpi-detail {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
  }
}

.kpi-bar {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #6366f1, #34d399);
  }
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }

  strong {
    font-size: 20px;
    font-weight: 800;

    small {
      margin-left: 3px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.45);
    }
  }

  &.alert {
    background: rgba(251, 191, 36, 0.14);

    strong {
      color: #fcd34d;
    }
  }
}

.kind-picker {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.kind-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  text-align: left;
  cursor: pointer;

  .kind-code {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.5);
  }

  strong {
    font-size: 15px;
    font-weight: 800;
  }

  .kind-purpose {
    font-size: 12px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.6);
  }

  .kind-cadence {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.42);
  }

  &:hover {
    border-color: rgba(99, 102, 241, 0.55);
    background: rgba(99, 102, 241, 0.16);
  }
}

.form-guide {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(99, 102, 241, 0.12);

  .guide-title {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
  }

  .guide-purpose,
  .guide-cadence {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
  }

  .guide-list {
    margin: 4px 0 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.6);
  }
}

.field-grid,
.dynamic-fields {
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
  select,
  textarea {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    font-size: 13px;
    font-family: inherit;
    line-height: 1.6;
    resize: vertical;
  }

  small {
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.6;
  }

  .required {
    margin-left: 4px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(248, 113, 113, 0.2);
    color: #fca5a5;
    font-size: 10px;
    font-style: normal;
    font-weight: 800;
  }
}

.check-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.action-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.action-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);

  .field.wide {
    grid-column: 1 / -1;
  }
}

.action-remove {
  justify-content: flex-end;
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
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
}

.flow-panel {
  gap: 12px;
}

.flow-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.24);
  }

  strong {
    font-size: 13px;
    font-weight: 800;
    color: #f8fafc;
  }

  p {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
    color: rgba(226, 232, 240, 0.78);
  }
}

.flow-note {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(253, 230, 138, 0.1);
  border: 1px solid rgba(253, 230, 138, 0.28);
  font-size: 12px;
  line-height: 1.7;
  color: #fde68a;
}

.picker-panel {
  gap: 12px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}

.picker-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.24);
}

.picker-code {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  color: #7dd3fc;
}

.picker-when {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.86);

  strong {
    color: #fef3c7;
    font-weight: 700;
  }
}

.picker-out {
  margin: 0;
  font-size: 11px;
  line-height: 1.7;
  color: rgba(148, 163, 184, 0.9);
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

.compact-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
  }
}

.compact-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 220px;
  flex: 1;
}

.compact-title {
  font-size: 13px;
  font-weight: 700;
}

.days-chip {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.18);
  color: #fcd34d;
  font-size: 11px;
  font-weight: 800;
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.record-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);

  &.selected {
    background: rgba(99, 102, 241, 0.14);
  }
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

.row-preview {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.6);
}

.incident-no {
  font-family: monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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

  &.ok {
    background: rgba(52, 211, 153, 0.18);
    color: #6ee7b7;
  }

  &.info {
    background: rgba(99, 102, 241, 0.22);
    color: #c7d2fe;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.alert {
    background: rgba(248, 113, 113, 0.18);
    color: #fca5a5;
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

  &.info {
    background: rgba(99, 102, 241, 0.22);
    color: #c7d2fe;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.alert {
    background: rgba(248, 113, 113, 0.18);
    color: #fca5a5;
  }

  &.muted {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.62);
  }
}

.linked-incident {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);

  .guide-title {
    margin: 0;
    font-size: 13px;
    font-weight: 800;
  }
}

.detail-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.detail-label {
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.5);
}

.detail-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.82);
  white-space: pre-wrap;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.option-chip {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.2);
  color: #c7d2fe;
  font-size: 11px;
  font-weight: 700;
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.action-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);

  &.done {
    background: rgba(52, 211, 153, 0.1);
  }

  &.overdue {
    background: rgba(251, 191, 36, 0.12);
  }
}

.status-bar {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);

  .field {
    min-width: 180px;
  }
}

@media (max-width: 640px) {
  .admin-arc-quality-view {
    padding: 16px;
  }

  .row-note {
    margin-left: 0;
  }
}
</style>
