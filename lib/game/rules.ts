import type { ResultKind, RoundResultRecord, Seat } from "@/lib/multiplayer/types";
// NOTE: relative import (not the `@/` alias) because this module is reachable
// from the bare-Node test harness, which cannot resolve path aliases.
import {
  COURTS,
  COURT_COUNT,
  courtAt,
  dealerForRound,
  guesserForRound,
  roundsInCourt,
} from "../../features/game/constants/courts.ts";

export type { ResultKind, RoundResultRecord, Seat };

/**
 * The authoritative round resolver for the online match.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT — DO NOT RESTATE RULES HERE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Courts, round counts and seat assignment are owned by
 * `features/game/constants/courts.ts`. This module re-exports them in the shape
 * the multiplayer services expect (`LEVELS` with an explicit `index`, and the
 * `*SeatFor` aliases) and adds the one thing that is genuinely multiplayer's own:
 * `resolveGuess`, which decides a round from the DEALER's private secret.
 *
 * There is exactly one place to change a card count, a clock, a point value or
 * the dealer rotation: `features/game/constants/courts.ts`.
 */

/** A court, in the shape the multiplayer services consume. */
export interface LevelConfig {
  index: number;
  name: string;
  cards: number;
  /** Rounds in the court (both players' hides, i.e. `hidesPerPlayer * 2`). */
  rounds: number;
  seconds: number;
  points: number;
}

/** The courts with an explicit zero-based index, derived from the source table. */
export const LEVELS: LevelConfig[] = COURTS.map((court, index) => ({
  index,
  name: court.name,
  cards: court.cards,
  rounds: court.hidesPerPlayer * 2,
  seconds: court.seconds,
  points: court.points,
}));

/**
 * Rounds in a level. NOT a single number: each court declares how many times
 * EACH player hides, so the three levels run 14, 10 and 6 rounds respectively
 * (7/5/3 hides per player, times two). Kept as a function so no caller can
 * assume the courts share a length.
 */
export function roundsPerLevel(level: number): number {
  return roundsInCourt(level);
}
export const LEVEL_COUNT = COURT_COUNT;
export const TOTAL_ROUNDS = COURTS.reduce(
  (total, _court, index) => total + roundsInCourt(index),
  0,
);

/** The court for a zero-based index, clamped to the table. */
export function levelConfig(index: number): LevelConfig {
  const clamped = Math.max(0, Math.min(LEVEL_COUNT - 1, index));
  const court = courtAt(clamped);
  return {
    index: clamped,
    name: court.name,
    cards: court.cards,
    rounds: court.hidesPerPlayer * 2,
    seconds: court.seconds,
    points: court.points,
  };
}

/**
 * Dealer seat for a given round in the CLASSIC online match.
 *
 * Classic online play always alternates the dealer every round (seat
 * (round-1) % 2, with the round resetting to 1 each court), so it passes
 * block = 1 to the shared rotation. The single-player game uses the DEFAULT
 * per-court blocked rotation from the same function, so the two can never drift
 * into two separate copies of the formula.
 */
export function dealerSeatFor(round: number): Seat {
  return dealerForRound(round, 1);
}

export function guesserSeatFor(round: number): Seat {
  return guesserForRound(round, 1);
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
