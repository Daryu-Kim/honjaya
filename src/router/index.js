import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import UserMainView from "@/views/User/UserMainView.vue";
import UserOrderView from "@/views/User/UserOrderView.vue";
import UserCartView from "@/views/User/UserCartView.vue";
import UserOrderHistoryView from "@/views/User/UserOrderHistoryView.vue";
import UserOrderCompleteView from "@/views/User/UserOrderCompleteView.vue";
import AdminProductView from "@/views/Admin/AdminProductView.vue";
import AdminProductFormView from "@/views/Admin/AdminProductFormView.vue";
import AdminCategoryView from "@/views/Admin/AdminCategoryView.vue";
import AdminTableView from "@/views/Admin/AdminTableView.vue";
import AdminRecipeView from "@/views/Admin/AdminRecipeView.vue";
import TabletAdminView from "@/views/Tablet/TabletAdminView.vue";
import AdminDashboardView from "@/views/Admin/AdminDashboardView.vue";
import AdminSalesView from "@/views/Admin/AdminSalesView.vue";
import AdminPaymentHistoryView from "@/views/Admin/AdminPaymentHistoryView.vue";
import AdminPointHistoryView from "@/views/Admin/AdminPointHistoryView.vue";
import AdminPrepaidView from "@/views/Admin/AdminPrepaidView.vue";
import AdminGiftView from "@/views/Admin/AdminGiftView.vue";
import AdminCustomerView from "@/views/Admin/AdminCustomerView.vue";
import AdminMarketingView from "@/views/Admin/AdminMarketingView.vue";
import AdminEmployeeView from "@/views/Admin/AdminEmployeeView.vue";
import AdminDiscordView from "@/views/Admin/AdminDiscordView.vue";
import UnsubscribeView from "@/views/User/UnsubscribeView.vue";
import GiftCardView from "@/views/User/GiftCardView.vue";
import StaffLoginView from "@/views/Staff/StaffLoginView.vue";
import AdminLayout from "@/layouts/AdminLayout.vue";
import { startGlobalBusy } from "@/lib/globalBusy";
import { hasPermission, loadStaffSession } from "@/lib/staffAuth";

const routes = [
  {
    path: "/",
    name: "home",
    component: HomeView,
  },
  {
    path: "/enter",
    name: "enter",
    component: HomeView,
  },
  {
    path: "/entry",
    name: "entry",
    component: HomeView,
  },
  {
    path: "/user/main",
    name: "user-main",
    component: UserMainView,
  },
  {
    path: "/user/order",
    name: "user-order",
    component: UserOrderView,
  },
  {
    path: "/user/cart",
    name: "user-cart",
    component: UserCartView,
  },
  {
    path: "/user/order-history",
    name: "user-order-history",
    component: UserOrderHistoryView,
  },
  {
    path: "/user/order-complete",
    name: "user-order-complete",
    component: UserOrderCompleteView,
  },
  {
    path: "/staff/login",
    name: "staff-login",
    component: StaffLoginView,
  },
  {
    // 문자에 넣은 수신거부 링크. 로그인 없이 열립니다.
    path: "/unsubscribe",
    name: "unsubscribe",
    component: UnsubscribeView,
  },
  {
    // 선물받은 기프티콘을 확인하는 화면. 로그인 없이 열립니다.
    path: "/gift/:code",
    name: "gift-card",
    component: GiftCardView,
  },
  {
    path: "/admin",
    component: AdminLayout,
    meta: { requiresStaff: true },
    children: [
      {
        path: "",
        redirect: "/admin/dashboard",
      },
      {
        path: "dashboard",
        name: "admin-dashboard",
        component: AdminDashboardView,
      },
      {
        path: "sales",
        name: "admin-sales",
        component: AdminSalesView,
      },
      {
        path: "payments",
        name: "admin-payments",
        component: AdminPaymentHistoryView,
      },
      {
        path: "points",
        name: "admin-points",
        component: AdminPointHistoryView,
      },
      {
        path: "prepaid",
        name: "admin-prepaid",
        component: AdminPrepaidView,
        meta: { permission: "prepaid.view" },
      },
      {
        path: "gifts",
        name: "admin-gifts",
        component: AdminGiftView,
        meta: { permission: "gift.view" },
      },
      {
        path: "customers",
        name: "admin-customers",
        component: AdminCustomerView,
      },
      {
        path: "marketing",
        name: "admin-marketing",
        component: AdminMarketingView,
      },
      {
        path: "products",
        name: "admin-products",
        component: AdminProductView,
      },
      {
        path: "recipes",
        name: "admin-recipes",
        component: AdminRecipeView,
      },
      {
        path: "products/create",
        name: "admin-product-create",
        component: AdminProductFormView,
      },
      {
        path: "products/:productId",
        name: "admin-product-edit",
        component: AdminProductFormView,
      },
      {
        path: "categories",
        name: "admin-categories",
        component: AdminCategoryView,
      },
      {
        path: "tables",
        name: "admin-tables",
        component: AdminTableView,
      },
      {
        // 사장 전용. 메뉴에서도 employee.manage 권한이 없으면 숨깁니다.
        path: "employees",
        name: "admin-employees",
        component: AdminEmployeeView,
        meta: { permission: "employee.manage" },
      },
      {
        // 봇이 꺼져 있어도 화면 자체는 열립니다(백업 이력은 DB 에 남아 있음).
        path: "discord",
        name: "admin-discord",
        component: AdminDiscordView,
        meta: { permission: "discord.view" },
      },
    ],
  },
  {
    path: "/tablet",
    name: "tablet-admin",
    component: TabletAdminView,
    meta: { requiresStaff: true },
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

// 직원 전용 화면(/admin, /tablet)은 세션 쿠키를 확인한 뒤에만 통과시킵니다.
// 화면을 그린 뒤에 막으면 데이터가 잠깐 노출되므로 라우터 단계에서 먼저 검사합니다.
router.beforeEach(async (to) => {
  const requiresStaff = to.matched.some((record) => record.meta?.requiresStaff);

  if (!requiresStaff) {
    return true;
  }

  const employee = await loadStaffSession();

  if (employee) {
    // 화면 단위 권한(meta.permission)이 있으면 라우터에서 먼저 막습니다.
    const requiredPermission = to.matched
      .map((record) => record.meta?.permission)
      .filter(Boolean)
      .pop();

    if (requiredPermission && !hasPermission(requiredPermission)) {
      return { path: "/admin/dashboard" };
    }

    return true;
  }

  return {
    path: "/staff/login",
    query: to.fullPath && to.fullPath !== "/" ? { redirect: to.fullPath } : {},
  };
});

let releaseRouteBusy = null;

router.beforeEach(() => {
  if (releaseRouteBusy) {
    return false;
  }

  releaseRouteBusy = startGlobalBusy("화면을 이동하는 중이에요.");
  return true;
});

router.afterEach(() => {
  if (releaseRouteBusy) {
    releaseRouteBusy();
    releaseRouteBusy = null;
  }
});

router.onError(() => {
  if (releaseRouteBusy) {
    releaseRouteBusy();
    releaseRouteBusy = null;
  }
});

export default router;
