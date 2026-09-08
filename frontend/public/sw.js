// fallow-ignore-file unused-file
/**
 * Engineering Tracker Service Worker
 *
 * Strategy:
 * - App shell (HTML, JS, CSS): cache-first, fall back to network, then offline page
 * - API GET requests: network-only (authenticated data must never be cached)
 * - API POST/PUT/DELETE: never cache (mutations must reach the server)
 * - Static assets (icons, fonts): cache-first with long TTL
 */

const CACHE_VERSION = "engtracker-v3";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: route by request type
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Mutations: always go to network, never cache
  if (request.method !== "GET") return;

  // API requests: network-only. Authenticated responses must not be cached.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Vite dev server requests (modules, deps, HMR): always bypass the cache so
  // HMR/source edits are never shadowed by a stale cached response. These paths
  // do not exist in production builds, so this is a no-op there.
  if (
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/node_modules/.vite/")
  ) {
    return;
  }

  // Static assets: cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|css)$/)) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // App shell: cache-first, fall back to network, fall back to offline
  event.respondWith(cacheFirstShell(request));
});

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response("", { status: 503 });
  }
}

async function cacheFirstShell(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && request.mode === "navigate") {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline: return cached index.html for navigation requests
    if (request.mode === "navigate") {
      const fallback = await caches.match("/index.html");
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || "New Engineering Tracker notification" };
  }

  const title = payload.title || "Engineering Tracker";
  const options = {
    body: payload.body || "You have a new notification.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "engtracker-notification",
    data: { url: payload.url || "/notifications" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin);
  const safeUrl = target.origin === self.location.origin ? target.href : `${self.location.origin}/notifications`;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(safeUrl);
        return existing.focus();
      }
      return self.clients.openWindow(safeUrl);
    })
  );
});

// Listen for messages from the app (skipWaiting and logout cleanup)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "CLEAR_USER_DATA") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key === API_CACHE)
              .map((key) => caches.delete(key))
          )
        )
    );
  }
});
