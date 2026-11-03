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
      // public/push-handler.js is copied as-is and wired into the generated SW
      // so Web Push notifications work without switching to InjectManifest.
      importScripts: ["push-handler.js"],
      exclude: [
        /push-handler\.js$/,
        /\.map$/,
        /img\/icons\//,
        /favicon\.ico$/,
        /^manifest.*\.js?$/,
      ],
    },
  },
});
