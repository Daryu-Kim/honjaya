/* eslint-disable no-console */

import { register } from "register-service-worker";

// How often a long-running screen (TV, tablet) asks for a new build.
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

if (process.env.NODE_ENV === "production") {
  // A screen that never navigates keeps a stale precache forever, so reload as
  // soon as a newly deployed worker takes control. The very first install has
  // no controller yet and must not trigger a reload.
  const hadController = Boolean(
    navigator.serviceWorker && navigator.serviceWorker.controller
  );
  let isReloading = false;

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || isReloading) {
        return;
      }

      isReloading = true;
      window.location.reload();
    });
  }

  register(`${process.env.BASE_URL}service-worker.js`, {
    ready() {
      console.log(
        "App is being served from cache by a service worker.\n" +
          "For more details, visit https://goo.gl/AFskqB"
      );
    },
    registered(registration) {
      console.log("Service worker has been registered.");

      window.setInterval(() => {
        registration.update().catch(() => {});
      }, UPDATE_INTERVAL_MS);
    },
    cached() {
      console.log("Content has been cached for offline use.");
    },
    updatefound() {
      console.log("New content is downloading.");
    },
    updated() {
      console.log("New content is available; please refresh.");
    },
    offline() {
      console.log(
        "No internet connection found. App is running in offline mode."
      );
    },
    error(error) {
      console.error("Error during service worker registration:", error);
    },
  });
}
