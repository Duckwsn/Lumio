import crypto from "node:crypto";
import type { MediaItem } from "@lumio/shared";

interface GoogleConnection {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  size?: string;
  capabilities?: { canDownload?: boolean };
  videoMediaMetadata?: { durationMillis?: string };
}

const playableMimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "audio/wav",
]);

export class GoogleDriveService {
  private readonly clientId = process.env.GOOGLE_CLIENT_ID;
  private readonly clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  private readonly redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/api/google-drive/oauth/callback";
  private readonly connections = new Map<string, GoogleConnection>();
  private readonly oauthStates = new Map<string, { userId: string; expiresAt: number }>();
  private readonly playbackTickets = new Map<string, { userId: string; fileId: string; expiresAt: number }>();

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  getStatus(userId: string) {
    const connection = this.connections.get(userId);
    return { configured: this.isConfigured(), connected: Boolean(connection), email: connection?.email };
  }

  createAuthorizationUrl(userId: string) {
    if (!this.isConfigured()) throw new Error("Google Drive não está configurado no servidor.");
    const state = crypto.randomBytes(32).toString("hex");
    this.oauthStates.set(state, { userId, expiresAt: Date.now() + 10 * 60_000 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.clientId!);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("scope", "openid email https://www.googleapis.com/auth/drive.readonly");
    url.searchParams.set("state", state);
    return url.toString();
  }

  async completeAuthorization(state: string, code: string) {
    const pending = this.oauthStates.get(state);
    this.oauthStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new Error("Estado OAuth inválido ou expirado.");
    const body = new URLSearchParams({
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
      code,
    });
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const tokens = await response.json() as GoogleTokenResponse;
    if (!response.ok || !tokens.access_token) throw new Error("O Google não concluiu a autorização.");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = profileResponse.ok ? await profileResponse.json() as { email?: string } : {};
    this.connections.set(pending.userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      email: profile.email,
    });
    return pending.userId;
  }

  async disconnect(userId: string) {
    const connection = this.connections.get(userId);
    this.connections.delete(userId);
    if (connection) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(connection.accessToken)}`, { method: "POST" }).catch(() => undefined);
  }

  private async getAccessToken(userId: string) {
    const connection = this.connections.get(userId);
    if (!connection) throw new Error("GOOGLE_RECONNECT");
    if (connection.expiresAt > Date.now() + 60_000) return connection.accessToken;
    if (!connection.refreshToken) {
      this.connections.delete(userId);
      throw new Error("GOOGLE_RECONNECT");
    }
    const body = new URLSearchParams({ client_id: this.clientId!, client_secret: this.clientSecret!, refresh_token: connection.refreshToken, grant_type: "refresh_token" });
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const tokens = await response.json() as GoogleTokenResponse;
    if (!response.ok || !tokens.access_token) {
      this.connections.delete(userId);
      throw new Error("GOOGLE_RECONNECT");
    }
    connection.accessToken = tokens.access_token;
    connection.expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
    return connection.accessToken;
  }

  private async driveRequest(userId: string, url: URL, init: RequestInit = {}) {
    const accessToken = await this.getAccessToken(userId);
    return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } });
  }

  private toMediaItem(file: DriveFile): MediaItem {
    return {
      id: `drive:${file.id}`,
      provider: "google-drive",
      providerMediaId: file.id,
      type: file.mimeType.startsWith("audio/") ? "audio" : "video",
      title: file.name,
      thumbnail: file.thumbnailLink,
      duration: file.videoMediaMetadata?.durationMillis ? Number(file.videoMediaMetadata.durationMillis) / 1000 : undefined,
      mimeType: file.mimeType,
      metadata: { modifiedTime: file.modifiedTime, size: file.size },
    };
  }

  async listFiles(userId: string, query = "") {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    const mimeQuery = [...playableMimeTypes].map((mime) => `mimeType='${mime}'`).join(" or ");
    const safeQuery = query.trim().replaceAll("'", "\\'");
    url.searchParams.set("q", `trashed=false and (${mimeQuery})${safeQuery ? ` and name contains '${safeQuery}'` : ""}`);
    url.searchParams.set("pageSize", "40");
    url.searchParams.set("orderBy", "viewedByMeTime desc");
    url.searchParams.set("fields", "files(id,name,mimeType,thumbnailLink,modifiedTime,size,capabilities(canDownload),videoMediaMetadata(durationMillis))");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");
    const response = await this.driveRequest(userId, url);
    if (!response.ok) throw new Error(response.status === 401 ? "GOOGLE_RECONNECT" : "Não foi possível listar os arquivos do Drive.");
    const payload = await response.json() as { files?: DriveFile[] };
    return (payload.files ?? []).filter((file) => playableMimeTypes.has(file.mimeType) && file.capabilities?.canDownload !== false).map((file) => this.toMediaItem(file));
  }

  async resolve(userId: string, input: string) {
    const match = input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ?? input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const fileId = match?.[1] ?? (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim()) ? input.trim() : "");
    if (!fileId) throw new Error("Referência do Google Drive inválida.");
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set("fields", "id,name,mimeType,thumbnailLink,modifiedTime,size,capabilities(canDownload),videoMediaMetadata(durationMillis)");
    url.searchParams.set("supportsAllDrives", "true");
    const response = await this.driveRequest(userId, url);
    if (!response.ok) throw new Error(response.status === 404 ? "Arquivo removido ou sem permissão." : "Não foi possível acessar o arquivo.");
    const file = await response.json() as DriveFile;
    if (!playableMimeTypes.has(file.mimeType)) throw new Error(`O navegador não reproduz ${file.mimeType} nesta etapa.`);
    if (file.capabilities?.canDownload === false) throw new Error("O proprietário deste arquivo não permite download/reprodução.");
    return this.toMediaItem(file);
  }

  async createPlaybackTicket(userId: string, fileId: string) {
    await this.resolve(userId, fileId);
    const ticket = crypto.randomBytes(32).toString("hex");
    this.playbackTickets.set(ticket, { userId, fileId, expiresAt: Date.now() + 5 * 60_000 });
    return ticket;
  }

  async getPlaybackResponse(ticket: string, range?: string) {
    const record = this.playbackTickets.get(ticket);
    if (!record || record.expiresAt < Date.now()) {
      this.playbackTickets.delete(ticket);
      throw new Error("PLAYBACK_TICKET_EXPIRED");
    }
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(record.fileId)}`);
    url.searchParams.set("alt", "media");
    return this.driveRequest(record.userId, url, { headers: range ? { Range: range } : undefined });
  }
}
