const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
  pwa: {
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
