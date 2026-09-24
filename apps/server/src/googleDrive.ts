import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MediaItem } from "@lumio/shared";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER = "application/vnd.google-apps.folder";
const VIDEO = new Set(["video/mp4", "video/webm", "video/ogg"]);
const FIELDS = "id,name,mimeType,size,modifiedTime,videoMediaMetadata(durationMillis),capabilities(canDownload)";
const validId = (id: string) => /^[\w-]{10,200}$/.test(id);
type Connection = { accessToken: string; refreshToken: string; expiresAt: number; email?: string; accountId?: string; scope: string };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
type File = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; videoMediaMetadata?: { durationMillis?: string }; capabilities?: { canDownload?: boolean } };
type Ticket = { roomId: string; fileId: string; ownerId: string; viewerId: string; sessionHash: string; expiresAt: number };
export type DriveEntry = { id: string; name: string; kind: "folder" | "video"; item?: MediaItem; mimeType?: string; size?: string };
export class DriveError extends Error {
  constructor(public readonly code: "RECONNECT" | "UNAVAILABLE" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMIT" | "BAD_REQUEST", message: string) { super(message); }
}

export class GoogleDriveService {
  private readonly clientId = process.env.GOOGLE_CLIENT_ID;
  private readonly clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  private readonly redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/api/google-drive/oauth/callback";
  private readonly key = /^[a-f\d]{64}$/i.test(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "") ? Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY!, "hex") : null;
  private readonly vault: string;
  private readonly connections = new Map<string, Connection>();
  private readonly states = new Map<string, { userId: string; verifier: string; expiresAt: number }>();
  private readonly grants = new Map<string, { ownerId: string; expiresAt: number }>();
  private readonly tickets = new Map<string, Ticket>();
  private readonly refreshes = new Map<string, Promise<string>>();
  constructor(private readonly fetcher: typeof fetch = fetch, vaultPath = path.resolve(process.cwd(), "../../.data/google-drive-connections.json")) { this.vault = vaultPath; this.loadVault(); }
  isConfigured() { return Boolean(this.clientId && this.clientSecret && this.key && this.redirectUri); }
  getStatus(userId: string) { const connection = this.connections.get(userId); return { configured: this.isConfigured(), connected: Boolean(connection), email: connection?.email }; }
  private loadVault() {
    if (!this.key || !fs.existsSync(this.vault)) return;
    try {
      const box = JSON.parse(fs.readFileSync(this.vault, "utf8")) as { iv: string; tag: string; data: string };
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, Buffer.from(box.iv, "base64"));
      decipher.setAuthTag(Buffer.from(box.tag, "base64"));
      const clear = Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]);
      for (const [userId, connection] of JSON.parse(clear.toString("utf8")) as Array<[string, Connection]>) this.connections.set(userId, connection);
    } catch { throw new Error("O cofre de tokens do Google Drive não pôde ser aberto. Verifique a chave de criptografia."); }
  }
  private saveVault() {
    if (!this.key) throw new DriveError("UNAVAILABLE", "Configure a chave de criptografia do Google Drive.");
    fs.mkdirSync(path.dirname(this.vault), { recursive: true });
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify([...this.connections])), cipher.final()]);
    const box = JSON.stringify({ iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
    const temporary = `${this.vault}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, box, { mode: 0o600 }); fs.renameSync(temporary, this.vault);
  }
  createAuthorizationUrl(userId: string) {
    if (!this.isConfigured()) throw new DriveError("UNAVAILABLE", "Google Drive não está configurado no servidor.");
    if (this.states.size > 5_000) for (const [key, pending] of this.states) if (pending.expiresAt <= Date.now()) this.states.delete(key);
    if (this.states.size > 10_000) throw new DriveError("RATE_LIMIT", "Muitas autorizações pendentes. Aguarde alguns minutos.");
    const state = crypto.randomBytes(32).toString("base64url"), verifier = crypto.randomBytes(32).toString("base64url");
    this.states.set(state, { userId, verifier, expiresAt: Date.now() + 600_000 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries({ client_id: this.clientId!, redirect_uri: this.redirectUri, response_type: "code", access_type: "offline", prompt: "consent select_account", scope: `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`, state, code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" })) url.searchParams.set(key, value);
    return url.toString();
  }
  async completeAuthorization(state: string, code: string) {
    const pending = this.states.get(state); this.states.delete(state);
    if (!pending || pending.expiresAt < Date.now() || !this.isConfigured()) throw new DriveError("BAD_REQUEST", "Autorização expirada. Tente conectar novamente.");
    const body = new URLSearchParams({ client_id: this.clientId!, client_secret: this.clientSecret!, redirect_uri: this.redirectUri, grant_type: "authorization_code", code, code_verifier: pending.verifier });
    const response = await this.fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const tokens = await response.json() as TokenResponse;
    if (!response.ok || !tokens.access_token || !tokens.refresh_token || !tokens.scope?.split(" ").includes(DRIVE_SCOPE)) throw new DriveError("BAD_REQUEST", "O Google não concedeu acesso offline de leitura ao Drive.");
    const profileResponse = await this.fetcher("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = profileResponse.ok ? await profileResponse.json() as { sub?: string; email?: string } : {};
    this.connections.set(pending.userId, { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000, email: profile.email, accountId: profile.sub, scope: tokens.scope });
    this.saveVault(); return pending.userId;
  }
  async disconnect(userId: string) {
    const connection = this.connections.get(userId); this.connections.delete(userId);
    try { this.saveVault(); } catch (error) { if (connection) this.connections.set(userId, connection); throw error; }
    for (const [key, grant] of this.grants) if (grant.ownerId === userId) this.grants.delete(key);
    for (const [key, ticket] of this.tickets) if (ticket.ownerId === userId) this.tickets.delete(key);
    if (connection) await this.fetcher("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: connection.refreshToken }) }).catch(() => undefined);
  }
  private async accessToken(userId: string): Promise<string> {
    const connection = this.connections.get(userId);
    if (!connection) throw new DriveError("RECONNECT", "Conecte seu Google Drive novamente.");
    if (connection.expiresAt > Date.now() + 60_000) return connection.accessToken;
    const inFlight = this.refreshes.get(userId); if (inFlight) return inFlight;
    const refresh = (async () => {
      const body = new URLSearchParams({ client_id: this.clientId!, client_secret: this.clientSecret!, refresh_token: connection.refreshToken, grant_type: "refresh_token" });
      const response = await this.fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      const tokens = await response.json() as TokenResponse;
      if (!response.ok || !tokens.access_token) { this.connections.delete(userId); this.saveVault(); throw new DriveError("RECONNECT", "Conecte seu Google Drive novamente."); }
      connection.accessToken = tokens.access_token; connection.expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000; this.saveVault(); return connection.accessToken;
    })();
    this.refreshes.set(userId, refresh);
    try { return await refresh; } finally { this.refreshes.delete(userId); }
  }
  private async request(userId: string, url: URL, init: RequestInit = {}) {
    const token = await this.accessToken(userId);
    const response = await this.fetcher(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, redirect: "error" });
    if (response.status === 401) throw new DriveError("RECONNECT", "Conecte seu Google Drive novamente.");
    if (response.status === 403) throw new DriveError("FORBIDDEN", "Arquivo sem acesso ou cota do Drive atingida.");
    if (response.status === 404) throw new DriveError("NOT_FOUND", "Arquivo ou pasta indisponível.");
    if (response.status === 429) throw new DriveError("RATE_LIMIT", "O Google Drive está ocupado. Tente novamente em instantes.");
    if (response.status >= 500) throw new DriveError("UNAVAILABLE", "O Google Drive está temporariamente indisponível.");
    return response;
  }
  async getFile(userId: string, fileId: string) {
    if (!validId(fileId)) throw new DriveError("BAD_REQUEST", "Arquivo inválido.");
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`); url.searchParams.set("fields", FIELDS);
    const response = await this.request(userId, url);
    if (!response.ok) throw new DriveError("UNAVAILABLE", "Não foi possível ler o arquivo.");
    return response.json() as Promise<File>;
  }
  private media(file: File): MediaItem {
    return { id: `drive:${file.id}`, provider: "google-drive", providerMediaId: file.id, type: "video", title: file.name, duration: file.videoMediaMetadata?.durationMillis ? Number(file.videoMediaMetadata.durationMillis) / 1000 : undefined, mimeType: file.mimeType, metadata: { size: file.size, modifiedTime: file.modifiedTime } };
  }
  async resolve(userId: string, input: string) {
    const match = input.match(/\/file\/d\/([\w-]+)/) ?? input.match(/[?&]id=([\w-]+)/);
    const file = await this.getFile(userId, match?.[1] ?? input.trim());
    if (!VIDEO.has(file.mimeType) || file.capabilities?.canDownload === false) throw new DriveError("FORBIDDEN", "Este vídeo não pode ser reproduzido no navegador.");
    return this.media(file);
  }
  async listFolder(userId: string, folderId = "root", pageToken?: string) {
    if (folderId !== "root" && (await this.getFile(userId, folderId)).mimeType !== FOLDER) throw new DriveError("BAD_REQUEST", "Pasta inválida.");
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    const parent = folderId.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
    url.searchParams.set("q", `'${parent}' in parents and trashed = false and (mimeType = '${FOLDER}' or mimeType = 'video/mp4' or mimeType = 'video/webm' or mimeType = 'video/ogg')`);
    url.searchParams.set("pageSize", "100"); url.searchParams.set("orderBy", "folder,name_natural");
    url.searchParams.set("fields", `nextPageToken,files(${FIELDS})`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await this.request(userId, url);
    if (!response.ok) throw new DriveError("UNAVAILABLE", "Não foi possível carregar esta pasta.");
    const data = await response.json() as { files?: File[]; nextPageToken?: string };
    const entries: DriveEntry[] = [];
    for (const file of data.files ?? []) {
      if (file.mimeType === FOLDER) entries.push({ id: file.id, name: file.name, kind: "folder" });
      else if (VIDEO.has(file.mimeType) && file.capabilities?.canDownload !== false) entries.push({ id: file.id, name: file.name, kind: "video", mimeType: file.mimeType, size: file.size, item: this.media(file) });
    }
    entries.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name, "pt-BR", { numeric: true }) : a.kind === "folder" ? -1 : 1);
    return { entries, nextPageToken: data.nextPageToken };
  }
  private grantKey(roomId: string, fileId: string) { return `${roomId}:${fileId}`; }
  async grant(roomId: string, ownerId: string, fileId: string) {
    const item = await this.resolve(ownerId, fileId);
    this.grants.set(this.grantKey(roomId, fileId), { ownerId, expiresAt: Date.now() + 24 * 60 * 60_000 });
    return item;
  }
  getGrant(roomId: string, fileId: string) { const key = this.grantKey(roomId, fileId), grant = this.grants.get(key); if (grant && grant.expiresAt <= Date.now()) this.grants.delete(key); return grant && grant.expiresAt > Date.now() && this.connections.has(grant.ownerId) ? grant : undefined; }
  revokeOwnerFromHouse(roomId: string, ownerId: string) { for (const [key, grant] of this.grants) if (key.startsWith(`${roomId}:`) && grant.ownerId === ownerId) this.grants.delete(key); }
  revokeViewer(viewerId: string) { for (const [key, ticket] of this.tickets) if (ticket.viewerId === viewerId) this.tickets.delete(key); }
  createPlaybackTicket(input: { roomId: string; fileId: string; viewerId: string; sessionToken: string; ownerIsMember: boolean; mediaIsListed: boolean }) {
    const grant = this.getGrant(input.roomId, input.fileId);
    if (!grant || !input.ownerIsMember || !input.mediaIsListed) throw new DriveError("FORBIDDEN", "Este vídeo não está disponível nesta Party.");
    if (this.tickets.size > 5_000) for (const [key, entry] of this.tickets) if (entry.expiresAt <= Date.now()) this.tickets.delete(key);
    if (this.tickets.size > 20_000) throw new DriveError("RATE_LIMIT", "Muitas reproduções pendentes. Aguarde alguns minutos.");
    const ticket = crypto.randomBytes(32).toString("base64url");
    this.tickets.set(ticket, { roomId: input.roomId, fileId: input.fileId, ownerId: grant.ownerId, viewerId: input.viewerId, sessionHash: crypto.createHash("sha256").update(input.sessionToken).digest("hex"), expiresAt: Date.now() + 5 * 60_000 });
    return ticket;
  }
  verifyTicket(ticket: string, sessionToken: string) {
    const record = this.tickets.get(ticket);
    if (record && record.expiresAt < Date.now()) this.tickets.delete(ticket);
    if (!record || record.expiresAt < Date.now() || !sessionToken || crypto.createHash("sha256").update(sessionToken).digest("hex") !== record.sessionHash || !this.getGrant(record.roomId, record.fileId)) throw new DriveError("FORBIDDEN", "Autorização de reprodução expirada.");
    return record;
  }
  async getPlaybackResponse(ownerId: string, fileId: string, range?: string, signal?: AbortSignal) {
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || range.length > 64 || (!match[1] && !match[2])) throw new DriveError("BAD_REQUEST", "Range inválido.");
      const start = match[1] ? Number(match[1]) : null, end = match[2] ? Number(match[2]) : null;
      if ((start !== null && !Number.isSafeInteger(start)) || (end !== null && !Number.isSafeInteger(end)) || (start !== null && end !== null && (end < start || end - start > 64 * 1024 * 1024)) || (start === null && end !== null && end > 64 * 1024 * 1024)) throw new DriveError("BAD_REQUEST", "Range inválido.");
    }
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`); url.searchParams.set("alt", "media");
    return this.request(ownerId, url, { headers: range ? { Range: range } : undefined, signal });
  }
}
