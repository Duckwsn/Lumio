/** Only same-origin relative destinations are allowed after authentication. */
export function safeAuthDestination(value: string | null, origin: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !["/login", "/register", "/"].includes(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : "/app";
  } catch { return "/app"; }
}
