import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HouseSummary } from "@lumio/shared";
import { safeAuthDestination } from "./authNavigation";
import { HomePage } from "./components/EntryExperience";

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
