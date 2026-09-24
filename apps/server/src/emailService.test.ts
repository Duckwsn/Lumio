import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EmailService } from "./emailService.js";

test("development email uses ignored local outbox and fragment token", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-mail-")); context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const prior = process.env.EMAIL_PROVIDER; process.env.EMAIL_PROVIDER = "dev-file";
  context.after(() => { if (prior === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = prior; });
  const outbox = path.join(directory, "outbox.jsonl");
  await new EmailService(outbox).send("duck@example.test", "verify", "test-token");
  const content = JSON.parse(fs.readFileSync(outbox, "utf8")) as { text: string };
  assert.match(content.text, /verify-email#token=test-token/);
  assert.doesNotMatch(content.text, /\?token=/);
});

test("configured Resend transport sends only to official API, without a real delivery", async (context) => {
  const names = ["EMAIL_PROVIDER", "RESEND_API_KEY", "EMAIL_FROM", "APP_PUBLIC_URL"] as const;
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-only-key", EMAIL_FROM: "Lumio <noreply@example.test>", APP_PUBLIC_URL: "https://lumio.example.test" });
  context.after(() => { for (const name of names) { if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; } });
  let called = false;
  const fetcher: typeof fetch = async (input, init) => {
    called = true;
    assert.equal(String(input), "https://api.resend.com/emails");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-only-key");
    const body = JSON.parse(String(init?.body)) as { to: string[]; text: string };
    assert.deepEqual(body.to, ["duck@example.test"]);
    assert.match(body.text, /https:\/\/lumio\.example\.test\/reset-password#token=test-token/);
    return new Response(JSON.stringify({ id: "test" }), { status: 200 });
  };
  await new EmailService(undefined, fetcher).send("duck@example.test", "reset", "test-token");
  assert.equal(called, true);
});

test("production refuses development-only mail transport", (context) => {
  const previous = { nodeEnv: process.env.NODE_ENV, provider: process.env.EMAIL_PROVIDER, publicUrl: process.env.APP_PUBLIC_URL };
  process.env.NODE_ENV = "production"; process.env.EMAIL_PROVIDER = "dev-file"; process.env.APP_PUBLIC_URL = "https://lumio.example.test";
  context.after(() => {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.provider === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = previous.provider;
    if (previous.publicUrl === undefined) delete process.env.APP_PUBLIC_URL; else process.env.APP_PUBLIC_URL = previous.publicUrl;
  });
  assert.throws(() => new EmailService(), /Produção exige e-mail real/);
});
