import type { MatchPhase, OutcomeCopy, RoundOutcomeKind, TurnAnnouncement } from "../types/game.ts";

/**
 * Every string the match screen says, in one place.
 *
 * Copy is not logic, but it IS part of the product contract — these titles are
 * asserted by tests and are what the player reads at the tensest moment of a
 * round. Keeping them together means "what does a caught bluff say?" has one
 * answer.
 */

/**
 * Reveal copy per outcome.
 *
 * NOTE: the single-player reveal speaks in second person ("You found the King")
 * while the multiplayer reveal is narrated about the Dealer. Both phrasings are
 * deliberate and both are shipped — do not unify them.
 */
export const RESULT_COPY: Record<RoundOutcomeKind, OutcomeCopy> = {
  king: { title: "KING FOUND!", subtitle: "You found the King", tone: "victory" },
  wrong: { title: "WRONG CARD", subtitle: "Not the King", tone: "danger" },
  "bluff-caught": {
    title: "BLUFF GUESSED!",
    subtitle: "The accusation was correct",
    tone: "victory",
  },
  "bluff-missed": {
    title: "BLUFF MISSED",
    subtitle: "The accusation was wrong",
    tone: "danger",
  },
  "bluff-worked": {
    title: "DECEPTION!",
    subtitle: "There was no King this round",
    tone: "danger",
  },
  timeout: {
    title: "TIME EXPIRED",
    subtitle: "The King stayed hidden",
    tone: "danger",
  },
};

/**
 * Reveal copy narrated for the online match, where the other player is called
 * "the Dealer" rather than "you".
 */
export const ONLINE_RESULT_COPY: Record<RoundOutcomeKind, OutcomeCopy> = {
  ...RESULT_COPY,
  king: { title: "KING FOUND!", subtitle: "The King was found", tone: "victory" },
  "bluff-worked": {
    title: "DECEPTION!",
    subtitle: "The Dealer played a Bluff",
    tone: "danger",
  },
};

/** Seat-relative phrasing for the turn banner. */
const TURN_COPY = {
  playerGuess: {
    kind: "player",
    title: "YOUR TURN",
    subtitle: "Pick a card before time runs out.",
  },
  playerDealer: {
    kind: "player",
    title: "YOUR TURN",
    subtitle: "Dealer — hide the King.",
  },
  opponentGuess: {
    kind: "opponent",
    title: "OPPONENT'S TURN",
    subtitle: "Waiting for The Rival...",
  },
  opponentDealer: {
    kind: "opponent",
    title: "OPPONENT'S TURN",
    subtitle: "Waiting for The Rival...",
  },
} satisfies Record<string, TurnAnnouncement>;

/**
 * The turn banner for the current phase, or null during phases where neither
 * player is "up" (result, court break, shuffle).
 *
 * A copy is returned rather than the constant so callers can never mutate it.
 */
export function turnAnnouncement(input: {
  phase: MatchPhase;
  dealerIsBot: boolean;
  guesserIsBot: boolean;
}): TurnAnnouncement | null {
  if (input.phase === "guess") {
    return { ...(input.guesserIsBot ? TURN_COPY.opponentGuess : TURN_COPY.playerGuess) };
  }
  if (input.phase === "dealer") {
    return { ...(input.dealerIsBot ? TURN_COPY.opponentDealer : TURN_COPY.playerDealer) };
  }
  return null;
}

/**
 * A stable identity for the current turn.
 *
 * The cinematic turn veil replays only when this key changes, so it must stay
 * `kind:phase`.
 */
export function turnKey(turn: TurnAnnouncement | null, phase: MatchPhase): string | null {
  return turn ? `${turn.kind}:${phase}` : null;
}
