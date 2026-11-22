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
  const role = currentEmployee.value?.role || "";

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
    to: "/tablet",
    label: "태블릿 운영판",
    description: "매장 현장용 화면",
    matchStartsWith: "/tablet",
    permission: "order.view",
  },
];

// 권한이 없는 메뉴는 아예 보여주지 않습니다. (직원별 권한 설정과 같은 기준)
const visibleMenuList = computed(() => {
  return menuList.filter((menu) => {
    return !menu.permission || hasPermission(menu.permission);
  });
});

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

function isActiveMenu(menu) {
  return route.path.startsWith(menu.matchStartsWith);
}

const currentMenu = computed(() => {
  return (
    menuList.find((menu) => route.path.startsWith(menu.matchStartsWith)) || null
  );
});

const currentSectionLabel = computed(() => {
  return currentMenu.value?.label || "관리자";
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
  () => {
    closeMobileMenu();
  }
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
