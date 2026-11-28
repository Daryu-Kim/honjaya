<template>
  <div class="admin-layout">
    <button
      v-if="isMobileMenuOpen"
      type="button"
      class="mobile-menu-backdrop"
      aria-label="메뉴 닫기"
      @click="closeMobileMenu"
    ></button>

    <aside class="admin-sidebar" :class="{ open: isMobileMenuOpen }">
      <div class="sidebar-top">
        <p class="sidebar-eyebrow">HONJAYA ADMIN</p>
        <h1>관리자</h1>
        <button
          type="button"
          class="sidebar-close-button"
          @click="closeMobileMenu"
        >
          닫기
        </button>
      </div>

      <nav class="sidebar-nav">
        <button
          v-for="menu in visibleMenuList"
          :key="menu.to"
          type="button"
          class="nav-button"
          :class="{ active: isActiveMenu(menu) }"
          @click="goMenu(menu.to)"
        >
          <div class="nav-button-main">
            <strong>{{ menu.label }}</strong>
            <span>{{ menu.description }}</span>
          </div>
        </button>

        <template v-if="visibleArcMenuList.length">
          <div class="nav-divider" aria-hidden="true"></div>

          <button
            type="button"
            class="nav-button arc-group-button"
            :class="{ open: isArcMenuOpen }"
            :aria-expanded="isArcMenuOpen"
            @click="toggleArcMenu"
          >
            <div class="nav-button-main">
              <strong>응급안전관리센터</strong>
              <span>사장·매니저·ARC 총괄 전용</span>
            </div>
            <span class="arc-group-caret" aria-hidden="true">{{
              isArcMenuOpen ? "−" : "+"
            }}</span>
          </button>

          <div v-show="isArcMenuOpen" class="arc-sublist">
            <button
              v-for="menu in visibleArcMenuList"
              :key="menu.to"
              type="button"
              class="nav-button arc-nav-button"
              :class="{ active: isActiveMenu(menu) }"
              :style="{ '--arc-color': menu.color }"
              @click="goMenu(menu.to)"
            >
              <span class="arc-dot" aria-hidden="true"></span>
              <div class="nav-button-main">
                <strong>{{ menu.label }}</strong>
                <span>{{ menu.description }}</span>
              </div>
            </button>
          </div>
        </template>
      </nav>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <button
          type="button"
          class="mobile-menu-button"
          aria-label="관리자 메뉴 열기"
          @click="openMobileMenu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div class="topbar-left">
          <p class="topbar-breadcrumb">{{ currentSectionLabel }}</p>
          <h2>{{ currentTitle }}</h2>
        </div>

        <div class="topbar-right">
          <div v-if="currentEmployee" class="staff-chip">
            <strong>{{
              currentEmployee.name || currentEmployee.loginId
            }}</strong>
            <span>{{ currentRoleLabel }}</span>
          </div>
          <div class="date-chip">{{ currentDateText }}</div>
          <button type="button" class="logout-button" @click="handleLogout">
            로그아웃
          </button>
        </div>
      </header>

      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { staffAuthState, hasPermission, staffLogout } from "@/lib/staffAuth.js";
import { canAccessArc } from "@/lib/arc.js";

const router = useRouter();
const route = useRoute();
const isMobileMenuOpen = ref(false);

const currentEmployee = computed(() => staffAuthState.employee);

const ROLE_LABELS = {
  OWNER: "사장",
  MANAGER: "매니저",
  STAFF: "직원",
};

const currentRoleLabel = computed(() => {
  const employee = currentEmployee.value;

  // 직위(예: ARC 대표(RN))가 있으면 그걸 먼저 보여 줍니다.
  if (employee?.titleLabel) {
    return employee.titleLabel;
  }

  if (employee?.title) {
    return employee.title;
  }

  const role = employee?.role || "";

  return ROLE_LABELS[role] || role;
});

async function handleLogout() {
  await staffLogout();
  await router.replace("/staff/login");
}

const menuList = [
  {
    to: "/admin/dashboard",
    label: "대시보드",
    description: "오늘 운영 현황",
    matchStartsWith: "/admin/dashboard",
  },
  {
    to: "/admin/sales",
    label: "매출 통계",
    description: "기간별 매출 분석",
    matchStartsWith: "/admin/sales",
    permission: "sales.view",
  },
  {
    to: "/admin/payments",
    label: "결제 내역",
    description: "주문서별 결제 조회",
    matchStartsWith: "/admin/payments",
    permission: "payment.view",
  },
  {
    to: "/admin/points",
    label: "포인트 관리",
    description: "적립·사용 내역과 조정",
    matchStartsWith: "/admin/points",
    permission: "customer.view",
  },
  {
    to: "/admin/prepaid",
    label: "선불권 관리",
    description: "상품 설정·잔액 현황",
    matchStartsWith: "/admin/prepaid",
    permission: "prepaid.view",
  },
  {
    to: "/admin/gifts",
    label: "기프티콘 관리",
    description: "상품 설정·발급 내역",
    matchStartsWith: "/admin/gifts",
    permission: "gift.view",
  },
  {
    to: "/admin/shop/products",
    label: "전자담배 상품 관리",
    description: "예약 판매 상품·카테고리",
    matchStartsWith: "/admin/shop/products",
    permission: "shop.view",
  },
  {
    to: "/admin/shop/reservations",
    label: "전자담배 예약 관리",
    description: "픽업 예약 접수·처리",
    matchStartsWith: "/admin/shop/reservations",
    permission: "shop.view",
  },
  {
    to: "/admin/customers",
    label: "고객 관리",
    description: "방문 이력·마케팅 동의",
    matchStartsWith: "/admin/customers",
    permission: "crm.view",
  },
  {
    to: "/admin/marketing",
    label: "마케팅",
    description: "문자·알림톡 발송",
    matchStartsWith: "/admin/marketing",
    permission: "marketing.view",
  },
  {
    to: "/admin/products",
    label: "상품 관리",
    description: "상품 등록 및 수정",
    matchStartsWith: "/admin/products",
    permission: "menu.toggle",
  },
  {
    to: "/admin/recipes",
    label: "레시피 관리",
    description: "상품별 레시피 등록/수정/삭제",
    matchStartsWith: "/admin/recipes",
    permission: "menu.toggle",
  },
  {
    to: "/admin/categories",
    label: "카테고리 관리",
    description: "분류 구조 관리",
    matchStartsWith: "/admin/categories",
    permission: "menu.toggle",
  },
  {
    to: "/admin/tables",
    label: "테이블 관리",
    description: "테이블·좌석 설정",
    matchStartsWith: "/admin/tables",
    permission: "table.view",
  },
  {
    to: "/admin/employees",
    label: "직원 관리",
    description: "계정·권한 직접 설정",
    matchStartsWith: "/admin/employees",
    permission: "employee.manage",
  },
  {
    to: "/admin/discord",
    label: "Discord 관리",
    description: "서버 현황·백업",
    matchStartsWith: "/admin/discord",
    permission: "discord.view",
  },
  {
    to: "/tablet",
    label: "태블릿 운영판",
    description: "매장 현장용 화면",
    matchStartsWith: "/tablet",
    permission: "order.view",
  },
];

// 응급안전관리센터는 사장·매니저 전용 묶음입니다. 단독 메뉴로 흩어 두지 않고
// 사이드바 맨 아래에 구분선으로 분리해 한 그룹으로 모읍니다.
// 메뉴마다 색을 달리해 어느 화면인지 바로 구분되게 합니다.
const arcMenuList = [
  {
    to: "/admin/arc",
    label: "종합 현황",
    description: "구급상자·사건·동의 현황",
    matchStartsWith: "/admin/arc",
    permission: "arc.view",
    color: "#f59e0b",
  },
  {
    to: "/admin/arc/assistant",
    label: "ARC 비서",
    description: "오늘 할 일·사장 보고 요약",
    matchStartsWith: "/admin/arc/assistant",
    permission: "arc.view",
    color: "#fbbf24",
  },
  {
    to: "/admin/arc/routine",
    label: "월간 운영 루틴",
    description: "1년 업무달력·점검 순서",
    matchStartsWith: "/admin/arc/routine",
    permission: "arc.view",
    color: "#38bdf8",
  },
  {
    to: "/admin/arc/training",
    label: "월간 교육·OT",
    description: "정기교육·상황연습·출석",
    matchStartsWith: "/admin/arc/training",
    permission: "arc.view",
    color: "#34d399",
  },
  {
    to: "/admin/arc/stock",
    label: "구급상자 재고",
    description: "재고·유효기간·수불",
    matchStartsWith: "/admin/arc/stock",
    permission: "arc.view",
    color: "#ef4444",
  },
  {
    to: "/admin/arc/stocktakes",
    label: "월 1회 실사",
    description: "실물 수량 확인",
    matchStartsWith: "/admin/arc/stocktakes",
    permission: "arc.view",
    color: "#f97316",
  },
  {
    to: "/admin/arc/purchases",
    label: "보충·정산",
    description: "구매 대장·실비정산",
    matchStartsWith: "/admin/arc/purchases",
    permission: "arc.view",
    color: "#eab308",
  },
  {
    to: "/admin/arc/otc",
    label: "개인 상비약",
    description: "직원 자기점검",
    matchStartsWith: "/admin/arc/otc",
    permission: "arc.view",
    color: "#84cc16",
  },
  {
    to: "/admin/arc/usages",
    label: "사용대장",
    description: "소모품 사용·단가",
    matchStartsWith: "/admin/arc/usages",
    permission: "arc.view",
    color: "#22c55e",
  },
  {
    to: "/admin/arc/expenses",
    label: "실비정산",
    description: "청구·부분입금",
    matchStartsWith: "/admin/arc/expenses",
    permission: "arc.view",
    color: "#14b8a6",
  },
  {
    to: "/admin/arc/incidents",
    label: "사건 접수",
    description: "사건·119 인계 접수",
    matchStartsWith: "/admin/arc/incidents",
    permission: "arc.view",
    color: "#06b6d4",
  },
  {
    to: "/admin/arc/care",
    label: "AS-CARE 기록",
    description: "서식 작성·원본 첨부",
    matchStartsWith: "/admin/arc/care",
    permission: "arc.sensitive",
    color: "#0ea5e9",
  },
  {
    to: "/admin/arc/consents",
    label: "응급안전 동의서",
    description: "동의 확인·철회",
    matchStartsWith: "/admin/arc/consents",
    permission: "arc.view",
    color: "#8b5cf6",
  },
  {
    to: "/admin/arc/access",
    label: "민감정보 열람 관리",
    description: "열람 승인·열람 기록",
    matchStartsWith: "/admin/arc/access",
    permission: "arc.sensitive",
    color: "#ec4899",
  },
  {
    to: "/admin/arc/quality",
    label: "사후검토·개선",
    description: "F11~F14·연간 성과기준",
    matchStartsWith: "/admin/arc/quality",
    permission: "arc.view",
    color: "#a78bfa",
  },
  {
    to: "/admin/arc/events",
    label: "행사·의료지원",
    description: "행사별 ARC 지원·체크리스트",
    matchStartsWith: "/admin/arc/events",
    permission: "arc.view",
    color: "#f59e0b",
  },
  {
    to: "/admin/arc/permissions",
    label: "응급안전 권한 관리",
    description: "9종 권한 부여·회수(총괄 전용)",
    matchStartsWith: "/admin/arc/permissions",
    permission: "arc.view",
    directorOnly: true,
    color: "#e879f9",
  },
  {
    to: "/admin/arc/settings",
    label: "응급안전 설정",
    description: "알림·보존기간",
    matchStartsWith: "/admin/arc/settings",
    permission: "arc.admin",
    color: "#94a3b8",
  },
];

// 총괄 계정(yoonhee1021)은 응급안전이 주 화면이라 그룹을 펼친 채로 시작합니다.
const isArcMenuOpen = ref(
  route.path.startsWith("/admin/arc") ||
    Boolean(currentEmployee.value?.isArcDirector)
);

// 권한이 없는 메뉴는 아예 보여주지 않습니다. (직원별 권한 설정과 같은 기준)
const visibleMenuList = computed(() => {
  return menuList.filter((menu) => {
    return !menu.permission || hasPermission(menu.permission);
  });
});

// 응급안전관리센터는 역할 자체가 사장·매니저여야 열립니다.
// (직원 계정에 arc.* 권한이 직접 들어 있어도 숨깁니다 — 서버도 같은 기준으로 막습니다.)
const visibleArcMenuList = computed(() => {
  if (!canAccessArc(currentEmployee.value)) {
    return [];
  }

  return arcMenuList.filter((menu) => {
    if (menu.directorOnly && !currentEmployee.value?.isArcDirector) {
      return false;
    }
    return !menu.permission || hasPermission(menu.permission);
  });
});

function toggleArcMenu() {
  isArcMenuOpen.value = !isArcMenuOpen.value;
}

function goMenu(path) {
  closeMobileMenu();
  if (route.path === path) return;
  router.push(path);
}

function openMobileMenu() {
  isMobileMenuOpen.value = true;
}

function closeMobileMenu() {
  isMobileMenuOpen.value = false;
}

// 중첩 경로(예: /admin/arc/consents)에서 부모 메뉴까지 함께 켜지지 않도록
// 가장 길게 일치하는 메뉴 하나만 활성으로 봅니다.
const allMenuList = computed(() => [
  ...visibleMenuList.value,
  ...visibleArcMenuList.value,
]);

const activeMenu = computed(() => {
  return (
    allMenuList.value
      .filter((menu) => route.path.startsWith(menu.matchStartsWith))
      .sort((a, b) => b.matchStartsWith.length - a.matchStartsWith.length)[0] ||
    null
  );
});

function isActiveMenu(menu) {
  return activeMenu.value?.to === menu.to;
}

const currentMenu = computed(() => activeMenu.value);

const currentSectionLabel = computed(() => {
  if (!currentMenu.value) {
    return "관리자";
  }

  if (currentMenu.value.to.startsWith("/admin/arc")) {
    return `응급안전관리센터 · ${currentMenu.value.label}`;
  }

  return currentMenu.value.label;
});

const currentTitle = computed(() => {
  return currentMenu.value?.description || "관리자 화면";
});

const currentDateText = computed(() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${year}.${month}.${day} ${hours}:${minutes}`;
});

watch(
  () => route.fullPath,
  (path) => {
    closeMobileMenu();

    // 응급안전 화면으로 들어오면 그룹을 펼쳐 둡니다.
    if (path.startsWith("/admin/arc")) {
      isArcMenuOpen.value = true;
    }
  },
  { immediate: true }
);
</script>

<style scoped lang="scss">
.admin-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px 1fr;
  background: #0b1220;
  color: #fff;
  color-scheme: dark;
}

.admin-sidebar {
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sidebar-top {
  padding: 8px 8px 4px;
  position: relative;

  .sidebar-eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.52);
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 800;
  }
}

.sidebar-close-button,
.mobile-menu-button,
.mobile-menu-backdrop {
  display: none;
}

.sidebar-nav {
  display: grid;
  gap: 10px;
}

.nav-button {
  width: 100%;
  border: none;
  border-radius: 18px;
  background: transparent;
  color: #fff;
  text-align: left;
  padding: 14px 14px;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    transform: translateY(-1px);
  }

  &.active {
    background: #ffffff;
    color: #111827;

    .nav-button-main span {
      color: rgba(17, 24, 39, 0.68);
    }
  }
}

.nav-button-main {
  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 15px;
    font-weight: 800;
  }

  span {
    display: block;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
}

// 응급안전관리센터는 사이드바 맨 아래에 구분선으로 분리해 묶습니다.
.nav-divider {
  height: 1px;
  margin: 10px 4px 2px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0),
    rgba(255, 255, 255, 0.24),
    rgba(255, 255, 255, 0)
  );
}

.arc-group-button {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(167, 139, 250, 0.34);
  background: rgba(139, 92, 246, 0.14);

  .nav-button-main {
    flex: 1;
    min-width: 0;
  }

  strong {
    color: #ddd6fe;
  }

  &:hover {
    background: rgba(139, 92, 246, 0.26);
  }
}

.arc-group-caret {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  flex-shrink: 0;
}

.arc-sublist {
  display: grid;
  gap: 8px;
  margin-left: 6px;
  padding-left: 10px;
  border-left: 2px dashed rgba(255, 255, 255, 0.16);
}

.arc-nav-button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;

  .nav-button-main {
    flex: 1;
    min-width: 0;

    strong {
      color: var(--arc-color, #fff);
      font-size: 14px;
    }
  }

  &.active {
    background: var(--arc-color, #fff);
    color: #0b1220;

    .nav-button-main {
      strong {
        color: #0b1220;
      }

      span {
        color: rgba(17, 24, 39, 0.72);
      }
    }

    .arc-dot {
      background: #0b1220;
      box-shadow: none;
    }
  }
}

.arc-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--arc-color, #fff);
  box-shadow: 0 0 10px var(--arc-color, transparent);
  flex-shrink: 0;
}

.admin-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.admin-topbar {
  min-height: 84px;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.topbar-left {
  min-width: 0;

  .topbar-breadcrumb {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.52);
  }

  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 800;
  }
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.date-chip {
  min-width: 160px;
  height: 42px;
  padding: 0 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
}

.staff-chip {
  height: 42px;
  padding: 0 14px;
  border-radius: 12px;
  background: rgba(212, 175, 55, 0.14);
  border: 1px solid rgba(212, 175, 55, 0.32);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;

  strong {
    font-weight: 800;
  }

  span {
    color: rgba(255, 255, 255, 0.6);
  }
}

.logout-button {
  height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
}

.admin-content {
  min-width: 0;
  flex: 1;
}

@media (max-width: 1100px) {
  .admin-layout {
    grid-template-columns: 1fr;
  }

  .admin-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 210;
    width: min(320px, 86vw);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: none;
    background: #120b16;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: 24px 0 60px rgba(0, 0, 0, 0.46);
    overflow-y: auto;

    &.open {
      transform: translateX(0);
    }
  }

  .sidebar-nav {
    grid-template-columns: 1fr;
  }

  .sidebar-close-button {
    position: absolute;
    top: 8px;
    right: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    padding: 0 12px;
    border: none;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .mobile-menu-button {
    width: 42px;
    height: 42px;
    border: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    flex-shrink: 0;
    cursor: pointer;

    span {
      width: 18px;
      height: 2px;
      border-radius: 999px;
      background: currentColor;
      color: #fff;
    }
  }

  .mobile-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: block;
    border: none;
    background: rgba(0, 0, 0, 0.5);
  }

  .admin-topbar {
    align-items: flex-start;
  }
}

@media (max-width: 720px) {
  .admin-topbar {
    padding: 16px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
  }

  .topbar-right {
    grid-column: 1 / -1;
    width: 100%;
    flex-wrap: wrap;
  }

  .date-chip {
    width: 100%;
  }
}
</style>
