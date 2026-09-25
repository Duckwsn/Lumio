import { PrismaClient } from "@prisma/client";
import { AuthStore, type AuthSnapshot } from "./authStore.js";

/** PostgreSQL adapter for the existing synchronous auth domain. Only hashed
 * credentials and tokens are stored. Call saveUser before acknowledging a write. */
export class PrismaAuthRepository {
  private pending: Promise<void> = Promise.resolve();
  private failed = false;

  constructor(private readonly db: PrismaClient, private readonly store: AuthStore) {}

  async load() {
    const rows = await this.db.user.findMany({ include: { externalIdentities: true, authSessions: true, authTokens: true } });
    const snapshot: AuthSnapshot = {
      version: 2,
      users: rows.map((row) => ({
        user: {
          id: row.id,
          displayName: row.displayName,
          ...(row.email ? { email: row.email } : {}),
          ...(row.avatar ? { avatar: row.avatar } : {}),
          color: row.color,
          ...(row.status ? { status: row.status } : {}),
        },
        password: row.passwordHash,
        google: (() => { const identity = row.externalIdentities.find((entry) => entry.provider === "google"); return identity ? { sub: identity.providerSubject, email: identity.emailSnapshot ?? row.email ?? "" } : null; })(),
        emailVerifiedAt: row.emailVerifiedAt?.getTime() ?? null,
      })),
      sessions: rows.flatMap((row) => row.authSessions.map((session) => ({ hash: session.hash, userId: row.id, authenticatedAt: session.authenticatedAt.getTime(), expiresAt: session.expiresAt.getTime() }))),
      tokens: rows.flatMap((row) => row.authTokens.map((token) => ({ hash: token.hash, userId: row.id, purpose: token.purpose as "EMAIL_VERIFICATION" | "PASSWORD_RESET", createdAt: token.createdAt.getTime(), expiresAt: token.expiresAt.getTime() }))),
    };
    this.store.restore(snapshot);
  }

  saveUser(userId: string) {
    if (this.failed) return Promise.reject(new Error("Persistência de autenticação indisponível."));
    const snapshot = this.store.snapshot();
    const record = snapshot.users.find((entry) => entry.user.id === userId);
    if (!record) return Promise.reject(new Error("Usuário ausente para persistência."));
    const sessions = snapshot.sessions.filter((entry) => entry.userId === userId);
    const tokens = snapshot.tokens.filter((entry) => entry.userId === userId);
    const operation = this.pending.then(async () => {
      await this.db.$transaction(async (tx) => {
        const user = record.user;
        const data = {
          displayName: user.displayName,
          email: user.email ?? null,
          passwordHash: record.password,
          emailVerifiedAt: record.emailVerifiedAt ? new Date(record.emailVerifiedAt) : null,
          avatar: user.avatar ?? null,
          color: user.color,
          status: user.status ?? null,
        };
        await tx.user.upsert({ where: { id: userId }, create: { id: userId, ...data }, update: data });
        await tx.externalIdentity.deleteMany({ where: { userId, provider: "google" } });
        if (record.google) await tx.externalIdentity.create({ data: { userId, provider: "google", providerSubject: record.google.sub, emailSnapshot: record.google.email } });
        await tx.authSession.deleteMany({ where: { userId } });
        if (sessions.length) await tx.authSession.createMany({ data: sessions.map((entry) => ({ hash: entry.hash, userId, authenticatedAt: new Date(entry.authenticatedAt), expiresAt: new Date(entry.expiresAt) })) });
        await tx.authToken.deleteMany({ where: { userId } });
        if (tokens.length) await tx.authToken.createMany({ data: tokens.map((entry) => ({ hash: entry.hash, userId, purpose: entry.purpose, createdAt: new Date(entry.createdAt), expiresAt: new Date(entry.expiresAt) })) });
      });
    });
    this.pending = operation.catch(() => { this.failed = true; });
    return operation;
  }

  isHealthy() { return !this.failed; }
  async drain() { await this.pending; }
}
