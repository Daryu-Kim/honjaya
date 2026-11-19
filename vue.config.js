const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
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
