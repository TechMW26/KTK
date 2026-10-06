/**
 * Pure "tournament flow" engine for KILL THE KING's optional rules.
 *
 * The built-in online match is the SCORE based 3-court game with the dealer
 * switching every round ("Alternate Turns") — that code path lives in
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
 * A match runs the three courts in order. A court is a fixed number of rounds
 * (ROUNDS_PER_COURT = 10) and the round counter RESTARTS at 1 in each court —
 * exactly like the local/2-player engine. Within a court the hides are split
 * into two consecutive blocks of HIDES_PER_BLOCK (= 5): seat 0 hides the first
 * block, seat 1 the second. Because the counter resets, seat 0 always opens a
 * court and each seat deals the same number of rounds per court.
 *
 *   COMPLETE block size : HIDES_PER_BLOCK (5) consecutive dealer rounds per court.
 *   Alternate           : the dealer flips every hiding round.
 *
 * The global hiding-round index (1..RULESET_ROUNDS) is the authoritative clock;
 * `courtForHidingRound` maps it to the court whose card count / clock / stakes
 * apply, so the optional rules reuse the existing LEVEL visuals without their own
 * copy of the court table.
 */

/**
 * Round the dealer ROTATION restarts at, within a court.
 *
 * A court now runs two blocks of `hidesPerBlock(court)` hides — one per seat —
 * so this is NOT a single number: court 1 runs 10 rounds, court 2 runs 6 and
 * court 3 runs 4. Kept as the court-1 value for callers that only need the
 * opening court's shape, and because `COURTS[0].cards` is the same 5.
 */
export const ROUNDS_PER_COURT = 5 * 2; // court 1: 10
/** Consecutive hides each seat takes inside one court (half the court). */
export const HIDES_PER_BLOCK = ROUNDS_PER_COURT / 2; // court 1: 5
/** Number of courts in a match (matches the shared COURTS table length). */
export const COURT_COUNT = 3;
/** Total hiding rounds in a match (10 + 6 + 4). */
export const RULESET_ROUNDS = 20;
/** Rounds each seat deals across a whole match (one block in every court). */
export const DEALS_PER_SEAT = RULESET_ROUNDS / 2; // 10

/** Cards on the table in a given court — drives that court's block size. */
const COURT_CARDS = [5, 3, 2] as const;

/** Rounds in a court: both seats' blocks. */
export function roundsInCourt(courtIndex: number): number {
  return COURT_CARDS[Math.max(0, Math.min(COURT_COUNT - 1, courtIndex))] * 2;
}

/** Hides per seat in a court: one per card on the table. */
export function hidesInCourt(courtIndex: number): number {
  return COURT_CARDS[Math.max(0, Math.min(COURT_COUNT - 1, courtIndex))];
}

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

/**
 * Round WITHIN the current court (1..roundsInCourt(court)) for a 1-based global
 * hiding round. The dealer rotation restarts here every court, mirroring the
 * local engine where `round` resets to 1 on a new court.
 *
 * Courts no longer share a length, so the round is found by walking the court
 * boundaries rather than taking a modulo.
 */
export function roundInCourt(hidingRound: number): number {
  return hidingRound - courtStartRound(courtForHidingRound(hidingRound)) + 1;
}

/** The 1-based global hiding round a court opens on. */
export function courtStartRound(courtIndex: number): number {
  let start = 1;
  for (let index = 0; index < courtIndex; index++) start += roundsInCourt(index);
  return start;
}

/** Zero-based court (level) index for a 1-based global hiding round. */
export function courtForHidingRound(hidingRound: number): number {
  let remaining = Math.max(1, hidingRound);
  for (let index = 0; index < COURT_COUNT; index++) {
    const rounds = roundsInCourt(index);
    if (remaining <= rounds) return index;
    remaining -= rounds;
  }
  return COURT_COUNT - 1;
}

/**
 * Dealer seat for a 1-based global hiding round under a turn-order mode.
 *
 * COMPLETE — "complete turns": the hides INSIDE a court are split into two
 * consecutive blocks of `hidesInCourt(court)` — 5, 3 and 2 for the three courts.
 * Seat 0 takes the first block of the court and seat 1 the second, so each seat
 * hides a whole block before the table turns. The counter restarts each court,
 * so seat 0 opens every court and both seats deal an equal number of rounds.
 *
 * ALTERNATE — the dealer flips every single hiding round.
 */
export function dealerForHidingRound(hidingRound: number, turnOrder: TurnOrder): Seat {
  if (turnOrder === "complete") {
    const court = courtForHidingRound(hidingRound);
    const block = hidesInCourt(court);
    const inCourt = roundInCourt(hidingRound);
    return (Math.floor((inCourt - 1) / block) % 2) as Seat;
  }
  // alternate: dealer alternates each hiding round (global parity).
  return (((hidingRound - 1) % 2) as Seat) as Seat;
}

export function guesserForHidingRound(hidingRound: number, turnOrder: TurnOrder): Seat {
  return (1 - dealerForHidingRound(hidingRound, turnOrder)) as Seat;
}

/**
 * How many hiding rounds `seat` has already COMPLETED as Dealer by the time
 * `hidingRound` is about to begin (1-based). Used to render a "consecutive turn"
 * counter and (conceptually) bound life losses. Pure.
 */
export function hidesDealtBy(seat: Seat, hidingRound: number, turnOrder: TurnOrder): number {
  // hidingRound is 1-based; rounds before it that are fully done:
  const done = hidingRound - 1;
  if (turnOrder === "complete") {
    let count = 0;
    let remaining = done;
    for (let court = 0; court < COURT_COUNT && remaining > 0; court++) {
      const block = hidesInCourt(court);
      const within = Math.min(remaining, block * 2);
      if (seat === 0) {
        count += Math.min(within, block);
      } else {
        count += Math.max(0, within - block);
      }
      remaining -= within;
    }
    return count;
  }
  // alternate: dealers interleave; a seat has dealt every other completed round.
  // seat0 deals rounds 1,3,5,...; seat1 deals 2,4,6,...
  const seat0Dealt = Math.ceil(done / 2);
  return seat === 0 ? seat0Dealt : Math.floor(done / 2);
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

/** Consecutive-turn counter string shown in the UI ("1/5", "5/5"). */
export function consecutiveLabel(seat: Seat, nextHidingRound: number, turnOrder: TurnOrder): string {
  if (turnOrder !== "complete") return `${nextHidingRound}/${RULESET_ROUNDS}`;
  // Position of this seat inside its current block of the court it is dealing.
  const court = courtForHidingRound(nextHidingRound);
  const block = hidesInCourt(court);
  const inCourt = roundInCourt(nextHidingRound);
  const isMyBlock = dealerForHidingRound(nextHidingRound, turnOrder) === seat;
  const slot = isMyBlock ? ((inCourt - 1) % block) + 1 : 0;
  return `${Math.max(0, slot)}/${block}`;
}

// ---------------------------------------------------------------------------
// Strategy-panel history (pure)
// ---------------------------------------------------------------------------

/** The minimal resolved-round facts the online Strategy panel needs. */
export interface ResolvedRoundFacts {
  /** 1-based hiding round in the engine's own counting. */
  round: number;
  /** Court the round belongs to in the engine's own counting (classic only). */
  level: number;
  dealerSeat: Seat;
  guesserSeat: Seat;
  /** 0-based card the guesser picked, or null (timeout / bluff call). */
  pick: number | null;
  wasBluff: boolean;
  /** Seat that took the round. */
  winnerSeat: Seat;
}

/** One row of the Strategy panel, in the panel's own units. */
export interface StrategyHistoryEntry {
  /** Court the round was played in (always court-relative). */
  level: number;
  /** Round WITHIN that court (1..ROUNDS_PER_COURT). */
  round: number;
  dealer: Seat;
  guesser: Seat;
  /** 1-based card number for display, or null when the round ended without a pick. */
  pick: number | null;
  calledBluff: boolean;
  wasBluff: boolean;
  /** Whether the guesser took the round. */
  won: boolean;
}

/**
 * Turn a resolved round into a Strategy-panel row.
 *
 * The panel charts per COURT, so CLASSIC rounds (already numbered within their
 * court, level 0..2) pass straight through while the OPTIONAL engine's global
 * 1..RULESET_ROUNDS counter is mapped back to court-relative values. `pick` is
 * normalised from the engine's 0-based index to the 1-based card number shown in
 * the panel. Pure, so the online panel is guaranteed to chart the same shape as
 * the solo one.
 */
export function strategyEntryFor(
  facts: ResolvedRoundFacts,
  calledBluff: boolean,
  classic: boolean,
): StrategyHistoryEntry {
  return {
    level: classic ? facts.level : courtForHidingRound(facts.round),
    round: classic ? facts.round : roundInCourt(facts.round),
    dealer: facts.dealerSeat,
    guesser: facts.guesserSeat,
    pick: facts.pick === null ? null : facts.pick + 1,
    calledBluff,
    wasBluff: facts.wasBluff,
    won: facts.winnerSeat === facts.guesserSeat,
  };
}
