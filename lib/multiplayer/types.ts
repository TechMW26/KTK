/**
 * Shared types for the 2-player online multiplayer mode.
 *
 * Multiplayer is an ADDITIVE feature layered on the existing KILL THE KING
 * single-player game. It re-uses the exact same visual identity, button /
 * modal / card CSS, level & timing constants and round rules. The authoritative
 * room + game state live in Firebase Realtime Database; clients only ever write
 * moves / their own (seat-private) secret and react to the synced state.
 */

/** Which seat a player occupies inside a room (matches scores[] indexing). */
export type Seat = 0 | 1;

/** Room lifecycle. */
export type RoomStatus = "waiting" | "playing" | "finished" | "expired";

export interface PlayerEntry {
  /** Player display name. */
  name: string;
  /** ms epoch when the player joined. */
  joinedAt: number;
  /** Whether the player is currently connected (driven by presence). */
  connected: boolean;
  /** Seat the player holds (0 = host/creator, 1 = guest). */
  seat: Seat;
  /** The room creator is the "host". */
  isHost: boolean;
  /** Client-generated token used to keep this client's presence "alive". */
  presence: number;
}

/** Full room record mirroring the `rooms/{code}` path. */
export interface RoomData {
  code: string;
  hostId: string;
  status: RoomStatus;
  createdAt: number;
  updatedAt: number;
  /** Seats held by player uid in order: [p0Uid, p1Uid] (second may be null). */
  order: (string | null)[];
  /** uids -> player meta. */
  players: Record<string, PlayerEntry>;
}

/** Authoritative game "phase" of a round, mirroring the single-player flow. */
export type GamePhase =
  | "await-start"
  | "dealer-hide"
  | "guess"
  | "reveal"
  | "level-end"
  | "match-end";

/** Result kinds, kept identical to the single-player result semantic. */
export type ResultKind =
  | "king"
  | "wrong"
  | "bluff-caught"
  | "bluff-missed"
  | "bluff-worked"
  | "timeout";

/**
 * Public (both-players-visible) authoritative game state for the room.
 * NOTE: it intentionally never contains the active round's hidden King position —
 * that lives only in the dealer seat's PRIVATE secret node (see RoomPlayerSecret).
 */
export interface GameState {
  status: "in-progress" | "finished";
  /** Level index 0..2 -> card count / time / points. */
  level: number;
  /** Round within the level, 1..10. */
  round: number;
  /** Live score per seat. */
  scores: [number, number];
  /**
   * Per-seat flag whether that seat already used its single per-level Bluff.
   * (Mirrors existing "one bluff per level per player".)
   */
  bluffsUsed: [boolean, boolean];
  phase: GamePhase;
  /** Seat that is expected to act right now. */
  actingSeat: Seat;
  /** Seat that is Dealer for the current round. */
  dealerSeat: Seat;
  /** When the guesser acted, pending until the dealer reveals. */
  pendingGuess: {
    fromUid: string;
    cardIndex: number | null;
    calledBluff: boolean;
    guesserSeat: Seat;
  } | null;
  /** Persisted reveal so both clients replay the same result after reconnect. */
  lastResult: RoundResultRecord | null;
  /** Whether reveal / level screens expect a "Next" acknowledgement. */
  awaitingNext: boolean;
  /** The full winner seat (set at match-end; null when drawn). */
  winnerSeat: Seat | null;
  /** Monotonic change counter, raised on every accepted transition. */
  seq: number;
}

export interface RoundResultRecord {
  level: number;
  round: number;
  kind: ResultKind;
  winnerSeat: Seat;
  guesserSeat: Seat;
  dealerSeat: Seat;
  /** Card the guesser selected, or null (timeout / bluff-call with no pick). */
  pick: number | null;
  /** Was the round a Dealer-bluff (no King)? */
  wasBluff: boolean;
  /** Normalised card index (0-based). */
  kingIndex: number | null;
  points: number;
}

/**
 * Seat-private node `rooms/{code}/secrets/{uid}`.
 * Only the owning uid may write & read their own secret through RTDB rules,
 * so a dealer's hidden King is never visible to the guesser.
 */
export interface RoomPlayerSecret {
  /** Index (0..cards-1) where this player hid the King, OR null if bluffing. */
  kingIndex: number | null;
  /** True if this round this seat is using its Bluff (no King placed). */
  isBluff: boolean;
  /** Round this secret belongs to, so stale secrets are not reused. */
  round: number;
  level: number;
  /** Placed flag advances gameplay; guards double-writes. */
  placed: boolean;
}

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROUNDS_PER_LEVEL = 10;
export const MATCH_TIMEOUT_MS = 1000 * 60 * 60; // rooms expire after 1h idle
