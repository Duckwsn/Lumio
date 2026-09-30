import { useState } from "react";

export function AmbientArtwork({ source }: { source?: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={`music-cover ${source && !failed ? "has-artwork" : "has-brand"}`}>{source && !failed ? <img src={source} alt="" loading="eager" onError={() => setFailed(true)} /> : <img className="ambient-brand" src="/brand/lumio-symbol-128.png" alt="" />}</div>;
}
