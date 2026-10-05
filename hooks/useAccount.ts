"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { observeAuth } from "@/lib/firebase/auth";
import { ensureProfile, loadProfile, syncIdentityFields, type UserProfile } from "@/lib/firebase/profile";

/**
 * Owns the signed-in identity for the whole app.
 *
 * Guests are the default: this hook never forces a sign-in, it only reports who
 * the player currently is so the UI can offer an upgrade. Existing multiplayer
 * code keeps calling `ensureSignedIn()` directly and is unaffected.
 */

export interface AccountState {
  user: User | null;
  profile: UserProfile | null;
  /** True while the initial auth state is still resolving. */
  loading: boolean;
  /** True when the player is on a throwaway guest identity. */
  isGuest: boolean;
  /** Re-read the profile after the identity provider changes it. */
  refresh: () => Promise<void>;
}

export function useAccount(): AccountState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // observeAuth fires immediately with the current user (or null), then again
    // on every sign-in/out and token refresh.
    return observeAuth((next) => {
      setUser(next);
      setLoading(false);
      if (!next) {
        setProfile(null);
        return;
      }
      // Identity fields (verified state, linked providers) can change outside
      // our UI, so always reconcile them against the live Firebase user rather
      // than trusting whatever was first written.
      void (async () => {
        try {
          const existing = await ensureProfile(next);
          setProfile(existing ? await syncIdentityFields(next) : null);
        } catch {
          // A rules rejection or offline read must not break the game.
          setProfile(null);
        }
      })();
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setProfile(await loadProfile(user.uid));
  }, [user]);

  return {
    user,
    profile,
    loading,
    isGuest: !user || user.isAnonymous,
    refresh,
  };
}
