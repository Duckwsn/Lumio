export function shouldIgnoreOffer(input: { polite: boolean; makingOffer: boolean; signalingState: RTCSignalingState; settingAnswer: boolean }) {
  return !input.polite && (input.makingOffer || (input.signalingState !== "stable" && !input.settingAnswer));
}
