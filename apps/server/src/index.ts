import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { Server, type Socket } from "socket.io";
import { PrismaClient } from "@prisma/client";
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
import { DriveError, GoogleDriveService } from "./googleDrive.js";
import { AuthError, AuthStore } from "./authStore.js";
import { EmailService } from "./emailService.js";
import { GoogleIdentityService } from "./googleIdentity.js";
import { YouTubeDataError, YouTubeDataService } from "./youtubeData.js";
import { CallRegistry } from "./callRegistry.js";
import { publicUser } from "./privacy.js";
import { PrismaAuthRepository } from "./prismaAuthRepository.js";
import { PrismaSocialRepository } from "./prismaSocialRepository.js";
import { PrismaDriveVault } from "./prismaDriveVault.js";
import { PrismaMediaRepository } from "./prismaMediaRepository.js";
import { validateProductionEnvironment } from "./productionConfig.js";

// npm workspaces execute this package with apps/server as the working directory.
// Resolve the project-level environment file from this module so dev and dist agree.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
validateProductionEnvironment();

const PORT = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) throw new Error("PORT deve ser um número entre 0 e 65535.");
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
let shuttingDown = false;
const log = (level: "info" | "warn" | "error", event: string, fields: Record<string, string | number | boolean> = {}) => {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line); else console.log(line);
};

const app = express();
// Render terminates TLS at its ingress. Trust exactly that hop so secure cookies
// and request IPs are derived from its forwarded headers, not arbitrary chains.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
const httpServer = http.createServer(app);
const allowedOrigins = CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
if (process.env.NODE_ENV === "production") {
  if (!process.env.CLIENT_ORIGIN || !allowedOrigins.every((origin) => { try { const url = new URL(origin); return url.protocol === "https:" && url.origin === origin; } catch { return false; } })) throw new Error("Configure CLIENT_ORIGIN com origens HTTPS explícitas em produção.");
  if (!allowedOrigins.includes(new URL(process.env.APP_PUBLIC_URL ?? "").origin)) throw new Error("APP_PUBLIC_URL deve corresponder a CLIENT_ORIGIN em produção.");
}
const corsOrigin = (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
  const localDevelopmentOrigin = process.env.NODE_ENV !== "production" && Boolean(origin?.match(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/));
  callback(null, !origin || allowedOrigins.includes(origin) || localDevelopmentOrigin);
};
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOrigin, credentials: true },
  maxHttpBufferSize: 64 * 1024,
  allowRequest: (request, callback) => corsOrigin(request.headers.origin, (_error, allowed) => callback(null, Boolean(allowed))),
});
const store = new RoomStore();
const social = new SocialStore();
const deletingHouses = new Set<string>();
const deletingRooms = new Set<string>();
const postgresMode = process.env.PERSISTENCE_MODE === "postgres";
const db = postgresMode ? new PrismaClient() : null;
const googleDrive = new GoogleDriveService(fetch, undefined, db ? new PrismaDriveVault(db) : undefined);
const auth = new AuthStore(postgresMode ? null : undefined);
const authRepository = db ? new PrismaAuthRepository(db, auth) : null;
const saveAuth = (userId: string) => authRepository?.saveUser(userId) ?? Promise.resolve();
const socialRepository = db ? new PrismaSocialRepository(db, social, (id) => auth.getUser(id)) : null;
const saveHouse = (houseId: string) => deletingHouses.has(houseId) ? Promise.reject(new Error("Casa em exclusão.")) : socialRepository?.saveHouse(houseId) ?? Promise.resolve();
const mediaRepository = db ? new PrismaMediaRepository(db, store, (id) => auth.getUser(id)) : null;
const saveMedia = (roomId: string) => deletingRooms.has(roomId) ? Promise.reject(new Error("Party em exclusão.")) : mediaRepository?.saveHouse(roomId) ?? Promise.resolve();
const persistMediaForResponse = async (roomId: string, response: express.Response) => {
  try { await saveMedia(roomId); return true; }
  catch { response.status(503).json({ message: "Mídia indisponível no momento." }); return false; }
};
const emailService = new EmailService();
const googleIdentity = new GoogleIdentityService();
const youtube = new YouTubeDataService();

app.use(cors({ origin: corsOrigin, credentials: true }));
app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(self), display-capture=(self)");
  response.setHeader("Cache-Control", "no-store");
  next();
});
app.use((request, response, next) => {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  response.setHeader("X-Request-ID", requestId);
  response.on("finish", () => {
    if (request.path === "/api/health" || request.path === "/api/ready") return;
    const durationMs = Math.round(performance.now() - started);
    const route = typeof request.route?.path === "string" ? request.route.path : "unmatched";
    log(response.statusCode >= 500 ? "error" : durationMs >= 1000 ? "warn" : "info", "http_request", { requestId, method: request.method, route, status: response.statusCode, durationMs });
  });
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use((request, response, next) => {
  if (postgresMode && request.path !== "/api/health" && request.path !== "/api/ready" && (!authRepository?.isHealthy() || !socialRepository?.isHealthy() || !mediaRepository?.isHealthy())) return response.status(503).json({ message: "Persistência temporariamente indisponível." });
  next();
});

const authAttempts = new Map<string, { count: number; resetAt: number }>();
const googleChallenges = new Map<string, { mode: "login" | "link"; userId?: string; expiresAt: number }>();
const authRateLimit = (request: express.Request, response: express.Response) => {
  const now = Date.now();
  if (authAttempts.size > 10_000) for (const [key, entry] of authAttempts) if (entry.resetAt <= now) authAttempts.delete(key);
  if (authAttempts.size > 20_000) { response.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }); return false; }
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const route = request.route?.path ?? request.path;
  const keys = [`${route}:ip:${request.ip ?? "local"}`];
  if (email) keys.push(`${route}:email:${crypto.createHash("sha256").update(email).digest("hex")}`);
  let limited = false;
  for (const key of keys) {
    const entry = authAttempts.get(key);
    const next = entry && entry.resetAt > now ? { count: entry.count + 1, resetAt: entry.resetAt } : { count: 1, resetAt: now + 15 * 60_000 };
    authAttempts.set(key, next);
    if (next.count > (key.includes(":email:") ? 8 : 30)) limited = true;
  }
  if (limited) response.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  return !limited;
};
const apiAttempts = new Map<string, { count: number; resetAt: number }>();
const apiRateLimit = (request: express.Request, response: express.Response, userId: string, ceiling: number) => {
  const now = Date.now(), key = `${request.route?.path ?? request.path}:${userId}`;
  if (apiAttempts.size > 10_000) for (const [id, entry] of apiAttempts) if (entry.resetAt <= now) apiAttempts.delete(id);
  if (apiAttempts.size > 20_000) { response.status(429).json({ message: "Muitas solicitações. Aguarde um minuto." }); return false; }
  const prior = apiAttempts.get(key);
  const next = prior && prior.resetAt > now ? { count: prior.count + 1, resetAt: prior.resetAt } : { count: 1, resetAt: now + 60_000 };
  apiAttempts.set(key, next);
  if (next.count <= ceiling) return true;
  response.status(429).json({ message: "Muitas solicitações. Aguarde um minuto." });
  return false;
};
const createSession = async (user: User) => { const token = auth.createSession(user.id); await saveAuth(user.id); return token; };
const getAuthToken = (request: express.Request) => {
  const header = request.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
};
const getUser = (request: express.Request) => {
  const token = getAuthToken(request);
  return token ? auth.resolveSession(token)?.user : undefined;
};
const driveStatus = (error: unknown) => error instanceof DriveError ? ({ RECONNECT: 401, UNAVAILABLE: 502, FORBIDDEN: 403, NOT_FOUND: 404, RATE_LIMIT: 429, BAD_REQUEST: 400 }[error.code]) : 502;
const driveMessage = (error: unknown) => error instanceof DriveError ? error.message : "Google Drive indisponível.";
const driveMediaListed = (roomId: string, fileId: string) => {
  const room = store.getRoom(roomId);
  return Boolean(room && (room.currentMedia.provider === "google-drive" && room.currentMedia.mediaId === fileId || room.queue.some((item) => item.provider === "google-drive" && item.providerMediaId === fileId)));
};
const mediaAvailableInRoom = (roomId: string, item: QueueItem) => {
  if (item.available === false) return false;
  if (item.provider === "demo") return false;
  if (item.provider === "youtube") return /^[A-Za-z0-9_-]{11}$/.test(item.providerMediaId);
  if (item.provider !== "google-drive") return true;
  const grant = googleDrive.getGrant(roomId, item.providerMediaId);
  const house = social.getByRoom(roomId);
  return Boolean(grant && house && social.isMember(house.id, grant.ownerId));
};
const requireUser = (request: express.Request, response: express.Response) => {
  const user = getUser(request);
  if (!user) response.status(401).json({ message: "Sessão ausente ou expirada." });
  else if (!auth.isVerified(user.id)) { response.status(403).json({ code: "EMAIL_UNVERIFIED", message: "Confirme seu e-mail antes de usar o Lumio." }); return undefined; }
  return user;
};
const requireHousePermission = (request: express.Request, response: express.Response, permission: Permission) => {
  const user = requireUser(request, response); if (!user) return null;
  if (deletingHouses.has(String(request.params.houseId))) { response.status(409).json({ message: "Casa em exclusão." }); return null; }
  if (!can(social.role(String(request.params.houseId), user.id), permission)) { response.status(403).json({ message: "Você não tem permissão para esta ação." }); return null; }
  return user;
};
const requireRoomMember = (request: express.Request, response: express.Response, roomId: string) => {
  const user = requireUser(request, response); if (!user) return null; const house = social.getByRoom(roomId);
  if (deletingRooms.has(roomId)) { response.status(409).json({ message: "Casa em exclusão." }); return null; }
  if (!house || !social.isMember(house.id, user.id)) { response.status(403).json({ message: "Você não faz parte desta Casa." }); return null; }
  return user;
};
const requireRoomPermission = (request: express.Request, response: express.Response, roomId: string, permission: Permission) => {
  const user = requireRoomMember(request, response, roomId); if (!user) return null; const house = social.getByRoom(roomId);
  if (!house || !can(social.role(house.id, user.id), permission)) { response.status(403).json({ message: "Você não tem permissão para esta ação." }); return null; }
  return user;
};
const emitMediaHubUpdate = (roomId: string, kind: "library" | "favorite" | "playlist" | "history") => { const house = social.getByRoom(roomId); if (house) io.to(roomId).emit("media-hub:update", { houseId: house.id, kind }); };
const safeImageUrl = z.string().url().max(500).refine((value) => { try { return new URL(value).protocol === "https:"; } catch { return false; } });

app.get("/api/health", (_request, response) => response.json({ ok: true, service: "lumio-server" }));
app.get("/api/ready", async (_request, response) => {
  if (shuttingDown || postgresMode && (!authRepository?.isHealthy() || !socialRepository?.isHealthy() || !mediaRepository?.isHealthy())) return response.status(503).json({ ready: false });
  try { if (db) await db.$queryRaw`SELECT 1`; return response.json({ ready: true }); }
  catch { return response.status(503).json({ ready: false }); }
});
app.get("/api/rtc/config", (request, response) => {
  if (!requireRoomMember(request, response, String(request.query.roomId ?? ""))) return;
  const stun = (process.env.RTC_STUN_URLS ?? "stun:stun.l.google.com:19302").split(",").map((url) => url.trim()).filter(Boolean);
  const turn = (process.env.RTC_TURN_URLS ?? "").split(",").map((url) => url.trim()).filter(Boolean);
  const iceServers: { urls: string[]; username?: string; credential?: string }[] = [];
  if (stun.length) iceServers.push({ urls: stun });
  if (turn.length && process.env.RTC_TURN_USERNAME && process.env.RTC_TURN_CREDENTIAL) iceServers.push({ urls: turn, username: process.env.RTC_TURN_USERNAME, credential: process.env.RTC_TURN_CREDENTIAL });
  response.setHeader("Cache-Control", "no-store");
  response.json({ iceServers, turnConfigured: iceServers.some((server) => Boolean(server.credential)) });
});
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

app.post("/api/auth/signup", async (request, response) => {
  if (!authRateLimit(request, response)) return;
  if (process.env.AUTH_SIGNUP_MODE === "google-only") return response.status(403).json({ code: "EMAIL_SIGNUP_DISABLED", message: "Nesta prévia, entre com sua Conta Google autorizada." });
  const body = z.object({ displayName: z.string().trim().min(2).max(32), email: z.string().trim().email().max(160), password: z.string().min(8).max(100) }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ message: "Confira nome, e-mail e senha." });
  try {
    const user = auth.createLocal(body.data.displayName, body.data.email, body.data.password);
    const token = auth.issueToken(user.id, "EMAIL_VERIFICATION", 24 * 60 * 60_000, 60_000)!;
    await saveAuth(user.id);
    try { await emailService.send(user.email!, "verify", token); }
    catch { return response.status(503).json({ message: "Conta criada, mas não foi possível enviar a confirmação. Solicite um novo e-mail em alguns minutos." }); }
    return response.status(201).json({ pendingVerification: true, message: "Enviamos um link de confirmação para seu e-mail." });
  }
  catch (error) { if (error instanceof AuthError && error.code === "EMAIL_EXISTS") return response.status(409).json({ message: "Não foi possível criar esta conta. Confira o e-mail ou entre com sua conta existente." }); return response.status(503).json({ message: "Cadastro indisponível no momento. Tente novamente." }); }
});

app.post("/api/auth/login", async (request, response) => {
  if (!authRateLimit(request, response)) return;
  const body = z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(100) }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ message: "Informe e-mail e senha." });
  const user = auth.login(body.data.email, body.data.password);
  if (!user) return response.status(401).json({ message: "E-mail ou senha incorretos." });
  if (!auth.isVerified(user.id)) return response.status(403).json({ code: "EMAIL_UNVERIFIED", message: "Confirme seu e-mail antes de entrar. Você pode solicitar um novo link." });
  try { return response.json({ user, token: await createSession(user) }); }
  catch { return response.status(503).json({ message: "Login indisponível no momento." }); }
});

const emailInput = z.object({ email: z.string().trim().email().max(160) });
const tokenInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const genericEmailMessage = "Se houver uma conta elegível, enviaremos uma mensagem para este e-mail.";
app.post("/api/auth/verification/resend", async (request, response) => {
  if (!authRateLimit(request, response)) return;
  const parsed = emailInput.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "Informe um e-mail válido." });
  const user = auth.getByEmail(parsed.data.email);
  if (user && auth.hasPassword(user.id) && !auth.isVerified(user.id)) {
    const token = auth.issueToken(user.id, "EMAIL_VERIFICATION", 24 * 60 * 60_000, 60_000);
    if (token) try { await saveAuth(user.id); await emailService.send(user.email!, "verify", token); } catch { /* Generic response; delivery failure is not proof of account existence. */ }
  }
  return response.json({ message: genericEmailMessage });
});
app.post("/api/auth/verification/confirm", async (request, response) => {
  if (!authRateLimit(request, response)) return;
  const parsed = tokenInput.safeParse(request.body);
  const ownerId = parsed.success ? auth.tokenOwner(parsed.data.token) : undefined;
  if (!parsed.success || !auth.consumeVerification(parsed.data.token)) return response.status(400).json({ message: "Link inválido, expirado ou já utilizado." });
  try { if (ownerId) await saveAuth(ownerId); return response.status(204).end(); }
  catch { return response.status(503).json({ message: "Confirmação indisponível no momento." }); }
});
app.post("/api/auth/password/forgot", async (request, response) => {
  if (!authRateLimit(request, response)) return;
  const parsed = emailInput.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "Informe um e-mail válido." });
  const user = auth.getByEmail(parsed.data.email);
  if (user && auth.hasPassword(user.id)) {
    const token = auth.issueToken(user.id, "PASSWORD_RESET", 30 * 60_000, 60_000);
    if (token) try { await saveAuth(user.id); await emailService.send(user.email!, "reset", token); } catch { /* Preserve anti-enumeration response. */ }
  }
  return response.json({ message: genericEmailMessage });
});
app.post("/api/auth/password/reset", async (request, response) => {
  if (!authRateLimit(request, response)) return;
  const parsed = tokenInput.extend({ password: z.string().min(8).max(100) }).safeParse(request.body);
  const userId = parsed.success ? auth.consumePasswordReset(parsed.data.token, parsed.data.password) : null;
  if (!userId) return response.status(400).json({ message: "Link inválido, expirado ou já utilizado." });
  try { await saveAuth(userId); } catch { return response.status(503).json({ message: "Redefinição indisponível no momento." }); }
  googleDrive.revokeViewer(userId);
  for (const house of social.listForUser(userId)) abortHouseDriveStreams(house.primaryRoomId, userId);
  for (const peer of io.sockets.sockets.values()) if (!auth.resolveSession(peer.handshake.auth?.token ?? "")) peer.disconnect(true);
  return response.status(204).end();
});

const accountAuthError = (response: express.Response, error: unknown) => {
  if (error instanceof AuthError) {
    if (error.code === "EMAIL_EXISTS") return response.status(409).json({ code: error.code, message: "Já existe uma conta Lumio com este e-mail. Entre com sua senha e vincule o Google em Conta." });
    if (error.code === "GOOGLE_IN_USE") return response.status(409).json({ code: error.code, message: "Esta conta Google já está vinculada a outra conta Lumio." });
    if (error.code === "LAST_METHOD") return response.status(409).json({ code: error.code, message: "Defina uma senha antes de remover seu último método de login." });
    return response.status(400).json({ code: error.code, message: "Não foi possível alterar as formas de login." });
  }
  return response.status(400).json({ message: "Não foi possível confirmar sua identidade. Tente novamente." });
};
const recentSession = (request: express.Request) => {
  const token = getAuthToken(request), session = token ? auth.resolveSession(token) : undefined;
  return Boolean(session && Date.now() - session.authenticatedAt < 10 * 60_000);
};
const authOrigin = (request: express.Request) => allowedOrigins.includes(request.header("origin") ?? "");
const browserCookiePolicy = (request: express.Request) => process.env.NODE_ENV === "production"
  ? "; SameSite=None; Secure"
  : `; SameSite=Strict${request.secure ? "; Secure" : ""}`;

app.get("/api/auth/google/config", (_request, response) => response.json({ configured: googleIdentity.isConfigured(), clientId: googleIdentity.publicClientId() }));
app.post("/api/auth/google/challenge", (request, response) => {
  if (!authRateLimit(request, response)) return;
  if (!authOrigin(request)) return response.status(403).json({ message: "Origem não autorizada." });
  if (!googleIdentity.isConfigured()) return response.status(503).json({ message: "Google Login não configurado." });
  const body = z.object({ mode: z.enum(["login", "link"]), password: z.string().optional() }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ message: "Solicitação inválida." });
  const user = body.data.mode === "link" ? requireUser(request, response) : undefined;
  if (body.data.mode === "link" && !user) return;
  if (body.data.mode === "link" && !recentSession(request)) return response.status(403).json({ message: "Entre novamente antes de vincular uma conta." });
  if (body.data.mode === "link" && (!user?.email || !body.data.password || auth.login(user.email, body.data.password)?.id !== user.id)) return response.status(403).json({ message: "Confirme sua senha Lumio antes de vincular Google." });
  const nonce = crypto.randomBytes(32).toString("base64url");
  if (googleChallenges.size > 5_000) for (const [key, challenge] of googleChallenges) if (challenge.expiresAt <= Date.now()) googleChallenges.delete(key);
  if (googleChallenges.size > 10_000) return response.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos." });
  googleChallenges.set(nonce, { mode: body.data.mode, userId: user?.id, expiresAt: Date.now() + 10 * 60_000 });
  response.setHeader("Set-Cookie", `lumio_google_nonce=${nonce}; HttpOnly; Path=/api/auth/google; Max-Age=600${browserCookiePolicy(request)}`);
  response.setHeader("Cache-Control", "no-store");
  return response.json({ clientId: googleIdentity.publicClientId(), nonce });
});
app.post("/api/auth/google/verify", async (request, response) => {
  if (!authRateLimit(request, response)) return;
  if (!authOrigin(request)) return response.status(403).json({ message: "Origem não autorizada." });
  const body = z.object({ credential: z.string().min(100).max(16_000), nonce: z.string().min(20).max(100) }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ message: "Resposta Google inválida." });
  const cookie = request.header("cookie")?.match(/(?:^|;\s*)lumio_google_nonce=([^;]+)/)?.[1];
  const pending = googleChallenges.get(body.data.nonce); googleChallenges.delete(body.data.nonce);
  if (!cookie || cookie !== body.data.nonce || !pending || pending.expiresAt < Date.now()) return response.status(403).json({ message: "Tentativa de login expirada. Tente novamente." });
  response.setHeader("Set-Cookie", `lumio_google_nonce=; HttpOnly; Path=/api/auth/google; Max-Age=0${browserCookiePolicy(request)}`);
  try {
    const identity = await googleIdentity.verify(body.data.credential, body.data.nonce);
    if (pending.mode === "link") {
      const user = requireUser(request, response);
      if (!user) return;
      if (user.id !== pending.userId || !recentSession(request)) return response.status(403).json({ message: "Entre novamente antes de vincular uma conta." });
      auth.linkGoogle(user.id, identity);
      await saveAuth(user.id);
      return response.json({ linked: true });
    }
    const { user } = auth.loginGoogle(identity);
    return response.json({ user, token: await createSession(user) });
  } catch (error) { return accountAuthError(response, error); }
});

app.get("/api/account", (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  const google = auth.getIdentity(user.id);
  return response.json({ email: user.email, hasPassword: auth.hasPassword(user.id), google: google ? { connected: true, email: google.email } : { connected: false }, drive: googleDrive.getStatus(user.id) });
});
app.post("/api/account/password", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  if (!authRateLimit(request, response)) return;
  const body = z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(8).max(100) }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ message: "A nova senha precisa ter pelo menos 8 caracteres." });
  if (!auth.hasPassword(user.id) && !recentSession(request)) return response.status(403).json({ message: "Entre novamente antes de definir uma senha." });
  try {
    auth.setPassword(user.id, body.data.newPassword, body.data.currentPassword);
    const currentToken = getAuthToken(request)!; auth.revokeOtherSessions(user.id, currentToken);
    await saveAuth(user.id);
    googleDrive.revokeViewer(user.id);
    for (const peer of io.sockets.sockets.values()) { const peerToken = peer.handshake.auth?.token; if (peerToken && peerToken !== currentToken && !auth.resolveSession(peerToken)) peer.disconnect(true); }
    return response.status(204).end();
  }
  catch (error) { return accountAuthError(response, error); }
});
app.post("/api/account/google/unlink", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  if (!authRateLimit(request, response)) return;
  const body = z.object({ password: z.string().min(1) }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ message: "Confirme sua senha para desvincular." });
  try { auth.unlinkGoogle(user.id, body.data.password); await saveAuth(user.id); return response.status(204).end(); }
  catch (error) { return accountAuthError(response, error); }
});

app.get("/api/auth/session", (request, response) => {
  const user = getUser(request);
  if (!user) return response.status(401).json({ message: "Sessão ausente." });
  return response.json({ user });
});
app.get("/api/bootstrap", (request, response) => { const user = requireUser(request, response); if (!user) return; const houses = social.listForUser(user.id).map((house) => { const media = store.getSnapshot(house.primaryRoomId)?.currentMedia; return { ...house, nowPlaying: media?.mediaId ? { title: media.title, provider: media.provider } : null }; }); return response.json({ user, houses }); });

app.post("/api/auth/logout", async (request, response) => {
  const token = getAuthToken(request);
  const user = token ? auth.resolveSession(token)?.user : undefined;
  if (user) googleDrive.revokeViewer(user.id);
  if (token) { auth.revokeSession(token); if (user) try { await saveAuth(user.id); } catch { return response.status(503).json({ message: "Saída indisponível no momento." }); } for (const peer of io.sockets.sockets.values()) if (peer.handshake.auth?.token === token) peer.disconnect(true); }
  return response.status(204).end();
});

app.get("/api/houses", (request, response) => { const user = requireUser(request, response); if (!user) return; const houses = social.listForUser(user.id).map((house) => { const media = store.getSnapshot(house.primaryRoomId)?.currentMedia; return { ...house, nowPlaying: media?.mediaId ? { title: media.title, provider: media.provider } : null }; }); return response.json({ houses }); });
app.post("/api/houses", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  const parsed = z.object({ name: z.string().trim().min(2).max(48) }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Informe um nome para a Casa." });
  const house = social.createHouse(user, parsed.data.name); try { await saveHouse(house.id); } catch { return response.status(503).json({ message: "Casa indisponível no momento." }); } store.addHouseRoom({ houseId: house.id, houseName: house.name, roomId: house.primaryRoomId }); emitHouse(house.id);
  return response.status(201).json({ house: social.details(house.id, user.id) });
});
app.get("/api/houses/:houseId", (request, response) => { const user = requireUser(request, response); if (!user) return; if (deletingHouses.has(request.params.houseId)) return response.status(404).json({ message: "Casa não encontrada." }); const house = social.details(request.params.houseId, user.id); return house ? response.json({ house }) : response.status(404).json({ message: "Casa não encontrada." }); });
app.patch("/api/houses/:houseId", async (request, response) => {
  const user = requireHousePermission(request, response, "HOUSE_MANAGE"); if (!user) return;
  const parsed = z.object({ name: z.string().trim().min(2).max(48), avatar: safeImageUrl.optional().or(z.literal("")) }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Dados inválidos." });
  social.updateHouse(request.params.houseId, parsed.data.name, parsed.data.avatar || undefined); try { await saveHouse(request.params.houseId); } catch { return response.status(503).json({ message: "Casa indisponível no momento." }); } emitHouse(request.params.houseId); return response.json({ house: social.details(request.params.houseId, user.id) });
});
app.delete("/api/houses/:houseId", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  const houseId = String(request.params.houseId);
  const house = social.getHouse(houseId);
  if (!house || !social.isMember(houseId, user.id)) return response.status(404).json({ message: "Casa não encontrada." });
  if (social.role(houseId, user.id) !== "HOST") return response.status(403).json({ message: "Somente o host pode excluir esta Casa." });
  if (deletingHouses.has(houseId)) return response.status(409).json({ message: "A exclusão já está em andamento." });
  const roomId = house.primaryRoomId;
  const memberIds = [...house.members.keys()];
  deletingHouses.add(houseId); deletingRooms.add(roomId);
  try {
    await Promise.all([socialRepository?.drain(), mediaRepository?.drain()]);
    const result = await socialRepository?.deleteHouse(houseId, user.id);
    if (result === "NOT_FOUND") return response.status(404).json({ message: "Casa não encontrada." });
    if (result === "FORBIDDEN") return response.status(403).json({ message: "Somente o host pode excluir esta Casa." });
    social.deleteHouse(houseId);
    store.deleteHouse(houseId);
    googleDrive.revokeRoom(roomId);
    for (const entry of activeDriveStreams.get(roomId) ?? []) entry.controller.abort();
    activeDriveStreams.delete(roomId);
    callSockets.clearRoom(roomId); screenOwnerSockets.delete(roomId); roomConnections.delete(roomId);
    for (const [key, timer] of offlineTimers) if (key.startsWith(`${roomId}:`)) { clearTimeout(timer); offlineTimers.delete(key); }
    for (const socket of io.sockets.sockets.values()) {
      const socketUser = socket.data.user as User | undefined;
      if (socket.data.joinedRoomId === roomId) {
        socket.data.revoked = true; socket.data.deletedHouseRoomId = roomId;
        socket.emit("house:deleted", { houseId });
        socket.leave(roomId);
        setTimeout(() => socket.disconnect(true), 75);
      }
      if (socketUser && memberIds.includes(socketUser.id)) emitHomeToSocket(socket, socketUser.id);
    }
    log("info", "house_deleted", { houseId, roomId, actorId: user.id });
    return response.status(204).end();
  } catch {
    return response.status(503).json({ message: "Não foi possível excluir a Casa agora. Tente novamente." });
  } finally {
    deletingHouses.delete(houseId); deletingRooms.delete(roomId);
  }
});
app.patch("/api/profile", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  const parsed = z.object({ displayName: z.string().trim().min(2).max(32), avatar: safeImageUrl.optional().or(z.literal("")), status: z.string().trim().max(80).optional() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Perfil inválido." });
  social.updateProfile(user, { ...parsed.data, avatar: parsed.data.avatar || undefined }); auth.saveProfile(user.id); try { await saveAuth(user.id); } catch { return response.status(503).json({ message: "Perfil indisponível no momento." }); } for (const house of social.listForUser(user.id)) { emitHouse(house.id); emitSnapshot(house.primaryRoomId); } for (const peer of io.sockets.sockets.values()) if ((peer.data.user as User | undefined)?.id === user.id) peer.emit("profile:update", user); return response.json({ user });
});
app.get("/api/invites/:token", (request, response) => { if (!authRateLimit(request, response)) return; const invite = social.getInvite(request.params.token); if (invite && deletingHouses.has(invite.houseId)) return response.json({ status: "INVALID", isMember: false }); const state = social.inspectInvite(request.params.token); const user = getUser(request); const isMember = Boolean(user && invite && social.isMember(invite.houseId, user.id)); return response.json({ ...state, houseId: isMember ? invite?.houseId : state.status === "VALID" ? state.houseId : undefined, isMember }); });
app.post("/api/invites/:token/accept", async (request, response) => { if (!authRateLimit(request, response)) return; const user = requireUser(request, response); if (!user) return; const invite = social.getInvite(request.params.token); if (invite && deletingHouses.has(invite.houseId)) return response.status(410).json({ status: "INVALID" }); const result = social.acceptInvite(request.params.token, user); if (!result.ok) return response.status(410).json(result); try { await saveHouse(result.houseId); } catch { return response.status(503).json({ message: "Convite indisponível no momento." }); } emitHouse(result.houseId); return response.json(result); });
app.post("/api/houses/:houseId/invites", async (request, response) => {
  const user = requireHousePermission(request, response, "INVITE_CREATE"); if (!user) return;
  const parsed = z.object({ expiresInHours: z.union([z.literal(1), z.literal(24), z.literal(168)]), maxUses: z.number().int().min(1).max(100).default(1), role: houseRoleSchema.optional() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Configuração de convite inválida." });
  const invite = social.createInvite(request.params.houseId, user, parsed.data); if (!invite) return response.status(404).json({ message: "Casa não encontrada." }); try { await saveHouse(request.params.houseId); } catch { return response.status(503).json({ message: "Convite indisponível no momento." }); } emitHouse(request.params.houseId); return response.status(201).json({ invite });
});
app.delete("/api/houses/:houseId/invites/:inviteId", async (request, response) => { const user = requireHousePermission(request, response, "INVITE_REVOKE"); if (!user) return; if (!social.revokeInvite(request.params.houseId, request.params.inviteId)) return response.status(404).json({ message: "Convite não encontrado." }); try { await saveHouse(request.params.houseId); } catch { return response.status(503).json({ message: "Convite indisponível no momento." }); } emitHouse(request.params.houseId); return response.status(204).end(); });
app.patch("/api/houses/:houseId/members/:userId", async (request, response) => {
  const user = requireHousePermission(request, response, "MEMBER_MANAGE"); if (!user) return; const parsed = z.object({ role: houseRoleSchema }).safeParse(request.body); if (!parsed.success || !social.changeRole(request.params.houseId, user.id, request.params.userId, parsed.data.role)) return response.status(409).json({ message: "O papel do anfitrião não pode ser alterado." }); try { await saveHouse(request.params.houseId); } catch { return response.status(503).json({ message: "Casa indisponível no momento." }); } const house = social.getHouse(request.params.houseId); const connected = house && store.getRoom(house.primaryRoomId)?.members.get(request.params.userId); if (connected) connected.role = parsed.data.role; emitHouse(request.params.houseId); if (house) emitSnapshot(house.primaryRoomId); return response.status(204).end();
});
app.post("/api/houses/:houseId/transfer-host", async (request, response) => {
  const user = requireHousePermission(request, response, "HOUSE_MANAGE"); if (!user) return;
  const parsed = z.object({ targetUserId: z.string().min(1) }).safeParse(request.body);
  if (!parsed.success || !social.transferHost(request.params.houseId, user.id, parsed.data.targetUserId)) return response.status(409).json({ message: "Escolha outro membro desta Casa para assumir como host." });
  try { await saveHouse(request.params.houseId); } catch { return response.status(503).json({ message: "Transferência indisponível no momento." }); }
  const house = social.getHouse(request.params.houseId);
  if (house) { for (const id of [user.id, parsed.data.targetUserId]) { const connected = store.getRoom(house.primaryRoomId)?.members.get(id); if (connected) connected.role = social.role(house.id, id)!; } emitSnapshot(house.primaryRoomId); }
  emitHouse(request.params.houseId); return response.status(204).end();
});
app.delete("/api/houses/:houseId/members/:userId", async (request, response) => { const user = requireHousePermission(request, response, "MEMBER_MANAGE"); if (!user) return; if (!social.removeMember(request.params.houseId, request.params.userId)) return response.status(409).json({ message: "O anfitrião não pode ser removido." }); try { await saveHouse(request.params.houseId); } catch { return response.status(503).json({ message: "Casa indisponível no momento." }); } const house = social.getHouse(request.params.houseId); if (house) { googleDrive.revokeOwnerFromHouse(house.primaryRoomId, request.params.userId); abortHouseDriveStreams(house.primaryRoomId, request.params.userId); } disconnectHouseMember(request.params.houseId, request.params.userId); emitHouse(request.params.houseId); return response.status(204).end(); });
app.post("/api/houses/:houseId/leave", async (request, response) => { const user = requireUser(request, response); if (!user) return; if (!social.leave(request.params.houseId, user.id)) return response.status(409).json({ message: "O anfitrião precisa transferir a Casa antes de sair." }); try { await saveHouse(request.params.houseId); } catch { return response.status(503).json({ message: "Casa indisponível no momento." }); } const house = social.getHouse(request.params.houseId); if (house) { googleDrive.revokeOwnerFromHouse(house.primaryRoomId, user.id); abortHouseDriveStreams(house.primaryRoomId, user.id); } disconnectHouseMember(request.params.houseId, user.id); emitHouse(request.params.houseId); return response.status(204).end(); });

app.get("/api/media-hub/:roomId", (request, response) => {
  const user = requireRoomMember(request, response, String(request.params.roomId)); if (!user) return;
  const query = z.object({ q: z.string().max(100).optional(), filter: z.string().max(32).optional(), cursor: z.coerce.number().int().min(0).optional(), limit: z.coerce.number().int().min(1).max(60).optional() }).safeParse(request.query);
  if (!query.success) return response.status(400).json({ message: "Filtros inválidos." });
  const hub = store.getMediaHub(request.params.roomId, user.id, { query: query.data.q, filter: query.data.filter, cursor: query.data.cursor, limit: query.data.limit });
  if (!hub) return response.status(404).json({ message: "Sala não encontrada." });
  return response.json(hub);
});

app.get("/api/media-hub/:roomId/history", (request, response) => {
  const user = requireRoomMember(request, response, String(request.params.roomId)); if (!user) return;
  const query = z.object({ cursor: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(60).default(30) }).safeParse(request.query);
  if (!query.success) return response.status(400).json({ message: "Paginação inválida." });
  const page = store.getHistoryPage(request.params.roomId, query.data.cursor, query.data.limit);
  return page ? response.json(page) : response.status(404).json({ message: "Party não encontrada." });
});

app.post("/api/media-hub/:roomId/favorite", async (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "LIBRARY_MANAGE"); if (!user) return;
  const parsed = mediaItemSchema.safeParse(request.body.item);
  if (!parsed.success) return response.status(400).json({ message: "Mídia inválida." });
  const result = store.toggleFavorite(request.params.roomId, user, parsed.data); if (!await persistMediaForResponse(request.params.roomId, response)) return; emitMediaHubUpdate(request.params.roomId, "favorite");
  return response.json(result);
});

app.post("/api/media-hub/:roomId/library", async (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "LIBRARY_MANAGE"); if (!user) return;
  const parsed = mediaItemSchema.safeParse(request.body.item); if (!parsed.success) return response.status(400).json({ message: "Mídia inválida." });
  const item = store.saveLibrary(request.params.roomId, user, parsed.data); if (!item) return response.status(404).json({ message: "Party não encontrada." });
  if (!await persistMediaForResponse(request.params.roomId, response)) return; emitMediaHubUpdate(request.params.roomId, "library"); return response.status(201).json({ item });
});

app.delete("/api/media-hub/:roomId/library", async (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "LIBRARY_MANAGE"); if (!user) return;
  const parsed = mediaItemSchema.safeParse(request.body.item); if (!parsed.success) return response.status(400).json({ message: "Mídia inválida." });
  store.removeLibrary(request.params.roomId, parsed.data); if (!await persistMediaForResponse(request.params.roomId, response)) return; emitMediaHubUpdate(request.params.roomId, "library"); return response.status(204).end();
});

app.post("/api/media-hub/:roomId/playlists", async (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_CREATE"); if (!user) return;
  const parsed = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(240).optional() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Informe um nome válido." });
  const playlist = store.createPlaylist(request.params.roomId, user, parsed.data.name, parsed.data.description); if (!playlist) return response.status(404).json({ message: "Party não encontrada." });
  if (!await persistMediaForResponse(request.params.roomId, response)) return; emitMediaHubUpdate(request.params.roomId, "playlist"); return response.status(201).json({ playlist });
});

app.get("/api/media-hub/:roomId/playlists/:playlistId", (request, response) => { const user = requireRoomMember(request, response, String(request.params.roomId)); if (!user) return; const playlist = store.getPlaylist(request.params.roomId, request.params.playlistId); return playlist ? response.json({ playlist }) : response.status(404).json({ message: "Playlist não encontrada." }); });

app.patch("/api/media-hub/:roomId/playlists/:playlistId", async (request, response) => {
  const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_EDIT"); if (!user) return;
  const parsed = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(240).optional() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Dados inválidos." });
  const playlist = store.updatePlaylist(request.params.roomId, request.params.playlistId, parsed.data); if (!playlist) return response.status(404).json({ message: "Playlist não encontrada." }); if (!await persistMediaForResponse(request.params.roomId, response)) return; emitMediaHubUpdate(request.params.roomId, "playlist"); return response.json({ playlist });
});

app.delete("/api/media-hub/:roomId/playlists/:playlistId", async (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_DELETE"); if (!user) return; if (!store.deletePlaylist(request.params.roomId, request.params.playlistId)) return response.status(404).json({ message: "Playlist não encontrada." }); if (!await persistMediaForResponse(request.params.roomId, response)) return; emitMediaHubUpdate(request.params.roomId, "playlist"); return response.status(204).end(); });

app.post("/api/media-hub/:roomId/playlists/:playlistId/items", async (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_EDIT"); if (!user) return; const parsed = mediaItemSchema.safeParse(request.body.item); if (!parsed.success) return response.status(400).json({ message: "Mídia inválida." }); const playlist = store.addPlaylistItem(request.params.roomId, request.params.playlistId, user, parsed.data); if (!playlist) return response.status(404).json({ message: "Playlist não encontrada." }); if (!await persistMediaForResponse(request.params.roomId, response)) return; emitMediaHubUpdate(request.params.roomId, "playlist"); return response.status(201).json({ playlist }); });
app.delete("/api/media-hub/:roomId/playlists/:playlistId/items/:itemId", async (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_EDIT"); if (!user) return; const playlist = store.removePlaylistItem(request.params.roomId, request.params.playlistId, request.params.itemId); if (!playlist) return response.status(404).json({ message: "Playlist não encontrada." }); if (!await persistMediaForResponse(request.params.roomId, response)) return; emitMediaHubUpdate(request.params.roomId, "playlist"); return response.json({ playlist }); });
app.put("/api/media-hub/:roomId/playlists/:playlistId/order", async (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "PLAYLIST_EDIT"); if (!user) return; const parsed = z.object({ itemIds: z.array(z.string()).max(500), expectedUpdatedAt: z.string().datetime() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Ordem inválida." }); const playlist = store.reorderPlaylist(request.params.roomId, request.params.playlistId, parsed.data.itemIds, parsed.data.expectedUpdatedAt); if (!playlist) return response.status(409).json({ message: "A playlist mudou. Atualize e tente novamente.", playlist: store.getPlaylist(request.params.roomId, request.params.playlistId) }); if (!await persistMediaForResponse(request.params.roomId, response)) return; emitMediaHubUpdate(request.params.roomId, "playlist"); return response.json({ playlist }); });
app.post("/api/media-hub/:roomId/playlists/:playlistId/queue", async (request, response) => { const user = requireRoomPermission(request, response, String(request.params.roomId), "MEDIA_ADD"); if (!user) return; const parsed = z.object({ mode: z.enum(["append", "next", "replace"]).default("append"), playNow: z.boolean().default(false), revision: z.number().int().nonnegative() }).safeParse(request.body); if (!parsed.success) return response.status(400).json({ message: "Opção de fila inválida." }); if ((parsed.data.playNow || parsed.data.mode === "replace") && !store.canControlMedia(request.params.roomId, user.id)) return response.status(403).json({ message: "Você não pode controlar a reprodução ou substituir a fila." }); const result = store.enqueuePlaylist(request.params.roomId, request.params.playlistId, user, parsed.data.mode, parsed.data.playNow, parsed.data.revision, (item) => mediaAvailableInRoom(request.params.roomId, item)); if (!result) return response.status(404).json({ message: "Playlist vazia ou não encontrada." }); if (result.conflict) return response.status(409).json({ message: "A fila mudou. Revise a ordem e tente novamente.", revision: result.revision }); if (!result.media && result.skipped && result.skipped === store.getPlaylist(request.params.roomId, request.params.playlistId)?.items?.length) return response.status(409).json({ message: "Todos os itens da playlist estão indisponíveis.", skipped: result.skipped }); if (!await persistMediaForResponse(request.params.roomId, response)) return; io.to(request.params.roomId).emit("queue:update", result.queue, result.revision); if (result.media) { io.to(request.params.roomId).emit("media:sync", result.media); emitMediaHubUpdate(request.params.roomId, "history"); } return response.json(result); });

app.post("/api/media-hub/:roomId/progress", async (request, response) => {
  const user = requireRoomMember(request, response, String(request.params.roomId)); if (!user) return;
  const parsed = z.object({ item: queueItemSchema, position: z.number().min(0) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "Progresso inválido." });
  store.saveProgress(user.id, parsed.data.item, parsed.data.position);
  try { await mediaRepository?.saveProgress(user.id, parsed.data.item, parsed.data.position); }
  catch { return response.status(503).json({ message: "Progresso indisponível no momento." }); }
  return response.status(204).end();
});

app.get("/api/google-drive/status", (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  return response.json(googleDrive.getStatus(user.id));
});

app.post("/api/google-drive/auth/start", (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  if (!apiRateLimit(request, response, user.id, 10)) return;
  try { return response.json({ url: googleDrive.createAuthorizationUrl(user.id) }); }
  catch (error) { return response.status(503).json({ message: error instanceof Error ? error.message : "Google Drive indisponível." }); }
});

app.get("/api/google-drive/oauth/callback", async (request, response) => {
  const state = typeof request.query.state === "string" ? request.query.state : "";
  const origin = allowedOrigins[0] ?? CLIENT_ORIGIN;
  if (request.query.error) return response.type("html").send(`<!doctype html><meta charset="utf-8"><p>Conexão cancelada. Pode fechar esta janela.</p><script>window.opener?.postMessage({type:"lumio:drive-cancelled"},${JSON.stringify(origin)});window.close()</script>`);
  const parsed = z.object({ state: z.string(), code: z.string() }).safeParse(request.query);
  if (!parsed.success || !state) return response.status(400).send("Autorização inválida.");
  try {
    await googleDrive.completeAuthorization(parsed.data.state, parsed.data.code);
    return response.type("html").send(`<!doctype html><meta charset="utf-8"><title>Lumio</title><body style="background:#0a0f0c;color:#edf4ef;font:16px system-ui;padding:40px">Google Drive conectado. Esta janela pode ser fechada.<script>window.opener?.postMessage({type:"lumio:drive-connected"},${JSON.stringify(origin)});window.close()</script></body>`);
  } catch { return response.status(400).send("Não foi possível conectar o Google Drive. Volte ao Lumio e tente novamente."); }
});

app.post("/api/google-drive/disconnect", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  try { await googleDrive.disconnect(user.id); for (const house of social.listForUser(user.id)) abortHouseDriveStreams(house.primaryRoomId, user.id); return response.status(204).end(); }
  catch { return response.status(502).json({ message: "Não foi possível desconectar o Google Drive agora." }); }
});

app.get("/api/google-drive/files", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  if (!apiRateLimit(request, response, user.id, 60)) return;
  const parsed = z.object({ folderId: z.string().max(200).default("root"), pageToken: z.string().max(2048).optional() }).safeParse(request.query);
  if (!parsed.success) return response.status(400).json({ message: "Pasta ou página inválida." });
  try { return response.json(await googleDrive.listFolder(user.id, parsed.data.folderId, parsed.data.pageToken)); }
  catch (error) { return response.status(driveStatus(error)).json({ message: driveMessage(error) }); }
});

app.get("/api/google-drive/resolve", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  if (!apiRateLimit(request, response, user.id, 30)) return;
  const input = typeof request.query.input === "string" ? request.query.input : "";
  try { return response.json({ item: await googleDrive.resolve(user.id, input) }); }
  catch (error) { return response.status(driveStatus(error)).json({ message: driveMessage(error) }); }
});

app.post("/api/google-drive/files/:fileId/playback", async (request, response) => {
  const user = requireUser(request, response); if (!user) return;
  if (!apiRateLimit(request, response, user.id, 120)) return;
  const roomId = typeof request.body?.roomId === "string" ? request.body.roomId : "";
  const house = social.getByRoom(roomId);
  if (deletingRooms.has(roomId)) return response.status(409).json({ message: "Casa em exclusão." });
  if (!house || !social.isMember(house.id, user.id)) return response.status(403).json({ message: "Você não faz parte desta Casa." });
  try {
    const grant = googleDrive.getGrant(roomId, request.params.fileId);
    const nonce = crypto.randomBytes(32).toString("base64url");
    const ticket = googleDrive.createPlaybackTicket({ roomId, fileId: request.params.fileId, viewerId: user.id, sessionToken: nonce, ownerIsMember: Boolean(grant && social.isMember(house.id, grant.ownerId)), mediaIsListed: driveMediaListed(roomId, request.params.fileId) });
    response.setHeader("Set-Cookie", `lumio_drive_playback=${nonce}; HttpOnly; Path=/api/google-drive/playback/${ticket}; Max-Age=300${browserCookiePolicy(request)}`);
    response.setHeader("Cache-Control", "no-store");
    return response.json({ url: `/api/google-drive/playback/${ticket}`, expiresIn: 300 });
  } catch (error) { return response.status(driveStatus(error)).json({ message: driveMessage(error) }); }
});

const activeDriveStreams = new Map<string, Set<{ viewerId: string; ownerId: string; controller: AbortController }>>();
const abortHouseDriveStreams = (roomId: string, userId: string) => { for (const entry of activeDriveStreams.get(roomId) ?? []) if (entry.viewerId === userId || entry.ownerId === userId) entry.controller.abort(); };
const streamDrive = async (request: express.Request, response: express.Response) => {
  const nonce = request.header("cookie")?.match(/(?:^|;\s*)lumio_drive_playback=([^;]+)/)?.[1] ?? "";
  let cleanup = () => undefined;
  try {
    const ticket = googleDrive.verifyTicket(String(request.params.ticket), nonce);
    if (deletingRooms.has(ticket.roomId)) return response.status(403).end();
    const house = social.getByRoom(ticket.roomId);
    if (!house || !social.isMember(house.id, ticket.viewerId) || !social.isMember(house.id, ticket.ownerId) || !driveMediaListed(ticket.roomId, ticket.fileId)) return response.status(403).end();
    const activeForViewer = [...(activeDriveStreams.get(ticket.roomId) ?? [])].filter((entry) => entry.viewerId === ticket.viewerId).length;
    if (activeForViewer >= 4) return response.status(429).end();
    const controller = new AbortController();
    const entries = activeDriveStreams.get(ticket.roomId) ?? new Set<{ viewerId: string; ownerId: string; controller: AbortController }>();
    const entry = { viewerId: ticket.viewerId, ownerId: ticket.ownerId, controller }; entries.add(entry); activeDriveStreams.set(ticket.roomId, entries);
    const onClose = () => { if (!response.writableEnded) controller.abort(); };
    response.on("close", onClose);
    cleanup = () => { response.off("close", onClose); entries.delete(entry); if (!entries.size) activeDriveStreams.delete(ticket.roomId); };
    const upstream = await googleDrive.getPlaybackResponse(ticket.ownerId, ticket.fileId, request.method === "HEAD" ? "bytes=0-0" : request.header("range"), controller.signal);
    if (![200, 206, 416].includes(upstream.status)) { await upstream.body?.cancel(); return response.status(502).end(); }
    const isHead = request.method === "HEAD" && upstream.status === 206;
    response.status(isHead ? 200 : upstream.status);
    response.setHeader("Cache-Control", "private, no-store");
    for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      if (isHead && (header === "content-length" || header === "content-range")) continue;
      const value = upstream.headers.get(header); if (value) response.setHeader(header, value);
    }
    if (isHead) {
      const total = upstream.headers.get("content-range")?.match(/\/([0-9]+)$/)?.[1];
      if (total) response.setHeader("Content-Length", total);
    }
    if (request.method === "HEAD") { await upstream.body?.cancel(); return response.end(); }
    if (!upstream.body) return response.end();
    const nodeStream = Readable.fromWeb(upstream.body as never);
    await pipeline(nodeStream, response, { signal: controller.signal });
  } catch (error) {
    if (response.destroyed) return;
    if (response.headersSent) return response.destroy();
    log("warn", "drive_stream_error", { requestId: String(response.getHeader("X-Request-ID") ?? ""), category: error instanceof DriveError ? error.code : "PROVIDER" });
    return response.status(driveStatus(error)).end();
  } finally { cleanup(); }
};
app.get("/api/google-drive/playback/:ticket", streamDrive);
app.head("/api/google-drive/playback/:ticket", streamDrive);

app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (response.headersSent) return response.end();
  const status = typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large" ? 413 : error instanceof SyntaxError ? 400 : 500;
  if (status === 500) log("error", "http_unhandled_error", { requestId: String(response.getHeader("X-Request-ID") ?? ""), route: typeof request.route?.path === "string" ? request.route.path : "unmatched", category: "INTERNAL" });
  return response.status(status).json({ message: status === 413 ? "Solicitação muito grande." : status === 400 ? "JSON inválido." : "Erro interno. Tente novamente." });
});

io.use((socket, next) => {
  if (shuttingDown || postgresMode && (!authRepository?.isHealthy() || !socialRepository?.isHealthy() || !mediaRepository?.isHealthy())) return next(new Error("Servidor temporariamente indisponível."));
  const authToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
  const user = authToken ? auth.resolveSession(authToken)?.user : undefined;
  if (!user || !auth.isVerified(user.id)) return next(new Error("Sessão inválida ou e-mail não confirmado."));
  socket.data.user = user;
  return next();
});

const emitSnapshot = (roomId: string) => {
  const snapshot = store.getSnapshot(roomId); const house = social.getByRoom(roomId);
  if (snapshot && house) {
    const viewers = io.sockets.adapter.rooms.get(roomId) ?? new Set<string>();
    for (const socketId of viewers) { const target = io.sockets.sockets.get(socketId); const viewer = target?.data.user as User | undefined; const details = viewer && social.details(house.id, viewer.id); if (target && details) target.emit("room:snapshot", { ...snapshot, houseId: house.id, houseMembers: details.members, permissions: details.permissions }); }
  } else if (snapshot) io.to(roomId).emit("room:snapshot", snapshot);
  if (house) emitHomeForHouse(house.id);
};
const houseSummaries = (userId: string) => social.listForUser(userId).map((house) => { const media = store.getSnapshot(house.primaryRoomId)?.currentMedia; return { ...house, nowPlaying: media?.mediaId ? { title: media.title, provider: media.provider } : null }; });
const homeStateBySocket = new Map<string, string>();
const emitHomeToSocket = (socket: Socket<ClientToServerEvents, ServerToClientEvents>, userId: string) => { const summaries = houseSummaries(userId); const serialized = JSON.stringify(summaries); if (homeStateBySocket.get(socket.id) !== serialized) { homeStateBySocket.set(socket.id, serialized); socket.emit("home:update", summaries); } };
const emitHomeForHouse = (houseId: string) => { for (const socket of io.sockets.sockets.values()) { const user = socket.data.user as User | undefined; if (user && social.isMember(houseId, user.id)) emitHomeToSocket(socket, user.id); } };
const emitHouse = (houseId: string) => { const house = social.getHouse(houseId); if (!house) return; for (const socket of io.sockets.sockets.values()) { const user = socket.data.user as User | undefined; const details = user && social.details(houseId, user.id); if (details) socket.emit("house:update", details); } emitHomeForHouse(houseId); };
const disconnectHouseMember = (houseId: string, userId: string) => { const house = social.getHouse(houseId); if (!house) return; for (const socket of io.sockets.sockets.values()) { if ((socket.data.user as User | undefined)?.id === userId) { emitHomeToSocket(socket, userId); if (socket.data.joinedRoomId === house.primaryRoomId) { socket.emit("member:removed", { houseId, message: "Você não faz mais parte desta Casa." }); socket.data.revoked = true; socket.leave(house.primaryRoomId); setTimeout(() => socket.disconnect(true), 50); } } } const key = `${house.primaryRoomId}:${userId}`; const timer = offlineTimers.get(key); if (timer) clearTimeout(timer); offlineTimers.delete(key); store.removeMember(house.primaryRoomId, userId); emitSnapshot(house.primaryRoomId); };
const roomConnections = new Map<string, Map<string, Set<string>>>();
const offlineTimers = new Map<string, NodeJS.Timeout>();
const activeUserSockets = new Map<string, Set<string>>();
const accountOfflineTimers = new Map<string, NodeJS.Timeout>();
const refreshAccountPresence = (userId: string, status: "ONLINE" | "IDLE" | "OFFLINE") => { social.setPresenceForUser(userId, status); for (const house of social.listForUser(userId)) emitHouse(house.id); };
const persistLastSeen = async (userId: string) => {
  if (!db) return;
  const at = new Date();
  await db.$transaction([db.user.update({ where: { id: userId }, data: { lastSeenAt: at } }), db.groupMember.updateMany({ where: { userId }, data: { lastSeenAt: at } })]);
};
const registerConnection = (roomId: string, userId: string, socketId: string) => { const room = roomConnections.get(roomId) ?? new Map<string, Set<string>>(); const set = room.get(userId) ?? new Set<string>(); set.add(socketId); room.set(userId, set); roomConnections.set(roomId, room); const key = `${roomId}:${userId}`; const timer = offlineTimers.get(key); if (timer) clearTimeout(timer); offlineTimers.delete(key); return set.size; };
const callSockets = new CallRegistry();
const socketEventAttempts = new Map<string, { count: number; resetAt: number }>();
const screenOwnerSockets = new Map<string, string>();
const leaveCall = (roomId: string, user: User, socketId: string) => {
  if (!callSockets.leave(roomId, user.id, socketId)) return;
  io.to(roomId).emit("voice:peer-left", { userId: user.id, socketId });
  const snapshot = store.updatePresence(roomId, user.id, { speaking: false, muted: true });
  if (snapshot) io.to(roomId).emit("presence:update", snapshot.members);
  const house = social.getByRoom(roomId);
  if (house) { social.setPresence(house.id, user.id, "ONLINE", { inCall: false, speaking: false }); emitHouse(house.id); }
};
const unregisterConnection = (roomId: string, userId: string, socketId: string) => { const room = roomConnections.get(roomId), set = room?.get(userId); set?.delete(socketId); if (!set?.size) room?.delete(userId); if (room && !room.size) roomConnections.delete(roomId); return set?.size ?? 0; };
const canControl = (roomId: string, userId: string) => store.canControlMedia(roomId, userId);
const canManageRoom = (roomId: string, userId: string) => {
  const house = social.getByRoom(roomId);
  return Boolean(house && can(social.role(house.id, userId), "HOUSE_MANAGE"));
};
const emitQueueState = (roomId: string, state: { queue: QueueItem[]; history: HouseHistoryEntry[]; revision: number }) => {
  io.to(roomId).emit("queue:update", state.queue, state.revision);
  io.to(roomId).emit("queue:history", state.history);
};
const persistMediaForSocket = async (roomId: string, socket: Socket) => {
  try { await saveMedia(roomId); return true; }
  catch { socket.emit("server:error", "Mídia indisponível no momento."); return false; }
};

io.on("connection", (socket) => {
  const user = socket.data.user as User;
  log("info", "socket_connected", { userId: user.id, connectionId: socket.id, activeSockets: io.engine.clientsCount });
  let joinedRoomId: string | undefined;
  socket.data.active = true;
  const online = activeUserSockets.get(user.id) ?? new Set<string>(); online.add(socket.id); activeUserSockets.set(user.id, online);
  const offline = accountOfflineTimers.get(user.id); if (offline) clearTimeout(offline); accountOfflineTimers.delete(user.id);
  refreshAccountPresence(user.id, "ONLINE"); emitHomeToSocket(socket, user.id);
  socket.use(([event, payload], next) => {
    if (shuttingDown || postgresMode && (!authRepository?.isHealthy() || !socialRepository?.isHealthy() || !mediaRepository?.isHealthy())) return next(new Error("Persistência temporariamente indisponível."));
    if (!auth.resolveSession(socket.handshake.auth?.token ?? "")) return next(new Error("Sessão revogada."));
    if (socket.data.revoked) return next(new Error("Acesso à Casa revogado."));
    if (event !== eventNames.roomLeave && (!payload || typeof payload !== "object" || Array.isArray(payload))) return next(new Error("Payload inválido."));
    if (event !== eventNames.roomJoin && joinedRoomId) { const house = social.getByRoom(joinedRoomId); if (deletingRooms.has(joinedRoomId) || !house || !social.isMember(house.id, user.id)) return next(new Error("Acesso à Casa revogado.")); }
    const ceiling = event === eventNames.chatMessage ? 20 : event === eventNames.reactionSend ? 40 : event === eventNames.chatTyping ? 60 : event === eventNames.voiceSignal ? 600 : 120;
    const now = Date.now(), key = `${user.id}:${event}`, bucket = socketEventAttempts.get(key);
    if (socketEventAttempts.size > 20_000) for (const [id, entry] of socketEventAttempts) if (entry.resetAt <= now) socketEventAttempts.delete(id);
    if (socketEventAttempts.size > 40_000) return next(new Error("Muitas ações em pouco tempo."));
    if (!bucket || bucket.resetAt < now) socketEventAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    else if (++bucket.count > ceiling) return next(new Error("Muitas ações em pouco tempo."));
    next();
  });

  socket.on(eventNames.roomJoin, (rawInput) => {
    const parsed = joinRoomInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.user.id !== user.id) return socket.emit("server:error", "Não foi possível entrar na sala.");
    const { roomId } = parsed.data;
    if (deletingRooms.has(roomId)) return socket.emit("server:error", "Casa em exclusão.");
    const house = social.getByRoom(roomId);
    if (!house || !social.isMember(house.id, user.id)) return socket.emit("server:error", "Você não faz parte desta Casa.");
    if (joinedRoomId && joinedRoomId !== roomId) {
      const oldRoomId = joinedRoomId;
      leaveCall(oldRoomId, user, socket.id);
      if (screenOwnerSockets.get(oldRoomId) === socket.id) { screenOwnerSockets.delete(oldRoomId); store.stopScreenShare(oldRoomId, user.id); io.to(oldRoomId).emit("screen:state", null); }
      socket.leave(oldRoomId);
      if (!unregisterConnection(oldRoomId, user.id, socket.id)) { store.removeMember(oldRoomId, user.id); const oldHouse = social.getByRoom(oldRoomId); if (oldHouse) { social.setPresence(oldHouse.id, user.id, "ONLINE", { inParty: false, inCall: false, speaking: false, screenSharing: false }); emitHouse(oldHouse.id); } }
      emitSnapshot(oldRoomId);
    }
    registerConnection(roomId, user.id, socket.id);
    const snapshot = store.addMember(roomId, user, social.role(house.id, user.id));
    if (!snapshot) { unregisterConnection(roomId, user.id, socket.id); return socket.emit("server:error", "Sala não encontrada."); }
    joinedRoomId = roomId;
    socket.data.joinedRoomId = roomId;
    socket.join(roomId);
    log("info", "party_joined", { userId: user.id, connectionId: socket.id, roomId });
    social.setPresence(house.id, user.id, "ONLINE", { inParty: true });
    emitSnapshot(roomId);
    emitHouse(house.id);
  });

  socket.on(eventNames.roomLeave, (roomId) => {
    if (joinedRoomId !== roomId) return;
    log("info", "party_left", { userId: user.id, connectionId: socket.id, roomId });
    leaveCall(roomId, user, socket.id);
    if (screenOwnerSockets.get(roomId) === socket.id) { screenOwnerSockets.delete(roomId); store.stopScreenShare(roomId, user.id); }
    socket.leave(roomId);
    const remaining = unregisterConnection(roomId, user.id, socket.id); const house = social.getByRoom(roomId);
    if (!remaining) { store.removeMember(roomId, user.id); if (house) social.setPresence(house.id, user.id, "ONLINE", { inParty: false, inCall: false, speaking: false, screenSharing: false }); }
    joinedRoomId = undefined;
    socket.data.joinedRoomId = undefined;
    io.to(roomId).emit("screen:state", store.getSnapshot(roomId)?.screenShare ?? null);
    emitSnapshot(roomId);
    if (house) emitHouse(house.id);
  });

  socket.on(eventNames.chatMessage, (rawInput) => {
    const parsed = chatInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const message = store.addMessage(parsed.data.roomId, user, parsed.data.body);
    if (message) io.to(parsed.data.roomId).emit("chat:message", { ...message, user: publicUser(message.user) });
  });

  socket.on(eventNames.chatTyping, (input) => { const parsed = z.object({ roomId: z.string(), typing: z.boolean() }).safeParse(input); if (!parsed.success || parsed.data.roomId !== joinedRoomId) return; socket.to(parsed.data.roomId).emit("chat:typing", { roomId: parsed.data.roomId, userId: user.id, typing: parsed.data.typing }); });
  socket.on(eventNames.presenceActivity, (input) => { const parsed = z.object({ roomId: z.string(), active: z.boolean() }).safeParse(input); if (!parsed.success || parsed.data.roomId !== joinedRoomId) return; socket.data.active = parsed.data.active; const anyActive = [...(activeUserSockets.get(user.id) ?? [])].some((id) => io.sockets.sockets.get(id)?.data.active !== false); refreshAccountPresence(user.id, anyActive ? "ONLINE" : "IDLE"); });

  socket.on(eventNames.queueAdd, async (rawInput, respond) => {
    const parsed = addQueueInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !store.canAddToQueue(parsed.data.roomId, user.id)) {
      respond?.({ ok: false, message: "Você não pode adicionar itens a esta fila." });
      return;
    }
    let item = { ...parsed.data.item, addedBy: publicUser(user) };
    if (item.provider === "demo") return respond?.({ ok: false, message: "Provider indisponível." });
    if (item.provider === "youtube" && !/^[A-Za-z0-9_-]{11}$/.test(item.providerMediaId)) return respond?.({ ok: false, message: "Vídeo do YouTube inválido." });
    if (item.provider === "google-drive") {
      try {
        const existing = googleDrive.getGrant(parsed.data.roomId, item.providerMediaId);
        const ownerId = existing?.ownerId ?? user.id;
        const house = social.getByRoom(parsed.data.roomId);
        if (!house || !social.isMember(house.id, ownerId)) throw new DriveError("FORBIDDEN", "Vídeo do Drive indisponível nesta Casa.");
        const verified = await googleDrive.grant(parsed.data.roomId, ownerId, item.providerMediaId);
        item = { ...verified, id: item.id, addedBy: publicUser(user), addedAt: item.addedAt };
      } catch (error) { return respond?.({ ok: false, message: driveMessage(error) }); }
    }
    if (item.provider === "youtube" && youtube.isConfigured()) {
      try {
        const verified = await youtube.getVideo(item.providerMediaId);
        item = { ...verified, addedBy: publicUser(user), addedAt: parsed.data.item.addedAt };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Vídeo do YouTube indisponível.";
        respond?.({ ok: false, message });
        return socket.emit("server:error", message);
      }
    }
    if (deletingRooms.has(parsed.data.roomId) || !social.getByRoom(parsed.data.roomId)) { googleDrive.revokeRoom(parsed.data.roomId); return respond?.({ ok: false, message: "Acesso à Casa revogado." }); }
    if (!social.isMember(social.getByRoom(parsed.data.roomId)?.id ?? "", user.id) || joinedRoomId !== parsed.data.roomId || !store.canAddToQueue(parsed.data.roomId, user.id)) return respond?.({ ok: false, message: "Acesso à Casa revogado." });
    const queue = store.addQueueItem(parsed.data.roomId, item);
    if (queue) {
      if (!await persistMediaForSocket(parsed.data.roomId, socket)) return respond?.({ ok: false, message: "Fila indisponível no momento." });
      io.to(parsed.data.roomId).emit("queue:update", queue, store.getQueueRevision(parsed.data.roomId));
      respond?.({ ok: true, item: queue.at(-1), position: queue.length });
    } else respond?.({ ok: false, message: "Não foi possível adicionar o item à fila." });
  });

  socket.on(eventNames.queueRemove, async (rawInput, respond) => {
    const parsed = z.object({ roomId: z.string(), itemId: z.string() }).safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return respond?.({ ok: false, message: "Você não pode remover este item." });
    const item = store.getSnapshot(parsed.data.roomId)?.queue.find((entry) => entry.id === parsed.data.itemId);
    if (!item) return respond?.({ ok: false, message: "Este item não está mais na fila." });
    const queue = store.removeQueueItem(parsed.data.roomId, parsed.data.itemId);
    if (queue) { if (!await persistMediaForSocket(parsed.data.roomId, socket)) return respond?.({ ok: false, message: "Fila indisponível no momento." }); io.to(parsed.data.roomId).emit("queue:update", queue, store.getQueueRevision(parsed.data.roomId)); if (item.status === "playing") { const media = store.getSnapshot(parsed.data.roomId)?.currentMedia; if (media) io.to(parsed.data.roomId).emit("media:sync", media); } respond?.({ ok: true }); }
    else respond?.({ ok: false, message: "Não foi possível remover o item da fila." });
  });

  socket.on(eventNames.queueNext, async (rawInput) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return;
    const beforeRevision = store.getQueueRevision(parsed.data.roomId);
    const next = store.nextQueueItem(parsed.data.roomId, user.id, (item) => mediaAvailableInRoom(parsed.data.roomId, item));
    if ((next || store.getQueueRevision(parsed.data.roomId) !== beforeRevision) && !await persistMediaForSocket(parsed.data.roomId, socket)) return;
    if (next) {
      emitQueueState(parsed.data.roomId, next);
      io.to(parsed.data.roomId).emit("media:sync", next.media);
    } else if (store.getQueueRevision(parsed.data.roomId) !== beforeRevision) { const snapshot = store.getSnapshot(parsed.data.roomId); if (snapshot) io.to(parsed.data.roomId).emit("queue:update", snapshot.queue, snapshot.queueRevision); }
  });

  socket.on(eventNames.queuePrevious, async (rawInput) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return;
    const previous = store.previousQueueItem(parsed.data.roomId, (item) => mediaAvailableInRoom(parsed.data.roomId, item));
    if (previous) { if (!await persistMediaForSocket(parsed.data.roomId, socket)) return; emitQueueState(parsed.data.roomId, previous); io.to(parsed.data.roomId).emit("media:sync", previous.media); }
  });

  socket.on(eventNames.queueMove, async (rawInput) => {
    const parsed = queueMoveSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    if (!canControl(parsed.data.roomId, user.id)) return socket.emit("server:error", "Você não tem permissão para organizar a fila.");
    const result = store.moveQueueItem(parsed.data.roomId, parsed.data.itemId, parsed.data.toIndex, parsed.data.revision);
    if (result) {
      if (!result.conflict && !await persistMediaForSocket(parsed.data.roomId, socket)) return;
      io.to(parsed.data.roomId).emit("queue:update", result.queue, result.revision);
      if (result.conflict) socket.emit("server:error", "A fila mudou. Tente novamente.");
    }
  });

  socket.on(eventNames.queuePlayNext, async (rawInput, respond) => {
    const parsed = queuePlayNextSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !store.canAddToQueue(parsed.data.roomId, user.id)) return respond?.({ ok: false, message: "Você não pode alterar esta fila." });
    let item = { ...parsed.data.item, addedBy: publicUser(user) };
    if (item.provider === "demo") return respond?.({ ok: false, message: "Provider indisponível." });
    if (item.provider === "youtube" && !/^[A-Za-z0-9_-]{11}$/.test(item.providerMediaId)) return respond?.({ ok: false, message: "Vídeo do YouTube inválido." });
    if (item.provider === "google-drive") {
      try {
        const existing = googleDrive.getGrant(parsed.data.roomId, item.providerMediaId);
        const ownerId = existing?.ownerId ?? user.id;
        const house = social.getByRoom(parsed.data.roomId);
        if (!house || !social.isMember(house.id, ownerId)) throw new DriveError("FORBIDDEN", "Vídeo do Drive indisponível nesta Casa.");
        const verified = await googleDrive.grant(parsed.data.roomId, ownerId, item.providerMediaId);
        item = { ...verified, id: item.id, addedBy: publicUser(user), addedAt: item.addedAt };
      } catch (error) { return respond?.({ ok: false, message: driveMessage(error) }); }
    }
    if (item.provider === "youtube") {
      try { const verified = await youtube.getVideo(item.providerMediaId); item = { ...verified, id: item.id, addedBy: publicUser(user), addedAt: item.addedAt }; }
      catch (error) { return respond?.({ ok: false, message: error instanceof Error ? error.message : "Vídeo do YouTube indisponível." }); }
    }
    if (deletingRooms.has(parsed.data.roomId) || !social.getByRoom(parsed.data.roomId)) { googleDrive.revokeRoom(parsed.data.roomId); return respond?.({ ok: false, message: "Acesso à Casa revogado." }); }
    if (!social.isMember(social.getByRoom(parsed.data.roomId)?.id ?? "", user.id) || joinedRoomId !== parsed.data.roomId || !store.canAddToQueue(parsed.data.roomId, user.id)) return respond?.({ ok: false, message: "Acesso à Casa revogado." });
    const result = store.playNext(parsed.data.roomId, item, parsed.data.revision);
    if (!result) return respond?.({ ok: false, message: "Party não encontrada." });
    if (!result.conflict && !await persistMediaForSocket(parsed.data.roomId, socket)) return respond?.({ ok: false, message: "Fila indisponível no momento." });
    io.to(parsed.data.roomId).emit("queue:update", result.queue, result.revision);
    respond?.({ ok: !result.conflict, queue: result.queue, revision: result.revision, message: result.conflict ? "A fila mudou; a ordem atual foi restaurada." : undefined });
  });

  socket.on(eventNames.queueClear, async (rawInput, respond) => {
    const parsed = queueRevisionSchema.safeParse(rawInput); const house = parsed.success ? social.getByRoom(parsed.data.roomId) : undefined;
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !house || !can(social.role(house.id, user.id), "QUEUE_MANAGE")) return respond?.({ ok: false, message: "Você não pode limpar esta fila." });
    const result = store.clearQueue(parsed.data.roomId, parsed.data.revision); if (!result) return respond?.({ ok: false, message: "Party não encontrada." });
    if (!result.conflict && !await persistMediaForSocket(parsed.data.roomId, socket)) return respond?.({ ok: false, message: "Fila indisponível no momento." });
    io.to(parsed.data.roomId).emit("queue:update", result.queue, result.revision); respond?.({ ok: !result.conflict, queue: result.queue, revision: result.revision, message: result.conflict ? "A fila mudou; tente novamente." : undefined });
  });

  socket.on(eventNames.queueAdvance, async (rawInput, respond) => {
    const parsed = queueAdvanceSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return respond?.({ ok: false, advanced: false, message: "Pedido inválido." });
    const current = store.getRoom(parsed.data.roomId)?.currentMedia;
    const effective = current && store.getEffectiveMedia(current);
    const atEnd = Boolean(effective && effective.duration > 0 && effective.state === "playing" && effective.position >= effective.duration - 2);
    if (!atEnd && !canControl(parsed.data.roomId, user.id)) return respond?.({ ok: false, advanced: false, message: "Somente o controlador pode avançar antes do fim da mídia." });
    const beforeRevision = store.getQueueRevision(parsed.data.roomId);
    const result = store.advanceQueue(parsed.data.roomId, parsed.data.expectedMediaId, user.id, parsed.data.expectedQueueItemId, (item) => mediaAvailableInRoom(parsed.data.roomId, item));
    if ((result.next || store.getQueueRevision(parsed.data.roomId) !== beforeRevision) && !await persistMediaForSocket(parsed.data.roomId, socket)) return respond?.({ ok: false, advanced: false, message: "Fila indisponível no momento." });
    if (result.next) { emitQueueState(parsed.data.roomId, result.next); io.to(parsed.data.roomId).emit("media:sync", result.next.media); emitMediaHubUpdate(parsed.data.roomId, "history"); }
    else if (result.media) { io.to(parsed.data.roomId).emit("media:sync", result.media); if (store.getQueueRevision(parsed.data.roomId) !== beforeRevision) { const snapshot = store.getSnapshot(parsed.data.roomId); if (snapshot) io.to(parsed.data.roomId).emit("queue:update", snapshot.queue, snapshot.queueRevision); } }
    respond?.({ ok: true, advanced: result.advanced });
  });

  socket.on(eventNames.roomMode, async (rawInput) => {
    const parsed = modeChangeSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canManageRoom(parsed.data.roomId, user.id)) return;
    const mode = store.setMode(parsed.data.roomId, parsed.data.mode);
    if (mode && await persistMediaForSocket(parsed.data.roomId, socket)) io.to(parsed.data.roomId).emit("room:mode", mode);
  });

  socket.on(eventNames.roomSettings, async (rawInput) => {
    const parsed = roomSettingsInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canManageRoom(parsed.data.roomId, user.id)) return;
    const settings = store.updateSettings(parsed.data.roomId, parsed.data.settings);
    if (settings && await persistMediaForSocket(parsed.data.roomId, socket)) io.to(parsed.data.roomId).emit("room:settings", settings);
  });

  socket.on(eventNames.mediaRequestSync, (input) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(input);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const room = store.getRoom(parsed.data.roomId);
    if (room) socket.emit("media:sync", store.getEffectiveMedia(room.currentMedia));
  });

  const updateMedia = async (action: "play" | "pause" | "seek" | "rate", rawInput: unknown) => {
    const parsed = mediaCommandSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    if (!canControl(parsed.data.roomId, user.id)) {
      socket.emit("server:error", "Você não tem permissão para controlar a reprodução.");
      const room = store.getRoom(parsed.data.roomId);
      if (room) socket.emit("media:sync", store.getEffectiveMedia(room.currentMedia));
      return;
    }
    const media = store.updateMedia(parsed.data.roomId, user.id, action, parsed.data.position, parsed.data);
    if (media && action === "play" && !await persistMediaForSocket(parsed.data.roomId, socket)) return;
    if (media) { io.to(parsed.data.roomId).emit("media:sync", media); if (action === "play") { const snapshot = store.getSnapshot(parsed.data.roomId); if (snapshot) io.to(parsed.data.roomId).emit("queue:history", snapshot.history); emitMediaHubUpdate(parsed.data.roomId, "history"); } }
    else { const room = store.getRoom(parsed.data.roomId); if (room) socket.emit("media:sync", store.getEffectiveMedia(room.currentMedia)); }
  };
  socket.on(eventNames.mediaPlay, (input) => updateMedia("play", input));
  socket.on(eventNames.mediaPause, (input) => updateMedia("pause", input));
  socket.on(eventNames.mediaSeek, (input) => updateMedia("seek", input));
  socket.on(eventNames.mediaRate, (input) => updateMedia("rate", input));

  socket.on(eventNames.mediaChange, async (rawInput, respond) => {
    const parsed = changeMediaSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !canControl(parsed.data.roomId, user.id)) return respond?.({ ok: false, message: "Você não pode controlar a reprodução." });
    const room = store.getRoom(parsed.data.roomId);
    const item = room?.queue.find((candidate) => candidate.id === parsed.data.item.id);
    if (!item) return respond?.({ ok: false, message: "Adicione a mídia à fila antes de reproduzir." });
    if (!mediaAvailableInRoom(parsed.data.roomId, item)) return respond?.({ ok: false, message: "Esta mídia está indisponível. Peça ao proprietário para adicioná-la novamente." });
    const changed = store.changeMedia(parsed.data.roomId, item);
    const media = changed ? store.updateMedia(parsed.data.roomId, user.id, "play", 0) : null;
    if (media && !await persistMediaForSocket(parsed.data.roomId, socket)) return respond?.({ ok: false, message: "Mídia indisponível no momento." });
    if (media) { io.to(parsed.data.roomId).emit("media:sync", media); const snapshot = store.getSnapshot(parsed.data.roomId); if (snapshot) io.to(parsed.data.roomId).emit("queue:history", snapshot.history); emitMediaHubUpdate(parsed.data.roomId, "history"); emitSnapshot(parsed.data.roomId); }
    respond?.({ ok: Boolean(media), message: media ? undefined : "Não foi possível reproduzir esta mídia." });
  });

  socket.on(eventNames.voteSkip, async (rawInput) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const beforeRevision = store.getQueueRevision(parsed.data.roomId);
    const vote = store.voteSkip(parsed.data.roomId, user.id, (item) => mediaAvailableInRoom(parsed.data.roomId, item));
    if (!vote) return;
    if ((vote.next || store.getQueueRevision(parsed.data.roomId) !== beforeRevision) && !await persistMediaForSocket(parsed.data.roomId, socket)) return;
    io.to(parsed.data.roomId).emit("vote:skip", { count: vote.count, required: vote.required, votedBy: vote.votedBy, advanced: vote.advanced });
    if (vote.next) { emitQueueState(parsed.data.roomId, vote.next); io.to(parsed.data.roomId).emit("media:sync", vote.next.media); }
    else if (store.getQueueRevision(parsed.data.roomId) !== beforeRevision) { const snapshot = store.getSnapshot(parsed.data.roomId); if (snapshot) io.to(parsed.data.roomId).emit("queue:update", snapshot.queue, snapshot.queueRevision); }
  });

  socket.on(eventNames.presenceUpdate, (rawInput) => {
    const parsed = presenceInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const input = { ...parsed.data, speaking: parsed.data.speaking && !parsed.data.muted && !parsed.data.deafened && callSockets.isJoined(parsed.data.roomId, user.id, socket.id) };
    const snapshot = store.updatePresence(parsed.data.roomId, user.id, input);
    if (snapshot) io.to(parsed.data.roomId).emit("presence:update", snapshot.members);
  });

  socket.on(eventNames.reactionSend, (input) => {
    const parsed = z.object({ roomId: z.string(), emoji: z.string().min(1).max(4) }).safeParse(input);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    const lastReactionAt = Number(socket.data.lastReactionAt ?? 0);
    if (Date.now() - lastReactionAt < 350) return;
    socket.data.lastReactionAt = Date.now();
    io.to(parsed.data.roomId).emit("reaction:send", { id: crypto.randomUUID(), emoji: parsed.data.emoji, user: publicUser(user) });
  });

  socket.on(eventNames.voiceSignal, (rawInput) => {
    const parsed = voiceSignalSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return;
    if (!callSockets.canSignal(joinedRoomId, user.id, socket.id, parsed.data.targetUserId, parsed.data.targetSocketId)) return;
    io.to(parsed.data.targetSocketId).emit("voice:signal", { fromUserId: user.id, fromSocketId: socket.id, signal: parsed.data.signal });
  });

  socket.on(eventNames.voiceJoin, (input, respond) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(input);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return respond?.({ ok: false, message: "Party indisponível." });
    const house = social.getByRoom(parsed.data.roomId);
    if (!house || !can(social.role(house.id, user.id), "CALL_JOIN")) return respond?.({ ok: false, message: "Você não tem permissão para entrar na call." });
    const joined = callSockets.join(parsed.data.roomId, user.id, socket.id, (id) => io.sockets.sockets.has(id));
    if (!joined.ok) return respond?.({ ok: false, message: "A call já está aberta em outra aba." });
    if (joined.alreadyJoined) return respond?.({ ok: true });
    for (const [, peerSocketId] of joined.peers) {
      const peer = io.sockets.sockets.get(peerSocketId);
      if (peer) socket.emit("voice:peer-joined", { user: publicUser(peer.data.user as User), socketId: peerSocketId });
    }
    respond?.({ ok: true });
    socket.to(parsed.data.roomId).emit("voice:peer-joined", { user: publicUser(user), socketId: socket.id });
    social.setPresence(house.id, user.id, "ONLINE", { inCall: true }); emitHouse(house.id);
  });
  socket.on(eventNames.voiceLeave, (input) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(input);
    if (parsed.success && parsed.data.roomId === joinedRoomId) leaveCall(parsed.data.roomId, user, socket.id);
  });
  socket.on(eventNames.voiceSpeaking, (rawInput) => {
    const parsed = presenceInputSchema.safeParse(rawInput);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || !callSockets.isJoined(parsed.data.roomId, user.id, socket.id)) return;
    const input = { ...parsed.data, speaking: parsed.data.speaking && !parsed.data.muted && !parsed.data.deafened };
    const snapshot = store.updatePresence(parsed.data.roomId, user.id, input);
    if (snapshot) io.to(parsed.data.roomId).emit("presence:update", snapshot.members);
    const house = social.getByRoom(parsed.data.roomId); if (house) { social.setPresence(house.id, user.id, "ONLINE", { inCall: true, speaking: input.speaking }); emitHouse(house.id); }
  });

  socket.on(eventNames.screenStart, (input, respond) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(input);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId) return respond?.({ ok: false, message: "Party inválida." });
    const house = social.getByRoom(parsed.data.roomId);
    if (!house || !can(social.role(house.id, user.id), "SCREEN_SHARE")) return respond?.({ ok: false, message: "Você não tem permissão para compartilhar a tela." });
    const callSocketId = callSockets.socketFor(parsed.data.roomId, user.id);
    if (callSocketId && callSocketId !== socket.id) return respond?.({ ok: false, message: "A call já está aberta em outra aba." });
    if (screenOwnerSockets.has(parsed.data.roomId) && screenOwnerSockets.get(parsed.data.roomId) !== socket.id) return respond?.({ ok: false, message: "Já existe um compartilhamento de tela ativo." });
    const result = store.startScreenShare(parsed.data.roomId, user);
    if (result.ok) screenOwnerSockets.set(parsed.data.roomId, socket.id);
    respond?.({ ok: result.ok, message: result.ok ? undefined : result.message });
    if (result.ok) io.to(parsed.data.roomId).emit("screen:state", result.state && { ...result.state, user: publicUser(result.state.user) });
    if (result.ok) { social.setPresence(house.id, user.id, "ONLINE", { screenSharing: true }); emitHouse(house.id); }
  });

  socket.on(eventNames.screenStop, (input) => {
    const parsed = z.object({ roomId: z.string() }).safeParse(input);
    if (!parsed.success || parsed.data.roomId !== joinedRoomId || screenOwnerSockets.get(parsed.data.roomId) !== socket.id || !store.stopScreenShare(parsed.data.roomId, user.id)) return;
    screenOwnerSockets.delete(parsed.data.roomId);
    io.to(parsed.data.roomId).emit("screen:state", null);
    const house = social.getByRoom(parsed.data.roomId); if (house) { social.setPresence(house.id, user.id, "ONLINE", { screenSharing: false }); emitHouse(house.id); }
  });

  socket.on("disconnect", () => {
    if (shuttingDown) return;
    log("info", "socket_disconnected", { userId: user.id, connectionId: socket.id, roomId: joinedRoomId ?? "none", activeSockets: io.engine.clientsCount });
    homeStateBySocket.delete(socket.id);
    const userSockets = activeUserSockets.get(user.id); userSockets?.delete(socket.id);
    if (!userSockets?.size) { activeUserSockets.delete(user.id); const prior = accountOfflineTimers.get(user.id); if (prior) clearTimeout(prior); accountOfflineTimers.set(user.id, setTimeout(() => { if (activeUserSockets.has(user.id)) return; refreshAccountPresence(user.id, "OFFLINE"); void persistLastSeen(user.id).catch(() => log("warn", "last_seen_write_failed", { userId: user.id })); accountOfflineTimers.delete(user.id); }, 5_000)); }
    if (socket.data.deletedHouseRoomId === joinedRoomId) return;
    if (!joinedRoomId) return;
    const roomId = joinedRoomId; leaveCall(roomId, user, socket.id);
    const wasSharing = screenOwnerSockets.get(roomId) === socket.id; const house = social.getByRoom(roomId);
    if (wasSharing) { screenOwnerSockets.delete(roomId); store.stopScreenShare(roomId, user.id); io.to(roomId).emit("screen:state", null); if (house) { social.setPresence(house.id, user.id, "ONLINE", { screenSharing: false }); emitHouse(house.id); } }
    const remaining = unregisterConnection(roomId, user.id, socket.id); if (remaining) return;
    const key = `${roomId}:${user.id}`; offlineTimers.set(key, setTimeout(() => { if ((roomConnections.get(roomId)?.get(user.id)?.size ?? 0) > 0) return; store.removeMember(roomId, user.id); if (house) { social.setPresence(house.id, user.id, activeUserSockets.has(user.id) ? "ONLINE" : "OFFLINE", { inParty: false, inCall: false, speaking: false, screenSharing: false }); emitHouse(house.id); } emitSnapshot(roomId); offlineTimers.delete(key); }, 5_000));
  });
});

const boot = async () => {
  try {
    if (db && authRepository && socialRepository) {
      await db.$connect(); await authRepository.load(); await googleDrive.initialize();
      for (const house of await socialRepository.load()) store.addHouseRoom(house);
      await mediaRepository?.load();
    }
    httpServer.listen(PORT, () => { log("info", "server_listening", { port: PORT }); });
  } catch {
    log("error", "server_boot_failed", { category: "PERSISTENCE_OR_CONFIGURATION" });
    await db?.$disconnect();
    process.exitCode = 1;
  }
};
void boot();
httpServer.on("error", (error) => { log("error", "server_listen_error", { code: "code" in error ? String(error.code) : "UNKNOWN" }); process.exitCode = 1; });

const shutdown = (signal: "SIGINT" | "SIGTERM") => {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "server_shutdown_start", { signal });
  for (const entries of activeDriveStreams.values()) for (const entry of entries) entry.controller.abort();
  for (const timer of [...offlineTimers.values(), ...accountOfflineTimers.values()]) clearTimeout(timer);
  offlineTimers.clear(); accountOfflineTimers.clear();
  io.disconnectSockets(true);
  const deadline = setTimeout(() => { log("error", "server_shutdown_timeout"); httpServer.closeAllConnections(); process.exitCode = 1; }, 5_000);
  deadline.unref();
  io.close(async () => {
    await authRepository?.drain();
    await socialRepository?.drain();
    await mediaRepository?.drain();
    await db?.$disconnect();
    clearTimeout(deadline);
    log("info", "server_shutdown_complete");
  });
};
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
