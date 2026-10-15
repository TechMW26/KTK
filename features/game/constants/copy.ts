import type { MatchPhase, OutcomeCopy, RoundOutcomeKind, Seat, TurnAnnouncement } from "../types/game.ts";

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
    title: "BLUFF CAUGHT!",
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

/**
 * The reveal copy for one outcome, phrased for WHO it happened to.
 *
 * The stored copy is written in second person ("You found the King") because the
 * single-player board was authored for the case where the human is the guesser.
 * In a vs-bot match the bot guesses too, so that same line would claim the human
 * found a King the bot actually found — the screen would celebrate a loss.
 *
 * This re-phrases ONLY the outcomes that name an actor, and only when the actor
 * is the OTHER side, substituting the real display name. Neutral lines ("The
 * accusation was correct") pass through untouched, and so does the original copy
 * whenever the human is the subject — so nothing the single-player player already
 * reads changes.
 *
 * @param kind        the resolved outcome
 * @param perspective the seat the board is speaking to (the human)
 * @param winnerNames display name per seat, used for the substituted subject
 * @param guesser     seat that guessed this round (the actor for "found the King")
 */
export function revealCopyFor(
  kind: RoundOutcomeKind,
  perspective: Seat,
  winnerNames: [string, string],
  guesser: Seat,
): OutcomeCopy {
  const base = RESULT_COPY[kind];
  if (kind !== "king") return base;
  if (guesser === perspective) return base;
  return { ...base, subtitle: `${winnerNames[guesser]} found the King` };
}

/**
 * The round verdict, told from the viewer's side.
 *
 * The old screen used one fixed title + colour per outcome, so when The Rival
 * picked a WRONG card the board turned RED and said "WRONG CARD" while the bar
 * underneath said "YOU WIN THE ROUND". This names WHO did what, and colours the
 * board by whether the viewer won. `viewerWon = null` (Pass & Play, one shared
 * screen for both players) keeps the outcome's own colour.
 */
export function roundVerdictCopy(input: {
  kind: RoundOutcomeKind;
  guesserName: string;
  dealerName: string;
  viewerWon: boolean | null;
}): OutcomeCopy {
  const g = input.guesserName;
  const kingOf = input.dealerName === "You" ? "your" : `${input.dealerName}'s`;
  const lines: Record<RoundOutcomeKind, { title: string; subtitle: string }> = {
    king: { title: "KING FOUND!", subtitle: `${g} found ${kingOf} King.` },
    wrong: { title: "WRONG CARD", subtitle: `${g} missed — the King was on another card.` },
    "bluff-caught": { title: "BLUFF CAUGHT!", subtitle: `${g} called Bluff — there really was no King.` },
    "bluff-missed": { title: "WRONG ACCUSATION", subtitle: `${g} called Bluff, but the King was there.` },
    "bluff-worked": { title: "IT WAS A BLUFF!", subtitle: `There was no King — ${g} picked an empty card.` },
    timeout: { title: "TIME'S UP", subtitle: `${g} ran out of time. The King stays hidden.` },
  };
  const tone = input.viewerWon === null ? RESULT_COPY[input.kind].tone : input.viewerWon ? "victory" : "danger";
  return { ...lines[input.kind], tone };
}

/**
 * Hint under "HIDE THE KING". It names BOTH steps (tap, then lock), because a
 * player who only taps a card and waits used to lose their choice when the
 * clock ran out. In the last few seconds it switches to an urgent line that
 * says exactly what is still missing: a card, or the LOCK press.
 */
export const HIDE_HINT = {
  normal: "Tap a card, then press LOCK.",
  urgentPick: "Hurry! Tap a card to hide your King!",
  urgentLock: "Hurry! Press LOCK now!",
} as const;

/**
 * What the Dealer is told when the hide clock reaches zero, BEFORE the
 * opponent starts guessing — so the King is never placed silently.
 *
 *  - kept:   the player had tapped a card but not pressed LOCK — we lock THAT card.
 *  - bluff:  the player had chosen Bluff but not pressed LOCK — we lock the bluff.
 *  - random: nothing was chosen — the game picks a card for them.
 */
export type AutoHideKind = "kept" | "bluff" | "random";

export function autoHideCopy(kind: AutoHideKind): { title: string; subtitle: string } {
  if (kind === "bluff") return { title: "BLUFF LOCKED", subtitle: "Time's up! Your Bluff was locked in — no King this round." };
  if (kind === "kept") return { title: "KING LOCKED", subtitle: "Time's up! We locked the card you picked." };
  return { title: "KING AUTO-HIDDEN", subtitle: "Time's up! The game hid your King for you." };
}

/** Seat-relative phrasing for the turn banner. */
const TURN_COPY = {
  playerGuess: {
    kind: "player",
    title: "YOUR TURN",
    subtitle: "Find the King — or call Bluff.",
  },
  playerDealer: {
    kind: "player",
    title: "YOUR TURN",
    subtitle: "Hide your King.",
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
  /** Pass & Play only: who is acting, so a shared phone says WHOSE turn it is. */
  actorName?: string | null;
  /** VS Bot: the bot's name, so the banner says what it is doing. */
  opponentName?: string;
}): TurnAnnouncement | null {
  const rival = input.opponentName ?? "The Rival";
  if (input.phase === "guess") {
    if (input.guesserIsBot) return { ...TURN_COPY.opponentGuess, subtitle: `${rival} is looking for your King…` };
    if (input.actorName) return { kind: "player", title: `${input.actorName.toUpperCase()}'S TURN`, subtitle: "Find the King — or call Bluff." };
    return { ...TURN_COPY.playerGuess };
  }
  if (input.phase === "dealer") {
    if (input.dealerIsBot) return { ...TURN_COPY.opponentDealer, subtitle: `${rival} is hiding the King…` };
    if (input.actorName) return { kind: "player", title: `${input.actorName.toUpperCase()}'S TURN`, subtitle: "Hide your King." };
    return { ...TURN_COPY.playerDealer };
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