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

/**
 * How many consecutive rounds each player hides for inside a court.
 *
 * Derivable at any time from the court's card count — see `hidesPerBlock(index)`.
 * A court with N cards runs blocks of N hides, so each player hides once per
 * card position and both always get an equal share. This is why
 * `ROUNDS_PER_COURT` is not a single number: see `roundsInCourt(index)`.
 */

/**
 * Hides per player in a court: one per card on the table.
 *
 * Never more than `cards`, which is the load-bearing constraint. A round is a
 * single hide, so an 11th round would re-use one of the 10 pre-baked dealer
 * positions and deal a duplicate pair of cards for that round number.
 */
export function hidesPerBlock(courtIndex: number): number {
  return courtAt(courtIndex).cards;
}

/** Rounds in a court — both players' blocks. */
export function roundsInCourt(courtIndex: number): number {
  return hidesPerBlock(courtIndex) * 2;
}

/** How many courts a full match runs through. */
export const COURT_COUNT = COURTS.length;

/** Total rounds in a full match, summed across the per-court round counts. */
export const TOTAL_ROUNDS = COURTS.reduce(
  (total, _court, index) => total + roundsInCourt(index),
  0,
);

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
 * court (rounds 1..N), seat 1 takes the second (rounds N+1..2N). The round
 * counter restarts at 1 in each court, so the same player hides first in all
 * three courts and both always get an equal share of the hides.
 *
 * `block` defaults to the CURRENT court's block, so callers that already know
 * which court they are in get the right rotation without passing anything. Pass
 * an explicit value to ask about a different court, or `block = 1` for the
 * classic alternating rotation: `floor((round - 1) / block) % 2` degenerates to
 * `(round - 1) % 2`.
 */
export function dealerForRound(round: number, block?: number): Seat {
  return seatForRound(round, currentBlock(block));
}

/** Who guesses on a given round — always the other chair. */
export function guesserForRound(round: number, block?: number): Seat {
  return (dealerForRound(round, block) === 0 ? 1 : 0) as Seat;
}

/**
 * The round number the current block starts on (1-based), which is what the UI
 * shows as "hiding N of HIDES_PER_BLOCK".
 */
export function blockStartForRound(round: number, block?: number): number {
  const size = currentBlock(block);
  return Math.floor((round - 1) / size) * size + 1;
}

/** How many hides the given seat has already completed in the current block. */
export function hidesIntoBlock(round: number, block?: number): number {
  const size = currentBlock(block);
  return ((round - 1) % size) + 1;
}

/** True when the given seat is the AI opponent. The bot always sits in seat 1. */
export function isBotSeat(seat: Seat, opponent: "local" | "bot"): boolean {
  return opponent === "bot" && seat === 1;
}

/** Shared rotation maths; `size` is already normalised by the caller. */
function seatForRound(round: number, size: number): Seat {
  return (Math.floor((round - 1) / size) % 2) as Seat;
}

/** Resolve an optional block argument to the current court's, normalised. */
function currentBlock(block?: number): number {
  const size = block ?? hidesPerBlock(currentCourtIndex());
  return Math.max(1, Math.floor(size));
}

/**
 * The court the live match is on.
 *
 * The rotation helpers are called from render paths that do not pass a court, so
 * they read the level the game loop is currently on. Kept as a module-level
 * variable rather than threaded through every call because the match is a
 * single sequential state machine — a court is never mid-advance when a hide is
 * being resolved.
 */
let liveCourtIndex = 0;

export function currentCourtIndex(): number {
  return liveCourtIndex;
}

/** Set the live court. Called by the game loop when it advances a court. */
export function setCurrentCourtIndex(index: number): void {
  liveCourtIndex = Math.max(0, Math.min(COURT_COUNT - 1, index));
}

