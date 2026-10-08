import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { io } from "socket.io-client";

const root = path.resolve(__dirname, "..");
const freePort = () => new Promise<number>((resolve, reject) => {
  const socket = net.createServer();
  socket.once("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const address = socket.address();
    socket.close(() => address && typeof address !== "string" ? resolve(address.port) : reject(new Error("No free port")));
  });
});

let directory = "";
let apiPort = 0;
let webPort = 0;
let server: ChildProcess;
let web: ChildProcess;
let serverOutput = "";

const waitFor = async (url: string) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local FF3 service did not start: ${url}; server output: ${serverOutput.slice(-500)}`);
};

test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-ff3-people-"));
  apiPort = await freePort();
  webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: path.join(root, "apps/server"),
    env: { ...process.env, PORT: String(apiPort), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: path.join(directory, "mail.jsonl"), APP_PUBLIC_URL: origin, CLIENT_ORIGIN: origin, RTC_STUN_URLS: "", RTC_TURN_URLS: "", RTC_TURN_USERNAME: "", RTC_TURN_CREDENTIAL: "", YOUTUBE_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const output of [server.stdout, server.stderr]) output?.on("data", (chunk: Buffer) => { serverOutput += chunk.toString(); });
  await waitFor(`http://127.0.0.1:${apiPort}/api/health`);
  web = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
    cwd: path.join(root, "apps/web"),
    env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_AUTH_SIGNUP_MODE: "", VITE_GOOGLE_CLIENT_ID: "" },
    stdio: "ignore",
  });
  await waitFor(origin);
});

test.afterAll(async () => {
  server?.kill();
  web?.kill();
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("lumio-ff3-people-")) fs.rmSync(resolved, { recursive: true, force: true });
});

test("FF3 People keeps 1, 2, 4, 8 and 12 real Party members readable", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions: Array<{ token: string; user: { id: string; displayName: string } }> = [];
  const names = ["Alexandre de Albuquerque", ...Array.from({ length: 11 }, (_, index) => `Pessoa com nome extenso ${index + 2}`)];
  for (const displayName of names) {
    const email = `ff3-people-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "FF3 Pessoas" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 11 } })).json();
  for (let index = 1; index < 12; index++) expect((await request.post(`${api}/api/invites/${invite.code}/accept`, { headers: { Authorization: `Bearer ${sessions[index].token}` } })).ok()).toBe(true);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), sessions[0]);
  const page = await context.newPage();
  const peers: ReturnType<typeof io>[] = [];
  try {
    await page.goto(`${origin}/house/${house.id}`);
    await expect(page.locator(".social-call-status")).toHaveText("Call conectada", { timeout: 20_000 });
    for (const target of [1, 2, 4, 8, 12]) {
      while (peers.length < target - 1) {
        const index = peers.length + 1;
        const peer = io(api, { autoConnect: false, auth: { token: sessions[index].token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
        const joined = new Promise<void>((resolve, reject) => { peer.once("room:snapshot", () => resolve()); peer.once("connect_error", reject); });
        peer.once("connect", () => peer.emit("room:join", { roomId: house.primaryRoomId, user: sessions[index].user }));
        peers.push(peer); peer.connect(); await joined;
      }
      await expect(page.getByRole("button", { name: `Pessoas na Party, ${target}`, exact: true })).toBeVisible();

      await expect(page.getByRole("button", { name: "Abrir controles da Party" })).toHaveCount(0);
      await page.getByRole("button", { name: /Pessoas na Party/ }).click();
      const panel = page.getByRole("complementary", { name: "Painel da Party" });
      await expect(panel.locator(".people-section").first().locator("li")).toHaveCount(target);
      await expect(panel).toContainText(names[0]);
      expect(await panel.locator(".member-copy strong").first().evaluate((node) => getComputedStyle(node).whiteSpace)).toBe("normal");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (target === 12) {
        if (await page.getByRole("button", { name: "Dispensar aviso" }).isVisible()) await page.getByRole("button", { name: "Dispensar aviso" }).click();
        await page.screenshot({ path: "artifacts/frontfix/ff31/pass2/people-12-desktop.png" });
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
          await expect(panel.locator(".people-section").first().locator("li")).toHaveCount(12);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: `artifacts/frontfix/ff31/pass2/people-12-${width}.png` });
        }
      }
      await page.getByRole("button", { name: "Fechar painel", exact: true }).click();
    }
  } finally { for (const peer of peers) peer.disconnect(); await context.close(); }
});
