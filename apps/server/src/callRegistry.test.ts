import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRegistry } from "./callRegistry.js";

test("discovers only active call peers in the same Party", () => {
  const calls = new CallRegistry();
  assert.deepEqual(calls.join("party-a", "duck", "socket-1", () => true).peers, []);
  calls.join("party-b", "other", "socket-2", () => true);
  assert.deepEqual(calls.join("party-a", "maria", "socket-3", () => true).peers, [["duck", "socket-1"]]);
  assert.equal(calls.canSignal("party-a", "maria", "socket-3", "duck", "socket-1"), true);
  assert.equal(calls.canSignal("party-b", "maria", "socket-3", "other", "socket-2"), false);
});

test("rejects a second live tab and stale signaling after reconnect", () => {
  const calls = new CallRegistry();
  calls.join("party", "duck", "old", () => true);
  assert.equal(calls.join("party", "duck", "new", () => true).ok, false);
  assert.equal(calls.join("party", "duck", "new", (socketId) => socketId !== "old").ok, true);
  calls.join("party", "maria", "peer", () => true);
  assert.equal(calls.canSignal("party", "duck", "old", "maria", "peer"), false);
  assert.equal(calls.canSignal("party", "duck", "new", "maria", "peer"), true);
  assert.equal(calls.canSignal("party", "duck", "new", "maria", "stale"), false);
  assert.equal(calls.leave("party", "duck", "old"), false);
  assert.equal(calls.leave("party", "duck", "new"), true);
});
