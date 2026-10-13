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
import { canPublishGuessInspection } from "@/lib/multiplayer/inspection";
import {
  resolveGuess,
  levelConfig,
  dealerSeatFor,
  guesserSeatFor,
  roundsPerLevel,
  LEVEL_COUNT,
  type GuessInput,
} from "@/lib/game/rules";
import {
  isClassic,
  dealerForHidingRound,
  guesserForHidingRound,
  courtForHidingRound,
  strategyEntryFor,
  applyLivesChange,
  livesVerdict,
  RULESET_ROUNDS,
  START_LIVES,
  DEFAULT_SETTINGS,
  type MatchSettings,
} from "@/lib/game/flow";
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

/** Stable key for a seat's per-round secret room (underscore, not dot: RTDB
 * child keys cannot contain "."). Read and write must use the same key. */
export function secretKey(level: number, round: number): string {
  return `${level}_${round}`;
}

export function emptyGame(settings: MatchSettings = DEFAULT_SETTINGS): GameState {
  const classic = isClassic(settings);
  const livesMode = settings.winMode === "lives";
  const round = 1;
  const level = classic ? 0 : courtForHidingRound(1);
  const dealer = classic ? dealerSeatFor(1) : dealerForHidingRound(1, settings.turnOrder);
  const guesser = classic ? guesserSeatFor(1) : guesserForHidingRound(1, settings.turnOrder);
  const base: GameState = {
    status: "in-progress",
    level,
    round,
    scores: [0, 0],
    bluffsUsed: [false, false],
    phase: "dealer-hide",
    actingSeat: classic ? dealer : dealer,
    dealerSeat: dealer,
    pendingGuess: null,
    lastResult: null,
    history: [],
    awaitingNext: false,
    winnerSeat: null,
    seq: 0,
    settings,
  };
  if (livesMode) base.lives = [START_LIVES, START_LIVES];
  void guesser;
  return base;
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
// Transient inspection state (presentation only)
// ---------------------------------------------------------------------------

/**
 * Publish (or clear) the acting guesser's current inspection position.
 *
 * This is the one "temporary UI state" the two clients synchronise so the
 * opponent can render the physical hand/card animation. It is intentionally
 * SEPARATE from every gameplay transition:
 *
 *  - it writes a single field and does NOT touch the `seq` counter, so a client
 *    listening for "has the authoritative state moved on?" is not woken by a
 *    hover;
 *  - hiding choices are never accepted here; it refuses to write outside the
 *    guesser's turn, which is what keeps
 *    the invariant "only the acting player can generate an inspection";
 *  - it is guarded on the SAME level/round it was asked for, so a stale write
 *    that races a round change is dropped by the transaction rather than
 *    bleeding an old hand into the next round.
 *
 * `null` clears the inspection (pointer left the row, pick confirmed, etc).
 */
export async function publishInspecting(
  code: string,
  args: { seat: Seat; level: number; round: number; index: number | null },
): Promise<boolean> {
  const clamp =
    args.index === null
      ? null
      : Math.max(0, Math.min(levelConfig(args.level).cards - 1, Math.round(args.index)));
  return commit(
    code,
    (cur) =>
      // A hiding choice is secret, even if an old client tries to publish it.
      canPublishGuessInspection(cur, args.seat) &&
      cur.level === args.level &&
      cur.round === args.round,
    (cur) => ({ ...cur, inspectingCardIndex: clamp }),
  );
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
    (cur) => {
      const classic = isClassic(cur.settings ?? DEFAULT_SETTINGS);
      const actingGuess = classic
        ? guesserSeatFor(args.round)
        : guesserForHidingRound(args.round, (cur.settings ?? DEFAULT_SETTINGS).turnOrder);
      return {
        ...cur,
        bluffsUsed: args.isBluff
          ? (cur.bluffsUsed.map((v, i) => (i === args.seat ? true : v)) as [boolean, boolean])
          : cur.bluffsUsed,
        // Move to the DEAL beat: the cards are distributed by the Dealer hand
        // before the guesser's clock starts. Either client advances it (idempotent).
        phase: "shuffle",
        actingSeat: actingGuess,
        // The dealer's hide turn is over, so release their inspection in the same
        // write (Part 14).
        inspectingCardIndex: null,
      };
    },
  );
}

/**
 * Hand-off from the "shuffle" (card distribution) beat to the guess phase. Called
 * by either client once the deal animation has finished; the guard means only the
 * first accepted call wins, so both clients converge on the same moment even if
 * they have slightly different animation timings.
 */
export async function startGuess(
  code: string,
  args: { level: number; round: number },
): Promise<boolean> {
  return commit(
    code,
    (cur) =>
      cur.phase === "shuffle" &&
      cur.level === args.level &&
      cur.round === args.round,
    (cur) => ({ ...cur, phase: "guess" }),
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
    (cur) => {
      const classic = isClassic(cur.settings ?? DEFAULT_SETTINGS);
      const dealer = classic
        ? dealerSeatFor(args.round)
        : dealerForHidingRound(args.round, (cur.settings ?? DEFAULT_SETTINGS).turnOrder);
      return {
        ...cur,
        pendingGuess: {
          fromUid: uid,
          cardIndex: args.guess.cardIndex,
          calledBluff: args.guess.calledBluff,
          guesserSeat: args.guesserSeat,
        },
        phase: "reveal",
        actingSeat: dealer,
        // The guesser has committed, so their inspection is over: drop the hand
        // in the SAME atomic write that ends their turn, which also covers the
        // race where their client never got to clear it (Part 14).
        inspectingCardIndex: null,
      };
    },
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
      const settings = cur.settings ?? DEFAULT_SETTINGS;
      const classic = isClassic(settings);
      const livesMode = settings.winMode === "lives";
      const points = levelConfig(args.level).points;
      const result = resolveGuess({
        level: args.level,
        round: args.round,
        points,
        dealerSeat: args.dealerSeat,
        secret: { isBluff: secret.isBluff, kingIndex: secret.kingIndex },
        guess: { cardIndex: pending.cardIndex, calledBluff: pending.calledBluff },
      });
      // 5-lives rule: a successfully FOUND hidden King costs its DEALER one life.
      // Deducted exactly once here (guarded reveal commits only a single time).
      let lives: [number, number] | undefined = cur.lives;
      if (livesMode && result.kind === "king") {
        const from = (cur.lives ?? [START_LIVES, START_LIVES]) as [number, number];
        lives = applyLivesChange(from, { kind: result.kind, dealer: result.dealerSeat });
      }
      const next: GameState = {
        ...cur,
        scores: cur.scores.map((v, i) => (i === result.winnerSeat ? v + result.points : v)) as [number, number],
        lastResult: result,
        // Append the round for the Strategy panel (see historyEntryFor). The list
        // is capped at the match length so it can't grow without bound.
        history: [
          ...(cur.history ?? []),
          strategyEntryFor(result, pending.calledBluff, classic),
        ].slice(-RULESET_ROUNDS),
        pendingGuess: null,
        awaitingNext: true,
        phase: "reveal",
        // Round resolved: no hand may remain on the board (Part 14).
        inspectingCardIndex: null,
      };
      if (lives) next.lives = lives;
      return next;
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
      const settings = cur.settings ?? DEFAULT_SETTINGS;
      if (isClassic(settings)) return advanceClassic(cur);
      return advanceOptional(cur, settings);
    },
  );
}

/** Classic (unchanged) scored 3-court progression. */
function advanceClassic(cur: GameState): GameState {
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
      // A new hide round: start with no hand on the board (Part 14).
      inspectingCardIndex: null,
    };
  }
  const isLastRoundOfLevel = cur.round >= roundsPerLevel(cur.level);
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
    inspectingCardIndex: null,
  };
}

/**
 * Optional rules engine (Complete Turns and/or 5-lives).
 *
 * Runs a continuous sequence of RULESET_ROUNDS hides (round 1..N, never resetting
 * per court — courts are presentation only, derived via courtForHidingRound).
 * The dealer is decided purely by the turnOrder. When lives mode is on and a life
 * reaches 0 the match ends immediately with that seat the loser. When the sequence
 * is exhausted, lives (or failing that scores) decide the winner.
 */
function advanceOptional(cur: GameState, settings: MatchSettings): GameState {
  const livesMode = settings.winMode === "lives";
  const lives = (cur.lives ?? [START_LIVES, START_LIVES]) as [number, number];
  // Because we only advance right after a reveal, may already be decided:
  if (livesMode) {
    const verdict = livesVerdict(lives, 0);
    if (verdict.over) {
      return {
        ...cur,
        phase: "match-end",
        status: "finished",
        pendingGuess: null,
        awaitingNext: false,
        lastResult: null,
        winnerSeat: verdict.winner,
      };
    }
  }

  const nextRound = cur.round + 1;
  const lastRoundDone = cur.round >= RULESET_ROUNDS;
  // Determine the winner when the whole sequence is complete.
  const finalVerdict = livesMode
    ? livesVerdict(lives, 0)
    : null;

  if (lastRoundDone) {
    let winnerSeat: Seat | null;
    if (finalVerdict?.over) {
      winnerSeat = finalVerdict.winner;
    } else {
      const s = cur.scores;
      winnerSeat = livesMode
        ? lives[0] === lives[1]
          ? null
          : ((lives[0] > lives[1] ? 0 : 1) as Seat)
        : s[0] === s[1]
          ? null
          : ((s[0] > s[1] ? 0 : 1) as Seat);
    }
    return {
      ...cur,
      phase: "match-end",
      status: "finished",
      pendingGuess: null,
      awaitingNext: false,
      lastResult: null,
      winnerSeat,
    };
  }

  const dealer = dealerForHidingRound(nextRound, settings.turnOrder);
  const nextLevel = courtForHidingRound(nextRound);
  const resetBluffs = nextLevel !== cur.level;
  return {
    ...cur,
    level: nextLevel,
    round: nextRound,
    bluffsUsed: resetBluffs ? [false, false] : cur.bluffsUsed,
    lastResult: null,
    pendingGuess: null,
    awaitingNext: false,
    phase: "dealer-hide",
    dealerSeat: dealer,
    actingSeat: dealer,
    // A new hide round: start with no hand on the board (Part 14).
    inspectingCardIndex: null,
  };
}

/** Reset the game to a fresh match (used from the match-end rematch screen).
 * The rematch keeps the room's locked settings so rules are preserved. */
export async function rematchGame(code: string): Promise<boolean> {
  return commit(code, (cur) => cur.status === "finished", (cur) => {
    // Rebuild a fresh game that honours the locked config of the room.
    const settings = cur.settings ?? DEFAULT_SETTINGS;
    return emptyGame(settings);
  });
}
