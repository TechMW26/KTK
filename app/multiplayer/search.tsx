"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { ensureSignedIn } from "@/lib/firebase/auth";
import {
  announceSearch,
  cancelSearch,
  readInviteFor,
  listSearchers,
  hostPair,
  acceptInvite,
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
 * "Search Online Players" screen + matcher (Feature 1 & 2).
 *
 * Flow:
 *  1. Announce this player as searching.
 *  2. Run for MATCHMAKING_TIMEOUT_MS (30s), re-evaluating the pool.
 *  3. Whoever has the LEXICOGRAPHICALLY SMALLER uid is the HOST of a pair and
 *     creates a real room (hostPair). The larger-uid peer is invited and joins.
 *  4. Never matches with yourself; stale/crashed entries are filtered by the
 *     service; cancelling or timeout removes us from the pool.
 *  5. After the timeout we show a "No player online" state with a PLAY VS BOT
 *     action (routed into the single-player bot game) and a back option.
 */
export default function SearchOnline({
  name,
  settings,
  onEnterRoom,
  onBack,
}: {
  name: string;
  settings: MatchSettings;
  /** Called once a live room is ready (we are its member) to switch to the game. */
  onEnterRoom: (code: string) => void;
  onBack: () => void;
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

  const enterRoom = useCallback(
    async (code: string) => {
      if (enteredRef.current) return;
      enteredRef.current = true;
      stoppedRef.current = true;
      setState({ kind: "found" });
      onEnterRoom(code);
    },
    [onEnterRoom],
  );

  // Countdown timer.
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
    if (!configured) return undefined;

    const poll = async () => {
      if (stoppedRef.current || cancelled || !myUid) return;

      // 1) Guest path: someone invited me into their room.
      const invite = await readInviteFor(myUid).catch(() => null);
      if (invite) {
        await acceptInvite(myUid).catch(() => {});
        const res = await joinRoom(invite.roomCode, myUid, name).catch(() => ({ ok: false as const, reason: "ERROR" as const }));
        if (res.ok) {
          await enterRoom(invite.roomCode);
          return;
        }
        // Fall back: keep searching rather than stall.
      }

      // 2) Host path: decide whether I should pair up. Deterministic tie-break:
      //    the smaller uid hosts. We only host toward the earliest searcher.
      const others = await listSearchers(myUid).catch(() => []);
      const target = others[0];
      if (target && myUid < target.uid) {
        const code = await hostPair(myUid, name, target.uid, target.name, settings).catch(() => null);
        if (code) {
          await enterRoom(code);
          return;
        }
      }
    };

    (async () => {
      try {
        myUid = await ensureSignedIn();
      } catch {
        setState({ kind: "error", message: "Could not sign you in. Try again." });
        return;
      }
      if (cancelled) return;
      await announceSearch(myUid, name);
      await poll();
      // Re-evaluate a few times per second to catch invitations promptly.
      interval = window.setInterval(poll, 1200);
    })();

    const timeout = window.setTimeout(async () => {
      if (stoppedRef.current || cancelled || enteredRef.current) return;
      // No opponent joined within the window.
      stoppedRef.current = true;
      if (myUid) await cancelSearch(myUid).catch(() => {});
      setState({ kind: "no-player" });
    }, MATCHMAKING_TIMEOUT_MS);

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      if (interval) window.clearInterval(interval);
      window.clearTimeout(timeout);
      if (myUid) void cancelSearch(myUid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, settings]);

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
          <h2 className="mp-title">NO PLAYER ONLINE</h2>
          <MpOrnament />
          <p>No one was searching right now. Press on against The Rival instead.</p>
        </div>
        <button className="gold-button mp-wide" onClick={playVsBot}>
          PLAY VS BOT
        </button>
        <button className="outline-button mp-wide" onClick={stopAndBack}>
          BACK TO MULTIPLAYER
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
          BACK TO MULTIPLAYER
        </button>
      </div>
    );
  }

  return (
    <div className="mp-frame mp-flow">
      <div className="mp-menu-brand">
        <MpLogo />
      </div>
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
