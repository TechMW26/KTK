/**
 * Seat helpers.
 *
 * The seat ROTATION itself is owned by `features/game/constants/courts.ts`
 * (`dealerForRound` / `guesserForRound` / `isBotSeat`) because it is a rule of
 * the game. This module only re-exports those names, so a new engineer has one
 * obvious place to look for "who deals next?" and there is never a second copy
 * of the formula to keep in sync.
 *
 * The default rotation is "complete turns": each player hides a BLOCK of
 * consecutive rounds (see HIDES_PER_BLOCK) rather than trading every round.
 * Pass `block = 1` for the classic alternating rotation.
 */

export {
  blockStartForRound,
  dealerForRound,
  guesserForRound,
  hidesIntoBlock,
  isBotSeat,
} from "../constants/courts.ts";

