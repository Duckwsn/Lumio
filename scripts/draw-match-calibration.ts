// Deterministic, local balance study. No network, database, accounts or secrets.
import { guessPoints } from "../apps/server/src/drawGame.js";
import { drawTargets } from "@lumio/shared";
let seed = 20260929;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const rows = [];
for (const players of [2, 3, 5, 8]) for (const target of drawTargets) {
  let roundsTotal = 0, pointsTotal = 0, secondsTotal = 0;
  const samples: number[] = [];
  for (let match = 0; match < 1000; match++) {
    const scores = Array(players).fill(0); let rounds = 0, seconds = 0;
    while (Math.max(...scores) < target && rounds < 10000) {
      const drawer = rounds % players;
      const guesses = scores.map((_, id) => ({ id, hit: id !== drawer && random() < .75, fraction: .2 + random() * .7 })).filter((g) => g.hit).sort((a, b) => b.fraction - a.fraction);
      let drawerPoints = 0, points = 0;
      for (const [order, guess] of guesses.entries()) {
        const gain = guessPoints(guess.fraction, order); scores[guess.id] += gain; points += gain;
        const reward = Math.min(2, 6 - drawerPoints); drawerPoints += reward; scores[drawer] += reward; points += reward;
      }
      pointsTotal += points;
      // 7s average choice, actual last guess if all succeeded, else 80s, plus 5s result.
      seconds += 12 + (guesses.length === players - 1 ? 80 * (1 - guesses.at(-1)!.fraction) : 80);
      rounds++;
    }
    roundsTotal += rounds; secondsTotal += seconds; samples.push(rounds);
  }
  samples.sort((a, b) => a - b);
  rows.push({ players, target, meanRounds: +(roundsTotal / 1000).toFixed(1), p10: samples[100], p90: samples[900], meanPointsPerRound: +(pointsTotal / roundsTotal).toFixed(1), illustrativeMinutes: +(secondsTotal / 60000).toFixed(1) });
}
console.log(JSON.stringify({ seed: 20260929, matchesPerRow: 1000, assumptions: "Independent 75% success; remaining fraction U(.2,.9); 7s choice + 5s result; no absences; not a human/WAN benchmark", rows }, null, 2));
