import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { usePartyGameChat } from "../games/PartyGameChat";

/** Same composer and Party-owned drafts, including the fullscreen surface. */
export function PartyComposer({ onSend, onTyping, accessory }: { onSend: (text: string) => boolean; onTyping: (typing: boolean) => void; accessory?: ReactNode }) {
  const context = usePartyGameChat(), id = useId();
  const [fallback, setFallback] = useState("");
  const draft = context?.draft ?? fallback, guessing = Boolean(context?.eligible);
  const typingSent = useRef(false), timer = useRef<number>(), typing = useRef(onTyping); typing.current = onTyping;
  const stopTyping = () => { window.clearTimeout(timer.current); if (typingSent.current) typing.current(false); typingSent.current = false; };
  useEffect(() => { stopTyping(); return stopTyping; }, [guessing]);
  const change = (value: string) => {
    if (context) context.changeDraft(value); else setFallback(value);
    if (guessing) return;
    if (value.trim() && !typingSent.current) { typing.current(true); typingSent.current = true; }
    if (!value.trim()) stopTyping();
    window.clearTimeout(timer.current); if (value.trim()) timer.current = window.setTimeout(stopTyping, 1400);
  };
  return <div className="party-composer">
    {context?.error ? <p className="composer-error" role="alert">{context.error}</p> : null}
    {context?.notice ? <p className="composer-near" role="status">{context.notice}</p> : null}
    <form className={`chat-form ${guessing ? "guess-mode" : ""}`} onSubmit={async (event) => {
      event.preventDefault(); if (!draft.trim()) return;
      const text = draft;
      const ok = guessing ? await context?.sendGuess(text) : onSend(text);
      if (ok) { if (context) context.clearDraft(text); else setFallback(""); stopTyping(); }
    }}>{accessory}<label className="sr-only" htmlFor={id}>{guessing ? "Seu palpite" : "Mensagem"}</label><input id={id} name="message" autoComplete="off" value={draft} maxLength={guessing ? 80 : 2000} onChange={(event) => change(event.target.value)} placeholder={guessing ? "Mensagem ou palpite…" : "Escreva uma mensagem…"} /><button disabled={!draft.trim() || Boolean(context?.busy)} aria-label={guessing ? "Enviar palpite" : "Enviar mensagem"}><Send /></button></form>
  </div>;
}
