import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { usePartyChatDraft } from "./PartyChatDraft";

/** A single Party Chat composer; drafts survive drawer and Media Hub transitions. */
export function PartyComposer({ onSend, onTyping, accessory }: { onSend: (text: string) => boolean; onTyping: (typing: boolean) => void; accessory?: ReactNode }) {
  const context = usePartyChatDraft(), id = useId();
  const [fallback, setFallback] = useState("");
  const draft = context?.draft ?? fallback;
  const typingSent = useRef(false), timer = useRef<number>(), typing = useRef(onTyping); typing.current = onTyping;
  const stopTyping = () => { window.clearTimeout(timer.current); if (typingSent.current) typing.current(false); typingSent.current = false; };
  useEffect(() => stopTyping, []);
  const change = (value: string) => {
    if (context) context.setDraft(value); else setFallback(value);
    if (value.trim() && !typingSent.current) { typing.current(true); typingSent.current = true; }
    if (!value.trim()) stopTyping();
    window.clearTimeout(timer.current); if (value.trim()) timer.current = window.setTimeout(stopTyping, 1400);
  };
  return <div className="party-composer">
    <form className="chat-form" onSubmit={(event) => {
      event.preventDefault(); if (!draft.trim()) return;
      const text = draft;
      if (onSend(text)) { if (context) context.clearDraft(text); else setFallback(""); stopTyping(); }
    }}>{accessory}<label className="sr-only" htmlFor={id}>Mensagem</label><input id={id} name="message" autoComplete="off" value={draft} maxLength={2000} onChange={(event) => change(event.target.value)} placeholder="Escreva uma mensagem…" /><button disabled={!draft.trim()} aria-label="Enviar mensagem"><Send /></button></form>
  </div>;
}
