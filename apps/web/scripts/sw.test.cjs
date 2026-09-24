const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const handlers = {};
const cached = [];
const cache = { addAll: async (paths) => cached.push(...paths), put: async () => undefined };
let matched = [];
let fetched = [];
let skipCount = 0;
const context = {
  URL,
  self: {
    location: { origin: "http://localhost:4173" },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: () => { skipCount += 1; return Promise.resolve(); },
  },
  caches: {
    open: async () => cache,
    keys: async () => ["lumio-static-v1"],
    match: async (request) => { matched.push(request); return { cached: true }; },
  },
  fetch: async (request) => { fetched.push(request.url); throw new Error("offline"); },
};
vm.runInNewContext(readFileSync(path.join(__dirname, "../pwa/sw.js"), "utf8"), context);

function dispatch(url, options = {}) {
  let response;
  const request = {
    url,
    method: options.method ?? "GET",
    mode: options.mode ?? "cors",
    headers: { has: (name) => options.headers?.includes(name) ?? false },
  };
  handlers.fetch({ request, respondWith: (promise) => { response = promise; } });
  return response;
}

test("precache contains only safe shell files", async () => {
  await new Promise((resolve) => handlers.install({ waitUntil: (promise) => promise.then(resolve) }));
  assert.deepEqual(cached, ["/offline.html", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/brand/lumio-symbol-128.png", "/favicon-16.png", "/favicon-32.png", "/apple-touch-icon.png"]);
});

test("private and cross-origin requests never enter the service worker cache", () => {
  const excluded = [
    ["http://localhost:4173/api/bootstrap", {}],
    ["http://localhost:4173/api/google-drive/stream/123", {}],
    ["http://localhost:4173/socket.io/?transport=polling", {}],
    ["http://localhost:4173/google-drive/oauth/callback", {}],
    ["https://www.youtube-nocookie.com/embed/abc", {}],
    ["http://localhost:4173/assets/index.js", { headers: ["Authorization"] }],
    ["http://localhost:4173/assets/index.js", { headers: ["Range"] }],
    ["http://localhost:4173/assets/index.js", { mode: "no-cors" }],
  ];
  for (const [url, options] of excluded) assert.equal(dispatch(url, options), undefined, url);
  assert.equal(matched.length, 0);
  assert.equal(fetched.length, 0);
});

test("static bundles are cacheable and offline navigation shows an honest message", async () => {
  assert.ok(dispatch("http://localhost:4173/assets/index-abc.js"));
  assert.equal(matched.length, 1);
  const response = await dispatch("http://localhost:4173/house/example", { mode: "navigate" });
  assert.equal(response.cached, true);
  assert.equal(matched.at(-1), "/offline.html");
});

test("update activation requires an explicit message", () => {
  assert.equal(skipCount, 0);
  handlers.message({ data: { type: "OTHER" } });
  assert.equal(skipCount, 0);
  handlers.message({ data: { type: "SKIP_WAITING" } });
  assert.equal(skipCount, 1);
});
