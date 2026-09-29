import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import type { DrawSnapshot, DrawState, ClientToServerEvents, ServerToClientEvents } from "@lumio/shared";

type PublicGame = Omit<DrawState, "choices" | "secretWord">;
type Mode = "chat" | "guess";
interface ChatContext {
  game: PublicGame | null; selected: boolean; select: (active: boolean) => void;
  eligible: boolean; mode: Mode; changeMode: (mode: Mode) => void;
  draft: string; changeDraft: (text: string) => void; clearDraft: (mode: Mode, text: string) => void;
  sendGuess: (text: string) => Promise<boolean>; error: string; busy: boolean;
}
const Context = createContext<ChatContext | null>(null);
export const usePartyGameChat = () => useContext(Context);
export function gamePresentationRole(game: Pick<DrawState, "phase" | "players" | "drawerId"> | null, selected: boolean, userId: string) {
  if (!selected || !game || !["CHOOSING_WORD", "DRAWING"].includes(game.phase)) return "neutral";
  return game.drawerId === userId && game.players.some((p) => p.id === userId && p.online) ? "drawer" : "guesser";
}
export function PartyGameWorkspace({ children, userId, className }: { children: ReactNode; userId: string; className: string }) {
  const chat = usePartyGameChat();
  return <div className={className} data-game-role={gamePresentationRole(chat?.game ?? null, chat?.selected ?? false, userId)}>{children}</div>;
}
export function canGuess(game: Pick<DrawState, "phase" | "players" | "drawerId"> | null, userId: string) {
  const me = game?.players.find((player) => player.id === userId);
  return Boolean(game?.phase === "DRAWING" && game.drawerId !== userId && me?.online && !me.guessed);
}
/** Only low-frequency public metadata and composer drafts; never subscribes to game:draw. */
export function PartyGameChatProvider({ socket, roomId, userId, onSelect, children }: { socket: Socket<ServerToClientEvents, ClientToServerEvents> | null; roomId: string; userId: string; onSelect: () => void; children: ReactNode }) {
  const [game, setGame] = useState<PublicGame | null>(null), [selected, select] = useState(false);
  const [drafts, setDrafts] = useState({ chat: "", guess: "" });
  const [preference, setPreference] = useState<{ round: string; mode: Mode } | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const sending = useRef(false), selection = useRef(onSelect); selection.current = onSelect;
  const round = game ? `${game.sessionId}:${game.roundId}` : "";
  const eligible = selected && Boolean(socket?.connected) && canGuess(game, userId);
  const mode: Mode = eligible ? preference?.round === round ? preference.mode : "guess" : "chat";
  useEffect(() => { if (selected) selection.current(); }, [selected]);
  useEffect(() => {
    if (!socket) return;
    const receive = (snapshot: DrawSnapshot | DrawState | null) => {
      if (snapshot && snapshot.roomId !== roomId) return;
      if (!snapshot) { setGame(null); return; }
      // Explicit omission: private projection and board never enter the social context.
      const { choices: _choices, secretWord: _secret, ...metadata } = snapshot;
      const { strokes: _strokes, ...publicGame } = metadata as DrawSnapshot;
      setGame((old) => old?.sessionId === publicGame.sessionId && old.revision > publicGame.revision ? old : publicGame);
    };
    const disconnected = () => { setGame(null); setError(""); };
    const connected = () => setError("");
    socket.on("game:snapshot", receive); socket.on("game:state", receive); socket.on("disconnect", disconnected);
    socket.on("connect", connected);
    return () => { socket.off("game:snapshot", receive); socket.off("game:state", receive); socket.off("disconnect", disconnected); socket.off("connect", connected); };
  }, [socket, roomId]);
  useEffect(() => { setDrafts((old) => ({ ...old, guess: "" })); setError(""); }, [round]);
  const clearDraft = (sentMode: Mode, text: string) => setDrafts((old) => old[sentMode] === text ? { ...old, [sentMode]: "" } : old);
  const sendGuess = async (text: string) => {
    if (!eligible || !game || !socket?.connected || sending.current) return false;
    sending.current = true; setBusy(true); setError("");
    try {
      const ack = await socket.timeout(5000).emitWithAck("game:action", { type: "guess", roomId, sessionId: game.sessionId, roundId: game.roundId, revision: game.revision, text });
      if (!ack.ok) setError(ack.message ?? "Palpite indisponível.");
      return ack.ok;
    } catch { setError("Servidor não respondeu. Seu palpite não foi confirmado."); return false; }
    finally { sending.current = false; setBusy(false); }
  };
  return <Context.Provider value={{ game, selected, select, eligible, mode, changeMode: (next) => setPreference({ round, mode: next }), draft: drafts[mode], changeDraft: (text) => setDrafts((old) => ({ ...old, [mode]: text })), clearDraft, sendGuess, error, busy }}>{children}</Context.Provider>;
}
