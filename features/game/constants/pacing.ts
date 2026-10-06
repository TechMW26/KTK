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

/** How long the held hand takes to flick across the table during the deal. */
export const SHUFFLE_MS = 800;

/**
 * Deal choreography, expressed as fractions of the window so the hand flicks
 * and the phase change stay in lock-step no matter the card count or the motion
 * setting.
 *
 * The throw is DELIBERATELY decoupled from the hand. An earlier version pinned
 * each card's flight to the hand's per-slot travel so the card rode the hand at
 * the hand's speed — physically tidy, but it made every deal look like a slow
 * slide. A dealer THROWS: the hand snaps across and each card leaves it almost
 * at once, travelling much faster than the hand does.
 *
 * So `DEAL_CARD_FLIGHT_FRACTION` is now independent of how long the sweep takes.
 */

/**
 * How long ONE card is in the air, as a fraction of the window.
 *
 * Short on purpose — this is the snap that makes it a throw. Bounded so it can
 * never run past the hand's arrival (see `dealTimings`), otherwise the final
 * card would still be travelling when the stage flips to the guess phase.
 */
export const DEAL_CARD_FLIGHT_FRACTION = 0.3;

/**
 * Fraction of the whole sequence over which the cards are RELEASED.
 *
 * The cards fire out in a tight burst rather than one per sweep slot: the whole
 * volley leaves the hand by the time it is ~60% across. Combined with a short
 * per-card flight this is what reads as "thrown" instead of "placed".
 */
export const DEAL_RELEASE_SPAN_FRACTION = 0.6;

/** When the first card leaves the Dealer's hand, as a fraction of the window. */
export const DEAL_START_FRACTION = 0.06;

/**
 * When the hand has finished travelling, as a fraction of the window.
 *
 * The sweep animation is percentage-based (see `dealer-sweep`), so this must
 * match the keyframe where the hand reaches its far position.
 */
export const DEAL_HAND_ARRIVE_FRACTION = 0.82;

/** Fraction of the window reserved after the last card lands, to settle. */
export const DEAL_SETTLE_FRACTION = 0.1;

/**
 * Per-card delays (in seconds) for a throw of `cards` cards inside `windowMs`.
 *
 * The hand flicks across once and the cards fire out in a burst: card `index`
 * launches a fraction of the release span after the previous one, and each card
 * is in the air for `flight` — a time INDEPENDENT of the hand's own travel, so
 * the cards visibly outrun the hand.
 *
 * `flight` is capped so the last card always lands before the hand arrives, which
 * is what guarantees the stage switches to the guess phase with every card
 * already in its slot.
 */
export function dealTimings(cards: number, windowMs: number = SHUFFLE_MS) {
  const windowSec = windowMs / 1000;
  const count = Math.max(1, cards);
  const start = windowSec * DEAL_START_FRACTION;
  const settle = windowSec * DEAL_SETTLE_FRACTION;
  const arrive = windowSec * DEAL_HAND_ARRIVE_FRACTION;

  // Cards launch across the release span; the first leaves at `start`.
  const releaseSpan = windowSec * DEAL_RELEASE_SPAN_FRACTION;
  const gap = count > 1 ? releaseSpan / (count - 1) : 0;
  const launch = (index: number) => start + index * gap;

  // Cap the flight so no card can land after the hand reaches the far side.
  const lastLaunch = launch(count - 1);
  const maxFlight = Math.max(0.06, arrive - lastLaunch);
  const desired = windowSec * DEAL_CARD_FLIGHT_FRACTION;
  const flight = Math.min(desired, maxFlight);

  return {
    /** The full window, in seconds (also drives the CSS sweep). */
    windowSec,
    /** The hand's whole flick across the table. */
    sweep: arrive,
    /** One card's flight — independent of the hand's speed. */
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
