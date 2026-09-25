/** Opt-in QA summary. Does not include IP addresses, device labels, tokens or peer IDs. */
export function summarizeRtcStats(reports: RTCStatsReport) {
  const values = [...reports.values()] as Array<RTCStats & Record<string, unknown>>;
  const byId = new Map(values.map((report) => [report.id, report]));
  const selectedPairId = values.find((report) => report.type === "transport" && typeof report.selectedCandidatePairId === "string")?.selectedCandidatePairId;
  const pair = values.find((report) => report.type === "candidate-pair" && report.id === selectedPairId)
    ?? values.find((report) => report.type === "candidate-pair" && report.selected === true)
    ?? values.find((report) => report.type === "candidate-pair" && report.state === "succeeded" && report.nominated === true);
  const local = pair ? byId.get(String(pair.localCandidateId)) : undefined;
  const remote = pair ? byId.get(String(pair.remoteCandidateId)) : undefined;
  const inbound = values.find((report) => report.type === "inbound-rtp" && (report.kind === "audio" || report.mediaType === "audio"));
  const outbound = values.find((report) => report.type === "outbound-rtp" && (report.kind === "audio" || report.mediaType === "audio"));
  const codec = inbound ? byId.get(String(inbound.codecId)) : undefined;
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const received = number(inbound?.packetsReceived);
  const lost = number(inbound?.packetsLost);
  const emitted = number(inbound?.jitterBufferEmittedCount);
  const bufferDelay = number(inbound?.jitterBufferDelay);
  return {
    localCandidateType: typeof local?.candidateType === "string" ? local.candidateType : undefined,
    remoteCandidateType: typeof remote?.candidateType === "string" ? remote.candidateType : undefined,
    protocol: typeof local?.protocol === "string" ? local.protocol : undefined,
    codec: typeof codec?.mimeType === "string" ? codec.mimeType : undefined,
    rttMs: number(pair?.currentRoundTripTime) === undefined ? undefined : Math.round(number(pair?.currentRoundTripTime)! * 1000),
    packetsReceived: received,
    packetsSent: number(outbound?.packetsSent),
    packetsLost: lost,
    lossRatio: received === undefined || lost === undefined ? undefined : lost / Math.max(1, received + lost),
    jitterMs: number(inbound?.jitter) === undefined ? undefined : Math.round(number(inbound?.jitter)! * 1000),
    meanJitterBufferMs: emitted && bufferDelay !== undefined ? Math.round(bufferDelay / emitted * 1000) : undefined,
  };
}
