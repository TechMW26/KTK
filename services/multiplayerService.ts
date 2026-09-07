import {
  get,
  onValue,
  set,
  runTransaction,
  type Database,
  type Unsubscribe,
  type DataSnapshot,
} from "firebase/database";
import { getRTDatabase } from "@/lib/firebase/database";
import { gameRef, roomRef, secretChildRef } from "@/lib/multiplayer/paths";
import {
  resolveGuess,
  levelConfig,
  dealerSeatFor,
  guesserSeatFor,
  ROUNDS_PER_LEVEL,
  LEVEL_COUNT,
  type GuessInput,
} from "@/lib/game/rules";
import {
  type Seat,
  type GameState,
  type RoomPlayerSecret,
  type PlayerEntry,
} from "@/lib/multiplayer/types";

/**
 * Online game-drive service (authoritative state lives in the room's `game`
 * node; transitions are committed with guarded Firebase transactions using the
 * promise-based RTDB API). Game rules live in lib/game/rules.ts and are shared
 * with single-player.
 */

function db(): Database {
  const instance = getRTDatabase();
  if (!instance) throw new Error("FIREBASE_NOT_CONFIGURED");
  return instance;
}

export function secretKey(level: number, round: number): string {
  return `${level}.${round}`;
}

export function emptyGame(): GameState {
  return {
    status: "in-progress",
    level: 0,
    round: 1,
    scores: [0, 0],
    bluffsUsed: [false, false],
    phase: "dealer-hide",
    actingSeat: 0,
    dealerSeat: 0,
    pendingGuess: null,
    lastResult: null,
    awaitingNext: false,
    winnerSeat: null,
    seq: 0,
  };
}

export async function readGame(code: string): Promise<GameState | null> {
  return ((await get(gameRef(db(), code))).val() as GameState) ?? null;
}

export async function getMySeat(code: string, uid: string): Promise<Seat | null> {
  const val = ((await get(roomRef(db(), code))).val() as { order?: (string | null)[] } | null);
  const idx = val?.order?.indexOf(uid) ?? -1;
  return idx === 0 || idx === 1 ? (idx as Seat) : null;
}

export async function readRoomPlayers(code: string): Promise<Record<string, PlayerEntry> | null> {
  return ((await get(roomRef(db(), code))).val() as { players?: Record<string, PlayerEntry> } | null)
    ?.players ?? null;
}

export function watchGame(code: string, cb: (game: GameState | null) => void): Unsubscribe {
  return onValue(gameRef(db(), code), (snap: DataSnapshot) => cb((snap.val() as GameState) ?? null));
}

/** Guarded transition -> true only if this write actually committed. */
async function commit(
  code: string,
  guard: (cur: GameState) => boolean,
  compute: (cur: GameState) => GameState,
): Promise<boolean> {
  const g = gameRef(db(), code);
  try {
    const result = await runTransaction(
      g,
      (raw) => {
        const cur = (raw as GameState) ?? emptyGame();
        if (!guard(cur)) return undefined; // abort: someone else already handled it
        return compute(cur);
      },
      { applyLocally: false },
    );
    return result.committed;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dealer
// ---------------------------------------------------------------------------

/**
 * Dealer records their private secret (rooms/.. /secrets/{uid}/{level.round}),
 * then advances the shared game from "dealer-hide" to "guess".
 */
export async function dealerPlaces(
  code: string,
  uid: string,
  args: {
    seat: Seat;
    isBluff: boolean;
    kingIndex: number | null;
    level: number;
    round: number;
    cards: number;
  },
): Promise<boolean> {
  if (args.isBluff && args.kingIndex !== null) return false;
  if (!args.isBluff) {
    if (args.kingIndex === null) return false;
    if (args.kingIndex < 0 || args.kingIndex >= args.cards) return false;
  }

  const key = secretKey(args.level, args.round);
  const secret: RoomPlayerSecret = {
    kingIndex: args.isBluff ? null : args.kingIndex,
    isBluff: args.isBluff,
    round: args.round,
    level: args.level,
    placed: true,
  };
  await set(secretChildRef(db(), code, uid, key), secret).catch(() => {});

  return commit(
    code,
    (cur) =>
      cur.phase === "dealer-hide" &&
      cur.actingSeat === args.seat &&
      cur.round === args.round &&
      cur.level === args.level &&
      (args.isBluff ? !cur.bluffsUsed[args.seat] : true),
    (cur) => ({
      ...cur,
      bluffsUsed: args.isBluff
        ? (cur.bluffsUsed.map((v, i) => (i === args.seat ? true : v)) as [boolean, boolean])
        : cur.bluffsUsed,
      phase: "guess",
      actingSeat: guesserSeatFor(args.round),
    }),
  );
}

// ---------------------------------------------------------------------------
// Guesser
// ---------------------------------------------------------------------------

/** Guesser picks or calls Bluff -> writes a pending guess; phase -> reveal. */
export async function guesserMoves(
  code: string,
  uid: string,
  args: {
    guesserSeat: Seat;
    level: number;
    round: number;
    cards: number;
    guess: GuessInput;
  },
): Promise<boolean> {
  if (args.guess.calledBluff && args.guess.cardIndex !== null) return false;
  if (!args.guess.calledBluff && args.guess.cardIndex !== null) {
    if (args.guess.cardIndex < 0 || args.guess.cardIndex >= args.cards) return false;
  }
  return commit(
    code,
    (cur) =>
      cur.phase === "guess" &&
      cur.actingSeat === args.guesserSeat &&
      cur.round === args.round &&
      cur.level === args.level &&
      !cur.pendingGuess,
    (cur) => ({
      ...cur,
      pendingGuess: {
        fromUid: uid,
        cardIndex: args.guess.cardIndex,
        calledBluff: args.guess.calledBluff,
        guesserSeat: args.guesserSeat,
      },
      phase: "reveal",
      actingSeat: dealerSeatFor(args.round),
    }),
  );
}

// ---------------------------------------------------------------------------
// Dealer reveal
// ---------------------------------------------------------------------------

/** Dealer resolves a pending guess against their own private secret. */
export async function dealerReveals(
  code: string,
  uid: string,
  args: { dealerSeat: Seat; level: number; round: number },
): Promise<boolean> {
  const key = secretKey(args.level, args.round);
  const secretSnap = await get(secretChildRef(db(), code, uid, key));
  const secret = secretSnap.val() as RoomPlayerSecret | null;
  if (!secret || !secret.placed) return false;

  return commit(
    code,
    (cur) =>
      cur.phase === "reveal" &&
      cur.actingSeat === args.dealerSeat &&
      cur.level === args.level &&
      cur.round === args.round &&
      !!cur.pendingGuess &&
      !cur.lastResult,
    (cur) => {
      const pending = cur.pendingGuess!;
      const points = levelConfig(args.level).points;
      const result = resolveGuess({
        level: args.level,
        round: args.round,
        points,
        dealerSeat: args.dealerSeat,
        secret: { isBluff: secret.isBluff, kingIndex: secret.kingIndex },
        guess: { cardIndex: pending.cardIndex, calledBluff: pending.calledBluff },
      });
      return {
        ...cur,
        scores: cur.scores.map((v, i) => (i === result.winnerSeat ? v + result.points : v)) as [number, number],
        lastResult: result,
        pendingGuess: null,
        awaitingNext: true,
        phase: "reveal",
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Progression (reveal / level-end / match-end)
// ---------------------------------------------------------------------------

/**
 * Either seated player may press "Next" on reveal/level screens; the guard
 * means only the first accepted press wins and both clients converge.
 */
export async function advanceNext(code: string): Promise<boolean> {
  return commit(
    code,
    (cur) =>
      cur.status !== "finished" &&
      (cur.phase === "reveal" || cur.phase === "level-end") &&
      (cur.phase === "level-end" || cur.awaitingNext),
    (cur) => {
      if (cur.phase === "level-end") {
        return {
          ...cur,
          round: 1,
          level: cur.level + 1,
          lastResult: null,
          pendingGuess: null,
          awaitingNext: false,
          bluffsUsed: [false, false],
          phase: "dealer-hide",
          dealerSeat: dealerSeatFor(1),
          actingSeat: dealerSeatFor(1),
        };
      }
      const isLastRoundOfLevel = cur.round >= ROUNDS_PER_LEVEL;
      if (isLastRoundOfLevel && cur.level >= LEVEL_COUNT - 1) {
        const s = cur.scores;
        return {
          ...cur,
          phase: "match-end",
          status: "finished",
          pendingGuess: null,
          awaitingNext: false,
          lastResult: null,
          winnerSeat: s[0] === s[1] ? null : ((s[0] > s[1] ? 0 : 1) as Seat),
        };
      }
      if (isLastRoundOfLevel) {
        return {
          ...cur,
          phase: "level-end",
          pendingGuess: null,
          awaitingNext: true,
          lastResult: null,
        };
      }
      const nextRound = cur.round + 1;
      return {
        ...cur,
        round: nextRound,
        lastResult: null,
        pendingGuess: null,
        awaitingNext: false,
        phase: "dealer-hide",
        dealerSeat: dealerSeatFor(nextRound),
        actingSeat: dealerSeatFor(nextRound),
      };
    },
  );
}

/** Reset the game to a fresh match (used from the match-end rematch screen). */
export async function rematchGame(code: string): Promise<boolean> {
  return commit(code, (cur) => cur.status === "finished", () => emptyGame());
}
