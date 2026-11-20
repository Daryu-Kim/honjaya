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
import StaffLoginView from "@/views/Staff/StaffLoginView.vue";
import AdminLayout from "@/layouts/AdminLayout.vue";
import { startGlobalBusy } from "@/lib/globalBusy";
import { loadStaffSession } from "@/lib/staffAuth";

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
