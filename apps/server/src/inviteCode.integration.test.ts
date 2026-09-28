import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("HTTP invitation codes enforce authentication, shared lifecycle and aggregate rate limiting", { timeout: 60000 }, async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-code-test-"));
  const port = await new Promise<number>((resolve) => { const socket = net.createServer(); socket.listen(0, "127.0.0.1", () => { const address = socket.address() as net.AddressInfo; socket.close(() => resolve(address.port)); }); });
  const outbox = path.join(directory, "mail.jsonl");
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: outbox, APP_PUBLIC_URL: "http://127.0.0.1:5173", CLIENT_ORIGIN: "http://127.0.0.1:5173", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "", YOUTUBE_API_KEY: "" }, stdio: "ignore" });
  context.after(async () => { child.kill(); await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* startup */ } await new Promise((resolve) => setTimeout(resolve, 100)); }
  const request = (method: string, route: string, token?: string, body?: unknown) => fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const user = async (name: string) => {
    const email = `${name}@example.test`, password = "local-safe-password-123";
    assert.equal((await request("POST", "/api/auth/signup", undefined, { displayName: name, email, password })).status, 201);
    const link = JSON.parse(fs.readFileSync(outbox, "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    assert.equal((await request("POST", "/api/auth/verification/confirm", undefined, { token: new URL(link).hash.slice(7) })).status, 204);
    return (await request("POST", "/api/auth/login", undefined, { email, password })).json();
  };
  const host = await user("Host"), guest = await user("Guest"), outsider = await user("Outsider");
  const { house } = await (await request("POST", "/api/houses", host.token, { name: "Private code house" })).json();
  const { invite } = await (await request("POST", `/api/houses/${house.id}/invites`, host.token, { expiresInHours: 24, maxUses: 2 })).json();
  assert.match(invite.code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
  assert.equal((await request("POST", `/api/invites/${invite.code}/accept`)).status, 401);
  assert.equal((await request("POST", `/api/invites/${invite.code.toLowerCase()}/accept`, guest.token)).status, 200);
  assert.equal((await request("POST", `/api/invites/${invite.token}/accept`, guest.token)).status, 200);
  const details = await (await request("GET", `/api/houses/${house.id}`, host.token)).json();
  assert.equal(details.house.members.length, 2); assert.equal(details.house.invites[0].uses, 1);
  assert.ok(!JSON.stringify(details).includes(invite.code));
  assert.equal((await request("DELETE", `/api/houses/${house.id}/invites/${invite.id}`, host.token)).status, 204);
  const invalid = await (await request("GET", `/api/invites/${invite.code}`)).json();
  const missing = await (await request("GET", "/api/invites/ZZZZZ-ZZZZZ")).json();
  assert.deepEqual(invalid, missing); assert.equal(invalid.houseName, undefined);
  assert.equal((await request("POST", `/api/invites/${invite.code}/accept`, outsider.token)).status, 410);
  assert.equal((await request("POST", `/api/invites/${invite.token}/accept`, outsider.token)).status, 410);
  let limited = 0;
  for (let i = 0; i < 35; i++) if ((await request(i % 2 ? "GET" : "POST", i % 2 ? `/api/invites/unknown-${i}` : `/api/invites/unknown-${i}/accept`, guest.token)).status === 429) limited++;
  assert.ok(limited > 0);
});
