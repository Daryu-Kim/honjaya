/* eslint-disable no-undef */
// Imported into the generated Workbox service worker (see vue.config.js).
// Handles Web Push delivery and notification clicks for customer phones.

const DEFAULT_NOTIFICATION_URL = "/user/chat";
const DEFAULT_ICON = "img/icons/android-chrome-192x192.png";
const DEFAULT_BADGE = "img/icons/favicon-32x32.png";

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "혼자야";
  const options = {
    body: payload.body || "새 메시지가 도착했어요.",
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag: payload.tag || "honjaya-chat",
    renotify: true,
    data: { url: payload.url || DEFAULT_NOTIFICATION_URL },
  };

  if (Array.isArray(payload.vibrate)) {
    options.vibrate = payload.vibrate;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationUrl = new URL(
    (event.notification.data && event.notification.data.url) || DEFAULT_NOTIFICATION_URL,
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        if (!client.url.startsWith(self.location.origin)) {
          continue;
        }

        // The table number lives in the query string, so keep whatever the open
        // window already carries when the notification URL has none.
        const currentUrl = new URL(client.url);
        const nextUrl = new URL(notificationUrl);

        if (!nextUrl.searchParams.get("table")) {
          const currentTable = currentUrl.searchParams.get("table");

          if (currentTable) {
            nextUrl.searchParams.set("table", currentTable);
          }
        }

        await client.focus();

        if ("navigate" in client && nextUrl.href !== currentUrl.href) {
          await client.navigate(nextUrl.href);
        }

        return;
      }

      await self.clients.openWindow(notificationUrl);
    })()
  );
});
