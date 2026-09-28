// Reuse the receive-only slot; the existing onnegotiationneeded handler owns offers.
export async function publishMicrophone(connection: RTCPeerConnection, track: MediaStreamTrack, stream: MediaStream) {
  const audio = connection.getTransceivers().find((transceiver) => transceiver.direction !== "stopped" && transceiver.receiver.track.kind === "audio");
  if (!audio) { connection.addTrack(track, stream); return; }
  await audio.sender.replaceTrack(track);
  audio.sender.setStreams(stream);
  audio.direction = "sendrecv";
}
