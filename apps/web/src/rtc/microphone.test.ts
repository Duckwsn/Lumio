import assert from "node:assert/strict";
import { test } from "node:test";
import { publishMicrophone } from "./microphone.js";

test("publishing after receive-only reuses sender and requests direction negotiation", async () => {
  let replacements = 0, streams = 0, additions = 0;
  const transceiver = { stopped: false, direction: "recvonly", receiver: { track: { kind: "audio" } }, sender: { replaceTrack: async () => { replacements++; }, setStreams: () => { streams++; } } };
  const connection = { getTransceivers: () => [transceiver], addTrack: () => { additions++; } } as unknown as RTCPeerConnection;
  await publishMicrophone(connection, {} as MediaStreamTrack, {} as MediaStream);
  await publishMicrophone(connection, {} as MediaStreamTrack, {} as MediaStream);
  assert.equal(replacements, 2); assert.equal(streams, 2); assert.equal(additions, 0); assert.equal(transceiver.direction, "sendrecv");
});

test("publishing without an audio slot adds a track once", async () => {
  let additions = 0;
  const connection = { getTransceivers: () => [], addTrack: () => { additions++; } } as unknown as RTCPeerConnection;
  await publishMicrophone(connection, {} as MediaStreamTrack, {} as MediaStream);
  assert.equal(additions, 1);
});
