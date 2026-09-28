export function shouldInitiateOffer(input: { polite: boolean; hasRemoteDescription: boolean; signalingState: RTCSignalingState }) {
  // Both peers discover each other. Let only the impolite side start their
  // first offer, avoiding rollback of unassociated receive-only transceivers.
  return input.signalingState === "stable" && (!input.polite || input.hasRemoteDescription);
}

export function shouldIgnoreOffer(input: { polite: boolean; makingOffer: boolean; signalingState: RTCSignalingState; settingAnswer: boolean }) {
  return !input.polite && (input.makingOffer || (input.signalingState !== "stable" && !input.settingAnswer));
}
