import crypto from "node:crypto";

const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function normalizeInviteCode(value: string): string | null {
  if (value.length > 64) return null;
  const code = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/.test(code) ? code : null;
}
export const inviteCodeHash = (code: string) => crypto.createHash("sha256").update(`invite-code:v1:${code}`).digest("hex");
export function generateInviteCode() {
  const code = Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}
