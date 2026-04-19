<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="sidebar-top">
        <p class="sidebar-eyebrow">HONJAYA ADMIN</p>
        <h1>관리자</h1>
      </div>

      <nav class="sidebar-nav">
        <button
          v-for="menu in menuList"
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
        <div class="topbar-left">
          <p class="topbar-breadcrumb">{{ currentSectionLabel }}</p>
          <h2>{{ currentTitle }}</h2>
        </div>

        <div class="topbar-right">
          <div class="date-chip">{{ currentDateText }}</div>
        </div>
      </header>

      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

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
  },
  {
    to: "/admin/projector-notices",
    label: "프로젝터 공지",
    description: "하단 흐름 문구 관리",
    matchStartsWith: "/admin/projector-notices",
  },
  {
    to: "/admin/products",
    label: "상품 관리",
    description: "상품 등록 및 수정",
    matchStartsWith: "/admin/products",
  },
  {
    to: "/admin/categories",
    label: "카테고리 관리",
    description: "분류 구조 관리",
    matchStartsWith: "/admin/categories",
  },
  {
    to: "/tablet/admin",
    label: "태블릿 운영판",
    description: "매장 현장용 화면",
    matchStartsWith: "/tablet/admin",
  },
];

function goMenu(path) {
  if (route.path === path) return;
  router.push(path);
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
</script>

<style scoped lang="scss">
.admin-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px 1fr;
  background: #0b1220;
  color: #fff;
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

.admin-content {
  min-width: 0;
  flex: 1;
}

@media (max-width: 1100px) {
  .admin-layout {
    grid-template-columns: 1fr;
  }

  .admin-sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .sidebar-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .sidebar-nav {
    grid-template-columns: 1fr;
  }

  .admin-topbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
