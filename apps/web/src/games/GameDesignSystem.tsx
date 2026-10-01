import type { HTMLAttributes, ReactNode } from "react";

/** Presentation-only building blocks. The Party and each game retain all authority. */
export function GameShell({ game, className = "", children, ...props }: HTMLAttributes<HTMLElement> & { game: "draw" | "quiz" | "cards"; children: ReactNode }) {
  return <section {...props} data-game={game} className={`game-shell ${className}`.trim()}>{children}</section>;
}

export function GameHud({ className = "", children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <header {...props} className={`game-hud ${className}`.trim()}>{children}</header>;
}

export function GameStage({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={`game-stage-surface ${className}`.trim()}>{children}</div>;
}

export function GameLobby({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={`game-lobby ${className}`.trim()}>{children}</div>;
}

export function GameActionBar({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={`game-action-bar ${className}`.trim()}>{children}</div>;
}

export function GameResult({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={`game-result ${className}`.trim()}>{children}</div>;
}

export function GameTimer({ seconds, unit = "seconds", className = "", label = "Tempo restante" }: { seconds: number; unit?: "seconds" | "clock"; className?: string; label?: string }) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const display = unit === "clock" ? `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}` : `${safe}s`;
  return <time className={`game-timer ${safe <= 10 ? "is-ending" : ""} ${className}`.trim()} aria-label={label} aria-valuetext={display}>{display}</time>;
}

export function GamePhase({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "active" | "success" }) {
  return <span className={`game-phase game-phase-${tone}`}>{children}</span>;
}
