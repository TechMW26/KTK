"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { observeAuth } from "@/lib/firebase/auth";
import { completeRedirectSignIn } from "@/lib/firebase/accounts";
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
  /** Set when a redirect sign-in came back with a problem, for the UI to show. */
  redirectError: string | null;
  /** Re-read the profile after the identity provider changes it. */
  refresh: () => Promise<void>;
}

export function useAccount(): AccountState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    /**
     * Collect any pending redirect result BEFORE subscribing to auth state.
     *
     * This ordering is the whole point. `observeAuth` fires synchronously on
     * subscribe with `auth.currentUser`, which immediately after a redirect is
     * still the pre-redirect anonymous guest. Racing the two meant the guest
     * state won and the completed Google sign-in was discarded, so the player
     * landed back on the start screen signed out.
     *
     * Awaiting first also avoids the harsher failure: if anything calls
     * `ensureSignedIn()` while an OAuth redirect is still pending, Firebase
     * cancels the pending redirect entirely and the result is lost for good.
     */
    void (async () => {
      try {
        const result = await completeRedirectSignIn();
        if (!cancelled && result && !result.ok) setRedirectError(result.reason);
      } catch {
        // Never let result collection break the app's boot.
      }
      if (cancelled) return;

      unsubscribe = observeAuth((next) => {
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
          } catch (error) {
            // A profile failure must not break the game, but it also must not be
            // invisible: swallowing it renders the account screen as though the
            // player simply has no profile, which is indistinguishable from a
            // rules rejection or an offline read. Log it so the cause is
            // discoverable, then degrade to "no profile".
            console.error("[account] profile load failed", error);
            setProfile(null);
          }
        })();
      });
    })();

    // Safety net: `observeAuth` normally fires straight away, but if redirect
    // collection threw before subscribing, the app must not sit on "loading"
    // forever with no way forward.
    const loadingGuard = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(loadingGuard);
      unsubscribe?.();
    };
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
    redirectError,
    refresh,
  };
}
