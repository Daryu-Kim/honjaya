<template>
  <div class="tablet-admin-view">
    <header class="tablet-header">
      <div class="header-left">
        <p class="eyebrow">TABLET ADMIN</p>
        <h1>매장 운영 패널</h1>
      </div>

      <div class="header-right">
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
            :class="[
              table.status === 'PAYMENT_REQUESTED' ? 'payment-requested' : '',
              table.paymentStatus === 'COMPLETED' ? 'paid' : '',
            ]"
            @click="selectTable(table)"
          >
            <div class="table-card-top">
              <strong>{{ table.tableLabel }}</strong>
              <span class="status-badge">
                {{ convertOrderSheetStatusText(table.status) }}
              </span>
            </div>

            <div class="table-card-middle">
              <p class="table-location">{{ table.locationLabel }}</p>
              <p class="table-amount">{{ formatPrice(table.totalAmount) }}원</p>
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

        <div v-else-if="orderList.length === 0" class="empty-box">
          <p>주문이 없어요.</p>
        </div>

        <div v-else class="list-card-wrap">
          <article v-for="order in orderList" :key="order.id" class="list-card">
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
                  {{ formatPrice(item.totalPrice || 0) }}원
                </div>
              </div>
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
                  @click="updateOrderStatus(order, 'PREPARING')"
                >
                  준비중
                </button>
                <button
                  type="button"
                  @click="updateOrderStatus(order, 'SERVED')"
                >
                  제공완료
                </button>
                <button
                  type="button"
                  class="danger"
                  @click="updateOrderStatus(order, 'CANCELLED')"
                >
                  취소
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <!-- 결제 탭 -->
      <div v-else-if="activeTab === 'payments'" class="tab-panel">
        <div class="panel-head">
          <h2>결제 관리</h2>
          <p>결제 요청 승인 및 직접 결제 처리를 할 수 있어요.</p>
        </div>

        <div v-if="isLoadingPaymentRequests" class="empty-box">
          <p>결제 요청을 불러오는 중이에요.</p>
        </div>

        <div v-else-if="paymentRequestList.length === 0" class="empty-box">
          <p>결제 요청이 없어요.</p>
        </div>

        <div v-else class="list-card-wrap">
          <article
            v-for="request in paymentRequestList"
            :key="request.id"
            class="list-card"
          >
            <div class="list-card-head">
              <div>
                <strong>{{
                  request.displayName || `No.${request.tableNumber}`
                }}</strong>
                <p>{{ request.orderSheetId }}</p>
              </div>
              <span class="status-badge">
                {{ convertPaymentRequestStatusText(request.status) }}
              </span>
            </div>

            <div class="list-card-bottom">
              <strong
                >{{ getOrderSheetTotalAmount(request.orderSheetId) }}원</strong
              >

              <div class="action-row">
                <button type="button" @click="openPaymentModal(request)">
                  결제 처리
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <!-- 채팅 탭 -->
      <div v-else-if="activeTab === 'chat'" class="tab-panel">
        <div class="panel-head">
          <h2>전체 채팅</h2>
          <p>테이블과 직원이 함께 보는 채팅입니다.</p>
        </div>

        <div v-if="isLoadingMessages" class="empty-box">
          <p>채팅을 불러오는 중이에요.</p>
        </div>

        <div v-else class="chat-panel">
          <div class="chat-message-list">
            <div
              v-for="message in chatMessageList"
              :key="message.id"
              class="chat-message-row"
              :class="String(message.messageType || '').toLowerCase()"
            >
              <div class="chat-meta">
                <strong>{{
                  message.displayName || message.senderLabel || "시스템"
                }}</strong>
                <span>{{ formatDateTime(message.createdAt) }}</span>
              </div>
              <p>{{ message.message }}</p>
            </div>
          </div>

          <div class="chat-input-row">
            <textarea
              v-model.trim="adminMessageText"
              placeholder="직원 메시지를 입력해주세요"
            ></textarea>
            <button type="button" @click="sendAdminMessage">전송</button>
          </div>
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

            <div class="recipe-menu-list">
              <button
                v-for="product in filteredRecipeProductList"
                :key="product.id"
                type="button"
                class="recipe-menu-button"
                :class="{
                  active: selectedRecipeProduct?.id === product.id,
                  empty: !product.recipeInfo && !product.recipeText,
                }"
                @click="selectedRecipeProduct = product"
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

          <div class="recipe-viewer">
            <div v-if="!selectedRecipeProduct" class="empty-box">
              <p>메뉴를 선택해주세요.</p>
            </div>

            <div v-else class="recipe-card">
              <div class="recipe-card-head">
                <div>
                  <h3>{{ selectedRecipeData?.productName }}</h3>
                  <p v-if="selectedRecipeData?.description">
                    {{ selectedRecipeData.description }}
                  </p>
                </div>

                <span class="status-badge">
                  {{
                    selectedRecipeData?.hasStructuredRecipe ||
                    selectedRecipeData?.recipeText
                      ? "확인 가능"
                      : "미등록"
                  }}
                </span>
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
                      v-for="(
                        ingredient, index
                      ) in selectedRecipeData.ingredients"
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
                  v-if="
                    !selectedRecipeData?.hasStructuredRecipe &&
                    selectedRecipeData?.recipeText
                  "
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
          </div>

          <div class="modal-section">
            <h4>최근 주문</h4>
            <div
              v-if="selectedTable.latestOrderItemsPreview?.length > 0"
              class="modal-preview-list"
            >
              <div
                v-for="(
                  preview, index
                ) in selectedTable.latestOrderItemsPreview"
                :key="`${selectedTable.tableNumber}-${index}`"
                class="modal-preview-row"
              >
                <span>{{ preview.productName }}</span>
                <span>{{ preview.quantity }}개</span>
              </div>
            </div>
            <p v-else class="modal-empty-text">주문 내역이 없어요.</p>
          </div>

          <div class="modal-action-grid">
            <button type="button" @click="openManualAddModal(selectedTable)">
              상품 임의 추가
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
              <h3>
                {{
                  paymentModalState.mode === "REQUEST"
                    ? "결제 요청 승인"
                    : "직접 결제 처리"
                }}
              </h3>
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
              <span>총 금액</span>
              <strong>{{ formatPrice(paymentModalState.amount) }}원</strong>
            </div>
          </div>

          <div class="modal-section">
            <h4>결제 수단 선택</h4>

            <div class="payment-method-grid">
              <button
                type="button"
                class="payment-method-button"
                :class="{ active: paymentModalState.paymentMethod === 'CARD' }"
                @click="paymentModalState.paymentMethod = 'CARD'"
              >
                카드
              </button>

              <button
                type="button"
                class="payment-method-button"
                :class="{ active: paymentModalState.paymentMethod === 'BANK' }"
                @click="paymentModalState.paymentMethod = 'BANK'"
              >
                계좌이체
              </button>

              <button
                type="button"
                class="payment-method-button"
                :class="{ active: paymentModalState.paymentMethod === 'CASH' }"
                @click="paymentModalState.paymentMethod = 'CASH'"
              >
                현금
              </button>
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
              <span>결제 금액</span>
              <strong
                >{{ formatPrice(paymentCompleteModalState.amount) }}원</strong
              >
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
              <div class="manual-search-box">
                <input
                  v-model.trim="manualAddModalState.keyword"
                  type="text"
                  placeholder="상품명을 검색해주세요"
                />
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
                    <p>{{ formatPrice(product.basePrice || 0) }}원</p>
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
                      {{ formatPrice(item.unitPrice || 0) }}원 ×
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
              <span>기본 가격</span>
              <strong>
                {{
                  formatPrice(manualOptionModalState.product?.basePrice || 0)
                }}원
              </strong>
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
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  completeOrderSheetPayment,
  finalizeOrderSheetCleanup,
} from "@/lib/orderSheet";
import { recalculateOrderSheetTotals } from "@/lib/orderSheetTotals";

const activeTab = ref("tables");
const adminMessageText = ref("");

const selectedTable = ref(null);
const selectedRecipeProduct = ref(null);

const paymentModalState = ref({
  isOpen: false,
  requestId: "",
  orderSheetId: "",
  tableNumber: "",
  displayName: "",
  paymentMethod: "CARD",
  amount: 0,
  mode: "",
});

const paymentCompleteModalState = ref({
  isOpen: false,
  displayName: "",
  paymentMethod: "",
  amount: 0,
});

const manualAddModalState = ref({
  isOpen: false,
  orderSheetId: "",
  tableNumber: "",
  displayName: "",
  cartItems: [],
  keyword: "",
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
  { key: "payments", label: "결제" },
  { key: "chat", label: "채팅" },
  { key: "recipes", label: "레시피" },
];

const isLoadingOrderSheets = ref(true);
const isLoadingOrders = ref(true);
const isLoadingPaymentRequests = ref(true);
const isLoadingMessages = ref(true);
const isLoadingProducts = ref(true);

const orderSheetList = ref([]);
const orderList = ref([]);
const paymentRequestList = ref([]);
const chatMessageList = ref([]);
const productList = ref([]);

const orderSoundSrc = "/audio/order-request.mp3"; // 나중에 경로 수정 가능
const paymentSoundSrc = "/audio/payment-request.mp3"; // 나중에 경로 수정 가능

let previousOrderIds = new Set();
let previousPaymentRequestIds = new Set();

let unsubscribeOrderSheets = null;
let unsubscribeOrders = null;
let unsubscribePayments = null;
let unsubscribeMessages = null;
let unsubscribeProducts = null;

const recipeKeyword = ref("");

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
      const aTime =
        typeof a.updatedAt?.toDate === "function"
          ? a.updatedAt.toDate().getTime()
          : 0;
      const bTime =
        typeof b.updatedAt?.toDate === "function"
          ? b.updatedAt.toDate().getTime()
          : 0;
      return bTime - aTime;
    })
    .forEach((item) => {
      const key = String(item.tableNumber || "");
      if (!latestMap.has(key)) {
        latestMap.set(key, item);
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

const filteredRecipeProductList = computed(() => {
  const keyword = String(recipeKeyword.value || "")
    .trim()
    .toLowerCase();

  return recipeProductList.value.filter((item) => {
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

const selectedRecipeData = computed(() => {
  if (!selectedRecipeProduct.value) return null;

  const product = selectedRecipeProduct.value;
  const recipeInfo = product.recipeInfo || null;

  const hasStructuredRecipe =
    recipeInfo &&
    (String(recipeInfo.description || "").trim() ||
      (Array.isArray(recipeInfo.ingredients) &&
        recipeInfo.ingredients.length > 0) ||
      (Array.isArray(recipeInfo.steps) && recipeInfo.steps.length > 0) ||
      (Array.isArray(recipeInfo.tips) && recipeInfo.tips.length > 0));

  return {
    productName: product.productName || "",
    description: String(recipeInfo?.description || "").trim(),
    ingredients: Array.isArray(recipeInfo?.ingredients)
      ? recipeInfo.ingredients
      : [],
    steps: Array.isArray(recipeInfo?.steps) ? recipeInfo.steps : [],
    tips: Array.isArray(recipeInfo?.tips) ? recipeInfo.tips : [],
    recipeText: String(product.recipeText || "").trim(),
    hasStructuredRecipe,
  };
});

const manualFilteredProductList = computed(() => {
  const keyword = String(manualAddModalState.value.keyword || "")
    .trim()
    .toLowerCase();

  return [...productList.value]
    .filter((item) => {
      if (item.isActive === false) return false;
      if (item.isDeleted === true) return false;
      if (item.isSoldOut === true) return false;
      if (Number(item.stock ?? 0) <= 0) return false;

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
    (acc, item) => acc + Number(item.totalPrice || 0),
    0
  );
});

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

const manualOptionUnitPrice = computed(() => {
  if (!manualOptionModalState.value.product) return 0;

  const additional = manualSelectedOptionsFlat.value.reduce(
    (acc, item) => acc + Number(item.additionalPrice || 0),
    0
  );

  return (
    Number(manualOptionModalState.value.product.basePrice || 0) + additional
  );
});

const manualOptionTotalPrice = computed(() => {
  return (
    manualOptionUnitPrice.value *
    Number(manualOptionModalState.value.quantity || 1)
  );
});

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatDateTime(value) {
  if (!value) return "";
  const date =
    typeof value?.toDate === "function" ? value.toDate() : new Date(value);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}.${day} ${hours}:${minutes}`;
}

function convertOrderSheetStatusText(status) {
  if (status === "OPEN") return "이용중";
  if (status === "PAYMENT_REQUESTED") return "결제요청";
  if (status === "PAID") return "결제완료";
  if (status === "CLOSED") return "마감";
  return status || "알 수 없음";
}

function convertOrderStatusText(status) {
  if (status === "REQUESTED") return "주문접수";
  if (status === "PREPARING") return "준비중";
  if (status === "SERVED") return "제공완료";
  if (status === "CANCELLED") return "취소";
  return status || "알 수 없음";
}

function convertPaymentRequestStatusText(status) {
  if (status === "REQUESTED") return "요청됨";
  if (status === "CONFIRMED") return "확인됨";
  if (status === "DONE") return "결제완료";
  if (status === "CANCELLED") return "취소됨";
  return status || "알 수 없음";
}

function convertPaymentStatusText(status) {
  if (status === "UNPAID") return "미결제";
  if (status === "REQUESTED") return "결제요청";
  if (status === "COMPLETED") return "결제완료";
  return status || "알 수 없음";
}

function convertPaymentMethodText(method) {
  if (method === "CARD") return "카드";
  if (method === "BANK") return "계좌이체";
  if (method === "CASH") return "현금";
  return method || "-";
}

function getHiddenPreviewCount(table) {
  const previewLength = Array.isArray(table.latestOrderItemsPreview)
    ? table.latestOrderItemsPreview.length
    : 0;

  return previewLength > 5 ? previewLength - 5 : 0;
}

function getOrderSheetTotalAmount(orderSheetId) {
  const found = orderSheetList.value.find(
    (item) => item.orderSheetId === orderSheetId
  );
  return formatPrice(found?.totalAmount || 0);
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
  const q = query(collection(db, "orderSheets"), orderBy("updatedAt", "desc"));
  unsubscribeOrderSheets = onSnapshot(
    q,
    (snapshot) => {
      orderSheetList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingOrderSheets.value = false;
    },
    (error) => {
      console.error("주문서 구독 실패:", error);
      isLoadingOrderSheets.value = false;
    }
  );
}

function playNotificationSound(type) {
  try {
    const soundSrc = type === "payment" ? paymentSoundSrc : orderSoundSrc;
    const audio = new Audio(soundSrc);
    audio.preload = "auto";
    audio.play().catch((error) => {
      console.warn("소리 재생 차단됨:", error);
    });
  } catch (error) {
    console.error("알림음 재생 실패:", error);
  }
}

function subscribeOrders() {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  unsubscribeOrders = onSnapshot(
    q,
    (snapshot) => {
      const currentOrders = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
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
      isLoadingOrders.value = false;
    },
    (error) => {
      console.error("주문 구독 실패:", error);
      isLoadingOrders.value = false;
    }
  );
}

function subscribePaymentRequests() {
  const q = query(
    collection(db, "checkoutRequests"),
    where("status", "in", ["REQUESTED", "CONFIRMED"]),
    orderBy("createdAt", "desc")
  );
  unsubscribePayments = onSnapshot(
    q,
    (snapshot) => {
      const currentRequests = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      const currentRequestIds = new Set(currentRequests.map((item) => item.id));

      if (!isLoadingPaymentRequests.value) {
        for (const id of currentRequestIds) {
          if (!previousPaymentRequestIds.has(id)) {
            playNotificationSound("payment");
            break;
          }
        }
      }

      previousPaymentRequestIds = currentRequestIds;
      paymentRequestList.value = currentRequests;
      isLoadingPaymentRequests.value = false;
    },
    (error) => {
      console.error("결제 요청 구독 실패:", error);
      isLoadingPaymentRequests.value = false;
    }
  );
}

function subscribeMessages() {
  const q = query(collection(db, "chatMessages"), orderBy("createdAt", "desc"));
  unsubscribeMessages = onSnapshot(
    q,
    (snapshot) => {
      chatMessageList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingMessages.value = false;
    },
    (error) => {
      console.error("채팅 구독 실패:", error);
      isLoadingMessages.value = false;
    }
  );
}

function subscribeProducts() {
  const q = query(collection(db, "products"), orderBy("sortOrder", "asc"));
  unsubscribeProducts = onSnapshot(
    q,
    (snapshot) => {
      productList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      isLoadingProducts.value = false;
    },
    (error) => {
      console.error("상품 구독 실패:", error);
      isLoadingProducts.value = false;
    }
  );
}

function selectTable(table) {
  selectedTable.value = table;
}

function closeTableModal() {
  selectedTable.value = null;
}

function openManualAddModal(table) {
  manualAddModalState.value = {
    isOpen: true,
    orderSheetId: table.orderSheetId || "",
    tableNumber: String(table.tableNumber || ""),
    displayName: table.displayName || `No.${table.tableNumber}`,
    cartItems: [],
    keyword: "",
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
    unitPrice: Number(product.basePrice || 0),
    totalPrice: Number(product.basePrice || 0),
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

  try {
    const orderItems = state.cartItems.map((item) => ({
      orderSheetId: state.orderSheetId,
      tableNumber: state.tableNumber,
      displayName: state.displayName,
      productId: item.productId,
      productName: item.productName,
      basePrice: Number(item.basePrice || 0),
      unitPrice: Number(item.unitPrice || 0),
      totalPrice: Number(item.totalPrice || 0),
      quantity: Number(item.quantity || 0),
      imageUrl: item.imageUrl || "",
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

    const totalPrice = state.cartItems.reduce(
      (acc, item) => acc + Number(item.totalPrice || 0),
      0
    );

    await addDoc(collection(db, "orders"), {
      orderSheetId: state.orderSheetId,
      tableNumber: state.tableNumber,
      displayName: state.displayName,
      requestMessage: "[직원 수동 추가]",
      items: orderItems,
      totalCount,
      totalPrice,
      status: "SERVED",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await recalculateOrderSheetTotals(state.orderSheetId);

    closeManualAddModal();
    closeTableModal();
    alert("상품이 테이블에 추가되었어요.");
  } catch (error) {
    console.error("수동 상품 추가 실패:", error);
    alert("수동 상품 추가 중 문제가 발생했어요.");
  }
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
  paymentModalState.value = {
    isOpen: true,
    requestId: "",
    orderSheetId: table.orderSheetId || "",
    tableNumber: table.tableNumber || "",
    displayName: table.displayName || `No.${table.tableNumber}`,
    paymentMethod: "CARD",
    amount: Number(table.totalAmount || 0),
    mode: "DIRECT",
  };
}

function openPaymentModal(request) {
  paymentModalState.value = {
    isOpen: true,
    requestId: request.id,
    orderSheetId: request.orderSheetId,
    tableNumber: request.tableNumber,
    displayName: request.displayName || `No.${request.tableNumber}`,
    paymentMethod: "CARD",
    amount: Number(
      orderSheetList.value.find(
        (item) => item.orderSheetId === request.orderSheetId
      )?.totalAmount || 0
    ),
    mode: "REQUEST",
  };
}

function closePaymentModal() {
  paymentModalState.value = {
    isOpen: false,
    requestId: "",
    orderSheetId: "",
    tableNumber: "",
    displayName: "",
    paymentMethod: "CARD",
    amount: 0,
    mode: "",
  };
}

function closePaymentCompleteModal() {
  paymentCompleteModalState.value = {
    isOpen: false,
    displayName: "",
    paymentMethod: "",
    amount: 0,
  };
}

async function completePayment() {
  const state = paymentModalState.value;
  if (!state.orderSheetId) return;

  try {
    if (state.requestId) {
      await updateDoc(doc(db, "checkoutRequests", state.requestId), {
        status: "DONE",
        paymentMethod: state.paymentMethod,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await recalculateOrderSheetTotals(state.orderSheetId);

    await completeOrderSheetPayment({
      orderSheetId: state.orderSheetId,
      tableNumber: state.tableNumber,
      paymentMethod: state.paymentMethod,
    });

    paymentCompleteModalState.value = {
      isOpen: true,
      displayName: state.displayName,
      paymentMethod: state.paymentMethod,
      amount: Number(state.amount || 0),
    };

    closePaymentModal();
    closeTableModal();
  } catch (error) {
    console.error("결제 완료 처리 실패:", error);
    alert("결제 완료 처리 중 문제가 발생했어요.");
  }
}

async function updateOrderStatus(order, nextStatus) {
  try {
    await updateDoc(doc(db, "orders", order.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });

    await recalculateOrderSheetTotals(order.orderSheetId);
  } catch (error) {
    console.error("주문 상태 변경 실패:", error);
    alert("주문 상태 변경 중 문제가 발생했어요.");
  }
}

async function sendAdminMessage() {
  const safeMessage = adminMessageText.value.trim().slice(0, 500);
  if (!safeMessage) return;

  try {
    await addDoc(collection(db, "chatMessages"), {
      orderSheetId: "",
      tableNumber: "",
      displayName: "직원",
      senderLabel: "직원",
      message: safeMessage,
      messageType: "ADMIN",
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    adminMessageText.value = "";
  } catch (error) {
    console.error("직원 메시지 전송 실패:", error);
    alert("직원 메시지 전송 중 문제가 발생했어요.");
  }
}

async function finalizeTableCleanup(table) {
  const confirmed = window.confirm(
    `${table.tableLabel} 테이블 정리를 완료할까요?`
  );

  if (!confirmed) return;

  try {
    await finalizeOrderSheetCleanup({
      orderSheetId: table.orderSheetId,
    });

    closeTableModal();
    alert("테이블 정리가 완료되었어요.");
  } catch (error) {
    console.error("테이블 정리 완료 처리 실패:", error);
    alert("테이블 정리 완료 처리 중 문제가 발생했어요.");
  }
}

onMounted(() => {
  subscribeOrderSheets();
  subscribeOrders();
  subscribePaymentRequests();
  subscribeMessages();
  subscribeProducts();
});

onUnmounted(() => {
  if (unsubscribeOrderSheets) unsubscribeOrderSheets();
  if (unsubscribeOrders) unsubscribeOrders();
  if (unsubscribePayments) unsubscribePayments();
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeProducts) unsubscribeProducts();
});
</script>

<style scoped lang="scss">
.tablet-admin-view {
  min-height: 100vh;
  padding: 20px;
  background: #0f172a;
  color: #fff;
}
.tablet-header,
.table-card-top,
.list-card-head,
.modal-head,
.list-card-bottom,
.chat-meta,
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
}
.tab-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
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
.empty-box,
.list-card,
.chat-panel,
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
.table-card.payment-requested {
  outline: 2px solid rgba(250, 204, 21, 0.35);
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
.table-card-bottom {
  margin-top: auto;
}
.table-preview-list,
.order-item-list,
.list-card-wrap,
.recipe-menu-list,
.manual-product-list,
.manual-cart-list,
.manual-option-button-list {
  display: grid;
  gap: 10px;
}
.table-preview-list span {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.76);
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
.chat-panel {
  padding: 16px;
  display: grid;
  gap: 14px;
}
.chat-message-list {
  max-height: 520px;
  overflow-y: auto;
  display: grid;
  gap: 10px;
}
.chat-message-row {
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
}
.chat-message-row.user {
  background: rgba(96, 165, 250, 0.12);
}
.chat-message-row.admin {
  background: rgba(52, 211, 153, 0.12);
}
.chat-message-row p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.chat-input-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}
.chat-input-row textarea,
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
.recipe-layout,
.manual-add-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
}
.recipe-card,
.manual-product-panel,
.manual-cart-panel,
.manual-option-group {
  min-height: 320px;
  padding: 18px;
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
  background: rgba(2, 6, 23, 0.62);
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
}
.table-detail-modal {
  max-width: 640px;
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
.payment-complete-modal {
  max-width: 480px;
  text-align: center;
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
  font-size: 11px;
  font-weight: 800;
  color: #bfdbfe;
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
</style>
