"use client";
import { PwaRegistration } from "@/components/common/PwaRegistration";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import useMultiplayer from "@/hooks/useMultiplayer";
import { normalizeRoomCode } from "@/lib/multiplayer/roomCode";
import { RESULT_COPY } from "@/lib/game/rules";
import { OPPONENT_GRACE_MS } from "@/lib/multiplayer/types";
import { cleanName, loadSavedName, NAME_MAX, saveName, UNKNOWN_PLAYER } from "@/lib/multiplayer/displayName";
import GameView from "./game";
import SearchOnline from "./search";
import { FriendsScreen } from "./friends";
import { MpEyebrow, MpLogo, MpOrnament } from "./ui";

/**
 * Multiplayer screen implementation.
 *
 * Not a route module: `page.tsx` loads it with `ssr: false`, so this subtree is
 * never server-rendered. That matters because the screen is chosen from the
 * browser URL — a server render would have to guess, and its guess (the room-code
 * fallback) would be painted before hydration.
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
 *
 * The target screen is derived from `?mode=` during initialisation, never in an
 * effect, so the room-code fallback is not painted on the way to Challenge.
 */
export default function MultiplayerScreen() {
  const mp = useMultiplayer();

  /**
   * Whether the client has taken over.
   *
   * This route is rendered FROM the URL, and the server has no URL — so the
   * server render must produce nothing rather than guess. Without this guard the
   * server falls through the screen ternaries to the room-code fallback, and that
   * HTML is painted by the browser before React hydrates: the "JOIN A ROOM" flash
   * between the home screen and matchmaking.
   *
   * It also makes the first client render match the server (both render nothing),
   * so there is no hydration mismatch.
   */
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- flips once on mount, by design
  useEffect(() => setMounted(true), []);

  /**
   * The screen this visit was opened for, read from the URL SYNCHRONOUSLY while
   * building the initial state — never from an effect.
   *
   * Deciding the initial screen in an effect is not safe here: effects run after
   * the first innerHTML commit, so the render before them falls through the
   * ternaries below to the room-code fallback, and that commit is painted (and in
   * dev is also double-invoked by StrictMode *after* the effect already flipped
   * `searching` on, leaving `noRoom` true). Deriving the flags at initialisation
   * removes that render entirely.
   *
   * This is a lazy initialiser, so it reads `window` only on the client; the
   * server has no `window` and yields the neutral state, matching the guard above.
   */
  const [deepLinkMode] = useState<"" | "challenge" | "friends" | "join">(() => {
    if (typeof window === "undefined") return "";
    const mode = new URLSearchParams(window.location.search).get("mode");
    return mode === "challenge" || mode === "friends" || mode === "join" ? mode : "";
  });
  const isDeepLink = deepLinkMode !== "";

  // Pre-filled with the name this device used last time (optional — may be "").
  const [name, setName] = useState(() => (typeof window === "undefined" ? "" : loadSavedName()));
  /**
   * The "who's playing?" screen has been answered (CONTINUE or SKIP). Until then,
   * PLAY ONLINE and WITH FRIENDS show it first, so the opponent sees a real name.
   * Join Room has its own name box, so it never needs this screen.
   */
  const [nameReady, setNameReady] = useState(false);  const [joinDraft, setJoinDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [searching, setSearching] = useState(deepLinkMode === "challenge");
  // Incrementing key forces a FRESH SearchOnline (fresh 30s timer + clean refs)
  // every time we (re)enter search — including after an opponent disconnect.
  const [searchKey, setSearchKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  /** Which screen the friends flow owns while no room is active. */
  const [friendsOpen, setFriendsOpen] = useState(deepLinkMode === "friends");
  /**
   * Where this visit started. A `deepLink` arrival (Challenge / Play With
   * Friend / Room Code from the home screen) backs out to Home. A direct visit
   * to /multiplayer stays on the multiplayer route.
   */
  const [entryOrigin, setEntryOrigin] = useState<"deepLink" | "lobby">(
    isDeepLink ? "deepLink" : "lobby",
  );

  // ------------------------------------------------------------------ states
  /**
   * Whether this room is OUR live game — deliberately NOT a statement about the
   * match being unfinished.
   *
   * It used to require `room.status === "playing"`, which conflated two different
   * questions: "is this room mine and playable?" (room-level) and "is the match
   * over?" (game-level). `status` goes to `finished` as soon as the match ends, so
   * tying this to it made the board — and therefore the result screen and the
   * rematch button — vanish the moment a match was decided.
   *
   * The match-over state lives on `mp.game.status` / `mp.game.phase`, and
   * `GameView` renders the result screen from it. A room is only excluded here
   * when it has been retired by BOTH paths: the room status says finished AND the
   * game has nothing left to show.
   */
  const inMatch =
    !!mp.room &&
    mp.room.status !== "expired" &&
    (mp.room.order?.filter(Boolean).length ?? 0) >= 2 &&
    mp.mySeat != null &&
    !!mp.game;

  const noRoom = !mp.room && !mp.code;
  /**
   * The waiting screen (which SHOWS THE ROOM CODE) must never appear for an
   * online-matchmade game.
   *
   * A room the matchmaker just created is `status: "waiting"` with one seat, so a
   * `status`-only test was true for it too — and the host saw the room-code card
   * flash between matchmaking and the board.
   *
   * `mp.searchOrigin` is the hook's authoritative signal for "the matchmaker put
   * me in this room" (it sets `originRef = "room"` for create/join and
   * `originRef = "search"` for a matchmade attach). Gating on that — rather than
   * on the entry `?mode=` — is what keeps both flows correct: the code flow
   * (Play With Friend → Create Room, or Join Room) still gets its room code, and
   * a matchmade room never does.
   *
   * The entry mode is deliberately NOT used here: `?mode=friends` is the entry
   * point for Create Room, so keying off it would suppress the room code for the
   * very flow that needs it.
   */
  const waiting =
    !!mp.room &&
    mp.room.status === "waiting" &&
    (mp.room.order?.filter(Boolean).length ?? 0) < 2 &&
    !mp.searchOrigin;
  /**
   * The room-code screen is OPT-IN, never a fallthrough.
   *
   * As the last branch of the ternary it used to be reachable from any state
   * that matched no earlier screen — which is what let a remount mid-matchmaking
   * leak it on screen. It is now gated on an explicit intent: the `?mode=join`
   * deep link, or a direct visit to /multiplayer that nothing else claims.
   */
  const wantsJoin = deepLinkMode === "join" || (deepLinkMode === "" && noRoom);

  // ------------------------------------------------------------------ actions
  const doCopy = async () => {
    await mp.copyCode();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

    const create = async () => {
    saveName(name);
    setBusy("create");
    await mp.create(name);
    setBusy("");
  };

  const join = async () => {
    const code = normalizeRoomCode(joinDraft);
    if (code.length === 0) return;
    saveName(name);
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
   * Adopt this visit's entry mode.
   *
   * The SCREEN is already chosen synchronously by the state initialisers above,
   * so nothing here can make the room-code fallback paint. This exists only for
   * the case where `?mode=` changes without a remount: adopting the parsed mode
   * keeps the component's own state in step with the URL. On a real deep-link
   * mount every value below is already the initial one, so nothing flips.
   */
  useEffect(() => {
    if (deepLinkMode === "challenge") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL is an external system
      setEntryOrigin("deepLink");
      setSearching(true);
      setSearchKey((k) => k + 1);
      return;
    }
    if (deepLinkMode === "friends") {
      setEntryOrigin("deepLink");
      setFriendsOpen(true);
      return;
    }
    if (deepLinkMode === "join") {
      // "ROOM CODE" from home lands on the focused join screen. `noRoom` already
      // selects it, but marking the origin makes Back return Home instead of
      // leaving the player on the multiplayer route they never navigated from.
      setEntryOrigin("deepLink");
    }
    // No flag: this is a direct visit to /multiplayer. There is no lobby menu to
    // show any more, so fall back to the room-code screen — the one action that
    // still needs a route of its own.
  }, [deepLinkMode]);

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

    /** Name screen answered: remember a typed name, or play as Unknown Player. */
  const confirmName = (typed: string) => {
    const clean = cleanName(typed);
    saveName(clean);
    setName(clean);
    setNameReady(true);
  };
  const skipName = () => {
    setName("");
    setNameReady(true);
  };
  const needsName = !nameReady && (searching || friendsOpen) && !inMatch && !waiting && !mp.searchOrigin;

  // Single-player parity: tint the whole screen with the round result tone while
  // a reveal is on screen (danger/victory), exactly like the solo/2P reveal.
  const revealTone =
    inMatch && mp.game?.phase === "reveal" && mp.game.lastResult
      ? RESULT_COPY[mp.game.lastResult.kind].tone
      : "";

  // ------------------------------------------------------------------ body
  //
  // Nothing renders until the client has taken over. The server has no URL, so
  // any screen it produced would be a guess — and that guess (the room-code
  // fallback) is exactly the flash this guard removes. The first client render
  // also produces nothing, which matches the server and avoids a hydration
  // mismatch; the correct screen appears on the very next commit.
  if (!mounted) {
    return (
      <main className="game-shell mp">
        <section className="game-screen mp-screen">
          <div className="mp-veil">
            <span className="mp-pulse">◖◗</span>
            <MpOrnament />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="game-shell mp">
      <PwaRegistration />
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

        {/* Reconnecting veil covers everything while the socket is down */}
        {!mp.meConnected && (
          <div className="mp-veil">
            <span className="mp-pulse">◖◗</span>
            <h3 className="mp-veil-title">RECONNECTING</h3>
            <MpOrnament />
            <p className="mp-muted">Restoring your match…</p>
          </div>
        )}

        {inMatch ? (
          <GameView mp={mp} onLeave={leaveToMenu} />
        ) : waiting ? (
          <WaitingScreen
            mp={mp}
            copied={copied}
            onCopy={doCopy}
            onLeave={leaveToMenu}
          />
                ) : needsName ? (
          <NameScreen
            initialName={name}
            onContinue={confirmName}
            onSkip={skipName}
            onBack={searching ? cancelSearch : closeFriends}
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
        ) : mp.searchOrigin ? (
          /*
            A matchmade game that is still booting: the matchmaker attached us to
            a room but the board is not up yet (the opponent is joining, or the
            room/seat/game subscriptions have not landed). Hold the neutral veil.

            This branch must exist even though `waiting` and `wantsJoin` could
            both be false here — without it a search-origin visit would fall
            through to the room-code screen, which is the exact flash being fixed.
            The recovery path for a pair that genuinely never arrives is the
            opponent-disconnect re-search in the parent, not a manual join.
          */
          <div className="mp-veil">
            <span className="mp-pulse">◖◗</span>
            <MpOrnament />
          </div>
        ) : friendsOpen ? (
          <FriendsScreen
            name={name}
            notice={notice}
            onChallengeFriend={() => void challengeFriend()}
            onCreateRoom={(settings) => void openCreateRoom(settings)}
            onBack={closeFriends}
          />
        ) : wantsJoin ? (
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

                <label htmlFor="mp-name">YOUR NAME (OPTIONAL)</label>
        <input
          id="mp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your opponent will see this"
          autoComplete="nickname"
          maxLength={NAME_MAX}
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
// "Who's playing?" — optional name before PLAY ONLINE / WITH FRIENDS
// ===========================================================================
/**
 * Asks for the name the opponent will see. Never mandatory: SKIP (or CONTINUE
 * with an empty box) plays on, and the opponent sees "Unknown Player".
 */
function NameScreen({
  initialName,
  onContinue,
  onSkip,
  onBack,
}: {
  initialName: string;
  onContinue: (name: string) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(initialName);
  const typed = cleanName(draft);
  return (
    <div className="mp-frame mp-flow">
      <button className="mp-back home-link" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={2.25} />
        Back
      </button>
      <div className="mp-menu-brand">
        <MpLogo />
        <p className="tagline">Who&apos;s playing?</p>
      </div>

      <form
        className="entry-panel mp-panel"
        onSubmit={(e) => {
          e.preventDefault();
          onContinue(draft);
        }}
      >
        <p className="panel-title">YOUR NAME</p>
        <label htmlFor="mp-gate-name">YOUR OPPONENT WILL SEE THIS NAME</label>
        <input
          id="mp-gate-name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Enter your name (optional)"
          autoComplete="nickname"
          maxLength={NAME_MAX}
        />
        <button className="gold-button" type="submit">
          {typed ? `CONTINUE AS ${typed.toUpperCase()}` : "CONTINUE"}
        </button>
      </form>

      <button className="text-button" onClick={onSkip}>
        SKIP — PLAY AS {UNKNOWN_PLAYER.toUpperCase()}
      </button>
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
  // Never surface the room code while the match is (or has been) live — online
  // multiplayer is played through the board, not by re-sharing a code. On the
  // match-end screen both seats are still claimed, so only a genuinely waiting
  // room (a lone host) may show it.
  const canShareCode = (mp.room?.order?.filter(Boolean).length ?? 0) < 2;
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
        <p>{canShareCode ? "Share this room code with a friend." : "Third seat unavailable."}</p>
      </div>

      {canShareCode ? (
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
      ) : null}

      <div className="waiting-dots big">
        <span>•</span>
        <span>•</span>
        <span>•</span>
      </div>
      <p className="mp-muted">
        {others > 0 ? `${others} ${others === 1 ? "player" : "players"} waiting to join` : "Waiting for a second player…"}        · {mp.opponentConnected ? "opponent online" : "no one here yet"}
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
