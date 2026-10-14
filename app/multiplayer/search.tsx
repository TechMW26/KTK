"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { ensureSignedIn } from "@/lib/firebase/auth";
import {
  announceSearch,
  cancelSearch,
  pingSearch,
  stepMatchmaking,
} from "@/services/matchmakingService";
import { joinRoom } from "@/services/roomService";
import { MATCHMAKING_TIMEOUT_MS } from "@/lib/multiplayer/types";
import type { MatchSettings } from "@/lib/game/flow";
import { MpEyebrow, MpLogo, MpOrnament } from "./ui";
import SearchMap from "./search-map";

type SearchState =
  | { kind: "searching" }
  | { kind: "found" }
  | { kind: "no-player" }
  | { kind: "error"; message: string };

/**
 * "Search Online Players" screen + matcher.
 *
 * A searcher publishes ONE record to the pool (`matchmakingPool/{uid}`) and polls
 * `stepMatchmaking`, which pairs it with the longest-waiting opponent using a
 * host rule that is a pure function of the two uids (lower uid hosts). The host
 * creates one room and stamps the agreed `roomCode` onto BOTH pool records, so
 * each player joins by reading its own node — there is no cross-player discovery
 * and therefore no ordering race that can leave both sides waiting.
 *
 * A fresh `key` from the parent resets this component (and the 30s timer) so an
 * opponent-disconnect auto re-search restarts cleanly.
 */
export default function SearchOnline({
  name,
  settings,
  onEnterRoom,
  onBack,
  onRetry,
  backLabel = "BACK",
  notice,
}: {
  name: string;
  settings: MatchSettings;
  /** Room ready (host <= pairKey from the atomic claim OR guest after joining). */
  onEnterRoom: (code: string, pairKey: string) => void;
  onBack: () => void;
  /** Restart matchmaking with a fresh 30s window (parent remounts the screen). */
  onRetry?: () => void;
  /**
   * Label for the "back out" action, so it names the real destination (Home for
   * a deep-link arrival, the multiplayer route otherwise).
   */
  backLabel?: string;
  /** Optional banner shown while searching (e.g. "<Name> left… finding a new player…"). */
  notice?: string | null;
}) {
  const configured = isFirebaseConfigured();
  const [state, setState] = useState<SearchState>(
    configured
      ? { kind: "searching" }
      : { kind: "error", message: "Multiplayer is not configured." },
  );
  const [left, setLeft] = useState(Math.round(MATCHMAKING_TIMEOUT_MS / 1000));
  const stoppedRef = useRef(false);
  const enteredRef = useRef(false);
  const pollBusyRef = useRef(false);

  const enterRoom = useCallback(
    async (code: string, pairKey: string) => {
      if (enteredRef.current) return;
      enteredRef.current = true;
      stoppedRef.current = true;
      setState({ kind: "found" });
      onEnterRoom(code, pairKey);
    },
    [onEnterRoom],
  );

  // Countdown timer (component mount = fresh 30s).
  useEffect(() => {
    const id = window.setInterval(() => {
      setLeft((v) => Math.max(0, v - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // The search driver: announce once, then step the pool until matched.
  useEffect(() => {
    let cancelled = false;
    let myUid: string | null = null;
    let interval: number | undefined;
    let heartbeat: number | undefined;
    if (!configured) return undefined;

    const poll = async () => {
      if (pollBusyRef.current) return; // single flight: never two concurrent polls
      if (stoppedRef.current || cancelled || enteredRef.current || !myUid) return;
      pollBusyRef.current = true;
      const uid = myUid;
      try {
        // One step: pair if we can (the lower uid hosts and stamps BOTH pool
        // records with the room), otherwise keep waiting. A stamped record on
        // OUR own node is the signal that we are matched — no cross-player
        // discovery, which is what made the previous pairing unreliable.
        const matched = await stepMatchmaking(uid, name, settings).catch(() => null);
        if (!matched || enteredRef.current || cancelled) return;
        if (await joinIfReady(matched.roomCode, matched.peer)) return;
      } finally {
        pollBusyRef.current = false;
      }
    };

    /**
     * Join the room the matchmaker produced for us. Both seats join by code, so
     * the host also goes through this path (it is already logged in).
     */
    const joinIfReady = async (roomCode: string, peer: string): Promise<boolean> => {
      const res = await joinRoom(roomCode, myUid!, name).catch(() => ({
        ok: false as const,
        reason: "ERROR" as const,
      }));
      if (res.ok) {
        await enterRoom(roomCode, peer);
        return true;
      }
      return false;
    };

    (async () => {
      // Bind the signed-in uid to a const. `myUid` is a mutable closure variable,
      // so its `string | null` type is not narrowed across the awaits below; the
      // const keeps it `string` for every subsequent use.
      let uid: string;
      try {
        uid = await ensureSignedIn();
        myUid = uid;
      } catch {
        setState({ kind: "error", message: "Could not sign you in. Try again." });
        return;
      }
      if (cancelled) return;
      await announceSearch(uid, name);
      // Heartbeat so this searcher never looks stale to other devices.
      heartbeat = window.setInterval(() => {
        if (!stoppedRef.current && !enteredRef.current && !cancelled) {
          void pingSearch(uid).catch(() => {});
        }
      }, 5000);
      await poll();
      interval = window.setInterval(poll, 1200);
    })();

    const timeout = window.setTimeout(async () => {
      if (stoppedRef.current || cancelled || enteredRef.current) return;
      stoppedRef.current = true;
      if (myUid) await cancelSearch(myUid).catch(() => {});
      setState({ kind: "no-player" });
    }, MATCHMAKING_TIMEOUT_MS);

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      if (interval) window.clearInterval(interval);
      if (heartbeat) window.clearInterval(heartbeat);
      window.clearTimeout(timeout);
      if (myUid) void cancelSearch(myUid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, settings, configured]);

  const stopAndBack = async () => {
    stoppedRef.current = true;
    onBack();
  };

  const playVsBot = () => {
    stoppedRef.current = true;
    if (typeof window !== "undefined") window.location.assign("/?play=bot");
  };

  if (state.kind === "found") {
    return (
      <div className="mp-frame mp-flow">
        <div className="stage-title">
          <MpEyebrow>MATCH FOUND</MpEyebrow>
          <h2 className="mp-title">OPPONENT FOUND!</h2>
          <MpOrnament />
          <p>Entering the arena…</p>
        </div>
        <div className="waiting-dots big">
          <span>•</span>
          <span>•</span>
          <span>•</span>
        </div>
      </div>
    );
  }

  if (state.kind === "no-player") {
    return (
      <div className="mp-frame mp-flow">
        <div className="stage-title">
          <MpEyebrow>CALLING THE COURT</MpEyebrow>
          <h2 className="mp-title">NO PLAYER FOUND</h2>
          <MpOrnament />
          <p>No one was searching right now. Try again, or press on against The Rival.</p>
        </div>
        <button className="gold-button mp-wide" onClick={() => onRetry?.()}>
          RETRY
        </button>
        <button className="outline-button mp-wide" onClick={playVsBot}>
          PLAY WITH BOT
        </button>
        <button className="text-button" onClick={stopAndBack}>
          {backLabel}
        </button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mp-frame mp-flow">
        <MpEyebrow>CONNECTION ISSUE</MpEyebrow>
        <h2 className="mp-title">SEARCH FAILED</h2>
        <MpOrnament />
        <p className="mp-muted">{state.message}</p>
        <button className="outline-button mp-wide" onClick={onBack}>
          {backLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="mp-frame mp-flow mp-search">
      <SearchMap />
      <div className="mp-menu-brand">
        <MpLogo />
      </div>
      {notice ? (
        <p className="mp-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="stage-title">
        <MpEyebrow>RENDEZVOUS</MpEyebrow>
        <h2 className="mp-title">SEARCHING FOR OPPONENT</h2>
        <MpOrnament />
        <p>Scanning the kingdom for another player…</p>
      </div>
      <p className="search-countdown" role="timer" aria-label={`${left} seconds remaining`}>
        <span className="search-countdown-dot" aria-hidden="true" />
        {left}s remaining
      </p>
      <button className="text-button" onClick={stopAndBack}>
        CANCEL SEARCH
      </button>
    </div>
  );
}
