import test from "node:test";
import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PartySocialControls } from "../components/PartySocialControls";
import { MobilePartyChat } from "../components/MobilePartyChat";

const noop = () => undefined;
const defaults: ComponentProps<typeof PartySocialControls> = {
  callState: "connected", callQuality: "Boa", voiceError: "", micEnabled: false,
  muted: true, deafened: false, speaking: false, microphoneMode: "voice",
  audioBlocked: false, isSharingScreen: false, shareOccupied: false, canShare: true,
  peopleCount: 1, unreadChat: 0, chatOpen: false, onMic: noop, onDeafen: noop,
  onShare: noop, onChat: noop, onPeople: noop, onSettings: noop, onEnableAudio: noop,
  onRetryVoice: noop, settingsTriggerRef: { current: null }, chatTriggerRef: { current: null },
};
const render = (props: Partial<typeof defaults>) => renderToStaticMarkup(createElement(PartySocialControls, { ...defaults, ...props }));

test("mobile Media chat is pinned with People, Queue and Add actions; Games stays dismissible and media-free", () => {
  const props = { children: "Chat", hidden: false, open: true, onClose: noop, onPeople: noop };
  const media = renderToStaticMarkup(createElement(MobilePartyChat, { ...props, pinned: true, onQueue: noop, onAddMedia: noop, queueCount: 3 }));
  assert.match(media, /aria-label="Pessoas da Party"/);
  assert.match(media, /aria-label="Fila da Party, 3 itens"/);
  assert.match(media, /aria-label="Adicionar mídia"/);
  assert.doesNotMatch(media, /Fechar chat/);
  const games = renderToStaticMarkup(createElement(MobilePartyChat, props));
  assert.match(games, /Fechar chat/);
  assert.doesNotMatch(games, /Fila da Party|Adicionar mídia/);
});

test("FF3.1 call off exposes entry while connected status stays accessible and quiet", () => {
  const off = render({ callState: "idle" });
  assert.match(off, /aria-label="Entrar na Call, microfone desligado"/);
  const connected = render({});
  assert.match(connected, /class="social-call-status sr-only" role="status"/);
  assert.doesNotMatch(connected, /Entrar na Call|Abrir controles da Party/);
  for (const callState of ["joining", "reconnecting"]) {
    const html = render({ callState });
    assert.doesNotMatch(html, /social-call-status sr-only|Entrar na Call/);
    assert.match(html, /role="status"/);
  }
});

test("FF3.1 blocked mic and active sharing retain explicit accessible actions", () => {
  const html = render({ voiceError: "Microfone bloqueado", isSharingScreen: true });
  assert.match(html, /role="alert">Microfone bloqueado/);
  assert.match(html, /aria-label="Parar compartilhamento de tela" aria-pressed="true"/);
  const enabled = render({ micEnabled: true, muted: false });
  assert.match(enabled, /aria-label="Desativar microfone · Microfone ligado" aria-pressed="true"/);
});
