// FF1.1: disposable, local-only visual audit of the real authenticated app.
// No production import, OAuth bypass, committed storage state, or real user data.
import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const shots = path.join(root, "artifacts", "frontfix", "ff11", "current");
const ff3Shots = path.join(root, "artifacts", "frontfix", "ff31", "pass2");
const freePort = () => new Promise<number>((resolve, reject) => {
  const socket = net.createServer();
  socket.once("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const address = socket.address();
    socket.close(() => address && typeof address !== "string" ? resolve(address.port) : reject(new Error("No free port")));
  });
});
const waitFor = async (url: string) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local FF1.1 service did not start: ${url}`);
};

let temp = "", apiPort = 0, webPort = 0;
let server: ChildProcess, web: ChildProcess;
test.beforeAll(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-ff11-"));
  apiPort = await freePort(); webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  server = spawn(process.execPath, ["--import", "tsx", "--import", pathToFileURL(path.join(root, "e2e/fixtures/cardDeckLoader.mjs")).href, "src/index.ts"], {
    cwd: path.join(root, "apps/server"),
    env: { ...process.env, PORT: String(apiPort), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(temp, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: path.join(temp, "mail.jsonl"), APP_PUBLIC_URL: origin, CLIENT_ORIGIN: origin, RTC_STUN_URLS: "", RTC_TURN_URLS: "", RTC_TURN_USERNAME: "", RTC_TURN_CREDENTIAL: "", YOUTUBE_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "" },
    stdio: "ignore",
  });
  await waitFor(`http://127.0.0.1:${apiPort}/api/health`);
  web = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
    cwd: path.join(root, "apps/web"),
    env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_AUTH_SIGNUP_MODE: "", VITE_GOOGLE_CLIENT_ID: "" },
    stdio: "ignore",
  });
  await waitFor(origin);
  fs.mkdirSync(shots, { recursive: true });
  fs.mkdirSync(ff3Shots, { recursive: true });
});
test.afterAll(async () => {
  server?.kill(); web?.kill();
  const resolved = path.resolve(temp);
  const base = path.resolve(os.tmpdir());
  if (path.dirname(resolved) === base && path.basename(resolved).startsWith("lumio-ff11-")) fs.rmSync(resolved, { recursive: true, force: true });
});

test("FF1.1 current authenticated surfaces", async ({ browser, request }) => {
  test.setTimeout(300_000);
  const api = `http://127.0.0.1:${apiPort}`, origin = `http://127.0.0.1:${webPort}`;
  const sessions: Array<{ token: string; user: { id: string } }> = [];
  for (const displayName of ["Ana da turma QA", "Bia da turma QA"]) {
    const email = `ff11-${crypto.randomUUID()}@example.test`, password = "local-ff11-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const mail = fs.readFileSync(path.join(temp, "mail.jsonl"), "utf8").trim().split("\n");
    const link = (JSON.parse(mail.at(-1)!) as { text: string }).text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link!).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const host = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await host.addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), sessions[0]);
  await guest.addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), sessions[1]);
  const a = await host.newPage(), b = await guest.newPage();
  const capture = async (page: Page, name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: path.join(shots, `${name}-${width}x${height}.png`), animations: "disabled" });
  };
  try {
    await a.goto(`${origin}/app`);
    await expect(a.getByRole("heading", { name: "Você ainda não faz parte de uma Casa." })).toBeVisible({ timeout: 20_000 });
    await capture(a, "home-empty", 1440, 900);
    await capture(a, "home-empty", 390, 844);
    const headers = { Authorization: `Bearer ${sessions[0].token}` };
    const houses: Array<{ id: string; primaryRoomId: string }> = [];
    for (const name of ["Noite de sábado", "Cinema da turma", "Jogos de domingo"]) {
      const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name } })).json();
      houses.push(house);
      const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 2 } })).json();
      expect((await request.post(`${api}/api/invites/${invite.token}/accept`, { headers: { Authorization: `Bearer ${sessions[1].token}` } })).ok()).toBe(true);
    }
    await a.reload(); await expect(a.locator(".house-card-v2")).toHaveCount(3);
    await capture(a, "home-multiple", 1440, 900);
    await capture(a, "home-multiple", 390, 844);
    await capture(a, "home-multiple", 320, 568);
    await a.goto(`${origin}/account`); await expect(a.getByRole("heading", { name: /Formas de entrar/ })).toBeVisible();
    await capture(a, "account", 1440, 900); await capture(a, "account", 390, 844);

    await a.goto(`${origin}/house/${houses[0].id}/media`);
    await b.goto(`${origin}/house/${houses[0].id}/media`);
    await expect(a.locator(".party-header")).toBeVisible();
    await capture(a, "media-empty", 1440, 900); await capture(a, "media-empty", 390, 844);
    await capture(a, "media-empty", 320, 568);
    await a.setViewportSize({ width: 1440, height: 900 });
    await a.getByRole("button", { name: "Abrir chat", exact: true }).click();
    await expect(a.locator(".party-drawer.is-chat")).toBeVisible();
    await capture(a, "media-chat", 1440, 900);
    await a.getByRole("button", { name: /Abrir pessoas/ }).click();
    await capture(a, "media-people", 1440, 900);

    await a.getByRole("button", { name: "Call e dispositivos" }).click();
    await expect(a.getByRole("dialog")).toBeVisible();
    await capture(a, "call-controls", 1440, 900);
    await a.keyboard.press("Escape");
    await a.getByRole("button", { name: "Fechar painel" }).click();

    // The app and session are real; the YouTube media item is synthetic and
    // requires no API key or third-party data. The iframe may be unavailable.
    const { io } = await import("socket.io-client");
    const socket = io(api, { autoConnect: false, auth: { token: sessions[0].token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
    const joined = new Promise<void>((resolve) => socket.once("room:snapshot", () => resolve()));
    socket.emit("room:join", { roomId: houses[0].primaryRoomId, user: sessions[0].user });
    await joined;
    const item = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: "jfKfPfyJRdk", type: "video", title: "Música para a noite — QA", duration: 180, addedBy: sessions[0].user, addedAt: new Date().toISOString() };
    const added = await socket.timeout(5000).emitWithAck("queue:add", { roomId: houses[0].primaryRoomId, item });
    expect(added.ok).toBe(true);
    const changed = await socket.timeout(5000).emitWithAck("media:change", { roomId: houses[0].primaryRoomId, item });
    expect(changed.ok).toBe(true);
    await expect(a.locator(".now-playing")).toContainText("Música para a noite");
    await capture(a, "media-active", 1440, 900);
    await capture(a, "media-active", 390, 844);
    await capture(a, "media-active", 844, 390);
    await a.setViewportSize({ width: 1440, height: 900 });
    await a.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
    await a.getByRole("button", { name: "Visualização: Vídeo" }).click();
    await a.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
    await capture(a, "media-ambient", 1440, 900);
    await capture(a, "media-ambient", 390, 844);
    socket.disconnect();

    for (const page of [a, b]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${origin}/house/${houses[1].id}/games`);
      await expect(page.getByRole("heading", { name: "O que vamos jogar?" })).toBeVisible();
    }
    await capture(a, "games-hub", 1440, 900); await capture(a, "games-hub", 390, 844);
    await capture(a, "games-hub", 320, 568);
    await a.setViewportSize({ width: 1440, height: 900 });
    await a.getByRole("button", { name: "Abrir chat", exact: true }).click();
    await expect(a.locator(".party-drawer.is-chat")).toBeVisible();
    await a.screenshot({ path: path.join(ff3Shots, "games-chat-desktop.png") });
    await a.getByRole("button", { name: "Fechar painel", exact: true }).click();

    for (const page of [a, b]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole("button", { name: /Desenhe e Adivinhe/ }).click();
      await page.getByRole("button", { name: "Participar", exact: true }).click();
    }
    await capture(a, "draw-lobby", 1440, 900);
    await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    await expect(a.getByRole("dialog", { name: "Escolha o que você vai desenhar" })).toBeVisible();
    await capture(a, "draw-choice", 1440, 900);
    await a.locator(".draw-choices button").first().click();
    await expect(a.locator(".draw-board canvas")).toBeVisible();
    await expect(b.locator(".draw-board canvas")).toBeVisible();
    await capture(a, "draw-drawer", 1440, 900);
    await capture(b, "draw-guesser", 1440, 900);
    await capture(a, "draw-drawer", 390, 844);
    await capture(a, "draw-drawer", 320, 568);
    await capture(a, "draw-drawer", 844, 390);
    await capture(b, "draw-guesser", 390, 844);
    await b.getByRole("button", { name: "Abrir chat", exact: true }).click();
    await expect(b.locator(".mobile-party-chat")).toBeVisible();
    await expect(b.locator(".mobile-party-chat").getByRole("textbox", { name: "Seu palpite" })).toBeVisible();
    await b.screenshot({ path: path.join(ff3Shots, "draw-chat-390.png") });
    await b.getByRole("button", { name: "Fechar chat", exact: true }).click();
    await capture(b, "draw-guesser", 320, 568);
    await a.setViewportSize({ width: 1440, height: 900 });
    await b.setViewportSize({ width: 1440, height: 900 });

    for (const page of [a, b]) {
      await page.goto(`${origin}/house/${houses[2].id}/games`);
      await page.getByRole("button", { name: /Quiz 2/ }).click();
      await page.getByRole("button", { name: "Participar", exact: true }).click();
    }
    await capture(a, "quiz-lobby", 1440, 900);
    await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    await expect(a.locator(".quiz-question")).toBeVisible();
    await capture(a, "quiz-question", 1440, 900); await capture(a, "quiz-question", 390, 844);
    // Cards use a different House so the Quiz session stays untouched.
    const { house: cardHouse } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "Cartas de sexta" } })).json();
    const { invite: cardInvite } = await (await request.post(`${api}/api/houses/${cardHouse.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 2 } })).json();
    expect((await request.post(`${api}/api/invites/${cardInvite.token}/accept`, { headers: { Authorization: `Bearer ${sessions[1].token}` } })).ok()).toBe(true);
    for (const page of [a, b]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${origin}/house/${cardHouse.id}/games`);
      await page.getByRole("button", { name: /Lumio Cartas/ }).click();
      await page.getByRole("button", { name: "Participar", exact: true }).click();
    }
    await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    await expect(a.locator(".card-hand")).toBeVisible();
    await capture(a, "cards-turn", 1440, 900); await capture(a, "cards-turn", 390, 844);
  } finally { await host.close(); await guest.close(); }
});
