import assert from "node:assert/strict";
import test from "node:test";
import { projectHouseActivity, safeMediaTitle } from "./houseActivity.js";
import { SocialStore } from "./socialStore.js";

const input = { partyCount: 2, sharing: false, media: { title: "Vídeo", state: "playing", type: "video" } };
test("activity: occupancy first, screen over actual playback", () => {
  assert.equal(projectHouseActivity({ ...input, partyCount: 0, sharing: true }).type, "idle");
  assert.equal(projectHouseActivity({ ...input, sharing: true }).type, "screen");
  assert.equal(projectHouseActivity(input).type, "media");
  assert.equal(projectHouseActivity({ ...input, media: { ...input.media, state: "paused" } }).type, "party");
});
test("activity: allowlist ignores secrets, bounds metadata, distinguishes declared audio", () => {
  const dangerous = { ...input, media: { ...input.media, title: "a".repeat(800) + "\n", type: "audio", token: "private", playbackUrl: "private", grant: "private" } };
  const projected = projectHouseActivity(dangerous);
  assert.ok(projected.label.startsWith("Ouvindo ")); assert.ok(projected.label.length <= 180);
  assert.doesNotMatch(JSON.stringify(projected), /private|token|grant|playbackUrl/);
});
test("activity: URL or credential-looking titles never enter a House summary", () => {
  for (const title of ["https://drive.example/private?token=secret", "Watch www.private.test", "Bearer secret", "data:text/html,secret", "Movie?access_token=secret"]) assert.equal(safeMediaTitle(title), "mídia");
  assert.equal(safeMediaTitle("Interestelar"), "Interestelar");
});
test("House summaries: only own Houses, unique members, bounded public preview and separate presence", () => {
  const social = new SocialStore(), host = { id: "a", displayName: "Ana", email: "private@example.test", color: "#fff", status: "private" };
  const a = social.createHouse(host, "Casa A"), b = social.createHouse({ id: "b", displayName: "Bia", color: "#fff" }, "Casa B");
  assert.deepEqual(social.listForUser(host.id).map((h) => h.id), [a.id]); assert.equal(social.details(b.id, host.id), null);
  social.setPresence(a.id, host.id, "ONLINE"); let summary = social.listForUser(host.id)[0]; assert.equal(summary.onlineCount, 1); assert.equal(summary.partyCount, 0);
  social.setPresence(a.id, host.id, "ONLINE", { inParty: true }); summary = social.listForUser(host.id)[0]; assert.equal(summary.partyCount, 1);
  assert.doesNotMatch(JSON.stringify(summary), /private|email|inCall|speaking|screenSharing/);
  const persisted = social.snapshotHouse(a.id)!; const restored = new SocialStore(); restored.restoreHouse(persisted, () => host);
  assert.equal(restored.listForUser(host.id)[0].partyCount, 0); assert.equal(restored.listForUser(host.id)[0].onlineCount, 0);
  social.deleteHouse(a.id); assert.deepEqual(social.listForUser(host.id), []);
});
