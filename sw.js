const CACHE_VERSION = "v1";
const CACHE_NAME = `chartyfi-cache-${CACHE_VERSION}`;
const ASSETS = [
  "/chartyfi/",
  "/chartyfi/index.html",
  "/chartyfi/assets/css/style.css",
  "/chartyfi/assets/css/font.css",
  "/chartyfi/assets/scripts/app.bundled.js",
  "/chartyfi/assets/scripts/libs/lightweight-charts.standalone.production.js"
];
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "SW_ACTIVATED" }));
    })
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_VERSION") {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  const isAppShell =
    url.pathname === "/chartyfi/" ||
    url.pathname === "/chartyfi/index.html";
  const isAsset = ASSETS.includes(url.pathname);
  if (isAppShell) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  if (isAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return res;
          });
      })
    );
  }
});