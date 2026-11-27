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
import ShopListView from "@/views/User/ShopListView.vue";
import ShopDetailView from "@/views/User/ShopDetailView.vue";
import ReservationCompleteView from "@/views/User/ReservationCompleteView.vue";
import ReservationLookupView from "@/views/User/ReservationLookupView.vue";
import AdminShopView from "@/views/Admin/AdminShopView.vue";
import AdminReservationView from "@/views/Admin/AdminReservationView.vue";
import AdminArcView from "@/views/Admin/AdminArcView.vue";
import AdminArcRoutineView from "@/views/Admin/AdminArcRoutineView.vue";
import AdminArcTrainingView from "@/views/Admin/AdminArcTrainingView.vue";
import AdminArcStockView from "@/views/Admin/AdminArcStockView.vue";
import AdminArcStocktakeView from "@/views/Admin/AdminArcStocktakeView.vue";
import AdminArcPurchaseView from "@/views/Admin/AdminArcPurchaseView.vue";
import AdminArcOtcView from "@/views/Admin/AdminArcOtcView.vue";
import AdminArcSettingsView from "@/views/Admin/AdminArcSettingsView.vue";
import AdminArcConsentView from "@/views/Admin/AdminArcConsentView.vue";
import AdminArcAccessView from "@/views/Admin/AdminArcAccessView.vue";
import AdminArcIncidentView from "@/views/Admin/AdminArcIncidentView.vue";
import AdminArcCareView from "@/views/Admin/AdminArcCareView.vue";
import AdminArcCareListView from "@/views/Admin/AdminArcCareListView.vue";
import AdminArcUsageView from "@/views/Admin/AdminArcUsageView.vue";
import AdminArcExpenseView from "@/views/Admin/AdminArcExpenseView.vue";
import AdminArcQualityView from "@/views/Admin/AdminArcQualityView.vue";
import StaffLoginView from "@/views/Staff/StaffLoginView.vue";
import AdminLayout from "@/layouts/AdminLayout.vue";
import { startGlobalBusy } from "@/lib/globalBusy";
import {
  arcHomePath,
  canAccessArc,
  hasArcLanded,
  markArcLanded,
} from "@/lib/arc";
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
    // 전자담배 예약 판매. 로그인 없이 열립니다(픽업 시 매장에서 신분증 확인).
    path: "/shop",
    name: "shop",
    component: ShopListView,
  },
  {
    path: "/shop/:productId",
    name: "shop-detail",
    component: ShopDetailView,
  },
  {
    path: "/reserve/complete",
    name: "reserve-complete",
    component: ReservationCompleteView,
  },
  {
    path: "/reserve/lookup",
    name: "reserve-lookup",
    component: ReservationLookupView,
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
        path: "shop/products",
        name: "admin-shop",
        component: AdminShopView,
        meta: { permission: "shop.view" },
      },
      {
        path: "shop/reservations",
        name: "admin-shop-reservations",
        component: AdminReservationView,
        meta: { permission: "shop.view" },
      },
      {
        path: "arc",
        name: "admin-arc",
        component: AdminArcView,
        meta: { permission: "arc.view" },
      },
      {
        // AS-CAL-001 월간 운영 루틴. 저장은 서버가 arc.check 로 다시 검사합니다.
        path: "arc/routine",
        name: "admin-arc-routine",
        component: AdminArcRoutineView,
        meta: { permission: "arc.view" },
      },
      {
        // 월간 교육·OT. 등록·수정은 서버가 ARC 총괄만 허용합니다.
        path: "arc/training",
        name: "admin-arc-training",
        component: AdminArcTrainingView,
        meta: { permission: "arc.view" },
      },
      {
        path: "arc/stock",
        name: "admin-arc-stock",
        component: AdminArcStockView,
        meta: { permission: "arc.view" },
      },
      {
        path: "arc/stocktakes",
        name: "admin-arc-stocktakes",
        component: AdminArcStocktakeView,
        meta: { permission: "arc.view" },
      },
      {
        path: "arc/purchases",
        name: "admin-arc-purchases",
        component: AdminArcPurchaseView,
        meta: { permission: "arc.view" },
      },
      {
        path: "arc/otc",
        name: "admin-arc-otc",
        component: AdminArcOtcView,
        meta: { permission: "arc.view" },
      },
      {
        // 사용대장. 소모품 사용과 단가·소모금액을 기록합니다.
        path: "arc/usages",
        name: "admin-arc-usages",
        component: AdminArcUsageView,
        meta: { permission: "arc.view" },
      },
      {
        // 실비정산 대장. 금액·입금 처리는 서버가 arc.expense 로 다시 검사합니다.
        path: "arc/expenses",
        name: "admin-arc-expenses",
        component: AdminArcExpenseView,
        meta: { permission: "arc.view" },
      },
      {
        path: "arc/consents",
        name: "admin-arc-consents",
        component: AdminArcConsentView,
        meta: { permission: "arc.view" },
      },
      {
        // 사건 접수 목록. 상세 건강기록 본문은 열리지 않고 사건 메타만 보입니다.
        path: "arc/incidents",
        name: "admin-arc-incidents",
        component: AdminArcIncidentView,
        meta: { permission: "arc.view" },
      },
      {
        // AS-CARE 서식 목록. 사건 접수 목록과 분리해 서식·첨부 상태만 봅니다.
        path: "arc/care",
        name: "admin-arc-care",
        component: AdminArcCareListView,
        meta: { permission: "arc.view" },
      },
      {
        // AS-CARE 상세기록. 서버가 arc.sensitive + 사건별 접근승인을 다시 검사합니다.
        path: "arc/care/:incidentId",
        name: "admin-arc-care-detail",
        component: AdminArcCareView,
        meta: { permission: "arc.view" },
      },
      {
        // 예전 링크 호환용. 사건 접수 화면에서 상세기록으로 바로 들어오던 경로입니다.
        path: "arc/incidents/:incidentId",
        name: "admin-arc-incident-detail",
        component: AdminArcCareView,
        meta: { permission: "arc.view" },
      },
      {
        // 상세 건강기록 열람·승인 화면. 승인 처리는 서버가 arc.approve 로 다시 검사합니다.
        path: "arc/access",
        name: "admin-arc-access",
        component: AdminArcAccessView,
        meta: { permission: "arc.sensitive" },
      },
      {
        path: "arc/settings",
        name: "admin-arc-settings",
        component: AdminArcSettingsView,
        meta: { permission: "arc.admin" },
      },
      {
        // 사후검토·Near Miss·CAPA·재고이상(AS-REC-001 F11~F14). 작성은 서버가 arc.care 로 검사합니다.
        path: "arc/quality",
        name: "admin-arc-quality",
        component: AdminArcQualityView,
        meta: { permission: "arc.view" },
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
    // 응급안전관리센터는 사장·매니저 전용입니다.
    // 직원 계정에 arc.* 권한이 직접 들어 있어도 화면부터 막습니다.
    if (to.path.startsWith("/admin/arc") && !canAccessArc(employee)) {
      return { path: "/admin/dashboard" };
    }

    // 화면 단위 권한(meta.permission)이 있으면 라우터에서 먼저 막습니다.
    const requiredPermission = to.matched
      .map((record) => record.meta?.permission)
      .filter(Boolean)
      .pop();

    if (requiredPermission && !hasPermission(requiredPermission)) {
      return { path: "/admin/dashboard" };
    }

    // 응급안전관리센터 총괄 계정(yoonhee1021)은 관리자 화면 첫 진입을 ARC 로 보냅니다.
    if (!hasArcLanded()) {
      markArcLanded();

      const arcHome = arcHomePath(employee);

      if (arcHome && to.path === "/admin/dashboard") {
        return { path: arcHome };
      }
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
