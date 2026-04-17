import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import UserMainView from "@/views/User/UserMainView.vue";
import UserOrderView from "@/views/User/UserOrderView.vue";
import UserCartView from "@/views/User/UserCartView.vue";
import UserOrderCompleteView from "@/views/User/UserOrderCompleteView.vue";
import UserChatView from "@/views/User/UserChatView.vue";
import UserSongView from "@/views/User/UserSongView.vue";
import UserCheckoutView from "@/views/User/UserCheckoutView.vue";
import AdminChatView from "@/views/Admin/AdminChatView.vue";
import ProjectorView from "@/views/Projector/ProjectorView.vue";
import AdminProductView from "@/views/Admin/AdminProductView.vue";
import AdminProductFormView from "@/views/Admin/AdminProductFormView.vue";
import AdminCategoryView from "@/views/Admin/AdminCategoryView.vue";
import PhoneDashboardView from "@/views/Phone/PhoneDashboardView.vue";
import TabletAdminView from "@/views/Tablet/TabletAdminView.vue";
import AdminDashboardView from "@/views/Admin/AdminDashboardView.vue";
import AdminSalesView from "@/views/Admin/AdminSalesView.vue";

const routes = [
  {
    path: "/",
    name: "home",
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
    path: "/user/order-complete",
    name: "user-order-complete",
    component: UserOrderCompleteView,
  },
  {
    path: "/user/chat",
    name: "user-chat",
    component: UserChatView,
  },
  {
    path: "/user/song",
    name: "user-song",
    component: UserSongView,
  },
  // {
  //   path: "/user/sing",
  //   name: "user-sing",
  //   component: () => import("@/views/user/UserSingView.vue"),
  // },
  {
    path: "/user/checkout",
    name: "user-checkout",
    component: UserCheckoutView,
  },
  {
    path: "/admin/dashboard",
    name: "admin-dashboard",
    component: AdminDashboardView,
  },
  {
    path: "/admin/sales",
    name: "admin-sales",
    component: AdminSalesView,
  },
  {
    path: "/admin/chat",
    name: "admin-chat",
    component: AdminChatView,
  },
  {
    path: "/admin/products",
    name: "admin-products",
    component: AdminProductView,
  },
  {
    path: "/admin/products/create",
    name: "admin-product-create",
    component: AdminProductFormView,
  },
  {
    path: "/admin/categories",
    name: "admin-categories",
    component: AdminCategoryView,
  },
  {
    path: "/admin/products/:productId",
    name: "admin-product-edit",
    component: AdminProductFormView,
  },
  {
    path: "/phone/dashboard",
    name: "phone-dashboard",
    component: PhoneDashboardView,
  },
  {
    path: "/tablet",
    name: "tablet-admin",
    component: TabletAdminView,
  },
  {
    path: "/projector",
    name: "projector",
    component: ProjectorView,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
