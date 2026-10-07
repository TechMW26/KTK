"use client";

import { useMemo, useState } from "react";

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
  /** Fall back to the existing room-code flow. */
  onCreateRoom: () => void;
  onBack: () => void;
  notice?: string | null;
}) {
  const friends = useFriends({ displayName: name ?? "" });
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return friends.friends;
    return friends.friends.filter((f) => f.name.toLowerCase().includes(needle));
  }, [friends.friends, query]);

  return (
    <div className="mp-frame mp-flow">
      <button className="mp-back home-link" onClick={onBack}>
        ← Back
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
        <button className="outline-button mp-wide" onClick={onCreateRoom} disabled={!friends.configured}>
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
