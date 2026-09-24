import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldIgnoreOffer } from "./negotiation.js";

test("impolite peer ignores colliding offer", () => {
  assert.equal(shouldIgnoreOffer({ polite: false, makingOffer: true, signalingState: "stable", settingAnswer: false }), true);
  assert.equal(shouldIgnoreOffer({ polite: false, makingOffer: false, signalingState: "have-local-offer", settingAnswer: false }), true);
});

test("polite peer accepts glare and a peer setting an answer is ready", () => {
  assert.equal(shouldIgnoreOffer({ polite: true, makingOffer: true, signalingState: "have-local-offer", settingAnswer: false }), false);
  assert.equal(shouldIgnoreOffer({ polite: false, makingOffer: false, signalingState: "have-local-offer", settingAnswer: true }), false);
  assert.equal(shouldIgnoreOffer({ polite: false, makingOffer: false, signalingState: "stable", settingAnswer: false }), false);
});
