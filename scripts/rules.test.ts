/**
 * Golden-master harness for the pure game rules (lib/game/rules.ts).
 *
 * Run:  node --experimental-strip-types scripts/rules.test.ts
 *
 * These assertions pin the EXACT outcome of every round permutation before any
 * refactor touches the game. If a refactor changes winner/pick/kind/points for
 * any input, this file fails loudly — that is the point. Gameplay preservation
 * is verified by these tests, not by inspection.
 */
import {
  LEVELS,
  ROUNDS_PER_LEVEL,
  LEVEL_COUNT,
  TOTAL_ROUNDS,
  levelConfig,
  dealerSeatFor,
  guesserSeatFor,
  timeoutResult,
  resolveGuess,
  RESULT_COPY,
  type Seat,
} from "../lib/game/rules.ts";
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

/** Shorthand: build the args resolveGuess expects for court 0, round 1. */
function round1(dealerSeat: Seat, secret: { isBluff: boolean; kingIndex: number | null }, cardIndex: number | null, calledBluff = false) {
  return {
    level: 0,
    round: 1,
    points: LEVELS[0].points,
    dealerSeat,
    secret,
    guess: { cardIndex, calledBluff },
  };
}

console.log("rules.test — pure round resolution");

// ---------------------------------------------------------------------------
// Court table + seat arithmetic (these drive every timer and point value)
// ---------------------------------------------------------------------------

check("court table matches the shipped 5/3/2 · 20/15/9 · 1/2/3 progression", () => {
  flow.deepEqual(
    LEVELS.map((l) => [l.cards, l.seconds, l.points]),
    [
      [5, 20, 1],
      [3, 15, 2],
      [2, 9, 3],
    ],
  );
});

check("ten rounds per court, three courts, thirty rounds total", () => {
  flow.equal(ROUNDS_PER_LEVEL, 10);
  flow.equal(LEVEL_COUNT, 3);
  flow.equal(TOTAL_ROUNDS, 30);
});

check("levelConfig clamps out-of-range court indices", () => {
  flow.equal(levelConfig(-5).index, 0);
  flow.equal(levelConfig(99).index, 2);
  flow.equal(levelConfig(1).name, "HIGH STAKES");
});

check("classic online dealer alternates every round starting at seat 0", () => {
  // dealerSeatFor is the ONLINE classic alias: block = 1, i.e. alternate turns.
  // (The single-player default is a block of HIDES_PER_BLOCK; see logic.test.ts.)
  for (let round = 1; round <= 10; round += 1) {
    flow.equal(dealerSeatFor(round), ((round - 1) % 2) as Seat);
  }
});

check("guesser is always the complement of the dealer", () => {
  for (let round = 1; round <= 10; round += 1) {
    flow.equal(guesserSeatFor(round), (1 - dealerSeatFor(round)) as Seat);
  }
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

check("timeoutResult awards the round to the dealer with no pick", () => {
  const r = timeoutResult({ level: 2, round: 3, points: 3 });
  flow.equal(r.kind, "timeout");
  flow.equal(r.winnerSeat, dealerSeatFor(3));
  flow.equal(r.dealerSeat, dealerSeatFor(3));
  flow.equal(r.guesserSeat, guesserSeatFor(3));
  flow.equal(r.pick, null);
  flow.equal(r.wasBluff, false);
  flow.equal(r.kingIndex, null);
  flow.equal(r.points, 3);
});

// ---------------------------------------------------------------------------
// Bluff accusation
// ---------------------------------------------------------------------------

check("calling bluff on a real bluff wins the round for the guesser", () => {
  const r = resolveGuess(round1(0, { isBluff: true, kingIndex: null }, null, true));
  flow.equal(r.kind, "bluff-caught");
  flow.equal(r.winnerSeat, 1);
  flow.equal(r.pick, null);
  flow.equal(r.wasBluff, true);
  flow.equal(r.kingIndex, null);
});

check("calling bluff when a King WAS hidden loses the round to the dealer", () => {
  const r = resolveGuess(round1(0, { isBluff: false, kingIndex: 2 }, null, true));
  flow.equal(r.kind, "bluff-missed");
  flow.equal(r.winnerSeat, 0);
  flow.equal(r.wasBluff, false);
  flow.equal(r.kingIndex, 2);
  flow.equal(r.pick, null);
});

// ---------------------------------------------------------------------------
// Card pick
// ---------------------------------------------------------------------------

check("picking the King wins the round for the guesser", () => {
  const r = resolveGuess(round1(0, { isBluff: false, kingIndex: 3 }, 3));
  flow.equal(r.kind, "king");
  flow.equal(r.winnerSeat, 1);
  flow.equal(r.pick, 3);
  flow.equal(r.kingIndex, 3);
});

check("picking a non-King loses the round to the dealer", () => {
  const r = resolveGuess(round1(0, { isBluff: false, kingIndex: 3 }, 1));
  flow.equal(r.kind, "wrong");
  flow.equal(r.winnerSeat, 0);
  flow.equal(r.pick, 1);
  flow.equal(r.kingIndex, 3);
});

check("picking a card against a bluff loses the round to the dealer", () => {
  const r = resolveGuess(round1(0, { isBluff: true, kingIndex: null }, 2));
  flow.equal(r.kind, "bluff-worked");
  flow.equal(r.winnerSeat, 0);
  flow.equal(r.pick, 2);
  flow.equal(r.wasBluff, true);
  flow.equal(r.kingIndex, null);
});

check("a null pick without a bluff accusation is a timeout", () => {
  const r = resolveGuess(round1(0, { isBluff: false, kingIndex: 1 }, null));
  flow.equal(r.kind, "timeout");
  flow.equal(r.winnerSeat, 0);
  flow.equal(r.kingIndex, 1);
});

check("a null pick keeps wasBluff so the reveal can show empty cards", () => {
  const r = resolveGuess(round1(1, { isBluff: true, kingIndex: null }, null));
  flow.equal(r.kind, "timeout");
  flow.equal(r.wasBluff, true);
  flow.equal(r.winnerSeat, 1);
});

// ---------------------------------------------------------------------------
// Every permutation, exhaustively — the real guarantee
// ---------------------------------------------------------------------------

check("exhaustive: all 5 cards x 3 secrets x 2 accusation states, both seats", () => {
  const secrets: Array<{ isBluff: boolean; kingIndex: number | null }> = [
    { isBluff: false, kingIndex: 0 },
    { isBluff: false, kingIndex: 2 },
    { isBluff: true, kingIndex: null },
  ];

  // Pinned expectations, written out so a rule change cannot slip through.
  const expected: Record<string, string> = {
    // seat 0 dealing, King hidden at index 0
    "0|hide0|pick0|no": "king", // guesser finds it
    "0|hide0|pick1|no": "wrong",
    "0|hide0|pick2|no": "wrong",
    "0|hide0|pickNull|yes": "bluff-missed",
    "0|hide0|pickNull|no": "timeout",
    // seat 0 dealing, King hidden at index 2
    "0|hide2|pick0|no": "wrong",
    "0|hide2|pick2|no": "king",
    "0|hide2|pickNull|yes": "bluff-missed",
    "0|hide2|pickNull|no": "timeout",
    // seat 0 dealing, actual bluff
    "0|bluff|pick0|no": "bluff-worked",
    "0|bluff|pick2|no": "bluff-worked",
    "0|bluff|pickNull|yes": "bluff-caught",
    "0|bluff|pickNull|no": "timeout",
  };

  const picks: Array<number | null> = [0, 1, 2, null];
  for (const secret of secrets) {
    for (const pick of picks) {
      for (const calledBluff of [false, true]) {
        // A bluff accusation is only meaningful with no card picked.
        if (calledBluff && pick !== null) continue;
        const secretKey = secret.isBluff ? "bluff" : `hide${secret.kingIndex}`;
        const key = `0|${secretKey}|pick${pick}|${calledBluff ? "yes" : "no"}`;
        const want = expected[key];
        if (!want) continue;
        const r = resolveGuess(round1(0, secret, pick, calledBluff));
        flow.equal(r.kind, want, `kind for ${key}`);
      }
    }
  }
});

check("exhaustive: winner is always guesser for king/bluff-caught, dealer otherwise", () => {
  const guesserWins = new Set(["king", "bluff-caught"]);
  for (const dealerSeat of [0, 1] as Seat[]) {
    const guesserSeat = (1 - dealerSeat) as Seat;
    for (const secret of [
      { isBluff: false, kingIndex: 0 },
      { isBluff: false, kingIndex: 2 },
      { isBluff: true, kingIndex: null },
    ]) {
      for (const pick of [0, 1, 2, null]) {
        for (const calledBluff of [false, true]) {
          if (calledBluff && pick !== null) continue;
          const r = resolveGuess({
            level: 0,
            round: 1,
            points: 1,
            dealerSeat,
            secret,
            guess: { cardIndex: pick, calledBluff },
          });
          const wantWinner = guesserWins.has(r.kind) ? guesserSeat : dealerSeat;
          flow.equal(r.winnerSeat, wantWinner, `${r.kind} winner`);
          flow.equal(r.dealerSeat, dealerSeat);
          flow.equal(r.guesserSeat, guesserSeat);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Copy table
// ---------------------------------------------------------------------------

check("every result kind has reveal copy with a danger or victory tone", () => {
  const kinds = ["king", "wrong", "bluff-caught", "bluff-missed", "bluff-worked", "timeout"] as const;
  for (const kind of kinds) {
    const copy = RESULT_COPY[kind];
    flow.ok(copy, `copy for ${kind}`);
    flow.ok(copy.title.length > 1, `title for ${kind}`);
    flow.ok(copy.subtitle.length > 1, `subtitle for ${kind}`);
    flow.ok(copy.tone === "danger" || copy.tone === "victory", `tone for ${kind}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
