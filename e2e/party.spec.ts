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
  apiPort = await freePort();
  webPort = await freePort();
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
  await expect(page.getByRole("heading", { name: "Sua primeira Casa começa aqui." })).toBeVisible();
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
    await expect(guestPage).toHaveURL(`${origin}/house/${house.id}`);
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
    await expect(guestPage).toHaveURL(`${origin}/house/${house.id}`);
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
      await expect(page.locator(".dock-call-state").first()).toHaveText("Microfone desligado", { timeout: 20000 });
      await expect(page.getByRole("button", { name: "Ativar microfone", exact: true })).toBeVisible();
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
    await a.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await expect(a.getByRole("button", { name: "Desativar microfone", exact: true })).toBeVisible();
    await connected(b, 1); await expect.poll(() => packets(b), { timeout: 20000 }).toBeGreaterThan(0);
    await expect(b.getByRole("button", { name: "Ativar áudio da call", exact: true })).toBeVisible();
    await b.evaluate(() => { (window as any).qaVoice.blockAudio = false; });
    await b.getByRole("button", { name: "Ativar áudio da call", exact: true }).click();
    await expect.poll(() => b.evaluate(() => (window as any).qaVoice.audio.some((audio: HTMLAudioElement) => !audio.paused && !audio.muted))).toBe(true);
    await join(c);
    await expect.poll(() => c.evaluate(() => ({ ready: (window as any).qaVoice.peers.some((peer: RTCPeerConnection) => peer.connectionState === "connected"), peers: (window as any).qaVoice.peers.map((peer: RTCPeerConnection) => ({ state: peer.connectionState, signaling: peer.signalingState, ice: peer.iceConnectionState, slots: peer.getTransceivers().map((slot) => ({ kind: slot.receiver.track.kind, direction: slot.direction, current: slot.currentDirection, sender: Boolean(slot.sender.track) })) })), voice: document.querySelector(".dock-call-state")?.textContent })), { timeout: 20000 }).toMatchObject({ ready: true });
    await expect.poll(() => packets(c), { timeout: 20000 }).toBeGreaterThan(0);
    await b.evaluate(() => { (window as any).qaVoice.deny = true; });
    await b.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await expect(b.locator(".dock-call-state").first()).toContainText("Microfone indisponível");
    await expect(b.getByRole("button", { name: "Ativar microfone", exact: true })).toBeVisible();
    await expect.poll(() => b.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    const received = await packets(b); await expect.poll(() => packets(b), { timeout: 20000 }).toBeGreaterThan(received);
    await b.evaluate(() => { (window as any).qaVoice.deny = false; });
    await b.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await expect.poll(() => packets(a), { timeout: 20000 }).toBeGreaterThan(0);
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
    await expect(b.getByRole("button", { name: "Ativar microfone", exact: true })).toBeVisible();
    await b.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await a.getByRole("button", { name: "Desativar microfone", exact: true }).click();
    const aPackets = await packets(a); await expect.poll(() => packets(a), { timeout: 20000 }).toBeGreaterThan(aPackets);
    await a.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await expect(a.getByRole("button", { name: "Desativar microfone", exact: true })).toBeVisible();
    const captures = await a.evaluate(() => (window as any).qaVoice.captures);
    await contexts[0].setOffline(true);
    await expect.poll(() => a.evaluate(() => (window as any).qaVoice.tracks.every((track: MediaStreamTrack) => track.readyState === "ended"))).toBe(true);
    await contexts[0].setOffline(false);
    await expect.poll(() => a.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState !== "closed").length), { timeout: 20000 }).toBe(2);
    await expect.poll(() => a.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    await expect(a.getByRole("button", { name: "Ativar microfone", exact: true })).toBeVisible();
    expect(await a.evaluate(() => (window as any).qaVoice.captures)).toBe(captures);
    const details = await (await request.get(`${api}/api/houses/${house.id}`, { headers })).json();
    expect(details.house.members.filter((member: any) => member.inCall)).toHaveLength(3);
    await c.evaluate(() => { (window as any).qaVoice.hold = true; });
    await c.getByRole("button", { name: "Ativar microfone", exact: true }).click();
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
        voice: document.querySelector(".dock-call-state")?.textContent,
        tracks: (window as any).qaVoice.tracks.map((track: MediaStreamTrack) => ({ enabled: track.enabled, ready: track.readyState })),
        peers: (window as any).qaVoice.peers.map((peer: RTCPeerConnection) => ({ state: peer.connectionState, signaling: peer.signalingState, ice: peer.iceConnectionState, gathering: peer.iceGatheringState, slots: peer.getTransceivers().map((slot) => ({ kind: slot.receiver.track.kind, direction: slot.direction, current: slot.currentDirection, sender: slot.sender.track?.readyState, enabled: slot.sender.track?.enabled })) })),
      }))));
      throw error;
    }
  } finally { await rtcBrowser.close(); }
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
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.plays)).toBeGreaterThan(0);
    await expect(page.locator(".mobile-party-chat button.chat-drag-handle")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Recolher chat|Expandir chat/ })).toHaveCount(0);
    const engine = () => page.evaluate(() => ({ created: (window as any).qaPlayer.created, destroyed: (window as any).qaPlayer.destroyed, position: (window as any).qaPlayer.position, plays: (window as any).qaPlayer.plays }));
    const originalEngine = await engine();
    const assertPortraitLayout = async () => {
      await expect.poll(() => page.locator(".player-frame").evaluate((node) => Math.abs(node.getBoundingClientRect().width / node.getBoundingClientRect().height - 16 / 9))).toBeLessThan(0.02);
      // VisualViewport resize arrives asynchronously after setViewportSize/fullscreen.
      await expect.poll(() => page.evaluate(() => document.querySelector(".mobile-party-chat")!.getBoundingClientRect().height - document.querySelector(".player-frame")!.getBoundingClientRect().height)).toBeGreaterThan(0);
      const geometry = await page.evaluate(() => {
        const frame = document.querySelector(".player-frame")!.getBoundingClientRect(), chat = document.querySelector(".mobile-party-chat")!.getBoundingClientRect(), workspace = document.querySelector(".party-workspace")!.getBoundingClientRect();
        return { frame: frame.height, chat: chat.height, bottom: chat.bottom, workspaceBottom: workspace.bottom, gap: chat.top - frame.bottom };
      });
      expect(geometry.chat).toBeGreaterThan(geometry.frame);
      expect(Math.abs(geometry.bottom - geometry.workspaceBottom)).toBeLessThanOrEqual(1);
      expect(geometry.gap).toBeLessThanOrEqual(8);
      expect(await page.locator(".messages").evaluate((node) => getComputedStyle(node).overflowY)).toBe("auto");
    };
    await assertPortraitLayout();
    const videoHeight = await page.locator(".player-frame").evaluate((node) => node.getBoundingClientRect().height);
    await page.screenshot({ path: "test-results/mobile-video-proportion.png" });
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no Ambiente", exact: true }).tap();
    await expect(page.locator(".music-presentation")).toBeVisible();
    expect(await page.locator(".player-frame").evaluate((node) => node.getBoundingClientRect().height)).toBe(videoHeight);
    await expect(page.locator(".provider-player")).toHaveCSS("opacity", "0");
    await expect(page.locator(".music-presentation")).toHaveAttribute("data-lyrics", "unavailable");
    expect(await engine()).toEqual(originalEngine);
    await expect.poll(() => page.locator(".music-presentation").evaluate((node) => Math.abs(node.getBoundingClientRect().height - node.parentElement!.clientHeight))).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/mobile-ambiente.png" });
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Mobile message");
    await page.getByRole("button", { name: "Enviar mensagem" }).tap(); await expect(page.getByText("Mobile message", { exact: true })).toBeVisible();
    for (let index = 0; index < 12; index++) socket.emit("chat:message", { roomId: house.primaryRoomId, body: `Mensagem de scroll ${index}: conversa local de teste com texto suficiente para ocupar mais de uma linha.` });
    await expect(page.getByText(/Mensagem de scroll 11:/)).toBeVisible();
    await expect.poll(() => page.locator(".messages").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await page.locator(".messages").evaluate((node) => { node.scrollTop = 0; });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    for (const name of ["Pessoas da Party", "Fila da Party", "Fila da Party"]) {
      await page.getByRole("button", { name, exact: true }).tap();
      const sheet = page.getByRole("complementary", { name: "Painel da Party" });
      await expect(sheet).toBeVisible();
      await expect(page.getByRole("tab", { name: "Chat", exact: true })).toHaveCount(0);
      const handle = page.getByRole("button", { name: "Recolher painel da Party" });
      await expect(handle).toBeVisible();
      await page.screenshot({ path: name === "Pessoas da Party" ? "test-results/mobile-people-sheet.png" : "test-results/mobile-queue-sheet.png" });
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
      await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
      expect((await engine()).created).toBe(originalEngine.created); expect((await engine()).destroyed).toBe(0);
      await page.getByRole("button", { name, exact: true }).tap();
      await page.getByRole("button", { name: "Recolher painel da Party" }).tap();
      await expect(sheet).toBeHidden();
      await page.getByRole("button", { name, exact: true }).tap();
      await page.getByRole("button", { name: "Recolher painel da Party" }).focus();
      await page.keyboard.press("Enter"); await expect(sheet).toBeHidden();
    }
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await assertPortraitLayout();
    }
    await page.screenshot({ path: "test-results/mobile-chat-430.png" });
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Ativar microfone", exact: true }).last()).toBeVisible();
    expect(await page.evaluate(() => (window as any).qaMicCaptures)).toBe(0);
    await page.getByRole("button", { name: "Ativar microfone", exact: true }).last().tap();
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    await expect(page.locator(".mobile-call-menu")).toContainText("Microfone indisponível");
    expect(await page.evaluate(() => (window as any).qaMicCaptures)).toBe(1);
    await page.screenshot({ path: "test-results/mobile-automatic-voice.png" });
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "1");
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "0", { timeout: 5000 });
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no modo cinema", exact: true }).tap();
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await page.getByRole("button", { name: "Sair do modo cinema", exact: true }).tap();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await expect.poll(() => page.locator(".party-workspace").evaluate((node) => getComputedStyle(node).display)).toBe("grid");
    const landscape = await page.evaluate(() => { const frame = document.querySelector(".player-frame")!.getBoundingClientRect(), chat = document.querySelector(".mobile-party-chat")!.getBoundingClientRect(); return { ratio: frame.width / frame.height, frameRight: frame.right, chatLeft: chat.left }; });
    expect(Math.abs(landscape.ratio - 16 / 9)).toBeLessThan(0.02);
    expect(landscape.frameRight).toBeLessThanOrEqual(landscape.chatLeft);
    await page.locator(".mobile-party-chat").evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: "test-results/mobile-landscape.png" });
    const landscapeComposer = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox();
    expect(landscapeComposer!.y + landscapeComposer!.height).toBeLessThanOrEqual(390);
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Fullscreen draft");
    await page.locator(".messages").evaluate((node) => { node.scrollTop = 60; });
    const scrollBeforeFullscreen = await page.locator(".messages").evaluate((node) => node.scrollTop);
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Tela cheia", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement || document.querySelector(".fallback-fullscreen")))).toBe(true);
    await expect(page.locator(".mobile-party-chat")).toBeHidden();
    await expect(page.locator(".music-presentation")).toBeVisible();
    expect((await engine()).created).toBe(originalEngine.created);
    await page.screenshot({ path: "test-results/mobile-fullscreen.png" });
    await page.getByRole("button", { name: "Sair do Ambiente", exact: true }).tap();
    await expect(page.locator(".music-presentation")).toHaveCount(0);
    await expect(page.locator(".provider-player")).toHaveCSS("opacity", "1");
    const fullscreenVideo = await page.locator("iframe.provider-player").boundingBox();
    expect(fullscreenVideo!.width / fullscreenVideo!.height).toBeCloseTo(16 / 9, 1);
    await page.screenshot({ path: "test-results/mobile-video-fullscreen.png" });
    await page.getByRole("button", { name: /Sair da tela (cheia|ampliada)/ }).tap();
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
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no Ambiente", exact: true }).tap();
    await page.reload();
    await expect(page.locator(".music-presentation")).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    // Presentation also covers the desktop surface without a new engine.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".music-presentation")).toBeVisible();
    await expect.poll(() => page.locator(".music-presentation").evaluate((node) => Math.abs(node.getBoundingClientRect().height - node.parentElement!.clientHeight))).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/desktop-ambiente.png" });
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
    const secondItem = { ...item, id: crypto.randomUUID(), providerMediaId: "M7lc1UVf-VE", title: "Outro vídeo sem letras" };
    expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item: secondItem })).ok).toBe(true);
    expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item: secondItem })).ok).toBe(true);
    await expect(page.locator(".music-presentation").getByText(secondItem.title, { exact: true })).toBeVisible();
    await expect(page.locator(".music-cover img")).toHaveAttribute("alt", "Lumio");
    expect((await engine()).created).toBe(1); expect((await engine()).destroyed).toBe(0);
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("slider", { name: /^Posição:/ }).focus();
    await page.keyboard.press("ArrowRight");
    const seekPosition = (await engine()).position;
    await page.getByRole("button", { name: "Pausar", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(2);
    await page.getByRole("button", { name: "Reproduzir", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    expect((await engine()).position).toBeGreaterThanOrEqual(seekPosition);
    await page.setViewportSize({ width: 320, height: 450 });
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Keyboard-sized viewport");
    const input = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox(); expect(input!.y + input!.height).toBeLessThanOrEqual(450);
    await page.screenshot({ path: "test-results/mobile-short-viewport.png" });
    await page.reload(); await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
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
      recorder.start(); await new Promise((resolve) => setTimeout(resolve, 200)); recorder.stop(); await stopped;
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
