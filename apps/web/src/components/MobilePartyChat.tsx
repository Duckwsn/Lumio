import { useEffect, useState, type ReactNode } from "react";
import { ListVideo, Plus, Users } from "lucide-react";

export function useMobileParty() {
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 900px)").matches);
  useEffect(() => { const query = matchMedia("(max-width: 900px)"); const update = () => setMobile(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  return mobile;
}

// In the Media-only Party, Chat always participates in the mobile layout.
export function MobilePartyChat({ children, hidden, onPeople, onQueue, onAddMedia, queueCount }: { children: ReactNode; hidden: boolean; onPeople: () => void; onQueue: () => void; onAddMedia: () => void; queueCount: number }) {
  return <section className="mobile-party-chat is-open" hidden={hidden} aria-label="Chat da Party">
    <header className="mobile-chat-heading"><strong>Chat da Party</strong><div><button type="button" onClick={onPeople} aria-label="Pessoas da Party" title="Pessoas"><Users size={18} /></button><button type="button" onClick={onQueue} aria-label={`Fila da Party, ${queueCount} itens`} title="Fila da Party"><ListVideo size={18} /></button><button type="button" onClick={onAddMedia} aria-label="Adicionar mídia" title="Adicionar mídia"><Plus size={18} /></button></div></header>
    <div className="mobile-chat-body">{children}</div>
  </section>;
}
