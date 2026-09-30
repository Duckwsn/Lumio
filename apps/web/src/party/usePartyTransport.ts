import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { eventNames, type ClientToServerEvents, type RoomSnapshot, type ServerToClientEvents } from "@lumio/shared";

export type PartySocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type PartyConnectionState = "connecting" | "connected" | "reconnecting" | "offline" | "error";

/** One transport for one authenticated Party identity; visual presentation is deliberately absent. */
export function usePartyTransport(
  socketUrl: string,
  token: string | undefined,
  houseId: string,
  roomId: string | undefined,
  register: (socket: PartySocket) => void | (() => void),
) {
  const [socket, setSocket] = useState<PartySocket | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<PartyConnectionState>("connecting");
  const [entryError, setEntryError] = useState("");
  const registerRef = useRef(register);
  registerRef.current = register;

  useEffect(() => {
    if (!token || !houseId || !roomId) return;
    const nextSocket: PartySocket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
      autoConnect: false,
    });
    // Handlers must exist before connect: a fast room:snapshot must never be lost.
    const unregister = registerRef.current(nextSocket);
    setSocket(nextSocket);
    nextSocket.connect();
    return () => {
      if (nextSocket.connected) nextSocket.emit(eventNames.roomLeave, roomId);
      nextSocket.disconnect();
      unregister?.();
      setSocket((current) => current === nextSocket ? null : current);
      setSnapshot(null);
    };
  }, [socketUrl, token, houseId, roomId]);

  return { socket, snapshot, setSnapshot, connectionState, setConnectionState, entryError, setEntryError };
}
