/**
 * Behavioural equivalence harness for the extracted game logic.
 *
 * Run:  node --experimental-strip-types scripts/logic.test.ts
 *
 * Every assertion here compares the extracted feature module against the rule
 * the original inline code implemented. If a future edit changes any of these
 * answers, the refactor has changed gameplay — which is exactly what must never
 * happen.
 */
import {
  dealerForRound,
  guesserForRound,
  isBotSeat,
} from "../features/game/logic/seats.ts";
import {
  blockStartForRound,
  hidesIntoBlock,
} from "../features/game/constants/courts.ts";
import {
  applyRoundWin,
  applyLifeLoss,
  lifeLoser,
  lifeWinner,
} from "../features/game/logic/scoring.ts";
import {
  afterRound,
  afterCourt,
  isFinalCourt,
  isFinalRoundOfCourt,
} from "../features/game/logic/progression.ts";
import {
  BLUFF_CHANCE,
  ACCUSE_CHANCE_VS_BLUFF,
  ACCUSE_CHANCE_OTHERWISE,
  decideBluff,
  decideHidingSpot,
  decideAccusation,
  decideGuess,
  decideGuessTurn,
  BOT_SEAT,
} from "../features/game/logic/bot.ts";
import { resolveLocalRound } from "../features/game/logic/round.ts";
import {
  picksThisCourt,
  summarisePicks,
  describePattern,
} from "../features/game/logic/strategy.ts";
import {
  COURTS,
  STARTING_LIVES,
  TOTAL_ROUNDS,
  hidesPerBlock,
  roundsInCourt,
  setCurrentCourtIndex,
} from "../features/game/constants/courts.ts";
import { TURN_VEIL_MS, BOT_THINK_AFTER_VEIL_MS, REDUCED } from "../features/game/constants/pacing.ts";
import type { RoundHistoryEntry, Seat } from "../features/game/types/game.ts";
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

console.log("logic.test — extracted game logic vs original behaviour");

// ---------------------------------------------------------------------------
// Constants must still describe the shipped game
// ---------------------------------------------------------------------------

check("courts keep the shipped card counts, hide counts, clocks and stakes", () => {
  flow.deepEqual(
    COURTS.map((c) => [c.name, c.cards, c.hidesPerPlayer, c.seconds, c.points]),
    [
      ["THE COURT", 5, 7, 20, 1],
      ["HIGH STAKES", 3, 5, 15, 2],
      ["FINAL DUEL", 2, 3, 9, 3],
    ],
  );
  flow.equal(roundsInCourt(0), 14);
  flow.equal(roundsInCourt(1), 10);
  flow.equal(roundsInCourt(2), 6);
  flow.equal(TOTAL_ROUNDS, 30);
  flow.equal(STARTING_LIVES, 5);
});

check("pacing constants match the original inline literals", () => {
  flow.equal(TURN_VEIL_MS, 2800);
  flow.equal(BOT_THINK_AFTER_VEIL_MS, 1500);
  flow.deepEqual(
    [REDUCED.veil, REDUCED.afterVeil, REDUCED.shuffle, REDUCED.hidePick, REDUCED.hideLock, REDUCED.guessReach, REDUCED.accuse],
    [120, 30, 400, 40, 120, 30, 20],
  );
});

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

check("seat math: each court gives each player a block sized to its cards", () => {
  // DEFAULT rotation: within a court, seat 0 hides the first block and seat 1 the
  // second. Block size follows the card count, so it differs per court.
  for (let court = 0; court < 3; court += 1) {
    const block = hidesPerBlock(court);
    setCurrentCourtIndex(court);
    for (let round = 1; round <= block * 2; round += 1) {
      const expectedDealer = (round <= block ? 0 : 1) as Seat;
      flow.equal(dealerForRound(round), expectedDealer, `court ${court} dealer round ${round}`);
      flow.equal(guesserForRound(round), (expectedDealer === 0 ? 1 : 0) as Seat, `court ${court} guesser round ${round}`);
    }
  }
  setCurrentCourtIndex(0);
});

check("seat math: passing block=1 restores the classic alternating rotation", () => {
  for (let round = 1; round <= 10; round += 1) {
    const expectedDealer = ((round - 1) % 2) as Seat;
    flow.equal(dealerForRound(round, 1), expectedDealer);
    flow.equal(guesserForRound(round, 1), (expectedDealer === 0 ? 1 : 0) as Seat);
  }
});

check("every court gives both seats an equal share, with exactly one swap", () => {
  for (let court = 0; court < 3; court += 1) {
    const rounds = roundsInCourt(court);
    const block = hidesPerBlock(court);
    setCurrentCourtIndex(court);
    const seats = Array.from({ length: rounds }, (_, i) => dealerForRound(i + 1));
    flow.equal(seats.filter((s) => s === 0).length, block, `court ${court} seat 0`);
    flow.equal(seats.filter((s) => s === 1).length, rounds - block, `court ${court} seat 1`);
    // No alternation: exactly ONE swap across the whole court.
    const swaps = seats.slice(1).filter((s, i) => s !== seats[i]).length;
    flow.equal(swaps, 1, `court ${court} swaps`);
  }
  setCurrentCourtIndex(0);
});

check("blockStartForRound and hidesIntoBlock describe the current block", () => {
  // Explicit block sizes, so the assertions do not depend on the live court.
  flow.equal(blockStartForRound(1, 5), 1);
  flow.equal(blockStartForRound(5, 5), 1);
  flow.equal(blockStartForRound(6, 5), 6);
  flow.equal(blockStartForRound(10, 5), 6);
  flow.equal(hidesIntoBlock(1, 5), 1);
  flow.equal(hidesIntoBlock(5, 5), 5);
  flow.equal(hidesIntoBlock(6, 5), 1);
  flow.equal(hidesIntoBlock(10, 5), 5);
  // A smaller court's block, e.g. court 3 (2 cards -> blocks of 2).
  flow.equal(blockStartForRound(3, 2), 3);
  flow.equal(hidesIntoBlock(3, 2), 1);
  flow.equal(hidesIntoBlock(4, 2), 2);
});

check("only seat 1 is the bot, and only in bot mode", () => {
  flow.equal(isBotSeat(0, "bot"), false);
  flow.equal(isBotSeat(1, "bot"), true);
  flow.equal(isBotSeat(1, "local"), false);
  flow.equal(BOT_SEAT, 1);
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

check("a round win awards the court stake to the winner only", () => {
  flow.deepEqual(applyRoundWin([0, 0], 0, 1), [1, 0]);
  flow.deepEqual(applyRoundWin([3, 2], 1, 2), [3, 4]);
  flow.deepEqual(applyRoundWin([5, 5], 0, 3), [8, 5]);
});

check("only a found King costs a life, and it costs the dealer", () => {
  flow.deepEqual(applyLifeLoss([5, 5], { kind: "king", winner: 1, pick: 2, calledBluff: false }, 0), [4, 5]);
  flow.deepEqual(applyLifeLoss([5, 5], { kind: "king", winner: 0, pick: 2, calledBluff: false }, 1), [5, 4]);
  for (const kind of ["wrong", "timeout", "bluff-caught", "bluff-missed", "bluff-worked"] as const) {
    flow.deepEqual(
      applyLifeLoss([5, 5], { kind, winner: 0, pick: 1, calledBluff: false }, 0),
      [5, 5],
      `${kind} must not cost a life`,
    );
  }
});

check("lives never render below zero", () => {
  flow.deepEqual(applyLifeLoss([1, 5], { kind: "king", winner: 1, pick: 0, calledBluff: false }, 0), [0, 5]);
  flow.deepEqual(applyLifeLoss([0, 5], { kind: "king", winner: 1, pick: 0, calledBluff: false }, 0), [0, 5]);
});

check("the first player out of hearts loses, and the other wins", () => {
  flow.equal(lifeLoser([5, 5]), null);
  flow.equal(lifeLoser([0, 3]), 0);
  flow.equal(lifeLoser([3, 0]), 1);
  flow.equal(lifeWinner([0, 3]), 1);
  flow.equal(lifeWinner([3, 0]), 0);
  flow.equal(lifeWinner([5, 5]), null);
});

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

check("rounds 1..N-1 advance, round N completes the court, per court", () => {
  for (let court = 0; court < 3; court += 1) {
    const last = roundsInCourt(court);
    for (let round = 1; round < last; round += 1) {
      flow.deepEqual(
        afterRound({ round, level: court, livesEnabled: false, hasLifeWinner: false }),
        { action: "next-round", round: round + 1 },
        `court ${court} round ${round}`,
      );
    }
    flow.deepEqual(
      afterRound({ round: last, level: court, livesEnabled: false, hasLifeWinner: false }),
      { action: "court-complete" },
      `court ${court} last round`,
    );
  }
});

check("a decided lives match ends the game before the round boundary is read", () => {
  // Original code returned early on the life winner, so the court's last round
  // plus a winner must still be a match-complete, not a court-complete.
  flow.deepEqual(
    afterRound({ round: 10, level: 0, livesEnabled: true, hasLifeWinner: true }),
    { action: "match-complete" },
  );
  flow.deepEqual(
    afterRound({ round: 3, level: 0, livesEnabled: true, hasLifeWinner: true }),
    { action: "match-complete" },
  );
});

check("a stale life winner is ignored unless lives mode is on", () => {
  flow.deepEqual(
    afterRound({ round: 3, level: 0, livesEnabled: false, hasLifeWinner: true }),
    { action: "next-round", round: 4 },
  );
});

check("courts 0 and 1 advance at round 1 and refresh bluffs", () => {
  flow.deepEqual(afterCourt(0), { action: "next-court", level: 1, round: 1, refreshBluffs: true });
  flow.deepEqual(afterCourt(1), { action: "next-court", level: 2, round: 1, refreshBluffs: true });
});

check("the final court ends the match", () => {
  flow.deepEqual(afterCourt(2), { action: "match-complete" });
  flow.equal(isFinalCourt(2), true);
  flow.equal(isFinalCourt(1), false);
  // Final round of a court is its last round, derived from the shared table.
  for (let court = 0; court < 3; court += 1) {
    const last = roundsInCourt(court);
    flow.equal(isFinalRoundOfCourt(last, court), true, `court ${court} last round`);
    flow.equal(isFinalRoundOfCourt(last - 1, court), false, `court ${court} penultimate round`);
  }
});

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------

check("bot probabilities are unchanged", () => {
  flow.equal(BLUFF_CHANCE, 0.14);
  flow.equal(ACCUSE_CHANCE_VS_BLUFF, 0.55);
  flow.equal(ACCUSE_CHANCE_OTHERWISE, 0.08);
});

check("bot bluff decision matches `available && roll < 0.14`", () => {
  flow.equal(decideBluff(true, 0.13), true);
  flow.equal(decideBluff(true, 0.14), false);
  flow.equal(decideBluff(false, 0.0), false);
});

check("bot hiding spot matches `floor(roll * cards)` clamped to the table", () => {
  flow.deepEqual(decideHidingSpot({ cards: 5, bluffAvailable: true, bluffRoll: 0.99, positionRoll: 0.5 }),
    { isBluff: false, kingIndex: 2 });
  flow.deepEqual(decideHidingSpot({ cards: 5, bluffAvailable: true, bluffRoll: 0.01, positionRoll: 0.5 }),
    { isBluff: true, kingIndex: null });
  // A roll of exactly 1 (paranoia guard) must not index past the last card.
  flow.deepEqual(decideHidingSpot({ cards: 3, bluffAvailable: false, bluffRoll: 1, positionRoll: 1 }),
    { isBluff: false, kingIndex: 2 });
});

check("bot accusation matches the original two-tier probability", () => {
  flow.equal(decideAccusation(true, 0.54), true);
  flow.equal(decideAccusation(true, 0.55), false);
  flow.equal(decideAccusation(false, 0.07), true);
  flow.equal(decideAccusation(false, 0.08), false);
});

check("bot card choice matches `floor(roll * cards)` clamped", () => {
  flow.equal(decideGuess(5, 0), 0);
  flow.equal(decideGuess(5, 0.999), 4);
  flow.equal(decideGuess(2, 0.5), 1);
  flow.equal(decideGuess(2, 1), 1);
});

check("a bot turn is either an accusation or a card, never both", () => {
  const accused = decideGuessTurn({ cards: 5, dealerBluffed: true, accuseRoll: 0.1, pickRoll: 0.5 });
  flow.deepEqual(accused, { accused: true, cardIndex: null });

  const picked = decideGuessTurn({ cards: 5, dealerBluffed: true, accuseRoll: 0.9, pickRoll: 0.5 });
  flow.equal(picked.accused, false);
  flow.equal(picked.cardIndex, 2);
});

// ---------------------------------------------------------------------------
// Round resolution — must mirror the inline if/else chain
// ---------------------------------------------------------------------------

check("resolveLocalRound matches the original chooseCard/callBluff branches", () => {
  // Bluff on the table, guesser picked => bluff-worked, dealer wins.
  flow.deepEqual(
    resolveLocalRound({ isBluff: true, kingIndex: null, pick: 3, calledBluff: false, dealer: 0 }),
    { kind: "bluff-worked", winner: 0, pick: 3, calledBluff: false },
  );
  // King found => guesser wins.
  flow.deepEqual(
    resolveLocalRound({ isBluff: false, kingIndex: 3, pick: 3, calledBluff: false, dealer: 0 }),
    { kind: "king", winner: 1, pick: 3, calledBluff: false },
  );
  // Wrong card => dealer wins.
  flow.deepEqual(
    resolveLocalRound({ isBluff: false, kingIndex: 3, pick: 1, calledBluff: false, dealer: 0 }),
    { kind: "wrong", winner: 0, pick: 1, calledBluff: false },
  );
  // Accusation correct => guesser wins.
  flow.deepEqual(
    resolveLocalRound({ isBluff: true, kingIndex: null, pick: null, calledBluff: true, dealer: 0 }),
    { kind: "bluff-caught", winner: 1, pick: null, calledBluff: true },
  );
  // Accusation wrong => dealer wins.
  flow.deepEqual(
    resolveLocalRound({ isBluff: false, kingIndex: 2, pick: null, calledBluff: true, dealer: 0 }),
    { kind: "bluff-missed", winner: 0, pick: null, calledBluff: true },
  );
  // No pick, no accusation => timeout, dealer wins.
  flow.deepEqual(
    resolveLocalRound({ isBluff: false, kingIndex: 2, pick: null, calledBluff: false, dealer: 0 }),
    { kind: "timeout", winner: 0, pick: null, calledBluff: false },
  );
});

check("resolveLocalRound awards the correct seat whichever chair deals", () => {
  flow.equal(resolveLocalRound({ isBluff: false, kingIndex: 1, pick: 1, calledBluff: false, dealer: 0 }).winner, 1);
  flow.equal(resolveLocalRound({ isBluff: false, kingIndex: 1, pick: 1, calledBluff: false, dealer: 1 }).winner, 0);
  flow.equal(resolveLocalRound({ isBluff: false, kingIndex: 1, pick: 0, calledBluff: false, dealer: 1 }).winner, 1);
});

check("an accusation always outranks the card that was on the table", () => {
  // A correct accusation wins even though a real King was hidden elsewhere.
  flow.equal(resolveLocalRound({ isBluff: true, kingIndex: null, pick: 4, calledBluff: true, dealer: 0 }).kind, "bluff-caught");
});

// ---------------------------------------------------------------------------
// Strategy analytics
// ---------------------------------------------------------------------------

function entry(over: Partial<RoundHistoryEntry>): RoundHistoryEntry {
  return {
    level: 0, round: 1, dealer: 0, guesser: 1, pick: 1,
    calledBluff: false, wasBluff: false, won: false,
    ...over,
  };
}

check("only this court's picked rounds are counted for a seat", () => {
  const history = [
    entry({ level: 0, guesser: 1, pick: 2 }),
    entry({ level: 1, guesser: 1, pick: 3 }),
    entry({ level: 0, guesser: 0, pick: 1 }),
    entry({ level: 0, guesser: 1, pick: null }), // accusation/timeout: excluded
  ];
  const picked = picksThisCourt(history, 0, 1);
  flow.equal(picked.length, 1);
  flow.equal(picked[0].pick, 2);
});

check("pick frequency counts cards, finds the favourite and totals picks", () => {
  const picked = [
    entry({ round: 1, pick: 3 }),
    entry({ round: 2, pick: 3 }),
    entry({ round: 3, pick: 1 }),
  ];
  const summary = summarisePicks(picked, 5);
  flow.deepEqual(summary.counts, [1, 0, 2, 0, 0]);
  flow.equal(summary.highest, 2);
  flow.equal(summary.favourite, 3);
  flow.equal(summary.total, 3);
});

check("an out-of-range pick can never corrupt the frequency table", () => {
  const summary = summarisePicks([entry({ pick: 99 })], 5);
  flow.deepEqual(summary.counts, [0, 0, 0, 0, 0]);
  flow.equal(summary.favourite, null);
});

check("no data yields an empty summary rather than a false favourite", () => {
  const summary = summarisePicks([], 5);
  flow.equal(summary.highest, 0);
  flow.equal(summary.favourite, null);
  flow.equal(summary.total, 0);
});

check("pattern captions match the original centre/left/right rule", () => {
  flow.equal(describePattern(3, 5), "CENTER-FOCUSED");
  flow.equal(describePattern(2, 5), "LEFT-LEANING");
  flow.equal(describePattern(1, 5), "LEFT-LEANING");
  flow.equal(describePattern(5, 5), "RIGHT-LEANING");
  flow.equal(describePattern(4, 3), "RIGHT-LEANING");
  flow.equal(describePattern(2, 3), "CENTER-FOCUSED");
  flow.equal(describePattern(null, 5), "");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
