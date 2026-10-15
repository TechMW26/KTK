import {
  child,
  ref,
  get,
  set,
  update,
  onDisconnect,
  onValue,
  onChildChanged,
  serverTimestamp,
  runTransaction,
  type Database,
  type Unsubscribe,
  type DataSnapshot,
} from "firebase/database";
import { getRTDatabase } from "@/lib/firebase/database";
import { nameOrUnknown } from "@/lib/multiplayer/displayName";
import { roomRef, playersRef, playerRef, gameRef } from "@/lib/multiplayer/paths";
import { generateRoomCode, normalizeRoomCode } from "@/lib/multiplayer/roomCode";
import { emptyGame } from "@/services/multiplayerService";
import {
  DEFAULT_SETTINGS,
  type MatchSettings,
} from "@/lib/game/flow";
import {
  MATCH_TIMEOUT_MS,
  type RoomData,
  type PlayerEntry,
  type Seat,
} from "@/lib/multiplayer/types";

/**
 * Room lifecycle service: create / join / watch / presence / leave.
 * Every race-prone write uses a guarded Firebase transaction. This module only
 * ever talks to Firebase — no UI.
 */

export type CreateRoomResult = { ok: true; code: string } | { ok: false; reason: string };
type JoinRoomReason = "NOT_FOUND" | "FULL" | "STARTED" | "EXPIRED";
export type JoinRoomResult =
  | { ok: true; code: string }
  | { ok: false; reason: JoinRoomReason | "ERROR" };

const MAX_CODE_ATTEMPTS = 8;

function db(): Database {
  const instance = getRTDatabase();
  if (!instance) throw new Error("FIREBASE_NOT_CONFIGURED");
  return instance;
}

/** True when a room snapshot is older than the idle-expiry budget. */
function isExpired(room: RoomData | null): boolean {
  const created = room?.createdAt as number | undefined;
  if (!created) return false;
  return Date.now() - created > MATCH_TIMEOUT_MS;
}

/**
 * Create a room as the host (seat 0). The whole room is written inside one
 * transaction targeting rooms/{code}; if the code already exists the write is
 * aborted (committed = false) and we simply retry with a fresh code.
 */
export async function createRoom(
  uid: string,
  name: string,
  settings: MatchSettings = DEFAULT_SETTINGS,
): Promise<CreateRoomResult> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode();
    const now = Date.now();
    const host: PlayerEntry = {
      name: nameOrUnknown(name),
      joinedAt: now,
      connected: true,
      seat: 0,
      isHost: true,
      presence: now,
    };
    const room: RoomData = {
      code,
      hostId: uid,
      status: "waiting",
      createdAt: now,
      updatedAt: serverTimestamp() as never as number,
      order: [uid, null],
      players: { [uid]: host },
      settings,
    };
    try {
      const result = await runTransaction(
        roomRef(db(), code),
        (raw) => (raw ? undefined : room),
        { applyLocally: false },
      );
      if (result.committed) {
        // Initialise the authoritative game state so the match can start as
        // soon as the second player joins. The engine mirrors the config.
        await set(gameRef(db(), code), emptyGame(settings)).catch(() => {});
        return { ok: true, code };
      }
    } catch {
      return { ok: false, reason: "ERROR" };
    }
  }
  return { ok: false, reason: "ROOM_CODE_EXHAUSTED" };
}

/**
 * (Re)store the match config on an existing (not-yet-started) room and align its
 * authoritative game node to that config. Only meaningful while only the host is
 * present / before the match begins. Kept fire-and-forget friendly.
 */
export async function applyRoomSettings(code: string, settings: MatchSettings): Promise<boolean> {
  const database = db();
  const normalized = normalizeRoomCode(code);
  if (!normalized) return false;
  try {
    const r = roomRef(database, normalized);
    const snap = await get(r);
    const current = snap.val() as RoomData | null;
    if (!current) return false;
    if (Object.values(current.players ?? {}).filter((p) => p && p.seat != null).length >= 2) {
      // already a live match — settings are locked
      return false;
    }
    await update(r, { settings, updatedAt: serverTimestamp() as never as number });
    await set(gameRef(database, normalized), emptyGame(settings)).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Classify why a join could not proceed. Returns "OK" if it can proceed. */
function classifyRoom(room: RoomData | null): JoinRoomReason | "OK" {
  if (!room) return "NOT_FOUND";
  if (isExpired(room)) return "EXPIRED";
  if (room.status === "finished") return "STARTED";
  const occupied = Object.values(room.players ?? {}).filter((p) => p?.seat === 0 || p?.seat === 1).length;
  if (occupied >= 2) return "FULL";
  return "OK";
}

/**
 * Join a room as Player 2.
 *
 * The write is performed as a targeted update on the specific keys the joined
 * player is allowed to touch by the RTDB rules (their own `players/{uid}` entry,
 * their `order/<seat>` slot and `status`), because a whole-node atomic
 * transaction also rewrites values a guest may not modify (hostId etc.) and is
 * rejected by fine-grained rules. A read-then-update keeps two guests from both
 * filling the room in the common case.
 */
export async function joinRoom(codeRaw: string, uid: string, name: string): Promise<JoinRoomResult> {
  const code = normalizeRoomCode(codeRaw);
  if (code.length === 0) return { ok: false, reason: "NOT_FOUND" };
  const database = db();
  const r = roomRef(database, code);

  try {
    // 1) Read current state (the SDK reliably reads here).
    const snap = await get(r);
    const current = snap.val() as RoomData | null;
    const verdict = classifyRoom(current);
    if (verdict !== "OK") {
      // classifyRoom already distinguishes FULL from the other refusals, so the
      // verdict is returned as-is. (This previously tested `verdict === "OK"`
      // here, which can never be true inside the branch.)
      return { ok: false, reason: verdict };
    }
    if (current!.players?.[uid]) {
      // Already a member (reconnect) - treat as success.
      return { ok: true, code };
    }

    // 2) Decide the seat: rooms are always created with a host on seat 0, so a
    //    guest takes seat 1. (If no host exists, they claim seat 0 instead.)
    const hostPresent = Boolean(current!.hostId) && Boolean(current!.order?.[0]);
    const seat: Seat = hostPresent ? 1 : 0;
    const entry: PlayerEntry = {
      name: nameOrUnknown(name),      joinedAt: Date.now(),
      connected: true,
      seat,
      isHost: false,
      presence: Date.now(),
    };

    // 3) Targeted update on keys the guest may write under the rules.
    const updates: Record<string, unknown> = {};
    updates[`players/${uid}`] = entry;
    updates[`order/${seat}`] = uid;
    updates.status = "playing";
    await update(r, updates);

    // 4) Ensure the authoritative game node exists so play can begin (rooms
    //    created by older code may not have one yet).
    if (!(current as { game?: unknown } | null)?.game) {
      await set(gameRef(database, code), emptyGame()).catch(() => {});
    }

    return { ok: true, code };
  } catch (error) {
    console.error("joinRoom failed", error);
    return { ok: false, reason: "ERROR" };
  }
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/**
 * Keep this player marked connected, with an onDisconnect to flip it false the
 * instant their RTDB socket drops. Also listens to the SDK's .info/connected
 * and the browser online/offline events so reconnection reflects immediately.
 */
export function bindPresence(
  code: string,
  uid: string,
  opts: { onConnection?: (connected: boolean) => void },
): () => void {
  const database = db();
  const node = playerRef(database, code, uid);

  const setConnected = (connected: boolean) => {
    update(node, { connected, presence: Date.now() }).catch(() => {});
  };

  const heartbeat = window.setInterval(() => {
    update(node, { presence: Date.now() }).catch(() => {});
  }, 20000);

  const onOnline = () => {
    setConnected(true);
    opts.onConnection?.(true);
  };
  const onOffline = () => {
    setConnected(false);
    opts.onConnection?.(false);
  };

  const infoOff = onValue(ref(database, ".info/connected"), (snap) => {
    const connected = snap.val() === true;
    opts.onConnection?.(connected);
    if (connected) {
      onDisconnect(node).update({ connected: false, presence: Date.now() }).catch(() => {});
      setConnected(true);
    }
  });

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    window.clearInterval(heartbeat);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    infoOff();
  };
}

// ---------------------------------------------------------------------------
// Reads / subscribe
// ---------------------------------------------------------------------------

export async function fetchRoom(code: string): Promise<RoomData | null> {
  const snap = await get(roomRef(db(), code));
  return (snap.val() as RoomData) ?? null;
}

export function watchRoom(code: string, onRoom: (room: RoomData | null) => void): Unsubscribe {
  return onValue(roomRef(db(), code), (snap) => onRoom((snap.val() as RoomData) ?? null));
}

export function watchPlayers(
  code: string,
  onPlayers: (players: Record<string, PlayerEntry>) => void,
): Unsubscribe {
  const players = playersRef(db(), code);
  const listener = (snap: DataSnapshot) => onPlayers((snap.val() as Record<string, PlayerEntry>) ?? {});
  const offA = onValue(players, listener);
  const offB = onChildChanged(players, listener);
  return () => {
    offA();
    offB();
  };
}

// ---------------------------------------------------------------------------
// Leave / housekeeping
// ---------------------------------------------------------------------------

/** Remove the player from the room; if the host leaves, mark the room expired. */
export async function leaveRoom(code: string, uid: string, isHost: boolean): Promise<void> {
  const database = db();
  const r = roomRef(database, code);
  try {
    await runTransaction(
      r,
      (raw) => {
        const current = raw as RoomData | null;
        if (!current) return undefined;
        const players = { ...(current.players ?? {}) } as Record<string, PlayerEntry>;
        const order = [...((current.order as (string | null)[]) ?? [null, null])];
        delete players[uid];
        const remaining = Object.keys(players).length;
        const shouldExpire = remaining === 0 || (isHost && current.status !== "finished");
        return {
          ...current,
          players,
          order: order.map((v) => (v === uid ? null : v)),
          status: shouldExpire ? "expired" : current.status,
          updatedAt: serverTimestamp() as never as number,
        };
      },
      { applyLocally: false },
    );
  } catch {
    // ignore — presence cleanup underneath is best-effort anyway
  }
  await set(playerRef(database, code, uid), null).catch(() => {});
}

/**
 * Send a sticker to the room: overwrites this player's last sticker, so the
 * node never grows. Best-effort — a lost sticker is not worth an error.
 */
export async function sendRoomSticker(code: string, uid: string, stickerId: string): Promise<void> {
  await set(child(roomRef(db(), code), `stickers/${uid}`), { id: stickerId, at: Date.now() }).catch(() => {});
}