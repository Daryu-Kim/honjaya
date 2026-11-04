<template>
  <div class="tablet-admin-view">
    <header class="tablet-header">
      <div class="header-left">
        <p class="eyebrow">TABLET ADMIN</p>
        <h1>매장 운영 패널</h1>
      </div>

      <div class="header-right">
        <button
          type="button"
          class="header-chat-button market-toggle"
          :class="{ live: marketEnabled }"
          @click="toggleMarket"
        >
          <span>{{ marketEnabled ? "📈 시세 ON" : "📉 시세 OFF" }}</span>
        </button>

        <button
          type="button"
          class="header-chat-button"
          :class="{ alerting: totalChatAlertCount > 0 }"
          @click="openChatPanel"
        >
          <span>💬 테이블 채팅</span>
          <span v-if="totalChatAlertCount > 0" class="header-chat-badge">
            {{ totalChatAlertCount }}
          </span>
        </button>

        <div class="header-summary">
          <span>{{ currentDateText }}</span>
        </div>
      </div>
    </header>

    <section class="tab-section">
      <div class="tab-scroll">
        <button
          v-for="tab in tabList"
          :key="tab.key"
          type="button"
          class="tab-button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </section>

    <section class="content-section">
      <!-- 테이블 현황 -->
      <div v-if="activeTab === 'tables'" class="tab-panel">
        <div class="panel-head">
          <h2>테이블 현황</h2>
          <p>최근 주문, 총 금액, 결제 상태를 확인할 수 있어요.</p>
        </div>

        <div v-if="isLoadingOrderSheets" class="empty-box">
          <p>테이블 정보를 불러오는 중이에요.</p>
        </div>

        <div v-else-if="tableLayoutList.length === 0" class="empty-box">
          <p>표시할 테이블이 없어요.</p>
        </div>

        <div v-else class="table-grid">
          <button
            v-for="table in tableLayoutList"
            :key="table.tableNumber"
            type="button"
            class="table-card"
            :class="{ paid: table.paymentStatus === 'COMPLETED' }"
            @click="selectTable(table)"
          >
            <div class="table-card-top">
              <div class="table-card-title">
                <strong>{{ table.tableLabel }}</strong>
                <span v-if="table.tableNickname" class="table-nickname">
                  {{ table.tableNickname }}
                </span>
              </div>
              <span class="status-badge">
                {{ convertOrderSheetStatusText(table.status) }}
              </span>
            </div>

            <div class="table-card-middle">
              <p class="table-location">{{ table.locationLabel }}</p>
              <p class="table-amount">{{ formatPrice(table.totalAmount) }}원</p>
              <div
                v-if="normalizeOrderSheetTags(table.internalTags).length > 0"
                class="table-tag-list"
              >
                <span
                  v-for="tag in normalizeOrderSheetTags(table.internalTags)"
                  :key="`${table.orderSheetId}-${tag}`"
                  class="table-tag"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <div class="table-card-bottom">
              <div
                v-if="
                  table.latestOrderItemsPreview &&
                  table.latestOrderItemsPreview.length > 0
                "
                class="table-preview-list"
              >
                <span
                  v-for="(
                    preview, index
                  ) in table.latestOrderItemsPreview.slice(0, 5)"
                  :key="`${table.tableNumber}-${index}`"
                >
                  {{ preview.productName }} {{ preview.quantity }}개
                </span>
                <span
                  v-if="getHiddenPreviewCount(table) > 0"
                  class="more-preview"
                >
                  + {{ getHiddenPreviewCount(table) }}개
                </span>
              </div>

              <p v-else class="no-preview">주문 내역 없음</p>
            </div>
          </button>
        </div>

        <div class="maintenance-box">
          <div class="maintenance-head">
            <div>
              <h3>테이블 번호 통일 정리</h3>
              <p>
                예전에 01 형태로 저장된 테이블 번호를 1 형태로 한 번에 맞춰요.
                (주문서 · 주문 · 채팅 · 활성 키)
              </p>
            </div>

            <div class="maintenance-actions">
              <button
                type="button"
                class="ghost"
                :disabled="
                  isTableNumberCleanupScanning || isTableNumberCleanupRunning
                "
                @click="handleScanTableNumberCleanup"
              >
                {{ isTableNumberCleanupScanning ? "검사 중..." : "대상 검사" }}
              </button>
              <button
                type="button"
                :disabled="
                  isTableNumberCleanupScanning || isTableNumberCleanupRunning
                "
                @click="handleRunTableNumberCleanup"
              >
                {{ isTableNumberCleanupRunning ? "정리 중..." : "정리 실행" }}
              </button>
            </div>
          </div>

          <p v-if="tableNumberCleanupProgress" class="maintenance-progress">
            {{ tableNumberCleanupProgress }}
          </p>

          <div v-if="tableNumberCleanupScan" class="maintenance-summary">
            <strong>검사 결과: 총 {{ tableNumberCleanupScan.total }}건</strong>
            <ul>
              <li
                v-for="item in tableNumberCleanupScan.collections"
                :key="`scan-${item.key}`"
              >
                {{ item.label }} {{ item.count }}건
              </li>
            </ul>
          </div>

          <div v-if="tableNumberCleanupResult" class="maintenance-summary">
            <strong>
              정리 결과: 성공 {{ tableNumberCleanupSuccessCount }}건
              <template v-if="tableNumberCleanupResult.failed.length > 0">
                / 실패 {{ tableNumberCleanupResult.failed.length }}건
              </template>
            </strong>
            <ul v-if="tableNumberCleanupResult.updated.length > 0">
              <li
                v-for="item in tableNumberCleanupResult.updated"
                :key="`result-${item.key}`"
              >
                {{ item.label }} {{ item.count }}건
              </li>
            </ul>

            <div
              v-if="tableNumberCleanupResult.failed.length > 0"
              class="maintenance-fail"
            >
              <p>실패한 항목이에요. "다시 시도"를 누르면 재처리돼요.</p>
              <ul>
                <li
                  v-for="item in tableNumberCleanupResult.failed.slice(0, 20)"
                  :key="`fail-${item.collection}-${item.id}`"
                >
                  {{ item.label }} · {{ item.id }} — {{ item.reason }}
                </li>
              </ul>
              <button type="button" @click="handleRunTableNumberCleanup">
                다시 시도
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 주문 탭 -->
      <div v-else-if="activeTab === 'orders'" class="tab-panel">
        <div class="panel-head">
          <h2>주문 관리</h2>
          <p>최근 주문을 확인하고 처리 상태를 바꿀 수 있어요.</p>
        </div>

        <div v-if="isLoadingOrders" class="empty-box">
          <p>주문 정보를 불러오는 중이에요.</p>
        </div>

        <div v-else-if="filteredOrderList.length === 0" class="empty-box">
          <p>진행 중인 주문이 없어요.</p>
        </div>

        <div v-else class="list-card-wrap">
          <article
            v-for="order in filteredOrderList"
            :key="order.id"
            class="list-card"
          >
            <div class="list-card-head">
              <div>
                <strong>{{
                  order.displayName || `No.${order.tableNumber}`
                }}</strong>
                <p>{{ order.orderSheetId }}</p>
              </div>
              <span class="status-badge">
                {{ convertOrderStatusText(order.status) }}
              </span>
            </div>

            <div class="order-item-list">
              <div
                v-for="(item, index) in order.items || []"
                :key="`${order.id}-${item.productId}-${index}`"
                class="order-item-row"
              >
                <div class="order-item-left">
                  <strong>{{ item.productName }}</strong>
                  <span
                    >{{ formatPrice(item.unitPrice || 0) }}원 ×
                    {{ item.quantity }}개</span
                  >

                  <div
                    v-if="
                      item.selectedOptions && item.selectedOptions.length > 0
                    "
                    class="order-option-list"
                  >
                    <div
                      v-for="(option, optionIndex) in item.selectedOptions"
                      :key="`${order.id}-${index}-${optionIndex}`"
                      class="order-option-row"
                    >
                      <span>{{ option.groupName }}</span>
                      <span>{{ option.optionName }}</span>
                      <span>
                        {{
                          Number(option.additionalPrice || 0) > 0
                            ? `+${formatPrice(option.additionalPrice)}원`
                            : "+0원"
                        }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="order-item-right">
                  <strong>{{ formatPrice(item.totalPrice || 0) }}원</strong>
                  <button
                    type="button"
                    class="recipe-view-button"
                    @click="openRecipeModalByOrderItem(item)"
                  >
                    레시피 보기
                  </button>
                </div>
              </div>
            </div>

            <div v-if="order.isGift" class="gift-badge">
              🎁 {{ resolveGiftTargetLabel(order) }} 선물
            </div>

            <div v-if="order.requestMessage" class="request-message-box">
              <span>요청사항</span>
              <p>{{ order.requestMessage }}</p>
            </div>

            <div class="list-card-bottom">
              <strong>{{ formatPrice(order.totalPrice || 0) }}원</strong>

              <div class="action-row">
                <button
                  type="button"
                  @click="confirmOrderStatusChange(order, 'SERVED')"
                >
                  제공완료
                </button>
                <button
                  type="button"
                  class="danger"
                  @click="confirmOrderStatusChange(order, 'CANCELLED')"
                >
                  취소
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <!-- 레시피 탭 -->
      <div v-else-if="activeTab === 'recipes'" class="tab-panel">
        <div class="panel-head">
          <h2>레시피</h2>
          <p>메뉴를 선택해 레시피를 확인할 수 있어요.</p>
        </div>

        <div class="recipe-layout">
          <div class="recipe-menu-panel">
            <div class="recipe-search-box">
              <input
                v-model.trim="recipeKeyword"
                type="text"
                placeholder="메뉴명을 검색해주세요"
              />
            </div>

            <div class="category-filter-scroll">
              <button
                v-for="category in categoryFilterList"
                :key="`recipe-${category.id}`"
                type="button"
                class="category-filter-button"
                :class="{ active: selectedRecipeCategory === category.id }"
                @click="selectedRecipeCategory = category.id"
              >
                {{ category.name }}
              </button>
            </div>

            <div class="recipe-menu-list">
              <button
                v-for="product in filteredRecipeProductList"
                :key="product.id"
                type="button"
                class="recipe-menu-button"
                :class="{
                  active: recipeModalProduct?.id === product.id,
                  empty: !product.recipeInfo && !product.recipeText,
                }"
                @click="openRecipeModal(product)"
              >
                <div class="recipe-menu-button-left">
                  <strong>{{ product.productName }}</strong>
                  <p>{{ product.description || "설명 없음" }}</p>
                </div>

                <span class="recipe-badge">
                  {{
                    product.recipeInfo || product.recipeText
                      ? "레시피 있음"
                      : "레시피 없음"
                  }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 실시간 시세 탭 -->
      <div v-else-if="activeTab === 'market'" class="tab-panel">
        <div class="panel-head">
          <h2>실시간 시세</h2>
          <p>
            메뉴 가격이 주식처럼 실시간으로 움직입니다. 켜 두면 손님 주문
            금액에도 그 가격이 그대로 적용돼요.
          </p>
        </div>

        <div class="market-summary">
          <div class="market-summary-card">
            <span class="market-summary-label">혼자야 지수</span>
            <strong>{{ marketIndexValue.toFixed(1) }}</strong>
            <span
              class="market-summary-change"
              :class="marketIndexChangePct >= 0 ? 'up' : 'down'"
            >
              {{ marketIndexText }}
            </span>
          </div>

          <div class="market-summary-card">
            <span class="market-summary-label">거래 상태</span>
            <strong>{{ marketStatusText }}</strong>
            <span class="market-summary-change">
              {{ market.productCount.value }}종 참여
            </span>
          </div>

          <div class="market-summary-card">
            <span class="market-summary-label">주문 금액 반영</span>
            <strong>
              {{ market.config.value.applyToOrders ? "ON" : "OFF" }}
            </strong>
            <span class="market-summary-change">
              {{ market.config.value.tickSeconds }}초마다 갱신
            </span>
          </div>
        </div>

        <div class="market-report-block">
          <h3>오늘의 시세 리포트</h3>

          <div v-if="marketTodayStats" class="market-report-stats">
            <div class="market-report-stat">
              <span>시가</span>
              <strong>{{ marketTodayStats.open }}</strong>
            </div>
            <div class="market-report-stat">
              <span>고가</span>
              <strong class="up">{{ marketTodayStats.high }}</strong>
            </div>
            <div class="market-report-stat">
              <span>저가</span>
              <strong class="down">{{ marketTodayStats.low }}</strong>
            </div>
            <div class="market-report-stat">
              <span>현재</span>
              <strong :class="marketTodayStats.trend">
                {{ marketTodayStats.close }}
              </strong>
              <span class="market-report-delta">
                {{ marketTodayStats.changeText }}
              </span>
            </div>
          </div>

          <div class="market-report-chart">
            <MarketSparkline
              :values="marketIndexSeriesValues"
              :width="960"
              :height="180"
              :stroke-width="2"
              :baseline="1000"
            />
            <p
              v-if="marketIndexSeriesValues.length < 2"
              class="market-report-empty"
            >
              시세를 켜면 오늘의 지수 곡선이 여기에 쌓여요.
            </p>
          </div>

          <p class="market-report-note">
            5분 단위 기록 · 비어 있는 구간은 시세 엔진으로 복원해서 보여줘요.
          </p>

          <p v-if="marketHistoryError" class="market-report-error">
            {{ marketHistoryError }}
          </p>
        </div>

        <div class="market-table-block">
          <h3>최근 영업일</h3>

          <div v-if="marketHistoryList.length === 0" class="empty-box compact">
            <p>아직 기록된 영업일이 없어요.</p>
          </div>

          <div v-else class="market-table">
            <div class="market-table-row head">
              <span>영업일</span>
              <span>종가</span>
              <span>등락</span>
              <span>고가 / 저가</span>
            </div>

            <div
              v-for="entry in marketHistoryList"
              :key="entry.businessDate"
              class="market-table-row"
            >
              <span class="market-table-name">{{ entry.businessDate }}</span>
              <strong>{{ entry.closeText }}</strong>
              <span :class="entry.trend">{{ entry.changeText }}</span>
              <span>{{ entry.rangeText }}</span>
            </div>
          </div>
        </div>

        <div class="market-controls">
          <label class="market-field">
            <span>갱신 주기(초)</span>
            <input
              v-model.number="marketDraft.tickSeconds"
              type="number"
              min="1"
              max="10"
              step="1"
            />
          </label>

          <label class="market-field">
            <span>최대 변동폭(%)</span>
            <input
              v-model.number="marketDraft.maxChangePct"
              type="number"
              min="5"
              max="200"
              step="5"
            />
          </label>

          <label class="market-field">
            <span>변동성</span>
            <input
              v-model.number="marketDraft.volatility"
              type="number"
              min="0.2"
              max="3"
              step="0.1"
            />
          </label>

          <label class="market-field">
            <span>주문 수요 가중치</span>
            <input
              v-model.number="marketDraft.demandWeight"
              type="number"
              min="0"
              max="3"
              step="0.1"
            />
          </label>

          <label class="market-field">
            <span>재료 연쇄 가중치</span>
            <input
              v-model.number="marketDraft.chainWeight"
              type="number"
              min="0"
              max="3"
              step="0.1"
            />
          </label>

          <label class="market-field">
            <span>수요 기준 수량(30분)</span>
            <input
              v-model.number="marketDraft.demandTarget"
              type="number"
              min="1"
              max="40"
              step="1"
            />
          </label>
        </div>

        <div class="market-category-block">
          <h3>참여 메뉴 카테고리</h3>
          <p>아무것도 고르지 않으면 모든 메뉴가 참여합니다.</p>

          <div class="market-category-row">
            <label
              v-for="category in categoryFilterList"
              :key="`market-category-${category.id}`"
              class="market-category-chip"
              :class="{
                active: marketDraft.categoryIds.includes(String(category.id)),
              }"
            >
              <input
                v-model="marketDraft.categoryIds"
                type="checkbox"
                :value="String(category.id)"
              />
              <span>{{ category.name }}</span>
            </label>
          </div>
        </div>

        <label class="market-checkbox-row">
          <input v-model="marketDraft.applyToOrders" type="checkbox" />
          <span>손님 주문 금액에도 시세를 적용합니다.</span>
        </label>

        <div class="market-action-row">
          <button
            type="button"
            class="market-action-button primary"
            :disabled="isSavingMarket"
            @click="saveMarketDraft"
          >
            {{ isSavingMarket ? "저장 중..." : "설정 저장" }}
          </button>

          <button
            type="button"
            class="market-action-button"
            :disabled="isSavingMarket"
            @click="syncMarketDraft(market.config.value)"
          >
            되돌리기
          </button>

          <button
            type="button"
            class="market-action-button warn"
            :disabled="isSavingMarket"
            @click="toggleMarketFreeze"
          >
            {{ market.isFrozen.value ? "거래 재개" : "5분 거래 정지" }}
          </button>
        </div>

        <div class="market-table-block">
          <h3>메뉴별 시세</h3>

          <div v-if="marketRows.length === 0" class="empty-box compact">
            <p>시세에 참여하는 메뉴가 없어요.</p>
          </div>

          <div v-else class="market-table">
            <div class="market-table-row head">
              <span>메뉴</span>
              <span>기본가</span>
              <span>현재가</span>
              <span>변동</span>
            </div>

            <div
              v-for="row in marketRows"
              :key="`market-row-${row.productId}`"
              class="market-table-row"
            >
              <span class="market-table-name">{{ row.productName }}</span>
              <span>{{ formatPrice(row.basePrice) }}원</span>
              <strong>{{ formatPrice(row.price) }}원</strong>
              <span :class="row.changePct >= 0 ? 'up' : 'down'">
                {{ marketChangeText(row.changePct) }}
              </span>
            </div>
          </div>
        </div>

        <div class="market-table-block">
          <h3>재료 시세</h3>

          <div
            v-if="marketIngredientRows.length === 0"
            class="empty-box compact"
          >
            <p>지금은 재료 수요가 없어요.</p>
          </div>

          <div v-else class="market-category-row">
            <span
              v-for="ingredient in marketIngredientRows"
              :key="`market-ingredient-${ingredient.name}`"
              class="market-ingredient-chip"
            >
              {{ ingredient.name }} {{ marketSignedText(ingredient.changePct) }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- 테이블 상세 모달 -->
    <transition name="fade">
      <div
        v-if="selectedTable"
        class="modal-overlay"
        @click.self="closeTableModal"
      >
        <div class="modal-card table-detail-modal">
          <div class="modal-head">
            <div>
              <h3>{{ selectedTable.tableLabel }}</h3>
              <p>{{ selectedTable.orderSheetId || "열린 주문서 없음" }}</p>
            </div>
            <button type="button" class="close-button" @click="closeTableModal">
              ✕
            </button>
          </div>

          <div class="modal-section">
            <div class="modal-info-row">
              <span>총 금액</span>
              <strong>{{ formatPrice(selectedTable.totalAmount) }}원</strong>
            </div>
            <div class="modal-info-row">
              <span>결제 상태</span>
              <strong>{{
                convertPaymentStatusText(selectedTable.paymentStatus)
              }}</strong>
            </div>
            <div class="modal-info-row">
              <span>닉네임</span>
              <div class="modal-nickname-row">
                <strong>{{
                  selectedTable.tableNickname || "설정 안 함"
                }}</strong>
                <button
                  type="button"
                  class="nickname-change-button"
                  @click="openTableNicknameModal(selectedTable)"
                >
                  변경
                </button>
              </div>
            </div>
            <div class="modal-info-row">
              <span>캐릭터</span>
              <div class="modal-character-row">
                <svg
                  class="table-character-mini"
                  :viewBox="GUEST_SPRITE_VIEW_BOX"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    v-for="part in selectedTableCharacter || []"
                    :key="`table-character-${part.fill}`"
                    :d="part.d"
                    :fill="part.fill"
                  />
                </svg>
                <button
                  type="button"
                  class="nickname-change-button"
                  :disabled="!selectedTable.orderSheetId"
                  @click="openTableCharacterModal(selectedTable)"
                >
                  변경
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="
              normalizeOrderSheetTags(selectedTable.internalTags).length > 0
            "
            class="modal-section"
          >
            <h4>주문서 태그</h4>
            <div class="table-tag-list">
              <span
                v-for="tag in normalizeOrderSheetTags(
                  selectedTable.internalTags
                )"
                :key="`detail-${tag}`"
                class="table-tag"
              >
                {{ tag }}
              </span>
            </div>
          </div>

          <div class="modal-section">
            <h4>전체 주문 내용</h4>
            <div v-if="selectedTableOrders.length > 0" class="table-order-list">
              <article
                v-for="order in selectedTableOrders"
                :key="order.id"
                class="table-order-card"
              >
                <div class="table-order-head">
                  <div>
                    <strong>{{ formatDateTime(order.createdAt) }}</strong>
                    <p v-if="order.isGift" class="gift-order-tag">
                      🎁 {{ resolveGiftTargetLabel(order) }} 선물 주문
                    </p>
                    <p v-if="order.requestMessage">
                      {{ order.requestMessage }}
                    </p>
                  </div>
                  <div class="table-order-head-right">
                    <span class="status-badge">
                      {{ convertOrderStatusText(order.status) }}
                    </span>
                    <strong>{{ formatPrice(order.totalPrice || 0) }}원</strong>
                  </div>
                </div>

                <div class="order-item-list">
                  <div
                    v-for="(item, index) in order.items || []"
                    :key="`${order.id}-${item.productId}-${index}`"
                    class="order-item-row"
                  >
                    <div class="order-item-left">
                      <strong>{{ item.productName }}</strong>
                      <span>
                        {{ formatPrice(item.unitPrice || 0) }}원 x
                        {{ item.quantity }}개
                      </span>

                      <div
                        v-if="
                          item.selectedOptions &&
                          item.selectedOptions.length > 0
                        "
                        class="order-option-list"
                      >
                        <div
                          v-for="(option, optionIndex) in item.selectedOptions"
                          :key="`${order.id}-${index}-${optionIndex}`"
                          class="order-option-row"
                        >
                          <span>{{ option.groupName }}</span>
                          <span>{{ option.optionName }}</span>
                          <span>
                            {{
                              Number(option.additionalPrice || 0) > 0
                                ? `+${formatPrice(option.additionalPrice)}원`
                                : "+0원"
                            }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div class="order-item-right">
                      <strong>{{ formatPrice(item.totalPrice || 0) }}원</strong>
                      <button
                        type="button"
                        class="recipe-view-button"
                        @click="openRecipeModalByOrderItem(item)"
                      >
                        레시피 보기
                      </button>
                    </div>
                  </div>
                </div>

                <div class="table-order-actions">
                  <button
                    type="button"
                    class="danger-small-button"
                    @click="confirmOrderStatusChange(order, 'CANCELLED')"
                  >
                    주문 취소
                  </button>
                </div>
              </article>
            </div>
            <p v-else class="modal-empty-text">주문 내역이 없어요.</p>
          </div>

          <div class="modal-action-grid">
            <button
              v-if="selectedTable.status === 'CLOSED'"
              type="button"
              class="activate-next-button"
              @click="activateNextOrderSheet"
            >
              다음 주문서 활성화
            </button>

            <button type="button" @click="openManualAddModal(selectedTable)">
              상품 임의 추가
            </button>

            <button
              type="button"
              @click="openOrderSheetTagModal(selectedTable)"
            >
              태그 관리
            </button>

            <button
              v-if="selectedTable.paymentStatus !== 'COMPLETED'"
              type="button"
              @click="openTablePaymentModal(selectedTable)"
            >
              결제 처리
            </button>

            <button
              v-else
              type="button"
              class="secondary-action"
              @click="finalizeTableCleanup(selectedTable)"
            >
              테이블 정리 완료
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 주문서 내부 태그 모달 -->
    <transition name="fade">
      <div
        v-if="orderSheetTagModalState.isOpen"
        class="modal-overlay"
        @click.self="closeOrderSheetTagModal"
      >
        <div class="modal-card order-sheet-tag-modal">
          <div class="modal-head">
            <div>
              <h3>주문서 태그 관리</h3>
              <p>{{ orderSheetTagModalState.displayName }}</p>
            </div>
            <button
              type="button"
              class="close-button"
              @click="closeOrderSheetTagModal"
            >
              ✕
            </button>
          </div>

          <div class="modal-section">
            <h4>기본 태그</h4>
            <div class="order-sheet-tag-preset-list">
              <button
                v-for="tag in orderSheetTagPresets"
                :key="tag"
                type="button"
                class="order-sheet-tag-button"
                :class="{ active: orderSheetTagModalState.tags.includes(tag) }"
                @click="toggleOrderSheetTag(tag)"
              >
                {{ tag }}
              </button>
            </div>
          </div>

          <div class="modal-section">
            <h4>직접 입력</h4>
            <div class="order-sheet-tag-input-row">
              <input
                v-model.trim="orderSheetTagModalState.customTag"
                type="text"
                maxlength="20"
                placeholder="태그명을 입력해주세요"
                @keyup.enter="addCustomOrderSheetTag"
              />
              <button
                type="button"
                class="quick-button"
                @click="addCustomOrderSheetTag"
              >
                추가
              </button>
            </div>
          </div>

          <div class="modal-section">
            <h4>선택된 태그</h4>
            <div
              v-if="orderSheetTagModalState.tags.length > 0"
              class="selected-order-sheet-tag-list"
            >
              <button
                v-for="tag in orderSheetTagModalState.tags"
                :key="`selected-${tag}`"
                type="button"
                class="selected-order-sheet-tag"
                @click="removeOrderSheetTag(tag)"
              >
                <span>{{ tag }}</span>
                <strong>✕</strong>
              </button>
            </div>
            <p v-else class="modal-empty-text">선택된 태그가 없어요.</p>
          </div>

          <button
            type="button"
            class="confirm-button"
            :disabled="orderSheetTagModalState.isSaving"
            @click="saveOrderSheetTags"
          >
            {{ orderSheetTagModalState.isSaving ? "저장 중..." : "태그 저장" }}
          </button>
        </div>
      </div>
    </transition>

    <!-- 닉네임 변경 모달 -->
    <transition name="fade">
      <div
        v-if="tableNicknameModalState.isOpen"
        class="modal-overlay"
        @click.self="closeTableNicknameModal"
      >
        <div class="modal-card table-nickname-modal">
          <div class="modal-head">
            <div>
              <h3>닉네임 변경</h3>
              <p>{{ tableNicknameModalState.displayName }}</p>
            </div>
            <button
              type="button"
              class="close-button"
              @click="closeTableNicknameModal"
            >
              ✕
            </button>
          </div>

          <div class="modal-section">
            <div class="order-sheet-tag-input-row">
              <input
                v-model.trim="tableNicknameModalState.nickname"
                type="text"
                placeholder="닉네임을 입력해주세요"
                @keyup.enter="saveTableNickname"
              />
            </div>
            <p class="table-nickname-modal-helper">
              한글 8자, 영문·숫자 16자까지 입력할 수 있어요. 비워두면 닉네임이
              삭제돼요.
            </p>
            <p
              v-if="tableNicknameModalError"
              class="table-nickname-modal-error"
            >
              {{ tableNicknameModalError }}
            </p>
          </div>

          <button
            type="button"
            class="confirm-button"
            :disabled="
              tableNicknameModalState.isSaving ||
              Boolean(tableNicknameModalError)
            "
            @click="saveTableNickname"
          >
            {{ tableNicknameModalState.isSaving ? "저장 중..." : "저장" }}
          </button>
        </div>
      </div>
    </transition>

    <!-- 캐릭터 변경 모달 -->
    <transition name="fade">
      <div
        v-if="tableCharacterModalState.isOpen"
        class="modal-overlay"
        @click.self="closeTableCharacterModal"
      >
        <div class="modal-card table-character-modal">
          <div class="modal-head">
            <div>
              <h3>캐릭터 변경</h3>
              <p>{{ tableCharacterModalState.displayName }}</p>
            </div>
            <button
              type="button"
              class="close-button"
              @click="closeTableCharacterModal"
            >
              ✕
            </button>
          </div>

          <CharacterStudio
            v-model="tableCharacterModalState.draft"
            :table-number="tableCharacterModalState.tableNumber"
            :nickname="tableCharacterModalState.nickname"
            sticky
          />

          <p class="table-nickname-modal-helper">
            손님 대신 성별과 마인크래프트 닉네임을 바꿔줄 수 있어요. 저장하면
            손님 화면과 TV에 바로 반영돼요.
          </p>

          <button
            type="button"
            class="confirm-button"
            :disabled="tableCharacterModalState.isSaving"
            @click="saveTableCharacter"
          >
            {{ tableCharacterModalState.isSaving ? "저장 중..." : "저장" }}
          </button>
        </div>
      </div>
    </transition>

    <!-- 레시피 모달 -->
    <transition name="fade">
      <div
        v-if="recipeModalProduct"
        class="modal-overlay"
        @click.self="closeRecipeModal"
      >
        <div class="modal-card recipe-modal">
          <div class="modal-head">
            <div>
              <h3>{{ selectedRecipeData?.productName }}</h3>
              <p v-if="selectedRecipeData?.description">
                {{ selectedRecipeData.description }}
              </p>
              <p v-else>레시피 상세</p>
            </div>

            <div class="modal-head-actions">
              <span class="status-badge">
                {{
                  selectedRecipeData?.hasStructuredRecipe ||
                  selectedRecipeData?.recipeText
                    ? "확인 가능"
                    : "미등록"
                }}
              </span>
              <button
                type="button"
                class="close-button"
                @click="closeRecipeModal"
              >
                ✕
              </button>
            </div>
          </div>

          <div
            v-if="
              selectedRecipeData?.hasStructuredRecipe ||
              selectedRecipeData?.recipeText
            "
            class="recipe-content"
          >
            <div
              v-if="selectedRecipeData?.ingredients?.length > 0"
              class="recipe-section-box"
            >
              <h4>재료</h4>

              <div class="recipe-ingredient-list">
                <div
                  v-for="(ingredient, index) in selectedRecipeData.ingredients"
                  :key="`${selectedRecipeData.productName}-ingredient-${index}`"
                  class="recipe-ingredient-row"
                >
                  <span class="ingredient-name">
                    {{ ingredient.name || "-" }}
                  </span>
                  <span class="ingredient-amount">
                    {{ ingredient.amount || "-" }}
                  </span>
                </div>
              </div>
            </div>

            <div
              v-if="selectedRecipeData?.steps?.length > 0"
              class="recipe-section-box"
            >
              <h4>제조 순서</h4>

              <div class="recipe-step-list">
                <div
                  v-for="(step, index) in selectedRecipeData.steps"
                  :key="`${selectedRecipeData.productName}-step-${index}`"
                  class="recipe-step-row"
                >
                  <span class="step-no">{{ index + 1 }}</span>
                  <p>{{ step }}</p>
                </div>
              </div>
            </div>

            <div
              v-if="selectedRecipeData?.tips?.length > 0"
              class="recipe-section-box"
            >
              <h4>참고사항</h4>

              <div class="recipe-tip-list">
                <div
                  v-for="(tip, index) in selectedRecipeData.tips"
                  :key="`${selectedRecipeData.productName}-tip-${index}`"
                  class="recipe-tip-row"
                >
                  <span>•</span>
                  <p>{{ tip }}</p>
                </div>
              </div>
            </div>

            <div
              v-if="selectedRecipeData?.recipeText"
              class="recipe-section-box"
            >
              <h4>레시피 메모</h4>
              <p class="recipe-free-text">
                {{ selectedRecipeData.recipeText }}
              </p>
            </div>
          </div>

          <div v-else class="empty-box compact">
            <p>등록된 레시피가 없어요.</p>
          </div>
        </div>
      </div>
    </transition>

    <!-- 결제 모달 -->
    <transition name="fade">
      <div
        v-if="paymentModalState.isOpen"
        class="modal-overlay"
        @click.self="closePaymentModal"
      >
        <div class="modal-card">
          <div class="modal-head">
            <div>
              <h3>직접 결제 처리</h3>
              <p>{{ paymentModalState.displayName }}</p>
            </div>
            <button
              type="button"
              class="close-button"
              @click="closePaymentModal"
            >
              ✕
            </button>
          </div>

          <div class="modal-section">
            <div class="modal-info-row">
              <span>주문서 번호</span>
              <strong>{{ paymentModalState.orderSheetId }}</strong>
            </div>
            <div class="modal-info-row">
              <span>주문 금액</span>
              <strong>{{ formatPrice(paymentModalState.amount) }}원</strong>
            </div>
            <div class="modal-info-row">
              <span>할인 합계</span>
              <strong>-{{ formatPrice(paymentDiscountTotal) }}원</strong>
            </div>
            <div class="modal-info-row">
              <span>최종 결제 금액</span>
              <strong>{{ formatPrice(paymentPayableAmount) }}원</strong>
            </div>
          </div>

          <div class="modal-section">
            <div class="section-title-row">
              <h4>할인</h4>
              <div class="section-action-row">
                <button
                  type="button"
                  class="quick-button"
                  @click="addPaymentDiscount('AMOUNT')"
                >
                  정액 할인
                </button>
                <button
                  type="button"
                  class="quick-button"
                  @click="addPaymentDiscount('PERCENT')"
                >
                  % 할인
                </button>
              </div>
            </div>

            <p
              v-if="paymentModalState.discounts.length === 0"
              class="modal-empty-text"
            >
              적용된 할인이 없어요.
            </p>

            <div v-else class="payment-edit-list">
              <div
                v-for="discount in paymentModalState.discounts"
                :key="discount.id"
                class="payment-edit-row discount-row"
              >
                <input
                  v-model.trim="discount.title"
                  type="text"
                  placeholder="할인명"
                />
                <select v-model="discount.type">
                  <option value="AMOUNT">정액</option>
                  <option value="PERCENT">%</option>
                </select>
                <input
                  v-model.number="discount.value"
                  type="number"
                  min="0"
                  :max="discount.type === 'PERCENT' ? 100 : undefined"
                  placeholder="값"
                />
                <button
                  type="button"
                  class="danger-small-button"
                  @click="removePaymentDiscount(discount.id)"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>

          <div class="modal-section">
            <div class="section-title-row">
              <h4>결제 수단별 금액</h4>
              <div class="section-action-row">
                <button
                  type="button"
                  class="quick-button"
                  @click="addPaymentSplit('CARD')"
                >
                  카드 추가
                </button>
                <button
                  type="button"
                  class="quick-button"
                  @click="addPaymentSplit('CASH')"
                >
                  현금 추가
                </button>
                <button
                  type="button"
                  class="quick-button"
                  @click="addPaymentSplit('BANK')"
                >
                  계좌 추가
                </button>
              </div>
            </div>

            <div class="payment-edit-list">
              <div
                v-for="split in paymentModalState.paymentSplits"
                :key="split.id"
                class="payment-edit-row split-row"
              >
                <select v-model="split.method">
                  <option value="CARD">카드</option>
                  <option value="CASH">현금</option>
                  <option value="BANK">계좌이체</option>
                </select>
                <input
                  v-model.number="split.amount"
                  type="number"
                  min="0"
                  placeholder="결제 금액"
                />
                <button
                  type="button"
                  class="quick-button"
                  @click="fillPaymentSplitRemaining(split)"
                >
                  남은 금액
                </button>
                <button
                  type="button"
                  class="danger-small-button"
                  :disabled="paymentModalState.paymentSplits.length <= 1"
                  @click="removePaymentSplit(split.id)"
                >
                  삭제
                </button>
              </div>
            </div>

            <div class="payment-balance-box">
              <div>
                <span>입력 합계</span>
                <strong>{{ formatPrice(paymentSplitTotal) }}원</strong>
              </div>
              <div :class="{ warning: paymentRemainingAmount !== 0 }">
                <span>남은 금액</span>
                <strong>{{ formatPrice(paymentRemainingAmount) }}원</strong>
              </div>
            </div>
          </div>

          <button type="button" class="confirm-button" @click="completePayment">
            결제 완료 처리
          </button>
        </div>
      </div>
    </transition>

    <!-- 결제 완료 확인 모달 -->
    <transition name="fade">
      <div
        v-if="paymentCompleteModalState.isOpen"
        class="modal-overlay"
        @click.self="closePaymentCompleteModal"
      >
        <div class="modal-card payment-complete-modal">
          <div class="payment-complete-icon">✅</div>

          <div class="modal-head center">
            <div>
              <h3>결제가 완료되었어요</h3>
              <p>{{ paymentCompleteModalState.displayName }}</p>
            </div>
          </div>

          <div class="modal-section">
            <div class="modal-info-row">
              <span>결제 수단</span>
              <strong>
                {{
                  convertPaymentMethodText(
                    paymentCompleteModalState.paymentMethod
                  )
                }}
              </strong>
            </div>
            <div class="modal-info-row">
              <span>주문 금액</span>
              <strong
                >{{
                  formatPrice(paymentCompleteModalState.originalAmount)
                }}원</strong
              >
            </div>
            <div class="modal-info-row">
              <span>할인 합계</span>
              <strong
                >-{{
                  formatPrice(paymentCompleteModalState.discountTotal)
                }}원</strong
              >
            </div>
            <div class="modal-info-row">
              <span>결제 금액</span>
              <strong
                >{{ formatPrice(paymentCompleteModalState.amount) }}원</strong
              >
            </div>
          </div>

          <div
            v-if="paymentCompleteModalState.paymentSplits.length > 0"
            class="modal-section"
          >
            <h4>결제 상세</h4>
            <div class="payment-complete-split-list">
              <div
                v-for="(
                  split, index
                ) in paymentCompleteModalState.paymentSplits"
                :key="`complete-split-${index}`"
                class="modal-info-row"
              >
                <span>{{ convertPaymentMethodText(split.method) }}</span>
                <strong>{{ formatPrice(split.amount) }}원</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            class="confirm-button"
            @click="closePaymentCompleteModal"
          >
            확인
          </button>
        </div>
      </div>
    </transition>

    <!-- 수동 상품 추가 모달 -->
    <transition name="fade">
      <div
        v-if="manualAddModalState.isOpen"
        class="modal-overlay"
        @click.self="closeManualAddModal"
      >
        <div class="modal-card manual-add-modal">
          <div class="modal-head">
            <div>
              <h3>상품 임의 추가</h3>
              <p>
                {{ manualAddModalState.displayName }} /
                {{ manualAddModalState.orderSheetId }}
              </p>
            </div>
            <button
              type="button"
              class="close-button"
              @click="closeManualAddModal"
            >
              ✕
            </button>
          </div>

          <div class="manual-add-layout">
            <div class="manual-product-panel">
              <div class="manual-custom-product">
                <div class="manual-custom-product-head">
                  <strong>커스텀 메뉴</strong>
                  <span>메뉴에 없는 상품</span>
                </div>

                <div class="manual-custom-product-form">
                  <input
                    v-model.number="manualAddModalState.customPrice"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    placeholder="금액 입력"
                    @keyup.enter="addManualCustomProduct"
                  />
                  <button
                    type="button"
                    class="quick-button"
                    @click="addManualCustomProduct"
                  >
                    추가
                  </button>
                </div>
              </div>

              <div class="manual-search-box">
                <input
                  v-model.trim="manualAddModalState.keyword"
                  type="text"
                  placeholder="상품명을 검색해주세요"
                />
              </div>

              <div class="category-filter-scroll">
                <button
                  v-for="category in categoryFilterList"
                  :key="`manual-${category.id}`"
                  type="button"
                  class="category-filter-button"
                  :class="{
                    active: manualAddModalState.categoryId === category.id,
                  }"
                  @click="manualAddModalState.categoryId = category.id"
                >
                  {{ category.name }}
                </button>
              </div>

              <div class="manual-product-list">
                <button
                  v-for="product in manualFilteredProductList"
                  :key="product.id"
                  type="button"
                  class="manual-product-button"
                  @click="selectManualProduct(product)"
                >
                  <div>
                    <strong>{{ product.productName }}</strong>
                    <p>{{ formatPrice(marketPriceOf(product)) }}원</p>
                  </div>
                  <span v-if="product.optionGroups?.length > 0">옵션</span>
                </button>
              </div>
            </div>

            <div class="manual-cart-panel">
              <h4>추가 예정 상품</h4>

              <div
                v-if="manualAddModalState.cartItems.length === 0"
                class="empty-box compact"
              >
                <p>추가할 상품을 선택해주세요.</p>
              </div>

              <div v-else class="manual-cart-list">
                <div
                  v-for="item in manualAddModalState.cartItems"
                  :key="item.cartItemKey || item.cartItemId"
                  class="manual-cart-row"
                >
                  <div class="manual-cart-body">
                    <strong>{{ item.productName }}</strong>

                    <div
                      v-if="
                        item.selectedOptions && item.selectedOptions.length > 0
                      "
                      class="manual-cart-option-list"
                    >
                      <div
                        v-for="(option, optionIndex) in item.selectedOptions"
                        :key="`${item.cartItemKey}-${optionIndex}`"
                        class="manual-cart-option-row"
                      >
                        <span>{{ option.groupName }}</span>
                        <span>{{ option.optionName }}</span>
                        <span>
                          {{
                            Number(option.additionalPrice || 0) > 0
                              ? `+${formatPrice(option.additionalPrice)}원`
                              : "+0원"
                          }}
                        </span>
                      </div>
                    </div>

                    <p>
                      {{ formatPrice(manualUnitPriceOf(item)) }}원 ×
                      {{ item.quantity }}개
                    </p>
                  </div>

                  <div class="manual-cart-actions">
                    <button
                      type="button"
                      @click="
                        decreaseManualCartQuantity(
                          item.cartItemKey || item.cartItemId
                        )
                      "
                    >
                      -
                    </button>
                    <span>{{ item.quantity }}</span>
                    <button
                      type="button"
                      @click="
                        increaseManualCartQuantity(
                          item.cartItemKey || item.cartItemId
                        )
                      "
                    >
                      +
                    </button>
                    <button
                      type="button"
                      class="danger"
                      @click="
                        removeManualCartItem(
                          item.cartItemKey || item.cartItemId
                        )
                      "
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>

              <div class="manual-cart-footer">
                <div class="manual-cart-total">
                  <span>{{ manualCartTotalCount }}개</span>
                  <strong>{{ formatPrice(manualCartTotalAmount) }}원</strong>
                </div>

                <button
                  type="button"
                  class="confirm-button"
                  :disabled="manualAddModalState.cartItems.length === 0"
                  @click="submitManualAddOrder"
                >
                  추가 완료
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 수동 옵션 선택 모달 -->
    <transition name="fade">
      <div
        v-if="manualOptionModalState.isOpen"
        class="modal-overlay"
        @click.self="closeManualOptionModal"
      >
        <div class="modal-card manual-option-modal">
          <div class="modal-head">
            <div>
              <h3>{{ manualOptionModalState.product?.productName }}</h3>
              <p>{{ manualOptionModalState.displayName }}</p>
            </div>
            <button
              type="button"
              class="close-button"
              @click="closeManualOptionModal"
            >
              ✕
            </button>
          </div>

          <div class="modal-section">
            <div class="modal-info-row">
              <span>{{ marketEnabled ? "실시간 시세" : "기본 가격" }}</span>
              <strong> {{ formatPrice(manualSheetBasePrice) }}원 </strong>
            </div>
          </div>

          <div
            v-for="group in manualSortedOptionGroups"
            :key="group.groupId"
            class="manual-option-group"
          >
            <div class="manual-option-group-head">
              <div>
                <h4>{{ group.groupName }}</h4>
                <p>
                  {{
                    group.isRequired
                      ? `필수 · 최소 ${group.minSelectCount}개`
                      : `선택 · 최대 ${group.maxSelectCount}개`
                  }}
                </p>
              </div>
              <span class="status-badge">
                {{ group.isMultiple ? "다중선택" : "단일선택" }}
              </span>
            </div>

            <div class="manual-option-button-list">
              <button
                v-for="option in getActiveOptions(group)"
                :key="option.optionId"
                type="button"
                class="manual-option-button"
                :class="{
                  selected: isManualOptionSelected(
                    group.groupId,
                    option.optionId
                  ),
                  soldout: option.isSoldOut,
                }"
                :disabled="option.isSoldOut"
                @click="toggleManualOption(group, option)"
              >
                <div>
                  <strong>{{ option.optionName }}</strong>
                  <p>
                    {{
                      Number(option.additionalPrice || 0) > 0
                        ? `+${formatPrice(option.additionalPrice)}원`
                        : "추가금액 없음"
                    }}
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div
            v-if="manualOptionModalState.validationMessage"
            class="option-error-box"
          >
            {{ manualOptionModalState.validationMessage }}
          </div>

          <div class="manual-option-footer">
            <div class="quantity-controller">
              <button type="button" @click="decreaseManualOptionQuantity">
                -
              </button>
              <span>{{ manualOptionModalState.quantity }}</span>
              <button type="button" @click="increaseManualOptionQuantity">
                +
              </button>
            </div>

            <div class="manual-option-total">
              <span>총 금액</span>
              <strong>{{ formatPrice(manualOptionTotalPrice) }}원</strong>
            </div>

            <button
              type="button"
              class="confirm-button"
              @click="addManualOptionProductToCart"
            >
              담기
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 테이블 채팅 · 호출 모달 -->
    <transition name="fade">
      <div
        v-if="chatPanelState.isOpen"
        class="modal-overlay"
        @click.self="closeChatPanel"
      >
        <div class="modal-card chat-modal">
          <div class="modal-head">
            <div>
              <h3>테이블 채팅 · 호출</h3>
              <p>손님이 보낸 호출과 메시지에 바로 답장할 수 있어요.</p>
            </div>
            <button type="button" class="close-button" @click="closeChatPanel">
              ✕
            </button>
          </div>

          <div class="chat-room-row">
            <button
              v-for="room in chatRoomList"
              :key="room.roomKey"
              type="button"
              class="chat-room-chip"
              :class="{
                active: chatPanelState.roomKey === room.roomKey,
                alerting: room.alertCount > 0,
              }"
              @click="selectChatRoom(room.roomKey)"
            >
              <span>{{ room.label }}</span>
              <span v-if="room.alertCount > 0" class="chat-room-count">
                {{ room.alertCount }}
              </span>
            </button>
          </div>

          <div class="chat-thread">
            <p v-if="filteredChatMessages.length === 0" class="chat-empty">
              아직 주고받은 메시지가 없어요.
            </p>

            <div
              v-for="message in filteredChatMessages"
              :key="message.id"
              class="chat-row"
              :class="{
                mine: message.messageType === 'ADMIN',
                alarm: isAlertMessage(message),
              }"
            >
              <div class="chat-row-head">
                <strong>{{ buildChatSenderLabel(message) }}</strong>
                <span>{{ formatChatTime(message.createdAt) }}</span>
              </div>
              <p class="chat-row-text">{{ message.message }}</p>
            </div>
          </div>

          <div class="chat-compose">
            <div
              v-if="activeChatRoom && activeChatRoom.tableNumber"
              class="chat-quick-row"
            >
              <button
                v-for="phrase in QUICK_PHRASES"
                :key="phrase"
                type="button"
                class="chat-quick-button"
                :disabled="chatPanelState.isSending"
                @click="sendQuickReply(phrase)"
              >
                {{ phrase }}
              </button>
            </div>

            <div class="chat-input-row">
              <input
                v-model="chatPanelState.draft"
                type="text"
                :placeholder="chatComposerPlaceholder"
                :disabled="chatPanelState.isSending"
                @keyup.enter="sendChatReply"
              />
              <button
                type="button"
                class="confirm-button"
                :disabled="
                  chatPanelState.isSending || !chatPanelState.draft.trim()
                "
                @click="sendChatReply"
              >
                보내기
              </button>
            </div>

            <p v-if="chatFeedback" class="chat-feedback">{{ chatFeedback }}</p>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import CharacterStudio from "@/components/CharacterStudio.vue";
import MarketSparkline from "@/components/MarketSparkline.vue";
import { getBusinessDayStart } from "@/lib/businessDay";
import { resolveCharacterStyle } from "@/lib/characterStyle";
import { buildGuestParts, GUEST_SPRITE_VIEW_BOX } from "@/lib/pixelGuest";
import {
  fetchList,
  insertRow,
  newId,
  nowIso,
  subscribeTable,
  toTime,
  updateRow,
} from "@/lib/supabase";
import { runGlobalBusy } from "@/lib/globalBusy";
import {
  completeOrderSheetPayment,
  finalizeOrderSheetCleanup,
  getOrCreateOpenOrderSheet,
  getTableNicknameErrorMessage,
  normalizeTableNumber,
  updateOrderSheetCharacterStyle,
  updateOrderSheetNickname,
} from "@/lib/orderSheet";
import { recalculateOrderSheetTotals } from "@/lib/orderSheetTotals";
import {
  isDemographicOrderSheetTag,
  normalizeOrderSheetTags,
} from "@/lib/orderSheetTags";
import {
  runLegacyTableNumberCleanup,
  scanLegacyTableNumbers,
} from "@/lib/tableNumberCleanup";
import {
  buildStaffRoomKey,
  CHAT_MESSAGE_TYPE,
  CHAT_ROOM_TYPE,
  clearDirectChatMessagesForTable,
  formatTableLabel,
  getChatDayStartIso,
  getRoomLastReadAt,
  GLOBAL_ROOM_KEY,
  isAlertMessage,
  markRoomRead,
  QUICK_PHRASES,
  sendChatMessage,
  STAFF_LABEL,
} from "@/lib/chat";
import { saveMarketConfig, useMarketFeed } from "@/lib/market";
import {
  buildIndexSeries,
  createIndexSample,
  currentMarketBusinessDate,
  fetchMarketHistory,
  MARKET_HISTORY_SAMPLE_MS,
  mergeIndexSample,
  mergeIndexSeries,
  saveMarketHistoryEntry,
  summarizeIndexSamples,
} from "@/lib/marketHistory";

const activeTab = ref("tables");

// 태블릿은 직원용이라 시세를 조금 더 자주 갱신합니다.
const market = useMarketFeed({ dataPollMs: 10000 });
const marketDraft = ref(null);
const isSavingMarket = ref(false);

const marketEnabled = computed(
  () => market.enabled.value && market.isActive.value
);
const marketRows = computed(() => market.rows(40));
const marketIndexValue = computed(() => market.index().value);
const marketIndexChangePct = computed(() => market.index().changePct);
const marketIndexText = computed(() => {
  const changePct = marketIndexChangePct.value;
  const arrow = changePct >= 0 ? "▲" : "▼";

  return `${arrow} ${Math.abs(changePct).toFixed(2)}%`;
});
const marketIngredientRows = computed(() => market.ingredients(8));

const marketStatusText = computed(() => {
  if (!market.config.value.enabled) {
    return "시세 OFF";
  }

  return market.isFrozen.value ? "거래 정지" : "실시간 거래";
});

function marketChangeText(changePct) {
  const arrow = changePct >= 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(changePct).toFixed(1)}%`;
}

function marketSignedText(changePct) {
  const sign = changePct >= 0 ? "+" : "-";
  return `${sign}${Math.abs(changePct).toFixed(1)}%`;
}

function marketPercentText(changePct, digits = 2) {
  const arrow = changePct >= 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(changePct).toFixed(digits)}%`;
}

function marketRangeText(summary) {
  if (!summary) {
    return "-";
  }

  return `${summary.high.toFixed(1)} / ${summary.low.toFixed(1)}`;
}

// ---- 영업일 시세 리포트 ----
const MARKET_HISTORY_ERROR_HINT =
  "시세 기록을 읽지 못했어요. patch-012를 실행해주세요.";

const marketHistoryRows = ref([]);
const marketHistoryError = ref("");
const marketDerivedSeries = ref([]);
let marketHistoryTimer = null;

const marketBusinessDate = computed(() =>
  currentMarketBusinessDate(new Date(market.nowTick.value))
);

function findMarketHistoryRow(businessDate) {
  const found = marketHistoryRows.value.find(
    (row) => row.businessDate === businessDate
  );

  return found || null;
}

const marketTodayHistory = computed(() =>
  findMarketHistoryRow(marketBusinessDate.value)
);

const marketIndexSeries = computed(() =>
  mergeIndexSeries(
    marketDerivedSeries.value,
    marketTodayHistory.value?.samples || []
  )
);

// 곡선 끝이 5분 전에 멈추지 않도록 지금 지수를 한 점 덧붙입니다.
const marketLiveSeries = computed(() => {
  const list = marketIndexSeries.value;

  if (!market.config.value.enabled || !market.isActive.value) {
    return list;
  }

  const nowTs = market.nowTick.value;
  const last = list[list.length - 1];

  if (last && nowTs - Number(last.t) < 60000) {
    return list;
  }

  const index = market.index();

  return [...list, { t: nowTs, i: index.value, c: index.changePct }];
});

const marketIndexSeriesValues = computed(() =>
  marketLiveSeries.value.map((point) => Number(point.i))
);

const marketTodaySummary = computed(() =>
  summarizeIndexSamples(marketLiveSeries.value)
);

const marketTodayStats = computed(() => {
  const summary = marketTodaySummary.value;

  if (!summary) {
    return null;
  }

  return {
    open: summary.open.toFixed(1),
    high: summary.high.toFixed(1),
    low: summary.low.toFixed(1),
    close: summary.close.toFixed(1),
    changeText: marketPercentText(summary.changePct),
    trend: summary.changePct >= 0 ? "up" : "down",
  };
});

function compareMarketHistory(first, second) {
  return second.businessDate.localeCompare(first.businessDate);
}

function toMarketHistoryRow(row) {
  const summary = row.summary || summarizeIndexSamples(row.samples);

  if (!summary) {
    return null;
  }

  return {
    businessDate: row.businessDate,
    closeText: summary.close.toFixed(1),
    changeText: marketPercentText(summary.changePct),
    rangeText: marketRangeText(summary),
    trend: summary.changePct >= 0 ? "up" : "down",
  };
}

const marketHistoryList = computed(() => {
  const rows = marketHistoryRows.value.filter(
    (row) => row.businessDate !== marketBusinessDate.value
  );

  return rows
    .map(toMarketHistoryRow)
    .filter((row) => row !== null)
    .sort(compareMarketHistory)
    .slice(0, 7);
});

// 기록이 비어 있는 구간은 엔진으로 되짚어 곡선을 복원합니다.
function rebuildMarketDerivedSeries() {
  if (!market.config.value.enabled) {
    marketDerivedSeries.value = [];
    return;
  }

  const dayStart = getBusinessDayStart().getTime();
  const startedAt = toTime(market.config.value.startedAt);
  const from = Math.max(dayStart, startedAt || dayStart);

  marketDerivedSeries.value = buildIndexSeries(market.engine.value, { from });
}

async function loadMarketHistory() {
  try {
    marketHistoryRows.value = await fetchMarketHistory();
    marketHistoryError.value = "";
  } catch (error) {
    marketHistoryError.value = error?.message || MARKET_HISTORY_ERROR_HINT;
  } finally {
    rebuildMarketDerivedSeries();
  }
}

async function recordMarketHistorySample() {
  rebuildMarketDerivedSeries();

  if (!market.config.value.enabled || !market.isActive.value) {
    return;
  }

  const businessDate = marketBusinessDate.value;
  const current = marketHistoryRows.value.find(
    (row) => row.businessDate === businessDate
  );
  const samples = mergeIndexSample(
    current?.samples || [],
    createIndexSample(market.engine.value)
  );
  const entry = {
    businessDate,
    samples,
    summary: summarizeIndexSamples(samples),
    updatedAt: nowIso(),
  };

  marketHistoryRows.value = [
    entry,
    ...marketHistoryRows.value.filter(
      (row) => row.businessDate !== businessDate
    ),
  ];

  try {
    await saveMarketHistoryEntry(entry);
    marketHistoryError.value = "";
  } catch (error) {
    marketHistoryError.value = error?.message || MARKET_HISTORY_ERROR_HINT;
  }
}

function syncMarketDraft(config) {
  marketDraft.value = {
    tickSeconds: config.tickSeconds,
    maxChangePct: config.maxChangePct,
    volatility: config.volatility,
    demandWeight: config.demandWeight,
    chainWeight: config.chainWeight,
    demandTarget: config.demandTarget,
    applyToOrders: config.applyToOrders,
    categoryIds: [...config.categoryIds],
  };
}

// 실제로 저장된 시점(updatedAt)이 바뀔 때만 편집 중인 값을 덮어씁니다.
watch(
  () => market.config.value.updatedAt,
  () => syncMarketDraft(market.config.value),
  { immediate: true }
);

// 시세 탭을 열 때마다 오늘 곡선을 새로 복원합니다.
watch(activeTab, (tab) => {
  if (tab === "market") {
    loadMarketHistory();
  }
});

async function toggleMarket() {
  const nextEnabled = !market.config.value.enabled;

  if (nextEnabled) {
    const confirmed = window.confirm(
      `실시간 시세를 켤까요?\n\n참여 메뉴 ${market.productCount.value}종의 가격이 실시간으로 움직이고,\n손님 주문 금액에도 그 가격이 그대로 적용됩니다.\n\n켜면 모든 메뉴가 기본가에서 출발해 약 10분에 걸쳐 시세가 붙습니다.`
    );

    if (!confirmed) return;
  }

  await runGlobalBusy(
    async () => {
      try {
        if (!nextEnabled) {
          // 마지막 시점의 지수를 남겨 두고 닫습니다.
          await recordMarketHistorySample();
        }

        const saved = await saveMarketConfig(
          {
            enabled: nextEnabled,
            startedAt: nextEnabled
              ? new Date().toISOString()
              : market.config.value.startedAt,
          },
          { baseConfig: market.config.value }
        );

        syncMarketDraft(saved);
        await market.refresh();

        if (nextEnabled) {
          await recordMarketHistorySample();
        }
      } catch (error) {
        alert(error?.message || "시세 설정을 바꾸지 못했어요.");
      }
    },
    nextEnabled ? "시세를 여는 중이에요." : "시세를 멈추는 중이에요."
  );
}

async function saveMarketDraft() {
  if (!marketDraft.value || isSavingMarket.value) return;

  isSavingMarket.value = true;

  try {
    const saved = await saveMarketConfig(
      { ...marketDraft.value },
      { baseConfig: market.config.value }
    );

    syncMarketDraft(saved);
    await market.refresh();
    alert("시세 설정을 저장했어요.");
  } catch (error) {
    alert(error?.message || "시세 설정을 저장하지 못했어요.");
  } finally {
    isSavingMarket.value = false;
  }
}

async function toggleMarketFreeze() {
  if (isSavingMarket.value) return;

  const nextFrozenUntil = market.isFrozen.value
    ? ""
    : new Date(Date.now() + 5 * 60 * 1000).toISOString();

  isSavingMarket.value = true;

  try {
    const saved = await saveMarketConfig(
      { frozenUntil: nextFrozenUntil },
      { baseConfig: market.config.value }
    );

    syncMarketDraft(saved);
    await market.refresh();
  } catch (error) {
    alert(error?.message || "거래 상태를 바꾸지 못했어요.");
  } finally {
    isSavingMarket.value = false;
  }
}

const selectedTable = ref(null);
const recipeModalProduct = ref(null);

const paymentModalState = ref({
  isOpen: false,
  orderSheetId: "",
  tableNumber: "",
  displayName: "",
  paymentMethod: "CARD",
  amount: 0,
  discounts: [],
  paymentSplits: [],
});

const paymentCompleteModalState = ref({
  isOpen: false,
  displayName: "",
  paymentMethod: "",
  amount: 0,
  originalAmount: 0,
  discountTotal: 0,
  paymentSplits: [],
});

const orderSheetTagPresets = [
  "블로그체험단",
  "릴스체험단",
  "클립체험단",
  "워크인",
  "첫방문",
  "재방문",
  "지인",
  "진상",
];

const orderSheetTagModalState = ref({
  isOpen: false,
  orderSheetId: "",
  displayName: "",
  tags: [],
  customTag: "",
  isSaving: false,
});

const tableNicknameModalState = ref({
  isOpen: false,
  orderSheetId: "",
  displayName: "",
  nickname: "",
  isSaving: false,
});

const tableNicknameModalError = computed(() => {
  if (!tableNicknameModalState.value.isOpen) return "";

  return getTableNicknameErrorMessage(tableNicknameModalState.value.nickname);
});

const tableCharacterModalState = ref({
  isOpen: false,
  orderSheetId: "",
  tableNumber: "",
  displayName: "",
  nickname: "",
  draft: resolveCharacterStyle({}),
  isSaving: false,
});

// 테이블 상세 모달에 보여줄 미니 캐릭터입니다.
const selectedTableCharacter = computed(() => {
  const table = selectedTable.value;

  if (!table) return null;

  const tableNumber = String(table.tableNumber ?? "");

  return buildGuestParts(table.characterStyle, tableNumber);
});

const manualAddModalState = ref({
  isOpen: false,
  orderSheetId: "",
  tableNumber: "",
  displayName: "",
  cartItems: [],
  keyword: "",
  categoryId: "all",
  customPrice: "",
});

const manualOptionModalState = ref({
  isOpen: false,
  product: null,
  orderSheetId: "",
  tableNumber: "",
  displayName: "",
  selectedOptionMap: {},
  quantity: 1,
  validationMessage: "",
});

const tabList = [
  { key: "tables", label: "테이블" },
  { key: "orders", label: "주문" },
  { key: "recipes", label: "레시피" },
  { key: "market", label: "시세" },
];

const isTableNumberCleanupScanning = ref(false);
const isTableNumberCleanupRunning = ref(false);
const tableNumberCleanupScan = ref(null);
const tableNumberCleanupResult = ref(null);
const tableNumberCleanupProgress = ref("");

const tableNumberCleanupSuccessCount = computed(() =>
  (tableNumberCleanupResult.value?.updated || []).reduce(
    (acc, item) => acc + item.count,
    0
  )
);

const isLoadingOrderSheets = ref(true);
const isLoadingOrders = ref(true);
const isLoadingProducts = ref(true);

const orderSheetList = ref([]);
const orderList = ref([]);
const categoryList = ref([]);
const productList = ref([]);

const orderSoundSrc = "/audio/order-request.mp3"; // 나중에 경로 수정 가능
const paymentSoundSrc = "/audio/payment-request.mp3"; // 나중에 경로 수정 가능

let previousOrderIds = new Set();

let unsubscribeOrderSheets = null;
let unsubscribeOrders = null;
let unsubscribeCategories = null;
let unsubscribeProducts = null;

const recipeKeyword = ref("");
const selectedRecipeCategory = ref("all");

const currentDateText = computed(() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
});

const tableLayoutList = computed(() => {
  const latestMap = new Map();

  [...orderSheetList.value]
    .sort((a, b) => {
      const aTime = toTime(a.updatedAt);
      const bTime = toTime(b.updatedAt);
      return bTime - aTime;
    })
    .forEach((item) => {
      const tableNumber = normalizeTableNumber(item.tableNumber);
      if (!latestMap.has(tableNumber)) {
        latestMap.set(tableNumber, {
          ...item,
          tableNumber,
          displayName: tableNumber ? `No.${tableNumber}` : item.displayName,
        });
      }
    });

  return [...latestMap.values()]
    .sort((a, b) => Number(a.tableNumber || 0) - Number(b.tableNumber || 0))
    .map((item) => ({
      ...item,
      tableLabel: `${item.tableNumber}번 테이블`,
      locationLabel: item.locationLabel || `테이블 ${item.tableNumber}`,
    }));
});

const recipeProductList = computed(() => {
  return [...productList.value]
    .filter((item) => item.isActive !== false)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
});

const categoryFilterList = computed(() => {
  return categoryList.value
    .filter((item) => item.isActive !== false)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
    .map((item) => ({
      id: item.id,
      name: item.name || "이름 없음",
    }));
});

function firstCategoryId() {
  return categoryFilterList.value[0]?.id || "all";
}

function syncSelectedRecipeCategory() {
  if (
    !categoryFilterList.value.some(
      (item) => item.id === selectedRecipeCategory.value
    )
  ) {
    selectedRecipeCategory.value = firstCategoryId();
  }
}

const filteredRecipeProductList = computed(() => {
  const keyword = String(recipeKeyword.value || "")
    .trim()
    .toLowerCase();

  return recipeProductList.value.filter((item) => {
    const matchCategory =
      selectedRecipeCategory.value === "all" ||
      getProductCategoryIds(item).includes(selectedRecipeCategory.value);

    if (!matchCategory) return false;
    if (!keyword) return true;

    return (
      String(item.productName || "")
        .toLowerCase()
        .includes(keyword) ||
      String(item.description || "")
        .toLowerCase()
        .includes(keyword)
    );
  });
});

const filteredOrderList = computed(() => {
  return orderList.value.filter((order) => {
    const status = String(order.status || "");
    return status === "REQUESTED";
  });
});

const selectedTableOrders = computed(() => {
  const orderSheetId = String(selectedTable.value?.orderSheetId || "").trim();

  if (!orderSheetId) return [];

  return orderList.value
    .filter((order) => {
      if (String(order.orderSheetId || "") !== orderSheetId) return false;
      return String(order.status || "") !== "CANCELLED";
    })
    .sort((a, b) => {
      return (
        (convertToDate(a.createdAt)?.getTime() || 0) -
        (convertToDate(b.createdAt)?.getTime() || 0)
      );
    });
});

const selectedRecipeData = computed(() => {
  if (!recipeModalProduct.value) return null;

  const product = recipeModalProduct.value;
  const recipeInfo = product.recipeInfo || null;

  const normalizeIngredient = (item) => {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text) return { name: "", amount: "" };
      const separator = text.includes(" - ")
        ? " - "
        : text.includes("-")
        ? "-"
        : null;
      if (separator) {
        const [name, amount] = text.split(separator).map((part) => part.trim());
        return { name: name || "", amount: amount || "" };
      }
      return { name: text, amount: "" };
    }

    if (item && typeof item === "object") {
      return {
        name: String(
          item.name || item.ingredient || item.title || item.text || ""
        ).trim(),
        amount: String(item.amount || item.quantity || item.value || "").trim(),
      };
    }

    return { name: String(item || "").trim(), amount: "" };
  };

  const ingredients = Array.isArray(recipeInfo?.ingredients)
    ? recipeInfo.ingredients.map(normalizeIngredient)
    : [];

  const steps = Array.isArray(recipeInfo?.steps)
    ? recipeInfo.steps
        .map((step) => String(step || "").trim())
        .filter((step) => step)
    : [];

  const tips = Array.isArray(recipeInfo?.tips)
    ? recipeInfo.tips
        .map((tip) => String(tip || "").trim())
        .filter((tip) => tip)
    : [];

  const hasStructuredRecipe =
    recipeInfo &&
    (String(recipeInfo.description || "").trim() ||
      ingredients.length > 0 ||
      steps.length > 0 ||
      tips.length > 0);

  return {
    productName: product.productName || "",
    description: String(recipeInfo?.description || "").trim(),
    ingredients,
    steps,
    tips,
    recipeText: String(product.recipeText || "").trim(),
    hasStructuredRecipe,
  };
});

const manualFilteredProductList = computed(() => {
  const keyword = String(manualAddModalState.value.keyword || "")
    .trim()
    .toLowerCase();
  const categoryId = manualAddModalState.value.categoryId || "all";

  return [...productList.value]
    .filter((item) => {
      if (item.isActive === false) return false;
      if (item.isDeleted === true) return false;
      if (item.isSoldOut === true) return false;
      if (Number(item.stock ?? 0) <= 0) return false;
      if (
        categoryId !== "all" &&
        !getProductCategoryIds(item).includes(categoryId)
      ) {
        return false;
      }

      if (!keyword) return true;

      return (
        String(item.productName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.description || "")
          .toLowerCase()
          .includes(keyword)
      );
    })
    .sort((a, b) => {
      const aOrder = Number(a.sortOrder ?? 0);
      const bOrder = Number(b.sortOrder ?? 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.productName || "").localeCompare(
        String(b.productName || "")
      );
    });
});

const manualCartTotalCount = computed(() => {
  return manualAddModalState.value.cartItems.reduce(
    (acc, item) => acc + Number(item.quantity || 0),
    0
  );
});

const manualCartTotalAmount = computed(() => {
  return manualAddModalState.value.cartItems.reduce(
    (acc, item) => acc + manualUnitPriceOf(item) * Number(item.quantity || 0),
    0
  );
});

function manualUnitPriceOf(item) {
  return market.priceForCartItem(item);
}

const manualSortedOptionGroups = computed(() => {
  if (!manualOptionModalState.value.product?.optionGroups) return [];

  return [...manualOptionModalState.value.product.optionGroups].sort(
    (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)
  );
});

const manualSelectedOptionsFlat = computed(() => {
  const result = [];

  for (const [groupId, options] of Object.entries(
    manualOptionModalState.value.selectedOptionMap || {}
  )) {
    for (const option of options) {
      result.push({
        groupId,
        groupName: option.groupName,
        optionId: option.optionId,
        optionName: option.optionName,
        additionalPrice: Number(option.additionalPrice || 0),
      });
    }
  }

  return result;
});

// 수동 주문도 손님 주문과 같은 시세를 씁니다.
const manualSheetBasePrice = computed(() =>
  market.priceFor(manualOptionModalState.value.product)
);

const manualOptionUnitPrice = computed(() => {
  if (!manualOptionModalState.value.product) return 0;

  const additional = manualSelectedOptionsFlat.value.reduce(
    (acc, item) => acc + Number(item.additionalPrice || 0),
    0
  );

  return manualSheetBasePrice.value + additional;
});

function marketPriceOf(product) {
  return market.priceFor(product);
}

const manualOptionTotalPrice = computed(() => {
  return (
    manualOptionUnitPrice.value *
    Number(manualOptionModalState.value.quantity || 1)
  );
});

const paymentDiscountTotal = computed(() => {
  const originalAmount = Number(paymentModalState.value.amount || 0);

  const discountTotal = paymentModalState.value.discounts.reduce(
    (acc, discount) => {
      const value = Number(discount.value || 0);
      if (value <= 0) return acc;

      if (discount.type === "PERCENT") {
        return acc + Math.floor((originalAmount * Math.min(value, 100)) / 100);
      }

      return acc + value;
    },
    0
  );

  return Math.min(originalAmount, discountTotal);
});

const paymentPayableAmount = computed(() => {
  return Math.max(
    0,
    Number(paymentModalState.value.amount || 0) - paymentDiscountTotal.value
  );
});

const paymentSplitTotal = computed(() => {
  return paymentModalState.value.paymentSplits.reduce((acc, split) => {
    return acc + Number(split.amount || 0);
  }, 0);
});

const paymentRemainingAmount = computed(() => {
  return paymentPayableAmount.value - paymentSplitTotal.value;
});

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function convertToDate(value) {
  const ms = toTime(value);
  return ms ? new Date(ms) : null;
}

function formatDateTime(value) {
  const date = convertToDate(value);
  if (!date) return "-";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}.${day} ${hours}:${minutes}`;
}

function convertOrderSheetStatusText(status) {
  if (status === "OPEN") return "이용중";
  if (status === "PAID") return "결제완료";
  if (status === "CLOSED") return "마감";
  return status || "알 수 없음";
}

function convertOrderStatusText(status) {
  if (status === "REQUESTED") return "주문접수";
  if (status === "SERVED") return "제공완료";
  if (status === "CANCELLED") return "취소";
  return "알 수 없음";
}

function resolveGiftTargetLabel(order) {
  const targetTable = String(order?.giftToTableNumber || "").trim();
  const targetNickname = String(order?.giftToNickname || "").trim();

  if (targetTable && targetNickname) {
    return `${targetNickname}(${targetTable}번)`;
  }

  if (targetTable) {
    return `${targetTable}번 테이블`;
  }

  return "다른 테이블";
}

function convertPaymentStatusText(status) {
  if (status === "UNPAID") return "미결제";
  if (status === "COMPLETED") return "결제완료";
  return status || "알 수 없음";
}

function convertPaymentMethodText(method) {
  if (method === "CARD") return "카드";
  if (method === "BANK") return "계좌이체";
  if (method === "CASH") return "현금";
  if (method === "MIXED") return "부분 결제";
  if (method === "DISCOUNT") return "할인 처리";
  return method || "-";
}

function createPaymentDiscount(type = "AMOUNT") {
  return {
    id: `discount_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    type,
    value: 0,
  };
}

function createPaymentSplit(method = "CARD", amount = 0) {
  return {
    id: `split_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    method,
    amount: Number(amount || 0),
  };
}

function getRepresentativePaymentMethod(paymentSplits) {
  const activeSplits = paymentSplits.filter(
    (split) => Number(split.amount || 0) > 0
  );
  const methodSet = new Set(activeSplits.map((split) => split.method));

  if (activeSplits.length === 0) return "DISCOUNT";
  if (methodSet.size === 1) return activeSplits[0]?.method || "CARD";
  return "MIXED";
}

function normalizePaymentDiscounts(discounts, originalAmount) {
  return discounts
    .map((discount) => {
      const type = discount.type === "PERCENT" ? "PERCENT" : "AMOUNT";
      const value = Math.max(0, Number(discount.value || 0));
      const discountAmount =
        type === "PERCENT"
          ? Math.floor(
              (Number(originalAmount || 0) * Math.min(value, 100)) / 100
            )
          : value;

      return {
        title: String(discount.title || "").trim(),
        type,
        value,
        discountAmount,
      };
    })
    .filter((discount) => discount.value > 0 && discount.discountAmount > 0);
}

function normalizePaymentSplits(paymentSplits) {
  return paymentSplits
    .map((split) => ({
      method: split.method || "CARD",
      amount: Number(split.amount || 0),
    }))
    .filter((split) => split.amount > 0);
}

function addPaymentDiscount(type = "AMOUNT") {
  paymentModalState.value.discounts.push(createPaymentDiscount(type));
}

function removePaymentDiscount(discountId) {
  paymentModalState.value.discounts = paymentModalState.value.discounts.filter(
    (discount) => discount.id !== discountId
  );
}

function addPaymentSplit(method = "CARD") {
  const amount = Math.max(0, paymentRemainingAmount.value);
  paymentModalState.value.paymentSplits.push(
    createPaymentSplit(method, amount)
  );
}

function removePaymentSplit(splitId) {
  paymentModalState.value.paymentSplits =
    paymentModalState.value.paymentSplits.filter(
      (split) => split.id !== splitId
    );
}

function fillPaymentSplitRemaining(split) {
  const otherTotal = paymentModalState.value.paymentSplits.reduce(
    (acc, item) => {
      if (item.id === split.id) return acc;
      return acc + Number(item.amount || 0);
    },
    0
  );

  split.amount = Math.max(0, paymentPayableAmount.value - otherTotal);
}

function getHiddenPreviewCount(table) {
  const previewLength = Array.isArray(table.latestOrderItemsPreview)
    ? table.latestOrderItemsPreview.length
    : 0;

  return previewLength > 5 ? previewLength - 5 : 0;
}

function getActiveOptions(group) {
  return [...(group.options || [])]
    .filter((item) => item.isActive !== false)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
}

function isProductSoldOut(product) {
  return product.isSoldOut === true || Number(product.stock ?? 0) <= 0;
}

function buildCartItemKey(productId, selectedOptions) {
  const optionKey = [...selectedOptions]
    .sort((a, b) => {
      const left = `${a.groupId}_${a.optionId}`;
      const right = `${b.groupId}_${b.optionId}`;
      return left.localeCompare(right);
    })
    .map((item) => `${item.groupId}:${item.optionId}`)
    .join("|");

  return `${productId}__${optionKey}`;
}

function subscribeOrderSheets() {
  const loadOrderSheets = async () => {
    try {
      orderSheetList.value = await fetchList("orderSheets", {
        order: ["updatedAt", "desc"],
      });
    } catch (error) {
      console.error("주문서 구독 실패:", error);
    } finally {
      isLoadingOrderSheets.value = false;
    }
  };

  unsubscribeOrderSheets = subscribeTable("orderSheets", loadOrderSheets);
}

function playNotificationSound(type, options = {}) {
  try {
    const soundSrc = type === "order" ? orderSoundSrc : paymentSoundSrc;
    if (!soundSrc) return;

    const audio = new Audio(soundSrc);
    audio.preload = "auto";
    audio.play().catch((error) => {
      if (options.silent) return;
      console.warn("소리 재생 차단됨:", error);
    });
  } catch (error) {
    if (options.silent) return;
    console.error("알림음 재생 실패:", error);
  }
}

function subscribeOrders() {
  const loadOrders = async () => {
    try {
      const currentOrders = await fetchList("orders", {
        order: ["createdAt", "desc"],
      });
      const currentOrderIds = new Set(currentOrders.map((item) => item.id));

      if (!isLoadingOrders.value) {
        for (const id of currentOrderIds) {
          if (!previousOrderIds.has(id)) {
            playNotificationSound("order");
            break;
          }
        }
      }

      previousOrderIds = currentOrderIds;
      orderList.value = currentOrders;
    } catch (error) {
      console.error("주문 구독 실패:", error);
    } finally {
      isLoadingOrders.value = false;
    }
  };

  unsubscribeOrders = subscribeTable("orders", loadOrders);
}

function subscribeCategories() {
  const loadCategories = async () => {
    try {
      categoryList.value = await fetchList("categories", {
        order: ["sortOrder", "asc"],
      });
      syncSelectedRecipeCategory();
    } catch (error) {
      console.error("카테고리 구독 실패:", error);
    }
  };

  unsubscribeCategories = subscribeTable("categories", loadCategories);
}

function getProductCategoryIds(product) {
  if (Array.isArray(product.categoryIds) && product.categoryIds.length > 0) {
    return product.categoryIds.map((item) => String(item));
  }

  return product.categoryId ? [String(product.categoryId)] : [];
}

function subscribeProducts() {
  const loadProducts = async () => {
    try {
      productList.value = await fetchList("products", {
        filters: [["deletedAt", "is", null]],
        order: ["sortOrder", "asc"],
      });
    } catch (error) {
      console.error("상품 구독 실패:", error);
    } finally {
      isLoadingProducts.value = false;
    }
  };

  unsubscribeProducts = subscribeTable("products", loadProducts);
}

function selectTable(table) {
  selectedTable.value = table;
}

function closeTableModal() {
  selectedTable.value = null;
}

function findRecipeProductByOrderItem(item) {
  const productId = String(item?.productId || "").trim();
  const productName = String(item?.productName || "").trim();

  if (productId) {
    const foundById = productList.value.find(
      (product) => String(product.id || "") === productId
    );
    if (foundById) return foundById;
  }

  if (productName) {
    const foundByName = productList.value.find(
      (product) => String(product.productName || "").trim() === productName
    );
    if (foundByName) return foundByName;
  }

  return {
    id: productId || productName,
    productName: productName || "이름 없음",
    description: "",
    recipeInfo: null,
    recipeText: "",
  };
}

function openRecipeModal(product) {
  recipeModalProduct.value = product;
}

function openRecipeModalByOrderItem(item) {
  recipeModalProduct.value = findRecipeProductByOrderItem(item);
}

function closeRecipeModal() {
  recipeModalProduct.value = null;
}

function openOrderSheetTagModal(table) {
  if (!table.orderSheetId) return;

  orderSheetTagModalState.value = {
    isOpen: true,
    orderSheetId: table.orderSheetId,
    displayName: table.displayName || table.tableLabel || "",
    tags: normalizeOrderSheetTags(table.internalTags),
    customTag: "",
    isSaving: false,
  };
}

function closeOrderSheetTagModal() {
  orderSheetTagModalState.value = {
    isOpen: false,
    orderSheetId: "",
    displayName: "",
    tags: [],
    customTag: "",
    isSaving: false,
  };
}

function toggleOrderSheetTag(tag) {
  if (orderSheetTagModalState.value.tags.includes(tag)) {
    removeOrderSheetTag(tag);
    return;
  }

  orderSheetTagModalState.value.tags.push(tag);
}

function addCustomOrderSheetTag() {
  const tag = String(orderSheetTagModalState.value.customTag || "").trim();
  if (!tag) return;
  if (isDemographicOrderSheetTag(tag)) {
    orderSheetTagModalState.value.customTag = "";
    return;
  }

  if (!orderSheetTagModalState.value.tags.includes(tag)) {
    orderSheetTagModalState.value.tags.push(tag);
  }

  orderSheetTagModalState.value.customTag = "";
}

function removeOrderSheetTag(tag) {
  orderSheetTagModalState.value.tags =
    orderSheetTagModalState.value.tags.filter((item) => item !== tag);
}

async function saveOrderSheetTags() {
  const state = orderSheetTagModalState.value;
  if (!state.orderSheetId || state.isSaving) return;

  await runGlobalBusy(async () => {
    state.isSaving = true;

    try {
      const internalTags = normalizeOrderSheetTags(state.tags);

      await updateRow("orderSheets", state.orderSheetId, {
        internalTags,
        updatedAt: nowIso(),
      });

      if (selectedTable.value?.orderSheetId === state.orderSheetId) {
        selectedTable.value = {
          ...selectedTable.value,
          internalTags,
        };
      }

      closeOrderSheetTagModal();
    } catch (error) {
      console.error("주문서 태그 저장 실패:", error);
      alert("주문서 태그 저장 중 문제가 발생했어요.");
      state.isSaving = false;
    }
  }, "주문서 태그를 저장하는 중이에요.");
}

function openTableNicknameModal(table) {
  if (!table?.orderSheetId) return;

  tableNicknameModalState.value = {
    isOpen: true,
    orderSheetId: table.orderSheetId,
    displayName: table.displayName || table.tableLabel || "",
    nickname: table.tableNickname || "",
    isSaving: false,
  };
}

function closeTableNicknameModal() {
  tableNicknameModalState.value = {
    isOpen: false,
    orderSheetId: "",
    displayName: "",
    nickname: "",
    isSaving: false,
  };
}

async function saveTableNickname() {
  const state = tableNicknameModalState.value;
  if (!state.isOpen || !state.orderSheetId || state.isSaving) return;
  if (tableNicknameModalError.value) return;

  await runGlobalBusy(async () => {
    state.isSaving = true;

    try {
      const savedNickname = await updateOrderSheetNickname({
        orderSheetId: state.orderSheetId,
        nickname: state.nickname,
      });

      if (selectedTable.value?.orderSheetId === state.orderSheetId) {
        selectedTable.value = {
          ...selectedTable.value,
          tableNickname: savedNickname,
        };
      }

      closeTableNicknameModal();
    } catch (error) {
      console.error("닉네임 변경 실패:", error);
      alert("닉네임 변경 중 문제가 발생했어요.");
      state.isSaving = false;
    }
  }, "닉네임을 변경하는 중이에요.");
}

function openTableCharacterModal(table) {
  if (!table?.orderSheetId) return;

  const tableNumber = String(table.tableNumber ?? "");

  tableCharacterModalState.value = {
    isOpen: true,
    orderSheetId: table.orderSheetId,
    tableNumber,
    displayName: table.displayName || table.tableLabel || "",
    nickname: table.tableNickname || "",
    draft: resolveCharacterStyle(table.characterStyle, tableNumber),
    isSaving: false,
  };
}

function closeTableCharacterModal() {
  tableCharacterModalState.value = {
    isOpen: false,
    orderSheetId: "",
    tableNumber: "",
    displayName: "",
    nickname: "",
    draft: resolveCharacterStyle({}),
    isSaving: false,
  };
}

async function saveTableCharacter() {
  const state = tableCharacterModalState.value;
  if (!state.isOpen || !state.orderSheetId || state.isSaving) return;

  await runGlobalBusy(async () => {
    state.isSaving = true;

    try {
      const savedStyle = await updateOrderSheetCharacterStyle({
        orderSheetId: state.orderSheetId,
        characterStyle: state.draft,
      });

      if (selectedTable.value?.orderSheetId === state.orderSheetId) {
        selectedTable.value = {
          ...selectedTable.value,
          characterStyle: savedStyle,
        };
      }

      closeTableCharacterModal();
    } catch (error) {
      console.error("캐릭터 변경 실패:", error);
      alert("캐릭터 변경 중 문제가 발생했어요.");
      state.isSaving = false;
    }
  }, "캐릭터를 저장하는 중이에요.");
}

function openManualAddModal(table) {
  manualAddModalState.value = {
    isOpen: true,
    orderSheetId: table.orderSheetId || "",
    tableNumber: String(table.tableNumber || ""),
    displayName: table.displayName || `No.${table.tableNumber}`,
    cartItems: [],
    keyword: "",
    categoryId: firstCategoryId(),
    customPrice: "",
  };
}

function closeManualAddModal() {
  manualAddModalState.value = {
    isOpen: false,
    orderSheetId: "",
    tableNumber: "",
    displayName: "",
    cartItems: [],
    keyword: "",
    categoryId: "all",
    customPrice: "",
  };
}

function openManualOptionModal(product) {
  if (isProductSoldOut(product)) return;

  manualOptionModalState.value = {
    isOpen: true,
    product: JSON.parse(JSON.stringify(product)),
    orderSheetId: manualAddModalState.value.orderSheetId,
    tableNumber: manualAddModalState.value.tableNumber,
    displayName: manualAddModalState.value.displayName,
    selectedOptionMap: {},
    quantity: 1,
    validationMessage: "",
  };

  for (const group of manualOptionModalState.value.product.optionGroups || []) {
    const activeOptions = getActiveOptions(group);
    const defaultOptions = activeOptions.filter(
      (item) => item.isDefault === true
    );

    if (group.isMultiple) {
      manualOptionModalState.value.selectedOptionMap[group.groupId] =
        defaultOptions
          .filter((item) => item.isSoldOut !== true)
          .map((item) => ({
            ...item,
            groupName: group.groupName,
          }));
    } else {
      const defaultOne = defaultOptions.find((item) => item.isSoldOut !== true);
      manualOptionModalState.value.selectedOptionMap[group.groupId] = defaultOne
        ? [{ ...defaultOne, groupName: group.groupName }]
        : [];
    }
  }
}

function closeManualOptionModal() {
  manualOptionModalState.value = {
    isOpen: false,
    product: null,
    orderSheetId: "",
    tableNumber: "",
    displayName: "",
    selectedOptionMap: {},
    quantity: 1,
    validationMessage: "",
  };
}

function isManualOptionSelected(groupId, optionId) {
  const selected =
    manualOptionModalState.value.selectedOptionMap[groupId] || [];
  return selected.some((item) => item.optionId === optionId);
}

function toggleManualOption(group, option) {
  manualOptionModalState.value.validationMessage = "";

  const groupId = group.groupId;
  const selected = [
    ...(manualOptionModalState.value.selectedOptionMap[groupId] || []),
  ];
  const exists = selected.findIndex(
    (item) => item.optionId === option.optionId
  );

  if (group.isMultiple) {
    if (exists > -1) {
      selected.splice(exists, 1);
    } else {
      if (selected.length >= Number(group.maxSelectCount || 999)) {
        manualOptionModalState.value.validationMessage = `${group.groupName}은(는) 최대 ${group.maxSelectCount}개까지 선택할 수 있어요.`;
        return;
      }

      selected.push({
        ...option,
        groupName: group.groupName,
      });
    }
  } else {
    if (exists > -1) {
      manualOptionModalState.value.selectedOptionMap[groupId] = [];
      return;
    }

    manualOptionModalState.value.selectedOptionMap[groupId] = [
      {
        ...option,
        groupName: group.groupName,
      },
    ];
    return;
  }

  manualOptionModalState.value.selectedOptionMap[groupId] = selected;
}

function validateManualOptions() {
  if (!manualOptionModalState.value.product) return false;

  for (const group of manualSortedOptionGroups.value) {
    const activeOptions = getActiveOptions(group).filter(
      (item) => item.isSoldOut !== true
    );

    const selected =
      manualOptionModalState.value.selectedOptionMap[group.groupId] || [];
    const minSelectCount = Number(group.minSelectCount || 0);
    const maxSelectCount = Number(group.maxSelectCount || 0);

    if (group.isRequired && activeOptions.length === 0) {
      manualOptionModalState.value.validationMessage = `${group.groupName}에 선택 가능한 옵션이 없어요.`;
      return false;
    }

    if (group.isRequired && selected.length < minSelectCount) {
      manualOptionModalState.value.validationMessage = `${group.groupName} 항목을 선택해주세요.`;
      return false;
    }

    if (maxSelectCount > 0 && selected.length > maxSelectCount) {
      manualOptionModalState.value.validationMessage = `${group.groupName}은(는) 최대 ${maxSelectCount}개까지 선택할 수 있어요.`;
      return false;
    }

    if (!group.isMultiple && selected.length > 1) {
      manualOptionModalState.value.validationMessage = `${group.groupName}은(는) 하나만 선택할 수 있어요.`;
      return false;
    }
  }

  manualOptionModalState.value.validationMessage = "";
  return true;
}

function increaseManualOptionQuantity() {
  manualOptionModalState.value.quantity += 1;
}

function decreaseManualOptionQuantity() {
  if (manualOptionModalState.value.quantity <= 1) return;
  manualOptionModalState.value.quantity -= 1;
}

function addManualSimpleProduct(product) {
  const unitPrice = market.livePriceFor(product);

  const cartItem = {
    cartItemId: `manual_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    cartItemKey: buildCartItemKey(product.id, []),
    orderSheetId: manualAddModalState.value.orderSheetId,
    tableNumber: manualAddModalState.value.tableNumber,
    displayName: manualAddModalState.value.displayName,
    productId: product.id,
    productName: product.productName,
    basePrice: Number(product.basePrice || 0),
    imageUrl: product.imageUrl || "",
    quantity: 1,
    selectedOptions: [],
    unitPrice,
    totalPrice: unitPrice,
  };

  const foundIndex = manualAddModalState.value.cartItems.findIndex(
    (item) => item.cartItemKey === cartItem.cartItemKey
  );

  if (foundIndex > -1) {
    manualAddModalState.value.cartItems[foundIndex].quantity += 1;
    manualAddModalState.value.cartItems[foundIndex].totalPrice =
      Number(manualAddModalState.value.cartItems[foundIndex].unitPrice || 0) *
      Number(manualAddModalState.value.cartItems[foundIndex].quantity || 0);
  } else {
    manualAddModalState.value.cartItems.push(cartItem);
  }
}

function addManualCustomProduct() {
  const customPrice = Number(manualAddModalState.value.customPrice);

  if (!Number.isInteger(customPrice) || customPrice <= 0) {
    alert("커스텀 메뉴 금액을 1원 이상의 정수로 입력해주세요.");
    return;
  }

  const cartItemKey = `custom_manual_${customPrice}`;
  const found = manualAddModalState.value.cartItems.find(
    (item) => item.cartItemKey === cartItemKey
  );

  if (found) {
    found.quantity += 1;
    found.totalPrice =
      Number(found.unitPrice || 0) * Number(found.quantity || 0);
  } else {
    manualAddModalState.value.cartItems.push({
      cartItemId: `manual_custom_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      cartItemKey,
      orderSheetId: manualAddModalState.value.orderSheetId,
      tableNumber: manualAddModalState.value.tableNumber,
      displayName: manualAddModalState.value.displayName,
      productId: "custom",
      productName: "커스텀",
      basePrice: customPrice,
      imageUrl: "",
      quantity: 1,
      selectedOptions: [],
      unitPrice: customPrice,
      totalPrice: customPrice,
      isCustom: true,
    });
  }

  manualAddModalState.value.customPrice = "";
}

function addManualOptionProductToCart() {
  if (!manualOptionModalState.value.product) return;
  if (!validateManualOptions()) return;

  const selectedOptions = manualSelectedOptionsFlat.value;

  const cartItem = {
    cartItemId: `manual_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    cartItemKey: buildCartItemKey(
      manualOptionModalState.value.product.id,
      selectedOptions
    ),
    orderSheetId: manualOptionModalState.value.orderSheetId,
    tableNumber: manualOptionModalState.value.tableNumber,
    displayName: manualOptionModalState.value.displayName,
    productId: manualOptionModalState.value.product.id,
    productName: manualOptionModalState.value.product.productName,
    basePrice: Number(manualOptionModalState.value.product.basePrice || 0),
    imageUrl: manualOptionModalState.value.product.imageUrl || "",
    quantity: Number(manualOptionModalState.value.quantity || 1),
    selectedOptions,
    unitPrice: manualOptionUnitPrice.value,
    totalPrice: manualOptionTotalPrice.value,
  };

  const foundIndex = manualAddModalState.value.cartItems.findIndex(
    (item) => item.cartItemKey === cartItem.cartItemKey
  );

  if (foundIndex > -1) {
    manualAddModalState.value.cartItems[foundIndex].quantity +=
      cartItem.quantity;
    manualAddModalState.value.cartItems[foundIndex].totalPrice =
      Number(manualAddModalState.value.cartItems[foundIndex].unitPrice || 0) *
      Number(manualAddModalState.value.cartItems[foundIndex].quantity || 0);
  } else {
    manualAddModalState.value.cartItems.push(cartItem);
  }

  closeManualOptionModal();
}

function increaseManualCartQuantity(cartItemKey) {
  const found = manualAddModalState.value.cartItems.find(
    (item) => (item.cartItemKey || item.cartItemId) === cartItemKey
  );
  if (!found) return;

  found.quantity += 1;
  found.totalPrice = Number(found.unitPrice || 0) * Number(found.quantity || 0);
}

function decreaseManualCartQuantity(cartItemKey) {
  const found = manualAddModalState.value.cartItems.find(
    (item) => (item.cartItemKey || item.cartItemId) === cartItemKey
  );
  if (!found) return;

  found.quantity -= 1;

  if (found.quantity <= 0) {
    manualAddModalState.value.cartItems =
      manualAddModalState.value.cartItems.filter(
        (item) => (item.cartItemKey || item.cartItemId) !== cartItemKey
      );
  } else {
    found.totalPrice =
      Number(found.unitPrice || 0) * Number(found.quantity || 0);
  }
}

function removeManualCartItem(cartItemKey) {
  manualAddModalState.value.cartItems =
    manualAddModalState.value.cartItems.filter(
      (item) => (item.cartItemKey || item.cartItemId) !== cartItemKey
    );
}

async function submitManualAddOrder() {
  const state = manualAddModalState.value;
  if (!state.orderSheetId || state.cartItems.length === 0) return;

  await runGlobalBusy(async () => {
    try {
      // 수동 추가도 주문 확정 시점의 시세로 금액을 고정합니다.
      const pricedItems = state.cartItems.map((item) => ({
        item,
        quantity: Number(item.quantity || 0),
        unitPrice: market.livePriceForCartItem(item),
      }));

      const orderItems = pricedItems.map(({ item, quantity, unitPrice }) => ({
        orderSheetId: state.orderSheetId,
        tableNumber: state.tableNumber,
        displayName: state.displayName,
        productId: item.productId,
        productName: item.productName,
        basePrice: Number(item.basePrice || 0),
        unitPrice,
        totalPrice: unitPrice * quantity,
        quantity,
        imageUrl: item.imageUrl || "",
        isCustom: item.isCustom === true,
        selectedOptions: Array.isArray(item.selectedOptions)
          ? item.selectedOptions.map((option) => ({
              groupId: option.groupId,
              groupName: option.groupName,
              optionId: option.optionId,
              optionName: option.optionName,
              additionalPrice: Number(option.additionalPrice || 0),
            }))
          : [],
      }));

      const totalCount = state.cartItems.reduce(
        (acc, item) => acc + Number(item.quantity || 0),
        0
      );

      const totalPrice = orderItems.reduce(
        (acc, item) => acc + Number(item.totalPrice || 0),
        0
      );

      await insertRow("orders", {
        id: newId(),
        orderSheetId: state.orderSheetId,
        tableNumber: state.tableNumber,
        displayName: state.displayName,
        requestMessage: "[직원 수동 추가]",
        items: orderItems,
        totalCount,
        totalPrice,
        status: "SERVED",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      await recalculateOrderSheetTotals(state.orderSheetId);

      closeManualAddModal();
      closeTableModal();
      alert("상품이 테이블에 추가되었어요.");
    } catch (error) {
      console.error("수동 상품 추가 실패:", error);
      alert("수동 상품 추가 중 문제가 발생했어요.");
    }
  }, "상품을 추가하는 중이에요.");
}

function selectManualProduct(product) {
  if (isProductSoldOut(product)) return;

  if (Array.isArray(product.optionGroups) && product.optionGroups.length > 0) {
    openManualOptionModal(product);
    return;
  }

  addManualSimpleProduct(product);
}

function openTablePaymentModal(table) {
  const amount = Number(table.totalAmount || 0);

  paymentModalState.value = {
    isOpen: true,
    orderSheetId: table.orderSheetId || "",
    tableNumber: table.tableNumber || "",
    displayName: table.displayName || `No.${table.tableNumber}`,
    paymentMethod: "CARD",
    amount,
    discounts: [],
    paymentSplits: [createPaymentSplit("CARD", amount)],
  };
}

function closePaymentModal() {
  paymentModalState.value = {
    isOpen: false,
    orderSheetId: "",
    tableNumber: "",
    displayName: "",
    paymentMethod: "CARD",
    amount: 0,
    discounts: [],
    paymentSplits: [],
  };
}

function closePaymentCompleteModal() {
  paymentCompleteModalState.value = {
    isOpen: false,
    displayName: "",
    paymentMethod: "",
    amount: 0,
    originalAmount: 0,
    discountTotal: 0,
    paymentSplits: [],
  };
}

async function completePayment() {
  const state = paymentModalState.value;
  if (!state.orderSheetId) return;

  const originalAmount = Number(state.amount || 0);
  const discounts = normalizePaymentDiscounts(state.discounts, originalAmount);
  const discountTotal = Math.min(
    originalAmount,
    discounts.reduce(
      (acc, discount) => acc + Number(discount.discountAmount || 0),
      0
    )
  );
  const payableAmount = Math.max(0, originalAmount - discountTotal);
  const paymentSplits = normalizePaymentSplits(state.paymentSplits);
  const splitTotal = paymentSplits.reduce(
    (acc, split) => acc + Number(split.amount || 0),
    0
  );
  const paymentMethod = getRepresentativePaymentMethod(paymentSplits);

  if (payableAmount > 0 && paymentSplits.length === 0) {
    alert("결제 수단별 금액을 1개 이상 입력해주세요.");
    return;
  }

  if (splitTotal !== payableAmount) {
    alert("결제 입력 합계가 최종 결제 금액과 같아야 합니다.");
    return;
  }

  await runGlobalBusy(async () => {
    try {
      await recalculateOrderSheetTotals(state.orderSheetId);

      await completeOrderSheetPayment({
        orderSheetId: state.orderSheetId,
        tableNumber: state.tableNumber,
        paymentMethod,
        originalAmount,
        discountTotal,
        totalAmount: payableAmount,
        discounts,
        paymentSplits,
      });

      // 손님이 결제하고 나가면 이 테이블의 1:1 채팅을 모두 정리합니다.
      try {
        await clearDirectChatMessagesForTable(state.tableNumber);
      } catch (chatError) {
        console.error("1:1 채팅 정리 실패:", chatError);
      }

      paymentCompleteModalState.value = {
        isOpen: true,
        displayName: state.displayName,
        paymentMethod,
        amount: payableAmount,
        originalAmount,
        discountTotal,
        paymentSplits,
      };

      playNotificationSound("paymentComplete", { silent: true });
      closePaymentModal();
      closeTableModal();
    } catch (error) {
      console.error("결제 완료 처리 실패:", error);
      alert("결제 완료 처리 중 문제가 발생했어요.");
    }
  }, "결제를 처리하는 중이에요.");
}

function confirmOrderStatusChange(order, nextStatus) {
  const label = nextStatus === "SERVED" ? "제공완료" : "취소";
  const tableName = order.displayName || `No.${order.tableNumber}`;
  const confirmed = window.confirm(`${tableName} 주문을 ${label} 처리할까요?`);

  if (!confirmed) return;

  updateOrderStatus(order, nextStatus);
}

async function updateOrderStatus(order, nextStatus) {
  await runGlobalBusy(async () => {
    try {
      await updateRow("orders", order.id, {
        status: nextStatus,
        updatedAt: nowIso(),
      });

      await recalculateOrderSheetTotals(order.orderSheetId);
    } catch (error) {
      console.error("주문 상태 변경 실패:", error);
      alert("주문 상태 변경 중 문제가 발생했어요.");
    }
  }, "주문 상태를 변경하는 중이에요.");
}

async function finalizeTableCleanup(table) {
  const confirmed = window.confirm(
    `${table.tableLabel} 테이블 정리를 완료할까요?`
  );

  if (!confirmed) return;

  await runGlobalBusy(async () => {
    try {
      await finalizeOrderSheetCleanup({
        orderSheetId: table.orderSheetId,
      });

      // 손님이 떠난 테이블의 1:1 채팅도 함께 정리합니다.
      try {
        await clearDirectChatMessagesForTable(table.tableNumber);
      } catch (chatError) {
        console.error("1:1 채팅 정리 실패:", chatError);
      }

      closeTableModal();
      alert("테이블 정리가 완료되었어요.");
    } catch (error) {
      console.error("테이블 정리 완료 처리 실패:", error);
      alert("테이블 정리 완료 처리 중 문제가 발생했어요.");
    }
  }, "테이블을 정리하는 중이에요.");
}

async function activateNextOrderSheet() {
  const table = selectedTable.value;
  if (!table) return;

  const tableNumber = normalizeTableNumber(table.tableNumber);
  if (!tableNumber) return;

  const confirmed = window.confirm(
    `${
      table.tableLabel || `${tableNumber}번 테이블`
    }의 다음 주문서를 새로 열어 활성화할까요?\n기존 마감 주문서 내역은 그대로 유지돼요.`
  );

  if (!confirmed) return;

  await runGlobalBusy(async () => {
    try {
      const result = await getOrCreateOpenOrderSheet(tableNumber);

      closeTableModal();
      alert(
        `${tableNumber}번 테이블의 다음 주문서(${result.orderSheetId})가 활성화되었어요.`
      );
    } catch (error) {
      console.error("다음 주문서 활성화 실패:", error);
      alert("다음 주문서 활성화 중 문제가 발생했어요.");
    }
  }, "다음 주문서를 활성화하는 중이에요.");
}

async function handleScanTableNumberCleanup() {
  if (isTableNumberCleanupScanning.value || isTableNumberCleanupRunning.value) {
    return;
  }

  const confirmed = window.confirm(
    "01 형태로 저장된 테이블 번호를 검사할까요?\n검사만 하고 데이터는 바뀌지 않아요."
  );

  if (!confirmed) return;

  isTableNumberCleanupScanning.value = true;
  tableNumberCleanupResult.value = null;

  try {
    const scanResult = await scanLegacyTableNumbers();
    tableNumberCleanupScan.value = scanResult;

    if (scanResult.total === 0) {
      alert("정리할 대상이 없어요. 테이블 번호가 이미 모두 통일되어 있어요.");
    } else {
      alert(
        `정리 대상 ${scanResult.total}건을 찾았어요.\n"정리 실행"을 누르면 1 형태로 통일돼요.`
      );
    }
  } catch (error) {
    console.error("테이블 번호 정리 검사 실패:", error);
    alert("검사 중 문제가 발생했어요.");
  } finally {
    isTableNumberCleanupScanning.value = false;
  }
}

async function handleRunTableNumberCleanup() {
  if (isTableNumberCleanupRunning.value || isTableNumberCleanupScanning.value) {
    return;
  }

  const scannedTotal = tableNumberCleanupScan.value?.total;
  const confirmed = window.confirm(
    scannedTotal
      ? `검사된 ${scannedTotal}건의 테이블 번호를 1 형태로 정리할까요?\n주문서 · 주문 · 채팅 · 활성 키가 대상이에요.`
      : "테이블 번호 일괄 정리를 실행할까요?\n주문서 · 주문 · 채팅 · 활성 키에서 01 형태를 1 형태로 바꿔요."
  );

  if (!confirmed) return;

  isTableNumberCleanupRunning.value = true;
  tableNumberCleanupProgress.value = "정리 대상을 모으는 중이에요.";
  tableNumberCleanupResult.value = null;

  try {
    const result = await runLegacyTableNumberCleanup({
      onProgress: ({ processed, total }) => {
        tableNumberCleanupProgress.value = `정리하는 중 ${processed} / ${total}건`;
      },
    });

    tableNumberCleanupResult.value = result;
    tableNumberCleanupScan.value = null;

    const successCount = result.updated.reduce(
      (acc, item) => acc + item.count,
      0
    );

    if (result.failed.length === 0) {
      alert(`테이블 번호 정리가 완료됐어요. (성공 ${successCount}건)`);
    } else {
      alert(
        `정리 작업이 끝났어요.\n성공 ${successCount}건 / 실패 ${result.failed.length}건\n아래 실패 목록을 확인하고 다시 시도해 주세요.`
      );
    }
  } catch (error) {
    console.error("테이블 번호 정리 실패:", error);
    alert("정리 중 문제가 발생했어요.");
  } finally {
    isTableNumberCleanupRunning.value = false;
    tableNumberCleanupProgress.value = "";
  }
}

watch(paymentPayableAmount, (amount) => {
  if (!paymentModalState.value.isOpen) return;
  if (paymentModalState.value.paymentSplits.length !== 1) return;

  paymentModalState.value.paymentSplits[0].amount = amount;
});

// ── 테이블 채팅 · 호출 ─────────────────────────────────────────────
const chatPanelState = ref({
  isOpen: false,
  roomKey: GLOBAL_ROOM_KEY,
  draft: "",
  isSending: false,
});
const chatMessageList = ref([]);
const chatActiveTableList = ref([]);
const chatFeedback = ref("");
let unsubscribeChatMessages = null;
let unsubscribeChatTables = null;
let chatFeedbackTimer = null;
// Tracks alert ids so a new call rings even while the panel is closed.
let knownChatAlertIds = new Set();
let isChatAlertSoundReady = false;

const chatRoomStats = computed(() => {
  const stats = {};

  chatMessageList.value.forEach((message) => {
    if (message.isDeleted) return;

    const roomKey = message.roomKey || GLOBAL_ROOM_KEY;
    if (!stats[roomKey]) {
      stats[roomKey] = { lastAt: "" };
    }

    stats[roomKey].lastAt = message.createdAt || stats[roomKey].lastAt;
  });

  return stats;
});

// 호출 건수는 마지막으로 확인한 시각 이후의 알림만 센다 (배지가 계속 남지 않게).
const chatReadMap = ref({});

function syncChatReadMap(roomKeys) {
  const next = { ...chatReadMap.value };
  let hasNewRoom = false;

  roomKeys.forEach((roomKey) => {
    if (roomKey in next) return;

    next[roomKey] = getRoomLastReadAt(roomKey);
    hasNewRoom = true;
  });

  if (hasNewRoom) {
    chatReadMap.value = next;
  }
}

function markChatRoomRead(roomKey) {
  if (!roomKey) return;

  markRoomRead(roomKey);
  chatReadMap.value = {
    ...chatReadMap.value,
    [roomKey]: getRoomLastReadAt(roomKey),
  };
}

function countUnreadAlerts(roomKey) {
  const readAt = toTime(chatReadMap.value[roomKey]);

  return chatMessageList.value.filter((message) => {
    return (
      !message.isDeleted &&
      (message.roomKey || GLOBAL_ROOM_KEY) === roomKey &&
      isAlertMessage(message) &&
      toTime(message.createdAt) > readAt
    );
  }).length;
}

const chatRoomList = computed(() => {
  const stats = chatRoomStats.value;
  const tableRooms = chatActiveTableList.value.map((table) => {
    const roomKey = buildStaffRoomKey(table.tableNumber);
    const stat = stats[roomKey] || { lastAt: "" };

    return {
      roomKey,
      label: formatTableLabel(table.tableNumber, table.nickname),
      tableNumber: table.tableNumber,
      alertCount: countUnreadAlerts(roomKey),
      lastAt: stat.lastAt,
    };
  });

  tableRooms.sort((a, b) => {
    if (b.alertCount !== a.alertCount) return b.alertCount - a.alertCount;
    return toTime(b.lastAt) - toTime(a.lastAt);
  });

  return [
    {
      roomKey: GLOBAL_ROOM_KEY,
      label: "전체 채팅",
      tableNumber: "",
      alertCount: countUnreadAlerts(GLOBAL_ROOM_KEY),
      lastAt: (stats[GLOBAL_ROOM_KEY] || {}).lastAt || "",
    },
    ...tableRooms,
  ];
});

const totalChatAlertCount = computed(() =>
  chatRoomList.value.reduce((acc, room) => acc + room.alertCount, 0)
);

const activeChatRoom = computed(
  () =>
    chatRoomList.value.find(
      (room) => room.roomKey === chatPanelState.value.roomKey
    ) || null
);

const filteredChatMessages = computed(() =>
  chatMessageList.value.filter(
    (message) =>
      !message.isDeleted &&
      (message.roomKey || GLOBAL_ROOM_KEY) === chatPanelState.value.roomKey
  )
);

const chatComposerPlaceholder = computed(() =>
  activeChatRoom.value && activeChatRoom.value.tableNumber
    ? `${activeChatRoom.value.label} 테이블에 답장하기`
    : "전체 채팅에 보낼 메시지"
);

async function loadChatMessages() {
  try {
    // 최신 500건을 받아 화면 표시용으로 오래된 순으로 뒤집는다.
    const recentMessages = await fetchList("chatMessages", {
      filters: [["createdAt", "gte", getChatDayStartIso()]],
      order: ["createdAt", "desc"],
      limit: 500,
    });
    const messages = [...recentMessages].reverse();

    const alertIds = new Set(
      messages.filter((item) => isAlertMessage(item)).map((item) => item.id)
    );

    if (isChatAlertSoundReady) {
      for (const id of alertIds) {
        if (!knownChatAlertIds.has(id)) {
          playNotificationSound("payment");
          break;
        }
      }
    }

    knownChatAlertIds = alertIds;
    isChatAlertSoundReady = true;
    chatMessageList.value = messages;
    syncChatReadMap(
      new Set(messages.map((item) => item.roomKey || GLOBAL_ROOM_KEY))
    );

    if (chatPanelState.value.isOpen) {
      markChatRoomRead(chatPanelState.value.roomKey);
    }
  } catch (error) {
    console.error("채팅 구독 실패:", error);
  }
}

async function loadChatTables() {
  try {
    const activeSheets = await fetchList("activeOrderSheets", {});
    const seatedSheets = activeSheets.filter((sheet) => sheet.orderSheetId);
    const nicknameMap = {};

    if (seatedSheets.length > 0) {
      const sheetRows = await fetchList("orderSheets", {
        filters: [
          ["id", "in", seatedSheets.map((sheet) => sheet.orderSheetId)],
        ],
      });

      sheetRows.forEach((row) => {
        nicknameMap[row.orderSheetId] = row.tableNickname || "";
      });
    }

    chatActiveTableList.value = seatedSheets
      .map((sheet) => ({
        tableNumber: normalizeTableNumber(sheet.tableNumber),
        nickname: nicknameMap[sheet.orderSheetId] || "",
      }))
      .filter((table) => table.tableNumber);
  } catch (error) {
    console.error("채팅 테이블 조회 실패:", error);
  }
}

function subscribeChat() {
  unsubscribeChatMessages = subscribeTable("chatMessages", loadChatMessages);
  unsubscribeChatTables = subscribeTable("activeOrderSheets", loadChatTables, {
    pollMs: 60000,
  });
  loadChatMessages();
  loadChatTables();
}

function openChatPanel() {
  // 호출이 들어온 테이블이 있으면 그 방을 먼저 보여준다.
  const alertRoom = chatRoomList.value.find((room) => room.alertCount > 0);
  const roomKey = alertRoom ? alertRoom.roomKey : chatPanelState.value.roomKey;

  chatPanelState.value = {
    ...chatPanelState.value,
    isOpen: true,
    roomKey,
  };

  markChatRoomRead(roomKey);
  loadChatMessages();
  loadChatTables();
}

function closeChatPanel() {
  chatPanelState.value = { ...chatPanelState.value, isOpen: false };
}

function selectChatRoom(roomKey) {
  chatPanelState.value = { ...chatPanelState.value, roomKey };
  markChatRoomRead(roomKey);
}

function buildChatSenderLabel(message) {
  if (message.messageType === CHAT_MESSAGE_TYPE.ADMIN) {
    return STAFF_LABEL;
  }

  if (message.messageType === CHAT_MESSAGE_TYPE.SYSTEM) {
    return message.senderLabel || "시스템";
  }

  const nickname = String(message.nickname || "").trim();
  const tableLabel = nickname
    ? formatTableLabel(message.tableNumber, nickname)
    : `${message.tableNumber || "-"}번`;
  const tag = String(message.senderLabel || "").trim();

  // 호출/이벤트 요청은 senderLabel에 요청 종류가 담겨 있어요.
  return tag ? `${tableLabel} · ${tag}` : tableLabel;
}

function formatChatTime(value) {
  const time = toTime(value);

  if (!time) return "";

  return new Date(time).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showChatFeedback(text) {
  chatFeedback.value = text;

  if (chatFeedbackTimer) {
    clearTimeout(chatFeedbackTimer);
  }

  chatFeedbackTimer = setTimeout(() => {
    chatFeedback.value = "";
  }, 3000);
}

async function sendChatMessageToRoom(text) {
  const room = activeChatRoom.value;

  if (!room || !text) return;

  chatPanelState.value = { ...chatPanelState.value, isSending: true };

  try {
    await sendChatMessage({
      roomType: room.tableNumber ? CHAT_ROOM_TYPE.STAFF : CHAT_ROOM_TYPE.GLOBAL,
      roomKey: room.roomKey,
      message: text,
      sender: { tableNumber: "", nickname: "" },
      messageType: CHAT_MESSAGE_TYPE.ADMIN,
      senderLabel: STAFF_LABEL,
    });

    await loadChatMessages();

    if (room.tableNumber) {
      showChatFeedback(`${room.label} 테이블에 답장을 보냈어요.`);
    }
  } catch (error) {
    console.error("채팅 전송 실패:", error);
    alert(error.message || "메시지를 보내지 못했어요.");
  } finally {
    chatPanelState.value = { ...chatPanelState.value, isSending: false };
  }
}

async function sendChatReply() {
  const text = chatPanelState.value.draft.trim();

  if (!text) return;

  await sendChatMessageToRoom(text);
  chatPanelState.value = { ...chatPanelState.value, draft: "" };
}

async function sendQuickReply(phrase) {
  await sendChatMessageToRoom(phrase);
}

onMounted(() => {
  subscribeOrderSheets();
  subscribeOrders();
  subscribeCategories();
  subscribeProducts();
  subscribeChat();
  loadMarketHistory();
  marketHistoryTimer = setInterval(
    recordMarketHistorySample,
    MARKET_HISTORY_SAMPLE_MS
  );
});

onUnmounted(() => {
  if (unsubscribeOrderSheets) unsubscribeOrderSheets();
  if (unsubscribeOrders) unsubscribeOrders();
  if (unsubscribeCategories) unsubscribeCategories();
  if (unsubscribeProducts) unsubscribeProducts();
  if (unsubscribeChatMessages) unsubscribeChatMessages();
  if (unsubscribeChatTables) unsubscribeChatTables();
  if (chatFeedbackTimer) clearTimeout(chatFeedbackTimer);
  if (marketHistoryTimer) {
    clearInterval(marketHistoryTimer);
    marketHistoryTimer = null;
  }
});
</script>

<style scoped lang="scss">
.tablet-admin-view {
  min-height: 100vh;
  padding: 20px;
  background: #0f172a;
  color: #fff;
  overflow-x: hidden;
}
.tablet-header,
.table-card-top,
.list-card-head,
.modal-head,
.list-card-bottom,
.modal-info-row,
.manual-option-group-head,
.manual-option-footer,
.manual-cart-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.tablet-header {
  align-items: flex-start;
  margin-bottom: 18px;
}
.header-left .eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}
.header-left h1 {
  margin: 0;
  font-size: 32px;
  font-weight: 800;
}
.header-summary {
  min-width: 140px;
  height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
}
.tab-section {
  margin-bottom: 18px;
  min-width: 0;
}
.tab-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}
.tab-scroll::-webkit-scrollbar {
  display: none;
}
.tab-button {
  height: 42px;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.tab-button.active {
  background: #fff;
  color: #111827;
}
.content-section {
  min-height: calc(100vh - 160px);
}
.tab-panel {
  display: grid;
  gap: 16px;
}
.panel-head h2 {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 800;
}
.panel-head p {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.68);
}
.market-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.market-summary-card {
  display: grid;
  gap: 4px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
}
.market-summary-label {
  font-size: 12px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.6);
}
.market-summary-card strong {
  font-size: 22px;
  font-weight: 800;
}
.market-summary-change {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.62);
}
.market-summary-change.up,
.market-table-row .up {
  color: #4ade80;
}
.market-summary-change.down,
.market-table-row .down {
  color: #f87171;
}
.market-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.market-field {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);

  span {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.66);
  }

  input {
    height: 40px;
    padding: 0 12px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 12px;
    background: rgba(9, 12, 22, 0.55);
    color: #fff;
    font-size: 14px;
    font-weight: 700;
  }
}
.market-report-block {
  display: grid;
  gap: 10px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
  }
}
.market-report-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.market-report-stat {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);

  span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  strong {
    font-size: 18px;
    font-weight: 800;
  }

  .up {
    color: #4ade80;
  }

  .down {
    color: #f87171;
  }

  .market-report-delta {
    font-weight: 800;
    color: rgba(255, 255, 255, 0.78);
  }
}
.market-report-chart {
  position: relative;
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);

  svg {
    width: 100%;
    height: auto;
  }
}
.market-report-note,
.market-report-empty {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}
.market-report-error {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: #fecaca;
}
.market-category-block,
.market-table-block {
  display: grid;
  gap: 8px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
}
.market-category-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.market-category-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.76);
  cursor: pointer;

  input {
    display: none;
  }

  &.active {
    border-color: rgba(74, 222, 128, 0.6);
    background: rgba(74, 222, 128, 0.18);
    color: #dcfce7;
  }
}
.market-ingredient-chip {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.78);
}
.market-checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.78);
}
.market-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.market-action-button {
  min-width: 120px;
  height: 44px;
  padding: 0 18px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;

  &.primary {
    border-color: transparent;
    background: #22c55e;
    color: #052e16;
  }

  &.warn {
    border-color: rgba(248, 113, 113, 0.5);
    color: #fecaca;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}
.market-table {
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
}
.market-table-row {
  display: grid;
  grid-template-columns: 1.6fr 1fr 1fr 0.9fr;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;

  &.head {
    font-size: 12px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.58);
    background: rgba(255, 255, 255, 0.06);
  }
}
.market-table-name {
  font-weight: 700;
}
.market-toggle.live {
  border-color: rgba(74, 222, 128, 0.6);
  background: rgba(74, 222, 128, 0.18);
  color: #dcfce7;
}
.empty-box,
.list-card,
.recipe-card,
.modal-card {
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
}
.empty-box {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-box p {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.72);
}
.table-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.maintenance-box {
  display: grid;
  gap: 12px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.06);
  padding: 18px;
}
.maintenance-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.maintenance-head h3 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 800;
}
.maintenance-head p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.68);
}
.maintenance-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.maintenance-actions button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: #fff;
  color: #111827;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.maintenance-actions button.ghost {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}
.maintenance-actions button:disabled {
  opacity: 0.55;
  cursor: default;
}
.maintenance-progress {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #bfdbfe;
}
.maintenance-summary {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}
.maintenance-summary strong {
  font-size: 14px;
  font-weight: 800;
  color: #fff;
}
.maintenance-summary ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  color: rgba(255, 255, 255, 0.72);
}
.maintenance-fail {
  display: grid;
  gap: 8px;
  border-radius: 14px;
  background: rgba(252, 165, 165, 0.12);
  padding: 12px;
  color: #fecaca;
}
.maintenance-fail p {
  margin: 0;
}
.maintenance-fail button {
  justify-self: start;
  height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: #fff;
  color: #111827;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.table-card {
  border: none;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  padding: 16px;
  text-align: left;
  cursor: pointer;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.table-card.paid {
  outline: 2px solid rgba(52, 211, 153, 0.35);
}
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 11px;
  font-weight: 800;
}
.table-card-top strong,
.list-card-head strong,
.manual-cart-body strong {
  font-size: 18px;
  font-weight: 800;
}
.table-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.table-nickname {
  max-width: 140px;
  overflow: hidden;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.18);
  color: #bfdbfe;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-location,
.list-card-head p,
.recipe-menu-button-left p,
.manual-product-button p,
.manual-option-button p {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}
.table-amount {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
}
.table-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.table-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border: 1px solid rgba(250, 204, 21, 0.3);
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.12);
  color: #fde68a;
  font-size: 11px;
  font-weight: 800;
}
.table-card-bottom {
  margin-top: auto;
}
.table-preview-list,
.table-order-list,
.order-item-list,
.list-card-wrap,
.recipe-menu-list,
.manual-product-list,
.manual-cart-list,
.manual-option-button-list {
  display: grid;
  gap: 10px;
}

.manual-product-list,
.manual-cart-list {
  overflow-y: auto;
  max-height: calc(70vh - 140px);
}

.manual-product-list::-webkit-scrollbar,
.manual-cart-list::-webkit-scrollbar {
  width: 8px;
}

.manual-product-list::-webkit-scrollbar-track,
.manual-cart-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.manual-product-list::-webkit-scrollbar-thumb,
.manual-cart-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.manual-product-list::-webkit-scrollbar-thumb:hover,
.manual-cart-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
.table-preview-list span {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.76);
}
.table-order-card {
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}
.table-order-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.table-order-head strong {
  font-size: 14px;
  font-weight: 800;
}
.table-order-head p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.62);
  white-space: pre-wrap;
}
.table-order-head-right {
  display: grid;
  justify-items: end;
  gap: 8px;
  flex-shrink: 0;
}
.table-order-head-right > strong {
  font-size: 14px;
  font-weight: 800;
  color: #bfdbfe;
}
.table-order-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.more-preview {
  color: #bfdbfe;
  font-weight: 800;
}
.no-preview,
.modal-empty-text {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}
.list-card {
  padding: 16px;
}
.list-card-head {
  align-items: flex-start;
  margin-bottom: 14px;
}
.order-item-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}
.order-item-left {
  min-width: 0;
  flex: 1;
}
.order-item-left > span {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}
.order-option-list,
.manual-cart-option-list {
  display: grid;
  gap: 4px;
  margin-top: 8px;
}
.order-option-row,
.manual-cart-option-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  font-size: 12px;
}
.order-item-right,
.product-total {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 800;
}
.order-item-right {
  display: grid;
  justify-items: end;
  gap: 8px;
}
.recipe-view-button {
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.gift-badge {
  display: inline-block;
  margin-top: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.18);
  color: #fde68a;
  font-size: 12px;
  font-weight: 700;
}
.gift-order-tag {
  color: #fde68a !important;
  font-weight: 700;
}
.request-message-box {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}
.request-message-box span {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
.request-message-box p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.list-card-bottom strong {
  font-size: 20px;
  font-weight: 800;
}
.action-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.action-row button,
.modal-action-grid button,
.confirm-button,
.quick-button,
.send-button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: #fff;
  color: #111827;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.action-row button.danger,
.manual-cart-actions .danger {
  background: rgba(252, 165, 165, 0.14);
  color: #fecaca;
}

.recipe-search-box input,
.manual-search-box input {
  min-height: 84px;
  resize: none;
  border: none;
  outline: none;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  padding: 14px;
  font-size: 14px;
  line-height: 1.6;
}
.recipe-search-box input,
.manual-search-box input {
  min-height: unset;
  height: 46px;
}
.category-filter-scroll {
  display: flex;
  gap: 8px;
  margin: 10px 0 12px;
  width: 100%;
  min-width: 0;
  overflow-x: scroll;
  overflow-y: hidden;
  padding: 0 2px 8px;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
}
.category-filter-button {
  flex: 0 0 auto;
  height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
}
.category-filter-button.active {
  background: #fff;
  color: #111827;
}
.recipe-layout,
.manual-add-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  min-width: 0;
  width: 100%;
}
.recipe-menu-panel {
  min-width: 0;
  width: 100%;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.manual-add-layout {
  grid-template-columns: 320px 1fr;
}
.recipe-card,
.manual-product-panel,
.manual-cart-panel,
.manual-option-group {
  min-height: 320px;
  padding: 18px;
}

.manual-product-panel,
.manual-cart-panel {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  overflow: hidden;
}

.manual-custom-product {
  margin-bottom: 12px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}

.manual-custom-product-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.manual-custom-product-head strong {
  font-size: 14px;
  font-weight: 800;
}

.manual-custom-product-head span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
}

.manual-custom-product-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.manual-custom-product-form input {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 0 12px;
  border: none;
  outline: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
}

.manual-product-panel .manual-product-list,
.manual-cart-panel .manual-cart-list {
  flex: 1;
  min-height: 0;
}
.recipe-card-head h3,
.modal-head h3 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 800;
}
.recipe-card-head p,
.modal-head p {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.66);
}
.recipe-content {
  display: grid;
  gap: 14px;
}
.recipe-section-box {
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}
.recipe-section-box h4,
.manual-cart-panel h4,
.manual-option-group-head h4 {
  margin: 0 0 12px;
  font-size: 17px;
  font-weight: 800;
}
.recipe-ingredient-list,
.recipe-step-list,
.recipe-tip-list {
  display: grid;
  gap: 10px;
}
.recipe-ingredient-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}
.recipe-step-row,
.recipe-tip-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.recipe-step-row p,
.recipe-tip-row p,
.recipe-free-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}
.step-no {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}
.modal-card {
  width: 100%;
  max-width: 760px;
  padding: 20px;
  background: rgba(15, 23, 42, 0.96);
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  max-height: 90vh;
  overflow-y: auto;
}

.manual-add-modal {
  max-width: 1100px;
}

.table-detail-modal {
  max-width: 640px;
}
.modal-nickname-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.nickname-change-button {
  flex-shrink: 0;
  height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.modal-section {
  margin-bottom: 16px;
}
.modal-info-row,
.modal-preview-row {
  align-items: center;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
}
.modal-preview-list {
  display: grid;
  gap: 8px;
}
.close-button {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}
.modal-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.modal-action-grid .activate-next-button {
  grid-column: 1 / -1;
  height: 48px;
  padding: 0 16px;
  background: linear-gradient(135deg, #34d399, #10b981);
  color: #052e16;
  font-size: 15px;
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.3);
}
.payment-method-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.payment-method-button {
  height: 48px;
  border: none;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}
.payment-method-button.active {
  background: #fff;
  color: #111827;
}
.section-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-title-row h4 {
  margin: 0;
}
.section-action-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.payment-edit-list,
.payment-complete-split-list {
  display: grid;
  gap: 10px;
}
.payment-edit-row {
  display: grid;
  gap: 8px;
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
}
.payment-edit-row.discount-row {
  grid-template-columns: minmax(0, 1fr) 96px 120px auto;
}
.payment-edit-row.split-row {
  grid-template-columns: 120px minmax(0, 1fr) auto auto;
}
.payment-edit-row input,
.payment-edit-row select {
  width: 100%;
  min-width: 0;
  height: 38px;
  padding: 0 10px;
  border: none;
  outline: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 13px;
}
.payment-edit-row option {
  color: #111827;
}
.danger-small-button {
  height: 38px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: rgba(252, 165, 165, 0.14);
  color: #fecaca;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.danger-small-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.payment-balance-box {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}
.payment-balance-box > div {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
}
.payment-balance-box span {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}
.payment-balance-box strong {
  font-size: 16px;
}
.payment-balance-box .warning strong {
  color: #fcd34d;
}
.payment-complete-modal {
  max-width: 480px;
  text-align: center;
}
.order-sheet-tag-modal {
  max-width: 560px;
}
.table-nickname-modal {
  max-width: 480px;
}
.table-character-modal {
  --studio-pad-top: 20px;
  --studio-bleed: 20px;
  --studio-sticky-bg: #0f172a;
  max-width: 560px;
}
.table-character-modal .confirm-button {
  width: 100%;
  margin-top: 14px;
}
.modal-character-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.table-character-mini {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  image-rendering: pixelated;
}
.table-nickname-modal-helper {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.62);
}
.table-nickname-modal-error {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 800;
  color: #fca5a5;
}
.order-sheet-tag-preset-list,
.selected-order-sheet-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.order-sheet-tag-button,
.selected-order-sheet-tag {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.order-sheet-tag-button.active {
  border-color: rgba(250, 204, 21, 0.72);
  background: rgba(250, 204, 21, 0.16);
  color: #fde68a;
}
.selected-order-sheet-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-color: rgba(250, 204, 21, 0.34);
  background: rgba(250, 204, 21, 0.12);
  color: #fde68a;
}
.selected-order-sheet-tag strong {
  color: #fecaca;
}
.order-sheet-tag-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.order-sheet-tag-input-row input {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 0 12px;
  border: none;
  outline: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
}
.payment-complete-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 16px;
  border-radius: 24px;
  background: rgba(52, 211, 153, 0.18);
  color: #a7f3d0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
}
.modal-head.center {
  justify-content: center;
  text-align: center;
}
.manual-add-modal {
  max-width: 1100px;
}
.manual-product-button,
.manual-option-button,
.recipe-menu-button {
  width: 100%;
  min-height: 48px;
  padding: 14px;
  border: none;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  text-align: left;
  cursor: pointer;
}
.recipe-menu-button,
.manual-product-button,
.manual-option-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.recipe-menu-button-left {
  min-width: 0;
}
.recipe-menu-button-left strong,
.recipe-menu-button-left p {
  overflow-wrap: anywhere;
}
.recipe-menu-button-left p {
  white-space: pre-line;
}
.recipe-menu-button.active {
  background: #fff;
  color: #111827;
}
.recipe-menu-button.active p,
.recipe-menu-button.active .recipe-badge {
  color: rgba(17, 24, 39, 0.72);
}
.recipe-badge {
  flex-shrink: 0;
  max-width: 88px;
  text-align: right;
  font-size: 11px;
  font-weight: 800;
  color: #bfdbfe;
  white-space: nowrap;
}
.manual-product-button span,
.manual-option-button span {
  font-size: 11px;
  font-weight: 800;
  color: #bfdbfe;
}
.manual-option-button.selected {
  outline: 2px solid rgba(255, 255, 255, 0.28);
}
.manual-option-button.soldout {
  opacity: 0.5;
  cursor: not-allowed;
}
.manual-cart-row {
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}
.manual-cart-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.manual-cart-actions button,
.quantity-controller button {
  height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: #fff;
  color: #111827;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.quantity-controller {
  display: flex;
  align-items: center;
  gap: 8px;
}
.quantity-controller span,
.manual-cart-actions span {
  min-width: 18px;
  text-align: center;
  font-size: 13px;
  font-weight: 800;
}
.compact {
  min-height: 120px;
}

.recipe-modal {
  max-width: 840px;
}

.modal-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-preview-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: none;
  color: #fff;
  text-align: left;
  cursor: pointer;
}

.modal-preview-row:focus-visible,
.recipe-view-button:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.5);
  outline-offset: 2px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1280px) {
  .table-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .recipe-layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 1100px) {
  .manual-add-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .table-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .tablet-admin-view {
    padding: 12px;
  }

  .tablet-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-summary {
    width: 100%;
  }

  .table-grid {
    grid-template-columns: 1fr;
  }

  .tab-panel,
  .recipe-layout,
  .recipe-menu-panel,
  .recipe-card,
  .manual-add-layout,
  .manual-product-panel,
  .manual-cart-panel {
    min-width: 0;
  }

  .list-card-head,
  .list-card-bottom,
  .table-order-head,
  .order-item-row,
  .modal-info-row,
  .manual-option-group-head,
  .manual-option-footer,
  .manual-cart-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .order-item-right {
    justify-items: stretch;
  }

  .action-row button,
  .modal-action-grid button,
  .confirm-button,
  .quick-button,
  .send-button,
  .recipe-view-button {
    width: 100%;
  }

  .modal-overlay {
    align-items: flex-end;
    padding: 10px;
  }

  .modal-card {
    max-height: 92vh;
    border-radius: 22px;
    padding: 18px;
  }

  .modal-head {
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 18px;
  }

  .modal-head > div:first-child {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .modal-head-actions {
    width: 100%;
    justify-content: space-between;
  }

  .close-button {
    flex-shrink: 0;
  }

  .modal-section {
    margin-bottom: 18px;
  }

  .modal-section h4,
  .manual-cart-panel h4 {
    margin-bottom: 12px;
  }

  .modal-info-row,
  .modal-preview-row {
    gap: 8px;
    padding: 12px;
  }

  .modal-info-row + .modal-info-row,
  .modal-preview-row + .modal-preview-row,
  .manual-cart-row + .manual-cart-row,
  .manual-option-group + .manual-option-group {
    margin-top: 10px;
  }

  .modal-action-grid,
  .payment-method-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .manual-add-layout {
    gap: 14px;
  }

  .manual-product-panel,
  .manual-cart-panel,
  .manual-option-group {
    padding: 14px;
  }

  .manual-search-box,
  .recipe-search-box {
    margin-bottom: 10px;
  }

  .manual-custom-product {
    padding: 12px;
  }

  .manual-custom-product-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .manual-custom-product-form {
    grid-template-columns: 1fr;
  }

  .order-sheet-tag-input-row {
    grid-template-columns: 1fr;
  }

  .manual-product-list,
  .manual-cart-list,
  .manual-option-button-list,
  .recipe-menu-list,
  .recipe-content {
    gap: 12px;
  }

  .manual-product-button,
  .manual-option-button,
  .recipe-menu-button {
    padding: 14px;
  }

  .manual-cart-row {
    padding: 14px;
  }

  .manual-cart-body {
    display: grid;
    gap: 8px;
  }

  .manual-cart-actions {
    gap: 8px;
    margin-top: 12px;
  }

  .manual-cart-footer,
  .manual-option-footer {
    gap: 12px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid rgba(246, 198, 106, 0.18);
  }

  .section-title-row {
    align-items: stretch;
    flex-direction: column;
  }

  .section-action-row {
    justify-content: stretch;
  }

  .section-action-row .quick-button,
  .payment-edit-row .quick-button,
  .danger-small-button {
    width: 100%;
  }

  .payment-edit-row.discount-row,
  .payment-edit-row.split-row,
  .payment-balance-box {
    grid-template-columns: 1fr;
  }

  .manual-cart-total,
  .manual-option-total {
    display: grid;
    gap: 4px;
  }

  .manual-option-group-head {
    gap: 10px;
    margin-bottom: 12px;
  }

  .option-error-box {
    margin-top: 12px;
    margin-bottom: 12px;
  }

  .quantity-controller {
    justify-content: center;
  }

  .recipe-menu-button,
  .manual-product-button,
  .manual-option-button {
    align-items: stretch;
    flex-direction: column;
  }

  .recipe-menu-button-left,
  .manual-product-button-left,
  .manual-option-button-left {
    min-width: 0;
  }

  .recipe-menu-button-left strong,
  .manual-product-button strong,
  .manual-option-button strong {
    overflow-wrap: anywhere;
  }

  .recipe-badge {
    align-self: flex-start;
    max-width: 100%;
    text-align: left;
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-chat-button {
  height: 48px;
  padding: 0 18px;
  border: none;
  border-radius: 14px;
  background: rgba(96, 165, 250, 0.2);
  color: #dbeafe;
  font-size: 14px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.header-chat-button.alerting {
  background: rgba(251, 191, 36, 0.24);
  color: #fde68a;
}
.header-chat-badge {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: #f97316;
  color: #1f2937;
  font-size: 12px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.chat-modal {
  max-width: 900px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}
.chat-room-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.chat-room-chip {
  flex: 0 0 auto;
  height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.chat-room-chip.active {
  border-color: rgba(96, 165, 250, 0.6);
  background: rgba(96, 165, 250, 0.22);
  color: #fff;
}
.chat-room-chip.alerting {
  border-color: rgba(251, 191, 36, 0.65);
  color: #fde68a;
}
.chat-room-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #f97316;
  color: #1f2937;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.chat-thread {
  flex: 1 1 auto;
  min-height: 280px;
  max-height: 46vh;
  padding: 14px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.6);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat-empty {
  margin: auto;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}
.chat-row {
  max-width: 78%;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
}
.chat-row.mine {
  margin-left: auto;
  background: rgba(96, 165, 250, 0.18);
}
.chat-row.alarm {
  background: rgba(251, 191, 36, 0.22);
  box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.5);
}
.chat-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}
.chat-row-head strong {
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
}
.chat-row-head span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}
.chat-row-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.chat-compose {
  display: grid;
  gap: 10px;
}
.chat-quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chat-quick-button {
  height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.chat-quick-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.chat-input-row {
  display: flex;
  gap: 10px;
}
.chat-input-row input {
  flex: 1 1 auto;
  min-width: 0;
  height: 44px;
  padding: 0 14px;
  border: none;
  outline: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
}
.chat-input-row input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}
.chat-input-row .confirm-button {
  width: auto;
  min-width: 96px;
  padding: 0 18px;
}
.chat-feedback {
  margin: 0;
  font-size: 12px;
  color: #86efac;
}
</style>
