<template>
  <router-view v-slot="{ Component, route }">
    <transition name="page" mode="out-in">
      <component :is="Component" :key="route.fullPath" />
    </transition>
  </router-view>

  <transition name="global-busy-fade">
    <div
      v-if="isGlobalBusy"
      class="global-busy-overlay"
      role="status"
      aria-live="polite"
    >
      <div class="global-busy-card">
        <div class="global-busy-spinner"></div>
        <strong>{{ globalBusyMessage }}</strong>
      </div>
    </div>
  </transition>

  <ChatAlertHost />
</template>

<script setup>
import { onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import ChatAlertHost from "@/components/ChatAlertHost.vue";
import { startChatAlerts, stopChatAlerts } from "@/lib/chatAlerts";
import { ensureChatMessagesClearedForToday } from "@/lib/chat";
import { ensureHeartsClearedForToday } from "@/lib/hearts";
import { globalBusyMessage, isGlobalBusy } from "@/lib/globalBusy";

const CHAT_PURGE_CHECK_MS = 10 * 60 * 1000;

let chatPurgeTimer = null;

// 영업일(KST 15:00)이 바뀌면 지난 채팅을 비웁니다. 앱을 계속 켜 둔 기기에서도
// 하루가 지나면 정리되도록 주기적으로 확인합니다.
function runChatPurge() {
  ensureChatMessagesClearedForToday().catch((error) => {
    console.error("[chat] 채팅 정리 확인 실패", error);
  });

  ensureHeartsClearedForToday().catch((error) => {
    console.error("[hearts] 하트 정리 확인 실패", error);
  });
}

const route = useRoute();

function isCustomerPath(path) {
  return path === "/" || path.startsWith("/user");
}

// Customer pages keep the chat subscription alive so new global/1:1 messages
// still raise a toast while the customer is ordering.
watch(
  () => route.path,
  (path) => {
    if (isCustomerPath(path)) {
      startChatAlerts();
      return;
    }

    stopChatAlerts();
  },
  { immediate: true }
);

function blockEventWhileBusy(event) {
  if (!isGlobalBusy.value) return;
  if (event.target?.closest?.(".global-busy-overlay")) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

onMounted(() => {
  [
    "click",
    "dblclick",
    "pointerdown",
    "touchstart",
    "submit",
    "keydown",
  ].forEach((eventName) => {
    window.addEventListener(eventName, blockEventWhileBusy, true);
  });

  runChatPurge();
  chatPurgeTimer = setInterval(runChatPurge, CHAT_PURGE_CHECK_MS);
});

onUnmounted(() => {
  [
    "click",
    "dblclick",
    "pointerdown",
    "touchstart",
    "submit",
    "keydown",
  ].forEach((eventName) => {
    window.removeEventListener(eventName, blockEventWhileBusy, true);
  });

  if (chatPurgeTimer) {
    clearInterval(chatPurgeTimer);
    chatPurgeTimer = null;
  }

  stopChatAlerts();
});
</script>

<style lang="scss">
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: "Avenir", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.global-busy-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 5, 10, 0.7);
  backdrop-filter: blur(6px);
  cursor: wait;
}

.global-busy-card {
  min-width: 180px;
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: 22px 24px;
  border: 1px solid rgba(246, 198, 106, 0.34);
  border-radius: 18px;
  background: rgba(21, 15, 24, 0.92);
  color: #fff7df;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
}

.global-busy-card strong {
  font-size: 14px;
  font-weight: 800;
}

.global-busy-spinner {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 4px solid rgba(246, 198, 106, 0.2);
  border-top-color: #f6c66a;
  animation: global-busy-spin 0.8s linear infinite;
}

.global-busy-fade-enter-active,
.global-busy-fade-leave-active {
  transition: opacity 0.16s ease;
}

.global-busy-fade-enter-from,
.global-busy-fade-leave-to {
  opacity: 0;
}

@keyframes global-busy-spin {
  to {
    transform: rotate(360deg);
  }
}

:root {
  --user-ink: #150f18;
  --user-ink-2: #241629;
  --user-wine: #5a1836;
  --user-forest: #163b2b;
  --user-parchment: #f5e4bc;
  --user-parchment-deep: #d2a85b;
  --user-brass: #c8953d;
  --user-ember: #f6c66a;
  --user-text: #fff7df;
  --user-muted: rgba(255, 247, 223, 0.72);
  --user-line: rgba(246, 198, 106, 0.26);
  --user-card: rgba(32, 20, 30, 0.82);
}

#app
  :is(
    .user-main-view,
    .user-order-view,
    .user-cart-view,
    .user-order-history-view,
    .user-order-complete-view
  ) {
  min-height: 100dvh;
  background: radial-gradient(
      circle at 18% 0%,
      rgba(200, 149, 61, 0.2),
      transparent 30%
    ),
    radial-gradient(circle at 88% 10%, rgba(90, 24, 54, 0.32), transparent 34%),
    linear-gradient(160deg, #130d18 0%, #211425 46%, #0f211b 100%);
  color: var(--user-text);
  font-family: Georgia, "Times New Roman", "Apple SD Gothic Neo", serif;
  text-align: left;
}

#app
  :is(
    .main-container,
    .order-container,
    .cart-container,
    .order-history-container,
    .complete-container
  ) {
  position: relative;
  isolation: isolate;
}

#app
  :is(
    .main-container,
    .order-container,
    .cart-container,
    .order-history-container,
    .complete-container
  )::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: linear-gradient(
      rgba(245, 228, 188, 0.035) 1px,
      transparent 1px
    ),
    linear-gradient(90deg, rgba(245, 228, 188, 0.025) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: linear-gradient(to bottom, #000, transparent 82%);
}

#app :is(.header-title h1, .complete-card h1) {
  color: var(--user-text);
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: 0;
  text-shadow: 0 2px 18px rgba(246, 198, 106, 0.22);
}

#app :is(.eyebrow, .desktop-eyebrow) {
  color: var(--user-ember) !important;
  font-family: Avenir, "Helvetica Neue", Arial, sans-serif;
}

#app
  :is(
    .desktop-card,
    .session-card,
    .menu-card,
    .external-link-button,
    .empty-box,
    .product-card,
    .cart-card,
    .request-card,
    .status-card,
    .order-summary-card,
    .total-info-card,
    .order-card,
    .complete-card,
    .info-box,
    .summary-box,
    .request-box,
    .bottom-card,
    .sheet-price-box,
    .option-group-box,
    .option-error-box,
    .sheet-bottom
  ) {
  border: 1px solid var(--user-line);
  background: linear-gradient(
      145deg,
      rgba(255, 247, 223, 0.08),
      transparent 38%
    ),
    var(--user-card);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 247, 223, 0.12);
  color: var(--user-text);
}

#app :is(.session-row span, .menu-text p, .product-description, .description) {
  color: var(--user-muted) !important;
}

#app :is(.session-row strong, .product-price, .summary-text strong) {
  color: var(--user-parchment);
}

#app :is(.back-button, .sheet-close-button) {
  border: 1px solid rgba(246, 198, 106, 0.3);
  background: rgba(21, 15, 24, 0.72);
  color: var(--user-ember);
  box-shadow: inset 0 1px 0 rgba(255, 247, 223, 0.1);
}

#app
  :is(
    .add-button,
    .cart-button,
    .sheet-submit-button,
    .submit-button,
    .request-button,
    .empty-button,
    .primary-button
  ) {
  border: 1px solid rgba(255, 247, 223, 0.32);
  background: linear-gradient(135deg, #f5d58a 0%, #c8953d 54%, #8b5a22 100%);
  color: #1b1115;
  box-shadow: 0 10px 24px rgba(200, 149, 61, 0.24);
}

#app :is(.secondary-button, .cancel-button, .delete-button, .soldout-button) {
  border: 1px solid rgba(246, 198, 106, 0.24);
  background: rgba(90, 24, 54, 0.55);
  color: var(--user-parchment);
}

#app :is(.search-box input, .request-card textarea) {
  border: 1px solid rgba(246, 198, 106, 0.22);
  background: rgba(245, 228, 188, 0.12);
  color: var(--user-text);
}

#app :is(.search-box input, .request-card textarea)::placeholder {
  color: rgba(255, 247, 223, 0.48);
}

#app .category-chip {
  border: 1px solid rgba(246, 198, 106, 0.2);
  background: rgba(21, 15, 24, 0.64);
  color: var(--user-muted);
}

#app .category-chip.active {
  border-color: rgba(246, 198, 106, 0.8);
  background: linear-gradient(
    135deg,
    rgba(90, 24, 54, 0.92),
    rgba(22, 59, 43, 0.92)
  );
  color: var(--user-parchment);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.26);
}

#app .product-image-wrap,
#app .image-wrap,
#app .menu-icon,
#app .icon-wrap {
  border: 1px solid rgba(246, 198, 106, 0.22);
  background: radial-gradient(
      circle at 50% 20%,
      rgba(246, 198, 106, 0.22),
      transparent 38%
    ),
    rgba(21, 15, 24, 0.62);
}

#app :is(.product-badge, .status-badge, .option-tag, .group-badge) {
  border: 1px solid rgba(246, 198, 106, 0.2);
  background: rgba(245, 228, 188, 0.12);
  color: var(--user-parchment);
}

#app :is(.product-badge.soldout, .status-badge.CANCELLED) {
  background: rgba(90, 24, 54, 0.52);
  color: #ffd1d1;
}

#app .cart-bar {
  background: linear-gradient(
    to top,
    rgba(12, 8, 14, 0.98),
    rgba(12, 8, 14, 0.2)
  );
}

#app .cart-summary,
#app .option-sheet {
  border: 1px solid var(--user-line);
  background: linear-gradient(145deg, rgba(245, 228, 188, 0.1), transparent 36%),
    rgba(24, 15, 22, 0.98);
  color: var(--user-text);
}

#app .option-sheet-overlay {
  background: rgba(8, 5, 10, 0.68);
  backdrop-filter: blur(5px);
}

#app .option-item-button {
  border: 1px solid rgba(246, 198, 106, 0.18);
  background: rgba(245, 228, 188, 0.08);
  color: var(--user-text);
}

#app .option-item-button.selected {
  border-color: rgba(246, 198, 106, 0.78);
  background: rgba(22, 59, 43, 0.7);
}

#app .quantity-controller {
  border: 1px solid rgba(246, 198, 106, 0.24);
  background: rgba(21, 15, 24, 0.62);
}

#app .quantity-controller button {
  color: var(--user-ember);
}

#app :is(.summary-total, .order-card-footer, .summary-footer) {
  border-top-color: rgba(246, 198, 106, 0.2) !important;
}

#app
  :is(
    .item-total,
    .product-total,
    .summary-total strong,
    .summary-total-row strong
  ) {
  color: var(--user-ember);
}

#app :is(.admin-layout, .tablet-admin-view) {
  background: radial-gradient(
      circle at 14% 4%,
      rgba(200, 149, 61, 0.18),
      transparent 28%
    ),
    radial-gradient(circle at 90% 0%, rgba(90, 24, 54, 0.28), transparent 36%),
    linear-gradient(145deg, #100a14 0%, #1c1221 44%, #10231c 100%);
  color: var(--user-text);
  font-family: "Avenir", "Helvetica Neue", "Apple SD Gothic Neo", Arial,
    sans-serif;
}

#app .admin-layout {
  background: radial-gradient(
      circle at 16% 0%,
      rgba(246, 198, 106, 0.15),
      transparent 30%
    ),
    linear-gradient(140deg, #100a14 0%, #1c1221 52%, #0f211b 100%);
}

#app .admin-sidebar {
  border-right: 1px solid var(--user-line);
  background: linear-gradient(
      180deg,
      rgba(245, 228, 188, 0.07),
      rgba(21, 15, 24, 0.28)
    ),
    rgba(13, 8, 15, 0.72);
  box-shadow: inset -1px 0 0 rgba(255, 247, 223, 0.05);
}

#app .admin-topbar {
  border-bottom: 1px solid var(--user-line);
  background: rgba(13, 8, 15, 0.34);
  backdrop-filter: blur(10px);
}

#app :is(.sidebar-eyebrow, .topbar-breadcrumb, .eyebrow) {
  color: var(--user-ember) !important;
}

#app :is(.sidebar-top h1, .topbar-left h2, .page-header h1, .panel-head h2) {
  color: var(--user-text);
  letter-spacing: 0;
  text-shadow: 0 2px 18px rgba(246, 198, 106, 0.14);
}

#app .nav-button {
  border: 1px solid transparent;
  color: var(--user-text);
}

#app .nav-button:hover {
  border-color: rgba(246, 198, 106, 0.18);
  background: rgba(245, 228, 188, 0.08);
}

#app .nav-button.active {
  border-color: rgba(246, 198, 106, 0.72);
  background: linear-gradient(135deg, #f5d58a 0%, #c8953d 54%, #8b5a22 100%);
  color: #1b1115;
  box-shadow: 0 14px 26px rgba(200, 149, 61, 0.18);
}

#app .nav-button.active .nav-button-main span {
  color: rgba(27, 17, 21, 0.7);
}

#app :is(.date-chip, .today-chip, .header-summary, .status-badge) {
  border: 1px solid rgba(246, 198, 106, 0.24);
  background: rgba(245, 228, 188, 0.1);
  color: var(--user-parchment);
}

#app
  :is(
    .admin-dashboard-view,
    .admin-product-view,
    .admin-product-form-view,
    .admin-category-view,
    .admin-recipe-view,
    .admin-chat-view,
    .admin-sales-view,
    .admin-payment-history-view
  ) {
  color: var(--user-text);
}

#app
  :is(
    .summary-card,
    .panel-card,
    .mini-card,
    .filter-card,
    .form-card,
    .option-group-card,
    .option-item-card,
    .preview-card,
    .table-wrap,
    .recipe-list-card,
    .recipe-edit-card,
    .sidebar-card,
    .input-card,
    .message-section,
    .status-card,
    .empty-box,
    .category-check-list,
    .list-card,
    .recipe-menu-panel,
    .recipe-card,
    .modal-card,
    .table-card,
    .manual-product-panel,
    .manual-cart-panel,
    .request-message-box,
    .recipe-section-box
  ) {
  border: 1px solid var(--user-line);
  background: linear-gradient(
      145deg,
      rgba(255, 247, 223, 0.07),
      transparent 38%
    ),
    rgba(30, 18, 29, 0.82);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 247, 223, 0.1);
  color: var(--user-text);
}

#app
  :is(
    .admin-dashboard-view,
    .admin-product-view,
    .admin-product-form-view,
    .admin-category-view,
    .admin-recipe-view,
    .admin-chat-view,
    .admin-sales-view,
    .admin-payment-history-view,
    .tablet-admin-view
  )
  :is(.description, .panel-head p, .helper-text, small, label) {
  color: var(--user-muted);
}

#app
  :is(
    .admin-dashboard-view,
    .admin-product-view,
    .admin-product-form-view,
    .admin-category-view,
    .admin-recipe-view,
    .admin-chat-view,
    .admin-sales-view,
    .admin-payment-history-view,
    .tablet-admin-view
  )
  :is(input, select, textarea) {
  border: 1px solid rgba(246, 198, 106, 0.22);
  background: rgba(245, 228, 188, 0.1);
  color: var(--user-text);
}

#app
  :is(
    .admin-dashboard-view,
    .admin-product-view,
    .admin-product-form-view,
    .admin-category-view,
    .admin-recipe-view,
    .admin-chat-view,
    .admin-sales-view,
    .admin-payment-history-view,
    .tablet-admin-view
  )
  select {
  appearance: none;
  min-height: 44px;
  padding-right: 42px;
  border-radius: 14px;
  background-color: rgba(245, 228, 188, 0.1);
  background-image: linear-gradient(45deg, transparent 50%, #f6c66a 50%),
    linear-gradient(135deg, #f6c66a 50%, transparent 50%);
  background-position: calc(100% - 20px) 50%, calc(100% - 14px) 50%;
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  cursor: pointer;
}

#app
  :is(
    .admin-dashboard-view,
    .admin-product-view,
    .admin-product-form-view,
    .admin-category-view,
    .admin-recipe-view,
    .admin-chat-view,
    .admin-sales-view,
    .admin-payment-history-view,
    .tablet-admin-view
  )
  select:focus {
  border-color: rgba(246, 198, 106, 0.72);
  box-shadow: 0 0 0 3px rgba(246, 198, 106, 0.16);
}

#app
  :is(
    .admin-dashboard-view,
    .admin-product-view,
    .admin-product-form-view,
    .admin-category-view,
    .admin-recipe-view,
    .admin-chat-view,
    .admin-sales-view,
    .admin-payment-history-view,
    .tablet-admin-view
  )
  select
  option {
  background: #1c1221;
  color: var(--user-text);
}

#app
  :is(
    .admin-dashboard-view,
    .admin-product-view,
    .admin-product-form-view,
    .admin-category-view,
    .admin-recipe-view,
    .admin-chat-view,
    .admin-sales-view,
    .tablet-admin-view
  )
  :is(input, textarea)::placeholder {
  color: rgba(255, 247, 223, 0.45);
}

#app
  :is(
    .create-button,
    .primary-button,
    .add-group-button,
    .add-option-button,
    .inline-button,
    .send-button,
    .quick-button,
    .confirm-button,
    .sort-save-button,
    .edit-button,
    .duplicate-button,
    .recipe-view-button,
    .preset-button,
    .toggle-inline-button.activate,
    .toggle-inline-button.unsoldout
  ) {
  border: 1px solid rgba(255, 247, 223, 0.28);
  background: linear-gradient(135deg, #f5d58a 0%, #c8953d 54%, #8b5a22 100%);
  color: #1b1115;
  box-shadow: 0 10px 22px rgba(200, 149, 61, 0.18);
}

#app
  :is(
    .secondary-button,
    .back-button,
    .remove-button,
    .delete-group-button,
    .delete-option-button,
    .delete-product-button,
    .close-button,
    .action-row button.danger,
    .toggle-inline-button.deactivate,
    .toggle-inline-button.soldout
  ) {
  border: 1px solid rgba(246, 198, 106, 0.22);
  background: rgba(90, 24, 54, 0.54);
  color: var(--user-parchment);
}

#app :is(.product-table, .category-table, .list-table) {
  color: var(--user-text);
}

#app :is(.product-table th, .category-table th, .list-table th) {
  background: rgba(13, 8, 15, 0.78);
  color: var(--user-ember);
}

#app :is(.product-table td, .category-table td, .list-table td) {
  border-top-color: rgba(246, 198, 106, 0.14);
  color: var(--user-text);
}

#app :is(.status-chip, .option-chip, .recipe-status, .category-check-item) {
  border: 1px solid rgba(246, 198, 106, 0.2);
  background: rgba(245, 228, 188, 0.11);
  color: var(--user-parchment);
}

#app :is(.status-chip.active, .option-chip.has-option) {
  background: rgba(22, 59, 43, 0.62);
  color: #c9f7d8;
}

#app :is(.status-chip.inactive, .status-chip.soldout, .option-chip.no-option) {
  background: rgba(90, 24, 54, 0.52);
  color: #ffd1d1;
}

#app .tablet-admin-view {
  min-height: 100dvh;
  background: radial-gradient(
      circle at 16% 0%,
      rgba(246, 198, 106, 0.2),
      transparent 32%
    ),
    radial-gradient(circle at 86% 12%, rgba(22, 59, 43, 0.3), transparent 34%),
    linear-gradient(145deg, #120b16 0%, #241629 48%, #10231c 100%);
}

#app .tablet-header {
  align-items: center;
  padding: 22px 24px;
  border-radius: 24px;
  border: 1px solid var(--user-line);
  background: linear-gradient(
      145deg,
      rgba(255, 247, 223, 0.08),
      transparent 36%
    ),
    rgba(15, 9, 17, 0.76);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
}

#app .tablet-header .header-left {
  min-width: 0;
}

#app .tablet-header .header-left h1 {
  line-height: 1.15;
}

#app .tablet-header .header-summary {
  flex-shrink: 0;
}

#app .tab-button,
#app .category-filter-button,
#app .payment-method-button {
  border: 1px solid rgba(246, 198, 106, 0.22);
  background: rgba(21, 15, 24, 0.66);
  color: var(--user-muted);
}

#app
  :is(
    .tab-button.active,
    .category-filter-button.active,
    .payment-method-button.active
  ) {
  border-color: rgba(246, 198, 106, 0.76);
  background: linear-gradient(
    135deg,
    rgba(90, 24, 54, 0.94),
    rgba(22, 59, 43, 0.9)
  );
  color: var(--user-parchment);
}

#app .table-card.payment-requested {
  border-color: rgba(246, 198, 106, 0.72);
  box-shadow: 0 18px 44px rgba(246, 198, 106, 0.18);
}

#app .table-card.paid {
  border-color: rgba(136, 205, 153, 0.44);
  background: linear-gradient(
      145deg,
      rgba(136, 205, 153, 0.14),
      transparent 38%
    ),
    rgba(18, 38, 30, 0.82);
}

#app .table-amount,
#app .list-card-bottom strong,
#app .table-card-top strong,
#app .list-card-head strong {
  color: var(--user-ember);
}

#app :is(.modal-overlay) {
  background: rgba(8, 5, 10, 0.72);
  backdrop-filter: blur(6px);
}

#app :is(.manual-product-button, .manual-option-button, .recipe-menu-button) {
  border: 1px solid rgba(246, 198, 106, 0.18);
  background: rgba(245, 228, 188, 0.08);
  color: var(--user-text);
}

#app :is(.manual-option-button.selected, .recipe-menu-button.active) {
  border-color: rgba(246, 198, 106, 0.76);
  background: rgba(22, 59, 43, 0.68);
}

@media (max-width: 1100px) {
  #app .admin-sidebar {
    background: linear-gradient(180deg, #160d19 0%, #211425 52%, #101f19 100%);
    box-shadow: 26px 0 70px rgba(0, 0, 0, 0.58);
  }

  #app .admin-sidebar .nav-button {
    border-color: rgba(246, 198, 106, 0.18);
    background: rgba(255, 247, 223, 0.06);
  }

  #app .admin-sidebar .nav-button.active {
    border-color: rgba(246, 198, 106, 0.86);
    background: linear-gradient(
      135deg,
      rgba(246, 198, 106, 0.18),
      rgba(90, 24, 54, 0.42)
    );
    color: var(--user-ember);
    box-shadow: inset 4px 0 0 var(--user-ember), 0 12px 28px rgba(0, 0, 0, 0.24);
  }

  #app .admin-sidebar .nav-button.active .nav-button-main span {
    color: rgba(255, 247, 223, 0.76);
  }
}
</style>
