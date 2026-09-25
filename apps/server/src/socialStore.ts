import crypto from "node:crypto";
import type { HouseActivity, HouseDetails, HouseInvite, HouseMember, HouseRole, HouseSummary, PresenceStatus, User } from "@lumio/shared";
import { rolePermissions } from "./authorization.js";
import { publicUser } from "./privacy.js";

interface HouseRecord { id: string; name: string; avatar?: string; primaryRoomId: string; members: Map<string, HouseMember>; invites: Map<string, HouseInvite>; activity: HouseActivity[] }
export interface PersistedHouse {
  id: string; name: string; avatar?: string; primaryRoomId: string;
  members: { userId: string; role: HouseRole; joinedAt: string; lastSeenAt: string }[];
  invites: { hash: string; id: string; createdById: string; role: HouseRole; createdAt: string; expiresAt: string; maxUses: number; uses: number; revokedAt: string | null }[];
  activity: { id: string; actorId?: string; kind: HouseActivity["kind"]; text: string; createdAt: string }[];
}

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export class SocialStore {
  private houses = new Map<string, HouseRecord>();
  private inviteByToken = new Map<string, HouseInvite>();

  snapshotHouse(houseId: string): PersistedHouse | null {
    const house = this.houses.get(houseId); if (!house) return null;
    return {
      id: house.id, name: house.name, avatar: house.avatar, primaryRoomId: house.primaryRoomId,
      members: [...house.members.values()].map((entry) => ({ userId: entry.user.id, role: entry.role, joinedAt: entry.joinedAt, lastSeenAt: entry.lastSeenAt })),
      invites: [...this.inviteByToken].filter(([, invite]) => invite.houseId === houseId).map(([hash, invite]) => ({ hash, id: invite.id, createdById: invite.createdBy.id, role: invite.role, createdAt: invite.createdAt, expiresAt: invite.expiresAt, maxUses: invite.maxUses, uses: invite.uses, revokedAt: invite.revokedAt })),
      activity: house.activity.map((entry) => ({ id: entry.id, actorId: entry.actor?.id, kind: entry.kind, text: entry.text, createdAt: entry.createdAt })),
    };
  }

  restoreHouse(input: PersistedHouse, getUser: (id: string) => User | undefined) {
    const house: HouseRecord = { id: input.id, name: input.name, avatar: input.avatar, primaryRoomId: input.primaryRoomId, members: new Map(), invites: new Map(), activity: [] };
    for (const entry of input.members) {
      const user = getUser(entry.userId); if (!user) throw new Error("Membro de Casa sem usuário.");
      house.members.set(user.id, { user, role: entry.role, presence: "OFFLINE", joinedAt: entry.joinedAt, lastSeenAt: entry.lastSeenAt, inParty: false, inCall: false, speaking: false, screenSharing: false });
    }
    for (const entry of input.invites) {
      const createdBy = getUser(entry.createdById); if (!createdBy) throw new Error("Convite sem criador.");
      const invite: HouseInvite = { id: entry.id, houseId: input.id, token: "", role: entry.role, createdBy, createdAt: entry.createdAt, expiresAt: entry.expiresAt, maxUses: entry.maxUses, uses: entry.uses, revokedAt: entry.revokedAt };
      house.invites.set(invite.id, invite); this.inviteByToken.set(entry.hash, invite);
    }
    house.activity = input.activity.map((entry) => ({ id: entry.id, houseId: input.id, kind: entry.kind, text: entry.text, createdAt: entry.createdAt, actor: entry.actorId ? getUser(entry.actorId) : undefined }));
    this.houses.set(house.id, house);
  }

  ensureDefaultMembership(user: User) {
    if (process.env.NODE_ENV === "production" || process.env.PERSISTENCE_MODE === "postgres") throw new Error("Casa de demonstração indisponível com persistência PostgreSQL.");
    let house = this.houses.get("group-silva");
    if (!house) {
      house = { id: "group-silva", name: "Casa Silva", primaryRoomId: "cinema", members: new Map(), invites: new Map(), activity: [] };
      this.houses.set(house.id, house);
    }
    if (!house.members.has(user.id)) this.addMembership(house, user, house.members.size === 0 ? "HOST" : "MEMBER");
    return house;
  }

  createHouse(user: User, name: string) {
    const id = `house-${crypto.randomUUID()}`;
    const house: HouseRecord = { id, name: name.trim(), primaryRoomId: `party-${crypto.randomUUID()}`, members: new Map(), invites: new Map(), activity: [] };
    this.houses.set(id, house); this.addMembership(house, user, "HOST");
    return house;
  }

  private addMembership(house: HouseRecord, user: User, role: HouseRole) {
    const timestamp = new Date().toISOString();
    house.members.set(user.id, { user, role, presence: "OFFLINE", lastSeenAt: timestamp, joinedAt: timestamp, inParty: false, inCall: false, speaking: false, screenSharing: false });
    this.log(house, "MEMBER_JOINED", `${user.displayName} entrou na Casa.`, user);
  }

  listForUser(userId: string): HouseSummary[] { return [...this.houses.values()].filter((h) => h.members.has(userId)).map((h) => this.summary(h, userId)); }
  summary(house: HouseRecord, userId: string): HouseSummary {
    return { id: house.id, name: house.name, initials: initials(house.name), avatar: house.avatar, role: house.members.get(userId)?.role ?? "MEMBER", memberCount: house.members.size, onlineCount: [...house.members.values()].filter((m) => m.presence !== "OFFLINE").length, partyCount: [...house.members.values()].filter((m) => m.inParty).length, primaryRoomId: house.primaryRoomId };
  }
  details(houseId: string, userId: string): HouseDetails | null {
    const house = this.houses.get(houseId); const membership = house?.members.get(userId); if (!house || !membership) return null;
    return { ...this.summary(house, userId), members: [...house.members.values()].map((member) => ({ ...member, user: publicUser(member.user) })), permissions: [...rolePermissions[membership.role]], invites: rolePermissions[membership.role].includes("INVITE_REVOKE") ? [...house.invites.values()].filter((i) => !i.revokedAt).map((invite) => ({ ...invite, token: "", createdBy: publicUser(invite.createdBy) })) : [], activity: house.activity.slice(-40).reverse().map((entry) => ({ ...entry, actor: entry.actor && publicUser(entry.actor) })) };
  }
  getHouse(houseId: string) { return this.houses.get(houseId); }
  getByRoom(roomId: string) { return [...this.houses.values()].find((house) => house.primaryRoomId === roomId); }
  role(houseId: string, userId: string) { return this.houses.get(houseId)?.members.get(userId)?.role; }
  isMember(houseId: string, userId: string) { return this.houses.get(houseId)?.members.has(userId) ?? false; }

  updateProfile(user: User, input: { displayName?: string; avatar?: string; status?: string }) {
    Object.assign(user, input);
    for (const house of this.houses.values()) { const member = house.members.get(user.id); if (member) member.user = user; }
    return user;
  }
  setPresenceForUser(userId: string, presence: PresenceStatus) {
    for (const house of this.houses.values()) {
      const member = house.members.get(userId);
      if (member) { member.presence = presence; member.lastSeenAt = new Date().toISOString(); }
    }
  }
  updateHouse(houseId: string, name: string, avatar?: string) { const h = this.houses.get(houseId); if (!h) return null; h.name = name.trim(); h.avatar = avatar; return h; }
  setPresence(houseId: string, userId: string, presence: PresenceStatus, patch: Partial<Pick<HouseMember, "inParty" | "inCall" | "speaking" | "screenSharing">> = {}) {
    const member = this.houses.get(houseId)?.members.get(userId); if (!member) return null;
    Object.assign(member, patch); member.presence = presence; member.lastSeenAt = new Date().toISOString(); return member;
  }

  createInvite(houseId: string, actor: User, input: { expiresInHours: 1 | 24 | 168; maxUses: number; role?: HouseRole }) {
    const house = this.houses.get(houseId); if (!house) return null;
    const timestamp = Date.now(); const token = crypto.randomBytes(24).toString("base64url");
    const invite: HouseInvite = { id: crypto.randomUUID(), houseId, token, role: "MEMBER", createdBy: actor, createdAt: new Date(timestamp).toISOString(), expiresAt: new Date(timestamp + input.expiresInHours * 3_600_000).toISOString(), maxUses: Math.max(1, Math.min(100, input.maxUses)), uses: 0, revokedAt: null };
    const stored = { ...invite, token: "" };
    house.invites.set(invite.id, stored); this.inviteByToken.set(crypto.createHash("sha256").update(token).digest("hex"), stored); this.log(house, "INVITE_CREATED", `${actor.displayName} criou um convite.`, actor); return invite;
  }
  inspectInvite(token: string) {
    const invite = this.inviteByToken.get(crypto.createHash("sha256").update(token).digest("hex")); if (!invite) return { status: "INVALID" as const };
    const house = this.houses.get(invite.houseId)!;
    if (invite.revokedAt) return { status: "REVOKED" as const, houseName: house.name };
    if (new Date(invite.expiresAt).getTime() <= Date.now()) return { status: "EXPIRED" as const, houseName: house.name };
    if (invite.uses >= invite.maxUses) return { status: "LIMIT_REACHED" as const, houseName: house.name };
    return { status: "VALID" as const, houseId: house.id, houseName: house.name, invitedBy: invite.createdBy.displayName, onlineCount: [...house.members.values()].filter((member) => member.presence !== "OFFLINE").length, role: invite.role, expiresAt: invite.expiresAt };
  }
  getInvite(token: string) { return this.inviteByToken.get(crypto.createHash("sha256").update(token).digest("hex")); }
  acceptInvite(token: string, user: User) {
    const invite = this.getInvite(token);
    const house = invite && this.houses.get(invite.houseId);
    if (house?.members.has(user.id)) return { ok: true as const, houseId: house.id, roomId: house.primaryRoomId };
    const state = this.inspectInvite(token); if (state.status !== "VALID") return { ok: false as const, status: state.status };
    if (!invite || !house) return { ok: false as const, status: "INVALID" as const };
    this.addMembership(house, user, invite.role); invite.uses += 1;
    return { ok: true as const, houseId: house.id, roomId: house.primaryRoomId };
  }
  revokeInvite(houseId: string, inviteId: string) { const i = this.houses.get(houseId)?.invites.get(inviteId); if (!i) return false; i.revokedAt = new Date().toISOString(); return true; }
  changeRole(houseId: string, actorId: string, userId: string, role: HouseRole) {
    const house = this.houses.get(houseId), member = house?.members.get(userId); if (!house || !member || member.role === "HOST" || role === "HOST") return false;
    member.role = role; this.log(house, "ROLE_CHANGED", `${member.user.displayName} agora é ${role === "ADMIN" ? "admin" : "membro"}.`, house.members.get(actorId)?.user); return true;
  }
  transferHost(houseId: string, actorId: string, targetId: string) {
    const house = this.houses.get(houseId);
    const actor = house?.members.get(actorId), target = house?.members.get(targetId);
    if (!house || !actor || actor.role !== "HOST" || !target || targetId === actorId) return false;
    actor.role = "ADMIN";
    target.role = "HOST";
    this.log(house, "ROLE_CHANGED", `${target.user.displayName} agora é anfitrião da Casa.`, actor.user);
    return true;
  }
  removeMember(houseId: string, userId: string) { const h = this.houses.get(houseId), m = h?.members.get(userId); if (!h || !m || m.role === "HOST") return false; h.members.delete(userId); this.log(h, "MEMBER_LEFT", `${m.user.displayName} saiu da Casa.`, m.user); return true; }
  leave(houseId: string, userId: string) { return this.removeMember(houseId, userId); }
  private log(house: HouseRecord, kind: HouseActivity["kind"], text: string, actor?: User) { house.activity.push({ id: crypto.randomUUID(), houseId: house.id, kind, actor, text, createdAt: new Date().toISOString() }); house.activity = house.activity.slice(-100); }
}
