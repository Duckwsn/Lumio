import assert from "node:assert/strict";
import test from "node:test";
import { generateInviteCode, normalizeInviteCode } from "./inviteCode.js";
import { SocialStore } from "./socialStore.js";

const host = { id: "host", displayName: "Host", color: "#fff" };
const guest = { id: "guest", displayName: "Guest", color: "#fff" };
test("human code normalization rejects ambiguous characters and unexpected punctuation", () => {
  assert.equal(normalizeInviteCode(" abcde-fghjk "), "ABCDEFGHJK");
  assert.equal(normalizeInviteCode("AB CDE FGHJK"), "ABCDEFGHJK");
  for (const input of ["1234567890", "ABCDE_FGHJK", "ABCDE/FGHJK", "ABCDE-FGHJL", "x".repeat(65)]) assert.equal(normalizeInviteCode(input), null);
  assert.ok(normalizeInviteCode(generateInviteCode()));
});
test("code and link share one invite, membership, usage and revocation", () => {
  const store = new SocialStore(), house = store.createHouse(host, "Friends");
  const invite = store.createInvite(house.id, host, { expiresInHours: 24, maxUses: 1 })!;
  assert.ok(invite.token); assert.ok(invite.code);
  assert.equal(store.getInvite(invite.code), store.getInvite(invite.token));
  assert.equal(store.acceptInvite(invite.code.toLowerCase(), guest).ok, true);
  assert.equal(store.getInvite(invite.token)!.uses, 1);
  assert.equal(store.acceptInvite(invite.token, guest).ok, true);
  assert.equal(store.getHouse(house.id)!.members.size, 2);
  assert.equal(store.inspectInvite(invite.code).status, "INVALID");
  assert.equal(store.inspectInvite(invite.token).status, "LIMIT_REACHED");
  store.revokeInvite(house.id, invite.id);
  assert.equal(store.inspectInvite(invite.code).status, "INVALID");
  assert.equal(store.inspectInvite(invite.token).status, "REVOKED");
});
test("expired/revoked/missing codes disclose the same invalid shape", () => {
  const store = new SocialStore(), house = store.createHouse(host, "Private");
  const invite = store.createInvite(house.id, host, { expiresInHours: 1, maxUses: 2 })!;
  store.getInvite(invite.token)!.expiresAt = new Date(0).toISOString();
  assert.deepEqual(store.inspectInvite(invite.code!), { status: "INVALID" });
  assert.equal(store.acceptInvite(invite.code!, guest).ok, false);
  assert.deepEqual(store.inspectInvite("ZZZZZ-ZZZZZ"), { status: "INVALID" });
});
test("hash-only snapshot restores codes and legacy links without exposing credentials", () => {
  const store = new SocialStore(), house = store.createHouse(host, "Friends");
  const invites = Array.from({ length: 100 }, () => store.createInvite(house.id, host, { expiresInHours: 24, maxUses: 2 })!);
  assert.equal(new Set(invites.map((invite) => invite.code)).size, 100);
  const persisted = store.snapshotHouse(house.id)!;
  assert.ok(persisted.invites.every((invite) => invite.codeHash?.length === 64));
  assert.ok(!JSON.stringify(persisted).includes(invites[0].code!));
  assert.ok(!JSON.stringify(store.details(house.id, host.id)).includes(invites[0].code!));
  delete persisted.invites[0].codeHash; // Existing production row with no code.
  const restored = new SocialStore(); restored.restoreHouse(persisted, () => host);
  assert.equal(restored.inspectInvite(invites[0].token).status, "VALID");
  assert.equal(restored.inspectInvite(invites[1].code!).status, "VALID");
  restored.deleteHouse(house.id);
  assert.equal(restored.inspectInvite(invites[1].code!).status, "INVALID");
});
