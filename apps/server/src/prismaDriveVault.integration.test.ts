import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { AuthStore } from "./authStore.js";
import { GoogleDriveService } from "./googleDrive.js";
import { PrismaAuthRepository } from "./prismaAuthRepository.js";
import { PrismaDriveVault } from "./prismaDriveVault.js";

const url = process.env.LUMIO_TEST_DATABASE_URL;
test("encrypted PostgreSQL Drive connection survives restart without persisting grants", { skip: !url }, async () => {
  if (!url || !new URL(url).pathname.endsWith("/lumio_test")) throw new Error("Use an isolated lumio_test database.");
  const prior = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, key: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY };
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  const db = new PrismaClient({ datasources: { db: { url } } });
  let userId = "";
  const mockFetch = (async (input: string | URL | Request) => {
    const target = new URL(String(input));
    if (target.pathname.endsWith("/token")) return Response.json({ access_token: "test-access-secret", refresh_token: "test-refresh-secret", expires_in: 3600, scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email" });
    if (target.pathname.endsWith("/userinfo")) return Response.json({ sub: "test-google-sub", email: "drive@example.test" });
    if (target.pathname.endsWith("/revoke")) return new Response(null, { status: 200 });
    return Response.json({ id: "video000001", name: "Video.mp4", mimeType: "video/mp4", capabilities: { canDownload: true } });
  }) as typeof fetch;
  try {
    await db.$connect();
    const auth = new AuthStore(null);
    const user = auth.createLocal("Drive Test", `${crypto.randomUUID()}@example.test`, "passw0rd-safe");
    userId = user.id;
    await new PrismaAuthRepository(db, auth).saveUser(user.id);
    const vault = new PrismaDriveVault(db);
    const first = new GoogleDriveService(mockFetch, undefined, vault);
    await first.initialize();
    const state = new URL(first.createAuthorizationUrl(user.id)).searchParams.get("state")!;
    await first.completeAuthorization(state, "fake-code");
    const row = await db.googleDriveConnection.findUniqueOrThrow({ where: { userId } });
    assert.equal(row.encryptedCredentials.includes("test-refresh-secret"), false);
    assert.equal(row.encryptedCredentials.includes("test-access-secret"), false);
    const second = new GoogleDriveService(mockFetch, undefined, vault);
    await second.initialize();
    assert.equal(second.getStatus(user.id).connected, true);
    assert.equal(second.getGrant("party", "video000001"), undefined);
    await second.disconnect(user.id);
    const third = new GoogleDriveService(mockFetch, undefined, vault);
    await third.initialize();
    assert.equal(third.getStatus(user.id).connected, false);
  } finally {
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
    process.env.GOOGLE_CLIENT_ID = prior.id;
    process.env.GOOGLE_CLIENT_SECRET = prior.secret;
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = prior.key;
  }
});
