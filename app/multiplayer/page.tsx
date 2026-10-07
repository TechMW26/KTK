"use client";

import { useEffect, useRef, useState } from "react";
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
 * Internal step navigation (menu -> waiting -> game) mirrors how the single-
 * player keeps every screen in one page. All Firebase access lives in the hook /
 * services; this file only renders.
 *
 * The home screen deep-links here with a `?mode=` flag:
 *   - `challenge` starts online matchmaking immediately.
 *   - `friends`   opens the Play With Friend list.
 *   - absent      shows the lobby menu (create / join / search).
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
   * link never flashes the lobby menu before the requested screen appears.
   */
  const [deepLinkResolved, setDeepLinkResolved] = useState(false);
  /**
   * Where this visit started. A `deepLink` arrival (Challenge / Play With
   * Friend from the home screen) has no lobby in its flow, so backing out must
   * return Home — showing the lobby would be a dead-end screen the player never
   * asked for. Arriving at the lobby directly keeps the lobby as the back target.
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

  /** Open the "Search Online Players" screen (fresh instance each call). */
  const startSearch = (msg?: string | null) => {
    setNotice(typeof msg === "string" ? msg : null);
    setSearching(true);
    setSearchKey((k) => k + 1);
  };
  /** Menu button wrapper: do NOT forward the click event as the notice string. */
  const menuSearch = () => startSearch();

  /**
   * Back out of matchmaking.
   *
   * A deep-link arrival (Challenge) has no lobby in its flow, so backing out
   * returns Home. A lobby-arrival returns to the lobby, as before.
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
   * arrival returns Home, a lobby arrival returns to the lobby.
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
   * friends list. This runs on the FIRST mount (not gated on Firebase init), so
   * the challenge/friends screen is selected in the same commit that the page
   * first paints — the lobby menu never flashes in between. The search screen
   * itself waits for `mp.configured` internally, so it is safe to open it before
   * Firebase has finished initialising.
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

  const openCreateRoom = async () => {
    setFriendsOpen(false);
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
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />
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
          has been resolved, so a Challenge/Friends deep link shows its target
          screen directly instead of flashing the lobby menu first.
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
            backLabel={entryOrigin === "deepLink" ? "BACK TO HOME" : "BACK TO MULTIPLAYER"}
            onEnterRoom={(code, pairKey) => void enterRoomFromSearch(code, pairKey)}
            onBack={cancelSearch}
          />
        ) : friendsOpen ? (
          <FriendsScreen
            name={name}
            notice={notice}
            onChallengeFriend={() => void challengeFriend()}
            onCreateRoom={() => void openCreateRoom()}
            onBack={closeFriends}
          />
        ) : noRoom ? (
          <MenuScreen
            mp={mp}
            name={name}
            setName={setName}
            joinDraft={joinDraft}
            setJoinDraft={setJoinDraft}
            onCreate={create}
            onJoin={join}
            onSearch={menuSearch}
            onFriends={() => setFriendsOpen(true)}
          />
        ) : null}
      </section>
    </main>
  );
}

// ===========================================================================
// Menu / create / join
// ===========================================================================
function MenuScreen({
  mp,
  name,
  setName,
  joinDraft,
  setJoinDraft,
  onCreate,
  onJoin,
  onSearch,
  onFriends,
}: {
  mp: ReturnType<typeof useMultiplayer>;
  name: string;
  setName: (v: string) => void;
  joinDraft: string;
  setJoinDraft: (v: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onSearch: () => void;
  /** Open the Play With Friend list. */
  onFriends: () => void;
}) {
  const err = errorCopy(mp.roomError);
  const draft = mp.draftSettings;
  const setTurn = (mode: "alternate" | "complete") =>
    void mp.updateSettings({ turnOrder: mode });
  const setLives = (on: boolean) =>
    void mp.updateSettings({ winMode: on ? "lives" : "classic" });

  return (
    <div className="mp-frame mp-flow">
      {/* vinext App Router: same-origin navigation via full page load. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="mp-back home-link" href="/">
        ← Back to single player
      </a>
      <div className="mp-menu-brand">
        <MpLogo />
        <p className="tagline">Online · 2 Players</p>
      </div>

      <div className="entry-panel mp-panel">
        <p className="panel-title">ONLINE ARENA</p>

        <label htmlFor="mp-name">YOUR NAME</label>
        <input
          id="mp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          autoComplete="name"
        />

        {!mp.configured && (
          <p className="mp-error">Multiplayer is not configured. See docs/FIREBASE_MULTIPLAYER.md.</p>
        )}

        {err && (
          <>
            <p className="mp-error">{err}</p>
            <button className="text-button" onClick={mp.clearError}>
              Dismiss
            </button>
          </>
        )}

        {/* --- Game rules the HOST locks in when creating a room --- */}
        <div className="mp-rules">
          <p className="mp-rules-heading">TURN ORDER</p>
          <div className="mp-rule-row">
            <button
              className={draft.turnOrder === "complete" ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setTurn("complete")}
            >
              <b>Complete Turns</b>
              <small>Each player hides 10 turns in a row. Default.</small>
            </button>
            <button
              className={draft.turnOrder === "alternate" ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setTurn("alternate")}
            >
              <b>Alternate Turns</b>
              <small>Players trade the Dealer every round.</small>
            </button>
          </div>

          <p className="mp-rules-heading">LIVES</p>
          <div className="mp-rule-row">
            <button
              className={draft.winMode === "classic" ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setLives(false)}
            >
              <b>Classic Score</b>
              <small>Original point rules.</small>
            </button>
            <button
              className={draft.winMode === "lives" ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setLives(true)}
            >
              <b>5 Lives</b>
              <small>Find the King to cost a life. First to 0 loses.</small>
            </button>
          </div>
          {draft.winMode === "lives" && draft.turnOrder !== "alternate" ? (
            <p className="mp-note">5 Lives uses the continuous-turn court format.</p>
          ) : null}
        </div>

        <button className="gold-button" onClick={onCreate} disabled={!mp.configured}>
          CREATE ROOM
        </button>
        <div className="mp-divider">
          <span>OR</span>
        </div>

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
        <button className="outline-button" onClick={onJoin} disabled={!mp.configured || joinDraft.length < 6}>
          JOIN ROOM
        </button>

        <button
          className="outline-button"
          onClick={onSearch}
          disabled={!mp.configured}
        >
          SEARCH ONLINE PLAYERS
        </button>
        <button className="outline-button" onClick={onFriends} disabled={!mp.configured}>
          PLAY WITH FRIEND
        </button>
      </div>
      <p className="round-note">Create a room and share the code, search for a rival, or enter a friend’s code.</p>
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
        ← Back
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
          {copied ? "COPIED ✓" : "COPY CODE"}
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
