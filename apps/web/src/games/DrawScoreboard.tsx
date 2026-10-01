import { useEffect, useRef, useState } from "react";
import type { DrawSnapshot } from "@lumio/shared";
import { Avatar } from "../components/Avatar";

export function DrawScoreboard({ state, userId }: { state: DrawSnapshot; userId: string }) {
  const previous = useRef<Record<string, number>>({});
  const [gains, setGains] = useState<Record<string, number>>({});
  const scores = state.players.map((p) => `${p.id}:${p.score}`).join("|");
  useEffect(() => {
    const next: Record<string, number> = {};
    for (const player of state.players) if (previous.current[player.id] !== undefined && player.score > previous.current[player.id]) next[player.id] = player.score - previous.current[player.id];
    previous.current = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
    setGains(next); const timer = window.setTimeout(() => setGains({}), 2200);
    return () => window.clearTimeout(timer);
  }, [scores, state.sessionId]);
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  return <div className="draw-scoreboard game-scoreboard"><ol aria-label="Placar do jogo">{sorted.map((player) => <li className={gains[player.id] ? "score-gained" : ""} key={player.id}><span className="draw-position">{sorted.findIndex((p) => p.score === player.score) + 1}</span><Avatar name={player.displayName} color={player.color} src={player.avatar} /><span className="draw-score-name">{player.displayName}{player.id === userId ? " (você)" : ""}<small>{!player.online ? "Ausente" : player.id === state.drawerId ? "Desenha" : player.guessed ? "Acertou ✓" : player.id === state.hostId ? "Coordena" : ""}</small></span><strong aria-label={`${player.score} de ${state.targetScore} pontos`}>{player.score}<small>/{state.targetScore}</small></strong>{gains[player.id] ? <span className="draw-score-gain" key={player.score}>+{gains[player.id]}</span> : null}</li>)}</ol><span className="sr-only" role="status">{gains[userId] ? `+${gains[userId]} pontos${state.drawerId === userId ? " por um acerto no seu desenho" : ""}` : ""}</span>{state.drawerId === userId && (state.roundPoints?.[userId] ?? 0) > 0 ? <p className="draw-earned">+{state.roundPoints?.[userId]} pelos acertos no seu desenho</p> : null}</div>;
}
