import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ListVideo, Plus, Users } from "lucide-react";
import { gamePresentationRole, usePartyGameChat } from "../games/PartyGameChat";

export function useMobileParty() {
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 900px)").matches);
  useEffect(() => { const query = matchMedia("(max-width: 900px)"); const update = () => setMobile(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  return mobile;
}

// Structural chat: never a sheet. Fullscreen/drawer roles hide it without unmounting.
export function MobilePartyChat({ children, hidden, userId = "", showMediaActions = true, onPeople, onQueue, onAdd }: { children: ReactNode; hidden: boolean; userId?: string; showMediaActions?: boolean; onPeople: () => void; onQueue: () => void; onAdd: () => void }) {
  const game = usePartyGameChat();
  const [conversationExpanded, setConversationExpanded] = useState(false);
  const role = gamePresentationRole(game?.game ?? null, game?.selected ?? false, userId);
  const drawGuesser = role === "guesser" && Boolean(game?.game?.players.some((player) => player.id === userId && player.online));
  useEffect(() => { setConversationExpanded(false); }, [game?.game?.roundId]);
  const concealed = hidden || role === "drawer";
  return <section className={`mobile-party-chat ${drawGuesser ? conversationExpanded ? "draw-chat-expanded" : "draw-chat-compact" : ""}`} hidden={concealed} aria-label="Chat da Party">
    <header className="mobile-chat-heading"><strong>{drawGuesser ? "Palpite e Chat" : "Chat da Party"}</strong><div>{drawGuesser ? <button type="button" onClick={() => setConversationExpanded((value) => !value)} aria-label={conversationExpanded ? "Recolher conversa" : "Abrir conversa"} aria-expanded={conversationExpanded} title={conversationExpanded ? "Recolher conversa" : "Abrir conversa"}>{conversationExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button> : null}<button type="button" onClick={onPeople} aria-label="Pessoas da Party"><Users size={18} /></button>{showMediaActions ? <><button type="button" onClick={onQueue} aria-label="Fila da Party"><ListVideo size={18} /></button><button type="button" onClick={onAdd} aria-label="Adicionar mídia"><Plus size={18} /></button></> : null}</div></header>
    <div className="mobile-chat-body">{children}</div>
  </section>;
}
