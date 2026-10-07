/**
 * Golden-master harness for single-player match progression.
 *
 * Run:  node --experimental-strip-types scripts/progression.test.ts
 *
 * Pins the round -> court -> match advancement rules that the game has always
 * shipped, so a structural refactor cannot silently reorder the flow.
 *
 * Shipped rules (source of truth: app/page.tsx):
 *   nextRound() : life-decided  -> "match-end"
 *                 round === 10  -> "level-end"
 *                 otherwise     -> round + 1, phase "dealer"
 *   nextLevel() : last court    -> "match-end"
 *                 otherwise     -> court + 1, round 1, bluffs refreshed,
 *                                  phase "dealer"
 */
import { LEVELS, LEVEL_COUNT, roundsPerLevel } from "../lib/game/rules.ts";
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

type Phase = "dealer" | "level-end" | "match-end";

/** The shipped nextRound() decision, isolated from React state. */
function nextRoundTarget(opts: {
  round: number;
  level: number;
  livesMode: boolean;
  lifeWinner: 0 | 1 | null;
}): { phase: Phase; round: number } {
  if (opts.livesMode && opts.lifeWinner !== null) return { phase: "match-end", round: opts.round };
  if (opts.round === roundsPerLevel(opts.level)) return { phase: "level-end", round: opts.round };
  return { phase: "dealer", round: opts.round + 1 };
}

/** The shipped nextLevel() decision, isolated from React state. */
function nextLevelTarget(opts: { level: number }): {
  phase: Phase;
  level: number;
  round: number;
  bluffsReset: boolean;
} {
  if (opts.level === LEVEL_COUNT - 1) {
    return { phase: "match-end", level: opts.level, round: 1, bluffsReset: false };
  }
  return { phase: "dealer", level: opts.level + 1, round: 1, bluffsReset: true };
}

console.log("progression.test — round and court advancement");

// ---------------------------------------------------------------------------
// nextRound
// ---------------------------------------------------------------------------

check("every round but the court's last advances to the dealer phase", () => {
  for (let level = 0; level < LEVEL_COUNT; level += 1) {
    for (let round = 1; round < roundsPerLevel(level); round += 1) {
      const t = nextRoundTarget({ round, level, livesMode: false, lifeWinner: null });
      flow.equal(t.phase, "dealer", `court ${level} round ${round}`);
      flow.equal(t.round, round + 1, `court ${level} round ${round}`);
    }
  }
});

check("each court's last round ends the court instead of advancing", () => {
  for (let level = 0; level < LEVEL_COUNT; level += 1) {
    const last = roundsPerLevel(level);
    const t = nextRoundTarget({ round: last, level, livesMode: false, lifeWinner: null });
    flow.equal(t.phase, "level-end", `court ${level}`);
    flow.equal(t.round, last, `court ${level}`);
  }
});

check("a decided lives match jumps straight to the final result", () => {
  const t = nextRoundTarget({ round: 3, level: 0, livesMode: true, lifeWinner: 1 });
  flow.equal(t.phase, "match-end");
});

check("lives mode with no loser yet still follows the normal round flow", () => {
  const t = nextRoundTarget({ round: 3, level: 0, livesMode: true, lifeWinner: null });
  flow.equal(t.phase, "dealer");
  flow.equal(t.round, 4);
});

check("a life winner is ignored when lives mode is off", () => {
  // Guards the classic score path against a stale lifeWinner value.
  const t = nextRoundTarget({ round: 3, level: 0, livesMode: false, lifeWinner: 1 });
  flow.equal(t.phase, "dealer");
  flow.equal(t.round, 4);
});

check("lives mode takes priority over the court's last-round boundary", () => {
  const t = nextRoundTarget({ round: 10, level: 0, livesMode: true, lifeWinner: 0 });
  flow.equal(t.phase, "match-end");
});

// ---------------------------------------------------------------------------
// nextLevel
// ---------------------------------------------------------------------------

check("court 0 and 1 advance to the next court at round 1", () => {
  for (const level of [0, 1]) {
    const t = nextLevelTarget({ level });
    flow.equal(t.phase, "dealer", `court ${level}`);
    flow.equal(t.level, level + 1);
    flow.equal(t.round, 1);
  }
});

check("advancing a court refreshes both players' bluffs", () => {
  flow.equal(nextLevelTarget({ level: 1 }).bluffsReset, true);
});

check("the final court ends the match", () => {
  const t = nextLevelTarget({ level: LEVEL_COUNT - 1 });
  flow.equal(t.phase, "match-end");
});

// ---------------------------------------------------------------------------
// Whole-match walk
// ---------------------------------------------------------------------------

check("a full match runs exactly 30 rounds across 3 courts", () => {
  let level = 0;
  let round = 1;
  let roundsPlayed = 0;
  let courtsCleared = 0;
  let guard = 0;

  while (guard < 500) {
    guard += 1;
    roundsPlayed += 1;

    const afterRound = nextRoundTarget({ round, level, livesMode: false, lifeWinner: null });
    if (afterRound.phase === "level-end") {
      courtsCleared += 1;
      const afterLevel = nextLevelTarget({ level });
      if (afterLevel.phase === "match-end") break;
      level = afterLevel.level;
      round = afterLevel.round;
      continue;
    }
    round = afterRound.round;
  }

  flow.equal(roundsPlayed, 30);
  flow.equal(courtsCleared, 3);
  flow.equal(level, 2);
});

check("each court is played on its own card count in order 5, 3, 2", () => {
  const order: number[] = [];
  let level = 0;
  let round = 1;
  let lastLevel = -1;
  let guard = 0;
  while (guard < 500) {
    guard += 1;
    if (level !== lastLevel) {
      order.push(LEVELS[level].cards);
      lastLevel = level;
    }
    const afterRound = nextRoundTarget({ round, level, livesMode: false, lifeWinner: null });
    if (afterRound.phase === "level-end") {
      const afterLevel = nextLevelTarget({ level });
      if (afterLevel.phase === "match-end") break;
      level = afterLevel.level;
      round = afterLevel.round;
      continue;
    }
    round = afterRound.round;
  }
  flow.deepEqual(order, [5, 3, 2]);
});

check("the round counter resets to 1 at every court boundary", () => {
  // Each court's round count differs (14, 10, 6); the next court must still
  // start at 1 so the dealer/guesser seat math restarts identically.
  for (const level of [0, 1]) {
    flow.equal(nextLevelTarget({ level }).round, 1);
  }
  flow.equal(roundsPerLevel(0), 14);
  flow.equal(roundsPerLevel(1), 10);
  flow.equal(roundsPerLevel(2), 6);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
