// Web Push for customer phones (P2-B).
//
// The VAPID public key lives in public.app_settings (id = "web_push") so it can
// be rotated without rebuilding the app. Each browser subscription is stored in
// public.push_subscriptions keyed by its endpoint and tagged with the table
// number it belongs to; the send-chat-push Edge Function fans messages out.
import { deleteRow, fetchRow, upsertRow } from "@/lib/supabase";
import { normalizeTableNumber } from "@/lib/orderSheet";

const SETTINGS_ID = "web_push";
const SW_READY_TIMEOUT_MS = 8000;

let cachedPublicKey = "";

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

function isStandaloneApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function getPushSupport() {
  const hasApi =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  if (!hasApi) {
    return {
      supported: false,
      needsHomeScreen: false,
      permission: "unsupported",
    };
  }

  if (isIosDevice() && !isStandaloneApp()) {
    // iOS only exposes Web Push to apps added to the home screen.
    return {
      supported: false,
      needsHomeScreen: true,
      permission: Notification.permission,
    };
  }

  return {
    supported: true,
    needsHomeScreen: false,
    permission: Notification.permission,
  };
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(normalized);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

export async function getVapidPublicKey() {
  if (cachedPublicKey) {
    return cachedPublicKey;
  }

  const settingsRow = await fetchRow("appSettings", SETTINGS_ID);
  const publicKey = String(settingsRow?.value?.vapidPublicKey || "").trim();

  if (!publicKey) {
    throw new Error(
      "푸시 알림 설정이 아직 준비되지 않았어요. 매장에 문의해주세요."
    );
  }

  cachedPublicKey = publicKey;

  return publicKey;
}

async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("이 브라우저는 알림을 지원하지 않아요.");
  }

  const existing = await navigator.serviceWorker.getRegistration();

  if (!existing) {
    throw new Error(
      "알림은 배포된 앱에서만 켤 수 있어요. 잠시 후 다시 시도해주세요."
    );
  }

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              "서비스 워커 준비가 지연되고 있어요. 새로고침 후 다시 시도해주세요."
            )
          ),
        SW_READY_TIMEOUT_MS
      );
    }),
  ]);
}

function toSubscriptionPayload(subscription) {
  const json = subscription.toJSON();
  const keys = json.keys || {};

  return {
    endpoint: subscription.endpoint,
    p256dh: String(keys.p256dh || ""),
    auth: String(keys.auth || ""),
  };
}

async function saveSubscription(subscription, tableNumber) {
  const payload = toSubscriptionPayload(subscription);
  const safeTableNumber = normalizeTableNumber(tableNumber);

  if (!safeTableNumber) {
    throw new Error("테이블 정보를 확인하지 못했어요.");
  }

  if (!payload.p256dh || !payload.auth) {
    throw new Error("알림 구독 정보를 만들지 못했어요.");
  }

  await upsertRow("pushSubscriptions", {
    id: payload.endpoint,
    tableNumber: safeTableNumber,
    endpoint: payload.endpoint,
    p256dh: payload.p256dh,
    auth: payload.auth,
    userAgent: String(window.navigator.userAgent || "").slice(0, 255),
    updatedAt: new Date().toISOString(),
  });
}

export async function getExistingSubscription() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.getRegistration();

  if (!registration) {
    return null;
  }

  return registration.pushManager.getSubscription();
}

export async function enablePushNotifications(tableNumber) {
  const support = getPushSupport();

  if (!support.supported) {
    if (support.needsHomeScreen) {
      throw new Error(
        "아이폰은 홈 화면에 추가한 뒤에 알림을 켤 수 있어요. (공유 → 홈 화면에 추가)"
      );
    }

    throw new Error("이 브라우저는 알림을 지원하지 않아요.");
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("브라우저에서 알림을 허용해야 받을 수 있어요.");
  }

  const [registration, publicKey] = await Promise.all([
    getServiceWorkerRegistration(),
    getVapidPublicKey(),
  ]);

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await saveSubscription(subscription, tableNumber);

  return subscription;
}

export async function disablePushNotifications() {
  const subscription = await getExistingSubscription();

  if (!subscription) {
    return;
  }

  const endpoint = subscription.endpoint;

  await subscription.unsubscribe();

  try {
    await deleteRow("pushSubscriptions", endpoint);
  } catch (error) {
    // A missing row is fine: the Edge Function also prunes dead endpoints.
    console.warn("[webPush] stale subscription cleanup skipped", error);
  }
}

// Called when the app opens so a table change (or a new VAPID key) is picked up
// without asking the customer to toggle the switch again.
export async function syncPushSubscription(tableNumber) {
  if (typeof window === "undefined") {
    return false;
  }

  const support = getPushSupport();

  if (!support.supported || support.permission !== "granted") {
    return false;
  }

  try {
    const subscription = await getExistingSubscription();

    if (!subscription) {
      return false;
    }

    const publicKey = await getVapidPublicKey();

    if (!publicKey) {
      return false;
    }

    const currentKey = subscription.options?.applicationServerKey
      ? window
          .btoa(
            String.fromCharCode(
              ...new Uint8Array(subscription.options.applicationServerKey)
            )
          )
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "")
      : "";

    if (currentKey && currentKey !== publicKey) {
      // VAPID key rotated: recreate the subscription with the new key.
      await subscription.unsubscribe();
      await enablePushNotifications(tableNumber);

      return true;
    }

    await saveSubscription(subscription, tableNumber);

    return true;
  } catch (error) {
    console.warn("[webPush] subscription sync skipped", error);

    return false;
  }
}
