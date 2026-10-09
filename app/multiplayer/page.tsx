"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import useMultiplayer from "@/hooks/useMultiplayer";
import { normalizeRoomCode } from "@/lib/multiplayer/roomCode";
import { RESULT_COPY } from "@/lib/game/rules";
import { OPPONENT_GRACE_MS } from "@/lib/multiplayer/types";
import GameView from "./game";
import SearchOnline from "./search";
import { FriendsScreen } from "./friends";
import { MpEyebrow, MpLogo, MpOrnament } from "./ui";

/**
 * Multiplayer entry route.
 *
 * Internal step navigation (join -> waiting -> game) mirrors how the single-
 * player keeps every screen in one page. All Firebase access lives in the hook /
 * services; this file only renders.
 *
 * There is no lobby menu here: every entry point deep-links to exactly the one
 * screen it promises, so the player never lands on a second navigation hub.
 *
 * The home screen deep-links here with a `?mode=` flag:
 *   - `challenge` starts online matchmaking immediately.
 *   - `friends`   opens the Play With Friend list (challenge / create a room).
 *   - `join`      opens the room-code join screen.
 *   - absent      falls back to the room-code join screen.
 */
export default function MultiplayerPage() {
  const mp = useMultiplayer();

  const [name, setName] = useState("");
  const [joinDraft, setJoinDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [searching, setSearching] = useState(false);
  // Incrementing key forces a FRESH SearchOnline (fresh 30s timer + clean refs)
  // every time we (re)enter search — including after an opponent disconnect.
  const [searchKey, setSearchKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  /** Which screen the friends flow owns while no room is active. */
  const [friendsOpen, setFriendsOpen] = useState(false);
  /** True once we have consumed the initial ?mode= flag (guards re-runs). */
  const deepLinkRef = useRef(false);
  /**
   * False until the URL's `?mode=` flag has been read (on mount) and the initial
   * screen chosen. Rendering is held behind a neutral veil while false so a deep
   * link never flashes the fallback screen before the requested one appears.
   */
  const [deepLinkResolved, setDeepLinkResolved] = useState(false);
  /**
   * Where this visit started. A `deepLink` arrival (Challenge / Play With
   * Friend / Room Code from the home screen) backs out to Home. A direct visit
   * to /multiplayer stays on the multiplayer route.
   */
  const [entryOrigin, setEntryOrigin] = useState<"deepLink" | "lobby">("lobby");

  // ------------------------------------------------------------------ states
  const inMatch =
    !!mp.room &&
    mp.room.status === "playing" &&
    (mp.room.order?.filter(Boolean).length ?? 0) >= 2 &&
    mp.mySeat != null &&
    !!mp.game;

  const waiting =
    !!mp.room && !inMatch && mp.room.status !== "finished";
  const noRoom = !mp.room && !mp.code;

  // ------------------------------------------------------------------ actions
  const doCopy = async () => {
    await mp.copyCode();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const create = async () => {
    setBusy("create");
    await mp.create(name);
    setBusy("");
  };

  const join = async () => {
    const code = normalizeRoomCode(joinDraft);
    if (code.length === 0) return;
    setBusy("join");
    await mp.join(code, name);
    setBusy("");
  };

  const leaveToMenu = async () => {
    setSearching(false);
    setFriendsOpen(false);
    setNotice(null);
    await mp.leave();
    setJoinDraft("");
  };

  /** Enter the room the matchmaker created (host pair claim or guest join). */
  const enterRoomFromSearch = async (code: string, pairKey: string) => {
    setSearching(false);
    setNotice(null);
    await mp.attach(code, pairKey);
  };

  /**
   * Back out of matchmaking.
   *
   * A deep-link arrival (Challenge) has no hub in its flow, so backing out
   * returns Home. A non-deep-link arrival stays on the multiplayer route.
   */
  const cancelSearch = async () => {
    setNotice(null);
    if (entryOrigin === "deepLink" && typeof window !== "undefined") {
      window.location.assign("/");
      return;
    }
    setSearching(false);
  };

  /**
   * Leave the Play With Friend screen. Same rule as cancelSearch: a deep-link
   * arrival returns Home, otherwise we stay on the multiplayer route.
   */
  const closeFriends = () => {
    if (entryOrigin === "deepLink" && typeof window !== "undefined") {
      window.location.assign("/");
      return;
    }
    setFriendsOpen(false);
  };

  /**
   * Consume the home-screen deep link on mount.
   *
   * `?mode=challenge` drops straight into matchmaking; `?mode=friends` opens the
   * friends list; `?mode=join` opens the room-code screen. This runs on the FIRST
   * mount (not gated on Firebase init), so the target screen is selected in the
   * same commit that the page first paints — the fallback never flashes in
   * between. The search screen itself waits for `mp.configured` internally, so it
   * is safe to open it before Firebase has finished initialising.
   */
  useEffect(() => {
    if (deepLinkRef.current || typeof window === "undefined") return;
    deepLinkRef.current = true;
    const mode = new URLSearchParams(window.location.search).get("mode");
    // Batch the screen choice and the "resolved" flip in one commit so the
    // target screen is what first paints after the veil.
    if (mode === "challenge") {
      // Mount-time sync from the URL: the deep link owns the initial screen.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL is an external system
      setEntryOrigin("deepLink");
      setSearching(true);
      setSearchKey((k) => k + 1);
      setDeepLinkResolved(true);
      return;
    }
    if (mode === "friends") {
      setEntryOrigin("deepLink");
      setFriendsOpen(true);
      setDeepLinkResolved(true);
      return;
    }
    if (mode === "join") {
      // "ROOM CODE" from home lands on the focused join screen. `noRoom` already
      // selects it, but marking the origin makes Back return Home instead of
      // leaving the player on the multiplayer route they never navigated from.
      setEntryOrigin("deepLink");
      setDeepLinkResolved(true);
      return;
    }
    // No flag: this is a direct visit to /multiplayer. There is no lobby menu to
    // show any more, so fall back to the room-code screen — the one action that
    // still needs a route of its own.
    setDeepLinkResolved(true);
  }, []);

  /** Restart matchmaking with a fresh screen (and therefore a fresh 30s window). */
  const retrySearch = () => {
    setNotice(null);
    setSearchKey((k) => k + 1);
  };

  /** Play With Friend: start a challenge against a chosen friend. */
  const challengeFriend = async () => {
    // Reuse the SAME online matchmaking path: a friend challenge is an online
    // game, so we drop into the existing search rather than a parallel system.
    setFriendsOpen(false);
    setSearching(true);
    setSearchKey((k) => k + 1);
  };

  const openCreateRoom = async (settings: {
    turnOrder: "complete" | "alternate";
    winMode: "classic" | "lives";
  }) => {
    setFriendsOpen(false);
    // `create` reads whatever the host last wrote to draftSettings, so commit the
    // chosen rules first — otherwise the room would open with the previous game's
    // settings.
    await mp.updateSettings(settings);
    await create();
  };

  // ------------------------------------------------------------------
  // Opponent disconnect -> auto re-search (online search games ONLY).
  // A durable (grace-period) opponent absence while a live, UNFINISHED
  // search-origin match is active drops the old room and puts us straight back
  // into a fresh 30s search with "{opponent} left" feedback.
  // ------------------------------------------------------------------
  const oppGraceTimer = useRef<number | undefined>(undefined);
  const rematchFired = useRef(false);

  useEffect(() => {
    if (!mp.searchOrigin) return; // only matchmade games auto re-search
    if (!inMatch || !mp.room) return; // not actively in this room
    // Natural completion / inactive room: NEVER rematch (keep the result flow).
    if (mp.game?.status === "finished" || mp.room.status !== "playing") {
      if (oppGraceTimer.current !== undefined) {
        window.clearTimeout(oppGraceTimer.current);
        oppGraceTimer.current = undefined;
      }
      return;
    }
    // Our own connection is down — give ourselves a reconnect window.
    if (mp.meConnected === false) {
      if (oppGraceTimer.current !== undefined) {
        window.clearTimeout(oppGraceTimer.current);
        oppGraceTimer.current = undefined;
      }
      return;
    }
    if (mp.opponentConnected) {
      rematchFired.current = false;
      return;
    }
    if (rematchFired.current) return; // already scheduled one rematch
    if (oppGraceTimer.current !== undefined) return; // a grace timer is running

    const oppName = mp.opponent ?? "Opponent";
    oppGraceTimer.current = window.setTimeout(() => {
      oppGraceTimer.current = undefined;
      if (rematchFired.current) return;
      rematchFired.current = true;
      // Show the transition + fresh search immediately, then drop the old room.
      setSearching(true);
      setNotice(`${oppName} left… Finding a new player…`);
      setSearchKey((k) => k + 1);
      void mp.discardMatch().catch(() => {});
    }, OPPONENT_GRACE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mp.searchOrigin,
    inMatch,
    mp.room,
    mp.game,
    mp.meConnected,
    mp.opponentConnected,
    mp.opponent,
    mp.discardMatch,
  ]);

  // Clear any dangling grace timer on unmount.
  useEffect(
    () => () => {
      if (oppGraceTimer.current !== undefined) window.clearTimeout(oppGraceTimer.current);
    },
    [],
  );

  // Single-player parity: tint the whole screen with the round result tone while
  // a reveal is on screen (danger/victory), exactly like the solo/2P reveal.
  const revealTone =
    inMatch && mp.game?.phase === "reveal" && mp.game.lastResult
      ? RESULT_COPY[mp.game.lastResult.kind].tone
      : "";

  // ------------------------------------------------------------------ body
  return (
    <main className="game-shell mp">
      <section className={["game-screen", "mp-screen", revealTone].filter(Boolean).join(" ")}>
        {revealTone ? <div className="impact-vignette" /> : null}

        {/* temporary full-screen busy / entrance veil */}
        {busy && (
          <div className="mp-veil">
            <span className="mp-pulse">◖◗</span>
            <p className="eyebrow">PLEASE WAIT</p>
            <MpOrnament />
          </div>
        )}

        {/*
          Hold the first paint behind a neutral veil until the ?mode= deep link
          has been resolved, so a Challenge/Friends/Room-Code deep link shows its
          target screen directly instead of flashing the fallback first.
        */}
        {!deepLinkResolved && (
          <div className="mp-veil">
            <span className="mp-pulse">◖◗</span>
            <MpOrnament />
          </div>
        )}

        {/* Reconnecting veil covers everything while the socket is down */}
        {!mp.meConnected && (
          <div className="mp-veil">
            <span className="mp-pulse">◖◗</span>
            <h3 className="mp-veil-title">RECONNECTING</h3>
            <MpOrnament />
            <p className="mp-muted">Restoring your match…</p>
          </div>
        )}

        {!deepLinkResolved ? null : inMatch ? (
          <GameView mp={mp} onLeave={leaveToMenu} />
        ) : waiting ? (
          <WaitingScreen
            mp={mp}
            copied={copied}
            onCopy={doCopy}
            onLeave={leaveToMenu}
          />
        ) : searching ? (
          <SearchOnline
            key={searchKey}
            name={name}
            settings={mp.draftSettings}
            notice={notice}
            onRetry={retrySearch}
            backLabel={entryOrigin === "deepLink" ? "BACK TO HOME" : "BACK"}
            onEnterRoom={(code, pairKey) => void enterRoomFromSearch(code, pairKey)}
            onBack={cancelSearch}
          />
        ) : friendsOpen ? (
          <FriendsScreen
            name={name}
            notice={notice}
            onChallengeFriend={() => void challengeFriend()}
            onCreateRoom={(settings) => void openCreateRoom(settings)}
            onBack={closeFriends}
          />
        ) : noRoom ? (
          <JoinRoomScreen
            name={name}
            setName={setName}
            joinDraft={joinDraft}
            setJoinDraft={setJoinDraft}
            onJoin={join}
            onBack={closeFriends}
            configured={mp.configured}
            error={errorCopy(mp.roomError)}
            onClearError={mp.clearError}
          />
        ) : null}
      </section>
    </main>
  );
}

// ===========================================================================
// Join a room by code (the /multiplayer fallback screen)
// ===========================================================================
/**
 * "ROOM CODE" deep-link destination: join a room by code.
 *
 * Deliberately this and nothing else. The lobby menu that used to live here was
 * a second navigation hub (create / join / search / friends) competing with the
 * home screen, so it is gone and each home button deep-links to exactly the one
 * thing it promises.
 *
 * Room settings are NOT chosen here: the host is the only seat that writes
 * `draftSettings`, and they set them from the friends screen when creating.
 */
function JoinRoomScreen({
  name,
  setName,
  joinDraft,
  setJoinDraft,
  onJoin,
  onBack,
  configured,
  error,
  onClearError,
}: {
  name: string;
  setName: (v: string) => void;
  joinDraft: string;
  setJoinDraft: (v: string) => void;
  onJoin: () => void;
  onBack: () => void;
  configured: boolean;
  error: string | null;
  onClearError: () => void;
}) {
  return (
    <div className="mp-frame mp-flow">
      <button className="mp-back home-link" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={2.25} />
        Back
      </button>
      <div className="mp-menu-brand">
        <MpLogo />
        <p className="tagline">Enter Room Code</p>
      </div>

      <div className="entry-panel mp-panel">
        <p className="panel-title">JOIN A ROOM</p>

        <label htmlFor="mp-name">YOUR NAME</label>
        <input
          id="mp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          autoComplete="name"
        />

        {!configured && (
          <p className="mp-error">Multiplayer is not configured. See docs/FIREBASE_MULTIPLAYER.md.</p>
        )}

        {error && (
          <>
            <p className="mp-error">{error}</p>
            <button className="text-button" onClick={onClearError}>
              Dismiss
            </button>
          </>
        )}

        <label htmlFor="mp-join">ROOM CODE</label>
        <input
          id="mp-join"
          value={joinDraft}
          onChange={(e) => setJoinDraft(normalizeRoomCode(e.target.value))}
          placeholder="A7K92X"
          inputMode="text"
          autoCapitalize="characters"
          maxLength={6}
        />
        <button className="gold-button" onClick={onJoin} disabled={!configured || joinDraft.length < 6}>
          JOIN ROOM
        </button>
      </div>

      <p className="round-note">Ask the host for the 6-character code they shared.</p>
    </div>
  );
}

// ===========================================================================
// Waiting for player (after create)
// ===========================================================================
function WaitingScreen({
  mp,
  copied,
  onCopy,
  onLeave,
}: {
  mp: ReturnType<typeof useMultiplayer>;
  copied: boolean;
  onCopy: () => void;
  onLeave: () => void;
}) {
  const others = (mp.room?.order?.filter(Boolean).length ?? 1) - 1;
  return (
    <div className="mp-frame mp-flow">
      <button className="mp-back home-link" onClick={onLeave}>
        <ArrowLeft size={16} strokeWidth={2.25} />
        Back
      </button>
      <div className="stage-title">
        <MpEyebrow>YOU ARE THE HOST</MpEyebrow>
        <h2 className="mp-title">WAITING FOR OPPONENT</h2>
        <MpOrnament />
        <p>Share this room code with a friend.</p>
      </div>

      <div className="mp-room-card">
        <small>ROOM CODE</small>
        <strong className="mp-room-code">{mp.code}</strong>
        <button className="gold-button mp-wide" onClick={onCopy}>
          {copied ? (
            <span className="inline-with-icon">
              <Check strokeWidth={2.75} />
              COPIED
            </span>
          ) : (
            "COPY CODE"
          )}
        </button>
        <button className="outline-button mp-wide" onClick={() => void mp.shareInvite()}>
          SHARE
        </button>
      </div>

      <div className="waiting-dots big">
        <span>•</span>
        <span>•</span>
        <span>•</span>
      </div>
      <p className="mp-muted">
        {others > 0 ? `${others} player waiting to join` : "Waiting for a second player…"}
        · {mp.opponentConnected ? "opponent online" : "no one here yet"}
      </p>

      <button className="text-button" onClick={onLeave}>
        CANCEL &amp; LEAVE ROOM
      </button>
    </div>
  );
}

// ===========================================================================
// Error copy + small modal helper (kept out of the hook to keep services UI-free)
// ===========================================================================
function errorCopy(kind: string | null): string | null {
  switch (kind) {
    case "NOT_CONFIGURED":
    case null:
      return null;
    case "NOT_FOUND":
      return "Room not found. Double-check the code.";
    case "FULL":
      return "That room is already full.";
    case "STARTED":
      return "That room already finished.";
    case "EXPIRED":
      return "That room has expired. Ask for a fresh code.";
    case "AUTH_ERROR":
    case "CREATE_ERROR":
      return "Could not sign you in. Try again in a moment.";
    case "ERROR":
      return "Something went wrong. Please try again.";
    case "GONE":
      return "The room you were in no longer exists.";
    default:
      return kind;
  }
}
