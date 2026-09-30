import type { RoundOutcome, Seat } from "../types/game.ts";

/**
 * Round scoring.
 *
 * A single seat takes the whole round: the winner is awarded the court's point
 * value and nothing is deducted from the loser. Kept as a pure reducer so the
 * scoring rule is readable in isolation from the board.
 */
export function applyRoundWin(scores: [number, number], winner: Seat, points: number): [number, number] {
  return scores.map((score, seat) => score + (seat === winner ? points : 0)) as [number, number];
}

/**
 * The optional local 5-Lives rule.
 *
 * Only a *found* King costs anything: when the guesser uncovers the King, the
 * player who hid it loses one heart. Every other outcome (a wrong pick, a caught
 * bluff, a missed accusation, a timeout) leaves both players untouched.
 *
 * Lives are floored at zero so the bar can never render negative pips.
 */
export function applyLifeLoss(lives: [number, number], outcome: RoundOutcome, dealer: Seat): [number, number] {
  if (outcome.kind !== "king") return lives;
  const next = lives.map((hearts, seat) => (seat === dealer ? Math.max(0, hearts - 1) : hearts)) as [number, number];
  return next;
}

/**
 * Who has lost the lives match, if anyone.
 *
 * The first player to run out of hearts loses. Returns null while the match is
 * still live.
 */
export function lifeLoser(lives: [number, number]): Seat | null {
  if (lives[0] <= 0) return 0;
  if (lives[1] <= 0) return 1;
  return null;
}

/** The seat that wins the 5-Lives match, derived from the loser. */
export function lifeWinner(lives: [number, number]): Seat | null {
  const loser = lifeLoser(lives);
  if (loser === null) return null;
  return (loser === 0 ? 1 : 0) as Seat;
}
