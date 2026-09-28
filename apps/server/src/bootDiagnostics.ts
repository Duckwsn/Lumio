export type BootStage = "PRISMA_CONNECT" | "AUTH_RESTORE" | "DRIVE_RESTORE" | "HOUSE_RESTORE" | "ROOM_RESTORE" | "MEDIA_RESTORE" | "HTTP_LISTEN";

// Allowlists, not regex redaction: arbitrary exception messages, stack, meta,
// URLs and even custom names/codes can contain credentials or private data.
const names = new Set(["Error", "TypeError", "SyntaxError", "RangeError", "ZodError", "PrismaClientInitializationError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "PrismaClientValidationError", "PrismaClientRustPanicError"]);
const codes: Record<string, string> = {
  P1000: "Database authentication failed.", P1001: "Database unreachable.", P1002: "Database connection timed out.",
  P1003: "Database does not exist.", P1008: "Database operation timed out.", P1009: "Database already exists.",
  P1010: "Database access denied.", P1011: "Database TLS connection failed.", P1012: "Prisma configuration validation failed.",
  P1013: "Database connection string invalid.", P1014: "Underlying database object missing.", P1015: "Database version unsupported.",
  P1016: "Incorrect raw query parameter count.", P1017: "Database connection closed.",
  P2021: "Expected database table missing.", P2022: "Expected database column missing.", P2023: "Inconsistent persisted column data.",
  P2024: "Database connection pool timed out.", P2025: "Required database record missing.", P2037: "Too many database connections.",
  EADDRINUSE: "HTTP port already in use.", EACCES: "HTTP listen permission denied.", ECONNREFUSED: "Connection refused.",
  ETIMEDOUT: "Connection timed out.", ENOTFOUND: "Host resolution failed.", ECONNRESET: "Connection reset.",
};
const messages = new Set([
  "GOOGLE_TOKEN_ENCRYPTION_KEY ausente ou inválida para o cofre PostgreSQL.",
  "Chave de criptografia do Drive ausente.",
  "O cofre de tokens do Google Drive não pôde ser aberto. Verifique a chave de criptografia.",
  "Casa sem exatamente uma Party persistida.", "Membro de Casa sem usuário.", "Convite sem criador.",
  "Mídia referencia usuário ausente.", "Favorito sem mídia.", "Playlist sem mídia.",
]);
function detail(error: unknown): Record<string, string> {
  const value = error instanceof Error ? error as Error & { code?: unknown; errorCode?: unknown } : undefined;
  const rawCode = value?.code ?? value?.errorCode;
  const errorCode = typeof rawCode === "string" && Object.hasOwn(codes, rawCode) ? rawCode : "UNKNOWN";
  return {
    errorName: value && names.has(value.name) ? value.name : "UnknownError",
    errorCode,
    ...(errorCode.startsWith("P") ? { prismaCode: errorCode } : {}),
    safeMessage: errorCode !== "UNKNOWN" ? codes[errorCode] : value && messages.has(value.message) ? value.message : "Error details withheld; inspect boot stage and error type.",
  };
}
export function bootFailureFields(bootStage: BootStage, error: unknown): Record<string, string> {
  const fields = { bootStage, ...detail(error) };
  if (error instanceof Error && error.cause !== undefined) {
    const cause = detail(error.cause);
    return { ...fields, causeName: cause.errorName, causeCode: cause.errorCode, safeCause: cause.safeMessage };
  }
  return fields;
}
