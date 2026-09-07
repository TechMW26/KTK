import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { ensureSignedIn } from "@/lib/firebase/auth";
import {
  createRoom,
  joinRoom,
  watchRoom,
  bindPresence,
  leaveRoom,
} from "@/services/roomService";
import {
  watchGame,
  dealerPlaces,
  guesserMoves,
  dealerReveals,
  advanceNext,
  rematchGame,
} from "@/services/multiplayerService";
import { normalizeRoomCode } from "@/lib/multiplayer/roomCode";
import { levelConfig } from "@/lib/game/rules";
import type { RoomData, GameState, PlayerEntry } from "@/lib/multiplayer/types";

/**
 * Multiplayer session hook.
 * Owns one online session: anonymous auth, room membership, presence +
 * reconnection, and the authoritative room/game subscriptions from Firebase.
 * The UI renders purely from what this hook returns. All DB access is centralised
 * behind the room/multiplayer services.
 */
export default function useMultiplayer() {
  const configured = isFirebaseConfigured();

  const [uid, setUid] = useState<string | null>(null);
  const [session, setSession] = useState<{ code: string; uid: string } | null>(null);

  const [room, setRoom] = useState<RoomData | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [meConnected, setMeConnected] = useState(true);

  const code = session?.code ?? null;
  const myUid = session?.uid ?? null;

  // ------------------------------------------------------------------
  // 1) Anonymous sign-in
  // ------------------------------------------------------------------
  const login = useCallback(async (): Promise<string | null> => {
    if (!configured) {
      setRoomError("NOT_CONFIGURED");
      return null;
    }
    try {
      const got = await ensureSignedIn();
      setUid(got);
      return got;
    } catch {
      setRoomError("AUTH_ERROR");
      return null;
    }
  }, [configured]);

  // ------------------------------------------------------------------
  // 2) Member of a house: subscribe to room + game + presence
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!session) return;
    const { code: c, uid: u } = session;

    const offRoom = watchRoom(c, (r) => {
      if (!r) setRoomError("GONE"); // deleted / expired room
      setRoom(r);
    });
    const offGame = watchGame(c, (g) => setGame(g));
    const releasePresence = bindPresence(c, u, {
      onConnection: (connected) => setMeConnected(connected),
    });

    return () => {
      offRoom();
      offGame();
      releasePresence();
      setRoom(null);
      setGame(null);
      setMeConnected(true);
    };
  }, [session]);

  // ------------------------------------------------------------------
  // 3) Room creation & joining
  // ------------------------------------------------------------------
  const create = useCallback(
    async (name: string): Promise<{ ok: boolean }> => {
      setBusy(true);
      setBusyLabel("Building the arena…");
      const got = uid ?? (await login());
      if (!got) {
        setBusy(false);
        return { ok: false };
      }
      const res = await createRoom(got, name);
      setBusy(false);
      if (!res.ok) {
        setRoomError("CREATE_ERROR");
        return { ok: false };
      }
      setRoomError(null);
      setSession({ code: res.code, uid: got });
      return { ok: true };
    },
    [uid, login],
  );

  const join = useCallback(
    async (rawCode: string, name: string): Promise<{ ok: boolean }> => {
      const normalized = normalizeRoomCode(rawCode);
      setBusy(true);
      setBusyLabel("Entering the arena…");
      const got = uid ?? (await login());
      if (!got) {
        setBusy(false);
        return { ok: false };
      }
      const res = await joinRoom(normalized, got, name);
      setBusy(false);
      if (!res.ok) {
        setRoomError(res.reason);
        return { ok: false };
      }
      setRoomError(null);
      setSession({ code: res.code, uid: got });
      return { ok: true };
    },
    [uid, login],
  );

  const leave = useCallback(async () => {
    if (!session) return;
    const isHost = room?.hostId === session.uid;
    await leaveRoom(session.code, session.uid, isHost).catch(() => {});
    setSession(null);
    setRoom(null);
    setGame(null);
    setRoomError(null);
  }, [session, room]);

  // ------------------------------------------------------------------
  // 4) Derived facts
  // ------------------------------------------------------------------
  const mySeat = useMemo<0 | 1 | null>(() => {
    if (!room || !uid) return null;
    const idx = room.order?.indexOf(uid) ?? -1;
    return idx === 0 || idx === 1 ? idx : null;
  }, [room, uid]);

  /** handle for who the room's host is from the perspective of the other seat. */
  const opponent = useMemo<PlayerEntry | null>(() => {
    if (!room) return null;
    const other = room.order?.find((o) => o && o !== uid) ?? null;
    if (other && room.players?.[other]) return room.players[other];
    const fallback = Object.values(room.players ?? {}).find((p) => p && p.seat !== mySeat);
    return fallback ?? null;
  }, [room, uid, mySeat]);

  const amDealer = !!game && game.dealerSeat === mySeat && mySeat != null;
  const myTurnToAct = !!game && game.actingSeat === mySeat && mySeat != null;
  const guessSeconds = game ? levelConfig(game.level).seconds : null;

  // ------------------------------------------------------------------
  // 5) Auto game-drive -- reveal when I'm the acting Dealer w/ a pending guess
  //    (idempotent; the service aborts the write if another already resolved).
  // ------------------------------------------------------------------
  const revealKey = useRef<string>("");
  useEffect(() => {
    if (!session || !game || mySeat == null) return;
    const g = game;
    if (g.phase === "reveal" && g.actingSeat === mySeat && g.pendingGuess && !g.lastResult) {
      const key = `${g.level}.${g.round}.${g.pendingGuess.guesserSeat}`;
      if (revealKey.current === key) return;
      revealKey.current = key;
      void dealerReveals(session.code, session.uid, {
        dealerSeat: mySeat,
        level: g.level,
        round: g.round,
      }).finally(() => setTimeout(() => (revealKey.current = ""), 400));
    }
  }, [session, game, mySeat]);

  // ------------------------------------------------------------------
  // 6) Actions the UI calls
  // ------------------------------------------------------------------
  const hideCard = useCallback(
    async (kingIndex: number | null, isBluff: boolean) => {
      if (!session || mySeat == null || !game) return false;
      return dealerPlaces(session.code, session.uid, {
        seat: mySeat,
        isBluff,
        kingIndex,
        level: game.level,
        round: game.round,
        cards: levelConfig(game.level).cards,
      });
    },
    [session, mySeat, game],
  );

  const guess = useCallback(
    async (cardIndex: number | null, calledBluff: boolean) => {
      if (!session || mySeat == null || !game) return false;
      return guesserMoves(session.code, session.uid, {
        guesserSeat: mySeat,
        level: game.level,
        round: game.round,
        cards: levelConfig(game.level).cards,
        guess: { cardIndex, calledBluff },
      });
    },
    [session, mySeat, game],
  );

  const advance = useCallback(async () => {
    if (!session) return false;
    return advanceNext(session.code);
  }, [session]);

  const rematch = useCallback(async () => {
    if (!session) return false;
    return rematchGame(session.code);
  }, [session]);

  const copyCode = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, [code]);

  const shareInvite = useCallback(async () => {
    if (!code) return;
    const text = `Join my KILL THE KING match with room code ${code}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "KILL THE KING", text });
        return;
      } catch {
        /* cancelled -> fall through to clipboard */
      }
    }
    await copyCode();
  }, [code, copyCode]);

  return {
    configured,
    uid,
    code,
    mySeat,
    room,
    game,
    roomError,
    clearError: () => setRoomError(null),
    busy,
    busyLabel,
    meConnected,
    opponent: opponent?.name || null,
    opponentConnected: opponent?.connected ?? true,
    amDealer,
    myTurnToAct,
    guessSeconds,
    create,
    join,
    leave,
    hideCard,
    guess,
    advance,
    rematch,
    copyCode,
    shareInvite,
  };
}
