import { PrismaClient } from "@prisma/client";
import type { HouseActivity, HouseRole, User } from "@lumio/shared";
import { SocialStore, type PersistedHouse } from "./socialStore.js";

/** Durable House adapter for the first, single-process deployment. Presence is
 * deliberately reconstructed as OFFLINE and never persisted on heartbeats. */
export class PrismaSocialRepository {
  private pending: Promise<void> = Promise.resolve();
  private failed = false;
  constructor(private readonly db: PrismaClient, private readonly store: SocialStore, private readonly getUser: (id: string) => User | undefined) {}

  async load() {
    const groups = await this.db.group.findMany({ include: { rooms: true, members: true, invites: true, activity: true } });
    for (const group of groups) {
      if (group.rooms.length !== 1) throw new Error("Casa sem exatamente uma Party persistida.");
      const input: PersistedHouse = {
        id: group.id, name: group.name, avatar: group.avatar ?? undefined, primaryRoomId: group.rooms[0].id,
        members: group.members.map((entry) => ({ userId: entry.userId, role: entry.role as HouseRole, joinedAt: entry.joinedAt.toISOString(), lastSeenAt: entry.lastSeenAt.toISOString() })),
        invites: group.invites.map((entry) => ({ hash: entry.tokenHash, id: entry.id, createdById: entry.createdById, role: entry.role as HouseRole, createdAt: entry.createdAt.toISOString(), expiresAt: entry.expiresAt.toISOString(), maxUses: entry.maxUses, uses: entry.uses, revokedAt: entry.revokedAt?.toISOString() ?? null })),
        activity: group.activity.map((entry) => ({ id: entry.id, actorId: entry.actorId ?? undefined, kind: entry.kind as HouseActivity["kind"], text: entry.text, createdAt: entry.createdAt.toISOString() })),
      };
      this.store.restoreHouse(input, this.getUser);
    }
    return groups.map((group) => ({ houseId: group.id, houseName: group.name, roomId: group.rooms[0].id }));
  }

  saveHouse(houseId: string) {
    if (this.failed) return Promise.reject(new Error("Persistência de Casas indisponível."));
    const snapshot = this.store.snapshotHouse(houseId);
    if (!snapshot) return Promise.reject(new Error("Casa ausente para persistência."));
    const host = snapshot.members.find((entry) => entry.role === "HOST");
    if (!host) return Promise.reject(new Error("Casa sem anfitrião."));
    const operation = this.pending.then(async () => {
      await this.db.$transaction(async (tx) => {
        await tx.group.upsert({ where: { id: snapshot.id }, create: { id: snapshot.id, name: snapshot.name, avatar: snapshot.avatar, ownerId: host.userId }, update: { name: snapshot.name, avatar: snapshot.avatar, ownerId: host.userId } });
        await tx.room.upsert({ where: { id: snapshot.primaryRoomId }, create: { id: snapshot.primaryRoomId, groupId: snapshot.id, name: "Party" }, update: {} });
        await tx.groupMember.deleteMany({ where: { groupId: snapshot.id } });
        if (snapshot.members.length) await tx.groupMember.createMany({ data: snapshot.members.map((entry) => ({ groupId: snapshot.id, userId: entry.userId, role: entry.role, joinedAt: new Date(entry.joinedAt), lastSeenAt: new Date(entry.lastSeenAt) })) });
        await tx.houseInvite.deleteMany({ where: { groupId: snapshot.id } });
        if (snapshot.invites.length) await tx.houseInvite.createMany({ data: snapshot.invites.map((entry) => ({ id: entry.id, groupId: snapshot.id, createdById: entry.createdById, tokenHash: entry.hash, role: entry.role, createdAt: new Date(entry.createdAt), expiresAt: new Date(entry.expiresAt), maxUses: entry.maxUses, uses: entry.uses, revokedAt: entry.revokedAt ? new Date(entry.revokedAt) : null })) });
        await tx.houseActivity.deleteMany({ where: { groupId: snapshot.id } });
        if (snapshot.activity.length) await tx.houseActivity.createMany({ data: snapshot.activity.map((entry) => ({ id: entry.id, groupId: snapshot.id, actorId: entry.actorId, kind: entry.kind, text: entry.text, createdAt: new Date(entry.createdAt) })) });
      });
    });
    this.pending = operation.catch(() => { this.failed = true; });
    return operation;
  }
  isHealthy() { return !this.failed; }
  async drain() { await this.pending; }
}
