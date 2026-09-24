const STATIC_CACHE = "lumio-static-__BUILD_VERSION__";
const SAFE_SHELL = ["/offline.html", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/brand/lumio-symbol-128.png", "/favicon-16.png", "/favicon-32.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(SAFE_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("lumio-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key)))));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode === "no-cors" || request.headers.has("Authorization") || request.headers.has("Range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/") || url.pathname.includes("oauth") || url.pathname.includes("google-drive")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (!(/^\/assets\/[^/]+\.(?:js|css|woff2)$/.test(url.pathname) || SAFE_SHELL.includes(url.pathname))) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
