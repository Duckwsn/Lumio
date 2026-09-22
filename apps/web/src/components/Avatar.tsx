import { useEffect, useState } from "react";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";

export function Avatar({ name, src, color, className = "" }: { name: string; src?: string; color: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <span className={`avatar avatar-safe ${className}`} style={{ background: color }} aria-label={name}>
    {src && !failed ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initials(name)}
  </span>;
}
