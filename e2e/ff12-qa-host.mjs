// Disposable authenticated local host for FF1.2 browser-only visual inspection.
// No production data, credentials, database, or project dependency changes.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-ff12-"));
const children = [];
const freePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once("error", reject);
  socket.listen(0, "127.0.0.1", () => { const address = socket.address(); socket.close(() => address && typeof address !== "string" ? resolve(address.port) : reject(new Error("No free port"))); });
});
const waitFor = async (url) => {
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local QA service did not start: ${url}`);
};
const cleanup = () => {
  for (const child of children) child.kill();
  const resolved = path.resolve(temp);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("lumio-ff12-")) fs.rmSync(resolved, { recursive: true, force: true });
};
process.once("SIGINT", () => { cleanup(); process.exit(0); });
process.once("SIGTERM", () => { cleanup(); process.exit(0); });
process.once("uncaughtException", (error) => { console.error(error); cleanup(); process.exit(1); });

const apiPort = await freePort();
const webPort = await freePort();
const api = `http://127.0.0.1:${apiPort}`;
const web = `http://127.0.0.1:${webPort}`;
children.push(spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: path.join(root, "apps/server"),
  env: { ...process.env, PORT: String(apiPort), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(temp, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: path.join(temp, "mail.jsonl"), APP_PUBLIC_URL: web, CLIENT_ORIGIN: web, RTC_STUN_URLS: "", RTC_TURN_URLS: "", RTC_TURN_USERNAME: "", RTC_TURN_CREDENTIAL: "", YOUTUBE_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "" },
  stdio: "ignore",
}));
await waitFor(`${api}/api/health`);
children.push(spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
  cwd: path.join(root, "apps/web"),
  env: { ...process.env, VITE_API_URL: api, VITE_SOCKET_URL: api, VITE_AUTH_SIGNUP_MODE: "", VITE_GOOGLE_CLIENT_ID: "" },
  stdio: "ignore",
}));
await waitFor(web);

const email = `ff12-${crypto.randomUUID()}@example.test`;
const password = "local-ff12-password-123";
const request = async (route, init) => {
  const response = await fetch(`${api}${route}`, init);
  if (!response.ok) throw new Error(`${route}: ${response.status}`);
  return response.status === 204 ? undefined : response.json();
};
await request("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "FF1.2 QA", email, password }) });
const mail = fs.readFileSync(path.join(temp, "mail.jsonl"), "utf8").trim().split("\n");
const link = JSON.parse(mail.at(-1)).text.match(/https?:\/\/\S+/)?.[0];
if (!link) throw new Error("QA verification link missing");
await request("/api/auth/verification/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: new URL(link).hash.slice(7) }) });
const session = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
const headers = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" };
const { house } = await request("/api/houses", { method: "POST", headers, body: JSON.stringify({ name: "Casa FF1.2 QA" }) });
const roomId = house.primaryRoomId;
const queue = [
  { id: "jfKfPfyJRdk", title: "Música para a noite" },
  { id: "5qap5aO4i9A", title: "Lo-fi da madrugada" },
  { id: "DWcJFNfaw9c", title: "Próximo vídeo da turma" },
];
const socket = io(api, { autoConnect: false, auth: { token: session.token }, transports: ["websocket"], extraHeaders: { Origin: web } });
await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
const joined = new Promise((resolve) => socket.once("room:snapshot", resolve));
socket.emit("room:join", { roomId, user: session.user });
await joined;
let first;
for (const item of queue) {
  const media = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: item.id, type: "video", title: item.title, duration: 180, addedBy: session.user, addedAt: new Date().toISOString() };
  if (!first) first = media;
  const ack = await socket.timeout(5000).emitWithAck("queue:add", { roomId, item: media });
  if (!ack.ok) throw new Error(`queue:add: ${ack.message ?? "rejected"}`);
  await request(`/api/media-hub/${roomId}/library`, { method: "POST", headers, body: JSON.stringify({ item: media }) });
}
const changed = await socket.timeout(5000).emitWithAck("media:change", { roomId, item: first });
if (!changed.ok) throw new Error(`media:change: ${changed.message ?? "rejected"}`);
await request(`/api/media-hub/${roomId}/favorite`, { method: "PUT", headers, body: JSON.stringify({ item: first }) });
const { playlist } = await request(`/api/media-hub/${roomId}/playlists`, { method: "POST", headers, body: JSON.stringify({ name: "Para assistir juntos" }) });
await request(`/api/media-hub/${roomId}/playlists/${playlist.id}/items`, { method: "POST", headers, body: JSON.stringify({ item: first }) });
socket.disconnect();

console.log(JSON.stringify({ status: "READY", web, api, email, password, houseId: house.id, roomId }));
await new Promise(() => {});
