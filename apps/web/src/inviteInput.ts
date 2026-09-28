export function parseInviteInput(value: string, origin: string): string | null {
  const input = value.trim();
  if (!input || input.length > 2048) return null;
  let identifier = input;
  try {
    if (/^(https?:\/\/|\/invite\/)/i.test(input)) {
      const url = new URL(input, origin);
      if (url.origin !== origin || !url.pathname.startsWith("/invite/")) return null;
      identifier = decodeURIComponent(url.pathname.slice(8));
    }
  } catch { return null; }
  const code = identifier.replace(/[\s-]/g, "").toUpperCase();
  if (/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/.test(code)) return code;
  return /^[A-Za-z0-9_-]{20,128}$/.test(identifier) ? identifier : null;
}
