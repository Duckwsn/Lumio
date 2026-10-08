import { createContext, useContext, useState, type ReactNode } from "react";

type DraftState = { draft: string; setDraft: (value: string) => void; clearDraft: (sent: string) => void };
const PartyChatDraftContext = createContext<DraftState | null>(null);

export function PartyChatDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState("");
  const clearDraft = (sent: string) => setDraft((current) => current === sent ? "" : current);
  return <PartyChatDraftContext.Provider value={{ draft, setDraft, clearDraft }}>{children}</PartyChatDraftContext.Provider>;
}

export function usePartyChatDraft() {
  return useContext(PartyChatDraftContext);
}
