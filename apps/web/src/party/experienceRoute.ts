export type PartyRoute =
  | { kind: "party"; houseId: string; legacy: boolean }
  | { kind: "invalid" }
  | null;

export function partyPath(houseId: string): string {
  return `/house/${encodeURIComponent(houseId)}/media`;
}

export function parsePartyRoute(pathname: string): PartyRoute {
  if (!pathname.startsWith("/house/")) return null;
  const parts = pathname.split("/");
  if (parts.length !== 3 && parts.length !== 4) return { kind: "invalid" };
  if (!parts[2] || parts[3] && parts[3] !== "media" && parts[3] !== "games") return { kind: "invalid" };
  try {
    const houseId = decodeURIComponent(parts[2]);
    if (!houseId || houseId.includes("/") || houseId.includes("\\")) return { kind: "invalid" };
    return { kind: "party", houseId, legacy: parts.length === 3 || parts[3] === "games" };
  } catch {
    return { kind: "invalid" };
  }
}
