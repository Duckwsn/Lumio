export type PwaInstallState = "available" | "installed" | "ios" | "unsupported";

export function resolvePwaInstallState(canInstall: boolean, installed: boolean, appleMobile: boolean): PwaInstallState {
  if (installed) return "installed";
  if (canInstall) return "available";
  return appleMobile ? "ios" : "unsupported";
}
