import { test, expect, chromium } from "@playwright/test";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
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
  apiPort = await freePort(); webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: serverRoot,
    env: { ...process.env, PORT: String(apiPort), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: path.join(directory, "mail.jsonl"), APP_PUBLIC_URL: origin, CLIENT_ORIGIN: origin, RTC_STUN_URLS: "", RTC_TURN_URLS: "", RTC_TURN_USERNAME: "", RTC_TURN_CREDENTIAL: "", YOUTUBE_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "" },
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

let m2QaSessions: Array<{ token: string; user: { id: string; displayName: string; color: string } }> | null = null;

test("S1 Houses: Home observes two Party browsers, six widths, details and invite without joining", async ({ browser, request }) => {
  test.setTimeout(120000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const displayName of ["Ana nome bastante longo para QA", "Bia", "Caio"]) {
    const email = `s1-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } });
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const contexts = await Promise.all(sessions.map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
  const errors: string[] = [];
  try {
    for (let i = 0; i < 3; i++) await contexts[i].addInitScript((session) => {
      localStorage.setItem("lumio.session.v1", JSON.stringify(session));
      (window as any).__captures = 0;
      navigator.mediaDevices.getUserMedia = async () => { (window as any).__captures++; throw new Error("S1 must not capture on Home"); };
    }, sessions[i]);
    const [a, b, home] = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    for (const p of [a, b, home]) p.on("pageerror", (e) => errors.push(e.message));
    await home.goto(`${origin}/app`); await expect(home.getByRole("heading", { name: "Você ainda não faz parte de uma Casa." })).toBeVisible();
    await home.screenshot({ path: "artifacts/s1/s1-house-empty.png" });
    const headers = { Authorization: `Bearer ${sessions[0].token}` };
    const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "Casa dos amigos com um nome comprido para testar" } })).json();
    const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 4 } })).json();
    await home.getByRole("button", { name: "Entrar com convite" }).click(); await home.getByLabel("Link ou código").fill(invite.code); await home.getByRole("button", { name: "Abrir convite" }).click();
    await home.getByRole("button", { name: "Entrar na Casa", exact: true }).click(); await expect(home).toHaveURL(/\/house\//);
    await home.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
    await home.getByRole("button", { name: "Sair da Party", exact: true }).click();
    await expect(home).toHaveURL(/\/app$/);
    await expect(home.locator(".house-card-v2")).toHaveCount(1); await expect(home.locator(".house-party-summary")).toContainText("Ninguém na Party agora", { timeout: 12000 });
    await home.screenshot({ path: "artifacts/s1/s1-house-idle.png" });
    await request.post(`${api}/api/invites/${invite.code}/accept`, { headers: { Authorization: `Bearer ${sessions[1].token}` } });
    await Promise.all([a.goto(`${origin}/house/${house.id}`), b.goto(`${origin}/house/${house.id}`)]);
    await expect(home.locator(".house-party-summary")).toContainText("2 pessoas na Party");
    await home.screenshot({ path: "artifacts/s1/s1-house-active.png" });
    await home.getByRole("button", { name: "Casa e membros", exact: true }).click();
    await home.getByRole("button", { name: "Membros", exact: true }).click();
    await expect(home.locator(".settings-members li").filter({ hasText: "Bia" }).locator(".member-presence")).toHaveText("Na Party");
    await expect(home.locator(".settings-members li").filter({ hasText: "Caio" }).locator(".member-presence")).toHaveText("Online");
    const secondAnaTab = await contexts[0].newPage();
    await secondAnaTab.goto(`${origin}/house/${house.id}`);
    await expect(secondAnaTab.getByRole("button", { name: /Abrir pessoas, 2 na Party/ })).toBeVisible();
    await expect(home.locator(".house-details-presence")).toContainText("2 na Party");
    await secondAnaTab.close();
    await expect(home.locator(".house-details-presence")).toContainText("2 na Party");
    await home.keyboard.press("Escape");
    expect(await home.evaluate(() => (window as any).__captures)).toBe(0);
    expect(await home.locator("iframe,video,audio,.party-app").count()).toBe(0);
    await contexts[2].setOffline(true); await expect(home.getByRole("status")).toContainText("último estado recebido");
    await contexts[2].setOffline(false); await expect(home.locator(".home-presence-pending")).toHaveCount(0, { timeout: 15000 });
    await home.screenshot({ path: "artifacts/s1/s1-home-desktop.png" });
    for (const width of [320, 360, 375, 390, 412, 430]) { await home.setViewportSize({ width, height: 844 }); expect(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); const box = await home.locator(".house-card-v2 .house-open-actions > button").first().boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); await home.screenshot({ path: `artifacts/s1/s1-home-${width}.png` }); }
    await home.setViewportSize({ width: 1440, height: 900 });
    await home.getByRole("button", { name: "Casa e membros", exact: true }).click(); await expect(home.getByRole("dialog")).toBeVisible(); await home.screenshot({ path: "artifacts/s1/s1-house-detail-desktop.png" });
    await home.getByRole("button", { name: "Membros", exact: true }).click(); await expect(home.getByRole("dialog")).toContainText("Dono"); await expect(home.getByRole("dialog")).not.toContainText("HOST"); await home.screenshot({ path: "artifacts/s1/s1-members.png" });
    await home.setViewportSize({ width: 320, height: 844 }); expect(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await home.screenshot({ path: "artifacts/s1/s1-house-detail-mobile.png" });
    await home.keyboard.press("Escape"); await expect(home.getByRole("dialog")).toHaveCount(0); await expect(home.getByRole("button", { name: "Casa e membros", exact: true })).toBeFocused();
    expect(await home.evaluate(() => (window as any).__captures)).toBe(0);
    await request.post(`${api}/api/houses/${house.id}/transfer-host`, { headers, data: { targetUserId: sessions[2].user.id } });
    await expect(home.getByRole("button", { name: "Convidar pessoas", exact: true })).toBeVisible(); await home.getByRole("button", { name: "Convidar pessoas", exact: true }).click(); await home.getByRole("button", { name: "Criar convite seguro" }).click(); await expect(home.getByLabel("Código do convite")).toBeVisible(); await home.screenshot({ path: "artifacts/s1/s1-invite.png" }); await home.getByRole("button", { name: "Fechar", exact: true }).click();
    const { house: second } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "Outra Casa" } })).json();
    const { invite: secondInvite } = await (await request.post(`${api}/api/houses/${second.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 2 } })).json();
    await request.post(`${api}/api/invites/${secondInvite.code}/accept`, { headers: { Authorization: `Bearer ${sessions[2].token}` } }); await expect(home.locator(".house-card-v2")).toHaveCount(2);
    await home.setViewportSize({ width: 1440, height: 900 }); await home.screenshot({ path: "artifacts/s1/s1-house-multiple.png" });
    for (let index = 0; index < 7; index++) await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${sessions[2].token}` }, data: { name: `Outra Casa de QA ${index + 1}` } });
    await home.reload(); await expect(home.locator(".house-card-v2")).toHaveCount(9);
    await expect(home.locator(".house-list-item")).toHaveCount(9);
    await expect(home.locator(".house-featured, .house-secondary")).toHaveCount(0);
    const homeRows = await home.locator(".house-list-item").evaluateAll((rows) => rows.map((row) => ({ columns: getComputedStyle(row).gridTemplateColumns })));
    expect(new Set(homeRows.map((row) => row.columns)).size).toBe(1);
    await home.setViewportSize({ width: 320, height: 568 });
    expect(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await home.screenshot({ path: "artifacts/s1/s1-house-nine-mobile.png", fullPage: true });
    await contexts[0].close(); await expect(home.locator(".house-card-v2").first()).toContainText("1 pessoa na Party", { timeout: 10000 });
    await contexts[1].close(); await expect(home.locator(".house-card-v2").first()).toContainText("Ninguém na Party agora", { timeout: 10000 });
    await home.locator(".house-card-v2").first().getByRole("button", { name: /Abrir Party/ }).click(); await expect(home).toHaveURL(new RegExp(`/house/${house.id}/media$`));
    expect(errors).toEqual([]);
  } finally { for (const ctx of contexts) await ctx.close(); }
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
  await expect(page.getByRole("heading", { name: "Você ainda não faz parte de uma Casa." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Você ainda não faz parte de uma Casa." })).toBeVisible();

  await page.getByRole("button", { name: "Criar Casa" }).click();
  await page.getByLabel("Nome da Casa").fill("QA E2E Casa");
  await page.getByRole("button", { name: "Criar e entrar" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/house\/house-/);
  await expect(page.getByRole("heading", { name: "QA E2E Casa" })).toBeVisible();
  await page.getByRole("button", { name: /Fila da Party/ }).click();
  await expect(page.getByText("Fila da Party")).toBeVisible();
  await page.getByRole("button", { name: "Abrir chat" }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
  await page.locator(".main-stage").getByRole("button", { name: "Adicionar mídia" }).click();
  await expect(page.getByRole("heading", { name: "A mídia da Casa" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "QA E2E Casa" })).toBeVisible();
  const manifest = await request.get(`${origin}/manifest.webmanifest`);
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json() as { icons: unknown[] }).icons.length).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-party-chat")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Você ainda não faz parte de uma Casa." })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(origin + "/");
  await page.goto(`${origin}/app`);
  await expect(page.getByRole("heading", { name: /Fiquem juntos/i })).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("invitation sharing offers code and link, mobile code entry and unauthenticated link return", async ({ browser, request }) => {
  test.setTimeout(120000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const createUser = async (displayName: string) => {
    const email = `invite-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const mail = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!);
    const link = mail.text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    return { email, password, session: await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json() };
  };
  const host = await createUser("Invite Host"), guest = await createUser("Code Guest"), linkGuest = await createUser("Link Guest");
  const { house } = await (await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${host.session.token}` }, data: { name: "Invite QA Friends" } })).json();
  const hostContext = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await hostContext.addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), host.session);
    await guestContext.addInitScript((session) => { if (!sessionStorage.getItem("qa:logout")) localStorage.setItem("lumio.session.v1", JSON.stringify(session)); }, guest.session);
    const hostPage = await hostContext.newPage(), guestPage = await guestContext.newPage();
    await hostPage.goto(`${origin}/house/${house.id}`);
    await hostPage.getByRole("button", { name: "Convidar", exact: true }).click();
    await hostPage.getByLabel("Limite de usos").fill("2");
    await hostPage.getByRole("button", { name: "Criar convite seguro" }).click();
    await expect(hostPage.getByLabel("Código do convite")).toBeVisible();
    const code = await hostPage.getByLabel("Código do convite").inputValue(), link = await hostPage.getByLabel("Link do convite").inputValue();
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
    await hostPage.getByRole("button", { name: "Copiar código", exact: true }).click();
    await expect(hostPage.locator(".invite-result").getByRole("status")).toHaveText("Código copiado.");
    expect(await hostPage.evaluate(() => navigator.clipboard.readText())).toBe(code);
    await hostPage.getByRole("button", { name: "Copiar link", exact: true }).click();
    expect(await hostPage.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await hostPage.setViewportSize({ width: 390, height: 844 });
    await hostPage.screenshot({ path: "test-results/mobile-invite-code-link.png" });
    expect(await hostPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guestPage.goto(`${origin}/app`);
    await guestPage.getByRole("button", { name: "Entrar com convite" }).click();
    await guestPage.getByLabel("Link ou código").fill(` ${code.toLowerCase().replace("-", " ")} `);
    await guestPage.getByRole("button", { name: "Abrir convite" }).click();
    await expect(guestPage.getByRole("heading", { name: house.name })).toBeVisible();
    await guestPage.getByRole("button", { name: "Entrar na Casa", exact: true }).click();
    await expect(guestPage).toHaveURL(`${origin}/house/${house.id}/media`);
    await guestPage.goto(`${origin}/invite/${code}`);
    await expect(guestPage.getByRole("button", { name: "Abrir Party", exact: true })).toBeVisible();
    await guestPage.getByRole("button", { name: "Abrir Party", exact: true }).click();
    await guestPage.evaluate(() => { sessionStorage.setItem("qa:logout", "1"); localStorage.removeItem("lumio.session.v1"); });
    await guestContext.clearCookies();
    await guestPage.goto(link);
    await guestPage.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(guestPage).toHaveURL(/\/login\?next=/);
    await guestPage.getByLabel("E-mail").fill(linkGuest.email); await guestPage.getByLabel("Senha").fill(linkGuest.password);
    await guestPage.getByRole("button", { name: "Entrar", exact: true }).last().click();
    await expect(guestPage).toHaveURL(link);
    await guestPage.getByRole("button", { name: "Entrar na Casa", exact: true }).click();
    await expect(guestPage).toHaveURL(`${origin}/house/${house.id}/media`);
    const details = await (await request.get(`${api}/api/houses/${house.id}`, { headers: { Authorization: `Bearer ${host.session.token}` } })).json();
    expect(details.house.members).toHaveLength(3); expect(details.house.invites[0].uses).toBe(2);
  } finally { await hostContext.close(); await guestContext.close(); }
});

test("automatic voice: three real RTC clients, explicit capture, denial, deafen, reconnect and leave", async ({ request }) => {
  test.setTimeout(180_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions: any[] = [];
  for (const displayName of ["Voice A", "Voice B", "Voice C"]) {
    const email = `voice-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const last = fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!;
    const link = JSON.parse(last).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "Receive only RTC" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 3, role: "MEMBER" } })).json();
  for (const session of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.token}/accept`, { headers: { Authorization: `Bearer ${session.token}` } })).ok()).toBe(true);
  const rtcBrowser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const contexts = await Promise.all(sessions.map(() => rtcBrowser.newContext()));
    for (let i = 0; i < contexts.length; i++) await contexts[i].addInitScript((session) => {
      if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
      localStorage.setItem("lumio.session.v1", JSON.stringify(session));
      const qa = (window as any).qaVoice = { captures: 0, displays: 0, deny: false, hold: false, release: null as (() => void) | null, blockAudio: false, peers: [] as RTCPeerConnection[], tracks: [] as MediaStreamTrack[], audio: [] as HTMLAudioElement[] };
      const Peer = window.RTCPeerConnection;
      const Transport = window.WebSocket;
      (qa as any).sockets = [];
      window.WebSocket = class extends Transport {
        constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); (qa as any).sockets.push(this); }
      };
      window.RTCPeerConnection = class extends Peer { constructor(config?: RTCConfiguration) { super(config); qa.peers.push(this); } };
      const AudioClass = window.Audio;
      window.Audio = class extends AudioClass { constructor() { super(); qa.audio.push(this); } play() { return qa.blockAudio ? Promise.reject(new DOMException("QA autoplay blocked", "NotAllowedError")) : super.play(); } };
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        qa.captures++;
        if (qa.deny) throw new DOMException("QA denied", "NotAllowedError");
        const stream = await capture(constraints); qa.tracks.push(...stream.getTracks());
        if (qa.hold) await new Promise<void>((resolve) => { qa.release = resolve; });
        return stream;
      };
      const display = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
      if (display) navigator.mediaDevices.getDisplayMedia = (options) => { qa.displays++; return display(options); };
    }, sessions[i]);
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    const join = async (page: typeof a) => {
      await page.goto(`${origin}/house/${house.id}`);
      await expect(page.locator(".social-call-status").first()).toHaveText("Call conectada", { timeout: 20000 });
      await expect(page.locator(".social-mic")).toHaveAccessibleName("Ativar microfone · Microfone desligado");
      await expect(page.getByRole("button", { name: /Ativar microfone/ }).first()).toBeVisible();
      expect(await page.evaluate(() => (window as any).qaVoice.captures)).toBe(0);
      expect(await page.evaluate(() => (window as any).qaVoice.displays)).toBe(0);
      await expect(page.getByRole("button", { name: /Entrar na call|Sair da call/ })).toHaveCount(0);
    };
    const packets = (page: typeof a) => page.evaluate(async () => {
      let count = 0;
      for (const peer of (window as any).qaVoice.peers as RTCPeerConnection[]) if (peer.connectionState !== "closed") (await peer.getStats()).forEach((stat) => { if (stat.type === "inbound-rtp" && stat.kind === "audio") count += stat.packetsReceived ?? 0; });
      return count;
    });
    const connected = (page: typeof a, count: number) => expect.poll(() => page.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20000 }).toBe(count);
    try {
    await join(a); await join(b);
    await b.evaluate(() => { (window as any).qaVoice.blockAudio = true; });
    await a.locator(".social-mic").click();
    await expect(a.locator(".social-mic")).toHaveAttribute("aria-pressed", "true");
    await connected(b, 1); await expect.poll(() => packets(b), { timeout: 20000 }).toBeGreaterThan(0);

    await expect(b.getByRole("button", { name: "Ativar áudio da call", exact: true })).toBeVisible();
    await b.evaluate(() => { (window as any).qaVoice.blockAudio = false; });
    await b.getByRole("button", { name: "Ativar áudio da call", exact: true }).click();
    await expect.poll(() => b.evaluate(() => (window as any).qaVoice.audio.some((audio: HTMLAudioElement) => !audio.paused && !audio.muted))).toBe(true);
    const voiceBeforeMedia = await a.evaluate(() => ({ peers: (window as any).qaVoice.peers.length, captures: (window as any).qaVoice.captures }));
    const receivedBeforeMedia = await packets(b);
    await a.getByRole("button", { name: "Abrir chat", exact: true }).click();
    await expect(a.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await a.getByRole("button", { name: "Fechar painel", exact: true }).click();
    await expect.poll(() => packets(b), { timeout: 20000 }).toBeGreaterThan(receivedBeforeMedia);
    expect(await a.evaluate(() => ({ peers: (window as any).qaVoice.peers.length, captures: (window as any).qaVoice.captures }))).toEqual(voiceBeforeMedia);
    await connected(a, 1); await connected(b, 1);
    await join(c);
    await expect.poll(() => c.evaluate(() => ({ ready: (window as any).qaVoice.peers.some((peer: RTCPeerConnection) => peer.connectionState === "connected"), peers: (window as any).qaVoice.peers.map((peer: RTCPeerConnection) => ({ state: peer.connectionState, signaling: peer.signalingState, ice: peer.iceConnectionState, slots: peer.getTransceivers().map((slot) => ({ kind: slot.receiver.track.kind, direction: slot.direction, current: slot.currentDirection, sender: Boolean(slot.sender.track) })) })), voice: document.querySelector(".social-call-status")?.textContent })), { timeout: 20000 }).toMatchObject({ ready: true });
    await expect.poll(() => packets(c), { timeout: 20000 }).toBeGreaterThan(0);
    for (const page of [a, b, c]) if (await page.getByRole("button", { name: "Abrir chat", exact: true }).isVisible()) await page.getByRole("button", { name: "Abrir chat", exact: true }).click();
    for (const message of ["FF3 mensagem antes da fila", "FF3 mensagem depois da fila"]) {
      if (message.includes("depois")) {
        await a.getByRole("button", { name: "Fila da Party", exact: false }).click();
        await a.getByRole("tab", { name: "Chat", exact: true }).click();
      }
      await a.getByRole("textbox", { name: "Mensagem" }).fill(message);
      await a.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
      for (const page of [b, c]) await expect(page.locator(".chat-panel .message").filter({ hasText: message })).toHaveCount(1);
    }
    for (const page of [a, b, c]) if (await page.getByRole("button", { name: "Fechar chat", exact: true }).isVisible()) await page.getByRole("button", { name: "Fechar chat", exact: true }).click();
    await b.evaluate(() => { (window as any).qaVoice.deny = true; });
    await b.locator(".social-mic").click();
    await expect(b.locator(".social-mic")).toHaveAccessibleName(/Microfone bloqueado/);
    await expect(b.locator(".social-mic")).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => b.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    const received = await packets(b); await expect.poll(() => packets(b), { timeout: 20000 }).toBeGreaterThan(received);
    await b.evaluate(() => { (window as any).qaVoice.deny = false; });
    await b.locator(".social-mic").click();
    await expect.poll(() => packets(a), { timeout: 20000 }).toBeGreaterThan(0);
    await connected(c, 2); await connected(b, 2);
    // Media-only drawer and chat transitions keep the call peer topology intact.
    for (const page of [a, b, c]) await expect(page.locator(".main-stage")).toHaveAttribute("data-view", "media");
    await connected(c, 2); await connected(b, 2);
    await expect.poll(() => c.evaluate(async () => {
      let sources = 0;
      for (const peer of (window as any).qaVoice.peers as RTCPeerConnection[]) (await peer.getStats()).forEach((stat) => { if (stat.type === "inbound-rtp" && stat.kind === "audio" && stat.packetsReceived > 0) sources++; });
      return { sources, peers: (window as any).qaVoice.peers.map((peer: RTCPeerConnection) => ({ state: peer.connectionState, signaling: peer.signalingState, audio: peer.getTransceivers().filter((slot) => slot.receiver.track.kind === "audio").map((slot) => ({ direction: slot.direction, current: slot.currentDirection, muted: slot.receiver.track.muted })) })) };
    }), { timeout: 20000 }).toMatchObject({ sources: 2 });

    await b.getByRole("button", { name: "Desativar áudio da call", exact: true }).click();
    expect(await b.evaluate(() => (window as any).qaVoice.audio.every((audio: HTMLAudioElement) => audio.muted))).toBe(true);
    expect(await b.evaluate(() => (window as any).qaVoice.tracks.filter((track: MediaStreamTrack) => track.readyState === "live").every((track: MediaStreamTrack) => !track.enabled))).toBe(true);

    await b.getByRole("button", { name: "Ativar áudio da call", exact: true }).click();
    await expect(b.locator(".social-mic")).toBeVisible();
    await b.locator(".social-mic").click();
    await a.locator(".social-mic").click();
    const aPackets = await packets(a); await expect.poll(() => packets(a), { timeout: 20000 }).toBeGreaterThan(aPackets);
    await a.locator(".social-mic").click();
    await expect(a.locator(".social-mic")).toHaveAttribute("aria-pressed", "true");
    const captures = await a.evaluate(() => (window as any).qaVoice.captures);
    await contexts[0].setOffline(true);
    await expect.poll(() => a.evaluate(() => (window as any).qaVoice.tracks.every((track: MediaStreamTrack) => track.readyState === "ended"))).toBe(true);
    await contexts[0].setOffline(false);
    await expect.poll(() => a.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState !== "closed").length), { timeout: 20000 }).toBe(2);
    await expect.poll(() => a.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    await expect(a.locator(".social-mic")).toBeVisible();
    expect(await a.evaluate(() => (window as any).qaVoice.captures)).toBe(captures);
    const details = await (await request.get(`${api}/api/houses/${house.id}`, { headers })).json();
    expect(details.house.members.filter((member: any) => member.inCall)).toHaveLength(3);
    await c.evaluate(() => { (window as any).qaVoice.hold = true; });
    await c.locator(".social-mic").click();
    await expect.poll(() => c.evaluate(() => Boolean((window as any).qaVoice.release))).toBe(true);
    await c.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
    await c.getByRole("button", { name: "Sair da Party", exact: true }).click();
    await expect(c).toHaveURL(/\/app$/);
    await c.evaluate(() => (window as any).qaVoice.release());
    await expect.poll(() => c.evaluate(() => (window as any).qaVoice.tracks.every((track: MediaStreamTrack) => track.readyState === "ended"))).toBe(true);
    await connected(a, 1); await connected(b, 1);
    expect(await c.evaluate(() => (window as any).qaVoice.peers.every((peer: RTCPeerConnection) => peer.connectionState === "closed"))).toBe(true);
    expect(await c.evaluate(() => (window as any).qaVoice.audio.every((audio: HTMLAudioElement) => audio.srcObject === null))).toBe(true);
    } catch (error) {
      for (const [name, page] of [["A", a], ["B", b], ["C", c]] as const) console.info("RTC diagnostic", name, JSON.stringify(await page.evaluate(() => ({
        voice: document.querySelector(".social-call-status")?.textContent,
        tracks: ((window as any).qaVoice?.tracks ?? []).map((track: MediaStreamTrack) => ({ enabled: track.enabled, ready: track.readyState })),
        peers: ((window as any).qaVoice?.peers ?? []).map((peer: RTCPeerConnection) => ({ state: peer.connectionState, signaling: peer.signalingState, ice: peer.iceConnectionState, gathering: peer.iceGatheringState, slots: peer.getTransceivers().map((slot) => ({ kind: slot.receiver.track.kind, direction: slot.direction, current: slot.currentDirection, sender: slot.sender.track?.readyState, enabled: slot.sender.track?.enabled })) })),
      }))));
      throw error;
    }
  } finally { await rtcBrowser.close(); }
});

test("mobile contextual Party Chat, secondary tools, late join and player idle controls", async ({ browser, request }) => {
  test.setTimeout(120_000);
  fs.mkdirSync(path.join(root, "artifacts/m1"), { recursive: true });
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
      (window as any).qaPlayer = { created: 0, destroyed: 0, plays: 0, position: 0, state: -1, blocked: localStorage.getItem("qa.blocked") === "1" };
      (window as any).qaMicCaptures = 0;
      navigator.mediaDevices.getUserMedia = async () => { (window as any).qaMicCaptures++; throw new DOMException("QA denied", "NotAllowedError"); };
      (window as any).YT = { Player: class {
        events: any;
        constructor(_id: string, options: any) { (window as any).qaPlayer.created++; this.events = options.events; setTimeout(() => this.events.onReady(), 80); }
        cueVideoById() {} seekTo(value: number) { (window as any).qaPlayer.position = value; }
        playVideo() { const qa = (window as any).qaPlayer; qa.plays++; if (qa.blocked) this.events.onAutoplayBlocked(); else { qa.state = 1; this.events.onStateChange({ data: 1 }); } }
        pauseVideo() { (window as any).qaPlayer.state = 2; this.events.onStateChange({ data: 2 }); }
        getCurrentTime() { return (window as any).qaPlayer.position; } getPlayerState() { return (window as any).qaPlayer.state; }
        getDuration() { return 300; } getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; }
        setVolume() {} setPlaybackRate() {} mute() {} unMute() {} destroy() { (window as any).qaPlayer.destroyed++; }
      } };
    }, session);
    await context.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ body: "<html><body style='background:#101210;color:#a7f3c2'>Local media fixture</body></html>", contentType: "text/html" }));
    const page = await context.newPage();
    const pageErrors: string[] = []; page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${origin}/house/${house.id}`);
    await expect(page.getByRole("heading", { name: "Mobile QA Casa", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Abrir|Fechar|Ocultar) chat$/ })).toHaveCount(0);
    if ((await page.evaluate(() => (window as any).qaPlayer.state)) !== 1) {
      await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
      const playButton = page.getByRole("button", { name: "Reproduzir", exact: true });
      if (await playButton.isVisible()) {
        await playButton.tap({ timeout: 2000 }).catch(async (error) => {
          if ((await page.evaluate(() => (window as any).qaPlayer.state)) !== 1) throw error;
        });
      }
    }
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.plays)).toBeGreaterThan(0);
    await expect(page.locator(".mobile-party-chat button.chat-drag-handle")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Recolher chat|Expandir chat/ })).toHaveCount(0);
    const engine = () => page.evaluate(() => ({ created: (window as any).qaPlayer.created, destroyed: (window as any).qaPlayer.destroyed, position: (window as any).qaPlayer.position, plays: (window as any).qaPlayer.plays }));
    const originalEngine = await engine();
    const mediaNode = await page.locator("iframe.provider-player").elementHandle();
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Rascunho preservado na mídia");
    await page.getByRole("button", { name: "Pessoas da Party", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Fechar painel", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fechar painel", exact: true }).tap();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Rascunho preservado na mídia");
    await page.getByRole("button", { name: "Enviar mensagem" }).tap();
    await expect(page.getByText("Rascunho preservado na mídia", { exact: true })).toBeVisible();
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator(".mobile-party-chat")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      await expect(page.locator(".main-stage")).toHaveAttribute("data-view", "media");
      await expect(page.getByRole("button", { name: "Fila da Party", exact: false })).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const resumedEngine = await engine();
    expect(resumedEngine.created).toBe(originalEngine.created);
    expect(resumedEngine.destroyed).toBe(originalEngine.destroyed);
    expect(await mediaNode!.evaluate((node) => node === document.querySelector("iframe.provider-player"))).toBe(true);
    expect(await page.evaluate(() => (window as any).qaMicCaptures)).toBe(0);
    const assertPortraitLayout = async () => {
      await expect.poll(() => page.locator(".player-frame").evaluate((node) => Math.abs(node.getBoundingClientRect().width / node.getBoundingClientRect().height - 16 / 9))).toBeLessThan(0.02);
      // VisualViewport resize arrives asynchronously after setViewportSize/fullscreen.
      await expect.poll(() => page.evaluate(() => document.querySelector(".mobile-party-chat")!.getBoundingClientRect().height - document.querySelector(".player-frame")!.getBoundingClientRect().height)).toBeGreaterThan(0);
      const geometry = await page.evaluate(() => {
        const frame = document.querySelector(".player-frame")!.getBoundingClientRect(), chat = document.querySelector(".mobile-party-chat")!.getBoundingClientRect(), workspace = document.querySelector(".party-workspace")!.getBoundingClientRect();
        return { frame: frame.height, chat: chat.height, bottom: chat.bottom, workspaceBottom: workspace.bottom, gap: chat.top - frame.bottom, metadata: document.querySelector(".media-context")!.getBoundingClientRect().height };
      });
      expect(geometry.chat).toBeGreaterThan(geometry.frame);
      expect(Math.abs(geometry.bottom - geometry.workspaceBottom)).toBeLessThanOrEqual(1);
      expect(geometry.gap).toBeGreaterThanOrEqual(0);
      expect(geometry.gap).toBeLessThanOrEqual(geometry.metadata + 8);
      expect(await page.locator(".messages").evaluate((node) => getComputedStyle(node).overflowY)).toBe("auto");
    };
    await assertPortraitLayout();
    const videoHeight = await page.locator(".player-frame").evaluate((node) => node.getBoundingClientRect().height);
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await assertPortraitLayout();
      await page.screenshot({ path: `artifacts/m1/m1-video-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/mobile-video-proportion.png" });
    await expect(page.getByRole("button", { name: "Fechar chat", exact: true })).toHaveCount(0);
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no Ambiente", exact: true }).tap();
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await expect(page.locator(".music-presentation")).toBeVisible();
    expect(await page.locator(".player-frame").evaluate((node) => node.getBoundingClientRect().height)).toBeCloseTo(videoHeight, 2);
    await expect(page.locator("iframe.provider-player")).toHaveCSS("opacity", "1");
    await expect(page.locator(".music-presentation")).toHaveAttribute("data-lyrics", "unavailable");
    expect((await engine()).created).toBe(resumedEngine.created);
    expect((await engine()).destroyed).toBe(resumedEngine.destroyed);
    await expect.poll(() => page.locator(".music-presentation").evaluate((node) => Math.abs(node.getBoundingClientRect().height - node.parentElement!.clientHeight))).toBeLessThanOrEqual(1);
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await assertPortraitLayout();
      await page.screenshot({ path: `artifacts/m1/m1-ambient-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/mobile-ambiente.png" });
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Mobile message");
    await page.getByRole("button", { name: "Enviar mensagem" }).tap(); await expect(page.getByText("Mobile message", { exact: true })).toBeVisible();
    for (let index = 0; index < 12; index++) socket.emit("chat:message", { roomId: house.primaryRoomId, body: `Mensagem de scroll ${index}: conversa local de teste com texto suficiente para ocupar mais de uma linha.` });
    await expect(page.getByText(/Mensagem de scroll 11:/)).toBeVisible();
    await expect.poll(() => page.locator(".messages").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await page.locator(".messages").evaluate((node) => { node.scrollTop = 0; });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    for (const panel of ["people", "queue"] as const) {
      if (panel === "people") { await page.getByRole("button", { name: "Pessoas da Party", exact: true }).tap(); }
      else { await expect(page.getByRole("button", { name: "Fechar chat", exact: true })).toHaveCount(0); await page.getByRole("button", { name: /Fila da Party/ }).tap(); }
      const sheet = page.getByRole("complementary", { name: "Painel da Party" });
      await expect(sheet).toBeVisible();
      await expect(page.getByRole("tab", { name: "Chat", exact: true })).toHaveCount(0);
      const handle = page.getByRole("button", { name: "Recolher painel da Party" });
      await expect(handle).toBeVisible();
      await page.screenshot({ path: panel === "people" ? "test-results/mobile-people-sheet.png" : "test-results/mobile-queue-sheet.png" });
      await expect.poll(() => handle.boundingBox()).not.toBeNull();
      const box = await handle.boundingBox();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 10); await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 40, { steps: 8 });
      await expect(sheet).toHaveAttribute("data-dragging", "true");
      expect(await sheet.evaluate((node) => getComputedStyle(node).transform)).not.toBe("none");
      // A short, stationary gesture snaps back rather than dismissing.
      await page.waitForTimeout(150); await page.mouse.up();
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveCSS("transform", "none");
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 10); await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 300, { steps: 12 }); await page.mouse.up();
      await expect(sheet).toBeHidden();
      await expect(page.locator(".mobile-party-chat")).toBeVisible();
      expect((await engine()).created).toBe(resumedEngine.created); expect((await engine()).destroyed).toBe(resumedEngine.destroyed);
      if (panel === "people") { if (await page.getByRole("button", { name: "Abrir chat", exact: true }).isVisible()) await page.getByRole("button", { name: "Abrir chat", exact: true }).tap();
      await page.getByRole("button", { name: "Pessoas da Party", exact: true }).tap(); }
      else await page.getByRole("button", { name: /Fila da Party/ }).tap();
      await page.getByRole("button", { name: "Recolher painel da Party" }).tap();
      await expect(sheet).toBeHidden();
      if (panel === "people") { if (await page.getByRole("button", { name: "Abrir chat", exact: true }).isVisible()) await page.getByRole("button", { name: "Abrir chat", exact: true }).tap();
      await page.getByRole("button", { name: "Pessoas da Party", exact: true }).tap(); }
      else await page.getByRole("button", { name: /Fila da Party/ }).tap();
      await page.getByRole("button", { name: "Recolher painel da Party" }).focus();
      await page.keyboard.press("Enter"); await expect(sheet).toBeHidden();
      await expect(page.locator(".mobile-party-chat")).toBeVisible();
    }
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await assertPortraitLayout();
    }
    await page.screenshot({ path: "test-results/mobile-chat-430.png" });
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    await expect(page.getByRole("button", { name: /^Ativar microfone/ }).last()).toBeVisible();
    expect(await page.evaluate(() => (window as any).qaMicCaptures)).toBe(0);
    await page.getByRole("button", { name: /^Ativar microfone/ }).last().tap();
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    await expect(page.locator(".mobile-call-menu")).toContainText("Microfone bloqueado");
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => (window as any).qaMicCaptures)).toBe(1);
    await page.screenshot({ path: "test-results/mobile-automatic-voice.png" });
    await expect(page.getByRole("button", { name: "Fechar chat", exact: true })).toHaveCount(0);
    const currentMediaState = await new Promise<any>((resolve) => { socket.once("media:sync", resolve); socket.emit("media:request-sync", { roomId: house.primaryRoomId }); });
    expect(currentMediaState.state).toBe("playing");
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "1");
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "0", { timeout: 5000 });
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no modo cinema", exact: true }).tap();
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await page.getByRole("button", { name: "Sair do modo cinema", exact: true }).tap();
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await expect.poll(() => page.locator(".party-workspace").evaluate((node) => getComputedStyle(node).display)).toBe("flex");
    const landscape = await page.evaluate(() => { const frame = document.querySelector(".player-frame")!.getBoundingClientRect(), chat = document.querySelector(".mobile-party-chat")!.getBoundingClientRect(); return { ratio: frame.width / frame.height, chatLeft: chat.left, chatRight: chat.right }; });
    expect(Math.abs(landscape.ratio - 16 / 9)).toBeLessThan(0.02);
    expect(landscape.chatLeft).toBeGreaterThanOrEqual(0);
    expect(landscape.chatRight).toBeLessThanOrEqual(844);
    await page.locator(".mobile-party-chat").evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: "test-results/mobile-landscape.png" });
    const landscapeComposer = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox();
    expect(landscapeComposer!.y + landscapeComposer!.height).toBeLessThanOrEqual(390);
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Fullscreen draft");
    await page.locator(".messages").evaluate((node) => { node.scrollTop = 60; });
    const scrollBeforeFullscreen = await page.locator(".messages").evaluate((node) => node.scrollTop);
    await expect(page.getByRole("button", { name: "Ocultar chat", exact: true })).toHaveCount(0);
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Tela cheia", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement || document.querySelector(".fallback-fullscreen")))).toBe(true);
    await expect(page.locator(".mobile-party-chat")).toBeHidden();
    await expect(page.locator(".music-presentation")).toBeVisible();
    expect((await engine()).created).toBe(resumedEngine.created);
    await page.screenshot({ path: "test-results/mobile-fullscreen.png" });
    await page.screenshot({ path: "artifacts/m1/m1-fullscreen-ambient.png" });
    await page.getByRole("button", { name: "Sair do Ambiente", exact: true }).tap();
    await expect(page.locator(".music-presentation")).toHaveCount(0);
    await expect(page.locator(".provider-player")).toHaveCSS("opacity", "1");
    const fullscreenVideo = await page.locator("iframe.provider-player").boundingBox();
    expect(fullscreenVideo!.width / fullscreenVideo!.height).toBeCloseTo(16 / 9, 1);
    await page.screenshot({ path: "test-results/mobile-video-fullscreen.png" });
    await page.screenshot({ path: "artifacts/m1/m1-fullscreen-video.png" });
    await page.getByRole("button", { name: /Sair da tela (cheia|ampliada)/ }).tap();
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Fullscreen draft");
    expect(await page.locator(".messages").evaluate((node) => node.scrollTop)).toBe(scrollBeforeFullscreen);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertPortraitLayout();
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Rascunho preservado");
    // VisualViewport can shrink while CSS orientation remains portrait.
    await page.evaluate(() => document.documentElement.style.setProperty("--visual-height", "320px"));
    await expect.poll(async () => { const box = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(320);
    await expect.poll(() => page.locator(".player-frame").evaluate((node) => Math.abs(node.getBoundingClientRect().width / node.getBoundingClientRect().height - 16 / 9))).toBeLessThan(0.02);
    await page.screenshot({ path: "test-results/mobile-visual-viewport.png" });
    await page.evaluate(() => document.documentElement.style.removeProperty("--visual-height"));
    await assertPortraitLayout();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Rascunho preservado");
    await expect(page.getByRole("button", { name: "Fechar chat", exact: true })).toHaveCount(0);
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Pausar", exact: true }).tap();
    await page.reload();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(2);
    expect(await page.evaluate(() => (window as any).qaPlayer.plays)).toBe(0);
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "1");
    await page.getByRole("button", { name: "Reproduzir", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    await page.evaluate(() => localStorage.setItem("qa.blocked", "1")); await page.reload();
    await expect(page.getByText("Toque para continuar", { exact: true })).toBeVisible();
    await page.evaluate(() => { (window as any).qaPlayer.blocked = false; localStorage.removeItem("qa.blocked"); });
    await page.getByRole("button", { name: "Continuar", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    await expect(page.getByText("Toque para continuar", { exact: true })).toBeHidden();
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no Ambiente", exact: true }).tap();
    await page.reload();
    await expect(page.locator(".music-presentation")).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    // Presentation also covers the desktop surface without a new engine.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".music-presentation")).toBeVisible();
    await expect.poll(() => page.locator(".music-presentation").evaluate((node) => Math.abs(node.getBoundingClientRect().height - node.parentElement!.clientHeight))).toBeLessThanOrEqual(1);
    const settleDesktopLayout = () => page.locator(".main-stage,.now-playing").evaluateAll((nodes) => Promise.all(nodes.flatMap((node) => node.getAnimations().map((animation) => animation.finished.then(() => undefined)))));
    await settleDesktopLayout();
    await page.screenshot({ path: "test-results/desktop-ambiente.png" });
    await page.screenshot({ path: "artifacts/m1/m1-ambient-desktop.png" });
    for (const [width, height] of [[1280, 720], [1280, 900], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await settleDesktopLayout();
      await page.screenshot({ path: `artifacts/m1/m1-ambient-${width}x${height}.png` });
    }
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Sair do Ambiente", exact: true }).tap();
    for (const [width, height] of [[1280, 720], [1280, 900], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await settleDesktopLayout();
      await page.screenshot({ path: `artifacts/m1/m1-video-${width}x${height}.png` });
    }
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no Ambiente", exact: true }).tap();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "Abrir menu da Casa e Party", exact: true }).tap();
    await page.getByRole("button", { name: "Luz ambiente ligada", exact: true }).tap();
    await expect(page.locator(".ambient-glow")).toHaveCSS("opacity", "0");
    await page.getByRole("button", { name: "Luz ambiente desligada", exact: true }).tap();
    await page.getByRole("button", { name: "Abrir menu da Casa e Party", exact: true }).tap();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".ambient-glow")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".ambient-glow")).toHaveCSS("opacity", "0.26");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Artwork failure and media change keep the supported fallback, not a broken image.
    await context.route("https://i.ytimg.com/**", (route) => route.abort());
    const secondItem = { ...item, id: crypto.randomUUID(), providerMediaId: "M7lc1UVf-VE", title: "Uma noite inteira de música com a turma — título longo para conferir o layout 🎵 音楽" };
    expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item: secondItem })).ok).toBe(true);
    expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item: secondItem })).ok).toBe(true);
    await expect(page.locator(".music-presentation").getByText(secondItem.title, { exact: true })).toBeVisible();
    await expect(page.locator(".music-cover img.ambient-brand")).toHaveAttribute("alt", "");
    await page.screenshot({ path: "artifacts/m1/m1-ambient-no-artwork.png" });
    await page.screenshot({ path: "artifacts/m1/m1-ambient-long-title.png" });
    expect((await engine()).created).toBe(1); expect((await engine()).destroyed).toBe(0);
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("slider", { name: "Posição da reprodução" }).focus();
    await page.keyboard.press("ArrowRight");
    const seekPosition = (await engine()).position;
    await page.getByRole("button", { name: "Pausar", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(2);
    await page.getByRole("button", { name: "Reproduzir", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    expect((await engine()).position).toBeGreaterThanOrEqual(seekPosition);
    await page.setViewportSize({ width: 320, height: 450 });
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Keyboard-sized viewport");
    const input = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox(); expect(input!.y + input!.height).toBeLessThanOrEqual(450);
    await page.screenshot({ path: "test-results/mobile-short-viewport.png" });
    await page.reload(); await expect(page.locator(".mobile-party-chat")).toBeVisible(); await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    expect(await page.locator(".reaction-actions,.reaction-float").count()).toBe(0);
    expect(fs.readFileSync(path.join(serverRoot, "src/index.ts"), "utf8")).not.toContain("reaction:send");
    expect(fs.readFileSync(path.join(root, "packages/shared/src/index.ts"), "utf8")).not.toContain("reaction:send");
    expect(pageErrors).toEqual([]);
  } finally { socket.disconnect(); await context.close(); }
});

// Isolated layout fixture: actual MediaStage markup/CSS + locally generated video.
// This covers native video sizing used by Drive, NOT authenticated Google streaming.
test("Drive native video keeps portrait/4:3/16:9 content contained in the mobile canvas", async ({ page }) => {
  const player = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { MediaStage } from "./src/components/MediaStage.tsx";
    const noop = () => undefined;
    console.log(renderToStaticMarkup(createElement(MediaStage, {
      media: { provider: "google-drive", mediaId: "local-native-fixture", title: "Drive layout fixture", type: "video", state: "paused", position: 0, duration: 60, playbackRate: 1, startedAt: null, updatedAt: 0, controlledBy: "qa", revision: 1 },
      roomId: "fixture", apiUrl: "", token: "", theater: false, ambient: false, musicView: false, volume: 50, effectiveVolume: 50, resyncToken: 0,
      onSkip: noop, onRemove: noop, onAddMedia: noop, onEnded: noop, onTheaterChange: noop, onFullscreenChange: noop, onMusicViewChange: noop, onVolumeChange: noop, onPlaybackCommand: () => true,
    })));
  `], { cwd: webRoot, encoding: "utf8" });
  const origin = `http://127.0.0.1:${webPort}`;
  await page.route(`${origin}/qa-native-layout`, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"></head><body><div class="app-shell mobile-party"><main class="party-main"><header class="party-header">Native video layout</header><div class="party-workspace"><section class="party-content"><section class="main-stage"><div class="stage-layer active">${player}</div></section></section><section class="mobile-party-chat"><header class="mobile-chat-heading">Chat da Party</header><div class="mobile-chat-body"><div class="chat-panel"><div class="messages"></div><form class="chat-form"><input aria-label="Mensagem" placeholder="Escreva uma mensagem..."></form></div></div></section></div></main></div></body></html>` }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/qa-native-layout`);
  await expect(page.locator(".player-frame")).toHaveCSS("aspect-ratio", "16 / 9");
  for (const dimensions of [{ width: 180, height: 320 }, { width: 320, height: 240 }, { width: 320, height: 180 }]) {
    const native = await page.evaluate(async ({ width, height }) => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.fillRect(0, 0, width, height);
      const stream = canvas.captureStream(10), chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
      recorder.start();
      // A static canvas may produce no encoded frames in headless Windows Chromium.
      const frames = setInterval(() => canvas.getContext("2d")!.fillRect(0, 0, width, height), 40);
      await new Promise((resolve) => setTimeout(resolve, 400)); clearInterval(frames); recorder.stop(); await stopped;
      const video = document.querySelector<HTMLVideoElement>("video.provider-player")!;
      const source = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
      try {
        const loaded = new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Native fixture failed")); });
        video.src = source; await loaded;
        return { width: video.videoWidth, height: video.videoHeight, fit: getComputedStyle(video).objectFit };
      } finally { stream.getTracks().forEach((track) => track.stop()); URL.revokeObjectURL(source); }
    }, dimensions);
    expect(native.width / native.height).toBeCloseTo(dimensions.width / dimensions.height, 2);
    expect(native.fit).toBe("contain");
    const frame = await page.locator(".player-frame").boundingBox();
    expect(frame!.width / frame!.height).toBeCloseTo(16 / 9, 1);
  }
  await page.screenshot({ path: "test-results/mobile-native-video.png" });
});

test("M1 three clients keep playback shared and Ambiente local through late join and media switches", async ({ browser, request }) => {
  test.setTimeout(90_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const name of ["M1 Ana", "M1 Bia", "M1 Caio"]) {
    const email = `m1-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: name, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const { house } = await (await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${sessions[0].token}` }, data: { name: "M1 Multi QA" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers: { Authorization: `Bearer ${sessions[0].token}` }, data: { expiresInHours: 1, maxUses: 2 } })).json();
  for (const session of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.code}/accept`, { headers: { Authorization: `Bearer ${session.token}` } })).ok()).toBe(true);
  const contexts = await Promise.all(sessions.map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
  const socket = io(api, { autoConnect: false, auth: { token: sessions[0].token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
  try {
    for (let index = 0; index < 3; index++) {
      await contexts[index].addInitScript((session) => {
        if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
        localStorage.setItem("lumio.session.v1", JSON.stringify(session));
        (window as any).qaM1 = { created: 0, destroyed: 0, state: -1, position: 0 };
        (window as any).YT = { Player: class {
          events: any;
          constructor(_id: string, options: any) { (window as any).qaM1.created++; this.events = options.events; queueMicrotask(() => this.events.onReady()); }
          cueVideoById() {} seekTo(value: number) { (window as any).qaM1.position = value; }
          playVideo() { (window as any).qaM1.state = 1; this.events.onStateChange({ data: 1 }); }
          pauseVideo() { (window as any).qaM1.state = 2; this.events.onStateChange({ data: 2 }); }
          getCurrentTime() { return (window as any).qaM1.position; } getPlayerState() { return (window as any).qaM1.state; }
          getDuration() { return 300; } getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; }
          setVolume() {} setPlaybackRate() {} mute() {} unMute() {} destroy() { (window as any).qaM1.destroyed++; }
        } };
      }, sessions[index]);
      await contexts[index].route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ body: "<html><body style='background:#101210;color:#a7f3c2'>M1 local fixture</body></html>", contentType: "text/html" }));
    }
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all([a.goto(`${origin}/house/${house.id}`), b.goto(`${origin}/house/${house.id}`)]);
    await expect(a.getByRole("heading", { name: "M1 Multi QA" })).toBeVisible({ timeout: 20000 });
    await expect(b.getByRole("heading", { name: "M1 Multi QA" })).toBeVisible({ timeout: 20000 });
    const joined = new Promise<void>((resolve, reject) => { socket.once("room:snapshot", () => resolve()); socket.once("connect_error", reject); });
    socket.on("connect", () => socket.emit("room:join", { roomId: house.primaryRoomId, user: sessions[0].user })); socket.connect(); await joined;
    const item = (id: string, title: string) => ({ id: crypto.randomUUID(), provider: "youtube", providerMediaId: id, type: "video", title, duration: 300, addedBy: sessions[0].user, addedAt: new Date().toISOString() });
    const first = item("dQw4w9WgXcQ", "M1 primeira mídia");
    expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item: first })).ok).toBe(true);
    expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item: first })).ok).toBe(true);
    await expect(a.locator(".now-playing h2")).toHaveText(first.title);
    await expect(b.locator(".now-playing h2")).toHaveText(first.title);
    await expect.poll(() => a.evaluate(() => (window as any).qaM1.created)).toBe(1);
    await expect.poll(() => b.evaluate(() => (window as any).qaM1.created)).toBe(1);
    await b.getByRole("button", { name: "Entrar no Ambiente", exact: true }).click();
    await expect(b.locator(".music-presentation")).toBeVisible();
    await expect(a.locator(".music-presentation")).toHaveCount(0);
    expect(await b.evaluate(() => (window as any).qaM1.created)).toBe(1);
    // The room may already be playing when the first item becomes current.
    if (await a.evaluate(() => (window as any).qaM1.state !== 1)) {
      await a.locator(".player-touch-surface").hover();
      await a.getByRole("button", { name: "Reproduzir", exact: true }).click();
    }
    await expect(b.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
    await c.goto(`${origin}/house/${house.id}`);
    await expect(c.locator(".now-playing h2")).toHaveText(first.title);
    await expect(c.locator(".music-presentation")).toHaveCount(0);
    await expect.poll(() => c.evaluate(() => (window as any).qaM1.state)).toBe(1);
    await a.locator(".player-touch-surface").hover();
    await a.getByRole("slider", { name: "Posição da reprodução" }).focus(); await a.keyboard.press("ArrowRight");
    await expect.poll(async () => Number(await b.getByRole("slider", { name: "Posição da reprodução" }).inputValue())).toBeGreaterThan(1);
    const second = item("M7lc1UVf-VE", "M1 mídia intermediária"), third = item("jfKfPfyJRdk", "M1 mídia final");
    for (const next of [second, third]) {
      expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item: next })).ok).toBe(true);
      expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item: next })).ok).toBe(true);
    }
    for (const page of [a, b, c]) await expect(page.locator(".now-playing h2")).toHaveText(third.title);
    await expect(b.locator(".music-presentation strong")).toHaveText(third.title);
    await expect(a.locator(".music-presentation")).toHaveCount(0);
    await expect(c.locator(".music-presentation")).toHaveCount(0);
    for (const page of [a, b, c]) expect(await page.evaluate(() => (window as any).qaM1.created)).toBe(1);
    fs.mkdirSync(path.join(root, "artifacts/m1"), { recursive: true });
    await b.screenshot({ path: "artifacts/m1/m1-multi-client-b-ambient.png" });
    await a.screenshot({ path: "artifacts/m1/m1-multi-client-a-video.png" });
  } finally { socket.disconnect(); for (const context of contexts) await context.close(); }
});

test("M2 three browsers share favorites and collections without disturbing playback", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const name of ["M2 Ana", "M2 Bia", "M2 Caio"]) {
    const email = `m2-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: name, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  m2QaSessions = sessions;
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "M2 Library QA" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 2 } })).json();
  for (const session of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.code}/accept`, { headers: { Authorization: `Bearer ${session.token}` } })).status()).toBe(200);
  const contexts = await Promise.all(sessions.map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
  const socket = io(api, { autoConnect: false, auth: { token: sessions[0].token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
  try {
    for (let index = 0; index < contexts.length; index++) await contexts[index].addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), sessions[index]);
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all([a.goto(`${origin}/house/${house.id}`), b.goto(`${origin}/house/${house.id}`)]);
    const joined = new Promise<void>((resolve, reject) => { socket.once("room:snapshot", () => resolve()); socket.once("connect_error", reject); });
    socket.on("connect", () => socket.emit("room:join", { roomId: house.primaryRoomId, user: sessions[0].user })); socket.connect(); await joined;
    const media = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: "dQw4w9WgXcQ", type: "video", title: "M2 shared media com um título suficientemente longo para testar o layout", duration: 300, addedBy: sessions[0].user, addedAt: new Date().toISOString() };
    expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item: media })).ok).toBe(true);
    expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item: media })).ok).toBe(true);
    await expect(a.locator(".now-playing h2")).toHaveText(media.title);
    await expect(b.locator(".now-playing h2")).toHaveText(media.title);
    const before = await a.locator(".now-playing h2").textContent();
    await b.locator(".media-session-actions").getByRole("button", { name: "Adicionar mídia" }).click();
    const hubB = b.getByRole("dialog", { name: "A mídia da Casa" });
    await hubB.getByRole("button", { name: "Biblioteca", exact: true }).click();
    await hubB.getByRole("combobox", { name: "Filtrar biblioteca" }).selectOption("favorites");
    await expect(hubB.getByRole("heading", { name: "Nenhum favorito nesta Casa" })).toBeVisible();
    await expect(hubB.getByText("Carregando biblioteca...")).toBeHidden();
    await b.screenshot({ path: "artifacts/m2/m2-favorites-empty.png" });
    await a.getByRole("button", { name: "Salvar nos favoritos da Casa" }).click();
    await expect(a.getByRole("button", { name: "Remover dos favoritos da Casa" })).toBeVisible();
    await expect(hubB.locator(".media-row").filter({ hasText: media.title })).toBeVisible();
    await hubB.getByRole("button", { name: "Playlists", exact: true }).click();
    await hubB.getByRole("button", { name: "Nova playlist" }).first().click();
    await b.screenshot({ path: "artifacts/m2/m2-create-collection.png" });
    await hubB.getByRole("textbox", { name: "Nome" }).fill("M2 shared collection");
    await hubB.getByRole("button", { name: "Criar", exact: true }).click();
    await expect(hubB.locator(".playlist-detail header h3")).toHaveText("M2 shared collection");
    await b.screenshot({ path: "artifacts/m2/m2-collection-empty.png" });
    await hubB.getByLabel("Mais opções").click();
    await hubB.getByRole("button", { name: "Editar detalhes" }).click();
    await b.screenshot({ path: "artifacts/m2/m2-edit-collection.png" });
    await hubB.getByRole("button", { name: "Cancelar" }).click();
    await hubB.getByLabel("Mais opções").click();
    await a.locator(".media-session-actions").getByRole("button", { name: "Adicionar mídia" }).click();
    const hubA = a.getByRole("dialog", { name: "A mídia da Casa" });
    await hubA.getByRole("button", { name: "Biblioteca", exact: true }).click();
    const row = hubA.locator(".media-row").filter({ hasText: media.title });
    await expect(row).toBeVisible();
    await row.getByLabel(`Mais ações para ${media.title}`).click();
    await row.getByRole("button", { name: `Adicionar ${media.title} à playlist` }).click();
    await a.screenshot({ path: "artifacts/m2/m2-add-to-collection.png" });
    await hubA.getByRole("button", { name: /M2 shared collection/ }).click();
    await expect(hubB.locator(".playlist-items li")).toHaveCount(1);
    await b.screenshot({ path: "artifacts/m2/m2-collection-open-desktop.png" });
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await b.setViewportSize({ width, height: 844 });
      expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await hubB.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await b.screenshot({ path: `artifacts/m2/m2-collection-${width}.png` });
    }
    await b.setViewportSize({ width: 1280, height: 900 });
    await hubA.getByRole("combobox", { name: "Filtrar biblioteca" }).selectOption("favorites");
    await expect(row).toBeVisible();
    await a.screenshot({ path: "artifacts/m2/m2-favorites-desktop.png" });
    await hubA.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(hubA.locator(".media-row").filter({ hasText: media.title })).toBeVisible();
    await a.screenshot({ path: "artifacts/m2/m2-recents-desktop.png" });
    await hubA.getByRole("button", { name: "Google Drive", exact: true }).click();
    await a.screenshot({ path: "artifacts/m2/m2-drive-unavailable.png" });
    await hubA.getByRole("button", { name: "Descobrir", exact: true }).click();
    await hubA.getByRole("textbox", { name: "Pesquisar no YouTube ou colar URL" }).fill("m2 teste de erro sem chave");
    await expect(hubA.getByRole("alert")).toBeVisible();
    await a.screenshot({ path: "artifacts/m2/m2-error.png" });
    await hubA.getByRole("button", { name: "Biblioteca", exact: true }).click();
    expect(await a.locator(".now-playing h2").textContent()).toBe(before);
    expect(await b.locator(".now-playing h2").textContent()).toBe(before);
    await hubB.getByRole("button", { name: `Adicionar ${media.title} à fila` }).click();
    await hubB.getByRole("button", { name: "Fechar Media Hub" }).click();
    await b.locator(".media-session-actions").getByRole("button", { name: /Fila da Party/ }).click();
    await expect(b.locator(".drawer-queue .queue-item")).toHaveCount(2);
    await c.goto(`${origin}/house/${house.id}`);
    await expect(c.locator(".now-playing h2")).toHaveText(media.title);
    await c.locator(".media-session-actions").getByRole("button", { name: "Adicionar mídia" }).click();
    const hubC = c.getByRole("dialog", { name: "A mídia da Casa" });
    await hubC.getByRole("button", { name: "Playlists", exact: true }).click();
    await expect(hubC.getByRole("button", { name: /M2 shared collection/ })).toBeVisible();
    await hubC.getByRole("button", { name: "Biblioteca", exact: true }).click();
    await expect(hubC.locator(".media-row").filter({ hasText: media.title })).toBeVisible();
    await a.screenshot({ path: "artifacts/m2/m2-party-player-preserved.png" });
    await a.screenshot({ path: "artifacts/m2/m2-hub-open-desktop.png" });
  } finally { socket.disconnect(); for (const context of contexts) await context.close(); }
});

test("M3 Queue V2: three clients converge through reorder, stale action, late join, batch and reconnect", async ({ browser, request }) => {
  test.setTimeout(180_000);
  fs.mkdirSync("artifacts/m3", { recursive: true });
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = m2QaSessions ? [...m2QaSessions] : [];
  for (const name of sessions.length ? [] : ["M3 Ana", "M3 Bia", "M3 Caio"]) {
    const email = `m3-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: name, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "M3 Queue QA" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 2 } })).json();
  for (const session of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.code}/accept`, { headers: { Authorization: `Bearer ${session.token}` } })).status()).toBe(200);
  const contexts = await Promise.all(sessions.map((_, index) => browser.newContext({ viewport: { width: index === 1 ? 390 : 1280, height: index === 1 ? 844 : 900 }, isMobile: index === 1, hasTouch: index === 1 })));
  const sockets = sessions.map((session) => io(api, { autoConnect: false, auth: { token: session.token }, transports: ["websocket"], extraHeaders: { Origin: origin } }));
  const roomId = house.primaryRoomId;
  const joinSocket = async (index: number) => { const s = sockets[index]; const joined = new Promise<any>((resolve, reject) => { s.once("room:snapshot", resolve); s.once("connect_error", reject); }); s.once("connect", () => s.emit("room:join", { roomId, user: sessions[index].user })); s.connect(); return joined; };
  const item = (id: string, owner: number) => ({ id: crypto.randomUUID(), provider: "youtube", providerMediaId: id, type: "video", title: `M3 mídia ${id}`, duration: 180, addedBy: sessions[owner].user, addedAt: new Date().toISOString() });
  try {
    for (let index = 0; index < contexts.length; index++) await contexts[index].addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), sessions[index]);
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    const errors: string[] = [];
    for (const page of [a, b, c]) page.on("pageerror", (error) => errors.push(error.message));
    await Promise.all([a.goto(`${origin}/house/${house.id}`), b.goto(`${origin}/house/${house.id}`)]);
    await a.locator(".media-session-actions").getByRole("button", { name: /Fila da Party/ }).click();
    await expect(a.locator(".queue-empty")).toBeVisible();
    await a.screenshot({ path: "artifacts/m3/m3-queue-empty-desktop.png" });
    await b.locator(".mobile-chat-heading").getByRole("button", { name: /Fila da Party/ }).click();
    await expect(b.locator(".queue-empty")).toBeVisible();
    await b.screenshot({ path: "artifacts/m3/m3-queue-empty-mobile.png" });
    await b.getByRole("button", { name: "Fechar painel" }).click();
    const initial = await joinSocket(0); await joinSocket(1);
    sockets[0].emit("room:settings", { roomId, settings: { ...initial.settings, mediaControl: "everyone", queueControl: "members" } });
    const first = item("dQw4w9WgXcQ", 0), second = item("kXYiU_JCYtU", 1), third = item("3tmd-ClpJxA", 0);
    first.title = "M3 vídeo com um título bem longo para conferir truncamento e leitura da fila no celular";
    expect((await sockets[0].timeout(5000).emitWithAck("queue:add", { roomId, item: first })).ok).toBe(true);
    expect((await sockets[0].timeout(5000).emitWithAck("media:change", { roomId, item: first })).ok).toBe(true);
    expect((await sockets[1].timeout(5000).emitWithAck("queue:add", { roomId, item: second })).ok).toBe(true);
    expect((await sockets[0].timeout(5000).emitWithAck("queue:add", { roomId, item: third })).ok).toBe(true);
    await c.goto(`${origin}/house/${house.id}`); const late = await joinSocket(2);
    expect(late.queue.map((entry: { id: string }) => entry.id)).toEqual([first.id, second.id, third.id]);
    await expect(a.locator(".queue-group").first()).toContainText(first.title);
    await expect(a.locator(".queue-group").last()).toContainText(second.title);
    await a.screenshot({ path: "artifacts/m3/m3-queue-desktop.png" });
    sockets[0].emit("room:settings", { roomId, settings: { ...initial.settings, mediaControl: "everyone", queueControl: "members", autoplayNext: false } });
    await expect(a.locator(".queue-toolbar")).toContainText("Aguarda avanço manual");
    await a.screenshot({ path: "artifacts/m3/m3-autoplay-off.png" });
    sockets[0].emit("room:settings", { roomId, settings: { ...initial.settings, mediaControl: "everyone", queueControl: "members", autoplayNext: true } });
    await expect(a.locator(".queue-toolbar")).toContainText("Avança automaticamente");
    const oldRevision = late.queueRevision;
    const moved = await sockets[1].timeout(5000).emitWithAck("queue:move", { roomId, itemId: third.id, toIndex: 1, revision: oldRevision });
    expect(moved.ok).toBe(true);
    await expect(a.locator(".queue-group").last().locator(".queue-item").first()).toContainText(third.title);
    await a.screenshot({ path: "artifacts/m3/m3-reorder-desktop.png" });
    const stale = await sockets[0].timeout(5000).emitWithAck("queue:move", { roomId, itemId: second.id, toIndex: 1, revision: oldRevision });
    expect(stale.ok).toBe(false); expect(stale.queue.map((entry: { id: string }) => entry.id)).toEqual([first.id, third.id, second.id]);
    await expect(a.locator(".queue-group").last().locator(".queue-item").first()).toContainText(third.title);
    await b.locator(".mobile-chat-heading").getByRole("button", { name: /Fila da Party/ }).click();
    await expect(b.locator(".queue-group").last().locator(".queue-item").first()).toContainText(third.title);
    await b.screenshot({ path: "artifacts/m3/m3-queue-mobile.png" });
    await b.getByRole("button", { name: `Opções para ${third.title}` }).click();
    await b.screenshot({ path: "artifacts/m3/m3-queue-menu-mobile.png" });
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await b.setViewportSize({ width, height: 844 });
      expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await b.screenshot({ path: `artifacts/m3/m3-queue-${width}.png` });
    }
    const removed = await sockets[0].timeout(5000).emitWithAck("queue:remove", { roomId, itemId: second.id, revision: moved.revision });
    expect(removed.ok).toBe(true);
    const collection = await (await request.post(`${api}/api/media-hub/${roomId}/playlists`, { headers, data: { name: "M3 coleção" } })).json();
    const playlistId = collection.playlist.id;
    expect((await request.post(`${api}/api/media-hub/${roomId}/playlists/${playlistId}/items`, { headers, data: { item: { ...third, id: "media-third" } } })).ok()).toBe(true);
    const batchId = crypto.randomUUID();
    const batch = await request.post(`${api}/api/media-hub/${roomId}/playlists/${playlistId}/queue`, { headers, data: { mode: "append", playNow: false, revision: removed.revision, operationId: batchId } });
    expect(batch.status()).toBe(200);
    const retry = await request.post(`${api}/api/media-hub/${roomId}/playlists/${playlistId}/queue`, { headers, data: { mode: "append", playNow: false, revision: removed.revision, operationId: batchId } });
    expect((await retry.json()).duplicate).toBe(true);
    sockets[1].disconnect(); await b.reload();
    if (!await b.getByRole("complementary", { name: "Painel da Party" }).isVisible()) await b.locator(".mobile-chat-heading").getByRole("button", { name: /Fila da Party/ }).click();
    await expect(b.locator(".queue-group").last().locator(".queue-item")).toHaveCount(2);
    const next = await sockets[0].timeout(5000).emitWithAck("queue:advance", { roomId, expectedMediaId: first.providerMediaId, expectedQueueItemId: first.id });
    const repeated = await sockets[2].timeout(5000).emitWithAck("queue:advance", { roomId, expectedMediaId: first.providerMediaId, expectedQueueItemId: first.id });
    expect(next.advanced).toBe(true); expect(repeated.advanced).toBe(false);
    await expect(a.locator(".queue-group").first()).toContainText(third.title);
    await expect(c.locator(".now-playing h2")).toHaveText(third.title);
    for (let index = 0; index < 15; index++) expect((await sockets[0].timeout(5000).emitWithAck("queue:add", { roomId, item: { ...item(`M3LIST${String(index).padStart(5, "0")}`, 0), title: `M3 lista longa ${index + 1}` } })).ok).toBe(true);
    await expect(a.locator(".queue-group").last().locator(".queue-item")).toHaveCount(16);
    await a.screenshot({ path: "artifacts/m3/m3-long-list-desktop.png" });
    await b.screenshot({ path: "artifacts/m3/m3-long-list-mobile.png" });
    await a.locator(".media-session-actions").getByRole("button", { name: "Adicionar mídia" }).click();
    const hub = a.getByRole("dialog", { name: "A mídia da Casa" });
    await hub.getByRole("button", { name: "Google Drive", exact: true }).click();
    await a.screenshot({ path: "artifacts/m3/m3-drive-unavailable-local.png" });
    await hub.getByRole("button", { name: "Fechar Media Hub" }).click();
    expect(errors).toEqual([]);
  } finally { for (const socket of sockets) socket.disconnect(); for (const context of contexts) await context.close(); }
});

test("GX2 Party transport, Call peers and tracks keep identity across visual child transitions", async ({ request }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  // Reuse verified E2E identities when the full suite reaches the signup rate limit.
  const sessions: any[] = m2QaSessions ? m2QaSessions.slice(0, 2) : [];
  for (const displayName of ["GX2 A", "GX2 B"].slice(sessions.length)) {
    const email = `gx2-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const last = fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!;
    const link = JSON.parse(last).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "GX2 Party lifetime" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 1, role: "MEMBER" } })).json();
  expect((await request.post(`${api}/api/invites/${invite.token}/accept`, { headers: { Authorization: `Bearer ${sessions[1].token}` } })).ok()).toBe(true);
  const rtcBrowser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const contexts = await Promise.all(sessions.map(() => rtcBrowser.newContext()));
    for (let index = 0; index < contexts.length; index++) await contexts[index].addInitScript((session) => {
      if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
      localStorage.setItem("lumio.session.v1", JSON.stringify(session));
      const qa = (window as any).gx2 = { sockets: [] as WebSocket[], peers: [] as RTCPeerConnection[], captures: [] as MediaStream[], displays: [] as MediaStream[], packets: [] as string[], before: null as any };
      const Transport = window.WebSocket;
      window.WebSocket = class extends Transport {
        constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); if (String(url).includes("/socket.io/")) qa.sockets.push(this); }
        send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
          if (typeof data === "string" && data.startsWith("42")) {
            try { const packet = JSON.parse(data.slice(2)); if (typeof packet[0] === "string") qa.packets.push(packet[0]); } catch { /* Not a Socket.IO event packet. */ }
          }
          super.send(data);
        }
      };
      const Peer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Peer { constructor(config?: RTCConfiguration) { super(config); qa.peers.push(this); } };
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => { const stream = await capture(constraints); qa.captures.push(stream); return stream; };
      navigator.mediaDevices.getDisplayMedia = async () => { const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 16; const stream = canvas.captureStream(1); qa.displays.push(stream); return stream; };
    }, sessions[index]);
    const [a, b] = await Promise.all(contexts.map((context) => context.newPage()));
    try {
      for (const page of [a, b]) {
        await page.goto(`${origin}/house/${house.id}`);
        await expect(page.locator(".social-call-status").first()).toHaveText("Call conectada", { timeout: 20_000 });
        expect(await page.evaluate(() => (window as any).gx2.captures.length)).toBe(0);
        expect(await page.evaluate(() => (window as any).gx2.sockets.length)).toBe(1);
      }
      await expect.poll(() => a.evaluate(() => (window as any).gx2.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20_000 }).toBe(1);
      await a.locator(".social-mic").click();
      await expect(a.locator(".social-mic")).toHaveAttribute("aria-pressed", "true");

      await b.getByRole("button", { name: "Desativar áudio da call", exact: true }).click();

      await a.getByRole("button", { name: "Compartilhar tela", exact: true }).click();
      await expect(a.getByRole("button", { name: "Parar compartilhamento de tela", exact: true })).toBeVisible();
      await a.getByRole("button", { name: "Abrir chat", exact: true }).click();
      await a.getByRole("textbox", { name: "Mensagem" }).fill("Rascunho GX2 permanece");
      for (const page of [a, b]) await page.evaluate(() => {
        const q = (window as any).gx2;
        q.before = { shell: document.querySelector(".app-shell"), socket: q.sockets[0], peers: [...q.peers], mic: q.captures[0]?.getAudioTracks()[0], display: q.displays[0]?.getVideoTracks()[0], captures: q.captures.length, displays: q.displays.length, packets: [...q.packets], player: document.querySelector(".lumio-player") };
      });
      for (let step = 0; step < 5; step++) {
        const page = step % 2 ? b : a;
        await page.getByRole("button", { name: "Fila da Party", exact: false }).click();
        await expect(page.locator(".drawer-queue")).toBeVisible();
        await page.getByRole("tab", { name: "Pessoas", exact: true }).click();
        await expect(page.locator(".members-panel")).toBeVisible();
        await page.getByRole("tab", { name: "Chat", exact: true }).click();
        await expect(page.locator(".chat-panel")).toBeVisible();
      }
      for (const page of [a, b]) expect(await page.evaluate(() => {
        const q = (window as any).gx2, before = q.before;
        const changed = q.packets.slice(before.packets.length);
        return {
          sameShell: document.querySelector(".app-shell") === before.shell,
          sameSocket: q.sockets.length === 1 && q.sockets[0] === before.socket && before.socket.readyState === WebSocket.OPEN,
          samePeers: q.peers.length === before.peers.length && q.peers.every((peer: RTCPeerConnection, index: number) => peer === before.peers[index] && peer.connectionState !== "closed"),
          sameMic: q.captures[0]?.getAudioTracks()[0] === before.mic,
          sameDisplay: q.displays[0]?.getVideoTracks()[0] === before.display,
          playerPreserved: document.querySelector(".lumio-player") === before.player,
          captures: q.captures.length - before.captures,
          displays: q.displays.length - before.displays,
          socialPackets: changed.filter((name: string) => ["room:join", "room:leave", "voice:join", "voice:leave"].includes(name)),
        };
      })).toEqual({ sameShell: true, sameSocket: true, samePeers: true, sameMic: true, sameDisplay: true, playerPreserved: true, captures: 0, displays: 0, socialPackets: [] });
      await expect(a.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Rascunho GX2 permanece");
      await expect(a.locator(".social-mic")).toHaveAttribute("aria-pressed", "true");

      await expect(b.getByRole("button", { name: "Ativar áudio da call", exact: true })).toBeVisible();
      await b.getByRole("textbox", { name: "Mensagem" }).fill("GX2 mensagem única");
      await b.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
      await expect(a.locator(".chat-panel .message").filter({ hasText: "GX2 mensagem única" })).toHaveCount(1);
      await expect(a.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Rascunho GX2 permanece");
      const details = await (await request.get(`${api}/api/houses/${house.id}`, { headers })).json();
      expect(details.house.members.filter((member: { inParty: boolean }) => member.inParty)).toHaveLength(2);
      fs.mkdirSync(path.join(root, "test-results/gx2"), { recursive: true });
      for (const width of [1440, 320, 375, 390, 412, 430]) {
        await a.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
        expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await a.screenshot({ path: path.join(root, `test-results/gx2/party-${width}.png`) });
      }
      await a.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
      await a.getByRole("button", { name: "Sair da Party", exact: true }).click();
      await expect(a).toHaveURL(/\/app$/);
      await expect.poll(() => a.evaluate(() => (window as any).gx2.peers.every((peer: RTCPeerConnection) => peer.connectionState === "closed") && (window as any).gx2.captures.every((stream: MediaStream) => stream.getTracks().every((track) => track.readyState === "ended")) && (window as any).gx2.displays.every((stream: MediaStream) => stream.getTracks().every((track) => track.readyState === "ended")))).toBe(true);
      expect(await a.evaluate(() => (window as any).gx2.packets.filter((name: string) => name === "room:leave").length)).toBe(1);
      expect(await a.evaluate(() => (window as any).gx2.sockets[0].readyState)).toBe(WebSocket.CLOSED);
    } finally { for (const context of contexts) await context.close(); }
  } finally { await rtcBrowser.close(); }
});

test("GX3 two tabs keep one Party while Media viewers govern authoritative playback", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  let session: any = m2QaSessions?.[0];
  if (!session) {
    const email = `gx3-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: "GX3 Viewer", email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    session = await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json();
  }
  const { house } = await (await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${session.token}` }, data: { name: "GX3 Viewer QA" } })).json();
  const contextA = await browser.newContext(), contextB = await browser.newContext();
  for (const context of [contextA, contextB]) {
    await context.addInitScript((value) => {
      if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
      localStorage.setItem("lumio.session.v1", JSON.stringify(value));
      (window as any).gx3Player = { created: 0, destroyed: 0 };
      (window as any).YT = { Player: class {
        events: any;
        constructor(_id: string, options: any) { (window as any).gx3Player.created++; this.events = options.events; queueMicrotask(() => this.events.onReady()); }
        cueVideoById() {} seekTo() {} playVideo() { this.events.onStateChange({ data: 1 }); } pauseVideo() { this.events.onStateChange({ data: 2 }); }
        getCurrentTime() { return 12; } getPlayerState() { return 1; } getDuration() { return 300; } getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; }
        setVolume() {} setPlaybackRate() {} mute() {} unMute() {} destroy() { (window as any).gx3Player.destroyed++; }
      } };
    }, session);
    await context.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ body: "<html><body>GX3 local fixture</body></html>", contentType: "text/html" }));
  }
  const a = await contextA.newPage(), b = await contextB.newPage();
  const controller = io(api, { autoConnect: false, auth: { token: session.token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
  const roomId: string = house.primaryRoomId;
  const sync = () => new Promise<any>((resolve) => { controller.once("media:sync", resolve); controller.emit("media:request-sync", { roomId }); });
  const roomSnapshot = () => new Promise<any>((resolve) => { controller.once("room:snapshot", resolve); controller.emit("room:join", { roomId, user: session.user }); });
  try {
    await Promise.all([a.goto(`${origin}/house/${house.id}/media`), b.goto(`${origin}/house/${house.id}/media`)]);
    await expect(a.locator(".main-stage")).toHaveAttribute("data-view", "media");
    await expect(b.locator(".main-stage")).toHaveAttribute("data-view", "media");
    const joined = new Promise<void>((resolve, reject) => { controller.once("room:snapshot", () => resolve()); controller.once("connect_error", reject); });
    controller.on("connect", () => controller.emit("room:join", { roomId, user: session.user })); controller.connect(); await joined;
    const item = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: "M7lc1UVf-VE", type: "video", title: "GX3 playback", duration: 300, addedBy: session.user, addedAt: new Date().toISOString() };
    expect((await controller.timeout(5000).emitWithAck("queue:add", { roomId, item })).ok).toBe(true);
    expect((await controller.timeout(5000).emitWithAck("media:change", { roomId, item })).ok).toBe(true);
    await expect(a.locator("iframe.provider-player")).toHaveCount(1);
    await expect(b.locator("iframe.provider-player")).toHaveCount(1);
    await expect.poll(async () => (await sync()).state).toBe("playing");
    const beforeQueue = await roomSnapshot();
    await a.close();
    expect((await sync()).state).toBe("playing");
    await b.close();
    await expect.poll(async () => (await sync()).state, { timeout: 8000 }).toBe("paused");
    const paused = await sync();
    expect(paused.mediaId).toBe(item.providerMediaId);
    const afterQueue = await roomSnapshot();
    expect(afterQueue.queueRevision).toBe(beforeQueue.queueRevision);
    expect(afterQueue.queue.map((entry: { id: string }) => entry.id)).toEqual(beforeQueue.queue.map((entry: { id: string }) => entry.id));
    expect(afterQueue.history.length).toBe(beforeQueue.history.length);
    const resumed = await contextA.newPage();
    await resumed.goto(`${origin}/house/${house.id}/games`);
    await expect(resumed).toHaveURL(`${origin}/house/${house.id}/media`);
    await expect(resumed.locator("iframe.provider-player")).toHaveCount(1);
    expect((await sync()).state).toBe("paused");
    await resumed.getByRole("button", { name: "Reproduzir", exact: true }).click();
    await expect.poll(async () => (await sync()).state).toBe("playing");
    await resumed.reload();
    await expect(resumed.locator(".main-stage")).toHaveAttribute("data-view", "media");
    fs.mkdirSync(path.join(root, "test-results/lx0"), { recursive: true });
    for (const width of [320, 390, 1440]) {
      await resumed.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      expect(await resumed.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await resumed.screenshot({ path: path.join(root, `test-results/lx0/media-${width}.png`) });
    }
  } finally { controller.disconnect(); await contextA.close(); await contextB.close(); }
});
