import type { HouseMember } from "@lumio/shared";

export function memberPresenceLabel(member: Pick<HouseMember, "presence" | "inParty"> & { lastSeenAt?: string }, now = Date.now()): string {
  if (member.inParty) return "Na Party";
  if (member.presence !== "OFFLINE") return "Online";
  const elapsed = now - Date.parse(member.lastSeenAt ?? "");
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed < 5 * 60_000) return "Visto recentemente";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `Visto há ${minutes} min`;
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 24) return `Visto há ${hours} h`;
  if (hours < 48) return "Visto ontem";
  const days = Math.floor(elapsed / 86_400_000);
  return `Visto há ${days} dias`;
}

export function sortHouseMembers(members: HouseMember[]): HouseMember[] {
  const rank = (member: HouseMember) => member.inParty ? 0 : member.presence === "OFFLINE" ? 2 : 1;
  return [...members].sort((a, b) => rank(a) - rank(b) || a.joinedAt.localeCompare(b.joinedAt) || a.user.id.localeCompare(b.user.id));
}

export function memberPreviewName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0] || displayName;
}
