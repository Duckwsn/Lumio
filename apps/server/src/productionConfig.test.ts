import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionEnvironment } from "./productionConfig.js";

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "production", PERSISTENCE_MODE: "postgres", LUMIO_PRODUCTION_SMOKE: "1",
  DATABASE_URL: "postgresql://local:local@127.0.0.1:5433/lumio_test",
  CLIENT_ORIGIN: "https://app.example.test", APP_PUBLIC_URL: "https://app.example.test",
  API_PUBLIC_URL: "https://api.example.test", EMAIL_PROVIDER: "resend",
  EMAIL_FROM: "Lumio <test@example.test>", RESEND_API_KEY: "test-only",
};
test("production config accepts isolated smoke settings and rejects file storage", () => {
  assert.doesNotThrow(() => validateProductionEnvironment(base));
  assert.throws(() => validateProductionEnvironment({ ...base, PERSISTENCE_MODE: "file" }), /PERSISTENCE_MODE/);
  assert.throws(() => validateProductionEnvironment({ ...base, DATABASE_URL: "file:./dev.db" }), /DATABASE_URL/);
  assert.throws(() => validateProductionEnvironment({ ...base, LUMIO_PRODUCTION_SMOKE: "0" }), /DATABASE_URL/);
});
test("production config requires exact HTTPS origins and safe OAuth callback", () => {
  assert.throws(() => validateProductionEnvironment({ ...base, CLIENT_ORIGIN: "*" }), /CLIENT_ORIGIN/);
  assert.throws(() => validateProductionEnvironment({ ...base, APP_PUBLIC_URL: "http://app.example.test" }), /APP_PUBLIC_URL/);
  assert.throws(() => validateProductionEnvironment({ ...base, GOOGLE_CLIENT_SECRET: "dummy" }), /Google Drive/);
  assert.throws(() => validateProductionEnvironment({ ...base, RTC_TURN_URLS: "turn:turn.example.test" }), /RTC_TURN_URLS/);
  assert.throws(() => validateProductionEnvironment({ ...base, AUTH_SIGNUP_MODE: "google-only" }), /GOOGLE_CLIENT_ID/);
  assert.doesNotThrow(() => validateProductionEnvironment({ ...base, AUTH_SIGNUP_MODE: "google-only", GOOGLE_CLIENT_ID: "test-client-id" }));
});
