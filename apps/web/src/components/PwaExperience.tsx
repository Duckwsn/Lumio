import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installPrompt: InstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let applyingUpdateRequested = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function registerPwa() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => { installPrompt = null; notify(); });
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      const inspect = () => { waitingWorker = registration.waiting; notify(); };
      inspect();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", inspect);
      });
      const checkUpdate = () => { if (document.visibilityState === "visible") void registration.update().catch(() => undefined); };
      document.addEventListener("visibilitychange", checkUpdate);
      window.setInterval(checkUpdate, 60 * 60_000);
    }).catch(() => undefined);
  }, { once: true });
}

function usePwaState() {
  const [, setVersion] = useState(0);
  useEffect(() => { const listener = () => setVersion((version) => version + 1); listeners.add(listener); return () => { listeners.delete(listener); }; }, []);
  return { canInstall: Boolean(installPrompt) && !isInstalled(), updateReady: Boolean(waitingWorker) };
}

export function PwaInstallAction() {
  const { canInstall } = usePwaState();
  if (!canInstall) {
    const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return appleMobile && !isInstalled() ? <span className="pwa-install-hint">No iPhone/iPad: Compartilhar → Adicionar à Tela de Início</span> : null;
  }
  return <button type="button" onClick={() => {
    const prompt = installPrompt;
    installPrompt = null;
    notify();
    if (prompt) void prompt.prompt().then(() => prompt.userChoice).catch(() => undefined);
  }}>Instalar Lumio</button>;
}

export function PwaUpdateNotice() {
  const { updateReady } = usePwaState();
  if (!updateReady) return null;
  return <aside className="pwa-update" role="status"><span>Nova versão do Lumio disponível. Atualize quando terminar sua Party.</span><button type="button" onClick={() => { applyingUpdateRequested = true; waitingWorker?.postMessage({ type: "SKIP_WAITING" }); }}>Atualizar agora</button></aside>;
}

export function installPwaReloadHandler() {
  if (!("serviceWorker" in navigator)) return;
  let applyingUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (applyingUpdate || !applyingUpdateRequested) return;
    applyingUpdate = true;
    window.location.reload();
  });
}
