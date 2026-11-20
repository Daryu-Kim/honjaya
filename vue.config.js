const { defineConfig } = require("@vue/cli-service");

// 로컬 개발(:8080)에서도 직원/손님 쿠키가 1st-party 가 되도록
// /api/staff, /api/admin, /api/guest, /api/payments, /rest/v1 을 백엔드(:3000)로 프록시합니다.
// 배포 환경에서는 vercel.json 의 rewrites 가 같은 역할을 합니다.
const API_TARGET =
  process.env.VUE_APP_API_PROXY_TARGET || "http://localhost:3000";

module.exports = defineConfig({
  transpileDependencies: true,
  devServer: {
    proxy: {
      "/api/staff": { target: API_TARGET, changeOrigin: true },
      "/api/admin": { target: API_TARGET, changeOrigin: true },
      "/api/guest": { target: API_TARGET, changeOrigin: true },
      "/api/payments": { target: API_TARGET, changeOrigin: true },
      "/rest/v1": { target: API_TARGET, changeOrigin: true },
    },
  },
  pwa: {
    // Installed PWAs launch from `start_url`, which drops `?table=` deep links.
    // `navigate-existing` keeps the clicked URL (query included) when a guest
    // scans a table card while the installed app is already running.
    manifestOptions: {
      launch_handler: { client_mode: "navigate-existing" },
    },
    workboxOptions: {
      // Activate + claim immediately so a long-open kiosk never keeps serving an
      // old bundle, then let registerServiceWorker.js reload the page once.
      skipWaiting: true,
      clientsClaim: true,
      exclude: [/\.map$/, /img\/icons\//, /favicon\.ico$/, /^manifest.*\.js?$/],
    },
  },
});
