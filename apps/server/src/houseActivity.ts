import type { HousePartyActivity } from "@lumio/shared";

interface ActivityInput {
  partyCount: number;
  sharing: boolean;
  media: { title: string; state: string; type: string } | null;
}
export function safeMediaTitle(value: string) {
  const title = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 140);
  return !title || /\b[a-z][a-z0-9+.-]{1,12}:\/\/|\bwww\.|(?:^|\s)\/api\/|[?&](?:access_token|token|signature|key)=|bearer\s|^(?:blob|data):/i.test(title) ? "mídia" : title;
}
/** Allowlist only: no runtime snapshots, IDs, tokens or playback URLs cross this boundary. */
export function projectHouseActivity(input: ActivityInput): HousePartyActivity {
  if (!input.partyCount) return { type: "idle", label: "Ninguém na Party agora" };
  if (input.sharing) return { type: "screen", label: "Compartilhando tela" };
  if (input.media && input.media.state === "playing") {
    const title = safeMediaTitle(input.media.title);
    return { type: "media", label: `${input.media.type === "audio" ? "Ouvindo" : "Reproduzindo"} ${title || "mídia"}` };
  }
  return { type: "party", label: "Na Party" };
}
