/**
 * Locks the reveal-copy perspective contract.
 *
 * Regression guard for the vs-bot bug where the bot (as Guesser) found the King
 * and scored the round, but the board still told the player "You found the King"
 * — and the match-end heading named the seat "Player 1", so a bot victory read
 * like a personal win. The copy must reflect WHO the outcome happened to.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { revealCopyFor, RESULT_COPY } from "../features/game/constants/copy.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${(err as Error).message}`);
  }
}

const names: [string, string] = ["Player 1", "The Rival"];

console.log("reveal-perspective.test — the reveal names who it happened to");

// --- the core case ---------------------------------------------------------

check("the human guesser finding the King keeps the second-person copy", () => {
  assert.equal(revealCopyFor("king", 0, names, 0).subtitle, "You found the King");
});

check("the BOT guesser finding the King is named, not called 'You'", () => {
  const copy = revealCopyFor("king", 0, names, 1);
  assert.equal(copy.subtitle, "The Rival found the King");
  assert.ok(!/You/.test(copy.subtitle), "a bot win must never be narrated as the player's");
});

check("seat 1's perspective sees seat 0 named instead", () => {
  assert.equal(revealCopyFor("king", 1, names, 0).subtitle, "Player 1 found the King");
});

check("the title is shared, so only the actor phrasing differs", () => {
  assert.equal(revealCopyFor("king", 0, names, 1).title, RESULT_COPY.king.title);
});

// --- neutral outcomes are untouched ---------------------------------------

check("neutral outcomes keep their exact shipped copy", () => {
  for (const kind of ["wrong", "bluff-caught", "bluff-missed", "bluff-worked", "timeout"] as const) {
    assert.deepEqual(revealCopyFor(kind, 0, names, 1), RESULT_COPY[kind]);
    assert.deepEqual(revealCopyFor(kind, 1, names, 0), RESULT_COPY[kind]);
  }
});

// --- the board actually uses it -------------------------------------------

check("the result screen renders the perspective copy, not the raw constant", () => {
  assert.match(page, /revealCopyFor\(result\.kind, perspectiveSeat, displayNames, guesser\)/);
  // The old, perspective-blind read must be gone from the result stage.
  assert.ok(
    !/\{RESULT_COPY\[result\.kind\]\.subtitle\}/.test(page),
    "the result subtitle must not bypass revealCopyFor",
  );
});

check("the board speaks to the human in bot mode", () => {
  assert.match(page, /const perspectiveSeat: Seat = mode === "bot" \? 0/);
});

// --- the match-end heading -------------------------------------------------

check("match-end derives ONE winner for heading, board and stat", () => {
  assert.match(page, /const matchWinner: Seat \| null = useMemo/);
  // The heading, and the recorded statistic, both read it.
  assert.match(page, /matchWinner === 0 \? "YOU WIN!"/);
  assert.match(page, /const won = matchWinner === 0;/);
});

check("a bot victory says so instead of naming seat 0", () => {
  // Bot mode must never claim a personal win off seat 0's name.
  assert.match(page, /matchWinner === 0 \? "YOU WIN!" : `\$\{displayNames\[1\]\} WINS!`/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
