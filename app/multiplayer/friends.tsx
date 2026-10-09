"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { useFriends, type FriendsState } from "@/hooks/useFriends";
import type { Friend } from "@/services/friendsService";
import { MpLogo } from "./ui";

/**
 * "Play With Friend" screen.
 *
 * Lists the player's existing friends with live status and a per-friend
 * Challenge action, and offers room creation as a SMALL secondary option at the
 * bottom (the hierarchy the redesign asks for: friends first, codes second).
 *
 * This screen only renders + chooses an action; the actual challenge hand-off is
 * delegated to the parent, which reuses the existing matchmaking/room services.
 */
export function FriendsScreen({
  name,
  onChallengeFriend,
  onCreateRoom,
  onBack,
  notice,
}: {
  /** The player's display name, published with their presence. */
  name?: string;
  /** Start a challenge against a specific friend (reuses online matchmaking). */
  onChallengeFriend: (friend: Friend) => void;
  /** Create the room (with these settings) and show the host's waiting screen. */
  onCreateRoom: (settings: { turnOrder: "complete" | "alternate"; winMode: "classic" | "lives" }) => void;
  onBack: () => void;
  notice?: string | null;
}) {
  const friends = useFriends({ displayName: name ?? "" });
  const [query, setQuery] = useState("");
  /**
   * Create-room settings. These used to live on the multiplayer lobby menu,
   * which is gone, so the host picks them here — the only place a room is
   * created now. The options are unchanged; only the location moved.
   */
  const [turnOrder, setTurnOrder] = useState<"complete" | "alternate">("complete");
  const [livesOn, setLivesOn] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return friends.friends;
    return friends.friends.filter((f) => f.name.toLowerCase().includes(needle));
  }, [friends.friends, query]);

  return (
    <div className="mp-frame mp-flow">
      <button className="mp-back home-link" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={2.25} />
        Back
      </button>

      <div className="mp-menu-brand">
        <MpLogo />
        <p className="tagline">Play With Friend</p>
      </div>

      {notice ? (
        <p className="mp-notice" role="status">
          {notice}
        </p>
      ) : null}

      {friends.friends.length > 0 && (
        <input
          className="friends-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search friends"
          aria-label="Search friends"
        />
      )}

      <div className="friends-list">
        {friends.loading ? (
          <p className="mp-muted">Loading your friends…</p>
        ) : filtered.length === 0 ? (
          <div className="friends-empty">
            <p className="mp-muted">
              {friends.friends.length === 0
                ? "No friends yet. Add players after a match, or create a room and share the code."
                : "No friends match that search."}
            </p>
          </div>
        ) : (
          filtered.map((friend) => (
            <FriendRow
              key={friend.uid}
              friend={friend}
              pending={friends.pending.has(friend.uid)}
              onChallenge={onChallengeFriend}
            />
          ))
        )}
      </div>

      <div className="friends-footer">
        <p className="friends-footer-hint">Or invite anyone with a room code</p>
        <div className="mp-rules">
          <p className="mp-rules-heading">TURN ORDER</p>
          <div className="mp-rule-row">
            <button
              className={turnOrder === "complete" ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setTurnOrder("complete")}
              aria-pressed={turnOrder === "complete"}
            >
              <b>Complete Turns</b>
              <small>Each player hides 10 turns in a row. Default.</small>
            </button>
            <button
              className={turnOrder === "alternate" ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setTurnOrder("alternate")}
              aria-pressed={turnOrder === "alternate"}
            >
              <b>Alternate Turns</b>
              <small>Players trade the Dealer every round.</small>
            </button>
          </div>

          <p className="mp-rules-heading">LIVES</p>
          <div className="mp-rule-row">
            <button
              className={!livesOn ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setLivesOn(false)}
              aria-pressed={!livesOn}
            >
              <b>Classic Score</b>
              <small>Original point rules.</small>
            </button>
            <button
              className={livesOn ? "mp-rule-opt active" : "mp-rule-opt"}
              onClick={() => setLivesOn(true)}
              aria-pressed={livesOn}
            >
              <b>5 Lives</b>
              <small>Find the King to cost a life. First to 0 loses.</small>
            </button>
          </div>
          {livesOn && turnOrder !== "alternate" ? (
            <p className="mp-note">5 Lives uses the continuous-turn court format.</p>
          ) : null}
        </div>
        <button
          className="outline-button mp-wide"
          onClick={() => onCreateRoom({ turnOrder, winMode: livesOn ? "lives" : "classic" })}
          disabled={!friends.configured}
        >
          CREATE ROOM
        </button>
      </div>
    </div>
  );
}

/** One friend row: name, live status, and a state-appropriate action. */
function FriendRow({
  friend,
  pending,
  onChallenge,
}: {
  friend: Friend;
  pending: boolean;
  onChallenge: (friend: Friend) => void;
}) {
  const status = friend.online ? "Online" : "Offline";
  return (
    <div className={["friend-row", friend.online ? "online" : "offline"].join(" ")}>
      <span className="friend-dot" aria-hidden="true" />
      <span className="friend-meta">
        <b>{friend.name}</b>
        <small>{status}</small>
      </span>
      <button
        className="friend-challenge"
        onClick={() => onChallenge(friend)}
        disabled={pending}
        title={friend.online ? `Challenge ${friend.name}` : `${friend.name} is offline`}
      >
        {pending ? "…" : "CHALLENGE"}
      </button>
    </div>
  );
}

export type { FriendsState };
