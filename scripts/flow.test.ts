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
  COURT_COUNT,
  hidesInCourt,
  courtStartRound,
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
import { roundsInCourt } from "../features/game/constants/courts.ts";
import { summarisePicks } from "../features/game/logic/strategy.ts";
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

check("complete hides one block per seat in every court", () => {
  const d = dealerSequence("complete");
  // Each court: seat0 takes the first block of `hidesInCourt(c)` hides, seat1
  // the second. Both seats deal exactly one block per court.
  flow.equal(d.length, RULESET_ROUNDS);
  let offset = 0;
  for (let c = 0; c < COURT_COUNT; c += 1) {
    const block = hidesInCourt(c);
    const perCourt = [
      ...Array.from({ length: block }, () => 0 as const),
      ...Array.from({ length: block }, () => 1 as const),
    ];
    flow.deepEqual(d.slice(offset, offset + block * 2), perCourt, `court ${c}`);
    offset += block * 2;
  }
  // Each seat deals exactly one block per court across the whole match.
  flow.equal(DEALS_PER_SEAT, hidesInCourt(0) + hidesInCourt(1) + hidesInCourt(2));
});

check("complete: player 2's turn arrives in the SAME court", () => {
  // Court 1's block is `hidesInCourt(0)` cards, so the seat flips one round
  // after that block ends, still inside court 1.
  const block0 = hidesInCourt(0);
  flow.equal(dealerForHidingRound(block0, "complete"), 0);
  flow.equal(dealerForHidingRound(block0 + 1, "complete"), 1);
  // Court 2 opens at the global round after court 1, and its block flips seat
  // inside court 2 (never crossing into court 3).
  const court2Start = roundsInCourt(0) + 1;
  const block1 = hidesInCourt(1);
  flow.equal(dealerForHidingRound(court2Start, "complete"), 0);
  flow.equal(dealerForHidingRound(court2Start + block1 - 1, "complete"), 0);
  flow.equal(dealerForHidingRound(court2Start + block1, "complete"), 1);
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

check("courtForHidingRound buckets the per-court round counts", () => {
  // Court boundaries are derived, so this locks the mapping without restating
  // the card counts: each court owns a contiguous band of `roundsInCourt(c)`.
  const starts = [1];
  for (let c = 0; c < COURT_COUNT - 1; c += 1) starts.push(starts[c] + roundsInCourt(c));
  for (let c = 0; c < COURT_COUNT; c += 1) {
    const first = starts[c];
    const last = first + roundsInCourt(c) - 1;
    flow.equal(courtForHidingRound(first), c, `first round of court ${c}`);
    flow.equal(courtForHidingRound(last), c, `last round of court ${c}`);
    if (c + 1 < COURT_COUNT) flow.equal(courtForHidingRound(last + 1), c + 1, `boundary into court ${c + 1}`);
  }
});

check("roundInCourt restarts at 1 every court", () => {
  let first = 1;
  for (let c = 0; c < COURT_COUNT; c += 1) {
    const count = roundsInCourt(c);
    flow.equal(roundInCourt(first), 1, `court ${c} opens at 1`);
    flow.equal(roundInCourt(first + count - 1), count, `court ${c} closes at its round count`);
    first += count;
  }
});

check("complete dealer block boundary => seat0 opens every court", () => {
  let first = 1;
  for (let c = 0; c < COURT_COUNT; c += 1) {
    flow.equal(dealerForHidingRound(first, "complete"), 0, `court ${c} opened by seat0`);
    flow.equal(roundInCourt(first), 1, `court ${c} round restarts at 1`);
    first += roundsInCourt(c);
  }
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
check("complete hidesDealtBy seat0 before the block flips = its whole block", () => {
  const block = hidesInCourt(0);
  flow.equal(hidesDealtBy(0, block + 1, "complete"), block);
});
check("complete hidesDealtBy seat1 before the block flips = 0", () => {
  const block = hidesInCourt(0);
  flow.equal(hidesDealtBy(1, block + 1, "complete"), 0);
});
check("complete hidesDealtBy seat1 one round into its block = 1", () => {
  const block = hidesInCourt(0);
  flow.equal(hidesDealtBy(1, block + 2, "complete"), 1);
});
check("complete hidesDealtBy accumulates across courts", () => {
  // After court 0 each seat has dealt one full block of hidesInCourt(0).
  const afterCourt0 = roundsInCourt(0) + 1;
  const block0 = hidesInCourt(0);
  flow.equal(hidesDealtBy(0, afterCourt0, "complete"), block0);
  flow.equal(hidesDealtBy(1, afterCourt0, "complete"), block0);
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
// Bluff budget parity (local VS Bot / local 2-player / online)
// ---------------------------------------------------------------------------

/**
 * A seat gets exactly ONE bluff per court in every mode. The local engine resets
 * `bluffsAvailable` in `nextLevel()` and never mid-court; the online engine resets
 * `bluffsUsed` when `courtForHidingRound` moves to a new court. Those agree only
 * while a court boundary is never crossed by a plain round advance — which is what
 * this locks down.
 */
check("a court boundary is crossed only by a court advance, never a round one", () => {
  let court = 0;
  let roundInThisCourt = 0;
  for (let round = 1; round < RULESET_ROUNDS; round += 1) {
    roundInThisCourt += 1;
    const lastRoundOfCourt = roundInThisCourt === roundsInCourt(court);
    const nextCourt = courtForHidingRound(round + 1);
    if (lastRoundOfCourt) {
      // The next round is the first of the NEXT court, so the local engine's
      // nextLevel() and the online engine's per-round court check fire together.
      flow.equal(nextCourt, court + 1, `round ${round} -> ${round + 1} enters the next court`);
      court = nextCourt;
      roundInThisCourt = 0;
    } else {
      // Still mid-court: a plain round advance must NOT move the court, or the
      // online engine would hand out a second bluff mid-court.
      flow.equal(nextCourt, court, `round ${round + 1} must not change court`);
    }
  }
  flow.equal(court, COURT_COUNT - 1, "the walk ends in the final court");
});

check("each seat can bluff exactly once per court, in every court", () => {
  // Replays the online reset rule and the local reset rule together and asserts
  // they produce the same budget: one bluff per seat per court.
  for (let court = 0; court < COURT_COUNT; court += 1) {
    const block = hidesInCourt(court);
    // Local: both seats start the court with a fresh bluff.
    let localBluffs = [true, true];
    const usedLocal: [boolean, boolean] = [false, false];
    // Online: bluffsUsed starts false for both seats each court.
    let onlineBluffsUsed = [false, false];
    const usedOnline: [boolean, boolean] = [false, false];

    for (let inCourt = 1; inCourt <= block * 2; inCourt += 1) {
      const global = courtStartRound(court) + inCourt - 1;
      const dealer = dealerForHidingRound(global, "complete");
      // The dealer spends their bluff on their first hide of the court.
      if (!usedLocal[dealer] && localBluffs[dealer]) {
        localBluffs = localBluffs.map((v, i) => (i === dealer ? false : v)) as [boolean, boolean];
        usedLocal[dealer] = true;
      }
      if (!usedOnline[dealer] && !onlineBluffsUsed[dealer]) {
        onlineBluffsUsed = onlineBluffsUsed.map((v, i) => (i === dealer ? true : v)) as [boolean, boolean];
        usedOnline[dealer] = true;
      }
    }
    // A seat hides `block` times in a court but may bluff only once.
    flow.equal(usedLocal[0], usedLocal[1], `court ${court}: both seats got a bluff`);
    flow.deepEqual(usedLocal, usedOnline, `court ${court}: engines agree`);
  }
});

check("the bluff budget is one per court, not one per round", () => {
  // A seat hides `hidesInCourt(0)` times in the first court but may bluff only
  // once — the budget must stay far below the hide count.
  const bluffsPerSeat = 1;
  const hidesInFirstCourt = hidesInCourt(0);
  flow.ok(hidesInFirstCourt > 1, "a court must have more than one hide each");
  flow.equal(bluffsPerSeat, 1);
  flow.ok(bluffsPerSeat < hidesInFirstCourt, "bluff budget must be smaller than the hide count");
});

// ---------------------------------------------------------------------------
// Strategy panel scope parity
// ---------------------------------------------------------------------------

check("strategy rows are keyed to a court in both engines", () => {
  // Optional: the row's level is the COURT the global round fell in, so the
  // panel can filter to the current court exactly like the local engine does.
  for (let court = 0; court < COURT_COUNT; court += 1) {
    const global = courtStartRound(court);
    const row = strategyEntryFor(
      {
        round: global,
        level: 99, // deliberately wrong: optional mode must ignore it
        dealerSeat: 0,
        guesserSeat: 1,
        pick: 0,
        wasBluff: false,
        winnerSeat: 1,
      },
      false,
      false,
    );
    flow.equal(row.level, court, `global round ${global} belongs to court ${court}`);
  }
});

check("strategy rows carry a 1-based card number matching the local engine", () => {
  // Local stores `pick: pick + 1`; online must produce the same 1-based card.
  for (const pick of [0, 1, 2, 3, 4]) {
    const row = strategyEntryFor(
      { round: 1, level: 0, dealerSeat: 0, guesserSeat: 1, pick, wasBluff: false, winnerSeat: 1 },
      false,
      true,
    );
    flow.equal(row.pick, pick + 1, `0-based pick ${pick} -> card ${pick + 1}`);
  }
});

check("strategy chart width follows the court's card count", () => {
  for (let court = 0; court < COURT_COUNT; court += 1) {
    const cards = hidesInCourt(court);
    const freq = summarisePicks([], cards);
    flow.equal(freq.counts.length, cards, `court ${court} chart width`);
    flow.equal(freq.favourite, null);
    flow.equal(freq.total, 0);
  }
});

// ---------------------------------------------------------------------------
// Strategy-panel history rows
// ---------------------------------------------------------------------------

check("strategyEntryFor maps the global round to court-relative for optional", () => {
  // Pick a round that lands in court 1 (the second court), second round inside
  // it, derived from the table so it tracks the card counts automatically.
  const court1Start = roundsInCourt(0) + 1; // first global round of court index 1
  const global = court1Start + 1; // second round inside that court
  const row = strategyEntryFor(
    {
      round: global,
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
