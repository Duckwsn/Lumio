import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DriveError, GoogleDriveService } from "./googleDrive.js";

test("OAuth PKCE, encrypted connection, paginated folder navigation, grants and byte ranges", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-drive-test-"));
  const previous = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, key: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY };
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const mockFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (url.pathname.endsWith("/token")) return Response.json({ access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600, scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email" });
    if (url.pathname.endsWith("/userinfo")) return Response.json({ sub: "google-account", email: "test@example.com" });
    if (url.pathname.endsWith("/revoke")) return new Response(null, { status: 200 });
    if (url.searchParams.get("alt") === "media") return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-2/100", "Accept-Ranges": "bytes" } });
    if (url.pathname.endsWith("/files")) {
      if (url.searchParams.has("pageToken")) return Response.json({ files: [{ id: "video000002", name: "B.webm", mimeType: "video/webm" }] });
      return Response.json({ files: [
        { id: "folder00001", name: "Filmes", mimeType: "application/vnd.google-apps.folder" },
        { id: "video000001", name: "A.mp4", mimeType: "video/mp4", capabilities: { canDownload: true } },
        { id: "document001", name: "segredo.pdf", mimeType: "application/pdf" },
        { id: "video000003", name: "Bloqueado.mp4", mimeType: "video/mp4", capabilities: { canDownload: false } },
      ], nextPageToken: "page-2" });
    }
    if (url.pathname.endsWith("/folder00001")) return Response.json({ id: "folder00001", name: "Filmes", mimeType: "application/vnd.google-apps.folder" });
    if (url.pathname.endsWith("/video000001")) return Response.json({ id: "video000001", name: "A.mp4", mimeType: "video/mp4", capabilities: { canDownload: true }, videoMediaMetadata: { durationMillis: "123000" } });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  try {
    const vault = path.join(directory, "connections.json");
    const drive = new GoogleDriveService(mockFetch, vault);
    const authUrl = new URL(drive.createAuthorizationUrl("owner"));
    assert.equal(authUrl.searchParams.get("scope")?.includes("drive.readonly"), true);
    assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
    assert.ok(authUrl.searchParams.get("state"));
    await drive.completeAuthorization(authUrl.searchParams.get("state")!, "code");
    assert.equal(drive.getStatus("owner").connected, true);
    assert.equal(drive.getStatus("viewer").connected, false);
    assert.equal(fs.readFileSync(vault, "utf8").includes("private-refresh"), false);
    const page1 = await drive.listFolder("owner");
    assert.deepEqual(page1.entries.map((entry) => entry.name), ["Filmes", "A.mp4"]);
    assert.equal(page1.nextPageToken, "page-2");
    const page2 = await drive.listFolder("owner", "root", page1.nextPageToken);
    assert.deepEqual(page2.entries.map((entry) => entry.name), ["B.webm"]);
    await drive.listFolder("owner", "folder00001");
    assert.match(calls.find((call) => call.url.pathname.endsWith("/files"))!.url.searchParams.get("q")!, /'root' in parents/);
    await assert.rejects(() => drive.listFolder("viewer"), (error) => error instanceof DriveError && error.code === "RECONNECT");
    const item = await drive.grant("party-1", "owner", "video000001");
    assert.equal(item.duration, 123);
    const ticket = drive.createPlaybackTicket({ roomId: "party-1", fileId: "video000001", viewerId: "viewer", sessionToken: "secret-nonce", ownerIsMember: true, mediaIsListed: true });
    assert.equal(drive.verifyTicket(ticket, "secret-nonce").ownerId, "owner");
    assert.throws(() => drive.verifyTicket(ticket, "wrong"), DriveError);
    assert.throws(() => drive.createPlaybackTicket({ roomId: "party-1", fileId: "another-file", viewerId: "viewer", sessionToken: "nonce", ownerIsMember: true, mediaIsListed: true }), DriveError);
    const stream = await drive.getPlaybackResponse("owner", "video000001", "bytes=0-2");
    assert.equal(stream.status, 206);
    assert.equal(stream.headers.get("content-range"), "bytes 0-2/100");
    assert.equal((calls.at(-1)?.init.headers as Record<string, string>).Range, "bytes=0-2");
    await assert.rejects(() => drive.getPlaybackResponse("owner", "video000001", "bytes=abc"), DriveError);
    await drive.disconnect("owner");
    assert.equal(drive.getStatus("owner").connected, false);
    assert.throws(() => drive.verifyTicket(ticket, "secret-nonce"), DriveError);
  } finally {
    process.env.GOOGLE_CLIENT_ID = previous.id;
    process.env.GOOGLE_CLIENT_SECRET = previous.secret;
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previous.key;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
