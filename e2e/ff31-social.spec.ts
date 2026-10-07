import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-ff31-"));
  apiPort = await freePort();
  webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  server = spawn(process.execPath, ["--import", "tsx", "--import", pathToFileURL(path.join(root, "e2e/fixtures/cardDeckLoader.mjs")).href, "src/index.ts"], {
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
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("lumio-ff31-")) fs.rmSync(resolved, { recursive: true, force: true });
});


const shots = path.join(root, "artifacts/frontfix/ff31", process.env.FF31_VISUAL_PASS === "pass1" ? "pass1" : "pass2");

test("FF3.1 direct social actions and mobile Media keep video, chat and composer visible", async ({ browser, request }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(shots, { recursive: true });
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const email = `ff31-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
  expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: "Ana da turma", email, password } })).status()).toBe(201);
  const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
  expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
  const session = await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json();
  const headers = { Authorization: `Bearer ${session.token}` };
  const houses = [];
  for (const name of ["Noite da Turma", "Cinema de sábado", "Jogos de domingo"]) {
    const response = await request.post(`${api}/api/houses`, { headers, data: { name } });
    expect(response.ok()).toBe(true); houses.push((await response.json()).house);
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await context.addInitScript((session) => {
    if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
    localStorage.setItem("lumio.session.v1", JSON.stringify(session));
    (window as any).qaFF31 = { created: 0, destroyed: 0, state: -1, position: 0, captures: 0 };
    navigator.mediaDevices.getUserMedia = async () => { (window as any).qaFF31.captures++; throw new DOMException("QA denied", "NotAllowedError"); };
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
      const draw = canvas.getContext("2d")!; draw.fillStyle = "#223a31"; draw.fillRect(0, 0, 640, 360);
      draw.fillStyle = "#d5e8dc"; draw.font = "24px sans-serif"; draw.fillText("Tela compartilhada — QA local", 50, 180);
      return canvas.captureStream(1);
    };
    (window as any).YT = { Player: class {
      events: any;
      constructor(_id: string, options: any) { (window as any).qaFF31.created++; this.events = options.events; setTimeout(() => this.events.onReady(), 30); }
      cueVideoById() {} seekTo(value: number) { (window as any).qaFF31.position = value; }
      playVideo() { (window as any).qaFF31.state = 1; this.events.onStateChange({ data: 1 }); }
      pauseVideo() { (window as any).qaFF31.state = 2; this.events.onStateChange({ data: 2 }); }
      getCurrentTime() { return (window as any).qaFF31.position; } getPlayerState() { return (window as any).qaFF31.state; }
      getDuration() { return 180; } getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; }
      setVolume() {} setPlaybackRate() {} mute() {} unMute() {} destroy() { (window as any).qaFF31.destroyed++; }
    } };
  }, session);
  await context.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<html><body style="margin:0;background:#172129;height:100vh;display:grid;place-items:center;color:#e5e8ed;font:16px sans-serif"><svg viewBox="0 0 640 360" width="100%" height="100%" aria-label="Vídeo sintético de QA"><rect width="640" height="360" fill="#172129"/><circle cx="490" cy="85" r="35" fill="#d7b991"/><path d="M0 290L155 130L330 330L445 210L640 350V360H0Z" fill="#344f4c"/><path d="M0 350L290 230L490 350L640 300V360H0Z" fill="#658779"/><text x="28" y="40" fill="#e5e8ed" font-family="sans-serif" font-size="16">Vídeo sintético · QA local</text></svg></body></html>' }));
  const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const capture = async (name: string) => { await page.screenshot({ path: path.join(shots, name + ".png"), animations: "disabled" }); };
  const socket = io(api, { autoConnect: false, auth: { token: session.token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
  try {
    await page.goto(`${origin}/app`); await expect(page.locator(".house-card-v2")).toHaveCount(3);
    await expect(page.locator(".house-featured")).toHaveCSS("background-image", "none");
    await capture("home-desktop");
    for (const [width, height] of [[390,844],[320,568],[430,932]]) {
      await page.setViewportSize({ width, height }); await capture(`home-${width}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${origin}/house/${houses[0].id}/media`);
    await expect(page.locator(".social-call-status")).toHaveText("Call conectada");
    await expect(page.locator(".now-playing")).toHaveCount(0);
    await expect(page.getByText("Tocando agora", { exact: true })).toHaveCount(0);
    const controls = page.locator(".party-social-edge");
    for (const name of [/^Ativar microfone/, /^Desativar áudio da call$/, /^Abrir chat$/, /^Compartilhar tela$/, /^Pessoas na Party/, /^Call e dispositivos$/]) await expect(controls.getByRole("button", { name })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir controles da Party" })).toHaveCount(0);
    await expect(controls.locator(".social-call-status")).toHaveClass(/sr-only/);
    await capture("media-empty-desktop");
    await controls.getByRole("button", { name: "Call e dispositivos" }).click();
    await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
    await expect(controls.getByRole("button", { name: "Call e dispositivos" })).toBeFocused();
    await controls.getByRole("button", { name: "Desativar áudio da call", exact: true }).click();
    await expect(controls.getByRole("button", { name: "Ativar áudio da call", exact: true })).toHaveAttribute("aria-pressed", "true");
    await controls.getByRole("button", { name: "Ativar áudio da call", exact: true }).click();
    const joined = new Promise<void>((resolve, reject) => { socket.once("room:snapshot", () => resolve()); socket.once("connect_error", reject); });
    socket.once("connect", () => socket.emit("room:join", { roomId: houses[0].primaryRoomId, user: session.user })); socket.connect(); await joined;
    const item = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: "M7lc1UVf-VE", type: "video", title: "Uma noite para assistir juntos", duration: 180, addedBy: session.user, addedAt: new Date().toISOString() };
    expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: houses[0].primaryRoomId, item })).ok).toBe(true);
    expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: houses[0].primaryRoomId, item })).ok).toBe(true);
    await expect(page.locator(".now-playing")).toContainText(item.title);
    await expect.poll(() => page.evaluate(() => (window as any).qaFF31.state)).toBe(1);
    await capture("media-active-desktop");
    await controls.getByRole("button", { name: "Abrir chat", exact: true }).click(); await capture("media-chat-desktop");
    await page.getByRole("button", { name: "Fechar painel", exact: true }).click();
    await controls.getByRole("button", { name: /^Pessoas na Party/ }).click(); await capture("media-people-desktop");
    await page.getByRole("button", { name: "Fechar painel", exact: true }).click();
    await controls.getByRole("button", { name: "Compartilhar tela", exact: true }).click();
    await expect(controls.getByRole("button", { name: "Parar compartilhamento de tela", exact: true })).toBeVisible();
    await capture("share-active-desktop");
    await controls.getByRole("button", { name: "Parar compartilhamento de tela", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 }); await capture("media-390-integrated");
    await expect(page.getByRole("textbox", { name:"Mensagem", exact:true })).not.toBeFocused();
    await expect(page.getByRole("button", { name:/^(Abrir|Fechar|Ocultar) chat$/ })).toHaveCount(0);
    await expect(controls).toHaveCount(0);
    const engine = await page.locator("iframe.provider-player").elementHandle();
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    const geometry = async () => {
      const boxes = await page.evaluate(() => {
        const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height }; };
        return { frame:box(".player-frame"), chat:box(".mobile-party-chat"), composer:box(".chat-form"), controls:box(".mobile-call-trigger"), height:innerHeight, scroll:document.documentElement.scrollWidth, width:innerWidth };
      });
      expect(boxes.frame.height).toBeGreaterThan(70);
      expect(boxes.frame.width / boxes.frame.height).toBeCloseTo(16/9, 1);
      expect(boxes.frame.top).toBeGreaterThanOrEqual(0);
      expect(boxes.chat.top).toBeGreaterThanOrEqual(boxes.frame.bottom - 1);
      expect(boxes.composer.bottom).toBeLessThanOrEqual(boxes.height + 1);
      expect(boxes.controls.top).toBeGreaterThanOrEqual(boxes.composer.top);
      expect(boxes.controls.bottom).toBeLessThanOrEqual(boxes.composer.bottom);
      expect(boxes.controls.bottom).toBeLessThanOrEqual(boxes.height + 1);
      expect(boxes.scroll).toBeLessThanOrEqual(boxes.width);
      expect(await engine!.evaluate((node) => node === document.querySelector("iframe.provider-player"))).toBe(true);
      for (const button of await page.locator(".mobile-call-trigger").all()) { const b = await button.boundingBox(); expect(b!.width).toBeGreaterThanOrEqual(44); expect(b!.height).toBeGreaterThanOrEqual(44); }
    };
    await geometry(); await capture("media-390-chat");
    await expect(page.locator(".mobile-chat-heading").getByRole("button", { name:/Fila da Party/ })).toBeVisible();
    await expect(page.locator(".media-session-actions").getByRole("button", { name:/Fila da Party/ })).toHaveCount(0);
    await page.getByRole("button", { name:"Controles da call",exact:true }).click();
    for (const name of ["Ativar microfone", "Mutar call", "Compartilhar tela", "Configurações da call"]) await expect(page.locator(".mobile-call-menu").getByRole("button", { name,exact:true })).toBeVisible();
    await expect(page.locator(".mobile-call-menu").getByRole("button", { name:"Pessoas",exact:true })).toHaveCount(0);
    await capture("media-390-call-menu");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name:"Controles da call",exact:true })).toBeFocused();
    await page.keyboard.press("Escape"); await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await page.getByRole("button", { name:"Controles da call",exact:true }).click();
    await page.getByRole("button", { name:"Configurações da call",exact:true }).click();
    await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name:"Controles da call",exact:true })).toBeFocused();
    await page.getByRole("button", { name:"Pessoas da Party",exact:true }).click();
    await page.getByRole("button", { name:"Fechar painel",exact:true }).click();
    await expect(page.locator(".mobile-party-chat")).toBeVisible(); await geometry();
    for (let i=0;i<12;i++) socket.emit("chat:message", { roomId: houses[0].primaryRoomId, body: `Mensagem ${i+1}: Vamos continuar assistindo juntos e conversar sobre esta cena da noite.` });
    await expect(page.getByText(/^Mensagem 12:/)).toBeVisible();
    await expect.poll(() => page.locator(".messages").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await page.locator(".messages").evaluate((node) => { node.scrollTop=0; }); await geometry(); await capture("media-390-messages");
    for (const [width,height] of [[320,568],[430,932]]) {
      await page.setViewportSize({ width,height }); await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      await geometry(); await capture(`media-${width}-chat`);
    }
    await page.setViewportSize({ width:390,height:400 });
    await page.getByRole("textbox", { name:"Mensagem",exact:true }).fill("Continuo assistindo enquanto escrevo");
    await geometry(); await capture("media-390-keyboard");
    await page.getByRole("button", { name:"Controles da call",exact:true }).click();
    const menuBox = await page.locator(".mobile-call-menu").boundingBox(); expect(menuBox!.y).toBeGreaterThanOrEqual(0);
    await capture("media-390-keyboard-call-menu"); await page.keyboard.press("Escape");
    await page.setViewportSize({ width:390,height:844 });
    await page.getByRole("button", { name:"Jogos",exact:true }).click();
    await expect(page.locator(".media-context, iframe.provider-player")).toHaveCount(0);
    await expect(page.locator(".mobile-party-chat")).toBeHidden();
    await page.getByRole("button", { name:"Abrir chat",exact:true }).click();
    await expect(page.getByRole("textbox", { name:"Mensagem",exact:true })).toHaveValue("Continuo assistindo enquanto escrevo");
    await page.getByRole("button", { name:"Fechar chat",exact:true }).click(); await capture("games-hub-mobile");
    await page.setViewportSize({ width:1440,height:900 }); await capture("games-hub-desktop");
    await page.getByRole("button", { name:"Assistir/Ouvir",exact:true }).click();
    await controls.getByRole("button", { name:"Abrir chat",exact:true }).click();
    await expect(page.getByRole("textbox", { name:"Mensagem",exact:true })).toHaveValue("Continuo assistindo enquanto escrevo");
    await controls.getByRole("button", { name:/^Ativar microfone/ }).click();
    await expect(page.locator(".social-voice-error")).toContainText("Microfone bloqueado");
    expect(await page.evaluate(() => (window as any).qaFF31.captures)).toBe(1);
    await capture("microphone-denied");
    expect(errors).toEqual([]);
  } finally { socket.disconnect(); await context.close(); }
});
