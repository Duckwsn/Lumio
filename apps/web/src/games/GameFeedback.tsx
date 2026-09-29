/** Shared presentation only: game rules and private projections stay in each game. */
export function GameConnectionNotice({ reconnecting }: { reconnecting: boolean }) {
  return reconnecting ? <p className="game-connection-notice" role="status">Reconectando à Party… A tela mostra o último estado recebido. Aguarde para jogar.</p> : null;
}

export function GameLobbyStatus({ host, hostName, count }: { host: boolean; hostName?: string; count: number }) {
  return <p className="game-lobby-status">{host ? "Você coordena." : `Coordena: ${hostName || "aguardando participante"}.`} {count < 2 ? "Mínimo de 2 participantes." : "Prontos para começar."}</p>;
}
