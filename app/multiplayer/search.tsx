"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { ensureSignedIn } from "@/lib/firebase/auth";
import {
  announceSearch,
  cancelSearch,
  pingSearch,
  readInviteFor,
  readMyReadyMatch,
  claimPair,
  hostCreatesInvite,
  acceptInvite,
  listSearchers,
} from "@/services/matchmakingService";
import { joinRoom } from "@/services/roomService";
import { MATCHMAKING_TIMEOUT_MS } from "@/lib/multiplayer/types";
import type { MatchSettings } from "@/lib/game/flow";
import { MpEyebrow, MpLogo, MpOrnament } from "./ui";

type SearchState =
  | { kind: "searching" }
  | { kind: "found" }
  | { kind: "no-player" }
  | { kind: "error"; message: string };

/**
 * "Search Online Players" screen + matcher (race-fixed, disconnect-aware).
 *
 * Host selection is decided ONCE, atomically, on the shared
 * `matchmakingPairs/{pairKey}` node (see matchmakingService.claimPair). Only one
 * side wins as host and creates one room; the other waits as guest for the host's
 * invitation and joins it. A `pollBusyRef` + started/entered guards keep multiple
 * peers from double-claiming, double-joining or spawning multiple timers.
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
  backLabel = "BACK TO MULTIPLAYER",
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
   * a deep-link arrival, the lobby otherwise).
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
  // Opponent uids we have already started a pair claim with (prevents re-claim /
  // duplicate host calls while waiting for that same invite).
  const engagedRef = useRef<Set<string>>(new Set());

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

  // The search driver: announce once, then evaluate candidates until done.
  useEffect(() => {
    let cancelled = false;
    let myUid: string | null = null;
    let interval: number | undefined;
    let heartbeat: number | undefined;
    if (!configured) return undefined;

    const actHost = async (target: { uid: string; name: string }) => {
      if (enteredRef.current || stoppedRef.current || cancelled || !myUid) return;
      if (engagedRef.current.has(target.uid)) return; // already tried this peer
      engagedRef.current.add(target.uid);

      // GUEST path first: they may already be inviting us this tick.
      const invite = await readInviteFor(myUid).catch(() => null);
      if (invite) {
        await acceptInvite(myUid).catch(() => {});
        const res = await joinRoom(invite.roomCode, myUid, name).catch(() => ({
          ok: false as const,
          reason: "ERROR" as const,
        }));
        if (res.ok) {
          await enterRoom(invite.roomCode, [myUid, target.uid].sort().join("_"));
          return;
        }
      }

      // ATOMIC host selection: exactly one of us wins the shared pair claim.
      const claim = await claimPair(myUid, target.uid).catch(() => null);
      if (!claim || stoppedRef.current || cancelled) return;
      if (!claim.host) {
        // We are the guest: the host will publish an invite which readInviteFor
        // will pick up on the next tick. Do NOT re-claim this peer.
        return;
      }
      const code = await hostCreatesInvite(claim.myUid, name, claim.invitedUid, claim.pairKey, settings).catch(() => null);
      if (code) {
        await enterRoom(code, claim.pairKey);
      }
    };

    const joinIfReady = async (roomCode: string, pairKey: string): Promise<boolean> => {
      const res = await joinRoom(roomCode, myUid!, name).catch(() => ({
        ok: false as const,
        reason: "ERROR" as const,
      }));
      if (res.ok) {
        await enterRoom(roomCode, pairKey);
        return true;
      }
      return false;
    };

    const poll = async () => {
      if (pollBusyRef.current) return; // single flight: never two concurrent polls
      if (stoppedRef.current || cancelled || enteredRef.current || !myUid) return;
      pollBusyRef.current = true;
      try {
        // Guest path 1: a host has already invited us under their own host node.
        const invite = await readInviteFor(myUid).catch(() => null);
        if (invite) {
          await acceptInvite(myUid).catch(() => {});
          const pk = [myUid, invite.hostUid].sort().join("_");
          if (await joinIfReady(invite.roomCode, pk)) return;
        }
        // Guest path 2: the shared pair claim for me already has a room (robust
        // discovery that covers invite-scan ordering races).
        const ready = !enteredRef.current ? await readMyReadyMatch(myUid).catch(() => null) : null;
        if (ready) {
          if (await joinIfReady(ready.roomCode, [myUid, ready.peer].sort().join("_"))) return;
        }
        // Host path: claim an un-engaged searcher; if we win, create the room.
        const others = await listSearchers(myUid).catch(() => []);
        const target = others.find((o) => !engagedRef.current.has(o.uid));
        if (target && !enteredRef.current) {
          await actHost(target);
        }
      } finally {
        pollBusyRef.current = false;
      }
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
    <div className="mp-frame mp-flow">
      <div className="mp-menu-brand">
        <MpLogo />
      </div>
      {notice ? (
        <p className="mp-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="stage-title">
        <MpEyebrow>RONDEZVOUS</MpEyebrow>
        <h2 className="mp-title">SEARCHING FOR OPPONENT</h2>
        <MpOrnament />
        <p>Scanning the kingdom for another player…</p>
      </div>
      <span className="mp-pulse">◖◗</span>
      <p className="mp-muted">{left}s remaining</p>
      <button className="text-button" onClick={stopAndBack}>
        CANCEL SEARCH
      </button>
    </div>
  );
}
