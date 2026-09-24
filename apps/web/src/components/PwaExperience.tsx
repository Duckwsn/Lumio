import { useEffect, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { LumioLogo } from "./LumioLogo";
import { resolvePwaInstallState } from "../pwaInstallState";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installPrompt: InstallPromptEvent | null = null;
let installedInSession = false;
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
  window.addEventListener("appinstalled", () => { installPrompt = null; installedInSession = true; notify(); });
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
  return { canInstall: Boolean(installPrompt) && !isInstalled() && !installedInSession, installed: isInstalled() || installedInSession, updateReady: Boolean(waitingWorker) };
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

export function PwaInstallShowcase() {
  const { canInstall, installed } = usePwaState();
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const state = resolvePwaInstallState(canInstall, installed, appleMobile);
  const startInstall = () => {
    const prompt = installPrompt;
    installPrompt = null;
    notify();
    if (prompt) void prompt.prompt().then(() => prompt.userChoice).catch(() => undefined);
  };
  return <section className="landing-install" aria-labelledby="landing-install-title"><div className="landing-container landing-install-inner"><span className="landing-install-logo"><LumioLogo /></span><div className="landing-install-copy"><h2 id="landing-install-title">Leve o Lumio com você.</h2><p>Abra sua Casa direto do dispositivo, sempre que a turma se reunir. Para assistir e conversar, você ainda precisa de internet.</p></div>{state === "available" ? <button className="landing-button" type="button" onClick={startInstall}><ArrowDownToLine size={17} /> Instalar Lumio</button> : <span className="landing-install-note">{state === "installed" ? "Lumio já está instalado neste dispositivo." : state === "ios" ? "No Safari: Compartilhar → Adicionar à Tela de Início." : "O botão aparece aqui quando o navegador permite. No Chrome para Android, procure Instalar no menu ⋮."}</span>}</div></section>;
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
