import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldIgnoreOffer, shouldInitiateOffer } from "./negotiation.js";

test("one side starts receive-only negotiation; both may renegotiate after discovery", () => {
  assert.equal(shouldInitiateOffer({ polite: true, hasRemoteDescription: false, signalingState: "stable" }), false);
  assert.equal(shouldInitiateOffer({ polite: false, hasRemoteDescription: false, signalingState: "stable" }), true);
  assert.equal(shouldInitiateOffer({ polite: true, hasRemoteDescription: true, signalingState: "stable" }), true);
  assert.equal(shouldInitiateOffer({ polite: false, hasRemoteDescription: true, signalingState: "have-local-offer" }), false);
});

test("impolite peer ignores colliding offer", () => {
  assert.equal(shouldIgnoreOffer({ polite: false, makingOffer: true, signalingState: "stable", settingAnswer: false }), true);
  assert.equal(shouldIgnoreOffer({ polite: false, makingOffer: false, signalingState: "have-local-offer", settingAnswer: false }), true);
});

test("polite peer accepts glare and a peer setting an answer is ready", () => {
  assert.equal(shouldIgnoreOffer({ polite: true, makingOffer: true, signalingState: "have-local-offer", settingAnswer: false }), false);
  assert.equal(shouldIgnoreOffer({ polite: false, makingOffer: false, signalingState: "have-local-offer", settingAnswer: true }), false);
  assert.equal(shouldIgnoreOffer({ polite: false, makingOffer: false, signalingState: "stable", settingAnswer: false }), false);
});
