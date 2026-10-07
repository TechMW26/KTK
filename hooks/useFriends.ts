"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isFirebaseConfigured } from "@/lib/firebase/config";
import { ensureSignedIn } from "@/lib/firebase/auth";
import {
  addFriend as addFriendEdge,
  bindFriendPresence,
  isFriend as isFriendEdge,
  loadFriends,
  removeFriend as removeFriendEdge,
  watchFriends,
  type Friend,
} from "@/services/friendsService";

/**
 * Owns the signed-in player's friends list and presence.
 *
 * The friends list is a durable, per-uid social graph the online flows layer on
 * top of. Like `useMultiplayer`, all Firebase access lives in the service and
 * this hook only exposes state + actions to the UI.
 *
 * It signs the device in ANONYMOUSLY if needed (the same identity the
 * matchmaking/room services use), so a guest can still keep a friends list that
 * survives for the life of their anonymous session.
 */

export interface FriendsState {
  configured: boolean;
  /** The caller's uid once signed in, else null. */
  uid: string | null;
  friends: Friend[];
  loading: boolean;
  /** Ids currently being added, so the UI can disable per-row buttons. */
  pending: Set<string>;
  /** Add (idempotently) and return true on success. */
  addFriend: (friend: { uid: string; name: string }) => Promise<boolean>;
  /** Remove a friend from this player's list. */
  removeFriend: (friendUid: string) => Promise<void>;
  /** Whether a uid is already on the list (local check). */
  hasFriend: (friendUid: string) => boolean;
}

export interface UseFriendsOptions {
  /** Whether to run the hook at all. */
  enabled?: boolean;
  /** The player's display name, published alongside presence. */
  displayName?: string;
  /**
   * Whether to publish this player's own presence. Mounting more than one
   * `useFriends` at a time (e.g. the friends screen AND the in-game Add Friend
   * bar) must only bind presence ONCE, so secondary consumers pass `announce:
   * false` and just read the list.
   */
  announce?: boolean;
}

export function useFriends(options: UseFriendsOptions = {}): FriendsState {
  const { enabled = true, displayName = "", announce = true } = options;
  const configured = isFirebaseConfigured();
  const [uid, setUid] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [pending, setPending] = useState<Set<string>>(new Set());
  /** Latest list, readable from async actions without re-subscribing. */
  const friendsRef = useRef<Friend[]>([]);
  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  // ------------------------------------------------------------------ sign-in
  useEffect(() => {
    if (!enabled || !configured) {
      // Not subscribed: nothing to load, so drop the spinner immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflecting a disabled hook
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const got = await ensureSignedIn();
        if (!cancelled) setUid(got);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, configured]);

  // ------------------------------------------------------- load + subscribe
  useEffect(() => {
    if (!enabled || !configured || !uid) return;
    let cancelled = false;

    void loadFriends(uid)
      .then((initial) => {
        if (cancelled) return;
        setFriends(initial);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const unsubscribe = watchFriends(uid, (next) => {
      if (cancelled) return;
      setFriends(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, configured, uid]);

  // ------------------------------------------------------------------ presence
  useEffect(() => {
    if (!enabled || !configured || !announce || !uid) return;
    const release = bindFriendPresence(uid, displayName.trim().slice(0, 32), {});
    return () => release();
  }, [enabled, configured, announce, uid, displayName]);

  // ------------------------------------------------------------------ actions
  const addFriend = useCallback(
    async (friend: { uid: string; name: string }): Promise<boolean> => {
      if (!configured || !friend.uid || friend.uid === uid) return false;
      setPending((prev) => new Set(prev).add(friend.uid));
      try {
        const got = uid ?? (await ensureSignedIn());
        if (!uid) setUid(got);
        const added = await addFriendEdge(got, friend);
        return added !== null;
      } catch {
        return false;
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(friend.uid);
          return next;
        });
      }
    },
    [configured, uid],
  );

  const removeFriend = useCallback(
    async (friendUid: string): Promise<void> => {
      if (!configured || !uid) return;
      await removeFriendEdge(uid, friendUid).catch(() => {});
    },
    [configured, uid],
  );

  const hasFriend = useCallback(
    (friendUid: string) => friendsRef.current.some((f) => f.uid === friendUid),
    [],
  );

  return {
    configured,
    uid,
    friends,
    loading,
    pending,
    addFriend,
    removeFriend,
    hasFriend,
  };
}

/**
 * Imperative one-shot check for call sites that only need to know whether a
 * player is already a friend (e.g. the in-game Add Friend button) without
 * mounting the full hook.
 */
export async function checkIsFriend(uid: string, friendUid: string): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  try {
    return await isFriendEdge(uid, friendUid);
  } catch {
    return false;
  }
}
