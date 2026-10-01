/** Ephemeral socket-level media interest. It is not Party presence or a persisted preference. */
export class MediaViewerRegistry {
  private readonly viewers = new Map<string, Set<string>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly onEmpty: (roomId: string) => void | Promise<void>, private readonly graceMs = 1500) {}

  enter(roomId: string, socketId: string) {
    this.cancel(roomId);
    const members = this.viewers.get(roomId) ?? new Set<string>();
    members.add(socketId);
    this.viewers.set(roomId, members);
    return members.size;
  }

  leave(roomId: string, socketId: string) {
    const members = this.viewers.get(roomId);
    if (!members?.delete(socketId)) return members?.size ?? 0;
    if (members.size) return members.size;
    this.viewers.delete(roomId);
    this.arm(roomId);
    return 0;
  }

  arm(roomId: string) {
    if (this.count(roomId)) return;
    this.cancel(roomId);
    const timer = setTimeout(() => {
      if (this.timers.get(roomId) !== timer) return;
      this.timers.delete(roomId);
      if (this.count(roomId) === 0) void this.onEmpty(roomId);
    }, this.graceMs);
    this.timers.set(roomId, timer);
  }

  count(roomId: string) { return this.viewers.get(roomId)?.size ?? 0; }
  cancel(roomId: string) { const timer = this.timers.get(roomId); if (timer) clearTimeout(timer); this.timers.delete(roomId); }
  clear(roomId: string) { this.cancel(roomId); this.viewers.delete(roomId); }
  clearAll() { for (const roomId of this.timers.keys()) this.cancel(roomId); this.viewers.clear(); }
}
