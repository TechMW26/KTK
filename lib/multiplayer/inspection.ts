import type { GameState, Seat } from "./types.ts";

type InspectionTurn = Pick<GameState, "phase" | "actingSeat" | "dealerSeat">;

/** Hiding is secret. Only the guesser's public aim can be synchronised. */
export function canPublishGuessInspection(game: InspectionTurn, seat: Seat): boolean {
  return game.phase === "guess" && game.actingSeat === seat && game.dealerSeat !== seat;
}

export function visibleGuessInspection(game: InspectionTurn & Pick<GameState, "inspectingCardIndex">, cards: number): number | null {
  const index = game.inspectingCardIndex;
  return canPublishGuessInspection(game, game.actingSeat) && typeof index === "number" && Number.isInteger(index) && index >= 0 && index < cards ? index : null;
}
