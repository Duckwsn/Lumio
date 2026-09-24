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

test("House details expose public profiles, not member account emails", () => {
  const store = new SocialStore();
  const user: User = { ...host, email: "private@example.test" };
  const house = store.createHouse(user, "Casa Privada");
  const details = store.details(house.id, user.id)!;
  assert.equal(details.members[0].user.email, undefined);
  assert.equal(details.activity[0].actor?.email, undefined);
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

test("host transfer preserves one host and allows former host to leave", () => {
  const store = new SocialStore(); const house = store.createHouse(host, "Casa Aurora");
  const invite = store.createInvite(house.id, host, { expiresInHours: 24, maxUses: 1 })!;
  assert.equal(store.acceptInvite(invite.token, member).ok, true);
  assert.equal(store.transferHost(house.id, member.id, member.id), false);
  assert.equal(store.transferHost(house.id, host.id, "missing"), false);
  assert.equal(store.transferHost(house.id, host.id, member.id), true);
  assert.deepEqual([...house.members.values()].filter((entry) => entry.role === "HOST").map((entry) => entry.user.id), [member.id]);
  assert.equal(store.leave(house.id, host.id), true);
  assert.equal(store.leave(house.id, member.id), false);
});

test("an existing member may reopen a consumed invite without using it twice", () => {
  const store = new SocialStore(); const house = store.createHouse(host, "Casa Aurora");
  const invite = store.createInvite(house.id, host, { expiresInHours: 24, maxUses: 1 })!;
  assert.equal(store.acceptInvite(invite.token, member).ok, true);
  assert.equal(store.acceptInvite(invite.token, member).ok, true);
  assert.equal(store.getInvite(invite.token)?.uses, 1);
  assert.equal(store.getInvite(invite.token)?.token, "");
  assert.equal(store.acceptInvite(invite.token, { id: "third", displayName: "Third", color: "#fff" }).ok, false);
});

test("competing in-process accepts cannot exceed the invite usage limit", async () => {
  const store = new SocialStore(); const house = store.createHouse(host, "Casa Aurora");
  const invite = store.createInvite(house.id, host, { expiresInHours: 24, maxUses: 1 })!;
  const results = await Promise.all([member, { id: "third", displayName: "Third", color: "#fff" }].map((user) => Promise.resolve(store.acceptInvite(invite.token, user))));
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(store.getInvite(invite.token)?.uses, 1);
  assert.equal(house.members.size, 2);
});

test("account presence does not clear Party, Call, or screen share flags", () => {
  const store = new SocialStore(); const house = store.createHouse(host, "Casa Aurora");
  store.setPresence(house.id, host.id, "ONLINE", { inParty: true, inCall: true, speaking: true, screenSharing: true });
  store.setPresenceForUser(host.id, "IDLE");
  const presence = store.details(house.id, host.id)!.members[0];
  assert.equal(presence.presence, "IDLE");
  assert.equal(presence.inParty, true); assert.equal(presence.inCall, true); assert.equal(presence.speaking, true); assert.equal(presence.screenSharing, true);
});
