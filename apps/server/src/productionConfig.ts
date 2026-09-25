/** Validation deliberately reports variable names, never values. */
export function validateProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;
  const required = ["DATABASE_URL", "CLIENT_ORIGIN", "APP_PUBLIC_URL", "API_PUBLIC_URL", "EMAIL_FROM", "RESEND_API_KEY"] as const;
  for (const name of required) if (!env[name]) throw new Error(`${name} obrigatório em produção.`);
  if (env.PERSISTENCE_MODE !== "postgres") throw new Error("PERSISTENCE_MODE deve ser postgres em produção.");
  if (env.EMAIL_PROVIDER !== "resend") throw new Error("EMAIL_PROVIDER deve ser resend em produção.");
  if (env.AUTH_SIGNUP_MODE === "google-only" && !env.GOOGLE_CLIENT_ID) throw new Error("AUTH_SIGNUP_MODE=google-only exige GOOGLE_CLIENT_ID.");
  let database: URL, app: URL, api: URL;
  try { database = new URL(env.DATABASE_URL!); app = new URL(env.APP_PUBLIC_URL!); api = new URL(env.API_PUBLIC_URL!); }
  catch { throw new Error("DATABASE_URL, APP_PUBLIC_URL ou API_PUBLIC_URL inválida."); }
  if (!["postgres:", "postgresql:"].includes(database.protocol)) throw new Error("DATABASE_URL deve apontar para PostgreSQL.");
  if (env.LUMIO_PRODUCTION_SMOKE !== "1" && ["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("DATABASE_URL local não é aceita em produção.");
  if (app.protocol !== "https:" || app.origin !== app.href.replace(/\/$/, "")) throw new Error("APP_PUBLIC_URL deve ser uma origem HTTPS.");
  if (api.protocol !== "https:" || api.origin !== api.href.replace(/\/$/, "")) throw new Error("API_PUBLIC_URL deve ser uma origem HTTPS.");
  const origins = env.CLIENT_ORIGIN!.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (!origins.includes(app.origin) || origins.some((origin) => { try { const url = new URL(origin); return url.protocol !== "https:" || url.origin !== origin; } catch { return true; } })) throw new Error("CLIENT_ORIGIN deve conter apenas origens HTTPS explícitas, incluindo APP_PUBLIC_URL.");
  if (env.GOOGLE_CLIENT_SECRET || env.GOOGLE_REDIRECT_URI || env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI || !/^[a-f0-9]{64}$/i.test(env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "")) throw new Error("Configuração Google Drive incompleta.");
    if (env.GOOGLE_REDIRECT_URI !== `${api.origin}/api/google-drive/oauth/callback`) throw new Error("GOOGLE_REDIRECT_URI deve usar API_PUBLIC_URL.");
  }
  if (env.RTC_TURN_URLS && (!env.RTC_TURN_USERNAME || !env.RTC_TURN_CREDENTIAL)) throw new Error("RTC_TURN_URLS exige usuário e credencial TURN.");
}
