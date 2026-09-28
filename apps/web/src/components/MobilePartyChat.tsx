import { useEffect, useState, type ReactNode } from "react";
import { ListVideo, Plus, Users } from "lucide-react";

export function useMobileParty() {
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 900px)").matches);
  useEffect(() => { const query = matchMedia("(max-width: 900px)"); const update = () => setMobile(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  return mobile;
}

// Structural chat: never a sheet. Only the current experience's fullscreen can hide it.
export function MobilePartyChat({ children, hidden, onPeople, onQueue, onAdd }: { children: ReactNode; hidden: boolean; onPeople: () => void; onQueue: () => void; onAdd: () => void }) {
  return <section className="mobile-party-chat" hidden={hidden} aria-label="Chat da Party">
    <header className="mobile-chat-heading"><strong>Chat da Party</strong><div><button type="button" onClick={onPeople} aria-label="Pessoas da Party"><Users size={18} /></button><button type="button" onClick={onQueue} aria-label="Fila da Party"><ListVideo size={18} /></button><button type="button" onClick={onAdd} aria-label="Adicionar mídia"><Plus size={18} /></button></div></header>
    <div className="mobile-chat-body">{children}</div>
  </section>;
}
