import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { usePartyGameChat } from "../games/PartyGameChat";

/** Same composer and Party-owned drafts, including the fullscreen surface. */
export function PartyComposer({ onSend, onTyping, accessory }: { onSend: (text: string) => boolean; onTyping: (typing: boolean) => void; accessory?: ReactNode }) {
  const context = usePartyGameChat(), id = useId();
  const [fallback, setFallback] = useState("");
  const draft = context?.draft ?? fallback, mode = context?.mode ?? "chat";
  const typingSent = useRef(false), timer = useRef<number>(), typing = useRef(onTyping); typing.current = onTyping;
  const stopTyping = () => { window.clearTimeout(timer.current); if (typingSent.current) typing.current(false); typingSent.current = false; };
  useEffect(() => { stopTyping(); return stopTyping; }, [mode]);
  const change = (value: string) => {
    if (context) context.changeDraft(value); else setFallback(value);
    if (mode === "guess") return;
    if (value.trim() && !typingSent.current) { typing.current(true); typingSent.current = true; }
    if (!value.trim()) stopTyping();
    window.clearTimeout(timer.current); if (value.trim()) timer.current = window.setTimeout(stopTyping, 1400);
  };
  return <div className="party-composer">
    {context?.eligible ? <div className="composer-modes" role="group" aria-label="Modo de envio"><button type="button" aria-pressed={mode === "guess"} onClick={() => context.changeMode("guess")}>Palpitar</button><button type="button" aria-pressed={mode === "chat"} onClick={() => context.changeMode("chat")}>Conversar</button><span>{mode === "guess" ? "Palpite do jogo" : "Mensagem da Party"}</span></div> : null}
    {context?.error ? <p className="composer-error" role="alert">{context.error}</p> : null}
    <form className={`chat-form ${mode === "guess" ? "guess-mode" : ""}`} onSubmit={async (event) => {
      event.preventDefault(); if (!draft.trim()) return;
      const sentMode = mode, text = draft;
      const ok = sentMode === "guess" ? await context?.sendGuess(text) : onSend(text);
      if (ok) { if (context) context.clearDraft(sentMode, text); else setFallback(""); stopTyping(); }
    }}>{accessory}<label className="sr-only" htmlFor={id}>{mode === "guess" ? "Seu palpite" : "Mensagem"}</label><input id={id} name="message" autoComplete="off" value={draft} maxLength={mode === "guess" ? 80 : 2000} onChange={(event) => change(event.target.value)} placeholder={mode === "guess" ? "Digite seu palpite…" : "Escreva uma mensagem…"} /><button disabled={!draft.trim() || Boolean(context?.busy)} aria-label={mode === "guess" ? "Enviar palpite" : "Enviar mensagem"}><Send /></button></form>
  </div>;
}
