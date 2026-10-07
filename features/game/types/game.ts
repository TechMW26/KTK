/**
 * Domain vocabulary for a Kill the King match.
 *
 * These names describe the game, not the UI. Screens read them; they never
 * redefine them. Keeping the union here means "what phases exist" is answered in
 * exactly one place.
 */

/** Every screen the local / vs-bot match can be on. */
export type MatchPhase =
  | "home"
  | "dealer"
  | "pass"
  | "shuffle"
  | "guess"
  /**
   * The guesser has locked a card and ALL cards are flipping face-up together,
   * before the verdict screen. Purely presentational: the round outcome is
   * already decided, so the rules are untouched — this only splits the existing
   * reveal into its two visible beats (lock, then show every card).
   */
  | "reveal"
  | "result"
  | "level-end"
  | "match-end";

/** Seat-based verses: two humans sharing a device, or one human vs the bot. */
export type OpponentKind = "local" | "bot";

/** Which seat an opponent occupies. The bot always sits in seat 1. */
export type Seat = 0 | 1;

/** Modal surfaces stacked above the board. */
export type OpenDialog = null | "rules" | "strategy" | "settings" | "bluff" | "quit" | "account";

/** How a round was decided. Drives reveal copy, tone and the sound cue. */
export type RoundOutcomeKind =
  | "king"
  | "wrong"
  | "bluff-caught"
  | "bluff-missed"
  | "bluff-worked"
  | "timeout";

/** The resolved outcome of one round, as shown on the reveal screen. */
export interface RoundOutcome {
  kind: RoundOutcomeKind;
  /** Seat that won the round and therefore scores. */
  winner: Seat;
  /** Card the guesser chose, or null when they ran out of time / called bluff. */
  pick: number | null;
  /** Whether the guesser accused instead of picking. */
  calledBluff: boolean;
}

/** One completed round, kept so the strategy panel can chart picking habits. */
export interface RoundHistoryEntry {
  level: number;
  round: number;
  dealer: Seat;
  guesser: Seat;
  /** 1-based card number for display; null when the round ended without a pick. */
  pick: number | null;
  calledBluff: boolean;
  /** Whether the dealer had actually hidden no King. */
  wasBluff: boolean;
  /** Whether the guesser took the round. */
  won: boolean;
}

/** Whose turn it is, phrased for the turn banner. */
export interface TurnAnnouncement {
  kind: "player" | "opponent";
  title: string;
  subtitle: string;
}

/** Reveal styling + copy for an outcome. */
export interface OutcomeCopy {
  title: string;
  subtitle: string;
  tone: "victory" | "danger";
}
