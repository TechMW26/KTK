/**
 * Node harness for the pure optional-rules engine (lib/game/flow.ts).
 *
 * Run:  node --experimental-strip-types scripts/flow.test.ts
 * (Node 22.13+/24 with type stripping — verifies the dealer/lives/verdict math
 *  without needing a Firebase connection or a bundler.)
 */
import {
  RULESET_ROUNDS,
  DEALS_PER_SEAT,
  ROUNDS_PER_COURT,
  HIDES_PER_BLOCK,
  COURT_COUNT,
  dealerForHidingRound,
  guesserForHidingRound,
  dealerSequence,
  hidesDealtBy,
  roundInCourt,
  strategyEntryFor,
  applyLivesChange,
  livesVerdict,
  simulateMatch,
  courtForHidingRound,
  type TurnOrder,
} from "../lib/game/flow.ts";
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

console.log("flow.test — optional rules engine");

check("alternate deals alternate 0,1,0,1...", () => {
  const d = dealerSequence("alternate");
  for (let i = 0; i < d.length; i += 1) flow.equal(d[i], i % 2);
});

check("complete hides a 5-round block per seat in every court", () => {
  const d = dealerSequence("complete");
  // Each court: seat0 takes rounds 1..5, seat1 takes 6..10. The counter restarts
  // every court, so the SAME shape repeats COURT_COUNT times.
  const perCourt = [
    ...Array.from({ length: HIDES_PER_BLOCK }, () => 0 as const),
    ...Array.from({ length: HIDES_PER_BLOCK }, () => 1 as const),
  ];
  flow.equal(d.length, RULESET_ROUNDS);
  for (let c = 0; c < COURT_COUNT; c += 1) {
    flow.deepEqual(d.slice(c * ROUNDS_PER_COURT, (c + 1) * ROUNDS_PER_COURT), perCourt);
  }
  // Each seat deals exactly one block per court across the whole match.
  flow.equal(DEALS_PER_SEAT, HIDES_PER_BLOCK * COURT_COUNT);
});

check("complete: player 2's turn arrives in the SAME court (round 6)", () => {
  flow.equal(dealerForHidingRound(6, "complete"), 1);
  flow.equal(dealerForHidingRound(5, "complete"), 0);
});

check("alternate guesser is complement of dealer", () => {
  for (const order of ["alternate", "complete"] as TurnOrder[]) {
    for (let r = 1; r <= RULESET_ROUNDS; r += 1) {
      flow.equal(
        guesserForHidingRound(r, order),
        (1 - dealerForHidingRound(r, order)) as 0 | 1,
      );
    }
  }
});

check("courtForHidingRound buckets 1..10 ->0, 11..20 ->1, 21..30 ->2", () => {
  flow.equal(courtForHidingRound(1), 0);
  flow.equal(courtForHidingRound(10), 0);
  flow.equal(courtForHidingRound(11), 1);
  flow.equal(courtForHidingRound(20), 1);
  flow.equal(courtForHidingRound(21), 2);
  flow.equal(courtForHidingRound(30), 2);
});

check("roundInCourt restarts at 1 every court", () => {
  flow.equal(roundInCourt(1), 1);
  flow.equal(roundInCourt(10), 10);
  flow.equal(roundInCourt(11), 1);
  flow.equal(roundInCourt(21), 1);
});

check("complete dealer block boundary round 11 => seat0 (new court)", () => {
  flow.equal(dealerForHidingRound(11, "complete"), 0);
  flow.equal(roundInCourt(11), 1);
});
check("complete dealer block boundary round 1 => seat0", () => {
  flow.equal(dealerForHidingRound(1, "complete"), 0);
});

check("alternate hidesDealtBy count for seat0 before round 5 = 2", () => {
  // rounds 1,3 already dealt by seat0 before round5 -> 2
  flow.equal(hidesDealtBy(0, 5, "alternate"), 2);
});
check("alternate hidesDealtBy seat1 before round5 = 2 (rounds 2,4)", () => {
  flow.equal(hidesDealtBy(1, 5, "alternate"), 2);
});
check("alternate hidesDealtBy seat1 before round2 = 0", () => {
  flow.equal(hidesDealtBy(1, 2, "alternate"), 0);
});
check("complete hidesDealtBy seat0 before round6 = 5 (its whole block)", () => {
  flow.equal(hidesDealtBy(0, 6, "complete"), 5);
});
check("complete hidesDealtBy seat1 before round6 = 0", () => {
  flow.equal(hidesDealtBy(1, 6, "complete"), 0);
});
check("complete hidesDealtBy seat1 before round7 = 1 (dealt round 6)", () => {
  flow.equal(hidesDealtBy(1, 7, "complete"), 1);
});
check("complete hidesDealtBy accumulates across courts", () => {
  // After court 0 (10 rounds) each seat has dealt one 5-round block.
  flow.equal(hidesDealtBy(0, 11, "complete"), 5);
  flow.equal(hidesDealtBy(1, 11, "complete"), 5);
});

check("finding a king costs its dealer a life", () => {
  flow.deepEqual(applyLivesChange([5, 5], { kind: "king", dealer: 0 }), [4, 5]);
  flow.deepEqual(applyLivesChange([5, 5], { kind: "king", dealer: 1 }), [5, 4]);
});
check("wrong/bluff/timeout do NOT cost a life", () => {
  for (const kind of ["wrong", "timeout", "bluff-caught", "bluff-missed", "bluff-worked"] as const) {
    flow.deepEqual(applyLivesChange([5, 5], { kind, dealer: 0 }), [5, 5]);
  }
});
check("life never goes below zero", () => {
  flow.deepEqual(applyLivesChange([1, 5], { kind: "king", dealer: 0 }), [0, 5]);
});

check("livesVerdict: 0 lives -> decided immediately", () => {
  flow.deepEqual(livesVerdict([0, 3], 5), { over: true, loser: 0, winner: 1 });
});
check("livesVerdict: some lives and rounds left -> not over", () => {
  flow.deepEqual(livesVerdict([4, 5], 3), { over: false, loser: null, winner: null });
});
check("livesVerdict: rounds done, more lives wins", () => {
  flow.deepEqual(livesVerdict([3, 5], 0), { over: true, loser: 0, winner: 1 });
});
check("livesVerdict: rounds done, equal lives -> draw", () => {
  flow.deepEqual(livesVerdict([4, 4], 0), { over: false, loser: null, winner: null });
});

check("simulateMatch: seat0 loses after 5 kings found while seat0 is the dealer", () => {
  // In alternate mode seat0 deals hiding rounds 1,3,5,7,9 (0-based indices 0,2,4,6,8).
  // A resolved 'king' outcome means the GUESSER found the DEALER's hidden King, so
  // the dealer of that round loses a life.
  const kinds: Array<"king" | "wrong"> = Array.from({ length: RULESET_ROUNDS }, () => "wrong");
  kinds[0] = "king"; // hiding round 1  -> seat0 dealer loses 1
  kinds[2] = "king"; // hiding round 3  -> seat0 dealer loses 1
  kinds[4] = "king"; // hiding round 5  -> seat0 dealer loses 1
  kinds[6] = "king"; // hiding round 7  -> seat0 dealer loses 1
  kinds[8] = "king"; // hiding round 9  -> seat0 dealer loses 1  (now seat0 at 0)
  const res = simulateMatch(kinds);
  flow.equal(res.verdict.over, true);
  flow.equal(res.verdict.loser, 0);
  flow.equal(res.verdict.winner, 1);
  flow.equal(res.lives[0], 0);
});

// A fully clean run (no kings found) must not end early
check("no kings found -> match runs full length, draw at end", () => {
  const kinds = Array.from({ length: RULESET_ROUNDS }, () => "wrong" as const);
  const res = simulateMatch(kinds);
  flow.equal(res.hidingRoundsPlayed, RULESET_ROUNDS);
  flow.equal(res.verdict.over, false);
});

// ---------------------------------------------------------------------------
// Strategy-panel history rows
// ---------------------------------------------------------------------------

check("strategyEntryFor maps the global round to court-relative for optional", () => {
  const row = strategyEntryFor(
    {
      round: 12, // second court (rounds 11..20), 2nd round inside it
      level: 99, // ignored in optional mode
      dealerSeat: 0,
      guesserSeat: 1,
      pick: 2, // 0-based -> card 3
      wasBluff: false,
      winnerSeat: 1,
    },
    false,
    false,
  );
  flow.equal(row.level, 1);
  flow.equal(row.round, 2);
  flow.equal(row.pick, 3);
  flow.equal(row.won, true);
  flow.equal(row.calledBluff, false);
});

check("strategyEntryFor passes classic level/round through untouched", () => {
  const row = strategyEntryFor(
    {
      round: 7,
      level: 2,
      dealerSeat: 1,
      guesserSeat: 0,
      pick: 0,
      wasBluff: true,
      winnerSeat: 1,
    },
    true,
    true,
  );
  flow.equal(row.level, 2);
  flow.equal(row.round, 7);
  flow.equal(row.pick, 1);
  flow.equal(row.calledBluff, true);
  flow.equal(row.wasBluff, true);
  flow.equal(row.won, false); // dealer seat 1 won, guesser was seat 0
});

check("strategyEntryFor keeps a no-pick round out of the pick chart", () => {
  const row = strategyEntryFor(
    {
      round: 1,
      level: 0,
      dealerSeat: 0,
      guesserSeat: 1,
      pick: null,
      wasBluff: false,
      winnerSeat: 0,
    },
    true,
    false,
  );
  flow.equal(row.pick, null);
  flow.equal(row.calledBluff, true);
});

// ---------------------------------------------------------------------------
// (whole file is covered by the /* eslint-disable no-console */ at the top)
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
