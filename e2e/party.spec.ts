import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { io } from "socket.io-client";

const root = path.resolve(__dirname, "..");
const serverRoot = path.join(root, "apps", "server");
const webRoot = path.join(root, "apps", "web");
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
  throw new Error(`Local service did not start: ${url}; server output: ${serverOutput.slice(-500)}`);
};

test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-e2e-"));
  apiPort = await freePort();
  webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: serverRoot,
    env: { ...process.env, PORT: String(apiPort), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: path.join(directory, "mail.jsonl"), APP_PUBLIC_URL: origin, CLIENT_ORIGIN: origin, YOUTUBE_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const output of [server.stdout, server.stderr]) output?.on("data", (chunk: Buffer) => { serverOutput += chunk.toString(); });
  await waitFor(`http://127.0.0.1:${apiPort}/api/health`);
  web = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
    cwd: webRoot,
    env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_AUTH_SIGNUP_MODE: "", VITE_GOOGLE_CLIENT_ID: "" },
    stdio: "ignore",
  });
  await waitFor(origin);
});

test.afterAll(async () => {
  server?.kill();
  web?.kill();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

test("Landing → login → restored session → House → Party → queue/drawer → logout", async ({ page, request }) => {
  const origin = `http://127.0.0.1:${webPort}`;
  const api = `http://127.0.0.1:${apiPort}`;
  const email = `qa-${crypto.randomUUID()}@example.test`;
  const password = "local-e2e-password-123";
  await page.goto(origin);
  await expect(page.getByRole("heading", { name: /Fiquem juntos/i })).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);

  const signup = await request.post(`${api}/api/auth/signup`, { data: { displayName: "QA Browser", email, password } });
  expect(signup.status()).toBe(201);
  const mail = fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { text: string });
  const link = mail.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
  expect(link).toBeTruthy();
  const token = new URL(link!).hash.slice("#token=".length);
  expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token } })).status()).toBe(204);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Sua primeira Casa começa aqui." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sua primeira Casa começa aqui." })).toBeVisible();

  await page.getByRole("button", { name: "Criar Casa" }).click();
  await page.getByLabel("Nome da Casa").fill("QA E2E Casa");
  await page.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(page).toHaveURL(/\/house\/house-/);
  await expect(page.getByRole("heading", { name: "QA E2E Casa" })).toBeVisible();
  await page.getByRole("button", { name: /Abrir fila/ }).click();
  await expect(page.getByText("Fila da Party")).toBeVisible();
  await page.getByRole("button", { name: "Abrir chat" }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
  await page.getByLabel("Controles da Party").getByRole("button", { name: "Adicionar mídia" }).click();
  await expect(page.getByRole("heading", { name: "A mídia da Casa" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "QA E2E Casa" })).toBeVisible();
  const manifest = await request.get(`${origin}/manifest.webmanifest`);
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json() as { icons: unknown[] }).icons.length).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Recolher chat" })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole("heading", { name: "QA E2E Casa" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
  await page.getByRole("navigation", { name: "Menu da Casa e Party" }).getByRole("button", { name: "Casa e membros" }).click();
  await page.getByRole("button", { name: "Excluir Casa…" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Confirmação de exclusão da Casa" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "Excluir Casa permanentemente" })).toBeDisabled();
  await deleteDialog.getByRole("textbox").fill("Outra Casa");
  await expect(deleteDialog.getByRole("button", { name: "Excluir Casa permanentemente" })).toBeDisabled();
  await deleteDialog.press("Escape");
  await expect(deleteDialog).toBeHidden();
  await page.getByRole("button", { name: "Excluir Casa…" }).click();
  await deleteDialog.getByRole("textbox").fill("QA E2E Casa");
  await deleteDialog.getByRole("button", { name: "Excluir Casa permanentemente" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Sua primeira Casa começa aqui." })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(origin + "/");
  await page.goto(`${origin}/app`);
  await expect(page.getByRole("heading", { name: /Fiquem juntos/i })).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("mobile permanent chat, gesture, secondary tools, late join and player idle controls", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const email = `mobile-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
  expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: "Mobile QA", email, password } })).status()).toBe(201);
  const mail = fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { text: string });
  const link = mail.at(-1)!.text.match(/https?:\/\/\S+/)![0];
  expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
  const login = await request.post(`${api}/api/auth/login`, { data: { email, password } });
  const session = await login.json();
  const created = await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${session.token}` }, data: { name: "Mobile QA Casa" } });
  expect(created.ok()).toBe(true);
  const result = await created.json(); const house = result.house;
  const socket = io(api, { autoConnect: false, auth: { token: session.token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const snapshot = new Promise<any>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Local fixture join timeout")), 5000); socket.once("room:snapshot", (value) => { clearTimeout(timer); resolve(value); }); socket.once("connect_error", reject); socket.once("server:error", (message) => reject(new Error(message))); });
    socket.on("connect", () => socket.emit("room:join", { roomId: house.primaryRoomId, user: session.user }));
    socket.connect();
    await snapshot;
    const item = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: "dQw4w9WgXcQ", type: "video", title: "Local player mock", duration: 300, addedBy: session.user, addedAt: new Date().toISOString() };
    const added = await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item }); expect(added.ok).toBe(true);
    const changed = await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item }); expect(changed.ok).toBe(true);
    await context.addInitScript((session) => {
      if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
      localStorage.setItem("lumio.session.v1", JSON.stringify(session));
      (window as any).qaPlayer = { plays: 0, position: 0, state: -1, blocked: localStorage.getItem("qa.blocked") === "1" };
      (window as any).YT = { Player: class {
        events: any;
        constructor(_id: string, options: any) { this.events = options.events; setTimeout(() => this.events.onReady(), 80); }
        cueVideoById() {} seekTo(value: number) { (window as any).qaPlayer.position = value; }
        playVideo() { const qa = (window as any).qaPlayer; qa.plays++; if (qa.blocked) this.events.onAutoplayBlocked(); else { qa.state = 1; this.events.onStateChange({ data: 1 }); } }
        pauseVideo() { (window as any).qaPlayer.state = 2; this.events.onStateChange({ data: 2 }); }
        getCurrentTime() { return (window as any).qaPlayer.position; } getPlayerState() { return (window as any).qaPlayer.state; }
        getDuration() { return 300; } getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; }
        setVolume() {} setPlaybackRate() {} mute() {} unMute() {} destroy() {}
      } };
    }, session);
    await context.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ body: "<html><body style='background:#101210;color:#a7f3c2'>Local media fixture</body></html>", contentType: "text/html" }));
    const page = await context.newPage();
    const pageErrors: string[] = []; page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${origin}/house/${house.id}`);
    await expect(page.getByRole("heading", { name: "Mobile QA Casa", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.plays)).toBeGreaterThan(0);
    const handle = page.getByRole("button", { name: "Recolher chat" });
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await handle.tap(); await expect(page.getByRole("button", { name: "Expandir chat" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeHidden();
    await page.getByRole("button", { name: "Expandir chat" }).tap();
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await page.locator(".mobile-party-chat").evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    const box = await handle.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 20); await page.mouse.down();
    await expect(page.locator(".mobile-party-chat")).toHaveAttribute("data-dragging", "true");
    const before = await page.locator(".mobile-party-chat").evaluate((node) => node.getBoundingClientRect().height);
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 300, { steps: 12 });
    const during = await page.locator(".mobile-party-chat").evaluate((node) => node.getBoundingClientRect().height);
    expect(during).toBeLessThan(before); await page.mouse.up();
    await expect(page.getByRole("button", { name: "Expandir chat" })).toBeVisible();
    await page.getByRole("button", { name: "Expandir chat" }).tap();
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Mobile message");
    await page.getByRole("button", { name: "Enviar mensagem" }).tap(); await expect(page.getByText("Mobile message", { exact: true })).toBeVisible();
    for (const name of ["Pessoas da Party", "Fila da Party"]) {
      await page.getByRole("button", { name, exact: true }).tap();
      await expect(page.getByRole("complementary", { name: "Painel da Party" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Chat", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Fechar painel" }).tap();
    }
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: "test-results/mobile-chat-430.png" });
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Entrar na call", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "1");
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "0", { timeout: 5000 });
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no modo cinema", exact: true }).tap();
    await expect(page.locator(".mobile-party-chat")).toBeHidden();
    await page.getByRole("button", { name: "Sair do modo cinema", exact: true }).tap();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await expect.poll(() => page.locator(".mobile-party-chat").evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(200);
    await page.locator(".mobile-party-chat").evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: "test-results/mobile-landscape.png" });
    const landscapeComposer = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox();
    expect(landscapeComposer!.y + landscapeComposer!.height).toBeLessThanOrEqual(390);
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Tela cheia", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement || document.querySelector(".fallback-fullscreen")))).toBe(true);
    await page.screenshot({ path: "test-results/mobile-fullscreen.png" });
    await page.getByRole("button", { name: /Sair da tela (cheia|ampliada)/ }).tap();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Pausar", exact: true }).tap();
    await page.reload();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(2);
    expect(await page.evaluate(() => (window as any).qaPlayer.plays)).toBe(0);
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "1");
    await page.getByRole("button", { name: "Reproduzir", exact: true }).tap();
    await page.evaluate(() => localStorage.setItem("qa.blocked", "1")); await page.reload();
    await expect(page.getByText("Toque para entrar na reprodução", { exact: true })).toBeVisible();
    await page.evaluate(() => { (window as any).qaPlayer.blocked = false; localStorage.removeItem("qa.blocked"); });
    await page.getByRole("button", { name: "Entrar na reprodução", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    await expect(page.getByText("Toque para entrar na reprodução", { exact: true })).toBeHidden();
    await page.setViewportSize({ width: 320, height: 450 });
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Keyboard-sized viewport");
    const input = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox(); expect(input!.y + input!.height).toBeLessThanOrEqual(450);
    await page.reload(); await expect(page.getByRole("button", { name: "Recolher chat" })).toBeVisible();
    expect(await page.locator(".reaction-actions,.reaction-float").count()).toBe(0);
    expect(fs.readFileSync(path.join(serverRoot, "src/index.ts"), "utf8")).not.toContain("reaction:send");
    expect(fs.readFileSync(path.join(root, "packages/shared/src/index.ts"), "utf8")).not.toContain("reaction:send");
    expect(pageErrors).toEqual([]);
  } finally { socket.disconnect(); await context.close(); }
});
