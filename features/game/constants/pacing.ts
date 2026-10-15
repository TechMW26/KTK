/**
 * Timing constants for the game's announced beats.
 *
 * Every value here is either a cosmetic duration or a reaction delay. The
 * `reducedMotion` variants exist because the motion setting shortens the same
 * beats — the ordering of events never changes, only how long they take.
 */

/** How long the "YOUR TURN / OPPONENT'S TURN" cinematic veil covers the board. */
export const TURN_VEIL_MS = 2800;

/** Pause after the veil lifts before the bot commits to a card. */
export const BOT_THINK_AFTER_VEIL_MS = 1500;

/** Full entrance, left-to-right arrangement, and top-edge withdrawal. */
export const SHUFFLE_MS = 1700;
export const DEAL_START_FRACTION = .22;
export const DEAL_RELEASE_SPAN_FRACTION = .46;
export const DEAL_CARD_FLIGHT_FRACTION = .16;

/** Cards land along the visible swipe, in screen-slot order.
 * The full window includes withdrawal: advancing at the last card's landing
 * would cut the forearm off while it is still on screen.
 */
export function dealTimings(cards: number, windowMs: number = SHUFFLE_MS) {
  const windowSec = windowMs / 1000;
  const count = Math.max(1, cards);
  const launch = (slot = 0) => windowSec * (DEAL_START_FRACTION +
    DEAL_RELEASE_SPAN_FRACTION * (count === 1 ? .5 : Math.max(0, Math.min(count - 1, slot)) / (count - 1)));
  const flight = windowSec * DEAL_CARD_FLIGHT_FRACTION;
  return {
    windowSec,
    flight,
    launch,
    land: (slot = 0) => launch(slot) + flight,
    total: windowSec,
  };
}

/** How long the bot appears to deliberate over its hiding spot. */
export const BOT_HIDE_PICK_MS = 520;

/** How long the bot needs before it locks in its hiding spot. */
export const BOT_HIDE_LOCK_MS = 1750;

/** How long the bot "reads the table" before reaching for a card. */
export const BOT_GUESS_REACH_MS = 1250;

/** How long the bot pauses before blurting out an accusation. */
export const BOT_ACCUSE_MS = 500;

/**
 * How long the locked card holds before the whole row flips face-up.
 *
 * This is the "selected card locks → reveal ALL" beat: the guesser's pick is
 * highlighted first, then a short pause, then every card turns over together.
 */
export const REVEAL_LOCK_MS = 600;

/**
 * How long the picked card takes to travel toward the player who chose it.
 *
 * A presentation-only beat played just before the reveal. It must stay shorter
 * than REVEAL_LOCK_MS so the pull finishes before the row flips, otherwise the
 * two animations would fight over the same transform.
 */
export const PULL_MS = 460;

/**
 * How long the hidden King takes to travel from the player's side into its
 * slot. Played when the dealer commits a real King; never played for a bluff,
 * which has no King to place.
 */
export const KING_PLACE_MS = 500;

/** Durations used when the player has turned card animations off. */
export const REDUCED = {
  veil: 120,
  afterVeil: 30,
  shuffle: 400,
  hidePick: 40,
  hideLock: 120,
  guessReach: 30,
  accuse: 20,
  revealLock: 40,
} as const;

/**
 * How long the "time's up — King auto-hidden" screen waits for the player to
 * press GOT IT before the round moves on by itself. NOT shortened by the
 * motion setting: it is a message the player has to read, not an animation.
 */
export const AUTO_HIDE_NOTICE_MS = 4000;

/** Seconds left on the clock when the countdown cue starts playing. */
export const COUNTDOWN_WARNING_SECONDS = 5;

/** Full-swing interval for the countdown tick sound. */
export const COUNTDOWN_TICK_SECONDS = 5;