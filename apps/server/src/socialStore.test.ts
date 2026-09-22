import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@lumio/shared";
import { can } from "./authorization.js";
import { SocialStore } from "./socialStore.js";

const host: User = { id: "host", displayName: "Host", color: "#fff" };
const member: User = { id: "member", displayName: "Member", color: "#000" };

test("new users start without an automatic house", () => {
  const store = new SocialStore(); assert.deepEqual(store.listForUser(host.id), []);
  const house = store.createHouse(host, "Casa Aurora"); assert.equal(store.role(house.id, host.id), "HOST");
});

test("first member owns the default house and later users are members", () => {
  const store = new SocialStore(); store.ensureDefaultMembership(host); store.ensureDefaultMembership(member);
  assert.equal(store.role("group-silva", host.id), "HOST"); assert.equal(store.role("group-silva", member.id), "MEMBER");
});

test("member cannot use administrative permissions", () => {
  assert.equal(can("MEMBER", "MEMBER_MANAGE"), false); assert.equal(can("MEMBER", "INVITE_CREATE"), false); assert.equal(can("ADMIN", "INVITE_CREATE"), true);
});

test("secure invite enforces usage limit and can be revoked", () => {
  const store = new SocialStore(); store.ensureDefaultMembership(host);
  const invite = store.createInvite("group-silva", host, { expiresInHours: 24, maxUses: 1 })!;
  assert.equal(store.inspectInvite(invite.token).status, "VALID"); assert.equal(store.acceptInvite(invite.token, member).ok, true);
  assert.equal(store.inspectInvite(invite.token).status, "LIMIT_REACHED");
  const second = store.createInvite("group-silva", host, { expiresInHours: 1, maxUses: 2 })!; store.revokeInvite("group-silva", second.id);
  assert.equal(store.inspectInvite(second.token).status, "REVOKED");
});

test("host cannot be removed or leave; admins can be demoted", () => {
  const store = new SocialStore(); store.ensureDefaultMembership(host); store.ensureDefaultMembership(member);
  assert.equal(store.removeMember("group-silva", host.id), false);
  assert.equal(store.changeRole("group-silva", host.id, member.id, "ADMIN"), true);
  assert.equal(store.role("group-silva", member.id), "ADMIN");
});

test("membership survives party presence transitions", () => {
  const store = new SocialStore(); store.ensureDefaultMembership(host);
  store.setPresence("group-silva", host.id, "ONLINE", { inParty: true }); store.setPresence("group-silva", host.id, "OFFLINE", { inParty: false });
  assert.equal(store.isMember("group-silva", host.id), true); assert.equal(store.details("group-silva", host.id)?.members[0]?.inParty, false);
});
