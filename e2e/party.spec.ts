import { test, expect, chromium } from "@playwright/test";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { io } from "socket.io-client";
import { drawWordBanks } from "../apps/server/src/drawWords";
import { quizQuestions } from "../apps/server/src/quizQuestions";

let m2QaSessions: Array<{ token: string; user: { id: string; displayName: string; color: string } }> | null = null;

test("S1 Houses: Home observes two Party browsers, three games, six widths, details and invite without joining", async ({ browser, request }) => {
  test.setTimeout(120000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const displayName of ["Ana nome bastante longo para QA", "Bia", "Caio"]) {
    const email = `s1-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } });
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const contexts = await Promise.all(sessions.map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
  const errors: string[] = [];
  try {
    for (let i = 0; i < 3; i++) await contexts[i].addInitScript((session) => {
      localStorage.setItem("lumio.session.v1", JSON.stringify(session));
      (window as any).__captures = 0;
      navigator.mediaDevices.getUserMedia = async () => { (window as any).__captures++; throw new Error("S1 must not capture on Home"); };
    }, sessions[i]);
    const [a, b, home] = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    for (const p of [a, b, home]) p.on("pageerror", (e) => errors.push(e.message));
    await home.goto(`${origin}/app`); await expect(home.getByRole("heading", { name: "Você ainda não faz parte de uma Casa." })).toBeVisible();
    await home.screenshot({ path: "artifacts/s1/s1-house-empty.png" });
    const headers = { Authorization: `Bearer ${sessions[0].token}` };
    const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "Casa dos amigos com um nome comprido para testar" } })).json();
    const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 4 } })).json();
    await home.getByRole("button", { name: "Entrar com convite" }).click(); await home.getByLabel("Link ou código").fill(invite.code); await home.getByRole("button", { name: "Abrir convite" }).click();
    await home.getByRole("button", { name: "Entrar na Casa", exact: true }).click(); await expect(home).toHaveURL(/\/house\//);
    await home.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
    await home.getByRole("button", { name: "Sair da Party", exact: true }).click();
    await expect(home).toHaveURL(/\/app$/);
    await expect(home.locator(".house-card-v2")).toHaveCount(1); await expect(home.locator(".house-party-summary")).toContainText("Ninguém na Party agora", { timeout: 12000 });
    await home.screenshot({ path: "artifacts/s1/s1-house-idle.png" });
    await request.post(`${api}/api/invites/${invite.code}/accept`, { headers: { Authorization: `Bearer ${sessions[1].token}` } });
    await Promise.all([a.goto(`${origin}/house/${house.id}`), b.goto(`${origin}/house/${house.id}`)]);
    await expect(home.locator(".house-party-summary")).toContainText("2 pessoas na Party");
    await home.screenshot({ path: "artifacts/s1/s1-house-active.png" });
    await home.getByRole("button", { name: "Casa e membros", exact: true }).click();
    await home.getByRole("button", { name: "Membros", exact: true }).click();
    await expect(home.locator(".settings-members li").filter({ hasText: "Bia" }).locator(".member-presence")).toHaveText("Na Party");
    await expect(home.locator(".settings-members li").filter({ hasText: "Caio" }).locator(".member-presence")).toHaveText("Online");
    const secondAnaTab = await contexts[0].newPage();
    await secondAnaTab.goto(`${origin}/house/${house.id}`);
    await expect(secondAnaTab.getByRole("button", { name: /Abrir pessoas, 2 na Party/ })).toBeVisible();
    await expect(home.locator(".house-details-presence")).toContainText("2 na Party");
    await secondAnaTab.close();
    await expect(home.locator(".house-details-presence")).toContainText("2 na Party");
    await home.keyboard.press("Escape");
    expect(await home.evaluate(() => (window as any).__captures)).toBe(0);
    expect(await home.locator("iframe,video,audio,.party-app,.game-hub").count()).toBe(0);
    for (const [game, label] of [["draw", "Desenhe e Adivinhe"], ["quiz", "Quiz"], ["cards", "Lumio Cartas"]]) {
      for (const p of [a, b]) { await p.getByRole("button", { name: "Jogos", exact: true }).click(); await p.locator(`.game-catalog .${game}-entry`).click(); await p.getByRole("button", { name: "Participar", exact: true }).click(); }
      await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
      await expect(home.locator(".house-party-summary")).toContainText(`Partida de ${label} ativa`);
      if (game === "quiz") {
        await contexts[2].setOffline(true); await expect(home.getByRole("status")).toContainText("último estado recebido");
        await contexts[2].setOffline(false); await expect(home.locator(".home-presence-pending")).toHaveCount(0, { timeout: 15000 });
        await home.screenshot({ path: "artifacts/s1/s1-home-desktop.png" });
        for (const width of [320, 360, 375, 390, 412, 430]) { await home.setViewportSize({ width, height: 844 }); expect(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); const box = await home.locator(".house-card-v2 .house-open-actions > button").first().boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); await home.screenshot({ path: `artifacts/s1/s1-home-${width}.png` }); }
      }
      await a.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click(); await b.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
      await expect(home.locator(".house-party-summary")).toContainText(`Partida de ${label} ativa`, { timeout: 5000 });
      await a.getByRole("button", { name: "Jogos", exact: true }).click(); await a.getByRole("button", { name: "Encerrar sessão de jogo", exact: true }).click(); await a.getByRole("button", { name: "Confirmar encerramento", exact: true }).click();
      await expect(home.locator(".house-party-summary")).toContainText("Na Party"); await a.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
    }
    await home.setViewportSize({ width: 1440, height: 900 });
    await home.getByRole("button", { name: "Casa e membros", exact: true }).click(); await expect(home.getByRole("dialog")).toBeVisible(); await home.screenshot({ path: "artifacts/s1/s1-house-detail-desktop.png" });
    await home.getByRole("button", { name: "Membros", exact: true }).click(); await expect(home.getByRole("dialog")).toContainText("Dono"); await expect(home.getByRole("dialog")).not.toContainText("HOST"); await home.screenshot({ path: "artifacts/s1/s1-members.png" });
    await home.setViewportSize({ width: 320, height: 844 }); expect(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await home.screenshot({ path: "artifacts/s1/s1-house-detail-mobile.png" });
    await home.keyboard.press("Escape"); await expect(home.getByRole("dialog")).toHaveCount(0); await expect(home.getByRole("button", { name: "Casa e membros", exact: true })).toBeFocused();
    expect(await home.evaluate(() => (window as any).__captures)).toBe(0);
    await request.post(`${api}/api/houses/${house.id}/transfer-host`, { headers, data: { targetUserId: sessions[2].user.id } });
    await expect(home.getByRole("button", { name: "Convidar pessoas", exact: true })).toBeVisible(); await home.getByRole("button", { name: "Convidar pessoas", exact: true }).click(); await home.getByRole("button", { name: "Criar convite seguro" }).click(); await expect(home.getByLabel("Código do convite")).toBeVisible(); await home.screenshot({ path: "artifacts/s1/s1-invite.png" }); await home.getByRole("button", { name: "Fechar", exact: true }).click();
    const { house: second } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "Outra Casa" } })).json();
    const { invite: secondInvite } = await (await request.post(`${api}/api/houses/${second.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 2 } })).json();
    await request.post(`${api}/api/invites/${secondInvite.code}/accept`, { headers: { Authorization: `Bearer ${sessions[2].token}` } }); await expect(home.locator(".house-card-v2")).toHaveCount(2);
    await home.setViewportSize({ width: 1440, height: 900 }); await home.screenshot({ path: "artifacts/s1/s1-house-multiple.png" });
    for (let index = 0; index < 7; index++) await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${sessions[2].token}` }, data: { name: `Outra Casa de QA ${index + 1}` } });
    await home.reload(); await expect(home.locator(".house-card-v2")).toHaveCount(9);
    await expect(home.locator(".house-featured")).toHaveCount(1);
    await expect(home.locator(".house-secondary")).toHaveCount(8);
    await home.setViewportSize({ width: 320, height: 568 });
    expect(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await home.screenshot({ path: "artifacts/s1/s1-house-nine-mobile.png", fullPage: true });
    await contexts[0].close(); await expect(home.locator(".house-card-v2").first()).toContainText("1 pessoa na Party", { timeout: 10000 });
    await contexts[1].close(); await expect(home.locator(".house-card-v2").first()).toContainText("Ninguém na Party agora", { timeout: 10000 });
    await home.locator(".house-card-v2").first().getByRole("button", { name: /Abrir Party/ }).click(); await expect(home).toHaveURL(new RegExp(`/house/${house.id}/media$`));
    expect(errors).toEqual([]);
  } finally { for (const ctx of contexts) await ctx.close(); }
});

test("G5 three authenticated browsers: private cards, full match, six widths, wild, last card and rematch", async ({ browser, request }) => {
  test.setTimeout(180000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const displayName of ["Cards Ana", "Cards Bia", "Cards Caio"]) {
    const email = `cards-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "G5 Friends" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 3 } })).json();
  for (const s of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.token}/accept`, { headers: { Authorization: `Bearer ${s.token}` } })).status()).toBe(200);
  const contexts = await Promise.all(sessions.map((_, i) => browser.newContext(i === 1 ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })));
  const errors: string[] = [];
  try {
    for (let i = 0; i < 3; i++) await contexts[i].addInitScript((s) => localStorage.setItem("lumio.session.v1", JSON.stringify(s)), sessions[i]);
    const [a, b, c] = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    for (const [i, page] of [a, b, c].entries()) {
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${origin}/house/${house.id}`); await page.getByRole("button", { name: "Jogos", exact: true }).click();
      await expect(page.locator(".game-catalog>button")).toHaveCount(3);
      await expect(page.getByRole("button", { name: "Voltar à mídia", exact: true })).toHaveCount(0);
      if (i === 0) { await page.keyboard.press("Escape"); await expect(page.locator(".main-stage")).toHaveAttribute("data-view", "game"); }
      if (i === 0) {
        for (const width of [320, 360, 375, 390, 412, 430]) {
          await page.setViewportSize({ width, height: 844 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          const stage = (await page.locator(".main-stage").boundingBox())!, lastCard = (await page.locator(".game-catalog>button").last().boundingBox())!;
          expect(lastCard.y + lastCard.height).toBeLessThanOrEqual(stage.y + stage.height);
          if ([320, 390, 430].includes(width)) await page.screenshot({ path: `test-results/g6-hub-${width}.png` });
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
      if (i < 2) await page.screenshot({ path: `test-results/g6-hub-${i === 1 ? "desktop" : "390"}.png` });
      if (i === 1) {
        for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
          await page.setViewportSize(viewport);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: `test-results/g6-hub-${viewport.width}x${viewport.height}.png` });
        }
        await page.setViewportSize({ width: 1280, height: 900 });
      }
      await page.getByRole("button", { name: /Lumio Cartas 2/ }).click(); await page.getByRole("button", { name: "Participar", exact: true }).click();
    }
    await expect(a.locator(".card-players li")).toHaveCount(3);
    await a.screenshot({ path: "test-results/g5-lobby-mobile.png" }); await b.screenshot({ path: "test-results/g6-cards-lobby.png" });
    const chat = a.locator(".mobile-party-chat").getByRole("textbox"); await chat.fill("rascunho Cartas G5");
    const chatNode = await a.locator(".mobile-party-chat").elementHandle(), tableNode = await a.locator(".card-game").elementHandle();
    await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    for (const page of [a, b, c]) await expect(page.locator(".card-hand .lumio-card")).toHaveCount(7);
    const handBeforeReconnect = await b.locator(".card-hand button").allTextContents();
    const tableBeforeReconnect = await b.locator(".card-game").elementHandle();
    await contexts[1].setOffline(true);
    await expect(b.locator(".game-connection-notice")).toBeVisible();
    expect(await tableBeforeReconnect!.evaluate((node) => node === document.querySelector(".card-game"))).toBe(true);
    expect(await b.locator(".card-hand button").allTextContents()).toEqual(handBeforeReconnect);
    for (const card of await b.locator(".card-hand button").all()) await expect(card).toBeDisabled();
    await contexts[1].setOffline(false); await expect(b.locator(".game-connection-notice")).toHaveCount(0, { timeout: 15000 });
    expect(await b.locator(".card-hand button").allTextContents()).toEqual(handBeforeReconnect);
    await b.screenshot({ path: "test-results/g6-cards-table-desktop.png" }); await a.screenshot({ path: "test-results/g5-own-turn.png" });
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await a.setViewportSize({ width, height: 844 });
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await a.locator(".card-hand").evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
      const box = await a.locator(".card-hand .lumio-card").first().boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
      if ([320, 390, 430].includes(width)) await a.screenshot({ path: `test-results/g6-cards-table-${width}.png` });
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await expect(a.getByRole("button", { name: "Fila da Party", exact: true })).toHaveCount(0);
    await a.getByRole("button", { name: "Pessoas da Party", exact: true }).tap(); await expect(a.locator(".party-drawer")).toBeVisible(); await a.getByRole("button", { name: "Recolher painel da Party", exact: true }).tap(); await expect(a.locator(".party-drawer")).toHaveCount(0); expect(await tableNode!.evaluate((node) => node === document.querySelector(".card-game"))).toBe(true);
    const play = async (page: typeof a, label: string) => {
      const card = page.getByRole("button", { name: label, exact: true }); await expect(card).toBeEnabled();
      if (page === b) await card.click(); else await card.tap(); await expect(card).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Jogar selecionada", exact: true }).click();
      await expect(card).toHaveCount(0);
    };
    await play(a, "Menta 1"); await a.screenshot({ path: "test-results/g5-other-turn.png" });
    await b.reload(); await b.getByRole("button", { name: "Jogos", exact: true }).click(); await b.getByRole("button", { name: /Lumio Cartas 2/ }).click(); await expect(b.locator(".card-hand .lumio-card")).toHaveCount(7);
    await play(b, "Menta Virar"); await expect(a.locator(".card-table-status")).toContainText("Sentido inverso"); await a.screenshot({ path: "test-results/g5-reverse.png" });
    await play(a, "Menta Comprar 2"); await expect(c.locator(".card-hand .lumio-card")).toHaveCount(9); await c.screenshot({ path: "test-results/g5-draw-two.png" });
    await b.getByRole("button", { name: "Comprar 1", exact: true }).click();
    const wild = async (label: string, color: string) => {
      await a.getByRole("button", { name: label, exact: true }).tap(); await a.getByRole("button", { name: "Jogar selecionada", exact: true }).click();
      await expect(a.getByRole("group", { name: "Escolher cor", exact: true })).toBeVisible(); await a.screenshot({ path: "test-results/g6-cards-wild.png" });
      await a.getByRole("group", { name: "Escolher cor", exact: true }).getByRole("button", { name: color }).click();
      await expect(a.getByRole("group", { name: "Escolher cor", exact: true })).toHaveCount(0);
    };
    await wild("Mudar +4", "Menta"); await expect(c.locator(".card-hand .lumio-card")).toHaveCount(13);
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await c.setViewportSize({ width, height: 844 });
      expect(await c.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const hand = c.locator(".card-hand"), box = await hand.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await hand.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
      const last = await hand.locator("button").last().boundingBox(); expect(last!.x + last!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
      if (width === 320) await c.screenshot({ path: "test-results/g5-many-cards-scrolled-320.png" });
      await hand.evaluate((node) => { node.scrollLeft = 0; });
    }
    await c.setViewportSize({ width: 390, height: 844 }); await c.screenshot({ path: "test-results/g6-cards-many-hand.png" });
    await b.getByRole("button", { name: "Comprar 1", exact: true }).click(); await wild("Mudar cor", "Maré"); await a.screenshot({ path: "test-results/g5-few-cards.png" });
    await c.getByRole("button", { name: "Comprar 1", exact: true }).click(); await expect(c.getByRole("button", { name: "Manter e passar", exact: true })).toBeVisible(); await c.screenshot({ path: "test-results/g5-drawn-choice.png" }); await play(c, "Maré 4");
    await play(b, "Maré 1"); await play(a, "Maré 6"); await play(c, "Maré 0"); await play(b, "Maré 2");
    await a.getByRole("checkbox", { name: /Última!/ }).check(); await play(a, "Maré Pular"); await expect(a.locator(".card-players")).toContainText("Última!"); await a.screenshot({ path: "test-results/g6-cards-last.png" });
    await play(b, "Maré 3"); await play(a, "Maré 7"); await expect(a.locator(".card-game")).toHaveAttribute("data-phase", "RESULT");
    await expect(a.locator(".quiz-finale")).toContainText("Cards Ana"); await a.screenshot({ path: "test-results/g6-cards-result.png" });
    expect(await chatNode!.evaluate((node) => node === document.querySelector(".mobile-party-chat"))).toBe(true); await expect(chat).toHaveValue("rascunho Cartas G5");
    await a.getByRole("button", { name: "Jogar novamente", exact: true }).click(); await expect(a.locator(".card-game")).toHaveAttribute("data-phase", "LOBBY");
    await a.getByRole("button", { name: "Iniciar partida", exact: true }).click(); await expect(a.locator(".card-hand .lumio-card")).toHaveCount(7);
    await a.setViewportSize({ width: 844, height: 390 }); await a.getByRole("button", { name: "Tela cheia de Jogos", exact: true }).click(); await a.screenshot({ path: "test-results/g6-cards-landscape.png" });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const confirmBox = await a.getByRole("button", { name: "Jogar selecionada", exact: true }).boundingBox(); expect(confirmBox!.y + confirmBox!.height).toBeLessThanOrEqual(390);
    await a.getByRole("button", { name: "Sair da tela cheia de Jogos", exact: true }).click();
    await a.setViewportSize({ width: 390, height: 844 }); await a.getByRole("button", { name: "Voltar aos jogos", exact: true }).click();
    await a.getByRole("button", { name: /Quiz 2/ }).click(); await expect(a.getByRole("button", { name: "Retornar à partida" })).toBeVisible(); await a.getByRole("button", { name: "Retornar à partida" }).click();
    await expect(a.locator(".card-hand .lumio-card")).toHaveCount(7); expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map((ctx) => ctx.close())); }
});

test("G4 three authenticated clients: safe Quiz, lock/reconnect, navigation, six widths, result and rematch", async ({ browser, request }) => {
  test.setTimeout(180000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const displayName of ["Quiz Ana", "Quiz Bia", "Quiz Caio"]) {
    const email = `quiz-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "G4 Friends" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 3 } })).json();
  for (const s of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.token}/accept`, { headers: { Authorization: `Bearer ${s.token}` } })).status()).toBe(200);
  const contexts = await Promise.all(sessions.map((_, i) => browser.newContext(i === 1 ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })));
  const traffic: string[][] = [[], [], []], errors: string[] = [];
  try {
    for (let i = 0; i < 3; i++) await contexts[i].addInitScript((s) => localStorage.setItem("lumio.session.v1", JSON.stringify(s)), sessions[i]);
    const [a, b, c] = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    for (const [i, page] of [a, b, c].entries()) {
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("websocket", (ws) => ws.on("framereceived", (frame) => traffic[i].push(String(frame.payload))));
      await page.goto(`${origin}/house/${house.id}`); await page.getByRole("button", { name: "Jogos", exact: true }).click();
      await expect(page.getByRole("button", { name: /Desenhe e Adivinhe/ })).toBeVisible(); await expect(page.getByRole("button", { name: /Quiz 2/ })).toBeVisible();
      await page.screenshot({ path: `test-results/g4-hub-${i === 1 ? "desktop" : "mobile"}.png` });
      await page.getByRole("button", { name: /Quiz 2/ }).click(); await page.getByRole("button", { name: "Participar", exact: true }).click();
    }
    await expect(a.locator(".quiz-scoreboard li")).toHaveCount(3);
    await a.getByRole("button", { name: "5", exact: true }).click(); await expect(c.getByRole("button", { name: "5", exact: true })).toHaveAttribute("aria-pressed", "true");
    await a.getByLabel("Categoria").selectOption("math"); await expect(c.getByLabel("Categoria")).toHaveValue("math");
    await a.getByLabel("Dificuldade").selectOption("easy"); await expect(c.getByLabel("Dificuldade")).toHaveValue("easy");
    await expect(b.getByLabel("Categoria")).toBeDisabled();
    await a.screenshot({ path: "test-results/g4-lobby-mobile.png" }); await b.screenshot({ path: "test-results/g6-quiz-lobby.png" });
    const quizNode = await a.locator(".quiz-game").elementHandle();
    await expect(a.getByRole("button", { name: "Fila da Party", exact: true })).toHaveCount(0);
    await a.getByRole("button", { name: "Pessoas da Party", exact: true }).click(); await expect(a.locator(".party-drawer")).toBeVisible(); await a.getByRole("button", { name: "Recolher painel da Party", exact: true }).click(); await expect(a.locator(".party-drawer")).toHaveCount(0); expect(await quizNode!.evaluate((node) => node === document.querySelector(".quiz-game"))).toBe(true);
    const chatNode = await a.locator(".mobile-party-chat").elementHandle();
    await a.locator(".mobile-party-chat").getByRole("textbox").fill("rascunho Quiz G4");
    await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    const prompts = new Set<string>();
    for (let round = 1; round <= 5; round++) {
      await expect(a.locator(".quiz-game")).toHaveAttribute("data-phase", "QUESTION"); await expect(a.locator(".quiz-heading")).toContainText(`Pergunta ${round} de 5`);
      const prompt = (await a.locator(".quiz-question").textContent())!; prompts.add(prompt);
      const question = quizQuestions.find((q) => q.prompt === prompt)!;
      if (round === 1) {
        await b.screenshot({ path: "test-results/g6-quiz-question-desktop.png" });
        for (const width of [320, 360, 375, 390, 412, 430]) {
          await a.setViewportSize({ width, height: 844 }); await expect(a.locator(".quiz-answers button")).toHaveCount(4);
          expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          for (const option of await a.locator(".quiz-answers button").all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          if ([320, 390, 430].includes(width)) await a.screenshot({ path: `test-results/g6-quiz-question-${width}.png` });
        }
        await a.setViewportSize({ width: 390, height: 844 });
      }
      const option = (await a.locator(".quiz-answers button>span:nth-child(2)").allTextContents()).indexOf(question.answers[question.correctIndex]); expect(option).toBeGreaterThanOrEqual(0);
      await a.locator(".quiz-answers button").nth(option).click(); await expect(a.locator(".quiz-answer-status")).toContainText("Resposta enviada");
      await expect(a.locator(".quiz-answers button").nth((option + 1) % 4)).toBeDisabled();
      if (round === 1) {
        await a.screenshot({ path: "test-results/g6-quiz-locked.png" });
        for (const payloads of traffic.slice(1)) for (const payload of payloads) expect(payload).not.toMatch(/"correctIndex"|"ownCorrect"|"ownPoints"|"distribution"|"explanation"/);
        await a.getByRole("button", { name: "Voltar aos jogos", exact: true }).click(); await expect(a.getByRole("heading", { name: "O que vamos jogar?" })).toBeVisible();
        await a.getByRole("button", { name: /Desenhe e Adivinhe/ }).click(); await expect(a.getByRole("button", { name: "Retornar à partida" })).toBeVisible(); await a.getByRole("button", { name: "Retornar à partida" }).click();
        await expect(a.locator(".quiz-answer-status")).toContainText("Resposta enviada");
      }
      if (round === 2) {
        await b.locator(".quiz-answers button").nth(option).click();
        await expect(b.locator(".quiz-answer-status")).toContainText("Resposta enviada");
        const questionBeforeReconnect = await b.locator(".quiz-question").textContent();
        const quizBeforeReconnect = await b.locator(".quiz-game").elementHandle();
        await contexts[1].setOffline(true); await expect(b.locator(".game-connection-notice")).toBeVisible();
        expect(await quizBeforeReconnect!.evaluate((node) => node === document.querySelector(".quiz-game"))).toBe(true);
        await expect(b.locator(".quiz-question")).toHaveText(questionBeforeReconnect!);
        await contexts[1].setOffline(false); await expect(b.locator(".game-connection-notice")).toHaveCount(0, { timeout: 15000 });
        await expect(b.locator(".quiz-answer-status")).toContainText("Resposta enviada");
        await b.reload(); await b.getByRole("button", { name: "Jogos", exact: true }).click(); await b.getByRole("button", { name: /Quiz 2/ }).click();
        await expect(b.locator(".quiz-game")).toHaveAttribute("data-phase", "QUESTION");
        await expect(b.locator(".quiz-answer-status")).toContainText("Resposta enviada");
        for (const answer of await b.locator(".quiz-answers button").all()) await expect(answer).toBeDisabled();
        await a.setViewportSize({ width: 844, height: 390 });
        await a.getByRole("button", { name: "Tela cheia de Jogos", exact: true }).click();
        await a.screenshot({ path: "test-results/g6-quiz-landscape.png" });
        expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        for (const option of await a.locator(".quiz-answers button").all()) { const box = (await option.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(44); expect(box.y + box.height).toBeLessThanOrEqual(390); }
        await a.getByRole("button", { name: "Sair da tela cheia de Jogos", exact: true }).click();
        await a.setViewportSize({ width: 390, height: 844 });
      }
      if (round !== 2) await b.locator(".quiz-answers button").nth(option).click();
      await c.locator(".quiz-answers button").nth(option).click();
      await expect(a.locator(".quiz-game")).toHaveAttribute("data-phase", "REVEAL"); await expect(a.locator(".quiz-answer-status")).toContainText("Você acertou");
      await expect(a.locator(".quiz-answers .correct")).toContainText("3 respostas");
      if (round === 1) { await a.screenshot({ path: "test-results/g6-quiz-reveal.png" }); await a.locator(".quiz-scoreboard").scrollIntoViewIfNeeded(); await a.screenshot({ path: "test-results/g4-score.png" }); }
      if (round < 5) await expect(a.locator(".quiz-heading")).toContainText(`Pergunta ${round + 1} de 5`, { timeout: 10000 });
    }
    await expect(a.locator(".quiz-game")).toHaveAttribute("data-phase", "RESULT", { timeout: 10000 }); expect(prompts.size).toBe(5);
    const quizRematch = (await a.getByRole("button", { name: "Jogar novamente", exact: true }).boundingBox())!;
    expect(quizRematch.y + quizRematch.height).toBeLessThanOrEqual(844);
    await a.screenshot({ path: "test-results/g6-quiz-result.png" }); expect(await chatNode!.evaluate((node) => node === document.querySelector(".mobile-party-chat"))).toBe(true);
    await expect(a.locator(".mobile-party-chat").getByRole("textbox")).toHaveValue("rascunho Quiz G4");
    await a.getByRole("button", { name: "Jogar novamente", exact: true }).click(); await expect(a.locator(".quiz-game")).toHaveAttribute("data-phase", "LOBBY");
    await expect(a.getByLabel("Categoria")).toHaveValue("math"); await expect(a.locator(".quiz-scoreboard strong")).toHaveText(["0", "0", "0"]);
    await a.getByRole("button", { name: "Voltar aos jogos", exact: true }).click(); await a.getByRole("button", { name: "Encerrar sessão de jogo", exact: true }).click(); await a.getByRole("button", { name: "Confirmar encerramento", exact: true }).click();
    await expect(a.getByRole("button", { name: "Confirmar encerramento", exact: true })).toHaveCount(0);
    await a.getByRole("button", { name: /Desenhe e Adivinhe/ }).click(); await a.getByRole("button", { name: "Participar", exact: true }).click(); await a.screenshot({ path: "test-results/g4-draw-navigation-mobile.png" });
    await a.getByRole("button", { name: "Voltar aos jogos", exact: true }).click(); await a.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click(); await a.getByRole("button", { name: "Jogos", exact: true }).click(); await a.getByRole("button", { name: /Desenhe e Adivinhe/ }).click(); await expect(a.getByRole("button", { name: "Sair do jogo", exact: true })).toBeVisible();
    await b.getByRole("button", { name: "Voltar aos jogos", exact: true }).click(); await b.getByRole("button", { name: /Desenhe e Adivinhe/ }).click(); await b.screenshot({ path: "test-results/g4-draw-navigation-desktop.png" });
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map((ctx) => ctx.close())); }
});

test("G2 three-user Draw Game: integrated chat, privacy, shortcuts, score, mobile and fullscreen", async ({ browser, request }) => {
  test.setTimeout(300000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const displayName of ["Draw Ana", "Draw Bia", "Draw Caio"]) {
    const email = `draw-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "G1 Friends" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 3 } })).json();
  for (const session of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.token}/accept`, { headers: { Authorization: `Bearer ${session.token}` } })).status()).toBe(200);
  const contexts = await Promise.all(sessions.map((_, index) => browser.newContext(index === 0 ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } })));
  try {
    for (let i = 0; i < 3; i++) await contexts[i].addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), sessions[i]);
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    const errors: string[] = [], capturedLogs: string[] = [];
    for (const page of [a, b, c]) {
      page.on("pageerror", (error) => errors.push(error.message));
      if (page !== a) page.on("console", (message) => capturedLogs.push(message.text()));
    }
    for (const page of [a, b, c]) {
      await page.goto(`${origin}/house/${house.id}`);
      await page.getByRole("button", { name: "Jogos", exact: true }).click();
      if (page === a) for (const width of [320, 360, 375, 390, 412, 430]) {
        await a.setViewportSize({ width, height: 844 });
        await expect(a.getByRole("button", { name: /Desenhe e Adivinhe/ })).toBeVisible();
        expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      if (page === a) await a.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `test-results/g2-hub-${page === a ? "mobile" : "desktop"}.png` });
      await page.getByRole("button", { name: /Desenhe e Adivinhe/ }).click();
      await page.getByRole("button", { name: "Participar", exact: true }).click();
      await page.screenshot({ path: `test-results/g2-lobby-${page === a ? "mobile" : "desktop"}.png` });
    }
    await expect(a.getByRole("list", { name: "Placar do jogo" }).locator("li")).toHaveCount(3);
    await b.getByRole("textbox", { name: "Mensagem", exact: true }).fill("rascunho normal preservado");
    await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    await expect(a.getByRole("dialog", { name: "Escolha o que você vai desenhar" })).toBeVisible();
    await expect(a.locator(".draw-choices button").first()).toBeFocused();
    await a.keyboard.press("Shift+Tab"); await expect(a.locator(".draw-choices button").last()).toBeFocused();
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await a.setViewportSize({ width, height: 844 });
      const box = await a.getByRole("dialog", { name: "Escolha o que você vai desenhar" }).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await a.setViewportSize({ width: 640, height: 450 });
    await expect(a.getByRole("dialog", { name: "Escolha o que você vai desenhar" })).toBeVisible();
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await a.screenshot({ path: "test-results/gx421-zoom200-real-word-choice.png" });
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({ path: "test-results/g6-draw-word-choice.png" });
    const choiceWords = await a.locator(".draw-choices button").allTextContents();
    const word = [...choiceWords].sort((left, right) => right.length - left.length)[0];
    await a.locator(".draw-choices button").filter({ hasText: word }).click();
    for (const page of [b, c]) { await expect(page.locator(".draw-word")).not.toContainText(word); await expect(page.getByRole("textbox", { name: "Seu palpite" })).toBeVisible(); }
    await expect(a.locator(".draw-word")).toHaveText(word);
    for (const page of [b, c]) {
      await expect(page.locator(".draw-choices button")).toHaveCount(0);
      const carriers = await page.evaluate((terms) => {
        const pattern = (term: string) => new RegExp(`(^|[^\\p{L}])${term}($|[^\\p{L}])`, "iu");
        const hasTerm = (value: string) => terms.some((term) => pattern(term).test(value));
        const elements = [...document.querySelectorAll<HTMLElement>("*")];
        const stores = [localStorage, sessionStorage].map((store) => Array.from({ length: store.length }, (_, index) => `${store.key(index)}:${store.getItem(store.key(index)!)}`).join(" "));
        return {
          textContent: hasTerm(document.body.textContent ?? ""),
          value: elements.some((element) => "value" in element && hasTerm(String((element as HTMLInputElement).value))),
          attributes: elements.some((element) => [...element.attributes].some((attribute) => hasTerm(attribute.value))),
          descriptions: elements.some((element) => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).some((id) => id && hasTerm(document.getElementById(id)?.textContent ?? ""))),
          localStorage: hasTerm(stores[0]), sessionStorage: hasTerm(stores[1]),
        };
      }, choiceWords);
      expect(Object.values(carriers).every((found) => !found)).toBe(true);
      const accessible = await page.locator("body").ariaSnapshot();
      for (const term of choiceWords) expect(accessible.toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR"))).toBe(false);
    }
    expect(capturedLogs.some((message) => choiceWords.some((term) => message.toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR"))))).toBe(false);
    const board = (page: typeof a) => page.locator(".draw-board canvas").evaluate((node: HTMLCanvasElement) => node.toDataURL());
    const blank = await board(b);
    const canvas = a.locator(".draw-board canvas"); await canvas.scrollIntoViewIfNeeded();
    const rect = (await canvas.boundingBox())!;
    const cdp = await contexts[0].newCDPSession(a);
    const point = (x: number, y: number) => ({ x: rect.x + rect.width * x, y: rect.y + rect.height * y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(.2, .2)] });
    for (let i = 3; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(i / 10, i / 10)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => board(b)).not.toBe(blank); await expect.poll(() => board(c)).toBe(await board(b));
    expect(await board(a)).toBe(await board(b));
    const pixel = (page: typeof a, x: number, y: number) => page.locator(".draw-board canvas").evaluate((node: HTMLCanvasElement, coords) => [...node.getContext("2d")!.getImageData(Math.floor(coords.x * node.width), Math.floor(coords.y * node.height), 1, 1).data].join(","), { x, y });
    const ghostPixel = await pixel(b, .85, .15);
    const beforeCancel = await board(b);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(.1, .7)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(.2, .7)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(.2, .7), point(.85, .15)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(.25, .7), point(.85, .15)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect.poll(() => board(b)).not.toBe(beforeCancel);
    expect(await pixel(b, .85, .15)).toBe(ghostPixel);
    const afterCancel = await board(b);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(.7, .2)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => board(b)).not.toBe(afterCancel);
    await expect.poll(() => board(c)).toBe(await board(b));
    const drawn = await board(b);
    const canvasBeforeReconnect = await a.locator(".draw-board canvas").elementHandle();
    await contexts[0].setOffline(true); await expect(a.locator(".game-connection-notice")).toBeVisible();
    expect(await canvasBeforeReconnect!.evaluate((node) => node === document.querySelector(".draw-board canvas"))).toBe(true);
    expect(await board(a)).toBe(drawn); await expect(a.locator(".mobile-party-chat")).toBeHidden();
    await contexts[0].setOffline(false); await expect(a.locator(".game-connection-notice")).toHaveCount(0, { timeout: 15000 });
    expect(await board(a)).toBe(drawn);
    await expect(b.getByRole("textbox", { name: "Seu palpite" })).toHaveValue("rascunho normal preservado");
    await b.setViewportSize({ width: 1262, height: 632 });
    const desktopBoard = (await b.locator(".draw-board canvas").boundingBox())!;
    const desktopGuess = (await b.getByRole("textbox", { name: "Seu palpite" }).boundingBox())!;
    expect(desktopBoard.y + desktopBoard.height).toBeLessThanOrEqual(632); expect(desktopGuess.y + desktopGuess.height).toBeLessThanOrEqual(632);
    expect(await board(b)).toBe(drawn);
    const zoomContext = await browser.newContext({ viewport: { width: 640, height: 450 } });
    try {
      await zoomContext.addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), sessions[1]);
      const zoomPage = await zoomContext.newPage();
      await zoomPage.goto(`${origin}/house/${house.id}`);
      await zoomPage.getByRole("button", { name: "Jogos", exact: true }).click();
      await zoomPage.getByRole("button", { name: /Desenhe e Adivinhe/ }).click();
      await expect(zoomPage.getByRole("textbox", { name: "Seu palpite" })).toBeVisible();
      expect(await zoomPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await zoomPage.getByRole("textbox", { name: "Seu palpite" }).scrollIntoViewIfNeeded();
      await zoomPage.screenshot({ path: "test-results/gx421-zoom200-real-guesser.png" });
    } finally { await zoomContext.close(); }
    await a.getByRole("button", { name: "Borracha", exact: true }).click(); await canvas.scrollIntoViewIfNeeded();
    const erase = (await canvas.boundingBox())!;
    await a.mouse.move(erase.x + erase.width * .3, erase.y + erase.height * .3); await a.mouse.down();
    await a.mouse.move(erase.x + erase.width * .6, erase.y + erase.height * .6, { steps: 5 }); await a.mouse.up();
    await expect.poll(() => board(b)).not.toBe(drawn);
    await a.keyboard.press("Control+z"); await expect.poll(() => board(b)).toBe(drawn);
    await b.getByRole("textbox", { name: "Seu palpite" }).focus(); await b.keyboard.press("Control+z"); expect(await board(b)).toBe(drawn);
    await expect(a.locator(".mobile-party-chat")).toBeHidden();
    await a.getByRole("button", { name: "Pincel", exact: true }).click(); await canvas.scrollIntoViewIfNeeded();
    const redo = (await canvas.boundingBox())!;
    await a.mouse.move(redo.x + redo.width * .6, redo.y + redo.height * .2); await a.mouse.down(); await a.mouse.move(redo.x + redo.width * .6, redo.y + redo.height * .7, { steps: 4 }); await a.mouse.up();
    await expect.poll(() => board(b)).not.toBe(drawn);
    await a.keyboard.press("Meta+z"); await expect.poll(() => board(b)).toBe(drawn);
    await a.screenshot({ path: "test-results/g2-drawer-mobile.png" }); await b.screenshot({ path: "test-results/g6-draw-guesser-desktop.png" });
    await b.reload(); await b.getByRole("button", { name: "Jogos", exact: true }).click(); await b.getByRole("button", { name: /Desenhe e Adivinhe/ }).click();
    await expect.poll(() => board(b)).toBe(drawn); await expect(b.locator(".draw-word")).not.toContainText(word);
    await b.getByRole("textbox", { name: "Seu palpite" }).fill("rascunho normal preservado");
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await a.setViewportSize({ width, height: 844 }); await canvas.scrollIntoViewIfNeeded();
      const box = (await canvas.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(width - 40); expect(Math.abs(box.width / box.height - 4 / 3)).toBeLessThan(.02);
      const undo = await a.getByRole("button", { name: "Desfazer", exact: true }).boundingBox();
      expect(undo!.height).toBeGreaterThanOrEqual(44); expect(undo!.y + undo!.height).toBeLessThanOrEqual(844);
      expect(await canvas.evaluate((node) => getComputedStyle(node).touchAction)).toBe("none");
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(a.locator(".mobile-party-chat")).toBeHidden();
      expect(await board(a)).toBe(drawn);
      await a.screenshot({ path: `test-results/g2-mobile-${width}.png` });
    }
    await b.getByRole("textbox", { name: "Seu palpite" }).fill("Chat integrado ao jogo"); await b.getByRole("button", { name: "Enviar palpite", exact: true }).click();
    await expect(c.locator(".draw-activity-feed")).toContainText("Chat integrado ao jogo");
    await b.getByRole("textbox", { name: "Seu palpite" }).fill("rascunho normal preservado");
    await a.getByRole("button", { name: "Tela cheia de Jogos", exact: true }).click(); await expect(a.locator(".mobile-party-chat")).toBeHidden();
    expect(await board(a)).toBe(drawn);
    await a.getByRole("button", { name: "Sair da tela cheia de Jogos", exact: true }).click();
    await a.setViewportSize({ width: 844, height: 390 });
    await a.getByRole("button", { name: "Tela cheia de Jogos", exact: true }).click(); expect(await board(a)).toBe(drawn);
    await canvas.scrollIntoViewIfNeeded(); const landscapeBoard = (await canvas.boundingBox())!;
    expect(landscapeBoard.y).toBeGreaterThanOrEqual(0); expect(landscapeBoard.y + landscapeBoard.height).toBeLessThanOrEqual(390);
    await a.screenshot({ path: "test-results/g2-landscape-fullscreen.png" });
    await a.getByRole("button", { name: "Sair da tela cheia de Jogos", exact: true }).click(); await a.setViewportSize({ width: 390, height: 844 });
    await a.getByRole("button", { name: "Limpar tela", exact: true }).click();
    expect(await board(c)).toBe(drawn);
    await a.getByRole("button", { name: "Confirmar limpeza", exact: true }).click(); await expect.poll(() => board(c)).toBe(blank);
    await b.getByRole("textbox", { name: "Seu palpite" }).fill("resposta incorreta"); await b.getByRole("button", { name: "Enviar palpite", exact: true }).click();
    await expect(c.locator(".draw-activity-feed")).toContainText("Draw Bia: resposta incorreta");
    const typo = `${word.slice(0, -1)}${word.endsWith("x") ? "z" : "x"}`;
    await b.getByRole("textbox", { name: "Seu palpite" }).fill(typo); await b.getByRole("button", { name: "Enviar palpite", exact: true }).click();
    await expect(b.getByRole("status").filter({ hasText: "Quase! Seu palpite está próximo." })).toBeVisible();
    await expect(c.locator(".draw-activity-feed")).toContainText(typo);
    await expect(c.locator(".composer-near")).toHaveCount(0);
    await b.getByRole("textbox", { name: "Seu palpite" }).fill(word); await b.getByRole("button", { name: "Enviar palpite", exact: true }).click();
    await expect(b.locator(".draw-role-tag")).toContainText("Você acertou"); await expect(c.locator(".draw-word")).not.toContainText(word);
    await expect(c.locator(".draw-activity-feed")).not.toContainText(word);
    await expect(a.locator(".draw-award")).toHaveText("+2 pts");
    await expect(a.locator(".draw-earned")).toContainText("pelos acertos no seu desenho");
    await expect(b.getByRole("list", { name: "Placar do jogo" }).locator("li").first()).toContainText("Draw Bia");
    await expect(b.getByRole("list", { name: "Placar do jogo" }).locator("li").first().locator(".draw-score-gain")).toBeVisible();
    await expect(b.getByRole("textbox", { name: "Mensagem", exact: true })).toBeEmpty();
    await b.getByRole("textbox", { name: "Mensagem", exact: true }).fill("Já acertei, posso conversar");
    await b.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
    await expect(c.locator(".draw-activity-feed")).toContainText("Já acertei, posso conversar");
    await c.setViewportSize({ width: 390, height: 500 });
    await expect(c.locator(".app-shell")).toHaveClass(/mobile-party/);
    await expect(c.getByRole("textbox", { name: "Seu palpite" })).toBeVisible();
    await expect.poll(async () => { const box = await c.getByRole("textbox", { name: "Seu palpite" }).boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(500);
    const shortGuesserBoard = (await c.locator(".draw-board").boundingBox())!;
    expect(Math.abs(shortGuesserBoard.width / shortGuesserBoard.height - 4 / 3)).toBeLessThan(.03);
    await c.screenshot({ path: "test-results/g2-guesser-mobile.png" });
    expect(await c.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await c.setViewportSize({ width: 844, height: 390 });
    await c.getByRole("button", { name: "Tela cheia de Jogos", exact: true }).click();
    const fullscreenComposer = c.locator(".draw-guess-composer");
    await expect(fullscreenComposer.getByRole("textbox", { name: "Seu palpite" })).toBeVisible();
    await expect.poll(async () => { const box = await fullscreenComposer.getByRole("textbox", { name: "Seu palpite" }).boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(390);
    await fullscreenComposer.getByRole("textbox", { name: "Seu palpite" }).fill(word); await fullscreenComposer.getByRole("button", { name: "Enviar palpite", exact: true }).click();
    await expect(c.locator(".draw-word")).toHaveText(`Era: ${word}`);
    await c.screenshot({ path: "test-results/g2-round-result.png" });
    await c.getByRole("button", { name: "Sair da tela cheia de Jogos", exact: true }).click();
    await expect(b.locator(".draw-choices button")).toHaveCount(3, { timeout: 10000 }); await expect(a.locator(".draw-choices button")).toHaveCount(0);
    await b.locator(".draw-choices button").first().click();
    await b.screenshot({ path: "test-results/g6-draw-drawer-desktop.png" });
    await b.getByRole("button", { name: "Sair do jogo", exact: true }).click();
    await c.getByRole("button", { name: "Sair do jogo", exact: true }).click();
    await c.getByRole("textbox", { name: "Mensagem", exact: true }).fill("Observando e conversando");
    await c.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
    await expect(a.locator(".draw-activity-feed")).toContainText("Observando e conversando");
    await expect(a.getByText("Partida concluída", { exact: true })).toBeVisible({ timeout: 10000 });
    await a.screenshot({ path: "test-results/g2-game-result.png" });
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});

test("G3 configurable target match: mobile roles preserve Chat, geometry, rotation, victory and rematch", async ({ browser, request }) => {
  test.setTimeout(180000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const displayName of ["G3 Ana", "G3 Bia", "G3 Caio"]) {
    const email = `g3-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "G3 Friends" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 3 } })).json();
  for (const s of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.token}/accept`, { headers: { Authorization: `Bearer ${s.token}` } })).status()).toBe(200);
  const contexts = await Promise.all(sessions.map(() => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })));
  try {
    for (let i = 0; i < 3; i++) await contexts[i].addInitScript((s) => localStorage.setItem("lumio.session.v1", JSON.stringify(s)), sessions[i]);
    const pages = await Promise.all(contexts.map((context) => context.newPage())), [a, b, c] = pages;
    const errors: string[] = []; pages.forEach((page) => page.on("pageerror", (error) => errors.push(error.message)));
    for (const page of pages) {
      await page.goto(`${origin}/house/${house.id}`); await page.getByRole("button", { name: "Jogos", exact: true }).click();
      await page.getByRole("button", { name: /Desenhe e Adivinhe/ }).click(); await page.getByRole("button", { name: "Participar", exact: true }).click();
    }
    await expect(a.getByRole("list", { name: "Placar do jogo" }).locator("li")).toHaveCount(3);
    await a.getByRole("group", { name: "Meta de pontos" }).getByRole("button", { name: "50", exact: true }).click();
    await a.getByLabel("Tema", { exact: true }).selectOption("animals");
    for (const page of pages) { await expect(page.getByLabel("Tema", { exact: true })).toHaveValue("animals"); await expect(page.locator(".draw-match-meta")).toHaveText("Animais · Meta 50"); }
    await expect(b.getByLabel("Tema", { exact: true })).toBeDisabled();
    await a.screenshot({ path: "test-results/g3-lobby-mobile.png" });
    const startBox = (await a.getByRole("button", { name: "Iniciar partida", exact: true }).boundingBox())!;
    expect(startBox.y + startBox.height).toBeLessThanOrEqual(844);
    await a.setViewportSize({ width: 1280, height: 900 }); await a.screenshot({ path: "test-results/g6-draw-lobby.png" });
    await a.setViewportSize({ width: 390, height: 844 });
    await b.getByRole("textbox", { name: "Mensagem", exact: true }).fill("rascunho antes de desenhar G3");
    await b.evaluate(() => { (window as any).g3ChatNode = document.querySelector(".mobile-party-chat"); });
    await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    const drawerHeights: Record<number, number> = {}, guesserHeights: Record<number, number> = {};
    const send = async (page: typeof a, text: string) => { await page.getByRole("textbox", { name: "Seu palpite", exact: true }).fill(text); await page.getByRole("button", { name: "Enviar palpite", exact: true }).click(); };
    for (let round = 1; round <= 18; round++) {
      const drawer = pages[(round - 1) % 3];
      await expect(drawer.locator(".draw-choices button").first()).toBeVisible({ timeout: 10000 });
      if (round === 1) await drawer.screenshot({ path: "test-results/g3-theme-choice.png" });
      const word = (await drawer.locator(".draw-choices button").first().textContent())!;
      expect(drawWordBanks.animals).toContain(word);
      await drawer.locator(".draw-choices button").first().click();
      await expect(drawer.locator(".party-workspace")).toHaveAttribute("data-game-role", "drawer");
      await expect(drawer.locator(".mobile-party-chat")).toBeHidden();
      await expect(drawer.locator(".draw-word")).toHaveText(word);
      const guessers = pages.filter((page) => page !== drawer);
      for (const page of guessers) { await expect(page.locator(".draw-word")).not.toContainText(word); await expect(page.locator(".party-workspace")).toHaveAttribute("data-game-role", "guesser"); }
      if (round === 1) {
        for (const width of [320, 360, 375, 390, 412, 430]) {
          for (const page of [a, b]) await page.setViewportSize({ width, height: 844 });
          const db = (await a.locator(".draw-board canvas").boundingBox())!, gb = (await b.locator(".draw-board canvas").boundingBox())!;
          drawerHeights[width] = db.height; guesserHeights[width] = gb.height;
          expect(db.height).toBeGreaterThan(gb.height * 1.08);
          expect(Math.abs(db.width / db.height - 4 / 3)).toBeLessThan(.02);
          const messages = (await b.locator(".draw-activity-feed").boundingBox())!;
          expect(messages.height).toBeGreaterThan(190);
          expect((await b.getByRole("textbox", { name: "Seu palpite" }).boundingBox())!.y + 44).toBeLessThanOrEqual(844);
          for (const page of [a, b]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await expect(a.getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
          await expect(a.getByLabel("Espessura", { exact: true })).toBeVisible();
          await a.screenshot({ path: `test-results/g6-draw-drawer-${width}.png` }); await b.screenshot({ path: `test-results/g6-draw-guesser-${width}.png` });
        }
        for (const page of [a, b]) await page.setViewportSize({ width: 320, height: 568 });
        const shortDrawer = (await a.locator(".draw-board canvas").boundingBox())!;
        const shortGuesser = (await b.locator(".draw-board canvas").boundingBox())!;
        expect(shortDrawer.height).toBeGreaterThan(100);
        expect(shortGuesser.height).toBeGreaterThan(80);
        const shortGuesserShell = (await b.locator(".draw-board").boundingBox())!;
        expect(Math.abs(shortGuesserShell.width / shortGuesserShell.height - 4 / 3)).toBeLessThan(.03);
        expect((await b.getByRole("textbox", { name: "Seu palpite" }).boundingBox())!.y + 44).toBeLessThanOrEqual(568);
        for (const page of [a, b]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await a.screenshot({ path: "test-results/gx42-drawer-320x568.png" });
        await b.screenshot({ path: "test-results/gx42-guesser-320x568.png" });
        for (const page of [a, b]) await page.setViewportSize({ width: 390, height: 844 });
        await b.setViewportSize({ width: 390, height: 500 });
        await b.getByRole("textbox", { name: "Seu palpite" }).focus();
        expect((await b.locator(".draw-activity-feed").boundingBox())!.height).toBeGreaterThan(65);
        const composer = (await b.getByRole("textbox", { name: "Seu palpite" }).boundingBox())!; expect(composer.y + composer.height).toBeLessThanOrEqual(500);
        const shortBoard = (await b.locator(".draw-board canvas").boundingBox())!, shortStage = (await b.locator(".main-stage").boundingBox())!;
        expect(shortBoard.y + shortBoard.height).toBeLessThanOrEqual(shortStage.y + shortStage.height);
        const shortBoardShell = (await b.locator(".draw-board").boundingBox())!;
        expect(Math.abs(shortBoardShell.width / shortBoardShell.height - 4 / 3)).toBeLessThan(.03);
        await b.screenshot({ path: "test-results/g3-guesser-keyboard.png" }); await b.setViewportSize({ width: 390, height: 844 });
        await a.setViewportSize({ width: 844, height: 390 }); await a.getByRole("button", { name: "Tela cheia de Jogos", exact: true }).click();
        await a.screenshot({ path: "test-results/g3-drawer-landscape.png" });
        await a.getByRole("button", { name: "Sair da tela cheia de Jogos", exact: true }).click(); await a.setViewportSize({ width: 390, height: 844 });
      }
      if (round === 2) {
        expect(await b.evaluate(() => (window as any).g3ChatNode === document.querySelector(".mobile-party-chat"))).toBe(true);
        await c.getByRole("textbox", { name: "Seu palpite", exact: true }).fill("mensagem recebida enquanto Bia desenha");
        await c.getByRole("button", { name: "Enviar palpite", exact: true }).click();
      }
      for (const page of guessers) await send(page, word);
      await expect(drawer.locator(".draw-word")).toHaveText(`Era: ${word}`);
      if (round === 2) {
        await expect(b.locator(".mobile-party-chat")).toBeHidden();
        await expect(b.getByRole("textbox", { name: "Mensagem", exact: true })).toBeEmpty();
        await expect(b.locator(".draw-activity-feed")).toContainText("mensagem recebida enquanto Bia desenha");
        expect(await b.evaluate(() => (window as any).g3ChatNode === document.querySelector(".mobile-party-chat"))).toBe(true);
        await b.screenshot({ path: "test-results/g3-round-result.png" });
      }
      if (round === 3) {
        await expect(b.locator(".party-workspace")).toHaveAttribute("data-game-role", "neutral");
        await b.screenshot({ path: "test-results/g3-returned-chat.png" });
      }
      const targetReached = await a.locator(".draw-scoreboard strong").evaluateAll((nodes) => nodes.some((node) => Number(node.textContent!.split("/")[0]) >= 50));
      if (round >= 6) await a.screenshot({ path: "test-results/g3-score-near-target.png" });
      if (targetReached) {
        await expect(a.locator(".draw-finale")).toContainText("Meta 50 alcançada", { timeout: 10000 });
        const drawRematch = (await a.getByRole("button", { name: "Jogar novamente", exact: true }).boundingBox())!;
        expect(drawRematch.y + drawRematch.height).toBeLessThanOrEqual(844);
        const drawResultStage = (await a.locator(".main-stage").boundingBox())!;
        expect(drawRematch.y + drawRematch.height).toBeLessThanOrEqual(drawResultStage.y + drawResultStage.height);
        await a.screenshot({ path: "test-results/g6-draw-result.png" });
        await a.getByRole("button", { name: "Jogar novamente", exact: true }).click();
        await expect(a.getByRole("button", { name: "Iniciar partida", exact: true })).toBeVisible();
        for (const page of pages) { await expect(page.getByLabel("Tema", { exact: true })).toHaveValue("animals"); await expect(page.locator(".draw-scoreboard strong").first()).toHaveText("0/50"); }
        await a.getByRole("group", { name: "Meta de pontos" }).getByRole("button", { name: "100", exact: true }).click();
        await expect(c.locator(".draw-match-meta")).toHaveText("Animais · Meta 100");
        expect(round).toBeGreaterThan(6); break;
      }
      if (round === 18) throw new Error("Target match did not finish");
    }
    console.log("G3 canvas heights", { drawerHeights, guesserHeights }); expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});

const root = path.resolve(__dirname, "..");
const serverRoot = path.join(root, "apps", "server");
const webRoot = path.join(root, "apps", "web");
const freePort = () => new Promise<number>((resolve, reject) => {
  const socket = net.createServer();
  socket.once("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const address = socket.address();
    socket.close(() => address && typeof address !== "string" ? resolve(address.port) : reject(new Error("No free port")));
  });
});

let directory = "";
let apiPort = 0;
let webPort = 0;
let server: ChildProcess;
let web: ChildProcess;
let serverOutput = "";

const waitFor = async (url: string) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local service did not start: ${url}; server output: ${serverOutput.slice(-500)}`);
};

test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-e2e-"));
  apiPort = await freePort();
  webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  server = spawn(process.execPath, ["--import", "tsx", "--import", pathToFileURL(path.join(root, "e2e/fixtures/cardDeckLoader.mjs")).href, "src/index.ts"], {
    cwd: serverRoot,
    env: { ...process.env, PORT: String(apiPort), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: path.join(directory, "mail.jsonl"), APP_PUBLIC_URL: origin, CLIENT_ORIGIN: origin, RTC_STUN_URLS: "", RTC_TURN_URLS: "", RTC_TURN_USERNAME: "", RTC_TURN_CREDENTIAL: "", YOUTUBE_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const output of [server.stdout, server.stderr]) output?.on("data", (chunk: Buffer) => { serverOutput += chunk.toString(); });
  await waitFor(`http://127.0.0.1:${apiPort}/api/health`);
  web = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
    cwd: webRoot,
    env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_AUTH_SIGNUP_MODE: "", VITE_GOOGLE_CLIENT_ID: "" },
    stdio: "ignore",
  });
  await waitFor(origin);
});

test.afterAll(async () => {
  server?.kill();
  web?.kill();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

test("Landing → login → restored session → House → Party → queue/drawer → logout", async ({ page, request }) => {
  const origin = `http://127.0.0.1:${webPort}`;
  const api = `http://127.0.0.1:${apiPort}`;
  const email = `qa-${crypto.randomUUID()}@example.test`;
  const password = "local-e2e-password-123";
  await page.goto(origin);
  await expect(page.getByRole("heading", { name: /Fiquem juntos/i })).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);

  const signup = await request.post(`${api}/api/auth/signup`, { data: { displayName: "QA Browser", email, password } });
  expect(signup.status()).toBe(201);
  const mail = fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { text: string });
  const link = mail.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
  expect(link).toBeTruthy();
  const token = new URL(link!).hash.slice("#token=".length);
  expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token } })).status()).toBe(204);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Você ainda não faz parte de uma Casa." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Você ainda não faz parte de uma Casa." })).toBeVisible();

  await page.getByRole("button", { name: "Criar Casa" }).click();
  await page.getByLabel("Nome da Casa").fill("QA E2E Casa");
  await page.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(page).toHaveURL(/\/house\/house-/);
  await expect(page.getByRole("heading", { name: "QA E2E Casa" })).toBeVisible();
  await page.getByRole("button", { name: /Abrir fila/ }).click();
  await expect(page.getByText("Fila da Party")).toBeVisible();
  await page.getByRole("button", { name: "Abrir chat" }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
  await page.getByLabel("Controles da Party").getByRole("button", { name: "Adicionar mídia" }).click();
  await expect(page.getByRole("heading", { name: "A mídia da Casa" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "QA E2E Casa" })).toBeVisible();
  const manifest = await request.get(`${origin}/manifest.webmanifest`);
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json() as { icons: unknown[] }).icons.length).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole("heading", { name: "QA E2E Casa" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
  await page.getByRole("navigation", { name: "Menu da Casa e Party" }).getByRole("button", { name: "Casa e membros" }).click();
  await page.getByRole("button", { name: "Excluir Casa…" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Confirmação de exclusão da Casa" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "Excluir Casa permanentemente" })).toBeDisabled();
  await deleteDialog.getByRole("textbox").fill("Outra Casa");
  await expect(deleteDialog.getByRole("button", { name: "Excluir Casa permanentemente" })).toBeDisabled();
  await deleteDialog.press("Escape");
  await expect(deleteDialog).toBeHidden();
  await page.getByRole("button", { name: "Excluir Casa…" }).click();
  await deleteDialog.getByRole("textbox").fill("QA E2E Casa");
  await deleteDialog.getByRole("button", { name: "Excluir Casa permanentemente" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Você ainda não faz parte de uma Casa." })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(origin + "/");
  await page.goto(`${origin}/app`);
  await expect(page.getByRole("heading", { name: /Fiquem juntos/i })).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("invitation sharing offers code and link, mobile code entry and unauthenticated link return", async ({ browser, request }) => {
  test.setTimeout(120000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const createUser = async (displayName: string) => {
    const email = `invite-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const mail = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!);
    const link = mail.text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    return { email, password, session: await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json() };
  };
  const host = await createUser("Invite Host"), guest = await createUser("Code Guest"), linkGuest = await createUser("Link Guest");
  const { house } = await (await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${host.session.token}` }, data: { name: "Invite QA Friends" } })).json();
  const hostContext = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await hostContext.addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), host.session);
    await guestContext.addInitScript((session) => { if (!sessionStorage.getItem("qa:logout")) localStorage.setItem("lumio.session.v1", JSON.stringify(session)); }, guest.session);
    const hostPage = await hostContext.newPage(), guestPage = await guestContext.newPage();
    await hostPage.goto(`${origin}/house/${house.id}`);
    await hostPage.getByRole("button", { name: "Convidar", exact: true }).click();
    await hostPage.getByLabel("Limite de usos").fill("2");
    await hostPage.getByRole("button", { name: "Criar convite seguro" }).click();
    await expect(hostPage.getByLabel("Código do convite")).toBeVisible();
    const code = await hostPage.getByLabel("Código do convite").inputValue(), link = await hostPage.getByLabel("Link do convite").inputValue();
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
    await hostPage.getByRole("button", { name: "Copiar código", exact: true }).click();
    await expect(hostPage.locator(".invite-result").getByRole("status")).toHaveText("Código copiado.");
    expect(await hostPage.evaluate(() => navigator.clipboard.readText())).toBe(code);
    await hostPage.getByRole("button", { name: "Copiar link", exact: true }).click();
    expect(await hostPage.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await hostPage.setViewportSize({ width: 390, height: 844 });
    await hostPage.screenshot({ path: "test-results/mobile-invite-code-link.png" });
    expect(await hostPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guestPage.goto(`${origin}/app`);
    await guestPage.getByRole("button", { name: "Entrar com convite" }).click();
    await guestPage.getByLabel("Link ou código").fill(` ${code.toLowerCase().replace("-", " ")} `);
    await guestPage.getByRole("button", { name: "Abrir convite" }).click();
    await expect(guestPage.getByRole("heading", { name: house.name })).toBeVisible();
    await guestPage.getByRole("button", { name: "Entrar na Casa", exact: true }).click();
    await expect(guestPage).toHaveURL(`${origin}/house/${house.id}/media`);
    await guestPage.goto(`${origin}/invite/${code}`);
    await expect(guestPage.getByRole("button", { name: "Abrir Party", exact: true })).toBeVisible();
    await guestPage.getByRole("button", { name: "Abrir Party", exact: true }).click();
    await guestPage.evaluate(() => { sessionStorage.setItem("qa:logout", "1"); localStorage.removeItem("lumio.session.v1"); });
    await guestContext.clearCookies();
    await guestPage.goto(link);
    await guestPage.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(guestPage).toHaveURL(/\/login\?next=/);
    await guestPage.getByLabel("E-mail").fill(linkGuest.email); await guestPage.getByLabel("Senha").fill(linkGuest.password);
    await guestPage.getByRole("button", { name: "Entrar", exact: true }).last().click();
    await expect(guestPage).toHaveURL(link);
    await guestPage.getByRole("button", { name: "Entrar na Casa", exact: true }).click();
    await expect(guestPage).toHaveURL(`${origin}/house/${house.id}/media`);
    const details = await (await request.get(`${api}/api/houses/${house.id}`, { headers: { Authorization: `Bearer ${host.session.token}` } })).json();
    expect(details.house.members).toHaveLength(3); expect(details.house.invites[0].uses).toBe(2);
  } finally { await hostContext.close(); await guestContext.close(); }
});

test("automatic voice: three real RTC clients, explicit capture, denial, deafen, reconnect and leave", async ({ request }) => {
  test.setTimeout(180_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions: any[] = [];
  for (const displayName of ["Voice A", "Voice B", "Voice C"]) {
    const email = `voice-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const last = fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!;
    const link = JSON.parse(last).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "Receive only RTC" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 3, role: "MEMBER" } })).json();
  for (const session of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.token}/accept`, { headers: { Authorization: `Bearer ${session.token}` } })).ok()).toBe(true);
  const rtcBrowser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const contexts = await Promise.all(sessions.map(() => rtcBrowser.newContext()));
    for (let i = 0; i < contexts.length; i++) await contexts[i].addInitScript((session) => {
      if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
      localStorage.setItem("lumio.session.v1", JSON.stringify(session));
      const qa = (window as any).qaVoice = { captures: 0, displays: 0, deny: false, hold: false, release: null as (() => void) | null, blockAudio: false, peers: [] as RTCPeerConnection[], tracks: [] as MediaStreamTrack[], audio: [] as HTMLAudioElement[] };
      const Peer = window.RTCPeerConnection;
      const Transport = window.WebSocket;
      (qa as any).sockets = [];
      window.WebSocket = class extends Transport {
        constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); (qa as any).sockets.push(this); }
      };
      window.RTCPeerConnection = class extends Peer { constructor(config?: RTCConfiguration) { super(config); qa.peers.push(this); } };
      const AudioClass = window.Audio;
      window.Audio = class extends AudioClass { constructor() { super(); qa.audio.push(this); } play() { return qa.blockAudio ? Promise.reject(new DOMException("QA autoplay blocked", "NotAllowedError")) : super.play(); } };
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        qa.captures++;
        if (qa.deny) throw new DOMException("QA denied", "NotAllowedError");
        const stream = await capture(constraints); qa.tracks.push(...stream.getTracks());
        if (qa.hold) await new Promise<void>((resolve) => { qa.release = resolve; });
        return stream;
      };
      const display = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
      if (display) navigator.mediaDevices.getDisplayMedia = (options) => { qa.displays++; return display(options); };
    }, sessions[i]);
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    const join = async (page: typeof a) => {
      await page.goto(`${origin}/house/${house.id}`);
      await expect(page.locator(".dock-call-state").first()).toHaveText("Microfone desligado", { timeout: 20000 });
      await expect(page.getByRole("button", { name: "Ativar microfone", exact: true })).toBeVisible();
      expect(await page.evaluate(() => (window as any).qaVoice.captures)).toBe(0);
      expect(await page.evaluate(() => (window as any).qaVoice.displays)).toBe(0);
      await expect(page.getByRole("button", { name: /Entrar na call|Sair da call/ })).toHaveCount(0);
    };
    const packets = (page: typeof a) => page.evaluate(async () => {
      let count = 0;
      for (const peer of (window as any).qaVoice.peers as RTCPeerConnection[]) if (peer.connectionState !== "closed") (await peer.getStats()).forEach((stat) => { if (stat.type === "inbound-rtp" && stat.kind === "audio") count += stat.packetsReceived ?? 0; });
      return count;
    });
    const connected = (page: typeof a, count: number) => expect.poll(() => page.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20000 }).toBe(count);
    try {
    await join(a); await join(b);
    await b.evaluate(() => { (window as any).qaVoice.blockAudio = true; });
    await a.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await expect(a.getByRole("button", { name: "Desativar microfone", exact: true })).toBeVisible();
    await connected(b, 1); await expect.poll(() => packets(b), { timeout: 20000 }).toBeGreaterThan(0);
    await expect(b.getByRole("button", { name: "Ativar áudio da call", exact: true })).toBeVisible();
    await b.evaluate(() => { (window as any).qaVoice.blockAudio = false; });
    await b.getByRole("button", { name: "Ativar áudio da call", exact: true }).click();
    await expect.poll(() => b.evaluate(() => (window as any).qaVoice.audio.some((audio: HTMLAudioElement) => !audio.paused && !audio.muted))).toBe(true);
    const voiceBeforeGames = await a.evaluate(() => ({ peers: (window as any).qaVoice.peers.length, captures: (window as any).qaVoice.captures }));
    const receivedBeforeGames = await packets(b);
    await a.getByRole("button", { name: "Jogos", exact: true }).click();
    await expect(a.getByRole("heading", { name: "O que vamos jogar?" })).toBeVisible();
    await a.getByRole("button", { name: /Desenhe e Adivinhe/ }).click();
    await expect(a.getByRole("button", { name: "Participar", exact: true })).toBeVisible();
    await a.getByRole("button", { name: "Participar", exact: true }).click();
    await expect(a.getByRole("button", { name: "Desativar microfone", exact: true })).toBeVisible();
    await expect(b.locator(".main-stage")).toHaveAttribute("data-view", "media");
    await b.getByRole("button", { name: "Jogos", exact: true }).click();
    await b.getByRole("button", { name: /Desenhe e Adivinhe/ }).click();
    await b.getByRole("button", { name: "Participar", exact: true }).click();
    await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    await a.locator(".draw-choices button").first().click();
    const callBoard = (await a.locator(".draw-board canvas").boundingBox())!;
    await a.mouse.move(callBoard.x + 30, callBoard.y + 30); await a.mouse.down();
    await a.mouse.move(callBoard.x + 90, callBoard.y + 90, { steps: 5 }); await a.mouse.up();
    await expect(b.locator(".draw-word")).toContainText("_");
    await expect.poll(() => packets(b), { timeout: 20000 }).toBeGreaterThan(receivedBeforeGames);
    expect(await a.evaluate(() => ({ peers: (window as any).qaVoice.peers.length, captures: (window as any).qaVoice.captures }))).toEqual(voiceBeforeGames);
    await a.screenshot({ path: "test-results/g0-desktop-games.png" });
    await a.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
    await b.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
    await expect(a.getByRole("button", { name: "Assistir/Ouvir", exact: true })).toBeFocused();
    await connected(a, 1); await connected(b, 1);
    await join(c);
    await expect.poll(() => c.evaluate(() => ({ ready: (window as any).qaVoice.peers.some((peer: RTCPeerConnection) => peer.connectionState === "connected"), peers: (window as any).qaVoice.peers.map((peer: RTCPeerConnection) => ({ state: peer.connectionState, signaling: peer.signalingState, ice: peer.iceConnectionState, slots: peer.getTransceivers().map((slot) => ({ kind: slot.receiver.track.kind, direction: slot.direction, current: slot.currentDirection, sender: Boolean(slot.sender.track) })) })), voice: document.querySelector(".dock-call-state")?.textContent })), { timeout: 20000 }).toMatchObject({ ready: true });
    await expect.poll(() => packets(c), { timeout: 20000 }).toBeGreaterThan(0);
    await b.evaluate(() => { (window as any).qaVoice.deny = true; });
    await b.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await expect(b.locator(".dock-call-state").first()).toContainText("Microfone indisponível");
    await expect(b.getByRole("button", { name: "Ativar microfone", exact: true })).toBeVisible();
    await expect.poll(() => b.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    const received = await packets(b); await expect.poll(() => packets(b), { timeout: 20000 }).toBeGreaterThan(received);
    await b.evaluate(() => { (window as any).qaVoice.deny = false; });
    await b.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await expect.poll(() => packets(a), { timeout: 20000 }).toBeGreaterThan(0);
    await connected(c, 2); await connected(b, 2);
    // G6: one Party, three authenticated RTC clients, all game presentations.
    // Keep references to the actual connections, not just their counts.
    for (const page of [a, b, c]) await page.evaluate(() => {
      (window as any).qaVoice.beforePolish = [...(window as any).qaVoice.peers];
      (window as any).qaVoice.beforeTracks = [...(window as any).qaVoice.tracks];
      (window as any).qaVoice.beforeSockets = [...(window as any).qaVoice.sockets];
      (window as any).qaVoice.beforePlayer = document.querySelector(".lumio-player");
    });
    await a.getByRole("button", { name: "Jogos", exact: true }).click();
    await a.getByRole("button", { name: "Encerrar sessão de jogo", exact: true }).click();
    await a.getByRole("button", { name: "Confirmar encerramento", exact: true }).click();
    for (const [name, selector, phase] of [[/Quiz 2/, ".quiz-game", "QUESTION"], [/Lumio Cartas 2/, ".card-game", "PLAYING"]] as const) {
      for (const page of [a, b, c]) {
        if (await page.locator(".main-stage").getAttribute("data-view") !== "game") await page.getByRole("button", { name: "Jogos", exact: true }).click();
        await page.getByRole("button", { name }).click();
        await page.getByRole("button", { name: "Participar", exact: true }).click();
      }
      await a.getByRole("button", { name: "Iniciar partida", exact: true }).click();
      await expect(a.locator(selector)).toHaveAttribute("data-phase", phase);
      await a.setViewportSize({ width: 1440, height: 900 });
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await a.screenshot({ path: `test-results/g6-${selector === ".quiz-game" ? "quiz" : "cards"}-1440x900.png` });
      await a.setViewportSize({ width: 1280, height: 720 });
      const content = await a.locator(selector === ".quiz-game" ? ".quiz-question" : ".card-hand button").allTextContents();
      const surface = await a.locator(selector).elementHandle();
      await a.getByRole("button", { name: "Voltar aos jogos", exact: true }).click();
      await expect(a.locator(".game-active-session")).toContainText("Partida em andamento");
      await a.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
      await a.getByRole("button", { name: "Jogos", exact: true }).click();
      await a.getByRole("button", { name: "Retornar à partida", exact: true }).click();
      await expect(a.locator(selector)).toHaveAttribute("data-phase", phase);
      expect(await a.locator(selector === ".quiz-game" ? ".quiz-question" : ".card-hand button").allTextContents()).toEqual(content);
      // The game presentation may remount; GX3 destroys the local player, not shared RTC.
      expect(await surface!.evaluate((node) => node.isConnected)).toBe(false);
      for (const page of [a, b, c]) {
        expect(await page.evaluate(() => {
          const q = (window as any).qaVoice;
          return q.peers.length === q.beforePolish.length && q.peers.every((p: RTCPeerConnection, i: number) => p === q.beforePolish[i] && p.connectionState !== "closed") && q.tracks.every((t: MediaStreamTrack, i: number) => t === q.beforeTracks[i]) && q.sockets.length === q.beforeSockets.length && q.sockets.every((s: WebSocket, i: number) => s === q.beforeSockets[i] && s.readyState === WebSocket.OPEN) && document.querySelector(".lumio-player") === null;
        })).toBe(true);
      }
      await a.getByRole("button", { name: "Voltar aos jogos", exact: true }).click();
      await a.getByRole("button", { name: "Encerrar sessão de jogo", exact: true }).click();
      await a.getByRole("button", { name: "Confirmar encerramento", exact: true }).click();
      for (const page of [b, c]) await page.getByRole("button", { name: "Voltar aos jogos", exact: true }).click();
    }
    for (const page of [a, b, c]) await page.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
    await expect.poll(() => c.evaluate(async () => {
      let sources = 0;
      for (const peer of (window as any).qaVoice.peers as RTCPeerConnection[]) (await peer.getStats()).forEach((stat) => { if (stat.type === "inbound-rtp" && stat.kind === "audio" && stat.packetsReceived > 0) sources++; });
      return { sources, peers: (window as any).qaVoice.peers.map((peer: RTCPeerConnection) => ({ state: peer.connectionState, signaling: peer.signalingState, audio: peer.getTransceivers().filter((slot) => slot.receiver.track.kind === "audio").map((slot) => ({ direction: slot.direction, current: slot.currentDirection, muted: slot.receiver.track.muted })) })) };
    }), { timeout: 20000 }).toMatchObject({ sources: 2 });
    await b.getByRole("button", { name: "Desativar áudio da call", exact: true }).click();
    expect(await b.evaluate(() => (window as any).qaVoice.audio.every((audio: HTMLAudioElement) => audio.muted))).toBe(true);
    expect(await b.evaluate(() => (window as any).qaVoice.tracks.filter((track: MediaStreamTrack) => track.readyState === "live").every((track: MediaStreamTrack) => !track.enabled))).toBe(true);
    await b.getByRole("button", { name: "Ativar áudio da call", exact: true }).click();
    await expect(b.getByRole("button", { name: "Ativar microfone", exact: true })).toBeVisible();
    await b.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await a.getByRole("button", { name: "Desativar microfone", exact: true }).click();
    const aPackets = await packets(a); await expect.poll(() => packets(a), { timeout: 20000 }).toBeGreaterThan(aPackets);
    await a.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await expect(a.getByRole("button", { name: "Desativar microfone", exact: true })).toBeVisible();
    const captures = await a.evaluate(() => (window as any).qaVoice.captures);
    await contexts[0].setOffline(true);
    await expect.poll(() => a.evaluate(() => (window as any).qaVoice.tracks.every((track: MediaStreamTrack) => track.readyState === "ended"))).toBe(true);
    await contexts[0].setOffline(false);
    await expect.poll(() => a.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState !== "closed").length), { timeout: 20000 }).toBe(2);
    await expect.poll(() => a.evaluate(() => (window as any).qaVoice.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    await expect(a.getByRole("button", { name: "Ativar microfone", exact: true })).toBeVisible();
    expect(await a.evaluate(() => (window as any).qaVoice.captures)).toBe(captures);
    const details = await (await request.get(`${api}/api/houses/${house.id}`, { headers })).json();
    expect(details.house.members.filter((member: any) => member.inCall)).toHaveLength(3);
    await c.evaluate(() => { (window as any).qaVoice.hold = true; });
    await c.getByRole("button", { name: "Ativar microfone", exact: true }).click();
    await expect.poll(() => c.evaluate(() => Boolean((window as any).qaVoice.release))).toBe(true);
    await c.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
    await c.getByRole("button", { name: "Sair da Party", exact: true }).click();
    await expect(c).toHaveURL(/\/app$/);
    await c.evaluate(() => (window as any).qaVoice.release());
    await expect.poll(() => c.evaluate(() => (window as any).qaVoice.tracks.every((track: MediaStreamTrack) => track.readyState === "ended"))).toBe(true);
    await connected(a, 1); await connected(b, 1);
    expect(await c.evaluate(() => (window as any).qaVoice.peers.every((peer: RTCPeerConnection) => peer.connectionState === "closed"))).toBe(true);
    expect(await c.evaluate(() => (window as any).qaVoice.audio.every((audio: HTMLAudioElement) => audio.srcObject === null))).toBe(true);
    } catch (error) {
      for (const [name, page] of [["A", a], ["B", b], ["C", c]] as const) console.info("RTC diagnostic", name, JSON.stringify(await page.evaluate(() => ({
        voice: document.querySelector(".dock-call-state")?.textContent,
        tracks: ((window as any).qaVoice?.tracks ?? []).map((track: MediaStreamTrack) => ({ enabled: track.enabled, ready: track.readyState })),
        peers: ((window as any).qaVoice?.peers ?? []).map((peer: RTCPeerConnection) => ({ state: peer.connectionState, signaling: peer.signalingState, ice: peer.iceConnectionState, gathering: peer.iceGatheringState, slots: peer.getTransceivers().map((slot) => ({ kind: slot.receiver.track.kind, direction: slot.direction, current: slot.currentDirection, sender: slot.sender.track?.readyState, enabled: slot.sender.track?.enabled })) })),
      }))));
      throw error;
    }
  } finally { await rtcBrowser.close(); }
});

test("mobile permanent chat, gesture, secondary tools, late join and player idle controls", async ({ browser, request }) => {
  test.setTimeout(120_000);
  fs.mkdirSync(path.join(root, "artifacts/m1"), { recursive: true });
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const email = `mobile-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
  expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: "Mobile QA", email, password } })).status()).toBe(201);
  const mail = fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { text: string });
  const link = mail.at(-1)!.text.match(/https?:\/\/\S+/)![0];
  expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
  const login = await request.post(`${api}/api/auth/login`, { data: { email, password } });
  const session = await login.json();
  const created = await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${session.token}` }, data: { name: "Mobile QA Casa" } });
  expect(created.ok()).toBe(true);
  const result = await created.json(); const house = result.house;
  const socket = io(api, { autoConnect: false, auth: { token: session.token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const snapshot = new Promise<any>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Local fixture join timeout")), 5000); socket.once("room:snapshot", (value) => { clearTimeout(timer); resolve(value); }); socket.once("connect_error", reject); socket.once("server:error", (message) => reject(new Error(message))); });
    socket.on("connect", () => socket.emit("room:join", { roomId: house.primaryRoomId, user: session.user }));
    socket.connect();
    await snapshot;
    const item = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: "dQw4w9WgXcQ", type: "video", title: "Local player mock", duration: 300, addedBy: session.user, addedAt: new Date().toISOString() };
    const added = await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item }); expect(added.ok).toBe(true);
    const changed = await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item }); expect(changed.ok).toBe(true);
    await context.addInitScript((session) => {
      if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
      localStorage.setItem("lumio.session.v1", JSON.stringify(session));
      (window as any).qaPlayer = { created: 0, destroyed: 0, plays: 0, position: 0, state: -1, blocked: localStorage.getItem("qa.blocked") === "1" };
      (window as any).qaMicCaptures = 0;
      navigator.mediaDevices.getUserMedia = async () => { (window as any).qaMicCaptures++; throw new DOMException("QA denied", "NotAllowedError"); };
      (window as any).YT = { Player: class {
        events: any;
        constructor(_id: string, options: any) { (window as any).qaPlayer.created++; this.events = options.events; setTimeout(() => this.events.onReady(), 80); }
        cueVideoById() {} seekTo(value: number) { (window as any).qaPlayer.position = value; }
        playVideo() { const qa = (window as any).qaPlayer; qa.plays++; if (qa.blocked) this.events.onAutoplayBlocked(); else { qa.state = 1; this.events.onStateChange({ data: 1 }); } }
        pauseVideo() { (window as any).qaPlayer.state = 2; this.events.onStateChange({ data: 2 }); }
        getCurrentTime() { return (window as any).qaPlayer.position; } getPlayerState() { return (window as any).qaPlayer.state; }
        getDuration() { return 300; } getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; }
        setVolume() {} setPlaybackRate() {} mute() {} unMute() {} destroy() { (window as any).qaPlayer.destroyed++; }
      } };
    }, session);
    await context.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ body: "<html><body style='background:#101210;color:#a7f3c2'>Local media fixture</body></html>", contentType: "text/html" }));
    const page = await context.newPage();
    const pageErrors: string[] = []; page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${origin}/house/${house.id}`);
    await expect(page.getByRole("heading", { name: "Mobile QA Casa", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    if ((await page.evaluate(() => (window as any).qaPlayer.state)) !== 1) {
      await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
      await page.getByRole("button", { name: "Reproduzir", exact: true }).tap();
    }
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.plays)).toBeGreaterThan(0);
    await expect(page.locator(".mobile-party-chat button.chat-drag-handle")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Recolher chat|Expandir chat/ })).toHaveCount(0);
    const engine = () => page.evaluate(() => ({ created: (window as any).qaPlayer.created, destroyed: (window as any).qaPlayer.destroyed, position: (window as any).qaPlayer.position, plays: (window as any).qaPlayer.plays }));
    const originalEngine = await engine();
    const mediaNode = await page.locator("iframe.provider-player").elementHandle();
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Draft preserved in Games");
    await page.getByRole("button", { name: "Jogos", exact: true }).tap();
    await expect(page.getByRole("heading", { name: "O que vamos jogar?" })).toBeFocused();
    await expect(page.locator(".main-stage")).toHaveAttribute("data-view", "game");
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Draft preserved in Games");
    await page.getByRole("button", { name: "Enviar mensagem" }).tap();
    await expect(page.getByText("Draft preserved in Games", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Desenhe e Adivinhe/ }).tap();
    await expect(page.getByRole("button", { name: "Participar", exact: true })).toBeVisible();
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      await expect(page.locator("iframe.provider-player, video.provider-player, .lumio-player")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Fila da Party", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Pessoas da Party", exact: true }).tap();
      await expect(page.getByRole("button", { name: "Recolher painel da Party" })).toBeVisible();
      await page.getByRole("button", { name: "Fechar painel", exact: true }).tap();
      await expect(page.locator(".main-stage")).toHaveAttribute("data-view", "game");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/g0-mobile-games.png" });
    await page.getByRole("button", { name: "Tela cheia de Jogos", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement || document.querySelector(".game-fallback-fullscreen")))).toBe(true);
    await expect(page.locator(".mobile-party-chat")).toBeHidden();
    await page.getByRole("button", { name: "Sair da tela cheia de Jogos", exact: true }).tap();
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await expect(page.locator(".main-stage")).toHaveAttribute("data-view", "game");
    await page.getByRole("button", { name: "Assistir/Ouvir", exact: true }).tap();
    await expect(page.locator(".main-stage")).toHaveAttribute("data-view", "media");
    const resumedEngine = await engine();
    expect(resumedEngine.created).toBeGreaterThan(originalEngine.created);
    expect(resumedEngine.destroyed).toBeGreaterThan(originalEngine.destroyed);
    expect(await mediaNode!.evaluate((node) => node === document.querySelector("iframe.provider-player"))).toBe(false);
    expect(await page.evaluate(() => (window as any).qaMicCaptures)).toBe(0);
    // GX3 intentionally paused when this tab was the final Media viewer.
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Reproduzir", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    const assertPortraitLayout = async () => {
      await expect.poll(() => page.locator(".player-frame").evaluate((node) => Math.abs(node.getBoundingClientRect().width / node.getBoundingClientRect().height - 16 / 9))).toBeLessThan(0.02);
      // VisualViewport resize arrives asynchronously after setViewportSize/fullscreen.
      await expect.poll(() => page.evaluate(() => document.querySelector(".mobile-party-chat")!.getBoundingClientRect().height - document.querySelector(".player-frame")!.getBoundingClientRect().height)).toBeGreaterThan(0);
      const geometry = await page.evaluate(() => {
        const frame = document.querySelector(".player-frame")!.getBoundingClientRect(), chat = document.querySelector(".mobile-party-chat")!.getBoundingClientRect(), workspace = document.querySelector(".party-workspace")!.getBoundingClientRect();
        return { frame: frame.height, chat: chat.height, bottom: chat.bottom, workspaceBottom: workspace.bottom, gap: chat.top - frame.bottom };
      });
      expect(geometry.chat).toBeGreaterThan(geometry.frame);
      expect(Math.abs(geometry.bottom - geometry.workspaceBottom)).toBeLessThanOrEqual(1);
      expect(geometry.gap).toBeLessThanOrEqual(8);
      expect(await page.locator(".messages").evaluate((node) => getComputedStyle(node).overflowY)).toBe("auto");
    };
    await assertPortraitLayout();
    const videoHeight = await page.locator(".player-frame").evaluate((node) => node.getBoundingClientRect().height);
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await assertPortraitLayout();
      await page.screenshot({ path: `artifacts/m1/m1-video-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/mobile-video-proportion.png" });
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no Ambiente", exact: true }).tap();
    await expect(page.locator(".music-presentation")).toBeVisible();
    expect(await page.locator(".player-frame").evaluate((node) => node.getBoundingClientRect().height)).toBeCloseTo(videoHeight, 2);
    await expect(page.locator("iframe.provider-player")).toHaveCSS("opacity", "1");
    await expect(page.locator(".music-presentation")).toHaveAttribute("data-lyrics", "unavailable");
    expect((await engine()).created).toBe(resumedEngine.created);
    expect((await engine()).destroyed).toBe(resumedEngine.destroyed);
    await expect.poll(() => page.locator(".music-presentation").evaluate((node) => Math.abs(node.getBoundingClientRect().height - node.parentElement!.clientHeight))).toBeLessThanOrEqual(1);
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await assertPortraitLayout();
      await page.screenshot({ path: `artifacts/m1/m1-ambient-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/mobile-ambiente.png" });
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Mobile message");
    await page.getByRole("button", { name: "Enviar mensagem" }).tap(); await expect(page.getByText("Mobile message", { exact: true })).toBeVisible();
    for (let index = 0; index < 12; index++) socket.emit("chat:message", { roomId: house.primaryRoomId, body: `Mensagem de scroll ${index}: conversa local de teste com texto suficiente para ocupar mais de uma linha.` });
    await expect(page.getByText(/Mensagem de scroll 11:/)).toBeVisible();
    await expect.poll(() => page.locator(".messages").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await page.locator(".messages").evaluate((node) => { node.scrollTop = 0; });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    for (const name of ["Pessoas da Party", "Fila da Party", "Fila da Party"]) {
      await page.getByRole("button", { name, exact: true }).tap();
      const sheet = page.getByRole("complementary", { name: "Painel da Party" });
      await expect(sheet).toBeVisible();
      await expect(page.getByRole("tab", { name: "Chat", exact: true })).toHaveCount(0);
      const handle = page.getByRole("button", { name: "Recolher painel da Party" });
      await expect(handle).toBeVisible();
      await page.screenshot({ path: name === "Pessoas da Party" ? "test-results/mobile-people-sheet.png" : "test-results/mobile-queue-sheet.png" });
      await expect.poll(() => handle.boundingBox()).not.toBeNull();
      const box = await handle.boundingBox();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 10); await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 40, { steps: 8 });
      await expect(sheet).toHaveAttribute("data-dragging", "true");
      expect(await sheet.evaluate((node) => getComputedStyle(node).transform)).not.toBe("none");
      // A short, stationary gesture snaps back rather than dismissing.
      await page.waitForTimeout(150); await page.mouse.up();
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveCSS("transform", "none");
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 10); await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 300, { steps: 12 }); await page.mouse.up();
      await expect(sheet).toBeHidden();
      await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
      expect((await engine()).created).toBe(resumedEngine.created); expect((await engine()).destroyed).toBe(resumedEngine.destroyed);
      await page.getByRole("button", { name, exact: true }).tap();
      await page.getByRole("button", { name: "Recolher painel da Party" }).tap();
      await expect(sheet).toBeHidden();
      await page.getByRole("button", { name, exact: true }).tap();
      await page.getByRole("button", { name: "Recolher painel da Party" }).focus();
      await page.keyboard.press("Enter"); await expect(sheet).toBeHidden();
    }
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await assertPortraitLayout();
    }
    await page.screenshot({ path: "test-results/mobile-chat-430.png" });
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Ativar microfone", exact: true }).last()).toBeVisible();
    expect(await page.evaluate(() => (window as any).qaMicCaptures)).toBe(0);
    await page.getByRole("button", { name: "Ativar microfone", exact: true }).last().tap();
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    await expect(page.locator(".mobile-call-menu")).toContainText("Microfone indisponível");
    expect(await page.evaluate(() => (window as any).qaMicCaptures)).toBe(1);
    await page.screenshot({ path: "test-results/mobile-automatic-voice.png" });
    await page.getByRole("button", { name: "Controles da call", exact: true }).tap();
    const currentMediaState = await new Promise<any>((resolve) => { socket.once("media:sync", resolve); socket.emit("media:request-sync", { roomId: house.primaryRoomId }); });
    expect(currentMediaState.state).toBe("playing");
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "1");
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "0", { timeout: 5000 });
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no modo cinema", exact: true }).tap();
    await expect(page.locator(".mobile-party-chat")).toBeVisible();
    await page.getByRole("button", { name: "Sair do modo cinema", exact: true }).tap();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await expect.poll(() => page.locator(".party-workspace").evaluate((node) => getComputedStyle(node).display)).toBe("grid");
    const landscape = await page.evaluate(() => { const frame = document.querySelector(".player-frame")!.getBoundingClientRect(), chat = document.querySelector(".mobile-party-chat")!.getBoundingClientRect(); return { ratio: frame.width / frame.height, frameRight: frame.right, chatLeft: chat.left }; });
    expect(Math.abs(landscape.ratio - 16 / 9)).toBeLessThan(0.02);
    expect(landscape.frameRight).toBeLessThanOrEqual(landscape.chatLeft);
    await page.locator(".mobile-party-chat").evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: "test-results/mobile-landscape.png" });
    const landscapeComposer = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox();
    expect(landscapeComposer!.y + landscapeComposer!.height).toBeLessThanOrEqual(390);
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Fullscreen draft");
    await page.locator(".messages").evaluate((node) => { node.scrollTop = 60; });
    const scrollBeforeFullscreen = await page.locator(".messages").evaluate((node) => node.scrollTop);
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Tela cheia", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement || document.querySelector(".fallback-fullscreen")))).toBe(true);
    await expect(page.locator(".mobile-party-chat")).toBeHidden();
    await expect(page.locator(".music-presentation")).toBeVisible();
    expect((await engine()).created).toBe(resumedEngine.created);
    await page.screenshot({ path: "test-results/mobile-fullscreen.png" });
    await page.screenshot({ path: "artifacts/m1/m1-fullscreen-ambient.png" });
    await page.getByRole("button", { name: "Sair do Ambiente", exact: true }).tap();
    await expect(page.locator(".music-presentation")).toHaveCount(0);
    await expect(page.locator(".provider-player")).toHaveCSS("opacity", "1");
    const fullscreenVideo = await page.locator("iframe.provider-player").boundingBox();
    expect(fullscreenVideo!.width / fullscreenVideo!.height).toBeCloseTo(16 / 9, 1);
    await page.screenshot({ path: "test-results/mobile-video-fullscreen.png" });
    await page.screenshot({ path: "artifacts/m1/m1-fullscreen-video.png" });
    await page.getByRole("button", { name: /Sair da tela (cheia|ampliada)/ }).tap();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Fullscreen draft");
    expect(await page.locator(".messages").evaluate((node) => node.scrollTop)).toBe(scrollBeforeFullscreen);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertPortraitLayout();
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Rascunho preservado");
    // VisualViewport can shrink while CSS orientation remains portrait.
    await page.evaluate(() => document.documentElement.style.setProperty("--visual-height", "320px"));
    await expect.poll(async () => { const box = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(320);
    await expect.poll(() => page.locator(".player-frame").evaluate((node) => Math.abs(node.getBoundingClientRect().width / node.getBoundingClientRect().height - 16 / 9))).toBeLessThan(0.02);
    await page.screenshot({ path: "test-results/mobile-visual-viewport.png" });
    await page.evaluate(() => document.documentElement.style.removeProperty("--visual-height"));
    await assertPortraitLayout();
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Rascunho preservado");
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Pausar", exact: true }).tap();
    await page.reload();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(2);
    expect(await page.evaluate(() => (window as any).qaPlayer.plays)).toBe(0);
    await expect(page.locator(".lumio-controls")).toHaveCSS("opacity", "1");
    await page.getByRole("button", { name: "Reproduzir", exact: true }).tap();
    await page.evaluate(() => localStorage.setItem("qa.blocked", "1")); await page.reload();
    await expect(page.getByText("Toque para continuar", { exact: true })).toBeVisible();
    await page.evaluate(() => { (window as any).qaPlayer.blocked = false; localStorage.removeItem("qa.blocked"); });
    await page.getByRole("button", { name: "Continuar", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    await expect(page.getByText("Toque para continuar", { exact: true })).toBeHidden();
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no Ambiente", exact: true }).tap();
    await page.reload();
    await expect(page.locator(".music-presentation")).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    // Presentation also covers the desktop surface without a new engine.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".music-presentation")).toBeVisible();
    await expect.poll(() => page.locator(".music-presentation").evaluate((node) => Math.abs(node.getBoundingClientRect().height - node.parentElement!.clientHeight))).toBeLessThanOrEqual(1);
    const settleDesktopLayout = () => page.locator(".main-stage,.now-playing").evaluateAll((nodes) => Promise.all(nodes.flatMap((node) => node.getAnimations().map((animation) => animation.finished.then(() => undefined)))));
    await settleDesktopLayout();
    await page.screenshot({ path: "test-results/desktop-ambiente.png" });
    await page.screenshot({ path: "artifacts/m1/m1-ambient-desktop.png" });
    for (const [width, height] of [[1280, 720], [1280, 900], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await settleDesktopLayout();
      await page.screenshot({ path: `artifacts/m1/m1-ambient-${width}x${height}.png` });
    }
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Sair do Ambiente", exact: true }).tap();
    for (const [width, height] of [[1280, 720], [1280, 900], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await settleDesktopLayout();
      await page.screenshot({ path: `artifacts/m1/m1-video-${width}x${height}.png` });
    }
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("button", { name: "Entrar no Ambiente", exact: true }).tap();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "Abrir menu da Casa e Party", exact: true }).tap();
    await page.getByRole("button", { name: "Luz ambiente ligada", exact: true }).tap();
    await expect(page.locator(".ambient-glow")).toHaveCSS("opacity", "0");
    await page.getByRole("button", { name: "Luz ambiente desligada", exact: true }).tap();
    await page.getByRole("button", { name: "Abrir menu da Casa e Party", exact: true }).tap();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".ambient-glow")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".ambient-glow")).toHaveCSS("opacity", "0.26");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Artwork failure and media change keep the supported fallback, not a broken image.
    await context.route("https://i.ytimg.com/**", (route) => route.abort());
    const secondItem = { ...item, id: crypto.randomUUID(), providerMediaId: "M7lc1UVf-VE", title: "Uma noite inteira de música com a turma — título longo para conferir o layout 🎵 音楽" };
    expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item: secondItem })).ok).toBe(true);
    expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item: secondItem })).ok).toBe(true);
    await expect(page.locator(".music-presentation").getByText(secondItem.title, { exact: true })).toBeVisible();
    await expect(page.locator(".music-cover img.ambient-brand")).toHaveAttribute("alt", "");
    await page.screenshot({ path: "artifacts/m1/m1-ambient-no-artwork.png" });
    await page.screenshot({ path: "artifacts/m1/m1-ambient-long-title.png" });
    expect((await engine()).created).toBe(1); expect((await engine()).destroyed).toBe(0);
    await page.locator(".player-touch-surface").tap({ position: { x: 20, y: 20 } });
    await page.getByRole("slider", { name: "Posição da reprodução" }).focus();
    await page.keyboard.press("ArrowRight");
    const seekPosition = (await engine()).position;
    await page.getByRole("button", { name: "Pausar", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(2);
    await page.getByRole("button", { name: "Reproduzir", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).qaPlayer.state)).toBe(1);
    expect((await engine()).position).toBeGreaterThanOrEqual(seekPosition);
    await page.setViewportSize({ width: 320, height: 450 });
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Keyboard-sized viewport");
    const input = await page.getByRole("textbox", { name: "Mensagem" }).boundingBox(); expect(input!.y + input!.height).toBeLessThanOrEqual(450);
    await page.screenshot({ path: "test-results/mobile-short-viewport.png" });
    await page.reload(); await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
    expect(await page.locator(".reaction-actions,.reaction-float").count()).toBe(0);
    expect(fs.readFileSync(path.join(serverRoot, "src/index.ts"), "utf8")).not.toContain("reaction:send");
    expect(fs.readFileSync(path.join(root, "packages/shared/src/index.ts"), "utf8")).not.toContain("reaction:send");
    expect(pageErrors).toEqual([]);
  } finally { socket.disconnect(); await context.close(); }
});

// Isolated layout fixture: actual MediaStage markup/CSS + locally generated video.
// This covers native video sizing used by Drive, NOT authenticated Google streaming.
test("GX3 Drive engine unmounts in Games, restores paused media and keeps screen share", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const origin = `http://127.0.0.1:${webPort}`;
  await page.goto(origin);
  const recording = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    canvas.getContext("2d")!.fillRect(0, 0, 320, 180);
    const stream = canvas.captureStream(15), chunks: Blob[] = [], recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    const frames = setInterval(() => { canvas.getContext("2d")!.fillStyle = Date.now() % 2 ? "#101210" : "#102210"; canvas.getContext("2d")!.fillRect(0, 0, 320, 180); }, 40);
    recorder.start(); await new Promise((resolve) => setTimeout(resolve, 1500)); recorder.stop(); await stopped; clearInterval(frames);
    stream.getTracks().forEach((track) => track.stop());
    return { bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())), mime: recorder.mimeType };
  });
  let tickets = 0;
  await page.route(`${origin}/api/google-drive/files/qa-g0/playback`, (route) => { tickets++; return route.fulfill({ json: { url: "/api/google-drive/playback/qa-g0" } }); });
  await page.route(`${origin}/api/google-drive/playback/qa-g0`, (route) => route.fulfill({ body: Buffer.from(recording.bytes), contentType: recording.mime }));
  await page.route(`${origin}/qa-g0`, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
    const {default:React} = await import('/node_modules/.vite/deps/react.js'); const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {MediaExperienceStage,GamesExperienceStage} = await import('/src/components/PartyStages.tsx'); const {MediaStage} = await import('/src/components/MediaStage.tsx');
    const e=React.createElement; window.qaCommands=0;
    function Fixture(){ const [view,setView]=React.useState('media'); const [share,setShare]=React.useState(null); const [stream,setStream]=React.useState(null);
      const [media,setMedia]=React.useState({provider:'google-drive',mediaId:'qa-g0',title:'Local Drive fixture',type:'video',state:'paused',position:0,duration:10,playbackRate:1,startedAt:null,updatedAt:Date.now(),controlledBy:'qa',revision:1});
      const command=(c)=>{window.qaCommands++;setMedia(m=>({...m,state:c.action==='pause'?'paused':'playing',position:c.position,startedAt:c.action==='pause'?null:Date.now(),revision:m.revision+1}));return true;};
      const noop=React.useCallback(()=>{},[]);
      const enterGames=()=>{const video=document.querySelector('video.provider-player');setMedia(m=>({...m,state:'paused',position:video?.currentTime??m.position,startedAt:null,revision:m.revision+1}));setView('game');};
      return e('main',null,e('nav',{'aria-label':'Experiência da Party'},e('button',{onClick:()=>setView('media')},'Assistir/Ouvir'),e('button',{onClick:enterGames},'Jogos')),e('button',{onClick:()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;canvas.getContext('2d').fillRect(0,0,320,180);window.qaScreen=canvas.captureStream(10);setStream(window.qaScreen);setShare({user:{id:'qa',displayName:'QA',color:'#78a98c'}});}},'Test screen'),view==='media'?e(MediaExperienceStage,{view:'media',onViewChange:noop,screenShare:share,screenStream:stream,media:e(MediaStage,{media,roomId:'qa',apiUrl:location.origin,token:'fixture',theater:false,ambient:false,musicView:false,volume:0,effectiveVolume:0,resyncToken:0,shortcutsEnabled:true,onSkip:noop,onRemove:noop,onAddMedia:noop,onEnded:noop,onPlaybackCommand:command,onTheaterChange:noop,onMusicViewChange:noop,onFullscreenChange:noop,onVolumeChange:noop})}):e(GamesExperienceStage,{screenShare:share,screenStream:stream,onFullscreenChange:noop}));
    } createRoot(document.getElementById('root')).render(e(Fixture));
  </script></body></html>` }));
  await page.goto(`${origin}/qa-g0`);
  await expect.poll(() => page.locator(".main-stage").count(), { message: "G0 React fixture must mount" }).toBe(1);
  expect(errors).toEqual([]);
  await expect(page.getByRole("button", { name: "Reproduzir", exact: true })).toBeVisible();
  const native = await page.locator("video.provider-player").elementHandle();
  await native!.evaluate((video: HTMLVideoElement) => { video.loop = true; });
  const initialTickets = tickets;
  await page.getByRole("button", { name: "Jogos", exact: true }).click();
  await expect(page.locator("video.provider-player, .lumio-player")).toHaveCount(0);
  expect(await native!.evaluate((video: HTMLVideoElement) => video.isConnected)).toBe(false);
  await page.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
  await expect(page.locator("video.provider-player")).toHaveCount(1);
  await page.getByRole("button", { name: "Reproduzir", exact: true }).click();
  await expect.poll(() => page.locator("video.provider-player").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "Jogos", exact: true }).click();
  await expect(page.locator("video.provider-player")).toHaveCount(0);
  await page.getByRole("button", { name: "Test screen", exact: true }).click();
  await page.getByRole("button", { name: "Tela compartilhada", exact: true }).click();
  await expect.poll(() => page.locator(".screen-share-stage video").evaluate((node: HTMLVideoElement) => node.srcObject === (window as any).qaScreen)).toBe(true);
  expect(await page.evaluate(() => (window as any).qaScreen.getTracks()[0].readyState)).toBe("live");
  await expect(page.locator(".main-stage")).toHaveAttribute("data-view", "game");
  await page.getByRole("button", { name: "Jogos", exact: true }).last().click();
  await page.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
  await expect(page.locator("video.provider-player")).toHaveCount(1);
  expect(tickets).toBeGreaterThan(initialTickets); expect(await page.evaluate(() => (window as any).qaCommands)).toBe(1);
});

test("Drive native video keeps portrait/4:3/16:9 content contained in the mobile canvas", async ({ page }) => {
  const player = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { MediaStage } from "./src/components/MediaStage.tsx";
    const noop = () => undefined;
    console.log(renderToStaticMarkup(createElement(MediaStage, {
      media: { provider: "google-drive", mediaId: "local-native-fixture", title: "Drive layout fixture", type: "video", state: "paused", position: 0, duration: 60, playbackRate: 1, startedAt: null, updatedAt: 0, controlledBy: "qa", revision: 1 },
      roomId: "fixture", apiUrl: "", token: "", theater: false, ambient: false, musicView: false, volume: 50, effectiveVolume: 50, resyncToken: 0,
      onSkip: noop, onRemove: noop, onAddMedia: noop, onEnded: noop, onTheaterChange: noop, onFullscreenChange: noop, onMusicViewChange: noop, onVolumeChange: noop, onPlaybackCommand: () => true,
    })));
  `], { cwd: webRoot, encoding: "utf8" });
  const origin = `http://127.0.0.1:${webPort}`;
  await page.route(`${origin}/qa-native-layout`, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"></head><body><div class="app-shell mobile-party"><main class="party-main"><header class="party-header">Native video layout</header><div class="party-workspace"><section class="party-content"><section class="main-stage"><div class="stage-layer active">${player}</div></section></section><section class="mobile-party-chat"><header class="mobile-chat-heading">Chat da Party</header><div class="mobile-chat-body"><div class="chat-panel"><div class="messages"></div><form class="chat-form"><input aria-label="Mensagem" placeholder="Escreva uma mensagem..."></form></div></div></section></div></main></div></body></html>` }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/qa-native-layout`);
  await expect(page.locator(".player-frame")).toHaveCSS("aspect-ratio", "16 / 9");
  for (const dimensions of [{ width: 180, height: 320 }, { width: 320, height: 240 }, { width: 320, height: 180 }]) {
    const native = await page.evaluate(async ({ width, height }) => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.fillRect(0, 0, width, height);
      const stream = canvas.captureStream(10), chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
      recorder.start();
      // A static canvas may produce no encoded frames in headless Windows Chromium.
      const frames = setInterval(() => canvas.getContext("2d")!.fillRect(0, 0, width, height), 40);
      await new Promise((resolve) => setTimeout(resolve, 400)); clearInterval(frames); recorder.stop(); await stopped;
      const video = document.querySelector<HTMLVideoElement>("video.provider-player")!;
      const source = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
      try {
        const loaded = new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Native fixture failed")); });
        video.src = source; await loaded;
        return { width: video.videoWidth, height: video.videoHeight, fit: getComputedStyle(video).objectFit };
      } finally { stream.getTracks().forEach((track) => track.stop()); URL.revokeObjectURL(source); }
    }, dimensions);
    expect(native.width / native.height).toBeCloseTo(dimensions.width / dimensions.height, 2);
    expect(native.fit).toBe("contain");
    const frame = await page.locator(".player-frame").boundingBox();
    expect(frame!.width / frame!.height).toBeCloseTo(16 / 9, 1);
  }
  await page.screenshot({ path: "test-results/mobile-native-video.png" });
});

test("M1 three clients keep playback shared and Ambiente local through late join and media switches", async ({ browser, request }) => {
  test.setTimeout(90_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const name of ["M1 Ana", "M1 Bia", "M1 Caio"]) {
    const email = `m1-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: name, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const { house } = await (await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${sessions[0].token}` }, data: { name: "M1 Multi QA" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers: { Authorization: `Bearer ${sessions[0].token}` }, data: { expiresInHours: 1, maxUses: 2 } })).json();
  for (const session of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.code}/accept`, { headers: { Authorization: `Bearer ${session.token}` } })).ok()).toBe(true);
  const contexts = await Promise.all(sessions.map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
  const socket = io(api, { autoConnect: false, auth: { token: sessions[0].token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
  try {
    for (let index = 0; index < 3; index++) {
      await contexts[index].addInitScript((session) => {
        if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
        localStorage.setItem("lumio.session.v1", JSON.stringify(session));
        (window as any).qaM1 = { created: 0, destroyed: 0, state: -1, position: 0 };
        (window as any).YT = { Player: class {
          events: any;
          constructor(_id: string, options: any) { (window as any).qaM1.created++; this.events = options.events; queueMicrotask(() => this.events.onReady()); }
          cueVideoById() {} seekTo(value: number) { (window as any).qaM1.position = value; }
          playVideo() { (window as any).qaM1.state = 1; this.events.onStateChange({ data: 1 }); }
          pauseVideo() { (window as any).qaM1.state = 2; this.events.onStateChange({ data: 2 }); }
          getCurrentTime() { return (window as any).qaM1.position; } getPlayerState() { return (window as any).qaM1.state; }
          getDuration() { return 300; } getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; }
          setVolume() {} setPlaybackRate() {} mute() {} unMute() {} destroy() { (window as any).qaM1.destroyed++; }
        } };
      }, sessions[index]);
      await contexts[index].route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ body: "<html><body style='background:#101210;color:#a7f3c2'>M1 local fixture</body></html>", contentType: "text/html" }));
    }
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all([a.goto(`${origin}/house/${house.id}`), b.goto(`${origin}/house/${house.id}`)]);
    await expect(a.getByRole("heading", { name: "M1 Multi QA" })).toBeVisible({ timeout: 20000 });
    await expect(b.getByRole("heading", { name: "M1 Multi QA" })).toBeVisible({ timeout: 20000 });
    const joined = new Promise<void>((resolve, reject) => { socket.once("room:snapshot", () => resolve()); socket.once("connect_error", reject); });
    socket.on("connect", () => socket.emit("room:join", { roomId: house.primaryRoomId, user: sessions[0].user })); socket.connect(); await joined;
    const item = (id: string, title: string) => ({ id: crypto.randomUUID(), provider: "youtube", providerMediaId: id, type: "video", title, duration: 300, addedBy: sessions[0].user, addedAt: new Date().toISOString() });
    const first = item("dQw4w9WgXcQ", "M1 primeira mídia");
    expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item: first })).ok).toBe(true);
    expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item: first })).ok).toBe(true);
    await expect(a.locator(".now-playing h2")).toHaveText(first.title);
    await expect(b.locator(".now-playing h2")).toHaveText(first.title);
    await expect.poll(() => a.evaluate(() => (window as any).qaM1.created)).toBe(1);
    await expect.poll(() => b.evaluate(() => (window as any).qaM1.created)).toBe(1);
    await b.getByRole("button", { name: "Entrar no Ambiente", exact: true }).click();
    await expect(b.locator(".music-presentation")).toBeVisible();
    await expect(a.locator(".music-presentation")).toHaveCount(0);
    expect(await b.evaluate(() => (window as any).qaM1.created)).toBe(1);
    // The room may already be playing when the first item becomes current.
    if (await a.evaluate(() => (window as any).qaM1.state !== 1)) {
      await a.locator(".player-touch-surface").hover();
      await a.getByRole("button", { name: "Reproduzir", exact: true }).click();
    }
    await expect(b.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
    await c.goto(`${origin}/house/${house.id}`);
    await expect(c.locator(".now-playing h2")).toHaveText(first.title);
    await expect(c.locator(".music-presentation")).toHaveCount(0);
    await expect.poll(() => c.evaluate(() => (window as any).qaM1.state)).toBe(1);
    await a.locator(".player-touch-surface").hover();
    await a.getByRole("slider", { name: "Posição da reprodução" }).focus(); await a.keyboard.press("ArrowRight");
    await expect.poll(async () => Number(await b.getByRole("slider", { name: "Posição da reprodução" }).inputValue())).toBeGreaterThan(1);
    const second = item("M7lc1UVf-VE", "M1 mídia intermediária"), third = item("jfKfPfyJRdk", "M1 mídia final");
    for (const next of [second, third]) {
      expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item: next })).ok).toBe(true);
      expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item: next })).ok).toBe(true);
    }
    for (const page of [a, b, c]) await expect(page.locator(".now-playing h2")).toHaveText(third.title);
    await expect(b.locator(".music-presentation strong")).toHaveText(third.title);
    await expect(a.locator(".music-presentation")).toHaveCount(0);
    await expect(c.locator(".music-presentation")).toHaveCount(0);
    for (const page of [a, b, c]) expect(await page.evaluate(() => (window as any).qaM1.created)).toBe(1);
    fs.mkdirSync(path.join(root, "artifacts/m1"), { recursive: true });
    await b.screenshot({ path: "artifacts/m1/m1-multi-client-b-ambient.png" });
    await a.screenshot({ path: "artifacts/m1/m1-multi-client-a-video.png" });
  } finally { socket.disconnect(); for (const context of contexts) await context.close(); }
});

test("M2 three browsers share favorites and collections without disturbing playback", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = [];
  for (const name of ["M2 Ana", "M2 Bia", "M2 Caio"]) {
    const email = `m2-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: name, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  m2QaSessions = sessions;
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "M2 Library QA" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 2 } })).json();
  for (const session of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.code}/accept`, { headers: { Authorization: `Bearer ${session.token}` } })).status()).toBe(200);
  const contexts = await Promise.all(sessions.map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
  const socket = io(api, { autoConnect: false, auth: { token: sessions[0].token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
  try {
    for (let index = 0; index < contexts.length; index++) await contexts[index].addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), sessions[index]);
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all([a.goto(`${origin}/house/${house.id}`), b.goto(`${origin}/house/${house.id}`)]);
    const joined = new Promise<void>((resolve, reject) => { socket.once("room:snapshot", () => resolve()); socket.once("connect_error", reject); });
    socket.on("connect", () => socket.emit("room:join", { roomId: house.primaryRoomId, user: sessions[0].user })); socket.connect(); await joined;
    const media = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: "dQw4w9WgXcQ", type: "video", title: "M2 shared media com um título suficientemente longo para testar o layout", duration: 300, addedBy: sessions[0].user, addedAt: new Date().toISOString() };
    expect((await socket.timeout(5000).emitWithAck("queue:add", { roomId: house.primaryRoomId, item: media })).ok).toBe(true);
    expect((await socket.timeout(5000).emitWithAck("media:change", { roomId: house.primaryRoomId, item: media })).ok).toBe(true);
    await expect(a.locator(".now-playing h2")).toHaveText(media.title);
    await expect(b.locator(".now-playing h2")).toHaveText(media.title);
    const before = await a.locator(".now-playing h2").textContent();
    await b.locator(".dock-add").click();
    const hubB = b.getByRole("dialog", { name: "A mídia da Casa" });
    await hubB.getByRole("button", { name: "Biblioteca", exact: true }).click();
    await hubB.getByRole("combobox", { name: "Filtrar biblioteca" }).selectOption("favorites");
    await expect(hubB.getByRole("heading", { name: "Nenhum favorito nesta Casa" })).toBeVisible();
    await expect(hubB.getByText("Carregando biblioteca...")).toBeHidden();
    await b.screenshot({ path: "artifacts/m2/m2-favorites-empty.png" });
    await a.getByRole("button", { name: "Salvar nos favoritos da Casa" }).click();
    await expect(a.getByRole("button", { name: "Remover dos favoritos da Casa" })).toBeVisible();
    await expect(hubB.locator(".media-row").filter({ hasText: media.title })).toBeVisible();
    await hubB.getByRole("button", { name: "Playlists", exact: true }).click();
    await hubB.getByRole("button", { name: "Nova playlist" }).first().click();
    await b.screenshot({ path: "artifacts/m2/m2-create-collection.png" });
    await hubB.getByRole("textbox", { name: "Nome" }).fill("M2 shared collection");
    await hubB.getByRole("button", { name: "Criar", exact: true }).click();
    await expect(hubB.locator(".playlist-detail header h3")).toHaveText("M2 shared collection");
    await b.screenshot({ path: "artifacts/m2/m2-collection-empty.png" });
    await hubB.getByLabel("Mais opções").click();
    await hubB.getByRole("button", { name: "Editar detalhes" }).click();
    await b.screenshot({ path: "artifacts/m2/m2-edit-collection.png" });
    await hubB.getByRole("button", { name: "Cancelar" }).click();
    await hubB.getByLabel("Mais opções").click();
    await a.locator(".dock-add").click();
    const hubA = a.getByRole("dialog", { name: "A mídia da Casa" });
    await hubA.getByRole("button", { name: "Biblioteca", exact: true }).click();
    const row = hubA.locator(".media-row").filter({ hasText: media.title });
    await expect(row).toBeVisible();
    await row.getByLabel(`Mais ações para ${media.title}`).click();
    await row.getByRole("button", { name: `Adicionar ${media.title} à playlist` }).click();
    await a.screenshot({ path: "artifacts/m2/m2-add-to-collection.png" });
    await hubA.getByRole("button", { name: /M2 shared collection/ }).click();
    await expect(hubB.locator(".playlist-items li")).toHaveCount(1);
    await b.screenshot({ path: "artifacts/m2/m2-collection-open-desktop.png" });
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await b.setViewportSize({ width, height: 844 });
      expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await hubB.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await b.screenshot({ path: `artifacts/m2/m2-collection-${width}.png` });
    }
    await b.setViewportSize({ width: 1280, height: 900 });
    await hubA.getByRole("combobox", { name: "Filtrar biblioteca" }).selectOption("favorites");
    await expect(row).toBeVisible();
    await a.screenshot({ path: "artifacts/m2/m2-favorites-desktop.png" });
    await hubA.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(hubA.locator(".media-row").filter({ hasText: media.title })).toBeVisible();
    await a.screenshot({ path: "artifacts/m2/m2-recents-desktop.png" });
    await hubA.getByRole("button", { name: "Google Drive", exact: true }).click();
    await a.screenshot({ path: "artifacts/m2/m2-drive-unavailable.png" });
    await hubA.getByRole("button", { name: "Descobrir", exact: true }).click();
    await hubA.getByRole("textbox", { name: "Pesquisar no YouTube ou colar URL" }).fill("m2 teste de erro sem chave");
    await expect(hubA.getByRole("alert")).toBeVisible();
    await a.screenshot({ path: "artifacts/m2/m2-error.png" });
    await hubA.getByRole("button", { name: "Biblioteca", exact: true }).click();
    expect(await a.locator(".now-playing h2").textContent()).toBe(before);
    expect(await b.locator(".now-playing h2").textContent()).toBe(before);
    await hubB.getByRole("button", { name: `Adicionar ${media.title} à fila` }).click();
    await hubB.getByRole("button", { name: "Fechar Media Hub" }).click();
    await b.getByRole("button", { name: /Abrir fila/ }).click();
    await expect(b.locator(".drawer-queue .queue-item")).toHaveCount(2);
    await c.goto(`${origin}/house/${house.id}`);
    await expect(c.locator(".now-playing h2")).toHaveText(media.title);
    await c.locator(".dock-add").click();
    const hubC = c.getByRole("dialog", { name: "A mídia da Casa" });
    await hubC.getByRole("button", { name: "Playlists", exact: true }).click();
    await expect(hubC.getByRole("button", { name: /M2 shared collection/ })).toBeVisible();
    await hubC.getByRole("button", { name: "Biblioteca", exact: true }).click();
    await expect(hubC.locator(".media-row").filter({ hasText: media.title })).toBeVisible();
    await a.screenshot({ path: "artifacts/m2/m2-party-player-preserved.png" });
    await a.screenshot({ path: "artifacts/m2/m2-hub-open-desktop.png" });
  } finally { socket.disconnect(); for (const context of contexts) await context.close(); }
});

test("M3 Queue V2: three clients converge through reorder, stale action, late join, batch and reconnect", async ({ browser, request }) => {
  test.setTimeout(180_000);
  fs.mkdirSync("artifacts/m3", { recursive: true });
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  const sessions = m2QaSessions ? [...m2QaSessions] : [];
  for (const name of sessions.length ? [] : ["M3 Ana", "M3 Bia", "M3 Caio"]) {
    const email = `m3-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: name, email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "M3 Queue QA" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 2 } })).json();
  for (const session of sessions.slice(1)) expect((await request.post(`${api}/api/invites/${invite.code}/accept`, { headers: { Authorization: `Bearer ${session.token}` } })).status()).toBe(200);
  const contexts = await Promise.all(sessions.map((_, index) => browser.newContext({ viewport: { width: index === 1 ? 390 : 1280, height: index === 1 ? 844 : 900 }, isMobile: index === 1, hasTouch: index === 1 })));
  const sockets = sessions.map((session) => io(api, { autoConnect: false, auth: { token: session.token }, transports: ["websocket"], extraHeaders: { Origin: origin } }));
  const roomId = house.primaryRoomId;
  const joinSocket = async (index: number) => { const s = sockets[index]; const joined = new Promise<any>((resolve, reject) => { s.once("room:snapshot", resolve); s.once("connect_error", reject); }); s.once("connect", () => s.emit("room:join", { roomId, user: sessions[index].user })); s.connect(); return joined; };
  const item = (id: string, owner: number) => ({ id: crypto.randomUUID(), provider: "youtube", providerMediaId: id, type: "video", title: `M3 mídia ${id}`, duration: 180, addedBy: sessions[owner].user, addedAt: new Date().toISOString() });
  try {
    for (let index = 0; index < contexts.length; index++) await contexts[index].addInitScript((session) => localStorage.setItem("lumio.session.v1", JSON.stringify(session)), sessions[index]);
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    const errors: string[] = [];
    for (const page of [a, b, c]) page.on("pageerror", (error) => errors.push(error.message));
    await Promise.all([a.goto(`${origin}/house/${house.id}`), b.goto(`${origin}/house/${house.id}`)]);
    await a.getByRole("button", { name: /Abrir fila/ }).click();
    await expect(a.locator(".queue-empty")).toBeVisible();
    await a.screenshot({ path: "artifacts/m3/m3-queue-empty-desktop.png" });
    await b.getByRole("button", { name: "Fila da Party", exact: true }).click();
    await expect(b.locator(".queue-empty")).toBeVisible();
    await b.screenshot({ path: "artifacts/m3/m3-queue-empty-mobile.png" });
    await b.getByRole("button", { name: "Fechar painel" }).click();
    const initial = await joinSocket(0); await joinSocket(1);
    sockets[0].emit("room:settings", { roomId, settings: { ...initial.settings, mediaControl: "everyone", queueControl: "members" } });
    const first = item("dQw4w9WgXcQ", 0), second = item("kXYiU_JCYtU", 1), third = item("3tmd-ClpJxA", 0);
    first.title = "M3 vídeo com um título bem longo para conferir truncamento e leitura da fila no celular";
    expect((await sockets[0].timeout(5000).emitWithAck("queue:add", { roomId, item: first })).ok).toBe(true);
    expect((await sockets[0].timeout(5000).emitWithAck("media:change", { roomId, item: first })).ok).toBe(true);
    expect((await sockets[1].timeout(5000).emitWithAck("queue:add", { roomId, item: second })).ok).toBe(true);
    expect((await sockets[0].timeout(5000).emitWithAck("queue:add", { roomId, item: third })).ok).toBe(true);
    await c.goto(`${origin}/house/${house.id}`); const late = await joinSocket(2);
    expect(late.queue.map((entry: { id: string }) => entry.id)).toEqual([first.id, second.id, third.id]);
    await expect(a.locator(".queue-group").first()).toContainText(first.title);
    await expect(a.locator(".queue-group").last()).toContainText(second.title);
    await a.screenshot({ path: "artifacts/m3/m3-queue-desktop.png" });
    sockets[0].emit("room:settings", { roomId, settings: { ...initial.settings, mediaControl: "everyone", queueControl: "members", autoplayNext: false } });
    await expect(a.locator(".queue-toolbar")).toContainText("Aguarda avanço manual");
    await a.screenshot({ path: "artifacts/m3/m3-autoplay-off.png" });
    sockets[0].emit("room:settings", { roomId, settings: { ...initial.settings, mediaControl: "everyone", queueControl: "members", autoplayNext: true } });
    await expect(a.locator(".queue-toolbar")).toContainText("Avança automaticamente");
    const oldRevision = late.queueRevision;
    const moved = await sockets[1].timeout(5000).emitWithAck("queue:move", { roomId, itemId: third.id, toIndex: 1, revision: oldRevision });
    expect(moved.ok).toBe(true);
    await expect(a.locator(".queue-group").last().locator(".queue-item").first()).toContainText(third.title);
    await a.screenshot({ path: "artifacts/m3/m3-reorder-desktop.png" });
    const stale = await sockets[0].timeout(5000).emitWithAck("queue:move", { roomId, itemId: second.id, toIndex: 1, revision: oldRevision });
    expect(stale.ok).toBe(false); expect(stale.queue.map((entry: { id: string }) => entry.id)).toEqual([first.id, third.id, second.id]);
    await expect(a.locator(".queue-group").last().locator(".queue-item").first()).toContainText(third.title);
    await b.getByRole("button", { name: "Fila da Party", exact: true }).click();
    await expect(b.locator(".queue-group").last().locator(".queue-item").first()).toContainText(third.title);
    await b.screenshot({ path: "artifacts/m3/m3-queue-mobile.png" });
    await b.getByRole("button", { name: `Opções para ${third.title}` }).click();
    await b.screenshot({ path: "artifacts/m3/m3-queue-menu-mobile.png" });
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await b.setViewportSize({ width, height: 844 });
      expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await b.screenshot({ path: `artifacts/m3/m3-queue-${width}.png` });
    }
    const removed = await sockets[0].timeout(5000).emitWithAck("queue:remove", { roomId, itemId: second.id, revision: moved.revision });
    expect(removed.ok).toBe(true);
    const collection = await (await request.post(`${api}/api/media-hub/${roomId}/playlists`, { headers, data: { name: "M3 coleção" } })).json();
    const playlistId = collection.playlist.id;
    expect((await request.post(`${api}/api/media-hub/${roomId}/playlists/${playlistId}/items`, { headers, data: { item: { ...third, id: "media-third" } } })).ok()).toBe(true);
    const batchId = crypto.randomUUID();
    const batch = await request.post(`${api}/api/media-hub/${roomId}/playlists/${playlistId}/queue`, { headers, data: { mode: "append", playNow: false, revision: removed.revision, operationId: batchId } });
    expect(batch.status()).toBe(200);
    const retry = await request.post(`${api}/api/media-hub/${roomId}/playlists/${playlistId}/queue`, { headers, data: { mode: "append", playNow: false, revision: removed.revision, operationId: batchId } });
    expect((await retry.json()).duplicate).toBe(true);
    sockets[1].disconnect(); await b.reload();
    if (!await b.getByRole("complementary", { name: "Painel da Party" }).isVisible()) await b.getByRole("button", { name: "Fila da Party", exact: true }).click();
    await expect(b.locator(".queue-group").last().locator(".queue-item")).toHaveCount(2);
    const next = await sockets[0].timeout(5000).emitWithAck("queue:advance", { roomId, expectedMediaId: first.providerMediaId, expectedQueueItemId: first.id });
    const repeated = await sockets[2].timeout(5000).emitWithAck("queue:advance", { roomId, expectedMediaId: first.providerMediaId, expectedQueueItemId: first.id });
    expect(next.advanced).toBe(true); expect(repeated.advanced).toBe(false);
    await expect(a.locator(".queue-group").first()).toContainText(third.title);
    await expect(c.locator(".now-playing h2")).toHaveText(third.title);
    for (let index = 0; index < 15; index++) expect((await sockets[0].timeout(5000).emitWithAck("queue:add", { roomId, item: { ...item(`M3LIST${String(index).padStart(5, "0")}`, 0), title: `M3 lista longa ${index + 1}` } })).ok).toBe(true);
    await expect(a.locator(".queue-group").last().locator(".queue-item")).toHaveCount(16);
    await a.screenshot({ path: "artifacts/m3/m3-long-list-desktop.png" });
    await b.screenshot({ path: "artifacts/m3/m3-long-list-mobile.png" });
    await a.locator(".dock-add").click();
    const hub = a.getByRole("dialog", { name: "A mídia da Casa" });
    await hub.getByRole("button", { name: "Google Drive", exact: true }).click();
    await a.screenshot({ path: "artifacts/m3/m3-drive-unavailable-local.png" });
    await hub.getByRole("button", { name: "Fechar Media Hub" }).click();
    expect(errors).toEqual([]);
  } finally { for (const socket of sockets) socket.disconnect(); for (const context of contexts) await context.close(); }
});

test("GX2 Party transport, Call peers and tracks keep identity across visual child transitions", async ({ request }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  // Reuse verified E2E identities when the full suite reaches the signup rate limit.
  const sessions: any[] = m2QaSessions ? m2QaSessions.slice(0, 2) : [];
  for (const displayName of ["GX2 A", "GX2 B"].slice(sessions.length)) {
    const email = `gx2-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName, email, password } })).status()).toBe(201);
    const last = fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!;
    const link = JSON.parse(last).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    sessions.push(await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json());
  }
  const headers = { Authorization: `Bearer ${sessions[0].token}` };
  const { house } = await (await request.post(`${api}/api/houses`, { headers, data: { name: "GX2 Party lifetime" } })).json();
  const { invite } = await (await request.post(`${api}/api/houses/${house.id}/invites`, { headers, data: { expiresInHours: 1, maxUses: 1, role: "MEMBER" } })).json();
  expect((await request.post(`${api}/api/invites/${invite.token}/accept`, { headers: { Authorization: `Bearer ${sessions[1].token}` } })).ok()).toBe(true);
  const rtcBrowser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const contexts = await Promise.all(sessions.map(() => rtcBrowser.newContext()));
    for (let index = 0; index < contexts.length; index++) await contexts[index].addInitScript((session) => {
      if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
      localStorage.setItem("lumio.session.v1", JSON.stringify(session));
      const qa = (window as any).gx2 = { sockets: [] as WebSocket[], peers: [] as RTCPeerConnection[], captures: [] as MediaStream[], displays: [] as MediaStream[], packets: [] as string[], before: null as any };
      const Transport = window.WebSocket;
      window.WebSocket = class extends Transport {
        constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); if (String(url).includes("/socket.io/")) qa.sockets.push(this); }
        send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
          if (typeof data === "string" && data.startsWith("42")) {
            try { const packet = JSON.parse(data.slice(2)); if (typeof packet[0] === "string") qa.packets.push(packet[0]); } catch { /* Not a Socket.IO event packet. */ }
          }
          super.send(data);
        }
      };
      const Peer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Peer { constructor(config?: RTCConfiguration) { super(config); qa.peers.push(this); } };
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => { const stream = await capture(constraints); qa.captures.push(stream); return stream; };
      navigator.mediaDevices.getDisplayMedia = async () => { const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 16; const stream = canvas.captureStream(1); qa.displays.push(stream); return stream; };
    }, sessions[index]);
    const [a, b] = await Promise.all(contexts.map((context) => context.newPage()));
    try {
      for (const page of [a, b]) {
        await page.goto(`${origin}/house/${house.id}`);
        await expect(page.locator(".dock-call-state").first()).toHaveText("Microfone desligado", { timeout: 20_000 });
        expect(await page.evaluate(() => (window as any).gx2.captures.length)).toBe(0);
        expect(await page.evaluate(() => (window as any).gx2.sockets.length)).toBe(1);
      }
      await expect.poll(() => a.evaluate(() => (window as any).gx2.peers.filter((peer: RTCPeerConnection) => peer.connectionState === "connected").length), { timeout: 20_000 }).toBe(1);
      await a.getByRole("button", { name: "Ativar microfone", exact: true }).click();
      await expect(a.getByRole("button", { name: "Desativar microfone", exact: true })).toBeVisible();
      await b.getByRole("button", { name: "Desativar áudio da call", exact: true }).click();
      await a.getByRole("button", { name: "Compartilhar tela", exact: true }).click();
      await expect(a.getByRole("button", { name: "Parar compartilhamento", exact: true })).toBeVisible();
      await a.getByRole("button", { name: "Abrir chat", exact: true }).click();
      await a.getByRole("textbox", { name: "Mensagem" }).fill("Rascunho GX2 permanece");
      for (const page of [a, b]) await page.evaluate(() => {
        const q = (window as any).gx2;
        q.before = { shell: document.querySelector(".app-shell"), socket: q.sockets[0], peers: [...q.peers], mic: q.captures[0]?.getAudioTracks()[0], display: q.displays[0]?.getVideoTracks()[0], captures: q.captures.length, displays: q.displays.length, packets: [...q.packets], player: document.querySelector(".lumio-player") };
      });
      for (let step = 0; step < 5; step++) {
        const page = step % 2 ? b : a;
        await page.getByRole("button", { name: "Jogos", exact: true }).click();
        await expect(page.locator(".main-stage")).toHaveAttribute("data-view", "game");
        await expect(page.locator(".now-playing")).toHaveCount(0);
        await expect(page.getByLabel("Controles da Party").getByRole("button", { name: "Adicionar mídia" })).toHaveCount(0);
        await expect(page.getByLabel("Controles da Party").getByRole("button", { name: /Abrir fila/ })).toHaveCount(0);
        await expect(page.locator(".party-experience-nav [aria-current=page]")).toHaveText("Jogos");
        await page.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
      }
      for (const page of [a, b]) expect(await page.evaluate(() => {
        const q = (window as any).gx2, before = q.before;
        const changed = q.packets.slice(before.packets.length);
        return {
          sameShell: document.querySelector(".app-shell") === before.shell,
          sameSocket: q.sockets.length === 1 && q.sockets[0] === before.socket && before.socket.readyState === WebSocket.OPEN,
          samePeers: q.peers.length === before.peers.length && q.peers.every((peer: RTCPeerConnection, index: number) => peer === before.peers[index] && peer.connectionState !== "closed"),
          sameMic: q.captures[0]?.getAudioTracks()[0] === before.mic,
          sameDisplay: q.displays[0]?.getVideoTracks()[0] === before.display,
          playerRemounted: document.querySelector(".lumio-player") !== before.player,
          captures: q.captures.length - before.captures,
          displays: q.displays.length - before.displays,
          socialPackets: changed.filter((name: string) => ["room:join", "room:leave", "voice:join", "voice:leave"].includes(name)),
        };
      })).toEqual({ sameShell: true, sameSocket: true, samePeers: true, sameMic: true, sameDisplay: true, playerRemounted: true, captures: 0, displays: 0, socialPackets: [] });
      await expect(a.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Rascunho GX2 permanece");
      await expect(a.getByRole("button", { name: "Desativar microfone", exact: true })).toBeVisible();
      await expect(b.getByRole("button", { name: "Ativar áudio da call", exact: true })).toBeVisible();
      await b.getByRole("button", { name: "Abrir chat", exact: true }).click();
      await b.getByRole("textbox", { name: "Mensagem" }).fill("GX2 mensagem única");
      await b.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
      await expect(a.locator(".chat-panel .message").filter({ hasText: "GX2 mensagem única" })).toHaveCount(1);
      await expect(a.getByRole("textbox", { name: "Mensagem" })).toHaveValue("Rascunho GX2 permanece");
      const details = await (await request.get(`${api}/api/houses/${house.id}`, { headers })).json();
      expect(details.house.members.filter((member: { inParty: boolean }) => member.inParty)).toHaveLength(2);
      fs.mkdirSync(path.join(root, "test-results/gx2"), { recursive: true });
      for (const width of [1440, 320, 375, 390, 412, 430]) {
        await a.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
        expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await a.screenshot({ path: path.join(root, `test-results/gx2/party-${width}.png`) });
      }
      await a.getByRole("button", { name: "Abrir menu da Casa e Party" }).click();
      await a.getByRole("button", { name: "Sair da Party", exact: true }).click();
      await expect(a).toHaveURL(/\/app$/);
      await expect.poll(() => a.evaluate(() => (window as any).gx2.peers.every((peer: RTCPeerConnection) => peer.connectionState === "closed") && (window as any).gx2.captures.every((stream: MediaStream) => stream.getTracks().every((track) => track.readyState === "ended")) && (window as any).gx2.displays.every((stream: MediaStream) => stream.getTracks().every((track) => track.readyState === "ended")))).toBe(true);
      expect(await a.evaluate(() => (window as any).gx2.packets.filter((name: string) => name === "room:leave").length)).toBe(1);
      expect(await a.evaluate(() => (window as any).gx2.sockets[0].readyState)).toBe(WebSocket.CLOSED);
    } finally { for (const context of contexts) await context.close(); }
  } finally { await rtcBrowser.close(); }
});

test("GX3 two tabs keep one Party while Media viewers govern authoritative playback", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
  let session: any = m2QaSessions?.[0];
  if (!session) {
    const email = `gx3-${crypto.randomUUID()}@example.test`, password = "local-e2e-password-123";
    expect((await request.post(`${api}/api/auth/signup`, { data: { displayName: "GX3 Viewer", email, password } })).status()).toBe(201);
    const link = JSON.parse(fs.readFileSync(path.join(directory, "mail.jsonl"), "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    expect((await request.post(`${api}/api/auth/verification/confirm`, { data: { token: new URL(link).hash.slice(7) } })).status()).toBe(204);
    session = await (await request.post(`${api}/api/auth/login`, { data: { email, password } })).json();
  }
  const { house } = await (await request.post(`${api}/api/houses`, { headers: { Authorization: `Bearer ${session.token}` }, data: { name: "GX3 Viewer QA" } })).json();
  const contextA = await browser.newContext(), contextB = await browser.newContext();
  for (const context of [contextA, contextB]) {
    await context.addInitScript((value) => {
      if (window.top !== window || !["http:", "https:"].includes(location.protocol)) return;
      localStorage.setItem("lumio.session.v1", JSON.stringify(value));
      (window as any).gx3Player = { created: 0, destroyed: 0 };
      (window as any).YT = { Player: class {
        events: any;
        constructor(_id: string, options: any) { (window as any).gx3Player.created++; this.events = options.events; queueMicrotask(() => this.events.onReady()); }
        cueVideoById() {} seekTo() {} playVideo() { this.events.onStateChange({ data: 1 }); } pauseVideo() { this.events.onStateChange({ data: 2 }); }
        getCurrentTime() { return 12; } getPlayerState() { return 1; } getDuration() { return 300; } getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; }
        setVolume() {} setPlaybackRate() {} mute() {} unMute() {} destroy() { (window as any).gx3Player.destroyed++; }
      } };
    }, session);
    await context.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ body: "<html><body>GX3 local fixture</body></html>", contentType: "text/html" }));
  }
  const a = await contextA.newPage(), b = await contextB.newPage();
  const controller = io(api, { autoConnect: false, auth: { token: session.token }, transports: ["websocket"], extraHeaders: { Origin: origin } });
  const roomId: string = house.primaryRoomId;
  const sync = () => new Promise<any>((resolve) => { controller.once("media:sync", resolve); controller.emit("media:request-sync", { roomId }); });
  const roomSnapshot = () => new Promise<any>((resolve) => { controller.once("room:snapshot", resolve); controller.emit("room:join", { roomId, user: session.user }); });
  try {
    await Promise.all([a.goto(`${origin}/house/${house.id}/media`), b.goto(`${origin}/house/${house.id}/media`)]);
    await expect(a.locator(".main-stage")).toHaveAttribute("data-view", "media");
    await expect(b.locator(".main-stage")).toHaveAttribute("data-view", "media");
    const joined = new Promise<void>((resolve, reject) => { controller.once("room:snapshot", () => resolve()); controller.once("connect_error", reject); });
    controller.on("connect", () => controller.emit("room:join", { roomId, user: session.user })); controller.connect(); await joined;
    const item = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: "M7lc1UVf-VE", type: "video", title: "GX3 playback", duration: 300, addedBy: session.user, addedAt: new Date().toISOString() };
    expect((await controller.timeout(5000).emitWithAck("queue:add", { roomId, item })).ok).toBe(true);
    expect((await controller.timeout(5000).emitWithAck("media:change", { roomId, item })).ok).toBe(true);
    await expect(a.locator("iframe.provider-player")).toHaveCount(1);
    await expect(b.locator("iframe.provider-player")).toHaveCount(1);
    await expect.poll(async () => (await sync()).state).toBe("playing");
    await a.evaluate(() => { (window as any).gx3Before = { shell: document.querySelector(".app-shell"), player: document.querySelector(".lumio-player") }; });
    await a.getByRole("button", { name: "Jogos", exact: true }).click();
    await expect(a).toHaveURL(`${origin}/house/${house.id}/games`);
    await expect(a.locator("iframe.provider-player,video.provider-player,.lumio-player")).toHaveCount(0);
    expect(await a.evaluate(() => document.querySelector(".app-shell") === (window as any).gx3Before.shell)).toBe(true);
    await a.waitForTimeout(1800);
    expect((await sync()).state).toBe("playing");
    const beforeQueue = await roomSnapshot();
    await b.getByRole("button", { name: "Jogos", exact: true }).click();
    await expect(b.locator("iframe.provider-player,video.provider-player,.lumio-player")).toHaveCount(0);
    await expect.poll(async () => (await sync()).state, { timeout: 8000 }).toBe("paused");
    const paused = await sync();
    expect(paused.mediaId).toBe(item.providerMediaId);
    expect(paused.position).toBeGreaterThanOrEqual(0);
    const afterQueue = await roomSnapshot();
    expect(afterQueue.queueRevision).toBe(beforeQueue.queueRevision);
    expect(afterQueue.queue.map((entry: { id: string }) => entry.id)).toEqual(beforeQueue.queue.map((entry: { id: string }) => entry.id));
    expect(afterQueue.history.length).toBe(beforeQueue.history.length);
    await a.getByRole("button", { name: "Assistir/Ouvir", exact: true }).click();
    await expect(a.locator("iframe.provider-player")).toHaveCount(1);
    expect((await sync()).state).toBe("paused");
    expect(await a.evaluate(() => document.querySelector(".lumio-player") !== (window as any).gx3Before.player)).toBe(true);
    await a.getByRole("button", { name: "Reproduzir", exact: true }).click();
    await expect.poll(async () => (await sync()).state).toBe("playing");
    await a.waitForTimeout(1800);
    expect((await sync()).state).toBe("playing");
    await a.goBack(); await expect(a).toHaveURL(`${origin}/house/${house.id}/games`);
    await expect(a.locator(".lumio-player")).toHaveCount(0);
    await expect.poll(async () => (await sync()).state, { timeout: 8000 }).toBe("paused");
    await a.goForward(); await expect(a).toHaveURL(`${origin}/house/${house.id}/media`);
    await a.reload(); await expect(a.locator(".main-stage")).toHaveAttribute("data-view", "media");
    await b.reload(); await expect(b.locator(".main-stage")).toHaveAttribute("data-view", "game");
    await expect(b.locator(".lumio-player")).toHaveCount(0);
    fs.mkdirSync(path.join(root, "artifacts/gx3"), { recursive: true });
    for (const width of [320, 390, 1440]) {
      await b.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await b.screenshot({ path: path.join(root, `artifacts/gx3/games-${width}.png`) });
      await a.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await a.screenshot({ path: path.join(root, `artifacts/gx3/media-${width}.png`) });
    }
  } finally { controller.disconnect(); await contextA.close(); await contextB.close(); }
});

test("GX4.2.1 Draw visual stress fixture: 12 players, score extremes, critical timer, zoom and reduced motion", async ({ browser }) => {
  test.setTimeout(90_000);
  const origin = `http://127.0.0.1:${webPort}`;
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const open = async (page: typeof desktop, role: "drawer" | "guesser", phase = "DRAWING") => {
    await page.goto(`${origin}/qa/draw-freeze.html?role=${role}&phase=${phase}`);
    await expect(page.locator(".draw-v4")).toBeVisible();
  };
  try {
    await open(desktop, "drawer");
    const scores = desktop.getByRole("list", { name: "Placar do jogo" });
    await expect(scores.locator("li")).toHaveCount(12);
    for (const name of ["Alexandre de Albuquerque", "JogadorComUmNomeMuitoGrande"]) await expect(scores).toContainText(name);
    for (const score of [0, 2, 48, 100, 198, 205]) await expect(scores.getByLabel(`${score} de 200 pontos`, { exact: true })).toHaveCount(1);
    await expect(scores.locator("li").filter({ hasText: "Desenha" })).toHaveCount(1);
    await expect(scores.locator("li").filter({ hasText: "Acertou ✓" })).toHaveCount(2);
    await expect(desktop.locator(".game-timer")).toHaveClass(/is-ending/);
    const criticalBoard = (await desktop.locator(".draw-board").boundingBox())!;
    const criticalHud = (await desktop.locator(".draw-heading").boundingBox())!;
    const criticalContrast = await desktop.locator(".game-timer").evaluate((element) => {
      const foreground = (getComputedStyle(element).color.match(/\d+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (channels: number[]) => channels.map((channel) => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const [light, dark] = [luminance(foreground), luminance([24, 44, 34])].sort((a, b) => b - a);
      return (light + .05) / (dark + .05);
    });
    expect(criticalContrast).toBeGreaterThan(4.5);
    await desktop.screenshot({ path: "test-results/gx421-12-desktop-drawer.png" });
    await desktop.goto(`${origin}/qa/draw-freeze.html?role=drawer&phase=DRAWING&timer=11`);
    await expect(desktop.locator(".draw-v4")).toBeVisible();
    const normalBoard = (await desktop.locator(".draw-board").boundingBox())!;
    const normalHud = (await desktop.locator(".draw-heading").boundingBox())!;
    expect(Math.abs(criticalBoard.y - normalBoard.y)).toBeLessThan(1);
    expect(Math.abs(criticalHud.height - normalHud.height)).toBeLessThan(1);
    await open(desktop, "drawer");
    const desktopScorePanel = desktop.locator(".draw-bottom");
    expect(await desktopScorePanel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await desktopScorePanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(scores.locator("li").last()).toContainText("Alexandre de Albuquerque");
    await scores.locator("li").last().scrollIntoViewIfNeeded();
    const lastDesktopScore = (await scores.locator("li").last().boundingBox())!;
    expect(lastDesktopScore.y).toBeGreaterThanOrEqual(0);
    expect(lastDesktopScore.y + lastDesktopScore.height).toBeLessThanOrEqual(900);
    await desktop.screenshot({ path: "test-results/gx421-12-desktop-score-bottom.png" });
    await open(desktop, "guesser");
    await desktop.screenshot({ path: "test-results/gx421-12-desktop-guesser.png" });
    await open(desktop, "drawer", "GAME_RESULT");
    await expect(desktop.getByText("205 pontos")).toBeVisible();
    await desktop.screenshot({ path: "test-results/gx421-score-result-desktop.png" });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await open(mobile, "drawer");
    await mobile.screenshot({ path: "test-results/gx421-12-mobile-before-score.png" });
    await expect(mobile.locator(".draw-v4-active")).toBeVisible();
    await expect(mobile.locator(".draw-score-toggle")).toBeVisible();
    await mobile.locator(".draw-score-toggle").click();
    await expect(mobile.getByRole("list", { name: "Placar do jogo" }).locator("li")).toHaveCount(12);
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mobile.screenshot({ path: "test-results/gx421-12-mobile-drawer.png" });
    const mobileScorePanel = mobile.locator(".draw-scoreboard");
    expect(await mobileScorePanel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await mobileScorePanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await mobile.screenshot({ path: "test-results/gx421-12-mobile-score-bottom.png" });
    await open(mobile, "guesser");
    await mobile.locator(".draw-score-toggle").click();
    await mobile.screenshot({ path: "test-results/gx421-12-mobile-guesser.png" });
    await open(mobile, "drawer", "CHOOSING_WORD");
    await expect(mobile.getByRole("dialog", { name: "Escolha o que você vai desenhar" })).toBeVisible();
    await mobile.screenshot({ path: "test-results/gx421-word-choice-mobile.png" });
    await open(mobile, "drawer", "GAME_RESULT");
    await mobile.screenshot({ path: "test-results/gx421-score-result-mobile.png" });
    await mobile.setViewportSize({ width: 320, height: 568 });
    await open(mobile, "drawer");
    const wordBox = (await mobile.locator(".draw-word").boundingBox())!;
    const scoreBox = (await mobile.locator(".draw-score-toggle").boundingBox())!;
    expect(wordBox.y >= scoreBox.y + scoreBox.height || scoreBox.y >= wordBox.y + wordBox.height || wordBox.x + wordBox.width <= scoreBox.x || scoreBox.x + scoreBox.width <= wordBox.x).toBe(true);
    await mobile.screenshot({ path: "test-results/gx421-12-drawer-320x568.png" });

    const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await open(reduced, "drawer");
    await expect(reduced.locator(".game-timer")).toHaveClass(/is-ending/);
    expect(await reduced.locator(".game-timer").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await reduced.screenshot({ path: "test-results/gx421-critical-reduced-motion.png" });
    await open(reduced, "drawer", "CHOOSING_WORD");
    expect(await reduced.locator(".draw-choice-dialog").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await reduced.close();

    const zoom = await browser.newPage({ viewport: { width: 640, height: 450 } });
    for (const [role, phase] of [["drawer", "DRAWING"], ["guesser", "DRAWING"], ["drawer", "CHOOSING_WORD"]] as const) {
      await open(zoom, role, phase);
      expect(await zoom.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(zoom.locator(".game-timer")).toBeVisible();
      await expect(zoom.locator(".draw-word")).toBeVisible();
      if (phase === "CHOOSING_WORD") await expect(zoom.getByRole("dialog", { name: "Escolha o que você vai desenhar" })).toBeVisible();
      else if (role === "drawer") await expect(zoom.getByRole("group", { name: "Ferramentas de desenho" })).toBeVisible();
      else await expect(zoom.getByRole("textbox", { name: "Seu palpite" })).toBeVisible();
      await zoom.screenshot({ path: `test-results/gx421-zoom200-${role}-${phase}.png` });
    }
    await zoom.close();
    await mobile.close();
  } finally {
    await desktop.close();
  }
});
