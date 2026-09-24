import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { userSchema, type User } from "@lumio/shared";

const emailKey = (email: string) => email.trim().toLowerCase();
const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const passwordHash = (password: string, salt: string) => crypto.scryptSync(password, salt, 32).toString("hex");
const legacyFileSchema = z.object({
  version: z.literal(1),
  users: z.array(z.object({ user: userSchema, password: z.string().nullable(), google: z.object({ sub: z.string(), email: z.string().email() }).nullable() })),
  sessions: z.array(z.object({ hash: z.string().length(64), userId: z.string(), expiresAt: z.number(), authenticatedAt: z.number() })),
});
const tokenRecordSchema = z.object({ hash: z.string().length(64), userId: z.string(), purpose: z.enum(["EMAIL_VERIFICATION", "PASSWORD_RESET"]), createdAt: z.number(), expiresAt: z.number() });
const fileSchema = z.object({
  version: z.literal(2),
  users: z.array(legacyFileSchema.shape.users.element.extend({ emailVerifiedAt: z.number().nullable() })),
  sessions: legacyFileSchema.shape.sessions,
  tokens: z.array(tokenRecordSchema),
});
type UserRecord = z.infer<typeof fileSchema>["users"][number];
type SessionRecord = z.infer<typeof fileSchema>["sessions"][number];
type TokenRecord = z.infer<typeof tokenRecordSchema>;
export type GoogleIdentity = { sub: string; email: string; name?: string; picture?: string };
export type AuthConflict = "EMAIL_EXISTS" | "GOOGLE_IN_USE" | "NO_PASSWORD" | "LAST_METHOD" | "NOT_LINKED" | "WRONG_PASSWORD";
export class AuthError extends Error { constructor(public readonly code: AuthConflict) { super(code); } }

/** Local development adapter. Single-process writes are atomic; production needs a database. */
export class AuthStore {
  private readonly users = new Map<string, UserRecord>();
  private readonly emails = new Map<string, string>();
  private readonly googleSubjects = new Map<string, string>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly tokens = new Map<string, TokenRecord>();
  private readonly colors = ["#f7c98b", "#b8d7c0", "#d6b3e6", "#95b6d5", "#edaa8b", "#e6d392"];
  constructor(private readonly file = path.resolve(process.cwd(), "../../.data/auth-v2.json"), private readonly ttlDays = Number(process.env.SESSION_TTL_DAYS ?? 14)) {
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { version?: number };
    if (raw.version === 1 && process.env.NODE_ENV === "production") throw new Error("Migração de contas legadas exige revisão explícita em produção.");
    // Explicit local-adapter migration: existing development accounts retain access.
    // New email/password accounts always start unverified.
    const data = raw.version === 1 ? (() => {
      const legacy = legacyFileSchema.parse(raw);
      return fileSchema.parse({ version: 2, users: legacy.users.map((record) => ({ ...record, emailVerifiedAt: Date.now() })), sessions: legacy.sessions, tokens: [] });
    })() : fileSchema.parse(raw);
    for (const record of data.users) {
      this.users.set(record.user.id, record);
      if (record.user.email) this.emails.set(emailKey(record.user.email), record.user.id);
      if (record.google) this.googleSubjects.set(record.google.sub, record.user.id);
    }
    for (const session of data.sessions) if (session.expiresAt > Date.now() && this.users.has(session.userId)) this.sessions.set(session.hash, session);
    for (const token of data.tokens) if (token.expiresAt > Date.now() && this.users.has(token.userId)) this.tokens.set(token.hash, token);
    if (raw.version === 1) this.save();
  }
  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ version: 2, users: [...this.users.values()], sessions: [...this.sessions.values()], tokens: [...this.tokens.values()] }), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
  getUser(id: string) { return this.users.get(id)?.user; }
  getByEmail(email: string) { const id = this.emails.get(emailKey(email)); return id ? this.getUser(id) : undefined; }
  getIdentity(userId: string) { return this.users.get(userId)?.google ?? null; }
  hasPassword(userId: string) { return Boolean(this.users.get(userId)?.password); }
  isVerified(userId: string) { return Boolean(this.users.get(userId)?.emailVerifiedAt); }
  createLocal(displayName: string, email: string, password: string): User {
    const normalized = emailKey(email);
    if (this.emails.has(normalized)) throw new AuthError("EMAIL_EXISTS");
    const user: User = { id: crypto.randomUUID(), displayName: displayName.trim().slice(0, 32), email: normalized, color: this.colors[this.users.size % this.colors.length] };
    const salt = crypto.randomBytes(16).toString("hex");
    this.users.set(user.id, { user, password: `${salt}:${passwordHash(password, salt)}`, google: null, emailVerifiedAt: null });
    this.emails.set(normalized, user.id); this.save(); return user;
  }
  login(email: string, password: string) {
    const user = this.getByEmail(email), record = user && this.users.get(user.id)?.password;
    if (!user || !record) return undefined;
    const [salt, expected] = record.split(":");
    const actual = passwordHash(password, salt);
    return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected)) ? user : undefined;
  }
  loginGoogle(identity: GoogleIdentity): { user: User; created: boolean } {
    const existingId = this.googleSubjects.get(identity.sub);
    if (existingId) return { user: this.users.get(existingId)!.user, created: false };
    const normalized = emailKey(identity.email);
    if (this.emails.has(normalized)) throw new AuthError("EMAIL_EXISTS");
    const user: User = { id: crypto.randomUUID(), displayName: (identity.name?.trim() || normalized.split("@")[0]).slice(0, 32), email: normalized, avatar: identity.picture, color: this.colors[this.users.size % this.colors.length] };
    this.users.set(user.id, { user, password: null, google: { sub: identity.sub, email: normalized }, emailVerifiedAt: Date.now() });
    this.emails.set(normalized, user.id); this.googleSubjects.set(identity.sub, user.id); this.save(); return { user, created: true };
  }
  linkGoogle(userId: string, identity: GoogleIdentity) {
    const record = this.users.get(userId);
    if (!record) return undefined;
    const ownerId = this.googleSubjects.get(identity.sub);
    if (ownerId && ownerId !== userId) throw new AuthError("GOOGLE_IN_USE");
    const emailOwnerId = this.emails.get(emailKey(identity.email));
    if (emailOwnerId && emailOwnerId !== userId) throw new AuthError("EMAIL_EXISTS");
    if (record.google && record.google.sub !== identity.sub) throw new AuthError("GOOGLE_IN_USE");
    record.google = { sub: identity.sub, email: emailKey(identity.email) };
    this.googleSubjects.set(identity.sub, userId); this.save(); return record.user;
  }
  unlinkGoogle(userId: string, password: string) {
    const record = this.users.get(userId);
    if (!record?.google) throw new AuthError("NOT_LINKED");
    if (!record.password) throw new AuthError("LAST_METHOD");
    if (!record.user.email || !this.login(record.user.email, password)) throw new AuthError("WRONG_PASSWORD");
    this.googleSubjects.delete(record.google.sub); record.google = null; this.save();
  }
  setPassword(userId: string, nextPassword: string, currentPassword?: string) {
    const record = this.users.get(userId);
    if (!record) return;
    if (record.password && (!record.user.email || !currentPassword || !this.login(record.user.email, currentPassword))) throw new AuthError("WRONG_PASSWORD");
    const salt = crypto.randomBytes(16).toString("hex"); record.password = `${salt}:${passwordHash(nextPassword, salt)}`; this.save();
  }
  saveProfile(userId: string) { if (this.users.has(userId)) this.save(); }
  issueToken(userId: string, purpose: TokenRecord["purpose"], ttlMs: number, cooldownMs: number) {
    if (!this.users.has(userId)) return null;
    const now = Date.now();
    for (const record of this.tokens.values()) if (record.userId === userId && record.purpose === purpose && now - record.createdAt < cooldownMs) return null;
    for (const [hash, record] of this.tokens) if (record.userId === userId && record.purpose === purpose) this.tokens.delete(hash);
    const token = crypto.randomBytes(32).toString("base64url");
    this.tokens.set(tokenHash(token), { hash: tokenHash(token), userId, purpose, createdAt: now, expiresAt: now + ttlMs });
    this.save(); return token;
  }
  consumeVerification(token: string) {
    const hash = tokenHash(token), record = this.tokens.get(hash);
    if (!record || record.purpose !== "EMAIL_VERIFICATION" || record.expiresAt <= Date.now()) return false;
    const user = this.users.get(record.userId);
    if (!user || user.emailVerifiedAt) return false;
    this.tokens.delete(hash); user.emailVerifiedAt = Date.now(); this.save(); return true;
  }
  consumePasswordReset(token: string, nextPassword: string) {
    const hash = tokenHash(token), record = this.tokens.get(hash);
    if (!record || record.purpose !== "PASSWORD_RESET" || record.expiresAt <= Date.now()) return null;
    const user = this.users.get(record.userId);
    if (!user?.password) return null;
    this.tokens.delete(hash);
    const salt = crypto.randomBytes(16).toString("hex");
    user.password = `${salt}:${passwordHash(nextPassword, salt)}`;
    for (const [sessionHash, session] of this.sessions) if (session.userId === record.userId) this.sessions.delete(sessionHash);
    this.save(); return record.userId;
  }
  createSession(userId: string) {
    if (!this.users.has(userId)) throw new Error("Usuário ausente.");
    if (!this.isVerified(userId)) throw new Error("E-mail não confirmado.");
    const token = crypto.randomBytes(32).toString("hex"), now = Date.now();
    const days = Number.isFinite(this.ttlDays) ? Math.max(1, Math.min(this.ttlDays, 30)) : 14;
    this.sessions.set(tokenHash(token), { hash: tokenHash(token), userId, authenticatedAt: now, expiresAt: now + days * 86_400_000 });
    this.save(); return token;
  }
  resolveSession(token: string) {
    const record = this.sessions.get(tokenHash(token));
    if (!record) return undefined;
    if (record.expiresAt < Date.now()) { this.sessions.delete(record.hash); this.save(); return undefined; }
    const user = this.getUser(record.userId);
    return user ? { user, authenticatedAt: record.authenticatedAt } : undefined;
  }
  revokeSession(token: string) { if (this.sessions.delete(tokenHash(token))) this.save(); }
  revokeOtherSessions(userId: string, currentToken: string) {
    const keep = tokenHash(currentToken); let changed = false;
    for (const [hash, session] of this.sessions) if (session.userId === userId && hash !== keep) { this.sessions.delete(hash); changed = true; }
    if (changed) this.save();
  }
}
