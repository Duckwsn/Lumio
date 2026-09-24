import { useEffect, useRef, useState } from "react";
import type { User } from "@lumio/shared";

type GoogleApi = { accounts: { id: { initialize: (options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void; auto_select: boolean }) => void; renderButton: (element: HTMLElement, options: Record<string, string>) => void } } };
declare global { interface Window { google?: GoogleApi } }
let scriptPromise: Promise<void> | undefined;
function loadGoogleScript() {
  if (window.google) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true;
    script.onload = () => resolve(); script.onerror = () => { scriptPromise = undefined; reject(new Error("Não foi possível carregar o Google Login.")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function GoogleIdentityButton({ apiUrl, mode, token, linkPassword, onLogin, onLinked }: { apiUrl: string; mode: "login" | "link"; token?: string; linkPassword?: string; onLogin?: (session: { user: User; token: string }) => void; onLinked?: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onLogin, onLinked }); handlers.current = { onLogin, onLinked };
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/auth/google/challenge`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ mode, ...(mode === "link" ? { password: linkPassword } : {}) }) });
        const data = await response.json() as { clientId?: string; nonce?: string; message?: string };
        if (!response.ok || !data.clientId || !data.nonce) throw new Error(data.message ?? "Google Login indisponível.");
        await loadGoogleScript();
        if (!active || !holder.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: data.clientId, nonce: data.nonce, auto_select: false, callback: async ({ credential }) => {
          if (!active || !credential) return;
          setBusy(true); setMessage("");
          try {
            const result = await fetch(`${apiUrl}/api/auth/google/verify`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ credential, nonce: data.nonce }) });
            const body = await result.json() as { user?: User; token?: string; linked?: boolean; message?: string };
            if (!result.ok) throw new Error(body.message ?? "Não foi possível entrar com Google.");
            if (mode === "login" && body.user && body.token) handlers.current.onLogin?.({ user: body.user, token: body.token });
            else if (mode === "link" && body.linked) handlers.current.onLinked?.();
          } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "Não foi possível entrar com Google."); }
          finally { if (active) setBusy(false); }
        } });
        holder.current.replaceChildren();
        window.google.accounts.id.renderButton(holder.current, { theme: "outline", size: "large", text: mode === "link" ? "continue_with" : "continue_with", shape: "pill", width: "280", locale: "pt-BR" });
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "Google Login indisponível."); }
    };
    void start(); return () => { active = false; };
  }, [apiUrl, mode, token]);
  return <div className="google-identity"><div ref={holder} aria-label={mode === "link" ? "Vincular conta Google" : "Continuar com Google"} />{busy ? <small>Confirmando sua identidade…</small> : null}{message ? <p className="form-error" role="alert">{message}</p> : null}</div>;
}
