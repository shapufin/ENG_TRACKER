/**
 * usePushNotifications — React hook for Web Push subscription.
 *
 * Flow:
 * 1. After login, call `requestPermission()` — browser shows "Allow notifications?"
 * 2. If granted, call `subscribe()` — browser generates a push subscription
 * 3. Send the subscription to the backend via POST /api/plugins/notifications/notifications/subscribe/
 * 4. The backend stores it and uses it to send push messages
 *
 * The hook also provides `isSupported` (browser check) and `permission` state.
 */

import { useState, useCallback, useEffect } from "react";
import api from "@/lib/api";

const VAPID_PUBLIC_KEY_ENDPOINT = "/api/plugins/notifications/notifications/vapid-public-key/";
const SUBSCRIBE_ENDPOINT = "/api/plugins/notifications/notifications/subscribe/";
const UNSUBSCRIBE_ENDPOINT = "/api/plugins/notifications/notifications/unsubscribe/";

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

/**
 * Push availability — distinguishes between browsers that support push
 * directly and browsers (iOS Safari) that require the app to be installed
 * (standalone mode) before push is available.
 *
 * - `unsupported`: browser lacks PushManager or serviceWorker API.
 * - `installed-required`: browser supports the APIs but is NOT in
 *   standalone mode on a platform that requires installation (iOS).
 * - `available`: push is ready to use (desktop Chrome, Android Chrome,
 *   or installed iOS Safari in standalone mode).
 */
export type PushAvailability = "unsupported" | "installed-required" | "available";

export interface PushNotificationsState {
  isSupported: boolean;
  permission: PushPermission;
  pushAvailability: PushAvailability;
  isSubscribed: boolean;
  isSubscribing: boolean;
  error: string | null;
  requestPermission: () => Promise<boolean>;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function detectStandalone(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return (
      typeof navigator !== "undefined" &&
      "standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    );
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function usePushNotifications(): PushNotificationsState {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(detectStandalone);

  const isSupported =
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  const isIOS = detectIOS();

  // Listen for display-mode changes so we detect when the user installs
  // the PWA while the app is open.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(display-mode: standalone)");
    const handler = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const pushAvailability: PushAvailability = !isSupported
    ? "unsupported"
    : isIOS && !isStandalone
      ? "installed-required"
      : "available";

  useEffect(() => {
    if (!isSupported) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission as PushPermission);

    // Check if already subscribed
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setIsSubscribed(!!sub);
      })
      .catch(() => {
        // SW not ready yet — fine
      });
  }, [isSupported]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    const result = await Notification.requestPermission();
    setPermission(result as PushPermission);
    return result === "granted";
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    setIsSubscribing(true);
    setError(null);

    try {
      const currentPermission =
        permission === "granted" ? "granted" : await Notification.requestPermission();
      if (currentPermission !== "granted") {
        setPermission(currentPermission as PushPermission);
        setError(
          currentPermission === "denied"
            ? "Notifications are blocked. Enable them in your browser settings."
            : "Permission not granted."
        );
        return false;
      }

      // Get VAPID public key from backend
      const { data } = await api.get(VAPID_PUBLIC_KEY_ENDPOINT);
      const publicKey = data.public_key;

      // Subscribe via service worker
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      // Send the subscription keys in the Web Push base64url format.
      await api.post(SUBSCRIBE_ENDPOINT, {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64Url(subscription.getKey("p256dh")),
          auth: arrayBufferToBase64Url(subscription.getKey("auth")),
        },
      });

      setIsSubscribed(true);
      setError(null);
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      setError(err instanceof Error ? err.message : "Push subscription failed.");
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, [isSupported, permission]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return true;
      }

      await api.post(UNSUBSCRIBE_ENDPOINT, {
        endpoint: subscription.endpoint,
      });
      await subscription.unsubscribe();
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error("Push unsubscribe failed:", err);
      return false;
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    pushAvailability,
    isSubscribed,
    isSubscribing,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
  };
}

/**
 * Convert a base64url VAPID public key to Uint8Array for the Push API.
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
