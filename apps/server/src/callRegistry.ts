/** One active call socket per account per Party. A socket ID is the peer generation. */
export class CallRegistry {
  private readonly rooms = new Map<string, Map<string, string>>();

  join(roomId: string, userId: string, socketId: string, isActive: (socketId: string) => boolean) {
    const room = this.rooms.get(roomId) ?? new Map<string, string>();
    const current = room.get(userId);
    if (current && current !== socketId && isActive(current)) return { ok: false as const, peers: [] as [string, string][] };
    for (const [peerId, peerSocketId] of room) if (!isActive(peerSocketId)) room.delete(peerId);
    const peers = [...room.entries()].filter(([peerId]) => peerId !== userId);
    room.set(userId, socketId);
    this.rooms.set(roomId, room);
    return { ok: true as const, peers, alreadyJoined: current === socketId };
  }

  leave(roomId: string, userId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (room?.get(userId) !== socketId) return false;
    room.delete(userId);
    if (!room.size) this.rooms.delete(roomId);
    return true;
  }

  canSignal(roomId: string, userId: string, socketId: string, targetUserId: string, targetSocketId: string) {
    const room = this.rooms.get(roomId);
    return room?.get(userId) === socketId && room.get(targetUserId) === targetSocketId;
  }

  isJoined(roomId: string, userId: string, socketId: string) {
    return this.rooms.get(roomId)?.get(userId) === socketId;
  }

  socketFor(roomId: string, userId: string) {
    return this.rooms.get(roomId)?.get(userId);
  }
}
