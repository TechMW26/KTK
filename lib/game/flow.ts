/**
 * Pure "tournament flow" engine for KILL THE KING's NEW optional rules.
 *
 * The built-in online match is SCORE based across 3 courts x 10 rounds with the
 * dealer switching every round ("Alternate Turns") — that code path lives in
 * services/multiplayerService.ts and is preserved untouched for these settings.
 *
 * "Complete Turns" — each player hides for a block of consecutive rounds instead
 * of alternating — is the DEFAULT turn order, and the optional "5 Lives" rule
 * (lives REPLACE score as the win condition) layers on top. Both are modelled here
 * as a *pure, deterministic* sequence of hiding rounds. This module has NO imports
 * and NO side effects so it can be verified by a standalone Node harness
 * (scripts/flow.test.ts) and shared verbatim by the Firebase transaction layer,
 * the UI and local 2-player mode.
 *
 * Model
 * -----
 * A game following the optional rules runs a fixed number of hiding rounds. Each
 * hiding round has ONE Dealer (who hides the King) and ONE Guesser.
 *
 *   COMPLETE block size  : COMPLETE_BLOCK (10) consecutive dealer rounds.
 *   Alternate            : the dealer flips every round.
 *
 * Deck scope (which court's card count applies) is a display-level concern and is
 * derived deterministically from the 1-based hiding round so the optional rules can
 * reuse the existing LEVEL/Court visuals without their own math.
 */

/** Identifier of who deals when using "Complete Turns". */
export const DEALS_PER_SEAT = 10;
/** Total hiding rounds in an optional-rules match (each seat deals DEALS_PER_SEAT). */
export const RULESET_ROUNDS = DEALS_PER_SEAT * 2; // 20

// ---------------------------------------------------------------------------
// Types (kept local & inline so this module stays import-free)
// ---------------------------------------------------------------------------

/**
 * "complete" — each player hides for a block of consecutive rounds (the DEFAULT).
 * "alternate" — the dealer flips every round (the optional classic behaviour).
 */
export type TurnOrder = "alternate" | "complete";
export type WinMode = "classic" | "lives";

/** Seat is imported as Seat 0 | 1 elsewhere; mirrored here to stay dependency-free. */
export type Seat = 0 | 1;

/**
 * The "match configuration" chosen by the host before the game starts. Locked for
 * the whole match and synchronised to both clients in the authoritative game node.
 */
export interface MatchSettings {
  /**
   * "complete"  -> each player hides for a block of consecutive rounds (DEFAULT).
   * "alternate" -> dealer flips every round (the optional classic behaviour).
   */
  turnOrder: TurnOrder;
  /**
   * "classic" -> the scored 3x10-court game (unchanged per-round behaviour).
   * "lives"   -> each player starts with 5 lives; finding the hidden King costs the
   *              Dealer one life; first player to reach 0 lives loses.
   * Choosing lives automatically uses the optional continuous engine.
   */
  winMode: WinMode;
}

/**
 * Default match config: Complete Turns with classic scoring. This is the
 * continuous 20-hide engine; "Alternate Turns" is the opt-in classic format.
 */
export const DEFAULT_SETTINGS: MatchSettings = {
  turnOrder: "complete",
  winMode: "classic",
};

/**
 * True when a config selects the untouched, alternate-turns scored game — the
 * optional "Alternate Turns" format. All other configs (i.e. the Complete Turns
 * default, with or without lives) use the optional continuous engine.
 */
export function isClassic(settings: MatchSettings): boolean {
  return settings.winMode === "classic" && settings.turnOrder === "alternate";
}

/** Total starting lives when lives mode is enabled. */
export const START_LIVES = 5;

/** A resolved hiding round (the minimal facts the flow engine needs). */
export interface RoundOutcome {
  /** 1-based hiding round this result belongs to. */
  round: number;
  /** Who dealt (hid) this round. */
  dealer: Seat;
  /** Result kind, using the game's existing vocabulary. */
  kind:
    | "king"
    | "wrong"
    | "bluff-caught"
    | "bluff-missed"
    | "bluff-worked"
    | "timeout";
}

// ---------------------------------------------------------------------------
// Dealer / guesser arithmetics (pure)
// ---------------------------------------------------------------------------

/** Dealer seat for a 1-based global hiding round under a turn-order mode. */
export function dealerForHidingRound(hidingRound: number, turnOrder: TurnOrder): Seat {
  if (turnOrder === "complete") {
    return (Math.floor((hidingRound - 1) / DEALS_PER_SEAT) % 2) as Seat;
  }
  // alternate: dealer alternates each hiding round.
  return (((hidingRound - 1) % 2) as Seat) as Seat;
}

export function guesserForHidingRound(hidingRound: number, turnOrder: TurnOrder): Seat {
  return (1 - dealerForHidingRound(hidingRound, turnOrder)) as Seat;
}

/**
 * How many hiding rounds `seat` has already COMPLETED as Dealer by the time
 * `hidingRound` is about to begin (1-based). Used to render a "consecutive turn"
 * counter and (conceptually) bound lives losses. Pure.
 */
export function hidesDealtBy(seat: Seat, hidingRound: number, turnOrder: TurnOrder): number {
  // hidingRound is 1-based; rounds before it that are fully done:
  const done = hidingRound - 1;
  if (turnOrder === "complete") {
    const block = DEALS_PER_SEAT; // 10
    // seat0 deals cycles [1..10],[21..30],...; seat1 deals [11..20],[31..40],...
    const cycle = block * 2;
    const fullCycles = Math.floor(done / cycle);
    let count = fullCycles * block;
    const within = done % cycle;
    if (seat === 0) {
      count += Math.min(within, block);
    } else {
      count += Math.max(0, Math.min(within - block, block));
    }
    return count;
  }
  // alternate: dealers interleave; a seat has dealt every other completed round.
  // seat0 deals rounds 1,3,5,... (index parity of round-1); seat1 deals 2,4,6,...
  const seat0Dealt = Math.ceil(done / 2);
  return seat === 0 ? seat0Dealt : Math.floor(done / 2);
}

// ---------------------------------------------------------------------------
// Which court (level) is in play for a global hiding round (display only)
// ---------------------------------------------------------------------------

/**
 * Map a 1-based global hiding round to the LEVEL/court index used to drive the
 * existing card-count, timing and points visuals. We carve RULESET_ROUNDS (20)
 * into the same 3-court spirit as the classic game: 0..7 -> Court(5 cards),
 * 8..14 -> High Stakes(3), 15..20 -> Final Duel(2). Pure & deterministic.
 */
export const ROUNDS_PER_COURT = 7; // first two courts
export function courtForHidingRound(hidingRound: number): number {
  if (hidingRound <= ROUNDS_PER_COURT) return 0;
  if (hidingRound <= ROUNDS_PER_COURT * 2) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Lives accounting (pure, lives win-mode)
// ---------------------------------------------------------------------------

/**
 * Apply ONE resolved hiding round to a pair of running lives.
 *
 * The ONLY event that costs a life is the Guesser successfully finding the
 * Dealer's hidden King (`kind === "king"`): the Dealer who hid it loses 1 life.
 * wrong guesses, bluffs and timeouts consume the round but do NOT cost a life.
 *
 * Returns the new lives array [seat0, seat1].
 */
export function applyLivesChange(
  lives: [number, number],
  outcome: { kind: RoundOutcome["kind"]; dealer: Seat },
): [number, number] {
  if (outcome.kind !== "king") return lives;
  const dealer = outcome.dealer;
  const next = lives[dealer] - 1;
  return dealer === 0 ? [next, lives[1]] : [lives[0], next];
}

/** True when one (or both) players have no lives left. */
export function livesOver(lives: [number, number]): boolean {
  return lives[0] <= 0 || lives[1] <= 0;
}

/** Win/Loss verdict of a (possibly partial) lives match. */
export type LifeVerdict =
  | { over: true; loser: Seat; winner: Seat }
  | { over: false; loser: null; winner: null };

/**
 * Given run lives and how many hiding rounds are still to come, decide whether the
 * lives match is decided.
 *
 * Rule: first player whose life hits 0 loses. If the full length of the hiding
 * sequence elapses, fewer-lives-lost wins (ties stay undecided until a decider).
 */
export function livesVerdict(
  lives: [number, number],
  remainingHides: number,
): LifeVerdict {
  if (lives[0] <= 0) return { over: true, loser: 0, winner: 1 };
  if (lives[1] <= 0) return { over: true, loser: 1, winner: 0 };
  if (remainingHides > 0) return { over: false, loser: null, winner: null };
  // Sequence exhausted: more remaining lives wins.
  if (lives[0] > lives[1]) return { over: true, loser: 1, winner: 0 };
  if (lives[1] > lives[0]) return { over: true, loser: 0, winner: 1 };
  return { over: false, loser: null, winner: null }; // exact draw -> caller decides rematch
}

/** Play a whole optional-rules match from a stream of per-round kinds. Returns final state. */
export function simulateMatch(kinds: RoundOutcome["kind"][]): {
  lives: [number, number];
  verdict: LifeVerdict;
  hidingRoundsPlayed: number;
} {
  let lives: [number, number] = [START_LIVES, START_LIVES];
  let hidingRoundsPlayed = 0;
  const n = Math.min(kinds.length, RULESET_ROUNDS);
  for (let i = 0; i < n; i += 1) {
    const hidingRound = i + 1;
    const dealer = dealerForHidingRound(hidingRound, "alternate");
    lives = applyLivesChange(lives, { kind: kinds[i], dealer });
    hidingRoundsPlayed += 1;
    const remaining = RULESET_ROUNDS - hidingRoundsPlayed;
    const v = livesVerdict(lives, remaining);
    if (v.over) return { lives, verdict: v, hidingRoundsPlayed };
  }
  return {
    lives,
    verdict: livesVerdict(lives, 0),
    hidingRoundsPlayed,
  };
}

/** Sequence of dealer seats produced by a turn-order mode over RULESET_ROUNDS hides. */
export function dealerSequence(turnOrder: TurnOrder): Seat[] {
  return Array.from({ length: RULESET_ROUNDS }, (_, i) =>
    dealerForHidingRound(i + 1, turnOrder),
  );
}

/** Consecutive-turn counter string shown in the UI ("1/10", "5/10"). */
export function consecutiveLabel(seat: Seat, nextHidingRound: number, turnOrder: TurnOrder): string {
  if (turnOrder !== "complete") return `${nextHidingRound}/${RULESET_ROUNDS}`;
  const doneForSeat = hidesDealtBy(seat, nextHidingRound, turnOrder);
  const withinBlock = nextHidingRound <= 0 ? 0 : nextHidingRound;
  // position inside this seat's current deal block / or upcoming deal block
  const inTheirBlock =
    dealerForHidingRound(nextHidingRound, turnOrder) === seat;
  const cur = inTheirBlock ? (doneForSeat % DEALS_PER_SEAT) + 1 : doneForSeat % DEALS_PER_SEAT;
  void withinBlock;
  return `${Math.max(0, cur)}/${DEALS_PER_SEAT}`;
}
