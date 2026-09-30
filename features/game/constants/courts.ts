import type { Seat } from "../types/game.ts";

/**
 * The courts, and everything derived from them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH FOR THE RULES OF KILL THE KING.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The card counts, clocks and stakes below ARE the game. Every other module —
 * the local/2-player engine, the online engine, the bot and the services — reads
 * its court configuration from here. Nothing may restate these numbers.
 *
 * `lib/game/rules.ts` re-exports a multiplayer-shaped view of this data (it adds
 * an explicit `index` field and the authoritative resolver), but it derives
 * those values rather than duplicating them.
 *
 * Changing a value here changes gameplay. Treat edits as rule changes.
 */

export const COURTS = [
  { name: "THE COURT", cards: 5, seconds: 20, points: 1 },
  { name: "HIGH STAKES", cards: 3, seconds: 15, points: 2 },
  { name: "FINAL DUEL", cards: 2, seconds: 9, points: 3 },
] as const;

/** A court's configuration. */
export type Court = (typeof COURTS)[number];

/** Rounds played in every court before advancing. */
export const ROUNDS_PER_COURT = 10;

/**
 * How many consecutive rounds each player hides for inside a court.
 *
 * The default game is "complete turns": one player hides the first half of the
 * court, then the other hides the second half. With ROUNDS_PER_COURT = 10 this
 * is a block of 5 per player — seat 0 hides rounds 1..5, seat 1 hides 6..10.
 */
export const HIDES_PER_BLOCK = ROUNDS_PER_COURT / 2;

/** How many courts a full match runs through. */
export const COURT_COUNT = COURTS.length;

/** Total rounds in a full match. */
export const TOTAL_ROUNDS = ROUNDS_PER_COURT * COURT_COUNT;

/** Starting hearts in the optional local 5-Lives rule. */
export const STARTING_LIVES = 5;

/**
 * The court for a zero-based index, clamped to the table.
 *
 * Clamping rather than throwing keeps a malformed or stale round index from
 * crashing a live match — the caller gets the nearest valid court instead.
 */
export function courtAt(index: number): Court {
  return COURTS[Math.max(0, Math.min(COURT_COUNT - 1, index))];
}

/**
 * Who deals on a given round.
 *
 * DEFAULT — "complete turns": each player hides for a BLOCK of consecutive
 * rounds instead of trading every round. Seat 0 takes the first block of the
 * court (rounds 1..5), seat 1 takes the second (rounds 6..10). The round
 * counter restarts at 1 in each court, so the same player hides first in all
 * three courts and both always get an equal share of the hides.
 *
 * The two rotations are identical in shape — `floor((round - 1) / block) % 2`
 * with block = 1 degenerates to the classic `(round - 1) % 2` — so alternate
 * turns remain available by passing block = 1.
 */
export function dealerForRound(round: number, block: number = HIDES_PER_BLOCK): Seat {
  const size = Math.max(1, Math.floor(block));
  return (Math.floor((round - 1) / size) % 2) as Seat;
}

/** Who guesses on a given round — always the other chair. */
export function guesserForRound(round: number, block: number = HIDES_PER_BLOCK): Seat {
  return (dealerForRound(round, block) === 0 ? 1 : 0) as Seat;
}

/**
 * The round number the current block starts on (1-based), which is what the UI
 * shows as "hiding N of HIDES_PER_BLOCK".
 */
export function blockStartForRound(round: number, block: number = HIDES_PER_BLOCK): number {
  const size = Math.max(1, Math.floor(block));
  return Math.floor((round - 1) / size) * size + 1;
}

/** How many hides the given seat has already completed in the current block. */
export function hidesIntoBlock(round: number, block: number = HIDES_PER_BLOCK): number {
  const size = Math.max(1, Math.floor(block));
  return ((round - 1) % size) + 1;
}

/** True when the given seat is the AI opponent. The bot always sits in seat 1. */
export function isBotSeat(seat: Seat, opponent: "local" | "bot"): boolean {
  return opponent === "bot" && seat === 1;
}

