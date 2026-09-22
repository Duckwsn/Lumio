import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { z } from "zod";
import {
  addQueueInputSchema,
  changeMediaSchema,
  chatInputSchema,
  eventNames,
  joinRoomInputSchema,
  mediaCommandSchema,
  mediaItemSchema,
  modeChangeSchema,
  presenceInputSchema,
  queueAdvanceSchema,
  queueItemSchema,
  queueMoveSchema,
  queuePlayNextSchema,
  queueRevisionSchema,
  roomSettingsInputSchema,
  voiceSignalSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
  houseRoleSchema,
  type Permission,
  type HouseHistoryEntry,
  type QueueItem,
  type User,
} from "@lumio/shared";
import { RoomStore } from "./store.js";
import { SocialStore } from "./socialStore.js";
import { can } from "./authorization.js";
import { GoogleDriveService } from "./googleDrive.js";
import { YouTubeDataError, YouTubeDataService } from "./youtubeData.js";

// npm workspaces execute this package with apps/server as the working directory.
// Resolve the project-level environment file from this module so dev and dist agree.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();
const httpServer = http.createServer(app);
const allowedOrigins = CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
const corsOrigin = (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
  const localDevelopmentOrigin = process.env.NODE_ENV !== "production" && Boolean(origin?.match(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/));
  callback(null, !origin || allowedOrigins.includes(origin) || localDevelopmentOrigin);
};
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOrigin, credentials: true },
});
const store = new RoomStore();
const social = new SocialStore();
const googleDrive = new GoogleDriveService();
const youtube = new YouTubeDataService();

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

const sessions = new Map<string, User>();
const passwords = new Map<string, string>();
const usersByEmail = new Map<string, User>();
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const colorPalette = ["#f7c98b", "#b8d7c0", "#d6b3e6", "#95b6d5", "#edaa8b", "#e6d392"];

const hashPassword = (password: string, salt: string) => crypto.scryptSync(password, salt, 32).toString("hex");
const createUser = (displayName: string, password = "demo", email?: string) => {
  const id = crypto.randomUUID();
  const user: User = { id, displayName: displayName.trim().slice(0, 32), email: email?.trim().toLowerCase(), color: colorPalette[sessions.size % colorPalette.length] };
  const salt = crypto.randomBytes(16).toString("hex");
  passwords.set(id, `${salt}:${hashPassword(password, salt)}`);
  if (user.email) usersByEmail.set(user.email, user);
  return user;
};
const authRateLimit = (request: express.Request, response: express.Response) => {
  const key = request.ip ?? "local"; const now = Date.now(); const entry = authAttempts.get(key);
  if (!entry || entry.resetAt <= now) { authAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 }); return true; }
  entry.count += 1; if (entry.count > 20) { response.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }); return false; } return true;
};
const createSession = (user: User) => {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, user);
  return token;
};
const getUser = (request: express.Request) => {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  return token ? sessions.get(token) : undefined;
};
const requireUser = (request: express.Request, response: express.Response) => {
  const user = getUser(request);
  if (!user) response.status(401).json({ message: "Sessão ausente ou expirada." });
  return user;
};
const requireHousePermission = (request: express.Request, response: express.Response, permission: Permission) => {
  const user = requireUser(request, response); if (!user) return null;
  if (!can(social.role(String(request.params.houseId), user.id), permission)) { response.status(403).json({ message: "Você não tem permissão para esta ação." }); return null; }
  return user;
};
const requireRoomMember = (request: express.Request, response: express.Response, roomId: string) => {
  const user = requireUser(request, response); if (!user) return null; const house = social.getByRoom(roomId);
  if (!house || !social.isMember(house.id, user.id)) { response.status(403).json({ message: "Você não faz parte desta Casa." }); return null; }
  return user;
};
const requireRoomPermission = (request: express.Request, response: express.Response, roomId: string, permission: Permission) => {
  const user = requireRoomMember(request, response, roomId); if (!user) return null; const house = social.getByRoom(roomId);
  if (!house || !can(social.role(house.id, user.id), permission)) { response.status(403).json({ message: "Você não tem permissão para esta ação." }); return null; }
  return user;
};
const emitMediaHubUpdate = (roomId: string, kind: "library" | "favorite" | "playlist" | "history") => { const house = social.getByRoom(roomId); if (house) io.to(roomId).emit("media-hub:update", { houseId: house.id, kind }); };

app.get("/api/health", (_request, response) => response.json({ ok: true, service: "lumio-server" }));
app.get("/api/groups", (_request, response) => response.json({ groups: store.listGroups() }));
app.get("/api/rooms/:roomId", (request, response) => {
  const user = requireRoomMember(request, response, String(request.params.roomId)); if (!user) return;
  const snapshot = store.getSnapshot(request.params.roomId);
  if (!snapshot) return response.status(404).json({ message: "Sala não encontrada." });
  return response.json({ snapshot });
});

const youtubeError = (response: express.Response, error: unknown) => {
  if (error instanceof YouTubeDataError) return response.status(error.status).json({ code: error.code, message: error.message });
  return response.status(502).json({ code: "UNAVAILABLE", message: "Não conseguimos acessar o YouTube agora." });
};

app.get("/api/youtube/search", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  const input = z.object({ q: z.string().trim().min(3).max(100), pageToken: z.string().max(256).optional() }).safeParse(request.query);
  if (!input.success) return response.status(400).json({ code: "INVALID", message: "Digite pelo menos 3 caracteres." });
  try { youtube.checkRateLimit(user.id); return response.json(await youtube.search(input.data.q, input.data.pageToken)); }
  catch (error) { return youtubeError(response, error); }
});

app.get("/api/youtube/videos/:videoId", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  const videoId = z.string().regex(/^[\w-]{11}$/).safeParse(request.params.videoId);
  if (!videoId.success) return response.status(400).json({ code: "INVALID", message: "URL ou ID do YouTube inválido." });
  try { youtube.checkRateLimit(user.id); return response.json({ item: await youtube.getVideo(videoId.data) }); }
  catch (error) { return youtubeError(response, error); }
});

app.post("/api/auth/demo", (request, response) => {
  if (!authRateLimit(request, response)) return;
  const body = z.object({ displayName: z.string().min(1).max(32) }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ message: "Informe um nome válido." });
  const user = createUser(body.data.displayName);
  return response.json({ user, token: createSession(user) });
});

app.post("/api/auth/signup", (request, response) => {
  if (!authRateLimit(request, response)) return;
  const body = z.object({ displayName: z.string().trim().min(2).max(32), email: z.string().trim().email().max(160), password: z.string().min(8).max(100) }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ message: "Confira nome, e-mail e senha." });
  if (usersByEmail.has(body.data.email.toLowerCase())) return response.status(409).json({ message: "Este e-mail já está em uso." });
  const user = createUser(body.data.displayName, body.data.password, body.data.email);
  return response.status(201).json({ user, token: createSession(user) });
});

app.post("/api/auth/login", (request, response) => {
  if (!authRateLimit(request, response)) return;
  const body = z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(100) }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ message: "Informe e-mail e senha." });
  const user = usersByEmail.get(body.data.email.toLowerCase());
  const record = user ? passwords.get(user.id) : undefined;
  if (!user || !record) return response.status(401).json({ message: "E-mail ou senha incorretos." });
  const [salt, expected] = record.split(":");
  const actual = hashPassword(body.data.password, salt);
  if (actual !== expected) return response.status(401).json({ message: "E-mail ou senha incorretos." });
  return response.json({ user, token: createSession(user) });
});

app.get("/api/auth/session", (request, response) => {
  const user = getUser(request);
  if (!user) return response.status(401).json({ message: "Sessão ausente." });
  return response.json({ user });
});
app.get("/api/bootstrap", (request, response) => { const user = requireUser(request, response); if (!user) return; const houses = social.listForUser(user.id).map((house) => { const media = store.getSnapshot(house.primaryRoomId)?.currentMedia; return { ...house, nowPlaying: media?.mediaId ? { title: media.title, provider: media.provider } : null }; }); return response.json({ user, houses }); });

app.post("/api/auth/logout", (request, response) => {
  const token = request.header("authorization")?.slice(7);
  if (token) sessions.delete(token);
  return response.status(204).end();
});

app.get("/api/houses", (request, response) => { const user = requireUser(request, response); if (!user) return; const houses = social.listForUser(user.id).map((house) => { const media = store.getSnapshot(house.primaryRoomId)?.currentMedia; return { ...house, nowPlaying: media?.mediaId ? { title: media.title, provider: media.provider } : null }; }); return response.json({ houses }); });
app.post("/api/houses", (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  const parsed = z.object({ name: z.string().trim().min(2).max(48) }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Informe um nome para a Casa." });
  const house = social.createHouse(user, parsed.data.name); store.addHouseRoom({ houseId: house.id, houseName: house.name, roomId: house.primaryRoomId });
  return response.status(201).json({ house: social.details(house.id, user.id) });
});
app.get("/api/houses/:houseId", (request, response) => { const user = requireUser(request, response); if (!user) return; const house = social.details(request.params.houseId, user.id); return house ? response.json({ house }) : response.status(404).json({ message: "Casa não encontrada." }); });
app.patch("/api/houses/:houseId", (request, response) => {
  const user = requireHousePermission(request, response, "HOUSE_MANAGE"); if (!user) return;
  const parsed = z.object({ name: z.string().trim().min(2).max(48), avatar: z.string().url().max(500).optional().or(z.literal("")) }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Dados inválidos." });
  social.updateHouse(request.params.houseId, parsed.data.name, parsed.data.avatar || undefined); emitHouse(request.params.houseId); return response.json({ house: social.details(request.params.houseId, user.id) });
});
app.patch("/api/profile", (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  const parsed = z.object({ displayName: z.string().trim().min(2).max(32), avatar: z.string().url().max(500).optional().or(z.literal("")), status: z.string().trim().max(80).optional() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Perfil inválido." });
  social.updateProfile(user, { ...parsed.data, avatar: parsed.data.avatar || undefined }); for (const house of social.listForUser(user.id)) emitHouse(house.id); return response.json({ user });
});
app.get("/api/invites/:token", (request, response) => { const state = social.inspectInvite(request.params.token); const user = getUser(request); const invite = state.status === "VALID" ? social.getInvite(request.params.token) : undefined; return response.json({ ...state, isMember: Boolean(user && invite && social.isMember(invite.houseId, user.id)) }); });
app.post("/api/invites/:token/accept", (request, response) => { const user = requireUser(request, response); if (!user) return; const result = social.acceptInvite(request.params.token, user); if (!result.ok) return response.status(410).json(result); emitHouse(result.houseId); return response.json(result); });
app.post("/api/houses/:houseId/invites", (request, response) => {
  const user = requireHousePermission(request, response, "INVITE_CREATE"); if (!user) return;
  const parsed = z.object({ expiresInHours: z.union([z.literal(1), z.literal(24), z.literal(168)]), maxUses: z.number().int().min(1).max(100).default(1), role: houseRoleSchema.optional() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Configuração de convite inválida." });
  const invite = social.createInvite(request.params.houseId, user, parsed.data); if (!invite) return response.status(404).json({ message: "Casa não encontrada." }); emitHouse(request.params.houseId); return response.status(201).json({ invite });
});
app.delete("/api/houses/:houseId/invites/:inviteId", (request, response) => { const user = requireHousePermission(request, response, "INVITE_REVOKE"); if (!user) return; if (!social.revokeInvite(request.params.houseId, request.params.inviteId)) return response.status(404).json({ message: "Convite não encontrado." }); emitHouse(request.params.houseId); return response.status(204).end(); });
app.patch("/api/houses/:houseId/members/:userId", (request, response) => {
  const user = requireHousePermission(request, response, "MEMBER_MANAGE"); if (!user) return; const parsed = z.object({ role: houseRoleSchema }).safeParse(request.body); if (!parsed.success || !social.changeRole(request.params.houseId, user.id, request.params.userId, parsed.data.role)) return response.status(409).json({ message: "O papel do anfitrião não pode ser alterado." }); const house = social.getHouse(request.params.houseId); const connected = house && store.getRoom(house.primaryRoomId)?.members.get(request.params.userId); if (connected) connected.role = parsed.data.role; emitHouse(request.params.houseId); if (house) emitSnapshot(house.primaryRoomId); return response.status(204).end();
});
app.delete("/api/houses/:houseId/members/:userId", (request, response) => { const user = requireHousePermission(request, response, "MEMBER_MANAGE"); if (!user) return; if (!social.removeMember(request.params.houseId, request.params.userId)) return response.status(409).json({ message: "O anfitrião não pode ser removido." }); disconnectHouseMember(request.params.houseId, request.params.userId); emitHouse(request.params.houseId); return response.status(204).end(); });
app.post("/api/houses/:houseId/leave", (request, response) => { const user = requireUser(request, response); if (!user) return; if (!social.leave(request.params.houseId, user.id)) return response.status(409).json({ message: "O anfitrião precisa transferir a Casa antes de sair." }); disconnectHouseMember(request.params.houseId, user.id); emitHouse(request.params.houseId); return response.status(204).end(); });

app.get("/api/media-hub/:roomId", (request, response) => {
  const user = requireRoomMember(request, response, String(request.params.roomId)); if (!user) return;
  const query = z.object({ q: z.string().max(100).optional(), filter: z.string().max(32).optional(), cursor: z.coerce.number().int().min(0).optional(), limit: z.coerce.number().int().min(1).max(60).optional() }).safeParse(request.query);
  if (!query.success) return response.status(400).json({ message: "Filtros inválidos." });
  const hub = store.getMediaHub(request.params.roomId, user.id, { query: query.data.q, filter: query.data.filter, cursor: query.data.cursor, limit: query.data.limit });
  if (!hub) return response.status(404).json({ message: "Sala não encontrada." });
  return response.json(hub);
});

app.post("/api/media-hub/:roomId/favorite", (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "LIBRARY_MANAGE"); if (!user) return;
  const parsed = mediaItemSchema.safeParse(request.body.item);
  if (!parsed.success) return response.status(400).json({ message: "Mídia inválida." });
  const result = store.toggleFavorite(request.params.roomId, user, parsed.data); emitMediaHubUpdate(request.params.roomId, "favorite");
  return response.json(result);
});

app.post("/api/media-hub/:roomId/library", (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "LIBRARY_MANAGE"); if (!user) return;
  const parsed = mediaItemSchema.safeParse(request.body.item); if (!parsed.success) return response.status(400).json({ message: "Mídia inválida." });
  const item = store.saveLibrary(request.params.roomId, user, parsed.data); if (!item) return response.status(404).json({ message: "Party não encontrada." });
  emitMediaHubUpdate(request.params.roomId, "library"); return response.status(201).json({ item });
});

app.delete("/api/media-hub/:roomId/library", (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "LIBRARY_MANAGE"); if (!user) return;
  const parsed = mediaItemSchema.safeParse(request.body.item); if (!parsed.success) return response.status(400).json({ message: "Mídia inválida." });
  store.removeLibrary(request.params.roomId, parsed.data); emitMediaHubUpdate(request.params.roomId, "library"); return response.status(204).end();
});

app.post("/api/media-hub/:roomId/playlists", (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_CREATE"); if (!user) return;
  const parsed = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(240).optional() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Informe um nome válido." });
  const playlist = store.createPlaylist(request.params.roomId, user, parsed.data.name, parsed.data.description); if (!playlist) return response.status(404).json({ message: "Party não encontrada." });
  emitMediaHubUpdate(request.params.roomId, "playlist"); return response.status(201).json({ playlist });
});

app.get("/api/media-hub/:roomId/playlists/:playlistId", (request, response) => { const user = requireRoomMember(request, response, String(request.params.roomId)); if (!user) return; const playlist = store.getPlaylist(request.params.roomId, request.params.playlistId); return playlist ? response.json({ playlist }) : response.status(404).json({ message: "Playlist não encontrada." }); });

app.patch("/api/media-hub/:roomId/playlists/:playlistId", (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_EDIT"); if (!user) return;
  const parsed = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(240).optional() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Dados inválidos." });
  const playlist = store.updatePlaylist(request.params.roomId, request.params.playlistId, parsed.data); if (!playlist) return response.status(404).json({ message: "Playlist não encontrada." }); emitMediaHubUpdate(request.params.roomId, "playlist"); return response.json({ playlist });
});

app.delete("/api/media-hub/:roomId/playlists/:playlistId", (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_DELETE"); if (!user) return; if (!store.deletePlaylist(request.params.roomId, request.params.playlistId)) return response.status(404).json({ message: "Playlist não encontrada." }); emitMediaHubUpdate(request.params.roomId, "playlist"); return response.status(204).end(); });

app.post("/api/media-hub/:roomId/playlists/:playlistId/items", (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_EDIT"); if (!user) return; const parsed = mediaItemSchema.safeParse(request.body.item); if (!parsed.success) return response.status(400).json({ message: "Mídia inválida." }); const playlist = store.addPlaylistItem(request.params.roomId, request.params.playlistId, user, parsed.data); if (!playlist) return response.status(404).json({ message: "Playlist não encontrada." }); emitMediaHubUpdate(request.params.roomId, "playlist"); return response.status(201).json({ playlist }); });
app.delete("/api/media-hub/:roomId/playlists/:playlistId/items/:itemId", (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_EDIT"); if (!user) return; const playlist = store.removePlaylistItem(request.params.roomId, request.params.playlistId, request.params.itemId); if (!playlist) return response.status(404).json({ message: "Playlist não encontrada." }); emitMediaHubUpdate(request.params.roomId, "playlist"); return response.json({ playlist }); });
app.put("/api/media-hub/:roomId/playlists/:playlistId/order", (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_EDIT"); if (!user) return; const parsed = z.object({ itemIds: z.array(z.string()).max(500) }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Ordem inválida." }); const playlist = store.reorderPlaylist(request.params.roomId, request.params.playlistId, parsed.data.itemIds); if (!playlist) return response.status(409).json({ message: "A playlist mudou. Atualize e tente novamente." }); emitMediaHubUpdate(request.params.roomId, "playlist"); return response.json({ playlist }); });
app.post("/api/media-hub/:roomId/playlists/:playlistId/queue", (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "MEDIA_ADD"); if (!user) return; const parsed = z.object({ mode: z.enum(["append", "next", "replace"]).default("append"), playNow: z.boolean().default(false) }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Opção de fila inválida." }); if (parsed.data.playNow && !store.canControlMedia(request.params.roomId, user.id)) return response.status(403).json({ message: "Você não pode iniciar a reprodução." }); const result = store.enqueuePlaylist(request.params.roomId, request.params.playlistId, user, parsed.data.mode, parsed.data.playNow); if (!result) return response.status(404).json({ message: "Playlist vazia ou não encontrada." }); io.to(request.params.roomId).emit("queue:update", result.queue, result.revision); if (result.media) io.to(request.params.roomId).emit("media:sync", result.media); return response.json(result); });

app.post("/api/media-hub/:roomId/progress", (request, response) => {
  const user = requireRoomMember(request, response, String(request.params.roomId)); if (!user) return;
  const parsed = z.object({ item: queueItemSchema, position: z.number().min(0) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "Progresso inválido." });
  store.saveProgress(user.id, parsed.data.item, parsed.data.position);
  return response.status(204).end();
});

app.get("/api/google-drive/status", (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  return response.json(googleDrive.getStatus(user.id));
});

app.post("/api/google-drive/auth/start", (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  try { return response.json({ url: googleDrive.createAuthorizationUrl(user.id) }); }
  catch (error) { return response.status(503).json({ message: error instanceof Error ? error.message : "Google Drive indisponível." }); }
});

app.get("/api/google-drive/oauth/callback", async (request, response) => {
  const parsed = z.object({ state: z.string(), code: z.string() }).safeParse(request.query);
  if (!parsed.success) return response.status(400).send("Autorização inválida.");
  try {
    await googleDrive.completeAuthorization(parsed.data.state, parsed.data.code);
    return response.type("html").send("<!doctype html><meta charset=\"utf-8\"><title>Lumio</title><body style=\"background:#0a0f0c;color:#edf4ef;font:16px Inter,system-ui,sans-serif;padding:40px\">Google Drive conectado. Esta janela pode ser fechada.<script>window.opener?.postMessage({type:'lumio:drive-connected'},'*');window.close();</script></body>");
  } catch (error) { return response.status(400).send(error instanceof Error ? error.message : "Não foi possível conectar o Google Drive."); }
});

app.post("/api/google-drive/disconnect", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  await googleDrive.disconnect(user.id);
  return response.status(204).end();
});

app.get("/api/google-drive/files", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  try { return response.json({ files: await googleDrive.listFiles(user.id, typeof request.query.q === "string" ? request.query.q : "") }); }
  catch (error) { return response.status(error instanceof Error && error.message === "GOOGLE_RECONNECT" ? 401 : 502).json({ message: error instanceof Error && error.message === "GOOGLE_RECONNECT" ? "Precisamos reconectar seu Google Drive." : error instanceof Error ? error.message : "Drive indisponível." }); }
});

app.get("/api/google-drive/resolve", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  const input = typeof request.query.input === "string" ? request.query.input : "";
  try { return response.json({ item: await googleDrive.resolve(user.id, input) }); }
  catch (error) { return response.status(error instanceof Error && error.message === "GOOGLE_RECONNECT" ? 401 : 400).json({ message: error instanceof Error && error.message === "GOOGLE_RECONNECT" ? "Precisamos reconectar seu Google Drive." : error instanceof Error ? error.message : "Arquivo indisponível." }); }
});

app.post("/api/google-drive/files/:fileId/playback", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  try {
    const ticket = await googleDrive.createPlaybackTicket(user.id, request.params.fileId);
    return response.json({ url: `${request.protocol}://${request.get("host")}/api/google-drive/playback/${ticket}`, expiresIn: 300 });
  } catch { return response.status(401).json({ message: "Precisamos reconectar seu Google Drive." }); }
});

app.get("/api/google-drive/playback/:ticket", async (request, response) => {
  try {
    const upstream = await googleDrive.getPlaybackResponse(request.params.ticket, request.header("range"));
    response.status(upstream.status);
    for (const header of ["content-type", "content-length", "content-range", "accept-ranges", "etag"]) {
      const value = upstream.headers.get(header); if (value) response.setHeader(header, value);
    }
    if (!upstream.body) return response.end();
    return Readable.fromWeb(upstream.body as never).pipe(response);
  } catch { return response.status(401).json({ message: "A autorização de reprodução expirou." }); }
});

io.use((socket, next) => {
  const authToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
  const user = authToken ? sessions.get(authToken) : undefined;
  if (!user) return next(new Error("Sessão inválida."));
  socket.data.user = user;
  return next();
});

const emitSnapshot = (roomId: string) => {
  const snapshot = store.getSnapshot(roomId); const house = social.getByRoom(roomId);
  if (snapshot && house) {
    const viewers = io.sockets.adapter.rooms.get(roomId) ?? new Set<string>();
    for (const socketId of viewers) { const target = io.sockets.sockets.get(socketId); const viewer = target?.data.user as User | undefined; if (target && viewer) target.emit("room:snapshot", { ...snapshot, houseId: house.id, houseMembers: social.details(house.id, viewer.id)?.members ?? [], permissions: social.details(house.id, viewer.id)?.permissions ?? [] }); }
  } else if (snapshot) io.to(roomId).emit("room:snapshot", snapshot);
};
const emitHouse = (houseId: string) => { const house = social.getHouse(houseId); if (!house) return; for (const socket of io.sockets.sockets.values()) { const user = socket.data.user as User | undefined; const details = user && social.details(houseId, user.id); if (details) socket.emit("house:update", details); } };
const disconnectHouseMember = (houseId: string, userId: string) => { const house = social.getHouse(houseId); if (!house) return; for (const socket of io.sockets.sockets.values()) { if ((socket.data.user as User | undefined)?.id === userId) { socket.emit("member:removed", { houseId, message: "Você não faz mais parte desta Casa." }); socket.leave(house.primaryRoomId); } } store.removeMember(house.primaryRoomId, userId); emitSnapshot(house.primaryRoomId); };
const roomConnections = new Map<string, Map<string, Set<string>>>();
const offlineTimers = new Map<string, NodeJS.Timeout>();
const registerConnection = (roomId: string, userId: string, socketId: string) => { const room = roomConnections.get(roomId) ?? new Map<string, Set<string>>(); const set = room.get(userId) ?? new Set<string>(); set.add(socketId); room.set(userId, set); roomConnections.set(roomId, room); const key = `${roomId}:${userId}`; const timer = offlineTimers.get(key); if (timer) clearTimeout(timer); offlineTimers.delete(key); return set.size; };
const unregisterConnection = (roomId: string, userId: string, socketId: string) => { const room = roomConnections.get(roomId), set = room?.get(userId); set?.delete(socketId); if (!set?.size) room?.delete(userId); return set?.size ?? 0; };
const canControl = (roomId: string, userId: string) => store.canControlMedia(roomId, userId);
const canManageRoom = (roomId: string, userId: string) => {
  const house = social.getByRoom(roomId);
  return Boolean(house && can(social.role(house.id, userId), "HOUSE_MANAGE"));
};
const emitQueueState = (roomId: string, state: { queue: QueueItem[]; history: HouseHistoryEntry[]; revision: number }) => {
  io.to(roomId).emit("queue:update", state.queue, state.revision);
  io.to(roomId).emit("queue:history", state.history);
};

io.on("connection", (socket) => {
  const user = socket.data.user as User;
  let joinedRoomId: string | undefined;

  socket.on(eventNames.roomJoin, (rawInput) => {
    const parsed = joinRoomInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.user.id !== user.id) return socket.emit("server:error", "Não foi possível entrar na sala.");
    const { roomId } = parsed.data;
    const house = social.getByRoom(roomId);
    if (!house || !social.isMember(house.id, user.id)) return socket.emit("server:error", "Você não faz parte desta Casa.");
    registerConnection(roomId, user.id, socket.id);
    const snapshot = store.addMember(roomId, user, social.role(house.id, user.id));
    if (!snapshot) return socket.emit("server:error", "Sala não encontrada.");
    if (joinedRoomId && joinedRoomId !== roomId) {
      socket.leave(joinedRoomId);
      store.removeMember(joinedRoomId, user.id);
      emitSnapshot(joinedRoomId);
    }
    joinedRoomId = roomId;
    socket.join(roomId);
    social.setPresence(house.id, user.id, "ONLINE", { inParty: true });
    socket.to(roomId).emit("voice:peer-joined", user);
    emitSnapshot(roomId);
    emitHouse(house.id);
  });

  socket.on(eventNames.roomLeave, (roomId) => {
    if (joinedRoomId !== roomId) return;
    socket.leave(roomId);
    const remaining = unregisterConnection(roomId, user.id, socket.id); const house = social.getByRoom(roomId);
    if (!remaining) { store.removeMember(roomId, user.id); if (house) social.setPresence(house.id, user.id, "ONLINE", { inParty: false, inCall: false, speaking: false, screenSharing: false }); }
    joinedRoomId = undefined;
    socket.to(roomId).emit("voice:peer-left", user.id);
    io.to(roomId).emit("screen:state", store.getSnapshot(roomId)?.screenShare ?? null);
    emitSnapshot(roomId);
    if (house) emitHouse(house.id);
  });

  socket.on(eventNames.chatMessage, (rawInput) => {
    const parsed = chatInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const message = store.addMessage(parsed.data.roomId, user, parsed.data.body);
    if (message) io.to(parsed.data.roomId).emit("chat:message", message);
  });

  socket.on(eventNames.chatTyping, (input) => { if (input.roomId !== joinedRoomId) return; socket.to(input.roomId).emit("chat:typing", { roomId: input.roomId, userId: user.id, typing: input.typing }); });
  socket.on(eventNames.presenceActivity, (input) => { if (input.roomId !== joinedRoomId) return; const house = social.getByRoom(input.roomId); if (!house) return; social.setPresence(house.id, user.id, input.active ? "ONLINE" : "IDLE"); emitHouse(house.id); });

  socket.on(eventNames.queueAdd, async (rawInput, respond) => {
    const parsed = addQueueInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !store.canAddToQueue(parsed.data.roomId, user.id)) {
      respond?.({ ok: false, message: "Você não pode adicionar itens a esta fila." });
      return;
    }
    let item = { ...parsed.data.item, addedBy: user };
    if (item.provider === "youtube" && youtube.isConfigured()) {
      try {
        const verified = await youtube.getVideo(item.providerMediaId);
        item = { ...verified, addedBy: user, addedAt: parsed.data.item.addedAt };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Vídeo do YouTube indisponível.";
        respond?.({ ok: false, message });
        return socket.emit("server:error", message);
      }
    }
    const queue = store.addQueueItem(parsed.data.roomId, item);
    if (queue) {
      io.to(parsed.data.roomId).emit("queue:update", queue, store.getQueueRevision(parsed.data.roomId));
      respond?.({ ok: true, item, position: queue.findIndex((candidate) => candidate.id === item.id) + 1 });
    } else respond?.({ ok: false, message: "Não foi possível adicionar o item à fila." });
  });

  socket.on(eventNames.queueRemove, (rawInput) => {
    const parsed = z.object({ roomId: z.string(), itemId: z.string() }).safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return;
    const queue = store.removeQueueItem(parsed.data.roomId, parsed.data.itemId);
    if (queue) io.to(parsed.data.roomId).emit("queue:update", queue, store.getQueueRevision(parsed.data.roomId));
  });

  socket.on(eventNames.queueNext, (rawInput) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return;
    const next = store.nextQueueItem(parsed.data.roomId);
    if (next) {
      emitQueueState(parsed.data.roomId, next);
      io.to(parsed.data.roomId).emit("media:sync", next.media);
    }
  });

  socket.on(eventNames.queuePrevious, (rawInput) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return;
    const previous = store.previousQueueItem(parsed.data.roomId);
    if (previous) { emitQueueState(parsed.data.roomId, previous); io.to(parsed.data.roomId).emit("media:sync", previous.media); }
  });

  socket.on(eventNames.queueMove, (rawInput) => {
    const parsed = queueMoveSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return;
    const result = store.moveQueueItem(parsed.data.roomId, parsed.data.itemId, parsed.data.toIndex, parsed.data.revision);
    if (result) io.to(parsed.data.roomId).emit("queue:update", result.queue, result.revision);
  });

  socket.on(eventNames.queuePlayNext, (rawInput, respond) => {
    const parsed = queuePlayNextSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !store.canAddToQueue(parsed.data.roomId, user.id)) return respond?.({ ok: false, message: "Você não pode alterar esta fila." });
    const result = store.playNext(parsed.data.roomId, { ...parsed.data.item, addedBy: user }, parsed.data.revision);
    if (!result) return respond?.({ ok: false, message: "Party não encontrada." });
    io.to(parsed.data.roomId).emit("queue:update", result.queue, result.revision);
    respond?.({ ok: !result.conflict, queue: result.queue, revision: result.revision, message: result.conflict ? "A fila mudou; a ordem atual foi restaurada." : undefined });
  });

  socket.on(eventNames.queueClear, (rawInput, respond) => {
    const parsed = queueRevisionSchema.safeParse(rawInput); const house = parsed.success ? social.getByRoom(parsed.data.roomId) : undefined;
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !house || !can(social.role(house.id, user.id), "QUEUE_MANAGE")) return respond?.({ ok: false, message: "Você não pode limpar esta fila." });
    const result = store.clearQueue(parsed.data.roomId, parsed.data.revision); if (!result) return respond?.({ ok: false, message: "Party não encontrada." });
    io.to(parsed.data.roomId).emit("queue:update", result.queue, result.revision); respond?.({ ok: !result.conflict, queue: result.queue, revision: result.revision, message: result.conflict ? "A fila mudou; tente novamente." : undefined });
  });

  socket.on(eventNames.queueAdvance, (rawInput, respond) => {
    const parsed = queueAdvanceSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return respond?.({ ok: false, advanced: false, message: "Pedido inválido." });
    const result = store.advanceQueue(parsed.data.roomId, parsed.data.expectedMediaId, user.id);
    if (result.next) { emitQueueState(parsed.data.roomId, result.next); io.to(parsed.data.roomId).emit("media:sync", result.next.media); emitMediaHubUpdate(parsed.data.roomId, "history"); }
    else if (result.media) io.to(parsed.data.roomId).emit("media:sync", result.media);
    respond?.({ ok: true, advanced: result.advanced });
  });

  socket.on(eventNames.roomMode, (rawInput) => {
    const parsed = modeChangeSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canManageRoom(parsed.data.roomId, user.id)) return;
    const mode = store.setMode(parsed.data.roomId, parsed.data.mode);
    if (mode) io.to(parsed.data.roomId).emit("room:mode", mode);
  });

  socket.on(eventNames.roomSettings, (rawInput) => {
    const parsed = roomSettingsInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canManageRoom(parsed.data.roomId, user.id)) return;
    const settings = store.updateSettings(parsed.data.roomId, parsed.data.settings);
    if (settings) io.to(parsed.data.roomId).emit("room:settings", settings);
  });

  socket.on(eventNames.mediaRequestSync, (input) => {
    if (input.roomId !== joinedRoomId) return;
    const room = store.getRoom(input.roomId);
    if (room) socket.emit("media:sync", store.getEffectiveMedia(room.currentMedia));
  });

  const updateMedia = (action: "play" | "pause" | "seek" | "rate", rawInput: unknown) => {
    const parsed = mediaCommandSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return;
    const media = store.updateMedia(parsed.data.roomId, user.id, action, parsed.data.position, parsed.data);
    if (media) { io.to(parsed.data.roomId).emit("media:sync", media); if (action === "play") { const snapshot = store.getSnapshot(parsed.data.roomId); if (snapshot) io.to(parsed.data.roomId).emit("queue:history", snapshot.history); emitMediaHubUpdate(parsed.data.roomId, "history"); } }
  };
  socket.on(eventNames.mediaPlay, (input) => updateMedia("play", input));
  socket.on(eventNames.mediaPause, (input) => updateMedia("pause", input));
  socket.on(eventNames.mediaSeek, (input) => updateMedia("seek", input));
  socket.on(eventNames.mediaRate, (input) => updateMedia("rate", input));

  socket.on(eventNames.mediaChange, (rawInput) => {
    const parsed = changeMediaSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return;
    const room = store.getRoom(parsed.data.roomId);
    const item = room?.queue.find((candidate) => candidate.provider === parsed.data.item.provider && candidate.providerMediaId === parsed.data.item.providerMediaId);
    if (!item) return socket.emit("server:error", "Adicione a mídia à fila antes de reproduzir.");
    const changed = store.changeMedia(parsed.data.roomId, item);
    const media = changed ? store.updateMedia(parsed.data.roomId, user.id, "play", 0) : null;
    if (media) { io.to(parsed.data.roomId).emit("media:sync", media); const snapshot = store.getSnapshot(parsed.data.roomId); if (snapshot) io.to(parsed.data.roomId).emit("queue:history", snapshot.history); emitMediaHubUpdate(parsed.data.roomId, "history"); emitSnapshot(parsed.data.roomId); }
  });

  socket.on(eventNames.voteSkip, (rawInput) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const vote = store.voteSkip(parsed.data.roomId, user.id);
    if (!vote) return;
    io.to(parsed.data.roomId).emit("vote:skip", { count: vote.count, required: vote.required, votedBy: vote.votedBy, advanced: vote.advanced });
    if (vote.next) { emitQueueState(parsed.data.roomId, vote.next); io.to(parsed.data.roomId).emit("media:sync", vote.next.media); }
  });

  socket.on(eventNames.presenceUpdate, (rawInput) => {
    const parsed = presenceInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const snapshot = store.updatePresence(parsed.data.roomId, user.id, parsed.data);
    if (snapshot) io.to(parsed.data.roomId).emit("presence:update", snapshot.members);
  });

  socket.on(eventNames.reactionSend, (input) => {
    const parsed = z.object({ roomId: z.string(), emoji: z.string().min(1).max(4) }).safeParse(input);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const lastReactionAt = Number(socket.data.lastReactionAt ?? 0);
    if (Date.now() - lastReactionAt < 350) return;
    socket.data.lastReactionAt = Date.now();
    io.to(parsed.data.roomId).emit("reaction:send", { id: crypto.randomUUID(), emoji: parsed.data.emoji, user });
  });

  socket.on(eventNames.voiceSignal, (rawInput) => {
    const parsed = voiceSignalSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    for (const [id, peer] of io.sockets.sockets) {
      if (peer.data.user?.id === parsed.data.targetUserId) peer.emit("voice:signal", { fromUserId: user.id, signal: parsed.data.signal });
    }
  });

  socket.on(eventNames.voiceJoin, (input) => {
    if (input.roomId === joinedRoomId) { socket.to(input.roomId).emit("voice:peer-joined", user); const house = social.getByRoom(input.roomId); if (house) { social.setPresence(house.id, user.id, "ONLINE", { inCall: true }); emitHouse(house.id); } }
  });
  socket.on(eventNames.voiceLeave, (input) => {
    if (input.roomId === joinedRoomId) { socket.to(input.roomId).emit("voice:peer-left", user.id); const house = social.getByRoom(input.roomId); if (house) { social.setPresence(house.id, user.id, "ONLINE", { inCall: false, speaking: false }); emitHouse(house.id); } }
  });
  socket.on(eventNames.voiceSpeaking, (rawInput) => {
    const parsed = presenceInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const snapshot = store.updatePresence(parsed.data.roomId, user.id, parsed.data);
    if (snapshot) io.to(parsed.data.roomId).emit("presence:update", snapshot.members);
    const house = social.getByRoom(parsed.data.roomId); if (house) { social.setPresence(house.id, user.id, "ONLINE", { inCall: true, speaking: parsed.data.speaking }); emitHouse(house.id); }
  });

  socket.on(eventNames.screenStart, (input, respond) => {
    if (input.roomId !== joinedRoomId) return respond({ ok: false, message: "Party inválida." });
    const result = store.startScreenShare(input.roomId, user);
    respond({ ok: result.ok, message: result.ok ? undefined : result.message });
    if (result.ok) io.to(input.roomId).emit("screen:state", result.state);
    const house = social.getByRoom(input.roomId); if (result.ok && house) { social.setPresence(house.id, user.id, "ONLINE", { screenSharing: true }); emitHouse(house.id); }
  });

  socket.on(eventNames.screenStop, (input) => {
    if (input.roomId !== joinedRoomId || !store.stopScreenShare(input.roomId, user.id)) return;
    io.to(input.roomId).emit("screen:state", null);
    const house = social.getByRoom(input.roomId); if (house) { social.setPresence(house.id, user.id, "ONLINE", { screenSharing: false }); emitHouse(house.id); }
  });

  socket.on("disconnect", () => {
    if (!joinedRoomId) return;
    const roomId = joinedRoomId; const remaining = unregisterConnection(roomId, user.id, socket.id); if (remaining) return;
    const wasSharing = store.getRoom(roomId)?.screenShare?.user.id === user.id; const house = social.getByRoom(roomId);
    const key = `${roomId}:${user.id}`; offlineTimers.set(key, setTimeout(() => { if ((roomConnections.get(roomId)?.get(user.id)?.size ?? 0) > 0) return; store.removeMember(roomId, user.id); if (house) { social.setPresence(house.id, user.id, "OFFLINE", { inParty: false, inCall: false, speaking: false, screenSharing: false }); emitHouse(house.id); } io.to(roomId).emit("voice:peer-left", user.id); if (wasSharing) io.to(roomId).emit("screen:state", null); emitSnapshot(roomId); offlineTimers.delete(key); }, 5_000));
  });
});

httpServer.listen(PORT, () => {
  console.log(`[lumio] realtime server listening on http://localhost:${PORT}`);
});
