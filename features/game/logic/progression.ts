import { COURT_COUNT, roundsInCourt } from "../constants/courts.ts";

/**
 * Moving through the match: round → court → final result.
 *
 * Each function answers "where does the match go next?" and returns the answer
 * rather than mutating anything, so the flow is testable and readable without a
 * React tree. The ordering in `afterRound` matters and is load-bearing: a
 * decided lives match ends the whole game even if the round counter also happens
 * to be at a court boundary.
 */

export type RoundStep =
  | { action: "next-round"; round: number }
  | { action: "court-complete" }
  | { action: "match-complete" };

/**
 * What happens when a round's result is dismissed.
 *
 * 1. A decided lives match goes straight to the final result.
 * 2. The LAST round of the court completes it. How many rounds that is depends
 *    on the court, because each court declares how many times each player hides
 *    — 14, 10 and 6 rounds for the three courts in order.
 * 3. Otherwise the next round begins.
 */
export function afterRound(input: {
  round: number;
  level: number;
  livesEnabled: boolean;
  hasLifeWinner: boolean;
}): RoundStep {
  if (input.livesEnabled && input.hasLifeWinner) return { action: "match-complete" };
  if (input.round === roundsInCourt(input.level)) return { action: "court-complete" };
  return { action: "next-round", round: input.round + 1 };
}

export type CourtStep =
  | { action: "next-court"; level: number; round: 1; refreshBluffs: true }
  | { action: "match-complete" };

/**
 * What happens when a court's standings are dismissed.
 *
 * The final court ends the match; every other court advances, restarts the round
 * counter and restores both players' one-per-court bluff.
 */
export function afterCourt(level: number): CourtStep {
  if (level === COURT_COUNT - 1) return { action: "match-complete" };
  return { action: "next-court", level: level + 1, round: 1, refreshBluffs: true };
}

/** Whether a court is the last one, i.e. clearing it ends the match. */
export function isFinalCourt(level: number): boolean {
  return level === COURT_COUNT - 1;
}

/** Whether a round number is the last of its court. */
export function isFinalRoundOfCourt(round: number, level: number): boolean {
  return round === roundsInCourt(level);
}
