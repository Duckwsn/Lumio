import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Users, X } from "lucide-react";
import { gamePresentationRole, usePartyGameChat } from "../games/PartyGameChat";

export function useMobileParty() {
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 900px)").matches);
  useEffect(() => { const query = matchMedia("(max-width: 900px)"); const update = () => setMobile(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  return mobile;
}

// The Party Chat stays mounted while its mobile surface opens and closes, preserving drafts.
export function MobilePartyChat({ children, hidden, open, onClose, userId = "", onPeople }: { children: ReactNode; hidden: boolean; open: boolean; onClose: () => void; userId?: string; onPeople: () => void }) {
  const game = usePartyGameChat();
  const [conversationExpanded, setConversationExpanded] = useState(false);
  const root = useRef<HTMLElement>(null);
  const role = gamePresentationRole(game?.game ?? null, game?.selected ?? false, userId);
  const drawGuesser = role === "guesser" && Boolean(game?.game?.players.some((player) => player.id === userId && player.online));
  useEffect(() => { setConversationExpanded(false); }, [game?.game?.roundId]);
  useEffect(() => { if (open && !hidden && role !== "drawer") root.current?.querySelector<HTMLInputElement>(".chat-form input")?.focus(); }, [open, hidden, role]);
  const concealed = hidden || role === "drawer";
  useEffect(() => { if (open && concealed) onClose(); }, [open, concealed, onClose]);
  return <section ref={root} className={`mobile-party-chat ${open ? "is-open" : ""} ${drawGuesser ? `is-guesser ${conversationExpanded ? "draw-chat-expanded" : "draw-chat-compact"}` : ""}`} hidden={concealed} aria-label="Chat da Party">
    <header className="mobile-chat-heading"><strong>{drawGuesser ? "Palpite e Chat" : "Chat da Party"}</strong><div>{drawGuesser ? <button type="button" onClick={() => setConversationExpanded((value) => !value)} aria-label={conversationExpanded ? "Recolher conversa" : "Abrir conversa"} aria-expanded={conversationExpanded} title={conversationExpanded ? "Recolher conversa" : "Abrir conversa"}>{conversationExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button> : null}<button type="button" onClick={onPeople} aria-label="Pessoas da Party"><Users size={18} /></button><button type="button" onClick={onClose} aria-label="Fechar chat"><X size={18} /></button></div></header>
    <div className="mobile-chat-body">{children}</div>
  </section>;
}
