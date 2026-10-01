import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GameActionBar, GameHud, GamePhase, GameResult, GameShell, GameStage, GameTimer } from "./GameDesignSystem";

test("GX4.1 game shell composes public presentation without changing game state", () => {
  const html = renderToStaticMarkup(<GameShell game="quiz" className="quiz-game" data-phase="QUESTION" aria-label="Quiz">
    <GameHud className="quiz-heading"><h2>Quiz</h2><GameTimer seconds={12} /></GameHud>
    <GameStage><p>Pergunta</p></GameStage>
    <GameActionBar><button disabled>Responder</button></GameActionBar>
    <GameResult>Resultado</GameResult>
  </GameShell>);
  assert.match(html, /class="game-shell quiz-game"/);
  assert.match(html, /data-phase="QUESTION"/);
  assert.match(html, /aria-label="Quiz"/);
  assert.match(html, /class="game-hud quiz-heading"/);
  assert.match(html, /aria-label="Tempo restante"/);
  assert.match(html, /class="game-stage-surface"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /class="game-result"/);
});

test("GX4.1 timer clamps invalid state and formats clock without owning time", () => {
  assert.match(renderToStaticMarkup(<GameTimer seconds={-3} unit="clock" />), />0:00<\/time>/);
  assert.match(renderToStaticMarkup(<GameTimer seconds={Number.NaN} />), />0s<\/time>/);
  assert.match(renderToStaticMarkup(<GameTimer seconds={125} unit="clock" />), />2:05<\/time>/);
  assert.match(renderToStaticMarkup(<GamePhase tone="active">Jogos</GamePhase>), /game-phase-active/);
});
