import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { ensureSignedIn } from "@/lib/firebase/auth";
import {
  createRoom,
  joinRoom,
  watchRoom,
  bindPresence,
  leaveRoom,
  applyRoomSettings,
} from "@/services/roomService";
import {
  watchGame,
  dealerPlaces,
  startGuess as startGuessPhase,
  guesserMoves,
  dealerReveals,
  advanceNext,
  rematchGame,
  publishInspecting,
} from "@/services/multiplayerService";
import { normalizeRoomCode } from "@/lib/multiplayer/roomCode";
import { cleanupMatchmaking } from "@/services/matchmakingService";
import { levelConfig } from "@/lib/game/rules";
import {
  DEFAULT_SETTINGS,
  isClassic,
  type MatchSettings,
} from "@/lib/game/flow";
import type { RoomData, GameState, PlayerEntry } from "@/lib/multiplayer/types";
import { SHUFFLE_GRACE_MS } from "@/lib/multiplayer/types";
import { canPublishGuessInspection } from "@/lib/multiplayer/inspection";

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

  // Draft settings the HOST configures on the create / setup screen before play.
  // Once inside a live room the authoritative settings come from room.settings /
  // game.settings (host-locked) and this draft is unused.
  const [draftSettings, setDraftSettings] = useState<MatchSettings>(DEFAULT_SETTINGS);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [meConnected, setMeConnected] = useState(true);

  const code = session?.code ?? null;

  /** Where the current session began: online search or a code/create room. */
  const originRef = useRef<"search" | "room" | null>(null);
  const [searchOrigin, setSearchOrigin] = useState(false);
  /** Sorted pairKey of the current match (kept for safe post-match cleanup). */
  const pairKeyRef = useRef<string | null>(null);

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
      const res = await createRoom(got, name, draftSettings);
      setBusy(false);
      if (!res.ok) {
        setRoomError("CREATE_ERROR");
        return { ok: false };
      }
      setRoomError(null);
      originRef.current = "room";
      setSearchOrigin(false);
      pairKeyRef.current = null;
      setSession({ code: res.code, uid: got });
      return { ok: true };
    },
    [uid, login, draftSettings],
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
      originRef.current = "room";
      setSearchOrigin(false);
      pairKeyRef.current = null;
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
    originRef.current = null;
    setSearchOrigin(false);
  }, [session, room]);

  /**
   * Attach the session to an EXISTING room (created for us by matchmaking, or
   * joined as an invitee). The room + game subscriptions then take over.
   */
  const attach = useCallback(
    async (code: string, pairKey?: string): Promise<boolean> => {
      const got = uid ?? (await login());
      if (!got) {
        setRoomError("AUTH_ERROR");
        return false;
      }
      setRoomError(null);
      originRef.current = "search";
      setSearchOrigin(true);
      pairKeyRef.current = pairKey ?? null;
      setSession({ code: normalizeRoomCode(code), uid: got });
      return true;
    },
    [uid, login],
  );

  /** Leave the current match and clean up this player's matchmaking record. */
  const discardMatch = useCallback(async () => {
    if (!session) return;
    const isHost = room?.hostId === session.uid;
    await leaveRoom(session.code, session.uid, isHost).catch(() => {});
    // One pool record per searcher, and it is self-owned: clearing it never
    // touches another player's pairing state.
    await cleanupMatchmaking(session.uid).catch(() => {});
    setSession(null);
    setRoom(null);
    setGame(null);
    setRoomError(null);
    originRef.current = null;
    setSearchOrigin(false);
    pairKeyRef.current = null;
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

  /** The opponent's uid, for actions that target the other player (e.g. Add Friend). */
  const opponentUid = useMemo<string | null>(() => {
    if (!room || !uid) return null;
    return room.order?.find((o) => o && o !== uid) ?? null;
  }, [room, uid]);

  /**
   * This player's own display name, as the room recorded it.
   *
   * Needed for actions that write MY name onto someone else's record — the
   * mutual "add friend" mirror edge carries it — so it cannot be read from the
   * opponent. Null until the room has our player entry.
   */
  const myName = useMemo<string | null>(() => {
    if (!uid) return null;
    return room?.players?.[uid]?.name ?? null;
  }, [room, uid]);

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

  /**
   * Leave the "shuffle" (card distribution) beat and start the guesser's clock.
   * Either client may call it; the service guard makes repeat calls harmless.
   */
  const beginGuess = useCallback(async () => {
    if (!session || !game) return false;
    return startGuessPhase(session.code, { level: game.level, round: game.round });
  }, [session, game]);

  /**
   * Publish the acting player's current inspection position (the card they are
   * hovering / aiming at), or clear it with `null`.
   *
   * Called from pointer/aim changes, so it is deliberately cheap and IDEMPOTENT:
   * a pointer that wanders within one card would otherwise fire a write per
   * mousemove. `inspectingRef` remembers the last index WE wrote and swallows a
   * repeat, so the RTDB sees exactly one update per real target change and never
   * a stream of animation frames (Part 10).
   */
  const inspectingRef = useRef<number | null>(null);
  const setInspecting = useCallback(
    (index: number | null) => {
      if (!session || mySeat == null || !game) return;
      if (inspectingRef.current === index) return;
      if (!canPublishGuessInspection(game, mySeat)) return;
      inspectingRef.current = index;
      void publishInspecting(session.code, {
        seat: mySeat,
        level: game.level,
        round: game.round,
        index,
      });
    },
    [session, mySeat, game],
  );

  /**
   * Safety net: if the client that ran the deal animation drops mid-shuffle, the
   * other client still advances the phase once the deal window has elapsed so the
   * match can never stall on the presentation beat.
   */
  useEffect(() => {
    if (!session || !game) return;
    if (game.phase !== "shuffle") return;
    const id = window.setTimeout(
      () => void startGuessPhase(session.code, { level: game.level, round: game.round }),
      SHUFFLE_GRACE_MS,
    );
    return () => window.clearTimeout(id);
  }, [session, game]);

  /**
   * A round / turn change invalidates the last index we published, so forget it
   * here. Without this the dedup guard would treat the first hover of the NEXT
   * round as a repeat and silently drop it.
   */
  useEffect(() => {
    inspectingRef.current = null;
  }, [game?.level, game?.round, game?.actingSeat, game?.phase]);

  const advance = useCallback(async () => {
    if (!session) return false;
    return advanceNext(session.code);
  }, [session]);

  const rematch = useCallback(async () => {
    if (!session) return false;
    return rematchGame(session.code);
  }, [session]);

  /**
   * Host settings control: either set the pre-create draft, or — if a room was
   * already created and is still open (host only, before the 2nd seat fills) —
   * push the new config to the authoritative room/game so the guest observes it.
   */
  const updateSettings = useCallback(
    async (patch: Partial<MatchSettings>) => {
      const next = { ...draftSettings, ...patch };
      setDraftSettings(next);
      if (session && room) {
        // Only meaningful while the host is alone in a fresh room.
        if (room.hostId === session.uid) {
          await applyRoomSettings(session.code, next).catch(() => {});
        }
      }
    },
    [draftSettings, session, room],
  );

  /** Authoritative settings: from the live room/game once present, else the draft. */
  const settings: MatchSettings = useMemo<MatchSettings>(() => {
    return room?.settings ?? game?.settings ?? draftSettings;
  }, [room, game, draftSettings]);

  /** Whether the current (game) configuration uses the optional engine. */
  const useOptionalFlow = useMemo(
    () => !!game && !isClassic(game.settings ?? DEFAULT_SETTINGS),
    [game],
  );

  /** Whether 5-lives mode governs the current match. */
  const livesMode = useMemo(
    () => !!game && (game.settings?.winMode === "lives"),
    [game],
  );

  /** My current lives (authoritative) when lives mode is active. */
  const myLives = useMemo<number | null>(() => {
    if (!livesMode || !game?.lives || mySeat == null) return null;
    return game.lives[mySeat] ?? null;
  }, [livesMode, game, mySeat]);

  /** Opponent's current lives when lives mode is active. */
  const opponentLives = useMemo<number | null>(() => {
    if (!livesMode || !game?.lives || mySeat == null) return null;
    return game.lives[mySeat === 0 ? 1 : 0] ?? null;
  }, [livesMode, game, mySeat]);

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
    myName,
    room,
    game,
    roomError,
    clearError: () => setRoomError(null),
    busy,
    busyLabel,
    meConnected,
    opponent: opponent?.name || null,
    opponentUid,
    opponentConnected: opponent?.connected ?? true,
    amDealer,
    myTurnToAct,
    guessSeconds,
    // --- settings & lives (new rules) ---
    draftSettings,
    settings,
    updateSettings,
    useOptionalFlow,
    livesMode,
    myLives,
    opponentLives,
    create,
    join,
    attach,
    discardMatch,
    leave,
    hideCard,
    beginGuess,
    guess,
    setInspecting,
    advance,
    rematch,
    copyCode,
    shareInvite,
    // --- disconnection / auto re-search ---
    searchOrigin,
  };
}
