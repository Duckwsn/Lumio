import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HouseSummary } from "@lumio/shared";
import { safeAuthDestination } from "./authNavigation";
import { HomePage } from "./components/EntryExperience";
import { parseInviteInput } from "./inviteInput.js";
import { MediaExperienceStage, GamesExperienceStage } from "./components/PartyStages";
import { GameHub } from "./components/GameHub";
import { memberPresenceLabel, memberPreviewName, sortHouseMembers } from "./presence";

test("S2 labels online/Party/last seen independently and keeps stable member order", () => {
  const now = Date.parse("2026-09-29T18:00:00.000Z");
  const member = (id: string, presence: "ONLINE" | "OFFLINE", inParty: boolean, minutes: number) => ({ user: { id, displayName: id, color: "#fff" }, role: "MEMBER" as const, presence, inParty, lastSeenAt: new Date(now - minutes * 60_000).toISOString(), joinedAt: `2026-09-29T00:0${id.length}:00Z`, inCall: false, speaking: false, screenSharing: false });
  const offline = member("old", "OFFLINE", false, 120), online = member("new", "ONLINE", false, 100), party = member("party", "ONLINE", true, 90);
  assert.equal(memberPresenceLabel(party, now), "Na Party"); assert.equal(memberPresenceLabel(online, now), "Online");
  assert.equal(memberPresenceLabel(offline, now), "Visto há 2 h");
  assert.equal(memberPresenceLabel(member("recent", "OFFLINE", false, 2), now), "Visto recentemente");
  assert.deepEqual(sortHouseMembers([offline, online, party]).map((entry) => entry.user.id), ["party", "new", "old"]);
  assert.equal(memberPreviewName("G1 Visual Bia"), "G1 B.");
  assert.equal(memberPreviewName("Ana"), "Ana");
});

test("post-login destination rejects cross-origin and protocol-relative redirects", () => {
  const origin = "https://lumio.example.test";
  for (const value of ["https://attacker.example", "//attacker.example", "/\\attacker.example", "javascript:alert(1)", "%2f%2fattacker.example"]) assert.equal(safeAuthDestination(value, origin), "/app");
  assert.equal(safeAuthDestination("/invite/abc?next=1", origin), "/invite/abc?next=1");
});

test("House names are escaped as text in the Home UI", () => {
  const malicious = '<img src=x onerror=alert(1)>';
  const house: HouseSummary = { id: "house-test", name: malicious, initials: "H", role: "HOST", memberCount: 1, onlineCount: 0, partyCount: 0, primaryRoomId: "room-test" };
  const html = renderToStaticMarkup(createElement(HomePage, { user: { id: "duck", displayName: "Duck", color: "#fff" }, houses: [house], onRetry: () => undefined, onOpenHouse: () => undefined, onCreate: async () => undefined, onInvite: () => false, onAccount: () => undefined, onLogout: () => undefined }));
  assert.equal(html.includes(malicious), false);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
test("invite input supports normalized codes and existing local invitation links", () => {
  const origin = "https://lumio.example.test", token = "a".repeat(32);
  assert.equal(parseInviteInput(" abcde-fghjk ", origin), "ABCDEFGHJK");
  assert.equal(parseInviteInput(`${origin}/invite/${token}`, origin), token);
  assert.equal(parseInviteInput(token, origin), token);
  for (const input of ["ABCDE/FGHJK", "1234567890", `https://attacker.test/invite/${token}`, "javascript:alert(1)"]) assert.equal(parseInviteInput(input, origin), null);
  const next = `/invite/${parseInviteInput("abcde fghjk", origin)}`;
  assert.equal(safeAuthDestination(next, origin), next);
});

test("GX3 Media experience owns the only provider surface", () => {
  const html = renderToStaticMarkup(createElement(MediaExperienceStage, { media: createElement("iframe", { title: "YouTube" }), screenShare: null, screenStream: null, view: "media", onViewChange: () => undefined }));
  assert.equal((html.match(/<iframe/g) ?? []).length, 1);
  assert.match(html, /media-experience/);
});
test("GX3 Games experience has no hidden YouTube, Drive or MediaStage", () => {
  const html = renderToStaticMarkup(createElement(GamesExperienceStage, { screenShare: null, screenStream: null, onFullscreenChange: () => undefined }));
  assert.match(html, /games-experience/);
  assert.doesNotMatch(html, /<iframe|<video|game-media-visible|lumio-player/);
});

test("S1 Home distinguishes Party occupancy, online members and escaped activity", () => {
  const house: HouseSummary = { id: "x", name: "Casa X", initials: "CX", role: "MEMBER", memberCount: 4, onlineCount: 3, partyCount: 2, primaryRoomId: "r", partyActivity: { type: "game", gameType: "quiz", label: "Partida de Quiz ativa" }, memberPreview: [{ id: "a", displayName: "Ana", color: "#fff", presence: "ONLINE", inParty: true }] };
  const props = { user: { id: "u", displayName: "User", color: "#fff" }, onRetry: () => undefined, onOpenHouse: () => undefined, onCreate: async () => undefined, onInvite: () => false, onAccount: () => undefined, onLogout: () => undefined };
  const html = renderToStaticMarkup(createElement(HomePage, { ...props, houses: [house] }));
  assert.match(html, /2 pessoas na Party/); assert.match(html, /3 membros online/); assert.match(html, /Partida de Quiz ativa/); assert.match(html, /Entrar na Party/); assert.match(html, /Casa e membros/); assert.doesNotMatch(html, /Convidar pessoas/);
  const idle = renderToStaticMarkup(createElement(HomePage, { ...props, houses: [{ ...house, partyCount: 0 }] })); assert.match(idle, /Abrir Party/); assert.doesNotMatch(idle, /Partida de Quiz ativa/);
  const empty = renderToStaticMarkup(createElement(HomePage, { ...props, houses: [], error: "Falhou" })); assert.match(empty, /Tentar novamente/); assert.doesNotMatch(empty, /Crie uma Casa ou entre/);
  const stale = renderToStaticMarkup(createElement(HomePage, { ...props, houses: [house], connected: false })); assert.match(stale, /último estado recebido/);
});
  test("Game Hub shows three real games with original vector identity and concise accessible copy", () => {
  const html = renderToStaticMarkup(createElement(GameHub, { onFullscreen: () => undefined, fullscreen: false }));
  assert.equal((html.match(/class="draw-entry"/g) ?? []).length, 1);
    assert.equal((html.match(/class="quiz-entry"/g) ?? []).length, 1);
    assert.equal((html.match(/class="cards-entry"/g) ?? []).length, 1);
    assert.match(html, /Lumio Cartas/); assert.match(html, /2–8 jogadores/);
  assert.match(html, /draw-game-icon/); assert.match(html, /2–12 jogadores/);
  assert.match(html, /aria-label="Lumio Cartas 2–8 jogadores"/);
  assert.doesNotMatch(html, /Voltar à mídia/);
  for (const text of ["Em breve", "Na mesma Party", "Desenhe, adivinhe e ria"]) assert.equal(html.includes(text), false);
});
