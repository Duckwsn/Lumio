// Dev-server-only visual fixture. Not imported by the production entry point.
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, DrawSnapshot, GameAck, ServerToClientEvents } from "@lumio/shared";
import { DrawGame } from "../src/games/DrawGame";
import "../src/styles.css";
import "../src/games/gameDesignSystem.css";
import "../src/games/drawV4.css";

const query = new URLSearchParams(location.search);
const phase = (["DRAWING", "CHOOSING_WORD", "ROUND_RESULT", "GAME_RESULT"] as const).find((value) => value === query.get("phase")) ?? "DRAWING";
const role = query.get("role") === "drawer" ? "drawer" : "guesser";
const seconds = query.get("timer") === "11" ? 11 : 5;
const mobile = matchMedia("(max-width: 900px)").matches;
const scores = [0, 2, 48, 100, 198, 205, 8, 12, 23, 49, 76, 150];
const names = [
  "Alexandre de Albuquerque", "JogadorComUmNomeMuitoGrande", "Bia", "Caio",
  "Duda", "Eva", "Fernanda", "Guilherme", "Helena", "Isadora", "João", "Luana",
];
const players = names.map((displayName, index) => ({
  id: `qa-player-${index}`, displayName, color: ["#a8e7bd", "#d6a3da", "#edbc82"][index % 3],
  score: scores[index], online: index !== 10, guessed: index === 1 || index === 4,
}));
const now = Date.now();
const snapshot: DrawSnapshot & { gameType: "draw" } = {
  gameType: "draw", roomId: "qa-room", sessionId: "qa-session", roundId: "qa-round",
  revision: 10, boardRevision: 0, phase,
  hostId: players[0].id, players, order: players.map((player) => player.id),
  drawerId: players[0].id, round: 17, targetScore: 200, theme: "animals",
  winnerIds: [players[5].id], resultReason: "target", nextDrawerId: players[1].id,
  startedAt: now - 75_000, endsAt: now + seconds * 1000, serverNow: now,
  maskedWord: "__________", revealedWord: phase === "ROUND_RESULT" ? "dinossauro" : undefined,
  strokes: [], feed: [], roundPoints: { [players[0].id]: 6, [players[1].id]: 9 },
  ...(role === "drawer" ? { secretWord: "dinossauro", choices: ["dinossauro", "borboleta", "pinguim"] } : {}),
};

class FixtureSocket {
  connected = true;
  listeners = new Map<string, Set<(value: unknown) => void>>();
  on(event: string, listener: (value: unknown) => void) {
    const group = this.listeners.get(event) ?? new Set();
    group.add(listener);
    this.listeners.set(event, group);
    return this;
  }
  off(event: string, listener: (value: unknown) => void) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }
  emit(event: string, value: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
    return this;
  }
  timeout() {
    return { emitWithAck: async (): Promise<GameAck> => ({ ok: true }) };
  }
}
const fixtureSocket = new FixtureSocket();

function Fixture() {
  useEffect(() => {
    queueMicrotask(() => fixtureSocket.emit("game:snapshot", snapshot));
  }, []);
  return <div className={`app-shell game-mode qa-freeze ${mobile ? "mobile-party" : ""}`}>
    <main className="party-main" style={{ height: "100dvh" }}>
      <div className="party-workspace" data-game-role={role}>
        <section className="party-content">
          <div className="main-stage is-game">
            <section className="game-hub" aria-label="Jogos da Party">
              <header className="game-stage-nav"><span>Jogos / Desenhe e Adivinhe</span></header>
              <DrawGame socket={fixtureSocket as unknown as Socket<ServerToClientEvents, ClientToServerEvents>} roomId="qa-room" userId={players[role === "drawer" ? 0 : 2].id} />
            </section>
          </div>
        </section>
        {role === "guesser" && phase !== "GAME_RESULT" ? <section className="mobile-party-chat" aria-label="Chat da Party"><header className="mobile-chat-heading"><strong>Palpite e Chat</strong></header><div className="mobile-chat-body"><div className="messages"><p>Bia acertou ✓</p></div><label>Seu palpite<input aria-label="Seu palpite" placeholder="Digite seu palpite" /></label></div></section> : null}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
