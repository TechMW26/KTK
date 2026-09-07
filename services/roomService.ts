import {
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
import { roomRef, playersRef, playerRef } from "@/lib/multiplayer/paths";
import { generateRoomCode, normalizeRoomCode } from "@/lib/multiplayer/roomCode";
import { MATCH_TIMEOUT_MS, type RoomData, type PlayerEntry, type Seat } from "@/lib/multiplayer/types";

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
export async function createRoom(uid: string, name: string): Promise<CreateRoomResult> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode();
    const now = Date.now();
    const host: PlayerEntry = {
      name: name.trim() || "Player 1",
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
    };
    try {
      const result = await runTransaction(
        roomRef(db(), code),
        (raw) => (raw ? undefined : room),
        { applyLocally: false },
      );
      if (result.committed) return { ok: true, code };
    } catch {
      return { ok: false, reason: "ERROR" };
    }
  }
  return { ok: false, reason: "ROOM_CODE_EXHAUSTED" };
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
 * Join a room as Player 2. Seat assignment + flipping the room to "playing" is
 * done inside a single guarded transaction so two guests can never both fill it.
 */
export async function joinRoom(codeRaw: string, uid: string, name: string): Promise<JoinRoomResult> {
  const code = normalizeRoomCode(codeRaw);
  if (code.length === 0) return { ok: false, reason: "NOT_FOUND" };
  const r = roomRef(db(), code);

  try {
    const result = await runTransaction(
      r,
      (raw) => {
        const current = raw as RoomData | null;
        if (!current || isExpired(current) || current.status === "finished") return undefined;
        const players = (current.players ?? {}) as Record<string, PlayerEntry>;
        const order = [...((current.order as (string | null)[]) ?? [null, null])];
        const occupiedSeats = new Set<Seat>();
        Object.values(players).forEach((p) => {
          if (p?.seat === 0 || p?.seat === 1) occupiedSeats.add(p.seat);
        });
        if (occupiedSeats.size >= 2) return undefined; // already full
        const seat: Seat = occupiedSeats.has(0) ? 1 : 0;
        const nextPlayers: Record<string, PlayerEntry> = { ...players };
        nextPlayers[uid] = {
          name: name.trim() || (seat === 0 ? "Player 1" : "Player 2"),
          joinedAt: Date.now(),
          connected: true,
          seat,
          isHost: false,
          presence: Date.now(),
        };
        const nextOrder: (string | null)[] = order.slice(0, 2);
        // If uid already sits somewhere, leave order as-is, else fill a free slot.
        let filled = false;
        for (let i = 0; i < nextOrder.length; i += 1) {
          if (nextOrder[i] === uid) {
            filled = true;
            break;
          }
        }
        if (!filled) {
          for (let i = 0; i < nextOrder.length; i += 1) {
            if (!nextOrder[i]) {
              nextOrder[i] = uid;
              filled = true;
              break;
            }
          }
        }
        if (!filled) return undefined; // no free seat
        const both = nextOrder[0] && nextOrder[1];
        return {
          ...current,
          players: nextPlayers,
          order: nextOrder,
          status: both ? "playing" : current.status,
          updatedAt: serverTimestamp() as never as number,
        };
      },
      { applyLocally: false },
    );

    if (result.committed) return { ok: true, code };

    // Transaction aborted — report why by inspecting the current room.
    const current = (await get(r)).val() as RoomData | null;
    const verdict = classifyRoom(current);
    return { ok: false, reason: verdict === "OK" ? "FULL" : verdict };
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
