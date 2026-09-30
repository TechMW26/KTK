/**
 * Shared types for the 2-player online multiplayer mode.
 *
 * Multiplayer is an ADDITIVE feature layered on the existing KILL THE KING
 * single-player game. It re-uses the exact same visual identity, button /
 * modal / card CSS, level & timing constants and round rules. The authoritative
 * room + game state live in Firebase Realtime Database; clients only ever write
 * moves / their own (seat-private) secret and react to the synced state.
 */

import type {
  MatchSettings,
  TurnOrder,
  WinMode,
} from "@/lib/game/flow";

export type { MatchSettings, TurnOrder, WinMode };

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
  /**
   * Locked-in match configuration chosen by the host on the setup screen.
   * Persisted on the ROOM (not only game) so the host may review it before the
   * match begins and both clients observe the same locked config.
   */
  settings?: MatchSettings;
  /** Seats held by player uid in order: [p0Uid, p1Uid] (second may be null). */
  order: (string | null)[];
  /** uids -> player meta. */
  players: Record<string, PlayerEntry>;
  /**
   * Whether the host has locked the settings and "started" (filled the room).
   * While false a joining guest stays on the settings screen instead of blind
   * entering play. Mirrors a pre-game lobby.
   */
  ready?: boolean;
}

/** Authoritative game "phase" of a round, mirroring the single-player flow. */
export type GamePhase =
  | "await-start"
  | "dealer-hide"
  /**
   * The Dealer has locked in their choice and the illustrated Dealer hand is
   * sweeping the table, dealing the cards into their slots. Purely a presentation
   * beat (the same `dealer-hand-rig` + `flying-deal-card` choreography the
   * single-player shuffle stage uses) that both clients replay identically before
   * the Guesser's clock starts. Nobody acts during it.
   */
  | "shuffle"
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
 *
 * Two engine flavours share this one shape:
 *  - CLASSIC  (settings.winMode === "classic" && turnOrder === "alternate", the
 *    opt-in "Alternate Turns" format): the scored 3-court game. `level` 0..2,
 *    `round` 1..10 resets each level, the dealer alternates every round.
 *  - OPTIONAL (any other config: the default Complete Turns, and/or 5-lives):
 *    an additive continuous engine of RULESET_ROUNDS (20) hiding rounds.
 *    `round` runs 1..20 continuously, `level` is derived from the hiding round
 *    via flow.courtForHidingRound to reuse the court/card/timing visuals, the
 *    dealer is decided by flow.dealerForHidingRound(turnOrder), and lives (when
 *    enabled) decide the winner.
 */
export interface GameState {
  status: "in-progress" | "finished";
  /** Level index 0..2 -> card count / time / points (per hiding round in optional). */
  level: number;
  /**
   * Round. CLASSIC: 1..10 within the current level. OPTIONAL: continuous global
   * hiding round 1..RULESET_ROUNDS.
   */
  round: number;
  /** Live score per seat (kept for flavour; decides classic winner). */
  scores: [number, number];
  /**
   * Per-seat flag whether that seat already used its current bluff budget.
   * CLASSIC: one per level. OPTIONAL: refreshed at court (deck) boundaries.
   */
  bluffsUsed: [boolean, boolean];
  phase: GamePhase;
  /**
   * Seat that is expected to act right now.
   */
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
  /**
   * Persisted reveal so both clients replay the same result after reconnect.
   */
  lastResult: RoundResultRecord | null;
  /**
   * Every COMPLETED round of the match, oldest first, appended by the reveal
   * transition. Both clients read the same list, so the Strategy panel shows
   * identical analytics on both devices and recovers after a reconnect.
   */
  history?: RoundHistoryEntry[];
  /** Whether reveal / level screens expect a "Next" acknowledgement. */
  awaitingNext: boolean;
  /** The full winner seat (set at match-end; null when drawn). */
  winnerSeat: Seat | null;
  /** Monotonic change counter, raised on every accepted transition. */
  seq: number;
  /**
   * Locked-in match rules for this room (absent/legacy rooms treat as classic).
   * Written once by the host before play and immutable thereafter.
   */
  settings?: MatchSettings;
  /**
   * 5-lives mode: remaining lives per seat. Only meaningful when
   * settings.winMode === "lives". Starts [5,5].
   */
  lives?: [number, number];
  /**
   * True for the round currently awaiting its reveal when the King was hidden.
   * Lets both clients / the engine know a found King deduction is expected and
   * prevents a duplicate deduction (see services/multiplayerService).
   */
  kingPendingLife?: boolean;
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
 * One completed round, shaped for the shared Strategy panel.
 *
 * Mirrors `features/game/types/game.ts`'s `RoundHistoryEntry` on purpose so the
 * SAME `summarisePicks` / `picksThisCourt` analytics drive the online panel as
 * the solo one — the strategy read-out is not a second implementation.
 *
 * `level` and `round` are the COURT-RELATIVE values (the online engine counts
 * rounds globally), because the panel charts "what happened in this court".
 */
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
/** How long "Search Online Players" keeps looking before giving up. */
export const MATCHMAKING_TIMEOUT_MS = 30 * 1000;
/** How long a stale matchmaking/host entry is considered alive. */
export const MATCHMAKING_STALE_MS = 10 * 1000;
/**
 * How long we keep waiting on an opponent whose presence has dropped before we
 * treat them as permanently gone (and re-enter matchmaking). Prevents a brief
 * network blip from kicking the remaining player out of a good match.
 */
export const OPPONENT_GRACE_MS = 8 * 1000;

/**
 * Upper bound on the card-distribution ("shuffle") beat. The dealing client
 * advances the phase the moment its animation lands; this is the fallback so a
 * dropped client can never leave the other one stuck watching the Dealer's hand.
 * Must stay ABOVE the animation length (SHUFFLE_MS = 1450ms) plus a little slack.
 */
export const SHUFFLE_GRACE_MS = 2200;

/** A player's live entry under `matchmaking/{uid}` while they search. */
export interface MatchmakingEntry {
  name: string;
  status: "searching" | "matched" | "cancelled";
  joinedAt: number;
  updatedAt: number;
  /** Sorted pairKey of the pair once matched (populated by the claim winner). */
  pairKey?: string;
  /** The other uid in the matched pair (populated by the claim winner). */
  opponentUid?: string;
}

/** Atomic pair-claim record under `matchmakingPairs/{pairKey}`. */
export interface MatchmakingPairEntry {
  /** The SINGLE host who wins the claim and creates the room. */
  hostUid: string;
  /** The invitee (guest). */
  invitedUid: string;
  /** When the claim was made. */
  claimedAt: number;
  /** Room code created by the host after claiming. */
  roomCode?: string;
  /** UIDs of both members (kept for safe cleanup ownership checks). */
  members: string[];
}

/** Host's pairing invitation under `matchmakingHost/{uid}`. */
export interface MatchmakingHostEntry {
  name: string;
  status: "inviting" | "matched" | "cancelled";
  joinedAt: number;
  updatedAt: number;
  /** The room code the host created once a pairing is confirmed. */
  roomCode?: string;
  /** The uid this host has chosen to invite. */
  invitedUid?: string;
}

/** Client-local representation of the matchmaker's lifecycle. */
export type MatchmakingStatus =
  | "idle"
  | "searching"
  | "opponent-found"
  | "no-player"
  | "cancelled"
  | "error";
