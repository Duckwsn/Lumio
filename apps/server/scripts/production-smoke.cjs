const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const path = require("node:path");

const databaseUrl = process.env.LUMIO_TEST_DATABASE_URL || "postgresql://lumio_dev:lumio_local_only@127.0.0.1:5433/lumio_test?schema=public";
const parsed = new URL(databaseUrl);
if (!parsed.pathname.endsWith("/lumio_test") || !["127.0.0.1", "localhost"].includes(parsed.hostname)) throw new Error("Smoke test exige banco local lumio_test.");
const port = 4018;
const child = spawn(process.execPath, [path.resolve(__dirname, "../dist/index.js")], {
  cwd: path.resolve(__dirname, ".."),
  env: {
    ...process.env,
    NODE_ENV: "production", LUMIO_PRODUCTION_SMOKE: "1", PERSISTENCE_MODE: "postgres", DATABASE_URL: databaseUrl,
    PORT: String(port), CLIENT_ORIGIN: "https://app.example.test", APP_PUBLIC_URL: "https://app.example.test", API_PUBLIC_URL: "https://api.example.test",
    EMAIL_PROVIDER: "resend", EMAIL_FROM: "Lumio <test@example.test>", RESEND_API_KEY: "re_test_only",
    GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_REDIRECT_URI: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "",
  },
  stdio: "ignore",
});

(async () => {
  try {
    let ready;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (child.exitCode !== null) throw new Error("Backend terminou antes do readiness.");
      try { ready = await fetch(`http://127.0.0.1:${port}/api/ready`, { signal: AbortSignal.timeout(500) }); if (ready.ok) break; } catch { /* Boot in progress. */ }
      await delay(200);
    }
    assert.equal(ready?.status, 200, "PostgreSQL readiness");
    const health = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: "https://app.example.test" } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("access-control-allow-origin"), "https://app.example.test");
    const other = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: "https://other.example.test" } });
    assert.equal(other.headers.get("access-control-allow-origin"), null);
    process.stdout.write("Production-like local boot, DB readiness and CORS: OK\n");
    if (process.env.LUMIO_SMOKE_HOLD_MS) await delay(Math.min(60_000, Math.max(0, Number(process.env.LUMIO_SMOKE_HOLD_MS) || 0)));
  } finally {
    child.kill("SIGTERM");
  }
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
