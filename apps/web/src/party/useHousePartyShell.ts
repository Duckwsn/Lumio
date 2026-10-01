import { usePartyCallResources } from "./usePartyCallResources";
import { usePartyTransport, type PartySocket } from "./usePartyTransport";

/**
 * Persistent social resource boundary above the routed experience stage. The transport is active
 * only for a resolved House/Room identity; Call refs are inert on Home. A visual
 * child may remount without re-entering the Party or reallocating RTC resources.
 */
export function useHousePartyShell(
  socketUrl: string,
  token: string | undefined,
  houseId: string,
  roomId: string | undefined,
  register: (socket: PartySocket) => void | (() => void),
) {
  const transport = usePartyTransport(socketUrl, token, houseId, roomId, register);
  const call = usePartyCallResources();
  return { transport, call };
}
