import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import UserMainView from "@/views/User/UserMainView.vue";
import UserOrderView from "@/views/User/UserOrderView.vue";
import UserCartView from "@/views/User/UserCartView.vue";
import UserOrderHistoryView from "@/views/User/UserOrderHistoryView.vue";
import UserOrderCompleteView from "@/views/User/UserOrderCompleteView.vue";
import UserCheckoutView from "@/views/User/UserCheckoutView.vue";
import AdminChatView from "@/views/Admin/AdminChatView.vue";
import AdminProductView from "@/views/Admin/AdminProductView.vue";
import AdminProductFormView from "@/views/Admin/AdminProductFormView.vue";
import AdminCategoryView from "@/views/Admin/AdminCategoryView.vue";
import AdminRecipeView from "@/views/Admin/AdminRecipeView.vue";
import TabletAdminView from "@/views/Tablet/TabletAdminView.vue";
import AdminDashboardView from "@/views/Admin/AdminDashboardView.vue";
import AdminSalesView from "@/views/Admin/AdminSalesView.vue";
import AdminLayout from "@/layouts/AdminLayout.vue";

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
    path: "/user/checkout",
    name: "user-checkout",
    component: UserCheckoutView,
  },
  {
    path: "/admin",
    component: AdminLayout,
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
        path: "chat",
        name: "admin-chat",
        component: AdminChatView,
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
    ],
  },
  {
    path: "/tablet",
    name: "tablet-admin",
    component: TabletAdminView,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
