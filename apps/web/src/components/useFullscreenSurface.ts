import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Fullscreen belongs to a persistent Lumio surface, never a provider iframe. */
export function useFullscreenSurface(targetRef: RefObject<HTMLElement>) {
  const [fullscreen, setFullscreen] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const orientationLocked = useRef(false);
  const toggleFullscreen = useCallback(() => {
    setFullscreenError("");
    if (fallbackFullscreen) { setFallbackFullscreen(false); return; }
    const target = targetRef.current;
    if (!target) return;
    if (document.fullscreenElement === target) { void document.exitFullscreen().catch(() => setFullscreenError("Não foi possível sair da tela cheia.")); return; }
    if (typeof target.requestFullscreen !== "function" || !document.fullscreenEnabled) { setFallbackFullscreen(true); return; }
    void target.requestFullscreen().then(async () => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: "landscape") => Promise<void> };
      if (window.matchMedia("(pointer: coarse) and (max-width: 900px)").matches && typeof orientation?.lock === "function") {
        try { await orientation.lock("landscape"); if (document.fullscreenElement === target) orientationLocked.current = true; else orientation.unlock(); }
        catch { /* Browser may require manual rotation. */ }
      }
    }).catch(() => setFullscreenError("O navegador não permitiu a tela cheia. Tente novamente pelo botão."));
  }, [fallbackFullscreen, targetRef]);
  useEffect(() => {
    const target = targetRef.current;
    const changed = () => { const active = document.fullscreenElement === target; setFullscreen(active); if (!active && orientationLocked.current) { screen.orientation.unlock(); orientationLocked.current = false; } };
    const failed = () => setFullscreenError("O navegador não permitiu a tela cheia.");
    document.addEventListener("fullscreenchange", changed); target?.addEventListener("fullscreenerror", failed);
    return () => { document.removeEventListener("fullscreenchange", changed); target?.removeEventListener("fullscreenerror", failed); if (orientationLocked.current) screen.orientation.unlock(); };
  }, [targetRef]);
  return { fullscreen, fallbackFullscreen, fullscreenError, toggleFullscreen, setFallbackFullscreen };
}
