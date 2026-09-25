import assert from "node:assert/strict";
import test from "node:test";
import { summarizeRtcStats } from "./diagnostics";

test("RTC QA summary extracts transport/audio metrics without network identifiers", () => {
  const reports = new Map<string, object>([
    ["transport", { id: "transport", type: "transport", selectedCandidatePairId: "pair" }],
    ["pair", { id: "pair", type: "candidate-pair", selected: true, state: "succeeded", localCandidateId: "local", remoteCandidateId: "remote", currentRoundTripTime: .123 }],
    ["local", { id: "local", type: "local-candidate", candidateType: "srflx", protocol: "udp", address: "192.0.2.10" }],
    ["remote", { id: "remote", type: "remote-candidate", candidateType: "relay", address: "203.0.113.20" }],
    ["audio-in", { id: "audio-in", type: "inbound-rtp", kind: "audio", codecId: "codec", packetsReceived: 98, packetsLost: 2, jitter: .008, jitterBufferDelay: 1.2, jitterBufferEmittedCount: 100 }],
    ["audio-out", { id: "audio-out", type: "outbound-rtp", kind: "audio", packetsSent: 111 }],
    ["codec", { id: "codec", type: "codec", mimeType: "audio/opus" }],
  ]);
  const summary = summarizeRtcStats(reports as RTCStatsReport);
  assert.deepEqual(summary, { localCandidateType: "srflx", remoteCandidateType: "relay", protocol: "udp", codec: "audio/opus", rttMs: 123, packetsReceived: 98, packetsSent: 111, packetsLost: 2, lossRatio: .02, jitterMs: 8, meanJitterBufferMs: 12 });
  assert.equal(JSON.stringify(summary).includes("192.0.2.10"), false);
});
