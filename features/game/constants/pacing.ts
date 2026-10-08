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

/** How long the hand takes to rise and disperse the cards. */
export const SHUFFLE_MS = 780;

/**
 * Deal choreography, expressed as fractions of the window so the hand and the
 * phase change stay in lock-step no matter the card count or the motion setting.
 *
 * The motion is two beats: the hand RISES from the bottom of the frame, then
 * disperses every card almost simultaneously. There is no lateral sweep.
 */

/**
 * When the hand has finished RISING into place, as a fraction of the window.
 *
 * The hand is already on its way up when this stage mounts, so this is short —
 * the deal is meant to feel like the cards are scattered the moment the hand
 * appears, not dealt one at a time. Mirrors the `hand-rise` keyframe.
 */
export const DEAL_HAND_RISE_FRACTION = 0.3;

/**
 * When the first card leaves the hand, as a fraction of the window.
 *
 * The hand is still rising when the cards go, so there is no held beat to sit
 * through: the volley is already in the air by the time the hand settles. This
 * is what makes the release feel like a snap rather than a deliberate deal.
 */
export const DEAL_START_FRACTION = 0.16;

/**
 * Fraction of the window over which the cards are released.
 *
 * ZERO: every card leaves the hand on the SAME frame. There is deliberately no
 * stagger at all, because even a 40ms offset is visible as a ripple and makes
 * the spread read as "dealt one at a time". The card count does not affect the
 * timing — only the distance each card travels.
 */
export const DEAL_RELEASE_SPAN_FRACTION = 0;

/**
 * How long ONE card is in the air, as a fraction of the window.
 *
 * Short: the cards cover their whole path in a fraction of a second, so the
 * spread reads as a burst instead of a glide. This is the "ninja" part — most of
 * the card's travel happens in the first few frames (see the keyframe spacing).
 */
export const DEAL_CARD_FLIGHT_FRACTION = 0.34;

/**
 * How long a card's land-fade takes, as a fraction of the window.
 *
 * This MUST leave headroom: the card's reveal animation is cancelled the moment
 * the stage leaves `dealing` (the class is what scopes `.dealing .playing-card`),
 * so a card whose fade is still running at the window's end never appears.
 */
export const DEAL_LAND_FADE_FRACTION = 0.14;

/** Fraction of the window reserved after the cards land, to settle. */
export const DEAL_SETTLE_FRACTION = 0.06;

/**
 * Timings for a simultaneous spread inside `windowMs`.
 *
 * The hand appears holding the cards, then EVERY card moves to its slot at the
 * same instant. `launch` is therefore a constant, not a function of the index —
 * the only per-card difference is the distance travelled (driven by `--slot-x`
 * in the CSS), so the cards fan out along different paths that all take the same
 * time. That is what makes it read as one motion rather than a sequence.
 *
 * `cards` no longer changes the timing — the spread is deliberately
 * card-count independent — but it is kept in the signature because callers pass
 * it and it documents that the deal is sized for a whole hand, not one card.
 *
 * The flight and fade are budgeted so the whole sequence fits INSIDE the window:
 * a card still animating when the stage flips loses its animation and vanishes.
 */
export function dealTimings(cards: number, windowMs: number = SHUFFLE_MS) {
  void cards;
  const windowSec = windowMs / 1000;
  const start = windowSec * DEAL_START_FRACTION;
  const settle = windowSec * DEAL_SETTLE_FRACTION;
  const rise = windowSec * DEAL_HAND_RISE_FRACTION;
  const fade = windowSec * DEAL_LAND_FADE_FRACTION;

  // Simultaneous release: one launch time for every card, so the signature
  // takes no index at all — there is nothing per-card to vary.
  const launch = () => start;

  // Cap the flight so the fade still completes inside the window.
  const maxFlight = Math.max(0.04, windowSec - fade - settle - start);
  const desired = windowSec * DEAL_CARD_FLIGHT_FRACTION;
  const flight = Math.min(desired, maxFlight);

  return {
    /** The full window, in seconds (also drives the CSS animations). */
    windowSec,
    /** When the hand has finished rising into place. */
    rise,
    /** One card's flight — the same for every card. */
    flight,
    /** How long a landed card takes to fade in. */
    fade,
    /** When every card leaves the hand — identical for all of them. */
    launch,
    /** When every card finishes its flight and lands in its slot. */
    land: () => launch() + flight,
    /** Total time the sequence occupies, including the settle reserve. */
    total: launch() + flight + settle,
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

/** Seconds left on the clock when the countdown cue starts playing. */
export const COUNTDOWN_WARNING_SECONDS = 5;

/** Full-swing interval for the countdown tick sound. */
export const COUNTDOWN_TICK_SECONDS = 5;
