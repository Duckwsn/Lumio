import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

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
  await expect(page.getByLabel("Controles da Party")).toBeVisible();
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
