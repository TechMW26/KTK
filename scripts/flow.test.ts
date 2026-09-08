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
  dealerForHidingRound,
  guesserForHidingRound,
  dealerSequence,
  hidesDealtBy,
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

check("complete deals blocks of 10 (0x10 then 1x10)", () => {
  const d = dealerSequence("complete");
  flow.deepEqual(
    d.slice(0, DEALS_PER_SEAT),
    Array.from({ length: DEALS_PER_SEAT }, () => 0 as const),
  );
  flow.deepEqual(
    d.slice(DEALS_PER_SEAT, DEALS_PER_SEAT * 2),
    Array.from({ length: DEALS_PER_SEAT }, () => 1 as const),
  );
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

check("courtForHidingRound buckets 1..7 ->0, 8..14 ->1, 15..20 ->2", () => {
  flow.equal(courtForHidingRound(1), 0);
  flow.equal(courtForHidingRound(7), 0);
  flow.equal(courtForHidingRound(8), 1);
  flow.equal(courtForHidingRound(14), 1);
  flow.equal(courtForHidingRound(15), 2);
  flow.equal(courtForHidingRound(20), 2);
});

check("complete dealer block boundary round 11 => seat1", () => {
  flow.equal(dealerForHidingRound(11, "complete"), 1);
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
check("complete hidesDealtBy seat0 before round11 = 10", () => {
  flow.equal(hidesDealtBy(0, 11, "complete"), 10);
});
check("complete hidesDealtBy seat1 before round11 = 0", () => {
  flow.equal(hidesDealtBy(1, 11, "complete"), 0);
});
check("complete hidesDealtBy seat1 before round12 = 1 (dealt round 11)", () => {
  flow.equal(hidesDealtBy(1, 12, "complete"), 1);
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
// (whole file is covered by the /* eslint-disable no-console */ at the top)
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
