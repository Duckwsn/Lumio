// Disposable, authenticated FF2 visual QA host; never uses production data.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-ff2-"));
const children = [];
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => address && typeof address !== "string" ? resolve(address.port) : reject(new Error("No port"))); });
});
const waitFor = async (url) => {
  for (let index = 0; index < 300; index++) {
    try { if ((await fetch(url)).ok) return; } catch { /* Starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local QA service did not start: ${url}`);
};
const cleanup = () => {
  for (const child of children) child.kill();
  const resolved = path.resolve(temp);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("lumio-ff2-")) fs.rmSync(resolved, { recursive: true, force: true });
};
process.once("SIGINT", () => { cleanup(); process.exit(0); });
process.once("SIGTERM", () => { cleanup(); process.exit(0); });
process.once("uncaughtException", (error) => { console.error(error); cleanup(); process.exit(1); });

const [apiPort, webPort] = await Promise.all([freePort(), freePort()]);
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

const request = async (route, init) => {
  const response = await fetch(`${api}${route}`, init);
  if (!response.ok) throw new Error(`${route}: ${response.status}`);
  return response.status === 204 ? undefined : response.json();
};
const password = "local-ff2-password-123";
const createUser = async (displayName) => {
  const email = `ff2-${crypto.randomUUID()}@example.test`;
  await request("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, email, password }) });
  const mail = fs.readFileSync(path.join(temp, "mail.jsonl"), "utf8").trim().split("\n");
  const link = JSON.parse(mail.at(-1)).text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("Missing synthetic verification link");
  await request("/api/auth/verification/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: new URL(link).hash.slice(7) }) });
  const session = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return { email, session };
};
const empty = await createUser("FF2 Zero Casa");
const member = await createUser("FF2 Casa QA");
const headers = { Authorization: `Bearer ${member.session.token}`, "Content-Type": "application/json" };
const createHouse = async (name) => (await request("/api/houses", { method: "POST", headers, body: JSON.stringify({ name }) })).house;
const firstHouse = await createHouse("Noite da Turma");
console.log(JSON.stringify({ status: "READY", web, api, emptyEmail: empty.email, memberEmail: member.email, password, firstHouseId: firstHouse.id }));
await new Promise(() => {});
