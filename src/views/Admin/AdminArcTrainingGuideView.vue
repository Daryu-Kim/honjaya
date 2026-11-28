<template>
  <div class="admin-arc-training-guide-view">
    <header class="page-header no-print">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY</p>
        <h1>교육자료 · 구두시험 대비</h1>
        <p class="description">
          AS-GDE-001 「현장응급처치 교육가이드」 기준으로 정리한 교육 교재예요.
          쉬운 설명·현장 사례·꼬리질문까지 담았고, <strong>교육자용</strong>과
          <strong>교육생용</strong>을 골라 그대로 인쇄할 수 있어요. 교육자용에는
          준비물·시간표·진행 대본·예상질문이 담긴 비서 키트가 함께 나옵니다.
        </p>
      </div>
      <nav class="header-links">
        <router-link to="/admin/arc/training" class="link-button">
          월간 교육·OT
        </router-link>
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
        <button type="button" class="print-button" @click="printSheet">
          인쇄 · PDF 저장
        </button>
      </nav>
    </header>

    <p v-if="errorMessage" class="error-box no-print">{{ errorMessage }}</p>
    <p v-if="isLoading" class="empty-box no-print">
      교육자료를 불러오는 중이에요.
    </p>

    <section v-if="!isLoading && guide" class="filter-panel no-print">
      <div class="filter-row">
        <h2>출력 모드</h2>
        <div class="mode-group">
          <button
            type="button"
            :class="['mode-button', { active: mode === 'teacher' }]"
            @click="mode = 'teacher'"
          >
            교육자용 · 답안 포함
          </button>
          <button
            type="button"
            :class="['mode-button', { active: mode === 'student' }]"
            @click="mode = 'student'"
          >
            교육생용 · 답안 가림 + 필기칸
          </button>
        </div>
      </div>

      <div class="filter-row">
        <h2>섹션 선택</h2>
        <div class="section-toggles">
          <label v-for="item in SECTION_TOGGLES" :key="item.key" class="switch">
            <input v-model="sections[item.key]" type="checkbox" />
            <span>{{ item.label }}</span>
          </label>
        </div>
      </div>

      <div class="filter-row">
        <h2>1부 · 핵심 모듈</h2>
        <div class="filter-actions">
          <button type="button" class="ghost-button" @click="selectAllModules">
            전체 선택
          </button>
          <button type="button" class="ghost-button" @click="clearModules">
            전체 해제
          </button>
        </div>
      </div>
      <div class="chip-row">
        <button
          v-for="item in modules"
          :key="item.key"
          type="button"
          :class="['chip', { active: isModuleSelected(item.key) }]"
          @click="toggleModule(item.key)"
        >
          {{ item.title }}
        </button>
      </div>

      <div class="filter-row">
        <h2>2부 · 상황연습</h2>
        <select v-model="selectedCategory" class="category-select">
          <option value="ALL">전체 카테고리 ({{ scenarios.length }}개)</option>
          <option v-for="item in categories" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
      </div>

      <div class="filter-row">
        <h2>3부 · 절대금지</h2>
        <label class="switch">
          <input v-model="showForbidden" type="checkbox" />
          <span>절대금지 {{ forbidden.length }}개 함께 출력</span>
        </label>
      </div>

      <p class="print-hint">
        인쇄 미리보기에서 A4 · 여백 기본값을 쓰면 깔끔하게 나와요.
        <strong>교육생용</strong>은 모범답안·진행순서를 가리고 대신 필기칸이
        나오니, 교육 전에 미리 나눠 주고 교육 후 교육자용으로 답을 확인하는
        방식이 가장 효과적이에요. 예상 분량 · 선택 모듈
        {{ visibleModules.length }}개 / 상황연습 {{ visibleScenarios.length }}개
        · 약 {{ estimateMinutes }}분
      </p>
    </section>

    <article v-if="!isLoading && guide" class="guide-sheet">
      <section v-if="sections.cover" class="cover-page">
        <p class="cover-brand">혼자야 · ARC SAFETY 응급안전관리센터</p>
        <h1 class="cover-title">
          현장응급처치<br />
          월간 교육 · OT 교재
        </h1>
        <p class="cover-sub">
          일반직원 눈높이 교육자료 · 구두시험 대비 ·
          {{
            mode === "teacher" ? "교육자용(답안 포함)" : "교육생용(답안 가림)"
          }}
        </p>

        <table class="cover-table">
          <tbody>
            <tr>
              <th>교육일시</th>
              <td></td>
              <th>장소</th>
              <td></td>
            </tr>
            <tr>
              <th>교육자</th>
              <td>최윤희 (응급안전관리센터 총괄)</td>
              <th>참석 인원</th>
              <td>명</td>
            </tr>
            <tr>
              <th>교육 대상</th>
              <td colspan="3"></td>
            </tr>
            <tr>
              <th>오늘의 주제</th>
              <td colspan="3"></td>
            </tr>
          </tbody>
        </table>

        <div class="cover-goal">
          <p class="cover-goal-title">
            교육이 끝나면 이 네 문장을 말할 수 있어야 합니다
          </p>
          <ol>
            <li>
              나는 의료인이 아니라 <strong>연결 담당자</strong>이며, 진단과 투약
              판단은 하지 않는다.
            </li>
            <li>
              <strong>반응과 호흡</strong>을 10초 안에 확인하고, 심정지면 즉시
              가슴압박을 시작한다.
            </li>
            <li>
              하지 말아야 할 행동을 <strong>이유와 함께</strong> 말할 수 있다.
            </li>
            <li>모든 사건은 <strong>시각과 함께 AS-CARE</strong>로 남긴다.</li>
          </ol>
        </div>

        <ul class="cover-toc">
          <li v-for="item in TABLE_OF_CONTENTS" :key="item.title">
            <span class="toc-no">{{ item.no }}</span>
            <span class="toc-title">{{ item.title }}</span>
            <span class="toc-note">{{ item.note }}</span>
          </li>
        </ul>

        <p class="cover-foot">
          근거 문서 · {{ guide.source }}<br />
          이 자료는 내부 교육용입니다. 실제 환자 상태 판단과 투약은 의료인·119
          지시를 따릅니다.
        </p>
      </section>

      <header class="sheet-head">
        <p class="sheet-brand">혼자야 · ARC SAFETY 응급안전관리센터</p>
        <h1>현장응급처치 교육자료</h1>
        <p class="sheet-sub">
          월간 교육·OT 구두시험 대비 학습 자료 · 일반인 눈높이 ·
          <strong class="sheet-mode">{{
            mode === "teacher" ? "교육자용" : "교육생용"
          }}</strong>
        </p>
        <dl class="sheet-meta">
          <div>
            <dt>근거 문서</dt>
            <dd>{{ guide.source }}</dd>
          </div>
          <div>
            <dt>출력일</dt>
            <dd>{{ printedOn }}</dd>
          </div>
          <div>
            <dt>수록</dt>
            <dd>
              핵심 모듈 {{ visibleModules.length }}개 · 상황연습
              {{ visibleScenarios.length }}개 · 절대금지
              {{ visibleForbidden.length }}개 · 약 {{ estimateMinutes }}분
            </dd>
          </div>
          <div v-if="totals">
            <dt>전체 교육과정</dt>
            <dd>
              모듈 {{ totals.modules }}개 / {{ totals.moduleMinutes }}분 ·
              상황연습 {{ totals.scenarios }}개 · 절대금지
              {{ totals.forbidden }}개
            </dd>
          </div>
        </dl>
      </header>

      <section v-if="sections.quick" class="sheet-section quick-card">
        <h2>3분 요약 카드</h2>
        <p class="section-lead">
          교육 시작 전에 이 표만 같이 읽어도 절반은 끝나요. 숫자는 소리 내어
          읽으면서 외우세요.
        </p>
        <ul class="quick-list">
          <li v-for="item in QUICK_CARD" :key="item.label">
            <strong>{{ item.label }}</strong>
            <span>{{ item.value }}</span>
          </li>
        </ul>
      </section>

      <section
        v-if="sections.teacherKit && isTeacher && teacherKit"
        class="sheet-section part-break kit-section"
      >
        <h2>교육자 비서 키트 · 진행 순서</h2>
        <p class="section-lead">{{ teacherKit.headline }}</p>

        <h3 class="sub-head">1. 시작 전 준비 체크</h3>
        <ul class="check-list">
          <li v-for="line in teacherKit.before" :key="line">
            <span class="check-box"></span>
            <span>{{ line }}</span>
          </li>
        </ul>

        <h3 class="sub-head">2. 준비물</h3>
        <ul class="supply-list">
          <li v-for="item in teacherKit.supplies" :key="item">{{ item }}</li>
        </ul>

        <h3 class="sub-head">3. 60분 진행 시간표</h3>
        <table class="kit-table">
          <thead>
            <tr>
              <th class="col-no">순서</th>
              <th>내용</th>
              <th class="col-min">시간</th>
              <th class="col-note">메모</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in teacherKit.timePlan" :key="row.block">
              <td class="col-no">{{ index + 1 }}</td>
              <td>{{ row.block }}</td>
              <td class="col-min">{{ row.minutes }}분</td>
              <td class="col-note">{{ row.note }}</td>
            </tr>
          </tbody>
        </table>

        <h3 class="sub-head">4. 주차별 커리큘럼 (4주 순환)</h3>
        <table class="kit-table">
          <thead>
            <tr>
              <th class="col-week">주차</th>
              <th class="col-theme">핵심 모듈</th>
              <th>진행 포인트</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in teacherKit.curriculum" :key="row.week">
              <td class="col-week">{{ row.week }}</td>
              <td class="col-theme">{{ row.theme }}</td>
              <td>{{ row.note }}</td>
            </tr>
          </tbody>
        </table>

        <h3 class="sub-head">5. 진행 대본 (그대로 읽어도 됩니다)</h3>
        <div class="script-list">
          <div
            v-for="line in teacherKit.script"
            :key="line.h"
            class="script-row"
          >
            <p class="script-h">{{ line.h }}</p>
            <p class="script-p">{{ line.p }}</p>
          </div>
        </div>

        <h3 class="sub-head">6. 예상 질문 · 답변</h3>
        <div class="faq-list">
          <div v-for="item in teacherKit.faq" :key="item.q" class="faq-row">
            <p class="faq-q">Q. {{ item.q }}</p>
            <p class="faq-a">A. {{ item.a }}</p>
          </div>
        </div>

        <h3 class="sub-head">7. 마무리 체크</h3>
        <ul class="check-list">
          <li v-for="line in teacherKit.after" :key="line">
            <span class="check-box"></span>
            <span>{{ line }}</span>
          </li>
        </ul>

        <h3 class="sub-head">8. 교육 진행 팁</h3>
        <ul class="tip-list">
          <li v-for="tip in teacherKit.coachTips" :key="tip">{{ tip }}</li>
        </ul>
      </section>

      <section v-if="sections.quick && examGuide" class="sheet-section">
        <h2>이렇게 공부하세요</h2>
        <p class="section-lead">{{ examGuide.title }}</p>
        <div class="round-grid">
          <article
            v-for="round in examGuide.rounds"
            :key="round.h"
            class="round-card"
          >
            <h3>{{ round.h }}</h3>
            <p>{{ round.p }}</p>
          </article>
        </div>
        <ul class="tip-list">
          <li v-for="tell in examGuide.tells" :key="tell">{{ tell }}</li>
        </ul>
      </section>

      <section
        v-if="sections.modules && visibleModules.length"
        class="sheet-section"
      >
        <h2>1부 · 핵심 모듈 {{ visibleModules.length }}개</h2>
        <p class="section-lead">
          순서대로 읽지 않아도 됩니다. 오늘 필요한 모듈만 골라 읽고, 각 모듈의
          '쉽게 말하면'과 '현장에서는 이렇게'를 먼저 보세요.
        </p>
        <article
          v-for="item in visibleModules"
          :key="item.key"
          class="sheet-card"
        >
          <h3>
            {{ item.title }}
            <span class="tag">{{ item.phase }} · {{ item.minutes }}분</span>
          </h3>
          <p class="goal">교육 목표 · {{ item.goal }}</p>
          <p v-if="item.guide?.easy" class="easy-box">
            <span class="easy-label">쉽게 말하면</span>
            {{ item.guide.easy }}
          </p>
          <p v-if="item.guide" class="why">{{ item.guide.why }}</p>

          <div
            v-for="block in item.guide?.body ?? []"
            :key="block.h"
            class="body-block"
          >
            <h4>{{ block.h }}</h4>
            <p>{{ block.p }}</p>
          </div>

          <p v-if="item.guide?.example" class="example-box">
            <span class="example-label">현장에서는 이렇게</span>
            {{ item.guide.example }}
          </p>

          <ul v-if="item.guide?.numbers?.length" class="number-list">
            <li v-for="number in item.guide.numbers" :key="number">
              {{ number }}
            </li>
          </ul>

          <div v-if="item.guide?.tips?.length" class="bullet-box good">
            <p class="bullet-title">이렇게 하면 좋아요</p>
            <ul>
              <li v-for="tip in item.guide.tips" :key="tip">{{ tip }}</li>
            </ul>
          </div>

          <div v-if="item.guide?.mistakes?.length" class="bullet-box bad">
            <p class="bullet-title">자주 하는 실수</p>
            <ul>
              <li v-for="mistake in item.guide.mistakes" :key="mistake">
                {{ mistake }}
              </li>
            </ul>
          </div>

          <div v-if="item.items?.length" class="bullet-box plain">
            <p class="bullet-title">교육 내용 체크</p>
            <ul>
              <li v-for="(line, index) in item.items" :key="line">
                {{ line }}
                <small
                  v-for="note in item.itemTerms?.[index] ?? []"
                  :key="note.term"
                  class="term-note"
                >
                  {{ note.term }} = {{ note.plain }}
                </small>
              </li>
            </ul>
          </div>

          <div v-if="item.terms?.length" class="term-box">
            <p class="bullet-title">어려운 말, 이렇게 이해하세요</p>
            <ul class="term-list">
              <li v-for="note in item.terms" :key="note.term">
                <strong>{{ note.term }}</strong>
                <span>{{ note.plain }}</span>
              </li>
            </ul>
          </div>

          <p v-if="item.materials?.length" class="materials-line">
            준비물 · {{ item.materials.join(" · ") }}
          </p>

          <div v-if="item.guide?.oral" class="oral-box">
            <p class="oral-q">구술 문항 · {{ item.guide.oral.q }}</p>
            <p v-if="isTeacher" class="oral-a">
              모범 답안 · {{ item.guide.oral.a }}
            </p>
            <div v-else class="write-lines">
              <span></span>
              <span></span>
            </div>
          </div>

          <div v-if="isTeacher && item.guide?.askMore?.length" class="ask-box">
            <p class="bullet-title">꼬리질문 · 교육자가 이어서 물어보세요</p>
            <div v-for="ask in item.guide.askMore" :key="ask.q" class="ask-row">
              <p class="ask-q">Q. {{ ask.q }}</p>
              <p class="ask-a">A. {{ ask.a }}</p>
            </div>
          </div>

          <div v-if="item.evaluation?.length" class="bullet-box eval">
            <p class="bullet-title">평가 기준 · 구술로 확인</p>
            <ul>
              <li v-for="line in item.evaluation" :key="line">{{ line }}</li>
            </ul>
          </div>
        </article>
      </section>

      <section
        v-if="sections.scenarios && visibleScenarios.length"
        class="sheet-section part-break"
      >
        <h2>2부 · 상황연습 {{ visibleScenarios.length }}개</h2>
        <p class="section-lead">
          상황을 읽고 10초 안에 "지금 가장 먼저 할 한 가지"를 말해 보세요. 답을
          본 뒤에는 순서를 가리고 다시 한 번 말합니다. 교육생용으로 뽑으면 답이
          가려지고 필기칸이 나옵니다.
        </p>
        <article
          v-for="item in visibleScenarios"
          :key="item.key"
          class="sheet-card scenario"
        >
          <h3>
            {{ item.no }}. {{ item.scene }}
            <span class="tag">{{ item.category }}</span>
          </h3>
          <p v-if="item.guide?.easy" class="easy-box">
            <span class="easy-label">한 줄 요약</span>
            {{ item.guide.easy }}
          </p>
          <p v-if="isTeacher && item.guide" class="why">{{ item.guide.why }}</p>
          <template v-if="isTeacher">
            <ol v-if="item.guide?.steps?.length" class="step-list">
              <li v-for="step in item.guide.steps" :key="step">{{ step }}</li>
            </ol>
            <p v-if="item.guide?.trap" class="trap-line">
              헷갈리기 쉬운 점 · {{ item.guide.trap }}
            </p>
            <div v-if="item.guide?.never?.length" class="bullet-box bad">
              <p class="bullet-title">이건 하지 마세요</p>
              <ul>
                <li v-for="line in item.guide.never" :key="line">{{ line }}</li>
              </ul>
            </div>
          </template>
          <div v-else class="write-block">
            <p class="write-title">먼저 할 일 3가지</p>
            <div class="write-lines">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p class="write-title">하지 말아야 할 것</p>
            <div class="write-lines">
              <span></span>
              <span></span>
            </div>
          </div>
          <div v-if="item.terms?.length" class="term-box">
            <p class="bullet-title">어려운 말, 이렇게 이해하세요</p>
            <ul class="term-list">
              <li v-for="note in item.terms" :key="note.term">
                <strong>{{ note.term }}</strong>
                <span>{{ note.plain }}</span>
              </li>
            </ul>
          </div>
          <div v-if="item.guide?.oral" class="oral-box">
            <p class="oral-q">구술 문항 · {{ item.guide.oral.q }}</p>
            <p v-if="isTeacher" class="oral-a">
              모범 답안 · {{ item.guide.oral.a }}
            </p>
            <div v-else class="write-lines">
              <span></span>
              <span></span>
            </div>
          </div>
          <div v-if="isTeacher && item.guide?.askMore" class="ask-box">
            <p class="bullet-title">꼬리질문</p>
            <div class="ask-row">
              <p class="ask-q">Q. {{ item.guide.askMore.q }}</p>
              <p class="ask-a">A. {{ item.guide.askMore.a }}</p>
            </div>
          </div>
        </article>
      </section>

      <section
        v-if="sections.forbidden && visibleForbidden.length"
        class="sheet-section part-break"
      >
        <h2>3부 · 절대금지 {{ visibleForbidden.length }}개</h2>
        <p class="section-lead">
          "왜 안 되는지"까지 말할 수 있어야 실제 상황에서도 지킬 수 있어요.
          이유와 대신 할 행동을 한 쌍으로 외우세요.
        </p>
        <ol class="forbidden-list">
          <li v-for="item in visibleForbidden" :key="item.key">
            <p class="forbidden-text">{{ item.text }}</p>
            <template v-if="isTeacher">
              <p v-if="item.why" class="forbidden-why">이유 · {{ item.why }}</p>
              <p v-if="item.instead" class="forbidden-instead">
                대신 이렇게 · {{ item.instead }}
              </p>
              <p v-if="item.risk" class="forbidden-risk">
                어기면 · {{ item.risk }}
              </p>
              <p v-if="item.signs" class="forbidden-signs">
                살펴볼 신호 · {{ item.signs }}
              </p>
              <p v-if="item.drill" class="forbidden-drill">
                소리 내어 연습 · {{ item.drill }}
              </p>
              <p v-if="item.basis" class="forbidden-basis">
                근거 · {{ item.basis }}
              </p>
              <p v-if="item.guide?.example" class="forbidden-example">
                실제 사례 · {{ item.guide.example }}
              </p>
            </template>
            <div v-else class="write-block">
              <div class="write-lines">
                <span></span>
                <span></span>
              </div>
            </div>
            <div v-if="item.terms?.length" class="term-box">
              <ul class="term-list">
                <li v-for="note in item.terms" :key="note.term">
                  <strong>{{ note.term }}</strong>
                  <span>{{ note.plain }}</span>
                </li>
              </ul>
            </div>
          </li>
        </ol>
      </section>

      <section
        v-if="sections.glossary && glossary.length"
        class="sheet-section part-break glossary-section"
      >
        <h2>부록 1 · 용어 사전</h2>
        <p class="section-lead">
          교육 중에 처음 듣는 말이 나오면 여기서 찾아 읽어 주세요. 같은 말을
          일상어로 한 번 더 설명한 것입니다.
        </p>
        <dl class="glossary-grid">
          <div v-for="item in glossary" :key="item.term" class="glossary-row">
            <dt>{{ item.term }}</dt>
            <dd>{{ item.plain }}</dd>
          </div>
        </dl>
      </section>

      <section
        v-if="sections.sign"
        class="sheet-section part-break sign-section"
      >
        <h2>부록 2 · 교육 이수 확인 · 서명</h2>
        <p class="section-lead">
          교육 후 이 표에 서명하면 해당 월의 교육 증빙이 완성됩니다. 미참석자는
          사유를 적고 다음 달 우선 대상으로 지정하세요.
        </p>
        <table class="sign-table">
          <thead>
            <tr>
              <th class="col-no">연번</th>
              <th>성명</th>
              <th>역할</th>
              <th>서명</th>
              <th class="col-memo">비고 (미참석 사유 등)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in SIGN_ROWS" :key="row">
              <td class="col-no">{{ row }}</td>
              <td></td>
              <td></td>
              <td></td>
              <td class="col-memo"></td>
            </tr>
          </tbody>
        </table>

        <table class="oral-table">
          <thead>
            <tr>
              <th>구술평가 항목</th>
              <th class="col-result">O / △ / X</th>
              <th class="col-memo">보완 필요 사항</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in ORAL_ROWS" :key="item">
              <td>{{ item }}</td>
              <td class="col-result"></td>
              <td class="col-memo"></td>
            </tr>
          </tbody>
        </table>

        <div class="sign-summary">
          <p>교육일시 ·</p>
          <p>교육자(총괄) 최윤희 ·</p>
          <p>확인자(대표) ·</p>
        </div>
      </section>

      <footer class="sheet-foot">
        <p>
          혼자야 ARC SAFETY · AS-GDE-001 현장응급처치 교육가이드 / AS-KIT-001
          구급상자 운영관리대장 기준
        </p>
        <p>
          이 자료는 내부 교육용입니다. 실제 환자 상태 판단과 투약은 의료인·119
          지시를 따릅니다.
        </p>
      </footer>
    </article>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { fetchArcTrainingGuide } from "@/lib/arc";

const QUICK_CARD = [
  {
    label: "119 신고",
    value: "상황·위치·환자 상태·연락처를 한 번에. 끊지 말고 지시를 따릅니다.",
  },
  {
    label: "반응·호흡",
    value: "10초 안에 확인. 반응 없고 정상호흡 없으면 심정지로 판단합니다.",
  },
  {
    label: "가슴압박",
    value: "성인 5~6cm · 분당 100~120회 · 중단 최소화 · 완전히 이완.",
  },
  {
    label: "AED",
    value:
      "도착 즉시 패드 부착, 분석 중에는 손을 뗍니다. 음성 안내를 따릅니다.",
  },
  {
    label: "기가폐쇄",
    value: "기침 유도 → 말 못 하면 등 두드리기 5회 · 가슴 밀어내기 5회 반복.",
  },
  {
    label: "출혈",
    value: "직접 압박이 기본. 젖으면 위에 겹쳐 계속 압박합니다.",
  },
  {
    label: "화상",
    value: "흐르는 서늘한 물 20분. 얼음·기름·연고·물집 터뜨리기 금지.",
  },
  {
    label: "기록",
    value: "발견·신고·조치 시각과 한 일을 사실만. AS-CARE 24시간 내 정리.",
  },
];

const SECTION_TOGGLES = [
  { key: "cover", label: "표지" },
  { key: "quick", label: "3분 요약·공부법" },
  { key: "teacherKit", label: "비서 키트(교육자용)" },
  { key: "modules", label: "1부 핵심 모듈" },
  { key: "scenarios", label: "2부 상황연습" },
  { key: "forbidden", label: "3부 절대금지" },
  { key: "glossary", label: "용어 사전" },
  { key: "sign", label: "서명·평가표" },
];

const TABLE_OF_CONTENTS = [
  { no: "표지", title: "교육 개요 · 오늘의 목표", note: "일시·장소·대상 기입" },
  {
    no: "요약",
    title: "3분 요약 카드 · 공부법",
    note: "교육 시작 전 함께 읽기",
  },
  {
    no: "키트",
    title: "교육자 비서 키트",
    note: "준비물·시간표·대본·예상질문",
  },
  { no: "1부", title: "핵심 모듈", note: "쉬운 설명 · 현장 사례 · 꼬리질문" },
  { no: "2부", title: "상황연습", note: "장면별 대응 순서 · 함정" },
  { no: "3부", title: "절대금지", note: "이유와 대신 할 행동" },
  { no: "부록", title: "용어 사전 · 서명란", note: "교육 증빙" },
];

const SIGN_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const ORAL_ROWS = [
  "권한의 경계 — 진단·투약 판단을 하지 않는다",
  "반응·호흡 확인과 심정지 판단",
  "가슴압박·AED 절차",
  "상황연습 3개 — 먼저 할 일과 하지 말아야 할 일",
  "절대금지 10개 — 이유와 대신 할 행동",
  "기록·개인정보 — AS-CARE와 열람 원칙",
];

const isLoading = ref(true);
const errorMessage = ref("");
const guide = ref(null);
const selectedKeys = ref([]);
const selectedCategory = ref("ALL");
const showForbidden = ref(true);
const mode = ref("teacher");
const sections = ref({
  cover: true,
  quick: true,
  teacherKit: true,
  modules: true,
  scenarios: true,
  forbidden: true,
  glossary: true,
  sign: true,
});

const modules = computed(() => guide.value?.modules ?? []);
const scenarios = computed(() => guide.value?.scenarios ?? []);
const forbidden = computed(() => guide.value?.forbidden ?? []);
const examGuide = computed(() => guide.value?.examGuide ?? null);
const teacherKit = computed(() => guide.value?.teacherKit ?? null);
const glossary = computed(() => guide.value?.glossary ?? []);
const totals = computed(() => guide.value?.totals ?? null);
const isTeacher = computed(() => mode.value === "teacher");

const categories = computed(() => {
  const set = new Set(
    scenarios.value.map((item) => item.category).filter(Boolean)
  );
  return [...set];
});

const visibleModules = computed(() =>
  modules.value.filter((item) => selectedKeys.value.includes(item.key))
);

const visibleScenarios = computed(() =>
  scenarios.value.filter(
    (item) =>
      selectedCategory.value === "ALL" ||
      item.category === selectedCategory.value
  )
);

const visibleForbidden = computed(() =>
  showForbidden.value ? forbidden.value : []
);

const printedOn = computed(() => {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
});

// 인쇄 분량을 미리 가늠할 수 있게 모듈 시간 + 연습 시간으로 계산합니다.
const estimateMinutes = computed(() => {
  const moduleMinutes = visibleModules.value.reduce(
    (sum, item) => sum + (item.minutes ?? 0),
    0
  );
  const scenarioMinutes = visibleScenarios.value.length * 2;
  const forbiddenMinutes = Math.ceil(visibleForbidden.value.length * 0.5);
  return moduleMinutes + scenarioMinutes + forbiddenMinutes;
});

function isModuleSelected(key) {
  return selectedKeys.value.includes(key);
}

function toggleModule(key) {
  selectedKeys.value = isModuleSelected(key)
    ? selectedKeys.value.filter((item) => item !== key)
    : [...selectedKeys.value, key];
}

function selectAllModules() {
  selectedKeys.value = modules.value.map((item) => item.key);
}

function clearModules() {
  selectedKeys.value = [];
}

function printSheet() {
  // PDF로 저장할 때 파일 이름이 의미 있게 남도록 제목을 잠시 바꿉니다.
  const previousTitle = document.title;
  const label = isTeacher.value ? "교육자용" : "교육생용";
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(now.getDate()).padStart(2, "0")}`;
  document.title = `혼자야_응급처치교육_${label}_${stamp}`;
  window.print();
  document.title = previousTitle;
}

async function load() {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    const data = await fetchArcTrainingGuide();
    guide.value = data;
    selectedKeys.value = (data?.modules ?? []).map((item) => item.key);
  } catch (error) {
    errorMessage.value =
      error?.message ||
      "교육자료를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  document.body.classList.add("arc-guide-open");
  load();
});

onUnmounted(() => {
  document.body.classList.remove("arc-guide-open");
});
</script>

<style scoped lang="scss">
.admin-arc-training-guide-view {
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

.header-left {
  max-width: 780px;
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
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.66);
}

.header-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
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

.print-button {
  padding: 10px 18px;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.18);
  color: #bae6fd;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }
}

.filter-actions {
  display: flex;
  gap: 8px;
}

.ghost-button {
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &.active {
    border-color: rgba(167, 139, 250, 0.6);
    background: rgba(139, 92, 246, 0.24);
    color: #ede9fe;
  }
}

.category-select {
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: #131c2e;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);

  input {
    width: 16px;
    height: 16px;
    accent-color: #8b5cf6;
  }
}

.print-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.16);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fecaca;
  font-size: 13px;
}

.empty-box {
  margin: 0;
  padding: 22px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  text-align: center;
}

/* 인쇄 결과와 최대한 같게 보이도록 종이 느낌으로 표시합니다. */
.guide-sheet {
  width: 100%;
  max-width: 940px;
  margin: 0 auto;
  padding: 34px 38px 42px;
  border-radius: 18px;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  line-height: 1.75;
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.45);

  h1,
  h2,
  h3,
  h4,
  p,
  ul,
  ol,
  dl,
  dd {
    margin: 0;
  }

  ul,
  ol {
    padding-left: 18px;
  }

  h2 {
    font-size: 17px;
    font-weight: 800;
  }

  h3 {
    font-size: 14px;
    font-weight: 800;
  }

  h4 {
    font-size: 13px;
    font-weight: 800;
    color: #1e293b;
  }
}

.sheet-head {
  padding-bottom: 16px;
  border-bottom: 2px solid #111827;

  h1 {
    font-size: 26px;
    font-weight: 900;
    letter-spacing: -0.01em;
  }
}

.sheet-brand {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #6d28d9;
}

.sheet-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #475569;
}

.sheet-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 18px;
  margin-top: 14px;

  dt {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #64748b;
  }

  dd {
    font-size: 12px;
    color: #1f2937;
  }
}

.sheet-section {
  margin-top: 26px;

  > h2 {
    padding-bottom: 6px;
    border-bottom: 1px solid #cbd5e1;
  }
}

.section-lead {
  margin-top: 8px;
  font-size: 12px;
  color: #475569;
}

.quick-list {
  margin-top: 10px;
  display: grid;
  gap: 6px;
  list-style: none;
  padding-left: 0 !important;

  li {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 8px;
    background: #f1f5f9;
  }

  strong {
    font-size: 12px;
    font-weight: 800;
    color: #4c1d95;
  }

  span {
    font-size: 12px;
    color: #1f2937;
  }
}

.round-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.round-card {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;

  h3 {
    font-size: 12px;
    color: #4c1d95;
  }

  p {
    margin-top: 4px;
    font-size: 12px;
    color: #334155;
  }
}

.tip-list {
  margin-top: 10px;
  font-size: 12px;
  color: #334155;
}

.sheet-card {
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid #d7dde7;
  border-radius: 12px;
  break-inside: avoid;
  page-break-inside: avoid;

  h3 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
}

.tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
  font-size: 10px;
  font-weight: 800;
}

.goal {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #1f2937;
}

.why {
  margin-top: 6px;
  font-size: 12px;
  color: #334155;
}

.body-block {
  margin-top: 10px;

  h4 {
    font-size: 12px;
    color: #4c1d95;
  }

  p {
    margin-top: 2px;
    font-size: 12px;
    color: #1f2937;
  }
}

.number-list {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  padding-left: 0 !important;

  li {
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid #fbcfe8;
    background: #fdf2f8;
    font-size: 11px;
    font-weight: 700;
    color: #9d174d;
  }
}

.bullet-box {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  break-inside: avoid;

  ul {
    margin-top: 4px;
    font-size: 12px;
  }

  &.good {
    background: #f0fdf4;
    border-left: 3px solid #22c55e;
  }

  &.bad {
    background: #fef2f2;
    border-left: 3px solid #ef4444;
  }

  &.plain {
    background: #f8fafc;
    border-left: 3px solid #94a3b8;
  }

  &.eval {
    background: #fefce8;
    border-left: 3px solid #eab308;
  }
}

.bullet-title {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #0f172a;
}

.oral-box {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px dashed #a5b4fc;
  background: #eef2ff;
  break-inside: avoid;
}

.oral-q {
  font-size: 12px;
  font-weight: 800;
  color: #312e81;
}

.oral-a {
  margin-top: 3px;
  font-size: 12px;
  color: #1f2937;
}

.materials-line {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.6;
  color: #64748b;
}

.step-list {
  margin-top: 8px;
  font-size: 12px;
  color: #1f2937;

  li {
    margin-top: 3px;
  }
}

.trap-line {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #b45309;
}

.term-note {
  display: block;
  margin-top: 2px;
  padding-left: 2px;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.55;
  color: #475569;
}

.term-box {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  background: #f1f5f9;
  border-left: 3px solid #0ea5e9;
  break-inside: avoid;

  .bullet-title {
    color: #0c4a6e;
  }
}

.term-list {
  margin-top: 4px;
  display: grid;
  gap: 3px;
  font-size: 11px;
  line-height: 1.55;
  color: #1f2937;

  li {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 6px;
  }

  strong {
    font-weight: 800;
    color: #0c4a6e;
  }
}

.forbidden-list {
  margin-top: 10px;
  display: grid;
  gap: 8px;
  font-size: 12px;

  li {
    padding: 8px 12px;
    border-radius: 10px;
    background: #fef2f2;
    border-left: 3px solid #ef4444;
    break-inside: avoid;
  }
}

.forbidden-text {
  font-weight: 800;
  color: #991b1b;
}

.forbidden-why {
  margin-top: 3px;
  color: #334155;
}

.forbidden-instead {
  margin-top: 2px;
  font-weight: 700;
  color: #15803d;
}

.forbidden-risk {
  margin-top: 2px;
  color: #b91c1c;
}

.forbidden-signs {
  margin-top: 2px;
  color: #b45309;
}

.forbidden-drill {
  margin-top: 2px;
  color: #0f766e;
}

.forbidden-basis {
  margin-top: 2px;
  font-size: 11px;
  color: #64748b;
}

.sheet-foot {
  margin-top: 28px;
  padding-top: 12px;
  border-top: 1px solid #cbd5e1;
  font-size: 10px;
  line-height: 1.6;
  color: #64748b;
}

/* ── 표지 ───────────────────────────────────────────── */
.cover-page {
  padding-bottom: 18px;
  border-bottom: 3px double #111827;

  .cover-brand {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    color: #6d28d9;
  }

  .cover-title {
    margin-top: 22px;
    font-size: 34px;
    font-weight: 900;
    line-height: 1.3;
    letter-spacing: -0.02em;
  }

  .cover-sub {
    margin-top: 10px;
    font-size: 13px;
    color: #475569;
  }
}

.cover-table {
  width: 100%;
  margin-top: 22px;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    border: 1px solid #94a3b8;
    padding: 9px 10px;
    text-align: left;
    vertical-align: middle;
  }

  th {
    width: 78px;
    background: #f1f5f9;
    font-weight: 800;
    color: #1e293b;
    white-space: nowrap;
  }

  td {
    height: 30px;
    color: #1f2937;
  }
}

.cover-goal {
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #ddd6fe;
  background: #f5f3ff;

  .cover-goal-title {
    font-size: 12px;
    font-weight: 800;
    color: #4c1d95;
  }

  ol {
    margin-top: 8px;
    font-size: 12px;
    color: #1f2937;

    li {
      margin-top: 4px;
    }
  }
}

.cover-toc {
  margin-top: 20px;
  list-style: none;
  padding-left: 0 !important;

  li {
    display: grid;
    grid-template-columns: 58px 1fr auto;
    gap: 10px;
    align-items: baseline;
    padding: 7px 0;
    border-bottom: 1px dotted #cbd5e1;
    font-size: 12px;
  }

  .toc-no {
    font-weight: 800;
    color: #6d28d9;
  }

  .toc-title {
    font-weight: 700;
    color: #0f172a;
  }

  .toc-note {
    color: #64748b;
  }
}

.cover-foot {
  margin-top: 18px;
  font-size: 10px;
  line-height: 1.7;
  color: #64748b;
}

.sheet-mode {
  color: #6d28d9;
}

/* ── 비서 키트 ───────────────────────────────────────── */
.sub-head {
  margin-top: 16px;
  padding-left: 8px;
  border-left: 3px solid #6d28d9;
  font-size: 12px;
  font-weight: 800;
  color: #4c1d95;
}

.check-list {
  margin-top: 8px;
  list-style: none;
  padding-left: 0 !important;
  font-size: 12px;
  color: #1f2937;

  li {
    display: grid;
    grid-template-columns: 14px 1fr;
    gap: 8px;
    align-items: start;
    margin-top: 5px;
  }
}

.check-box {
  width: 11px;
  height: 11px;
  margin-top: 4px;
  border: 1px solid #64748b;
  border-radius: 2px;
}

.supply-list {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  padding-left: 0 !important;

  li {
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    font-size: 11px;
    font-weight: 700;
    color: #334155;
  }
}

.kit-table {
  width: 100%;
  margin-top: 8px;
  border-collapse: collapse;
  font-size: 11.5px;

  th,
  td {
    border: 1px solid #cbd5e1;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #eef2ff;
    font-weight: 800;
    color: #312e81;
  }

  .col-no {
    width: 38px;
    text-align: center;
  }

  .col-min {
    width: 46px;
    text-align: center;
    white-space: nowrap;
  }

  .col-week {
    width: 96px;
  }

  .col-theme {
    width: 132px;
  }

  .col-note {
    color: #334155;
  }
}

.script-list {
  margin-top: 8px;
  display: grid;
  gap: 8px;
}

.script-row {
  padding: 8px 12px;
  border-left: 3px solid #818cf8;
  background: #f8fafc;
  border-radius: 0 8px 8px 0;
  break-inside: avoid;

  .script-h {
    font-size: 11px;
    font-weight: 800;
    color: #4338ca;
  }

  .script-p {
    margin-top: 3px;
    font-size: 11.5px;
    line-height: 1.7;
    color: #1f2937;
  }
}

.faq-list {
  margin-top: 8px;
  display: grid;
  gap: 7px;
}

.faq-row {
  padding: 8px 12px;
  border-radius: 8px;
  background: #f1f5f9;
  break-inside: avoid;

  .faq-q {
    font-size: 11.5px;
    font-weight: 800;
    color: #312e81;
  }

  .faq-a {
    margin-top: 3px;
    font-size: 11.5px;
    line-height: 1.7;
    color: #1f2937;
  }
}

/* ── 카드 보강 블록 ──────────────────────────────────── */
.easy-box {
  margin-top: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  background: #eff6ff;
  border-left: 3px solid #3b82f6;
  font-size: 12px;
  line-height: 1.8;
  color: #1e3a8a;
  break-inside: avoid;

  .easy-label {
    display: block;
    margin-bottom: 2px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #1d4ed8;
  }
}

.example-box {
  margin-top: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  background: #f0fdfa;
  border-left: 3px solid #14b8a6;
  font-size: 12px;
  line-height: 1.8;
  color: #134e4a;
  break-inside: avoid;

  .example-label {
    display: block;
    margin-bottom: 2px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #0f766e;
  }
}

.ask-box {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid #ddd6fe;
  background: #faf5ff;
  break-inside: avoid;
}

.ask-row {
  margin-top: 4px;

  .ask-q {
    font-size: 11.5px;
    font-weight: 800;
    color: #5b21b6;
  }

  .ask-a {
    margin-top: 2px;
    font-size: 11.5px;
    line-height: 1.7;
    color: #1f2937;
  }
}

.write-block {
  margin-top: 8px;
}

.write-title {
  font-size: 11px;
  font-weight: 800;
  color: #475569;
}

.write-lines {
  margin-top: 4px;
  display: grid;
  gap: 14px;

  span {
    display: block;
    height: 1px;
    border-bottom: 1px dashed #94a3b8;
  }
}

.forbidden-example {
  margin-top: 3px;
  font-size: 11px;
  color: #7f1d1d;
}

/* ── 용어 사전 ───────────────────────────────────────── */
.glossary-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 16px;

  .glossary-row {
    padding: 6px 0;
    border-bottom: 1px dotted #cbd5e1;
    break-inside: avoid;
  }

  dt {
    font-size: 11.5px;
    font-weight: 800;
    color: #4c1d95;
  }

  dd {
    margin: 2px 0 0;
    font-size: 11.5px;
    line-height: 1.7;
    color: #1f2937;
  }
}

/* ── 서명 · 평가 ─────────────────────────────────────── */
.sign-table,
.oral-table {
  width: 100%;
  margin-top: 10px;
  border-collapse: collapse;
  font-size: 11.5px;

  th,
  td {
    border: 1px solid #94a3b8;
    padding: 7px 8px;
    text-align: left;
  }

  th {
    background: #f1f5f9;
    font-weight: 800;
    color: #1e293b;
  }

  tbody tr {
    height: 30px;
  }

  .col-no {
    width: 40px;
    text-align: center;
  }

  .col-result {
    width: 90px;
    text-align: center;
  }

  .col-memo {
    width: 32%;
  }
}

.sign-summary {
  margin-top: 14px;
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
  font-size: 11.5px;
  font-weight: 700;
  color: #1e293b;

  p {
    padding-bottom: 2px;
    border-bottom: 1px solid #94a3b8;
    min-width: 170px;
  }
}

.mode-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mode-button {
  padding: 9px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &.active {
    border-color: rgba(56, 189, 248, 0.65);
    background: rgba(56, 189, 248, 0.22);
    color: #e0f2fe;
  }
}

.section-toggles {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .admin-arc-training-guide-view {
    padding: 16px;
  }

  .guide-sheet {
    padding: 22px 18px 30px;
  }

  .quick-list li {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .glossary-grid {
    grid-template-columns: 1fr;
  }

  .cover-page .cover-title {
    font-size: 26px;
  }

  .kit-table {
    font-size: 11px;
  }
}
</style>

<!-- 인쇄 전용: 사이드바·상단바를 숨기고 종이 여백만 남깁니다. 이 화면에서만 동작합니다. -->
<style lang="scss">
@media print {
  @page {
    size: A4;
    margin: 12mm 10mm;
  }

  body.arc-guide-open {
    background: #ffffff !important;
  }

  body.arc-guide-open .admin-layout {
    display: block !important;
    background: #ffffff !important;
    color: #111827 !important;
    color-scheme: light !important;
    min-height: auto !important;
  }

  body.arc-guide-open .admin-sidebar,
  body.arc-guide-open .admin-topbar,
  body.arc-guide-open .mobile-menu-backdrop,
  body.arc-guide-open .no-print {
    display: none !important;
  }

  body.arc-guide-open .admin-main {
    display: block !important;
    margin: 0 !important;
    width: auto !important;
  }

  body.arc-guide-open .admin-content {
    padding: 0 !important;
    background: #ffffff !important;
  }

  body.arc-guide-open .guide-sheet {
    max-width: none !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    font-size: 11.5px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* 표지는 단독 1페이지, 각 부(部)는 새 페이지에서 시작합니다. */
  body.arc-guide-open .cover-page {
    break-after: page;
    page-break-after: always;
  }

  body.arc-guide-open .part-break {
    break-before: page;
    page-break-before: always;
  }

  body.arc-guide-open .sheet-section > h2,
  body.arc-guide-open .sub-head {
    break-after: avoid;
    page-break-after: avoid;
  }

  body.arc-guide-open .sheet-card,
  body.arc-guide-open .round-card,
  body.arc-guide-open .bullet-box,
  body.arc-guide-open .oral-box,
  body.arc-guide-open .forbidden-list li,
  body.arc-guide-open .easy-box,
  body.arc-guide-open .example-box,
  body.arc-guide-open .ask-box,
  body.arc-guide-open .script-row,
  body.arc-guide-open .faq-row,
  body.arc-guide-open .glossary-row,
  body.arc-guide-open .kit-table tr,
  body.arc-guide-open .sign-table tr,
  body.arc-guide-open .oral-table tr,
  body.arc-guide-open .write-block,
  body.arc-guide-open .term-box {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  body.arc-guide-open .quick-list li,
  body.arc-guide-open .glossary-grid,
  body.arc-guide-open .kit-table,
  body.arc-guide-open .sign-table,
  body.arc-guide-open .oral-table {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
