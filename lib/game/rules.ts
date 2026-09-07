import type { ResultKind, RoundResultRecord, Seat } from "@/lib/multiplayer/types";

export type { ResultKind, RoundResultRecord, Seat };

/**
 * Pure game-rule constants & helpers for KILL THE KING.
 *
 * These mirror the single-player values exactly (level card counts, timings and
 * points) so online multiplayer plays by the same rules. No UI, no timers, no
 * React here — only pure data + a pure result resolver shared by both clients.
 */

export interface LevelConfig {
  index: number;
  name: string;
  cards: number;
  seconds: number;
  points: number;
}

export const LEVELS: LevelConfig[] = [
  { index: 0, name: "THE COURT", cards: 5, seconds: 20, points: 1 },
  { index: 1, name: "HIGH STAKES", cards: 3, seconds: 15, points: 2 },
  { index: 2, name: "FINAL DUEL", cards: 2, seconds: 9, points: 3 },
];

export const ROUNDS_PER_LEVEL = 10;
export const LEVEL_COUNT = LEVELS.length;
export const TOTAL_ROUNDS = ROUNDS_PER_LEVEL * LEVEL_COUNT;

export function levelConfig(index: number): LevelConfig {
  return LEVELS[Math.max(0, Math.min(LEVEL_COUNT - 1, index))];
}

/**
 * Dealer seat for a given level-round: seat (round-1) % 2 — exactly as the
 * existing single-player match does (round resets to 1 each level).
 */
export function dealerSeatFor(round: number): Seat {
  return ((round - 1) % 2) as Seat;
}

export function guesserSeatFor(round: number): Seat {
  return (1 - dealerSeatFor(round)) as Seat;
}

export interface RoundArgs {
  level: number;
  round: number;
  points: number;
}

export interface DealerSecretInput {
  isBluff: boolean;
  kingIndex: number | null;
}

export interface GuessInput {
  /** Card the guesser selected, or null if none was picked. */
  cardIndex: number | null;
  /** True if the guesser called Bluff instead of picking a card. */
  calledBluff: boolean;
}

/** Outcome when the current guessing player runs out of time. */
export function timeoutResult(args: RoundArgs): RoundResultRecord {
  const dealerSeat = dealerSeatFor(args.round);
  return {
    level: args.level,
    round: args.round,
    kind: "timeout",
    winnerSeat: dealerSeat,
    dealerSeat,
    guesserSeat: (1 - dealerSeat) as Seat,
    pick: null,
    wasBluff: false,
    kingIndex: null,
    points: args.points,
  };
}

/**
 * Compute a round outcome from the authoritative inputs.
 *
 * The DEALER seat owns the secret, so only it may call this for a guess. The
 * guesser never reads the hidden King before the reveal — the dealer's private
 * node (rooms/{code}/secrets/{uid}) is where the King index lives, and RTDB
 * rules keep it invisible to everyone else.
 */
export function resolveGuess(
  args: RoundArgs & {
    dealerSeat: Seat;
    secret: DealerSecretInput;
    guess: GuessInput;
  },
): RoundResultRecord {
  const { level, round, points, dealerSeat, secret, guess } = args;
  const guesserSeat = (1 - dealerSeat) as Seat;

  if (guess.calledBluff) {
    if (secret.isBluff) {
      return {
        level, round, kind: "bluff-caught", winnerSeat: guesserSeat, dealerSeat, guesserSeat,
        pick: null, wasBluff: true, kingIndex: null, points,
      };
    }
    return {
      level, round, kind: "bluff-missed", winnerSeat: dealerSeat, dealerSeat, guesserSeat,
      pick: null, wasBluff: false, kingIndex: secret.kingIndex, points,
    };
  }

  if (guess.cardIndex === null) {
    return {
      level, round, kind: "timeout", winnerSeat: dealerSeat, dealerSeat, guesserSeat,
      pick: null, wasBluff: secret.isBluff, kingIndex: secret.kingIndex, points,
    };
  }

  if (secret.isBluff) {
    return {
      level, round, kind: "bluff-worked", winnerSeat: dealerSeat, dealerSeat, guesserSeat,
      pick: guess.cardIndex, wasBluff: true, kingIndex: null, points,
    };
  }
  if (guess.cardIndex === secret.kingIndex) {
    return {
      level, round, kind: "king", winnerSeat: guesserSeat, dealerSeat, guesserSeat,
      pick: guess.cardIndex, wasBluff: false, kingIndex: secret.kingIndex, points,
    };
  }
  return {
    level, round, kind: "wrong", winnerSeat: dealerSeat, dealerSeat, guesserSeat,
    pick: guess.cardIndex, wasBluff: false, kingIndex: secret.kingIndex, points,
  };
}

/** Presentation metadata per result kind (titles reused for the reveal screen). */
export const RESULT_COPY: Record<ResultKind, { title: string; subtitle: string; tone: string }> = {
  king: { title: "KING FOUND!", subtitle: "The King was found", tone: "victory" },
  wrong: { title: "WRONG CARD", subtitle: "Not the King", tone: "danger" },
  "bluff-caught": { title: "BLUFF GUESSED!", subtitle: "The accusation was correct", tone: "victory" },
  "bluff-missed": { title: "BLUFF MISSED", subtitle: "The accusation was wrong", tone: "danger" },
  "bluff-worked": { title: "DECEPTION!", subtitle: "The Dealer played a Bluff", tone: "danger" },
  timeout: { title: "TIME EXPIRED", subtitle: "The King stayed hidden", tone: "danger" },
};
