<template>
  <div class="admin-arc-events-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>행사·의료지원</h1>
        <p class="description">
          혼자야에서 여는 행사마다 ARC가 무엇을 하는지 한 장으로 남겨요. 지원
          수준 · 행사의료진 구성 · 위험평가 · 행사 전/당일/종료 후 체크리스트 ·
          배정 인력과 AS-NOT-001 고지서 교부까지 이 화면에서 마무리합니다.
        </p>
      </div>
      <div class="header-links">
        <router-link to="/admin/arc" class="link-button"
          >응급안전 홈</router-link
        >
        <router-link to="/admin/arc/incidents" class="link-button">
          사건 접수
        </router-link>
      </div>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="panel">
      <div class="panel-head">
        <h2>행사·의료지원 현황</h2>
        <span class="helper-text">{{ summary.kpi.windowLabel }} 기준</span>
      </div>

      <div class="kpi-grid">
        <div v-for="item in summary.kpi.items" :key="item.key" class="kpi-card">
          <span class="kpi-label">{{ item.label }}</span>
          <strong class="kpi-value">{{ item.value }}</strong>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-card">
          <span>예정 행사</span>
          <strong>{{ summary.upcoming }}<small>건</small></strong>
        </div>
        <div class="stat-card" :class="{ alert: summary.thisWeek > 0 }">
          <span>이번 주(7일)</span>
          <strong>{{ summary.thisWeek }}<small>건</small></strong>
        </div>
        <div class="stat-card" :class="{ alert: summary.needsAttention > 0 }">
          <span>준비 미달</span>
          <strong>{{ summary.needsAttention }}<small>건</small></strong>
        </div>
        <div class="stat-card" :class="{ alert: summary.noticeMissing > 0 }">
          <span>고지서 미교부</span>
          <strong>{{ summary.noticeMissing }}<small>명</small></strong>
        </div>
        <div class="stat-card" :class="{ alert: summary.pastOpen > 0 }">
          <span>종료 미정리</span>
          <strong>{{ summary.pastOpen }}<small>건</small></strong>
        </div>
      </div>

      <p class="helper-text">
        지원 수준을 「현장 대기」 이상으로 올리면 AS-OPS-001 06-B-3에 따라
        범위초과 업무 사전합의가 필요해요. 외부 의료인·구급대가 들어오면
        AS-NOT-001 고지서를 1인당 1부 교부합니다.
      </p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>다가오는 행사</h2>
        <span class="helper-text"
          >D-day 순서 · 준비율과 막는 항목을 함께 봐요</span
        >
      </div>

      <div class="panel-actions">
        <button
          v-if="canWrite"
          type="button"
          class="primary-button"
          :disabled="isLoading"
          @click="startCreate"
        >
          새 행사 등록
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

      <p v-if="!summary.upcomingEvents.length" class="empty-box">
        예정된 행사가 없어요. 행사를 등록하면 준비 체크리스트가 자동으로
        만들어집니다.
      </p>

      <ul v-else class="event-list">
        <li v-for="event in summary.upcomingEvents" :key="event.id">
          <div class="event-head">
            <span class="dday-chip" :class="ddayTone(event.dDay)">
              {{ event.dayLabel }}
            </span>
            <div class="event-title">
              <strong>{{ event.title }}</strong>
              <span class="helper-text">
                {{ event.eventNo }} · {{ event.kindLabel }} ·
                {{ event.scheduleLabel }}
                <template v-if="event.venue"> · {{ event.venue }}</template>
                <template v-if="event.expectedGuests">
                  · 예상 {{ event.expectedGuests }}명
                </template>
              </span>
            </div>
            <span class="status-chip" :class="event.arcLevelTone">
              {{ event.arcLevelLabel }}
            </span>
            <span class="status-chip" :class="event.statusTone">
              {{ event.statusLabel }}
            </span>
            <span class="risk-chip" :class="event.riskBandTone">
              R {{ event.riskScore }} · {{ event.riskBandLabel }}
            </span>
          </div>

          <div class="event-progress">
            <div class="progress-bar">
              <span :style="{ width: event.prepPercent + '%' }"></span>
            </div>
            <span class="helper-text">
              체크리스트 {{ event.taskStats.done }}/{{
                event.taskStats.total
              }}
              ({{ event.prepPercent }}%)
              <template v-if="event.staffStats.total">
                · 배정 인력 {{ event.staffStats.total }}명
              </template>
            </span>
          </div>

          <ul v-if="event.blockers.length" class="blocker-list">
            <li
              v-for="blocker in event.blockers"
              :key="blocker.key"
              :class="blocker.severity"
            >
              <strong>{{ blocker.label }}</strong>
              <span>{{ blocker.hint }}</span>
            </li>
          </ul>

          <div class="event-actions">
            <button
              type="button"
              class="preset-button"
              :disabled="isLoading"
              @click="openEvent(event.id)"
            >
              상세 · 체크리스트
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="canWrite && draftMode" class="panel">
      <div class="panel-head">
        <h2>{{ draftMode === "create" ? "행사 등록" : "행사 수정" }}</h2>
        <span class="helper-text">
          등록하면 행사 유형에 맞는 체크리스트가 자동으로 만들어집니다.
        </span>
      </div>

      <div class="form-block">
        <h3>기본 정보</h3>
        <div class="field-grid">
          <label class="field wide">
            <span>행사명 <b>*</b></span>
            <input
              v-model.trim="draft.title"
              type="text"
              maxlength="160"
              placeholder="예: 12월 어쿠스틱 라이브"
            />
          </label>

          <label class="field">
            <span>시작일 <b>*</b></span>
            <input v-model="draft.startsOn" type="date" />
          </label>
          <label class="field">
            <span>시작 시간</span>
            <input v-model="draft.startTime" type="time" />
          </label>
          <label class="field">
            <span>종료일</span>
            <input v-model="draft.endsOn" type="date" />
          </label>
          <label class="field">
            <span>종료 시간</span>
            <input v-model="draft.endTime" type="time" />
          </label>

          <label class="field wide">
            <span>장소</span>
            <input
              v-model.trim="draft.venue"
              type="text"
              maxlength="200"
              placeholder="예: 혼자야 본점 홀"
            />
          </label>

          <label class="field">
            <span>예상 인원</span>
            <input
              v-model.number="draft.expectedGuests"
              type="number"
              min="0"
            />
          </label>
          <label class="field">
            <span>비용 처리</span>
            <select v-model="draft.billing">
              <option value="NONE">없음</option>
              <option value="EXPENSE">실비정산</option>
              <option value="CONTRACT">별도 계약</option>
            </select>
          </label>
        </div>

        <div class="checkbox-row">
          <label class="checkbox-field">
            <input v-model="draft.outdoor" type="checkbox" />
            <span>야외 행사</span>
          </label>
          <label class="checkbox-field">
            <input v-model="draft.servesAlcohol" type="checkbox" />
            <span>주류 제공</span>
          </label>
          <label class="checkbox-field">
            <input v-model="draft.servesFood" type="checkbox" />
            <span>음식 제공</span>
          </label>
        </div>

        <h3>행사 유형</h3>
        <div class="kind-grid">
          <button
            v-for="kind in catalogs.kinds"
            :key="kind.key"
            type="button"
            class="kind-card"
            :class="[kind.tone, { active: draft.kind === kind.key }]"
            @click="draft.kind = kind.key"
          >
            <strong>{{ kind.label }}</strong>
            <span>{{ kind.guidance }}</span>
            <em v-if="kind.risks.length">
              주요 위험 · {{ kind.risks.join(" · ") }}
            </em>
          </button>
        </div>

        <h3>주최 · 담당</h3>
        <div class="field-grid">
          <label class="field">
            <span>주최·기획</span>
            <input
              v-model.trim="draft.organizer"
              type="text"
              maxlength="200"
              placeholder="예: 외부 기획사 / 아티스트"
            />
          </label>
          <label class="field">
            <span>담당자</span>
            <input v-model.trim="draft.hostName" type="text" maxlength="200" />
          </label>
          <label class="field">
            <span>담당 연락처</span>
            <input
              v-model.trim="draft.hostContact"
              type="text"
              maxlength="40"
            />
          </label>
        </div>

        <h3>ARC 지원 수준</h3>
        <div class="level-grid">
          <button
            v-for="level in catalogs.levels"
            :key="level.key"
            type="button"
            class="level-card"
            :class="[level.tone, { active: draft.arcLevel === level.key }]"
            @click="draft.arcLevel = level.key"
          >
            <strong>{{ level.label }}</strong>
            <span>{{ level.description }}</span>
            <em v-if="level.requiresAgreement">사전합의 필요</em>
          </button>
        </div>

        <h3>행사의료진 구성</h3>
        <div class="field-grid">
          <label class="field wide">
            <span>의료지원 방식</span>
            <select v-model="draft.medicMode">
              <option
                v-for="mode in catalogs.medicModes"
                :key="mode.key"
                :value="mode.key"
              >
                {{ mode.label }} — {{ mode.description }}
              </option>
            </select>
          </label>
        </div>

        <h3>위험평가 (R = 가능성 × 중대성)</h3>
        <div class="risk-row">
          <label class="field">
            <span>가능성 L</span>
            <select v-model.number="draft.riskL">
              <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <label class="field">
            <span>중대성 S</span>
            <select v-model.number="draft.riskS">
              <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <div class="risk-result">
            <span class="risk-chip" :class="draftRisk.tone">
              R {{ draftRisk.score }} · {{ draftRisk.label }}
            </span>
            <span class="helper-text">
              {{ riskGuidance }}
            </span>
          </div>
        </div>

        <label class="checkbox-field wide">
          <input v-model="draft.scopeAgreed" type="checkbox" />
          <span>
            범위초과 업무 사전합의 완료 (현장대기·행사의료진 배치는 무상범위 밖)
          </span>
        </label>
        <label class="field wide">
          <span>사전합의 근거</span>
          <textarea
            v-model.trim="draft.scopeNote"
            rows="2"
            maxlength="1000"
            placeholder="예: 2026-12-01 대표 승인 / 견적서 별도 발송"
          ></textarea>
        </label>

        <h3>현장 정보(EAP)</h3>
        <div class="field-grid">
          <label class="field">
            <span>AED 위치</span>
            <input
              v-model.trim="draft.aedLocation"
              type="text"
              maxlength="200"
              placeholder="예: 바 카운터 옆 벽면"
            />
          </label>
          <label class="field">
            <span>집결지</span>
            <input
              v-model.trim="draft.assemblyPoint"
              type="text"
              maxlength="200"
              placeholder="예: 입구 앞 주차장"
            />
          </label>
          <label class="field">
            <span>인계 병원</span>
            <input
              v-model.trim="draft.nearestEr"
              type="text"
              maxlength="200"
              placeholder="예: ○○병원 응급실 (차량 7분)"
            />
          </label>
          <label class="field wide">
            <span>응급행동계획 요약</span>
            <textarea
              v-model.trim="draft.eapNote"
              rows="3"
              maxlength="1000"
              placeholder="119 신고 담당 · 안내 담당 · 기록 담당 · 이송 동선"
            ></textarea>
          </label>
        </div>

        <label class="checkbox-field wide">
          <input v-model="draft.promoChecked" type="checkbox" />
          <span>
            홍보물·안내문 금지표현 검수 완료 (상주 의료진 / 24시간 대기 / 진료
            가능 / 의료기관 수준 처치 / 안전보장 인증)
          </span>
        </label>

        <label class="field wide">
          <span>메모</span>
          <textarea
            v-model.trim="draft.notes"
            rows="3"
            maxlength="2000"
            placeholder="주최 측 요청, 특이사항, 이전 행사 개선점 등"
          ></textarea>
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          :disabled="isSaving"
          @click="submitDraft"
        >
          {{ isSaving ? "저장 중…" : "저장" }}
        </button>
        <button type="button" class="preset-button" @click="cancelDraft">
          닫기
        </button>
      </div>
    </section>

    <section v-if="selected" class="panel">
      <div class="panel-head">
        <h2>
          {{ selected.title }}
          <small class="event-no">{{ selected.eventNo }}</small>
        </h2>
        <div class="panel-actions">
          <select v-model="statusDraft" class="status-select">
            <option
              v-for="status in catalogs.statuses"
              :key="status.key"
              :value="status.key"
            >
              {{ status.label }}
            </option>
          </select>
          <button
            v-if="canWrite && statusDraft !== selected.status"
            type="button"
            class="primary-button"
            :disabled="isSaving"
            @click="saveStatus"
          >
            상태 저장
          </button>
          <button
            v-if="canWrite"
            type="button"
            class="preset-button"
            :disabled="isSaving"
            @click="startEdit(selected)"
          >
            내용 수정
          </button>
          <button
            v-if="canWrite"
            type="button"
            class="preset-button danger"
            :disabled="isSaving"
            @click="removeEvent"
          >
            삭제
          </button>
        </div>
      </div>

      <p v-if="selected.cancelReason" class="helper-text">
        취소 사유 · {{ selected.cancelReason }}
      </p>

      <div class="meta-grid">
        <div>
          <span>일시</span><strong>{{ selected.scheduleLabel || "-" }}</strong>
        </div>
        <div>
          <span>장소</span><strong>{{ selected.venue || "-" }}</strong>
        </div>
        <div>
          <span>예상 인원</span>
          <strong>{{ selected.expectedGuests || "-" }}명</strong>
        </div>
        <div>
          <span>주류·음식</span>
          <strong>
            {{ selected.servesAlcohol ? "주류" : "주류 없음" }} ·
            {{ selected.servesFood ? "음식" : "음식 없음" }}
          </strong>
        </div>
        <div>
          <span>지원 수준</span>
          <strong>
            <span class="status-chip" :class="selected.arcLevelTone">
              {{ selected.arcLevelLabel }}
            </span>
          </strong>
        </div>
        <div>
          <span>의료지원</span>
          <strong>{{ selected.medicModeLabel }}</strong>
        </div>
        <div>
          <span>위험평가</span>
          <strong>
            <span class="risk-chip" :class="selected.riskBandTone">
              R {{ selected.riskScore }} · {{ selected.riskBandLabel }}
            </span>
          </strong>
        </div>
        <div>
          <span>사전합의</span>
          <strong>{{ selected.scopeAgreed ? "완료" : "미완료" }}</strong>
        </div>
        <div>
          <span>홍보물 검수</span>
          <strong>{{ selected.promoChecked ? "완료" : "미완료" }}</strong>
        </div>
        <div>
          <span>주최</span><strong>{{ selected.organizer || "-" }}</strong>
        </div>
        <div>
          <span>담당자</span><strong>{{ selected.hostName || "-" }}</strong>
        </div>
        <div>
          <span>연락처</span><strong>{{ selected.hostContact || "-" }}</strong>
        </div>
        <div>
          <span>AED</span><strong>{{ selected.aedLocation || "-" }}</strong>
        </div>
        <div>
          <span>집결지</span
          ><strong>{{ selected.assemblyPoint || "-" }}</strong>
        </div>
        <div>
          <span>인계 병원</span><strong>{{ selected.nearestEr || "-" }}</strong>
        </div>
        <div>
          <span>등록</span><strong>{{ selected.createdByName || "-" }}</strong>
        </div>
      </div>

      <div v-if="selected.eapNote" class="note-box">
        <strong>응급행동계획</strong>
        <p>{{ selected.eapNote }}</p>
      </div>
      <div v-if="selected.notes" class="note-box">
        <strong>메모</strong>
        <p>{{ selected.notes }}</p>
      </div>

      <ul v-if="selected.blockers.length" class="blocker-list">
        <li
          v-for="blocker in selected.blockers"
          :key="blocker.key"
          :class="blocker.severity"
        >
          <strong>{{ blocker.label }}</strong>
          <span>{{ blocker.hint }}</span>
        </li>
      </ul>

      <h3>체크리스트</h3>
      <p class="helper-text">
        필수 항목을 모두 마쳐야 「준비 완료」·「종료」로 바꿀 수 있어요. 지금
        필수 미완료
        {{ selected.taskStats.requiredOpen }}건.
      </p>

      <div class="phase-grid">
        <div
          v-for="phase in catalogs.phases"
          :key="phase.key"
          class="phase-column"
        >
          <div class="phase-head">
            <strong>{{ phase.label }}</strong>
            <span class="helper-text">
              {{ selected.taskStats[phase.key].done }}/{{
                selected.taskStats[phase.key].total
              }}
            </span>
          </div>

          <ul class="task-list">
            <li
              v-for="task in tasksOfPhase(phase.key)"
              :key="task.id"
              :class="{ done: task.done }"
            >
              <button
                type="button"
                class="task-toggle"
                :disabled="!canWrite || isSaving"
                @click="toggleTask(task)"
              >
                {{ task.done ? "✓" : "○" }}
              </button>
              <div class="task-body">
                <span class="task-label">
                  {{ task.label }}
                  <b v-if="task.required" class="required-mark">필수</b>
                </span>
                <span v-if="task.hint" class="helper-text">{{
                  task.hint
                }}</span>
                <span v-if="task.done" class="task-done">
                  {{ task.doneOn }} · {{ task.doneByName || "기록자 미상" }}
                </span>
              </div>
              <button
                v-if="canWrite && !task.required && !task.done"
                type="button"
                class="icon-button"
                title="항목 삭제"
                :disabled="isSaving"
                @click="removeTask(task)"
              >
                ×
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="canWrite" class="inline-form">
        <select v-model="newTask.phase">
          <option
            v-for="phase in catalogs.phases"
            :key="phase.key"
            :value="phase.key"
          >
            {{ phase.label }}
          </option>
        </select>
        <input
          v-model.trim="newTask.label"
          type="text"
          maxlength="200"
          placeholder="추가로 챙길 항목"
        />
        <input
          v-model.trim="newTask.hint"
          type="text"
          maxlength="300"
          placeholder="설명(선택)"
        />
        <label class="checkbox-field">
          <input v-model="newTask.required" type="checkbox" />
          <span>필수</span>
        </label>
        <button
          type="button"
          class="preset-button"
          :disabled="isSaving"
          @click="addTask"
        >
          항목 추가
        </button>
      </div>

      <h3>배정 인력 · AS-NOT-001 고지서</h3>
      <p class="helper-text">
        외부 의료인·구급대가 행사에 들어오면 1인당 1부 고지서를 교부하고 여기에
        남겨요. 면허가 정지·취소 상태면 그 범위의 행사는 진행할 수 없어요.
      </p>

      <p v-if="!selected.staff.length" class="empty-box">
        배정된 인력이 없어요. 최소한 현장 책임과 신고 담당은 이름을 남겨 주세요.
      </p>
      <div v-else class="table-wrap">
        <table class="staff-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>역할</th>
              <th>소속</th>
              <th>면허·자격</th>
              <th>고지서</th>
              <th>시간</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="person in selected.staff" :key="person.id">
              <td>{{ person.name }}</td>
              <td>
                <span class="status-chip" :class="person.roleTone">
                  {{ person.roleLabel }}
                </span>
              </td>
              <td>{{ person.org || "-" }}</td>
              <td>
                <span v-if="person.licenseType">{{ person.licenseType }}</span>
                <span
                  v-if="person.role === 'EXTERNAL_MEDIC'"
                  class="status-chip"
                  :class="person.licenseState === 'VALID' ? 'ok' : 'alert'"
                >
                  {{ person.licenseStateLabel }}
                </span>
                <span v-else class="helper-text">-</span>
              </td>
              <td>
                <span v-if="!person.needsNotice" class="helper-text"
                  >해당 없음</span
                >
                <span v-else-if="person.noticeGiven" class="status-chip ok">
                  교부 {{ person.noticeOn }}
                </span>
                <span v-else class="status-chip alert">미교부</span>
              </td>
              <td>
                <span class="helper-text">
                  {{ person.fromTime || "-" }}~{{ person.toTime || "-" }}
                </span>
              </td>
              <td>
                <button
                  v-if="canWrite"
                  type="button"
                  class="icon-button"
                  :disabled="isSaving"
                  @click="removeStaff(person)"
                >
                  ×
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="canWrite" class="inline-form wrap">
        <input
          v-model.trim="newStaff.name"
          type="text"
          maxlength="60"
          placeholder="이름"
        />
        <select v-model="newStaff.role">
          <option
            v-for="role in catalogs.staffRoles"
            :key="role.key"
            :value="role.key"
          >
            {{ role.label }}
          </option>
        </select>
        <input
          v-model.trim="newStaff.org"
          type="text"
          maxlength="80"
          placeholder="소속(선택)"
        />
        <input
          v-model.trim="newStaff.licenseType"
          type="text"
          maxlength="60"
          placeholder="면허·자격(선택)"
        />
        <select
          v-if="newStaff.role === 'EXTERNAL_MEDIC'"
          v-model="newStaff.licenseState"
        >
          <option
            v-for="state in catalogs.licenseStates"
            :key="state.key"
            :value="state.key"
          >
            {{ state.label }}
          </option>
        </select>
        <label v-if="noticeRoleSelected" class="checkbox-field">
          <input v-model="newStaff.noticeGiven" type="checkbox" />
          <span>고지서 교부</span>
        </label>
        <input
          v-if="noticeRoleSelected && newStaff.noticeGiven"
          v-model="newStaff.noticeOn"
          type="date"
        />
        <input v-model="newStaff.fromTime" type="time" title="시작" />
        <input v-model="newStaff.toTime" type="time" title="종료" />
        <button
          type="button"
          class="preset-button"
          :disabled="isSaving"
          @click="addStaff"
        >
          인력 추가
        </button>
      </div>

      <h3>이 행사에서 접수된 사건</h3>
      <p v-if="!selectedIncidents.length" class="empty-box">
        연결된 사건이 없어요. 행사 중 사건이 생기면 사건 접수(INC)에서 이 행사를
        선택해 주세요.
      </p>
      <ul v-else class="compact-list">
        <li v-for="incident in selectedIncidents" :key="incident.id">
          <div class="compact-main">
            <span class="incident-no">{{ incident.incidentNo }}</span>
            <span class="compact-title">
              {{ incident.occurredOn }} ·
              {{ incident.place || "장소 미기록" }} ·
              {{ incident.summary || "요약 없음" }}
            </span>
            <span
              class="status-chip"
              :class="incident.status === 'CLOSED' ? 'ok' : 'warn'"
            >
              {{ incident.status === "CLOSED" ? "종결" : "진행" }}
            </span>
          </div>
        </li>
      </ul>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>행사 목록</h2>
        <span class="helper-text">{{ events.length }}건</span>
      </div>

      <div class="filter-row">
        <select v-model="filters.scope" @change="load">
          <option value="upcoming">예정·진행</option>
          <option value="past">지난 행사</option>
          <option value="all">전체</option>
        </select>
        <select v-model="filters.kind" @change="load">
          <option value="">유형 전체</option>
          <option
            v-for="kind in catalogs.kinds"
            :key="kind.key"
            :value="kind.key"
          >
            {{ kind.label }}
          </option>
        </select>
        <select v-model="filters.status" @change="load">
          <option value="">상태 전체</option>
          <option
            v-for="status in catalogs.statuses"
            :key="status.key"
            :value="status.key"
          >
            {{ status.label }}
          </option>
        </select>
        <input
          v-model.trim="filters.q"
          type="search"
          placeholder="행사번호·행사명·장소·담당 검색"
          @keyup.enter="load"
        />
        <button
          type="button"
          class="preset-button"
          :disabled="isLoading"
          @click="load"
        >
          검색
        </button>
      </div>

      <p v-if="!events.length" class="empty-box">조건에 맞는 행사가 없어요.</p>

      <ul v-else class="record-list">
        <li v-for="event in events" :key="event.id">
          <button
            type="button"
            class="record-main"
            @click="openEvent(event.id)"
          >
            <div class="record-top">
              <span class="record-no">{{ event.eventNo }}</span>
              <span class="kind-chip" :class="event.kindTone">{{
                event.kindLabel
              }}</span>
              <span class="status-chip" :class="event.statusTone">
                {{ event.statusLabel }}
              </span>
              <span class="dday-chip" :class="ddayTone(event.dDay)">
                {{ event.dayLabel }}
              </span>
            </div>
            <strong class="record-title">{{ event.title }}</strong>
            <span class="helper-text">
              {{ event.scheduleLabel }} · {{ event.venue || "장소 미기록" }} ·
              {{ event.arcLevelLabel }} · R {{ event.riskScore }}
            </span>
          </button>
          <span class="record-side">
            <span class="helper-text">
              체크 {{ event.taskStats.done }}/{{ event.taskStats.total }}
            </span>
            <span v-if="event.blockers.length" class="status-chip alert">
              막는 항목 {{ event.blockers.length }}
            </span>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  addArcEventTask,
  createArcEvent,
  deleteArcEvent,
  deleteArcEventStaff,
  deleteArcEventTask,
  ARC_EVENT_PHASE_LABELS,
  fetchArcEvent,
  fetchArcEvents,
  saveArcEventStaff,
  toggleArcEventTask,
  updateArcEvent,
} from "@/lib/arc";
import { hasPermission } from "@/lib/staffAuth";

const events = ref([]);
const selected = ref(null);
const selectedIncidents = ref([]);
const summary = ref(emptySummary());
const catalogs = ref(emptyCatalogs());
const canWrite = ref(hasPermission("arc.care"));
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const okMessage = ref("");

const filters = reactive({ scope: "upcoming", kind: "", status: "", q: "" });

const draftMode = ref("");
const draft = reactive(emptyDraft());
const statusDraft = ref("");

const newTask = reactive({
  phase: "BEFORE",
  label: "",
  hint: "",
  required: false,
});
const newStaff = reactive(emptyStaffDraft());

function emptyCatalogs() {
  return {
    kinds: [],
    levels: [],
    medicModes: [],
    statuses: [],
    staffRoles: [],
    licenseStates: [],
    riskBands: [],
    phases: Object.entries(ARC_EVENT_PHASE_LABELS).map(([key, label]) => ({
      key,
      label,
    })),
    templates: [],
    kindTasks: {},
  };
}

function emptySummary() {
  return {
    upcomingEvents: [],
    needsAttention: 0,
    upcoming: 0,
    upcoming30Days: 0,
    thisWeek: 0,
    pastOpen: 0,
    scopeMissing: 0,
    noticeMissing: 0,
    kpi: { windowLabel: "최근 12개월", items: [] },
  };
}

function todayIso() {
  const now = new Date();
  const offset = -now.getTimezoneOffset();

  return new Date(now.getTime() + offset * 60_000).toISOString().slice(0, 10);
}

function emptyDraft() {
  return {
    eventId: "",
    title: "",
    kind: "PARTY",
    startsOn: todayIso(),
    startTime: "19:00",
    endsOn: "",
    endTime: "",
    venue: "",
    outdoor: false,
    expectedGuests: 0,
    servesAlcohol: true,
    servesFood: false,
    organizer: "",
    hostName: "",
    hostContact: "",
    arcLevel: "ADVISE",
    medicMode: "NONE",
    riskL: 2,
    riskS: 2,
    scopeAgreed: false,
    scopeNote: "",
    billing: "NONE",
    aedLocation: "",
    assemblyPoint: "",
    nearestEr: "",
    eapNote: "",
    promoChecked: false,
    notes: "",
  };
}

function emptyStaffDraft() {
  return {
    id: "",
    name: "",
    role: "MEDIC_RN",
    org: "",
    licenseType: "",
    licenseState: "NA",
    noticeGiven: false,
    noticeOn: todayIso(),
    noticeNo: "",
    fromTime: "",
    toTime: "",
    note: "",
  };
}

const draftRisk = computed(() => {
  const score = Number(draft.riskL || 1) * Number(draft.riskS || 1);
  const band = catalogs.value.riskBands.find(
    (item) => score >= item.min && score <= item.max
  ) ??
    catalogs.value.riskBands[0] ?? { label: "낮음", tone: "ok" };

  return { score, label: band.label, tone: band.tone };
});

const riskGuidance = computed(() => {
  if (draftRisk.value.score >= 16) {
    return "즉시개선 구간이에요. 지원 수준을 올리고 사전합의·EAP·인력을 먼저 확정하세요.";
  }

  if (draftRisk.value.score >= 10) {
    return "우선관리 구간이에요. 현장 대기 이상과 사전합의를 검토하세요.";
  }

  if (draftRisk.value.score >= 5) {
    return "관리 구간이에요. 체크리스트와 물품 준비를 그대로 따르면 됩니다.";
  }

  return "낮음 구간이에요. 기본 준비만으로 충분합니다.";
});

const noticeRoleSelected = computed(() =>
  ["EXTERNAL_MEDIC", "EMS"].includes(newStaff.role)
);

function ddayTone(dDay) {
  if (dDay <= 1) return "alert";
  if (dDay <= 7) return "warn";

  return "neutral";
}

function tasksOfPhase(phase) {
  return (selected.value?.tasks ?? []).filter((task) => task.phase === phase);
}

function flash(message) {
  okMessage.value = message;
  errorMessage.value = "";
}

function fail(error) {
  errorMessage.value =
    error?.data?.message || error?.message || "요청을 처리하지 못했어요.";
  okMessage.value = "";
}

async function load() {
  isLoading.value = true;

  try {
    const data = await fetchArcEvents({
      scope: filters.scope === "all" ? "" : filters.scope,
      kind: filters.kind,
      status: filters.status,
      q: filters.q,
    });

    events.value = data?.events ?? [];
    summary.value = { ...emptySummary(), ...(data?.summary ?? {}) };
    catalogs.value = { ...emptyCatalogs(), ...(data?.catalogs ?? {}) };
    canWrite.value = data?.canWrite ?? canWrite.value;
  } catch (error) {
    fail(error);
  } finally {
    isLoading.value = false;
  }
}

async function openEvent(eventId) {
  isLoading.value = true;

  try {
    const data = await fetchArcEvent(eventId);

    selected.value = data?.event ?? null;
    selectedIncidents.value = data?.incidents ?? [];
    statusDraft.value = selected.value?.status ?? "PLANNING";
    catalogs.value = { ...emptyCatalogs(), ...(data?.catalogs ?? {}) };
  } catch (error) {
    fail(error);
  } finally {
    isLoading.value = false;
  }
}

function startCreate() {
  Object.assign(draft, emptyDraft());
  draftMode.value = "create";
  statusDraft.value = "";
  okMessage.value = "";
  errorMessage.value = "";
}

function startEdit(event) {
  Object.assign(draft, emptyDraft(), {
    eventId: event.id,
    title: event.title,
    kind: event.kind,
    startsOn: event.startsOn,
    startTime: event.startTime,
    endsOn: event.endsOn,
    endTime: event.endTime,
    venue: event.venue,
    outdoor: event.outdoor,
    expectedGuests: event.expectedGuests,
    servesAlcohol: event.servesAlcohol,
    servesFood: event.servesFood,
    organizer: event.organizer,
    hostName: event.hostName,
    hostContact: event.hostContact,
    arcLevel: event.arcLevel,
    medicMode: event.medicMode,
    riskL: event.riskL,
    riskS: event.riskS,
    scopeAgreed: event.scopeAgreed,
    scopeNote: event.scopeNote,
    billing: event.billing,
    aedLocation: event.aedLocation,
    assemblyPoint: event.assemblyPoint,
    nearestEr: event.nearestEr,
    eapNote: event.eapNote,
    promoChecked: event.promoChecked,
    notes: event.notes,
  });
  draftMode.value = "edit";
  okMessage.value = "";
  errorMessage.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelDraft() {
  draftMode.value = "";
}

async function submitDraft() {
  if (!draft.title.trim()) {
    errorMessage.value = "행사명을 입력해 주세요.";
    return;
  }

  isSaving.value = true;

  try {
    const payload = { ...draft };
    const isCreate = draftMode.value === "create";

    delete payload.eventId;

    const data = isCreate
      ? await createArcEvent(payload)
      : await updateArcEvent(draft.eventId, payload);

    selected.value = data?.event ?? null;
    selectedIncidents.value = data?.incidents ?? [];
    statusDraft.value = selected.value?.status ?? "PLANNING";
    draftMode.value = "";
    flash(
      isCreate
        ? "행사를 등록했어요. 체크리스트를 확인해 주세요."
        : "행사 정보를 저장했어요."
    );
    await load();
  } catch (error) {
    fail(error);
  } finally {
    isSaving.value = false;
  }
}

async function removeEvent() {
  if (!selected.value) return;

  if (
    !window.confirm(
      `${selected.value.title} 행사를 삭제할까요? 되돌릴 수 없어요.`
    )
  ) {
    return;
  }

  isSaving.value = true;

  try {
    await deleteArcEvent(selected.value.id);
    selected.value = null;
    selectedIncidents.value = [];
    flash("행사를 삭제했어요.");
    await load();
  } catch (error) {
    fail(error);
  } finally {
    isSaving.value = false;
  }
}

async function saveStatus() {
  if (!selected.value) return;

  isSaving.value = true;

  try {
    const data = await updateArcEvent(selected.value.id, {
      status: statusDraft.value,
    });

    selected.value = data?.event ?? selected.value;
    selectedIncidents.value = data?.incidents ?? selectedIncidents.value;
    statusDraft.value = selected.value?.status ?? statusDraft.value;
    flash("상태를 저장했어요.");
    await load();
  } catch (error) {
    statusDraft.value = selected.value.status;
    fail(error);
  } finally {
    isSaving.value = false;
  }
}

async function toggleTask(task) {
  if (!selected.value) return;

  isSaving.value = true;

  try {
    await toggleArcEventTask(selected.value.id, task.id, { done: !task.done });
    await openEvent(selected.value.id);
    await load();
  } catch (error) {
    fail(error);
  } finally {
    isSaving.value = false;
  }
}

async function addTask() {
  if (!selected.value) return;

  if (!newTask.label.trim()) {
    errorMessage.value = "추가할 항목 이름을 입력해 주세요.";
    return;
  }

  isSaving.value = true;

  try {
    await addArcEventTask(selected.value.id, { ...newTask });
    Object.assign(newTask, {
      phase: "BEFORE",
      label: "",
      hint: "",
      required: false,
    });
    await openEvent(selected.value.id);
    flash("체크리스트 항목을 추가했어요.");
  } catch (error) {
    fail(error);
  } finally {
    isSaving.value = false;
  }
}

async function removeTask(task) {
  if (!selected.value) return;

  if (!window.confirm(`「${task.label}」 항목을 삭제할까요?`)) {
    return;
  }

  isSaving.value = true;

  try {
    await deleteArcEventTask(selected.value.id, task.id);
    await openEvent(selected.value.id);
    flash("항목을 삭제했어요.");
  } catch (error) {
    fail(error);
  } finally {
    isSaving.value = false;
  }
}

async function addStaff() {
  if (!selected.value) return;

  if (!newStaff.name.trim()) {
    errorMessage.value = "이름을 입력해 주세요.";
    return;
  }

  isSaving.value = true;

  try {
    await saveArcEventStaff(selected.value.id, { ...newStaff });
    Object.assign(newStaff, emptyStaffDraft());
    await openEvent(selected.value.id);
    flash("배정 인력을 저장했어요.");
    await load();
  } catch (error) {
    fail(error);
  } finally {
    isSaving.value = false;
  }
}

async function removeStaff(person) {
  if (!selected.value) return;

  isSaving.value = true;

  try {
    await deleteArcEventStaff(selected.value.id, person.id);
    await openEvent(selected.value.id);
    flash("배정 인력을 삭제했어요.");
    await load();
  } catch (error) {
    fail(error);
  } finally {
    isSaving.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.admin-arc-events-view {
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

  .eyebrow {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.55);
  }

  h1 {
    margin: 0 0 6px;
    font-size: 26px;
    font-weight: 800;
  }
}

.description {
  margin: 0;
  max-width: 760px;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.66);
}

.header-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }

  h3 {
    margin: 6px 0 0;
    font-size: 14px;
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

.event-no {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.45);
}

.status-select,
.filter-row select,
.filter-row input,
.inline-form input,
.inline-form select,
.field input,
.field select,
.field textarea {
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
}

.field textarea {
  resize: vertical;
  line-height: 1.6;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.kpi-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);

  .kpi-label {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.62);
  }

  .kpi-value {
    font-size: 22px;
    font-weight: 800;
  }
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
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

.helper-text {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
}

.error-box,
.ok-box,
.empty-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
}

.error-box {
  background: rgba(248, 113, 113, 0.16);
  color: #fca5a5;
}

.ok-box {
  background: rgba(52, 211, 153, 0.14);
  color: #6ee7b7;
}

.empty-box {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.55);
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
  }
}

.event-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.event-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 240px;

  strong {
    font-size: 15px;
    font-weight: 800;
  }
}

.dday-chip {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.75);

  &.alert {
    background: rgba(248, 113, 113, 0.2);
    color: #fca5a5;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.2);
    color: #fcd34d;
  }
}

.status-chip {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.75);

  &.ok {
    background: rgba(52, 211, 153, 0.18);
    color: #6ee7b7;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.alert {
    background: rgba(248, 113, 113, 0.18);
    color: #fca5a5;
  }

  &.info {
    background: rgba(96, 165, 250, 0.18);
    color: #93c5fd;
  }

  &.muted {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.45);
  }
}

.kind-chip {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);

  &.alert {
    background: rgba(248, 113, 113, 0.16);
    color: #fca5a5;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.16);
    color: #fcd34d;
  }

  &.info {
    background: rgba(96, 165, 250, 0.16);
    color: #93c5fd;
  }
}

.risk-chip {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);

  &.ok {
    background: rgba(52, 211, 153, 0.16);
    color: #6ee7b7;
  }

  &.info {
    background: rgba(96, 165, 250, 0.16);
    color: #93c5fd;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.18);
    color: #fcd34d;
  }

  &.alert {
    background: rgba(248, 113, 113, 0.2);
    color: #fca5a5;
  }
}

.event-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.progress-bar {
  flex: 1 1 180px;
  height: 7px;
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

.blocker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 9px 12px;
    border-radius: 10px;
    border-left: 3px solid rgba(251, 191, 36, 0.6);
    background: rgba(251, 191, 36, 0.1);

    strong {
      font-size: 12px;
      font-weight: 800;
      color: #fcd34d;
    }

    span {
      font-size: 12px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.6);
    }

    &.high {
      border-left-color: rgba(248, 113, 113, 0.7);
      background: rgba(248, 113, 113, 0.12);

      strong {
        color: #fca5a5;
      }
    }
  }
}

.event-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.form-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  span {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
  }

  b {
    color: #fca5a5;
  }

  &.wide {
    grid-column: 1 / -1;
  }
}

.checkbox-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
  cursor: pointer;

  input {
    width: 16px;
    height: 16px;
    accent-color: #6366f1;
  }

  &.wide {
    align-items: flex-start;
  }
}

.kind-grid,
.level-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.kind-card,
.level-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 13px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  text-align: left;
  cursor: pointer;

  strong {
    font-size: 14px;
    font-weight: 800;
  }

  span {
    font-size: 12px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.6);
  }

  em {
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.45);
  }

  &.active {
    border-color: rgba(99, 102, 241, 0.75);
    background: rgba(99, 102, 241, 0.2);
    box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.4) inset;
  }

  &.alert em {
    color: #fca5a5;
  }

  &.warn em {
    color: #fcd34d;
  }
}

.risk-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.risk-result {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 240px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.primary-button {
  padding: 10px 18px;
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.6);
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #ffffff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.preset-button {
  padding: 9px 14px;
  border-radius: 11px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.danger {
    border-color: rgba(248, 113, 113, 0.45);
    background: rgba(248, 113, 113, 0.14);
    color: #fca5a5;
  }
}

.icon-button {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;

  > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);

    span {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
    }

    strong {
      font-size: 13px;
      font-weight: 700;
    }
  }
}

.note-box {
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);

  strong {
    font-size: 12px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.66);
  }

  p {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    color: rgba(255, 255, 255, 0.78);
  }
}

.phase-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.phase-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.phase-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;

  strong {
    font-size: 13px;
    font-weight: 800;
  }
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);

    &.done {
      background: rgba(52, 211, 153, 0.1);
    }
  }
}

.task-toggle {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #6ee7b7;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.task-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.task-label {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.82);
}

.required-mark {
  margin-left: 5px;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
  background: rgba(248, 113, 113, 0.18);
  color: #fca5a5;
}

.task-done {
  font-size: 11px;
  color: #6ee7b7;
}

.inline-form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;

  input[type="text"] {
    flex: 1 1 160px;
  }

  &.wrap {
    flex-wrap: wrap;
  }
}

.table-wrap {
  overflow-x: auto;
}

.staff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    white-space: nowrap;
  }

  th {
    font-size: 11px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.5);
  }
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  input[type="search"] {
    flex: 1 1 200px;
  }
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
  }
}

.record-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  padding: 0;
  border: none;
  background: none;
  color: #ffffff;
  text-align: left;
  cursor: pointer;
}

.record-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.record-no {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.55);
}

.record-title {
  font-size: 14px;
  font-weight: 800;
}

.record-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.compact-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
  }
}

.compact-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.compact-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}

.incident-no {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.55);
}

@media (max-width: 640px) {
  .admin-arc-events-view {
    padding: 16px;
  }

  .inline-form {
    flex-wrap: wrap;
  }
}
</style>
