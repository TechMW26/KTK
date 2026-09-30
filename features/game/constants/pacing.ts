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

/** How long the held hand takes to sweep the table during the shuffle. */
export const SHUFFLE_MS = 1450;

/**
 * Deal choreography, expressed as fractions of the shuffle window so the throw
 * and the phase change stay in lock-step no matter the card count or the
 * motion setting.
 *
 * The whole sequence is a fraction of SHUFFLE_MS, so the hand sweep, the card
 * flights and the switch to the guess stage always finish on the same beat.
 */

/**
 * The card rides the SAME pass as the hand.
 *
 * The dealer hand sweeps left -> right once across the table, launching one card
 * per slot as it goes. So a card's flight is not an arbitrary duration: it is
 * the time the hand takes to cover that card's share of the sweep. Coupling the
 * two through DEAL_SWEEP_FRACTION (the portion of the window the hand spends
 * travelling) keeps the card pinned to the hand for the whole throw — the card
 * and the hand arrive at each slot together, at the same speed.
 */
/**
 * When the hand has finished travelling, as a fraction of the shuffle window.
 *
 * The sweep animation is percentage-based (see `dealer-sweep`), so this must
 * match the keyframe where the hand reaches its far position. Keeping it here
 * lets the card flights be derived from the hand's REAL travel time instead of
 * guessing, so the two stay in sync if the sweep is ever re-timed.
 */
export const DEAL_HAND_ARRIVE_FRACTION = 0.88;

/** When the first card leaves the Dealer's hand, as a fraction of the window. */
export const DEAL_START_FRACTION = 0.05;

/** Fraction of the window reserved after the last card lands, to settle. */
export const DEAL_SETTLE_FRACTION = 0.06;

/**
 * Per-card delays (in seconds) for a deal of `cards` cards inside `windowMs`.
 *
 * The hand makes ONE pass across the table and releases one card per slot. The
 * card's flight is therefore the hand's REAL per-slot travel time
 * (`arrive - start` divided by the number of slots), so each card is pinned to
 * the hand for its whole journey and moves at exactly the hand's speed. The
 * last card lands on the very beat the hand finishes its pass.
 */
export function dealTimings(cards: number, windowMs: number = SHUFFLE_MS) {
  const windowSec = windowMs / 1000;
  const count = Math.max(1, cards);
  const start = windowSec * DEAL_START_FRACTION;
  const settle = windowSec * DEAL_SETTLE_FRACTION;
  // The hand's real travel time, and the per-slot slice of it a card rides.
  const travel = windowSec * (DEAL_HAND_ARRIVE_FRACTION - DEAL_START_FRACTION);
  const sweep = windowSec * DEAL_HAND_ARRIVE_FRACTION;
  const flight = travel / count;
  const gap = flight;
  const launch = (index: number) => start + index * gap;
  return {
    /** The full shuffle window, in seconds (also drives the CSS sweep). */
    windowSec,
    /** The hand's whole pass across the table. */
    sweep,
    /** One card's flight — identical to the hand's per-slot travel. */
    flight,
    /** When card `index` leaves the hand. */
    launch,
    /** When card `index` finishes its flight and lands in the slot. */
    land: (index: number) => launch(index) + flight,
    /** Total time the sequence occupies, including the settle reserve. */
    total: launch(Math.max(0, count - 1)) + flight + settle,
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

/** Durations used when the player has turned card animations off. */
export const REDUCED = {
  veil: 120,
  afterVeil: 30,
  shuffle: 400,
  hidePick: 40,
  hideLock: 120,
  guessReach: 30,
  accuse: 20,
} as const;

/** Seconds left on the clock when the countdown cue starts playing. */
export const COUNTDOWN_WARNING_SECONDS = 5;

/** Full-swing interval for the countdown tick sound. */
export const COUNTDOWN_TICK_SECONDS = 5;
