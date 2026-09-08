"use client";

import { useState } from "react";
import useMultiplayer from "@/hooks/useMultiplayer";
import { normalizeRoomCode } from "@/lib/multiplayer/roomCode";
import GameView from "./game";
import SearchOnline from "./search";
import { MpEyebrow, MpLogo, MpOrnament } from "./ui";

/**
 * Multiplayer entry route.
 *
 * Internal step navigation (menu -> waiting -> game) mirrors how the single-
 * player keeps every screen in one page. All Firebase access lives in the hook /
 * services; this file only renders.
 */
export default function MultiplayerPage() {
  const mp = useMultiplayer();

  const [name, setName] = useState("");
  const [joinDraft, setJoinDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [searching, setSearching] = useState(false);

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
    await mp.leave();
    setJoinDraft("");
  };

  /** Host enters a room the matchmaker created for us. */
  const enterRoomFromSearch = async (code: string) => {
    await mp.attach(code);
  };

  const startSearch = () => {
    if (!name.trim()) {
      // fall through: name defaults inside the service
    }
    setSearching(true);
  };

  const cancelSearch = async () => {
    setSearching(false);
  };

  // ------------------------------------------------------------------ body
  return (
    <main className="game-shell mp">
      <section className="game-screen mp-screen">
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />

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
        ) : searching ? (
          <SearchOnline
            name={name}
            settings={mp.draftSettings}
            onEnterRoom={(code) => void enterRoomFromSearch(code)}
            onBack={cancelSearch}
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
            onSearch={startSearch}
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
}: {
  mp: ReturnType<typeof useMultiplayer>;
  name: string;
  setName: (v: string) => void;
  joinDraft: string;
  setJoinDraft: (v: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onSearch: () => void;
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
              className={draft.turnOrder === "alternate" ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setTurn("alternate")}
            >
              <b>Alternate Turns</b>
              <small>Each player hides one after another.</small>
            </button>
            <button
              className={draft.turnOrder === "complete" ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setTurn("complete")}
            >
              <b>Complete Turns</b>
              <small>10 consecutive hiding turns each.</small>
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
