import type { RoundOutcome, Seat } from "../types/game.ts";

/**
 * Deciding a round.
 *
 * The same four facts decide every round: was there a King, where, what did the
 * guesser do, and did they accuse instead. This is the local/2-player twin of
 * the authoritative `resolveGuess` in `lib/game/rules.ts` — it operates on the
 * seat-local view the board already holds, so the reveal renders the right thing
 * the instant the player commits.
 *
 * Precedence is deliberate and must not be reordered:
 *   1. An accusation is judged before any card is considered.
 *   2. A bluff on the table beats any card the guesser turns over.
 *   3. Only then is the picked card compared against the King's seat.
 */

export function resolveLocalRound(input: {
  isBluff: boolean;
  kingIndex: number | null;
  pick: number | null;
  calledBluff: boolean;
  dealer: Seat;
}): RoundOutcome {
  const guesser = (input.dealer === 0 ? 1 : 0) as Seat;

  if (input.calledBluff) {
    return input.isBluff
      ? { kind: "bluff-caught", winner: guesser, pick: null, calledBluff: true }
      : { kind: "bluff-missed", winner: input.dealer, pick: null, calledBluff: true };
  }

  if (input.pick === null) {
    return { kind: "timeout", winner: input.dealer, pick: null, calledBluff: false };
  }

  if (input.isBluff) {
    return { kind: "bluff-worked", winner: input.dealer, pick: input.pick, calledBluff: false };
  }

  if (input.pick === input.kingIndex) {
    return { kind: "king", winner: guesser, pick: input.pick, calledBluff: false };
  }

  return { kind: "wrong", winner: input.dealer, pick: input.pick, calledBluff: false };
}

/** The card the player picked while guessing, if they have committed to one. */
export function resolveTimedOutDealerChoice(cards: number, roll: number): number {
  return Math.min(cards - 1, Math.floor(roll * cards));
}
