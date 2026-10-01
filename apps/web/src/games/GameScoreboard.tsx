import type { QuizPlayer } from "@lumio/shared";
export function GameScoreboard({ players, userId }: { players: readonly QuizPlayer[]; userId: string }) {
  const ranking = [...players].sort((a, b) => b.score - a.score);
  return <ol className="quiz-scoreboard game-scoreboard" aria-label="Classificação">{ranking.map((p) => <li key={p.id}><span>{1 + players.filter((other) => other.score > p.score).length}</span><span className="quiz-avatar" style={{ background: p.color }}>{p.displayName.slice(0, 1)}</span><span>{p.displayName}{p.id === userId ? " (você)" : ""}{!p.online ? " · ausente" : ""}<small>{p.correctCount} acertos</small></span><strong>{p.score}</strong></li>)}</ol>;
}
