const VERSION = "v2";
const CACHE = `news-${VERSION}`;

const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/app/styles.css",
  "/app/main.js",
  "/app/dom.js",
  "/app/shell.js",
  "/app/store.js",
  "/app/storage.js",
  "/app/router.js",
  "/app/i18n.js",
  "/app/theme.js",
  "/app/push.js",
  "/app/report.js",
  "/app/views/articles.js",
  "/app/views/foryou.js",
  "/app/views/sources.js",
  "/app/views/saved.js",
  "/app/views/settings.js",
  "/icons/icon.svg"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: "reload" }))))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

async function shellFirst(request, key) {
  const cached = await caches.match(key, { cacheName: CACHE });
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.searchParams.has("signin")) return;
  event.respondWith(shellFirst(request, request.mode === "navigate" ? "/" : request));
});

self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {}
  const notification = data && data.notification;
  if (!notification || !notification.title) return;
  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      lang: notification.lang,
      tag: notification.tag,
      icon: "/icons/icon-192.png",
      data: { navigate: notification.navigate || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.navigate) || "/", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === target.origin);
      if (open) return open.focus();
      return self.clients.openWindow(target.href);
    })()
  );
});

const REPORT_LIMIT = 3;
let reported = 0;

function report(kind, message, detail) {
  const text = String(message == null ? "" : message).slice(0, 300).trim();
  if (!text || reported >= REPORT_LIMIT) return;
  reported += 1;
  fetch("/api/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, message: text, stack: String(detail || "").slice(0, 1000), route: "/sw" })
  }).catch(() => {});
}

self.addEventListener("error", (event) => {
  report("sw-error", event.message, `${event.filename}:${event.lineno}`);
});

self.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  report("sw-rejection", reason && reason.message ? reason.message : String(reason), reason && reason.stack);
});
