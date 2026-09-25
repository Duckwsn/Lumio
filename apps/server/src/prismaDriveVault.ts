import { PrismaClient } from "@prisma/client";
import type { DriveVaultAdapter } from "./googleDrive.js";

/** Only AES-GCM ciphertext is persisted. OAuth access/refresh tokens never
 * appear in query metadata or logs. The key is supplied solely via env. */
export class PrismaDriveVault implements DriveVaultAdapter {
  constructor(private readonly db: PrismaClient) {}
  async load() {
    return this.db.googleDriveConnection.findMany({ select: { userId: true, encryptedCredentials: true } });
  }
  async save(userId: string, encryptedCredentials: string, connection: { email?: string; accountId?: string; scope: string }) {
    const data = { encryptedCredentials, email: connection.email ?? null, providerAccountId: connection.accountId ?? null, scopes: connection.scope, status: "CONNECTED" };
    await this.db.googleDriveConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }
  async delete(userId: string) { await this.db.googleDriveConnection.deleteMany({ where: { userId } }); }
}
