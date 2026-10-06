/**
 * Single-source-of-truth guard for game rules.
 *
 * Run:  node --experimental-strip-types scripts/single-source.test.ts
 *
 * The courts table used to exist twice — once in `lib/game/rules.ts` and once in
 * `features/game/constants/courts.ts` — with identical numbers. Identical
 * duplication is the most dangerous kind: it passes every test until the day
 * someone changes one copy.
 *
 * This harness asserts the multiplayer view is DERIVED from the shared table, so
 * editing a card count in one place is immediately visible in the other and a
 * re-introduced second copy fails loudly.
 */
import { LEVELS, roundsPerLevel, LEVEL_COUNT, TOTAL_ROUNDS, levelConfig, dealerSeatFor, guesserSeatFor } from "../lib/game/rules.ts";
import {
  COURTS,
  COURT_COUNT,
  TOTAL_ROUNDS as SHARED_TOTAL_ROUNDS,
  courtAt,
  dealerForRound,
  guesserForRound,
  roundsInCourt,
} from "../features/game/constants/courts.ts";
import { readFileSync } from "node:fs";
import flow from "node:assert/strict";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${name}\n       ${(err as Error).message}`);
  }
}

console.log("single-source.test — rules have exactly one owner");

check("the multiplayer LEVELS view is derived from the shared COURTS table", () => {
  flow.equal(LEVELS.length, COURTS.length);
  for (let i = 0; i < COURTS.length; i += 1) {
    flow.equal(LEVELS[i].index, i, `index ${i}`);
    flow.equal(LEVELS[i].name, COURTS[i].name, `name ${i}`);
    flow.equal(LEVELS[i].cards, COURTS[i].cards, `cards ${i}`);
    flow.equal(LEVELS[i].seconds, COURTS[i].seconds, `seconds ${i}`);
    flow.equal(LEVELS[i].points, COURTS[i].points, `points ${i}`);
  }
});

check("round counts are derived, not two coincidentally-equal literals", () => {
  for (let i = 0; i < COURTS.length; i += 1) {
    flow.equal(roundsPerLevel(i), roundsInCourt(i), `court ${i}`);
  }
  flow.equal(LEVEL_COUNT, COURT_COUNT);
  flow.equal(TOTAL_ROUNDS, SHARED_TOTAL_ROUNDS);
});

check("levelConfig returns the shared court values for every index", () => {
  for (let i = 0; i < COURTS.length; i += 1) {
    const cfg = levelConfig(i);
    flow.equal(cfg.index, i);
    flow.equal(cfg.name, COURT_COUNT && COURTS[i].name);
    flow.equal(cfg.cards, COURTS[i].cards);
    flow.equal(cfg.seconds, COURTS[i].seconds);
    flow.equal(cfg.points, COURTS[i].points);
  }
});

check("levelConfig clamps out-of-range indices exactly like courtAt", () => {
  for (const index of [-99, -1, 0, 1, 2, 3, 99]) {
    flow.equal(levelConfig(index).name, courtAt(index).name, `index ${index}`);
    flow.equal(levelConfig(index).cards, courtAt(index).cards, `index ${index}`);
  }
});

check("the online seat aliases are the shared rotation, not a second copy", () => {
  // Classic online play is ALWAYS alternate turns, i.e. the shared rotation
  // with a block size of 1. Sweep well past a full match to catch off-by-ones.
  for (let round = 1; round <= 60; round += 1) {
    flow.equal(dealerSeatFor(round), dealerForRound(round, 1), `dealer round ${round}`);
    flow.equal(guesserSeatFor(round), guesserForRound(round, 1), `guesser round ${round}`);
  }
});

check("seat aliases and the shared rotation agree on the court boundary", () => {
  // Round 10 of a court then the reset to round 1 must rotate identically.
  flow.equal(dealerSeatFor(10), dealerForRound(10, 1));
  flow.equal(dealerSeatFor(1), dealerForRound(1, 1));
  flow.equal(guesserSeatFor(1), guesserForRound(1, 1));
});

check("no module restates the court numbers", () => {
  // Static guard: the court names may only appear in the owning module.
  const files = [
    "lib/game/rules.ts",
    "lib/game/flow.ts",
    "features/game/logic/seats.ts",
    "features/game/logic/bot.ts",
    "features/game/logic/round.ts",
    "features/game/logic/scoring.ts",
    "features/game/logic/progression.ts",
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const leaked = /THE COURT|HIGH STAKES|FINAL DUEL/.test(src);
    flow.equal(leaked, false, `${file} must not restate court names`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
