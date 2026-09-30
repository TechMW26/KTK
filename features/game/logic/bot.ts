import type { Seat } from "../types/game.ts";

/**
 * The Rival — the single-player bot.
 *
 * The bot is deliberately imperfect and its personality is entirely these four
 * probabilities. They are the "source of truth" values pinned by
 * `scripts/bot.test.ts`; changing one changes how the game feels.
 *
 * Every function takes the random roll as an argument instead of calling
 * `Math.random()` itself, so the decision logic stays pure and testable. Callers
 * pass `Math.random()` at the edge.
 */

/** Chance the bot hides empty cards when its bluff is still available. */
export const BLUFF_CHANCE = 0.14;

/** Chance the bot accuses when the dealer actually bluffed — it can tell. */
export const ACCUSE_CHANCE_VS_BLUFF = 0.55;

/** Chance the bot accuses a dealer who played it straight — it rarely gambles. */
export const ACCUSE_CHANCE_OTHERWISE = 0.08;

/** Whether the bot spends its one-per-court bluff on this round. */
export function decideBluff(bluffAvailable: boolean, roll: number): boolean {
  return bluffAvailable && roll < BLUFF_CHANCE;
}

/**
 * Where the bot hides the King.
 *
 * Returns null when it decided to bluff — there is no King on the table in that
 * case, and the caller must keep the two decisions consistent.
 */
export function decideHidingSpot(input: {
  cards: number;
  bluffAvailable: boolean;
  bluffRoll: number;
  positionRoll: number;
}): { isBluff: boolean; kingIndex: number | null } {
  const isBluff = decideBluff(input.bluffAvailable, input.bluffRoll);
  if (isBluff) return { isBluff: true, kingIndex: null };
  return {
    isBluff: false,
    kingIndex: Math.min(input.cards - 1, Math.floor(input.positionRoll * input.cards)),
  };
}

/** Whether the bot accuses instead of picking a card. */
export function decideAccusation(dealerBluffed: boolean, roll: number): boolean {
  const threshold = dealerBluffed ? ACCUSE_CHANCE_VS_BLUFF : ACCUSE_CHANCE_OTHERWISE;
  return roll < threshold;
}

/** Which card the bot reaches for. */
export function decideGuess(cards: number, roll: number): number {
  return Math.min(cards - 1, Math.floor(roll * cards));
}

/**
 * The bot's full guess turn: either an accusation, or a card.
 *
 * Mirrors the shipped behaviour — the bot weighs accusing first, and only picks
 * a card when it decides not to accuse.
 */
export function decideGuessTurn(input: {
  cards: number;
  dealerBluffed: boolean;
  accuseRoll: number;
  pickRoll: number;
}): { accused: boolean; cardIndex: number | null } {
  if (decideAccusation(input.dealerBluffed, input.accuseRoll)) {
    return { accused: true, cardIndex: null };
  }
  return { accused: false, cardIndex: decideGuess(input.cards, input.pickRoll) };
}

/** Seat the bot occupies. Exposed so callers stop hardcoding `1`. */
export const BOT_SEAT: Seat = 1;
