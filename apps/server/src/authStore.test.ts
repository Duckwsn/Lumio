import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthError, AuthStore } from "./authStore.js";

const fixture = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-auth-"));
  const file = path.join(directory, "auth.json");
  return { store: new AuthStore(file, 1), file, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
};
const google = (sub = "google-stable-sub", email = "duck@example.test") => ({ sub, email, name: "Duck" });

test("local signup/login, normalized uniqueness, hashed password and persisted session", (context) => {
  const { store, file, cleanup } = fixture(); context.after(cleanup);
  const user = store.createLocal("Duck", " Duck@Example.Test ", "long-pass-123");
  assert.equal(user.email, "duck@example.test");
  assert.equal(store.login("DUCK@example.test", "long-pass-123")?.id, user.id);
  assert.equal(store.login("duck@example.test", "wrong"), undefined);
  assert.throws(() => store.createLocal("Other", "duck@example.test", "long-pass-123"), (error) => error instanceof AuthError && error.code === "EMAIL_EXISTS");
  assert.throws(() => store.createSession(user.id));
  assert.equal(store.consumeVerification(store.issueToken(user.id, "EMAIL_VERIFICATION", 60_000, 0)!), true);
  const token = store.createSession(user.id);
  const disk = fs.readFileSync(file, "utf8");
  assert.equal(disk.includes("long-pass-123"), false);
  assert.equal(disk.includes(token), false);
  const reloaded = new AuthStore(file, 1);
  assert.equal(reloaded.resolveSession(token)?.user.id, user.id);
  const other = reloaded.createSession(user.id);
  reloaded.revokeOtherSessions(user.id, token);
  assert.equal(reloaded.resolveSession(other), undefined);
  assert.equal(reloaded.resolveSession(token)?.user.id, user.id);
  reloaded.revokeSession(token);
  assert.equal(reloaded.resolveSession(token), undefined);
});

test("new Google user returns by provider sub and never receives Drive authorization", (context) => {
  const { store, file, cleanup } = fixture(); context.after(cleanup);
  const first = store.loginGoogle(google());
  assert.equal(first.created, true);
  assert.equal(store.hasPassword(first.user.id), false);
  assert.equal(store.getIdentity(first.user.id)?.sub, "google-stable-sub");
  const second = new AuthStore(file, 1).loginGoogle(google("google-stable-sub", "new-email@example.test"));
  assert.equal(second.created, false);
  assert.equal(second.user.id, first.user.id);
  assert.throws(() => store.unlinkGoogle(first.user.id, "anything"), (error) => error instanceof AuthError && error.code === "LAST_METHOD");
  store.setPassword(first.user.id, "new-long-pass");
  assert.equal(store.login("duck@example.test", "new-long-pass")?.id, first.user.id);
  store.unlinkGoogle(first.user.id, "new-long-pass");
  assert.equal(store.getIdentity(first.user.id), null);
});

test("existing local email requires explicit link, preserves Lumio user id and blocks Google conflicts", (context) => {
  const { store, cleanup } = fixture(); context.after(cleanup);
  const duck = store.createLocal("Duck", "duck@example.test", "duck-password");
  const other = store.createLocal("Other", "other@example.test", "other-password");
  assert.throws(() => store.loginGoogle(google()), (error) => error instanceof AuthError && error.code === "EMAIL_EXISTS");
  assert.equal(store.linkGoogle(duck.id, google())?.id, duck.id);
  assert.equal(store.loginGoogle(google()).user.id, duck.id);
  assert.throws(() => store.linkGoogle(other.id, google()), (error) => error instanceof AuthError && error.code === "GOOGLE_IN_USE");
  assert.throws(() => store.unlinkGoogle(duck.id, "wrong"), (error) => error instanceof AuthError && error.code === "WRONG_PASSWORD");
  store.unlinkGoogle(duck.id, "duck-password");
  assert.equal(store.login("duck@example.test", "duck-password")?.id, duck.id);
});

test("linking a different Google email is explicit and does not change Lumio email", (context) => {
  const { store, cleanup } = fixture(); context.after(cleanup);
  const user = store.createLocal("Duck", "duck@example.test", "duck-password");
  store.linkGoogle(user.id, google("different-sub", "duck.work@example.test"));
  assert.equal(store.getUser(user.id)?.email, "duck@example.test");
  assert.equal(store.getIdentity(user.id)?.email, "duck.work@example.test");
  assert.equal(store.loginGoogle(google("different-sub", "duck.work@example.test")).user.id, user.id);
});

test("local account stays unverified until one valid verification token is consumed", async (context) => {
  const { store, file, cleanup } = fixture(); context.after(cleanup);
  const user = store.createLocal("Duck", "duck@example.test", "duck-password");
  assert.equal(store.isVerified(user.id), false);
  const token = store.issueToken(user.id, "EMAIL_VERIFICATION", 60_000, 0)!;
  assert.equal(fs.readFileSync(file, "utf8").includes(token), false);
  assert.equal(store.consumePasswordReset(token, "new-password"), null);
  assert.equal(store.consumeVerification(`${token.slice(0, -1)}x`), false);
  assert.deepEqual(await Promise.all([Promise.resolve().then(() => store.consumeVerification(token)), Promise.resolve().then(() => store.consumeVerification(token))]), [true, false]);
  assert.equal(new AuthStore(file, 1).isVerified(user.id), true);
  assert.equal(store.consumeVerification(token), false);
});

test("password reset is purpose-bound, single use, expiring and revokes sessions", async (context) => {
  const { store, cleanup } = fixture(); context.after(cleanup);
  const user = store.createLocal("Duck", "duck@example.test", "duck-password");
  assert.equal(store.consumeVerification(store.issueToken(user.id, "EMAIL_VERIFICATION", 60_000, 0)!), true);
  const session = store.createSession(user.id);
  const expired = store.issueToken(user.id, "PASSWORD_RESET", -1, 0)!;
  assert.equal(store.consumePasswordReset(expired, "other-password"), null);
  const token = store.issueToken(user.id, "PASSWORD_RESET", 60_000, 0)!;
  assert.deepEqual(await Promise.all([Promise.resolve().then(() => store.consumePasswordReset(token, "new-password")), Promise.resolve().then(() => store.consumePasswordReset(token, "evil-password"))]), [user.id, null]);
  assert.equal(store.resolveSession(session), undefined);
  assert.equal(store.login(user.email!, "new-password")?.id, user.id);
  assert.equal(store.login(user.email!, "evil-password"), undefined);
  assert.equal(store.isVerified(user.id), true);
});

test("verification resend cooldown and previous-token invalidation", (context) => {
  const { store, cleanup } = fixture(); context.after(cleanup);
  const user = store.createLocal("Duck", "duck@example.test", "duck-password");
  const first = store.issueToken(user.id, "EMAIL_VERIFICATION", 60_000, 60_000)!;
  assert.equal(store.issueToken(user.id, "EMAIL_VERIFICATION", 60_000, 60_000), null);
  const second = store.issueToken(user.id, "EMAIL_VERIFICATION", 60_000, 0)!;
  assert.equal(store.consumeVerification(first), false);
  assert.equal(store.consumeVerification(second), true);
});
