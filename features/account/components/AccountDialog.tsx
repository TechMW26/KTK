"use client";

import { useState } from "react";
import type { User } from "firebase/auth";

import { Modal as DialogShell } from "@/components/ui/Modal";
import { Eyebrow, Ornament } from "@/components/common/Brand";
import {
  upgradeWithEmail,
  startGoogleSignIn,
  startAppleSignIn,
  startFacebookSignIn,
  signInWithEmail,
  signInToExisting,
  requestPasswordReset,
  resendVerificationEmail,
  type AuthFailureReason,
} from "@/lib/firebase/accounts";
import { mayHoldCurrency, type UserProfile } from "@/lib/firebase/profile";

/**
 * The sign-in / account-upgrade dialog.
 *
 * Guests are the default and never see this unless they ask for it — the game
 * is fully playable anonymously, so this screen exists only to make progress
 * durable (which is what currency and the profile will need).
 *
 * Every provider path goes through `lib/firebase/accounts`, which LINKS the
 * credential to the existing anonymous uid rather than replacing it. That is
 * why this component never calls a raw Firebase sign-in itself.
 */

type View = "options" | "email" | "reset" | "verify" | "collision";

/**
 * Which provider triggered a collision, so the escape hatch can offer to sign in
 * with the same one. Null when no collision is pending.
 */
type CollisionProvider = "google" | "apple" | "facebook" | "email";

/** Player-facing copy for each failure. Raw Firebase codes never reach the UI. */
const MESSAGES: Record<AuthFailureReason, string> = {
  "not-configured": "Accounts aren't available right now.",
  "provider-disabled": "That sign-in method is turned off.",
  "invalid-email": "That email doesn't look right.",
  "wrong-credentials": "Email or password is incorrect.",
  "email-in-use": "That email already has a profile — sign in instead?",
  "weak-password": "Use at least 8 characters.",
  "too-many-requests": "Too many attempts. Try again in a few minutes.",
  network: "No connection — check your network.",
  // Short form: the collision view carries the full explanation, because this
  // message is the thing that tells the player their guest data is at stake.
  "credential-in-use": "That account already exists.",
  "popup-cancelled": "",
  "popup-blocked":
    "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
  "last-provider":
    "That's your only sign-in method — add another before removing it.",
  timeout: "Sign-in took too long. Please try again.",
  unknown: "Something went wrong. Please try again.",
};

/** Reasons that mean "this credential belongs to an account we can sign into". */
function isCollision(reason: AuthFailureReason | undefined): boolean {
  return reason === "credential-in-use" || reason === "email-in-use";
}

export function AccountDialog({
  user,
  profile,
  redirectError,
  onClose,
  onSignedIn,
}: {
  user: User | null;
  profile: UserProfile | null;
  /** Failure carried back from a redirect sign-in, if any. */
  redirectError?: string | null;
  onClose: () => void;
  onSignedIn: (user: User) => void;
}) {
  const [view, setView] = useState<View>("options");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Set when a collision was detected, so the view can name the provider. */
  const [collision, setCollision] = useState<CollisionProvider | null>(null);

  // A redirect failure arrives as a reason code. Derive the message instead of
  // copying it into state, so no extra render is triggered and the two sources
  // (inline action vs. redirect) cannot get out of sync.
  const shownError =
    error ?? (redirectError ? (MESSAGES[redirectError as AuthFailureReason] ?? MESSAGES.unknown) : null);

  const signedIn = Boolean(user && !user.isAnonymous);

  /**
   * Run an auth action, mapping its outcome onto this screen's state.
   *
   * The busy flag is always cleared via `finally`, because an auth call that
   * never settles must not leave every button disabled with no explanation.
   */
  const run = async (
    action: () => Promise<{ ok: boolean } & Record<string, unknown>>,
    options: { collisionProvider?: CollisionProvider } = {},
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    setCollision(null);
    setView((current) => (current === "collision" ? "options" : current));
    try {
      const result = await action();
      if (result.ok) {
        const nextUser = (result as { user?: User }).user;
        if (nextUser) onSignedIn(nextUser);
        return true;
      }
      const reason = (result as { reason?: AuthFailureReason }).reason ?? "unknown";

      // A collision is not a dead end: offer the sign-in escape hatch rather
      // than a message the player has no way to act on.
      if (isCollision(reason) && options.collisionProvider) {
        setCollision(options.collisionProvider);
        setView("collision");
        return false;
      }

      const message = MESSAGES[reason];
      // An empty message means the player backed out of provider UI: say nothing.
      if (message) setError(message);
      return false;
    } catch (error) {
      // An unexpected throw must be visible, never silent.
      const code = String((error as { message?: string }).message ?? "");
      setError(code.includes("timeout") ? MESSAGES["popup-blocked"] : MESSAGES.unknown);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async (
    options: { collisionProvider?: CollisionProvider } = {},
  ) => {
    if (!email.trim() || !password) {
      setError("Enter your email and a password.");
      return;
    }
    const ok = await run(
      () =>
        signedIn
          ? signInWithEmail(email.trim(), password)
          : upgradeWithEmail(email.trim(), password),
      options,
    );
    if (ok && !signedIn) setView("verify");
  };

  /**
   * Sign in to the account that blocked a link attempt, abandoning this guest.
   *
   * Email has no shortcut: only the player knows the existing password, so the
   * form is reused. The provider paths have nothing to collect, so they redirect
   * straight away.
   */
  const signInToColliding = async () => {
    if (collision === "email" || !collision) {
      setView("email");
      return;
    }
    await run(() => signInToExisting(collision));
  };

  return (
    <DialogShell onClose={onClose} className="account-modal">
      <span className="modal-symbol">♛</span>
      <Eyebrow>{signedIn ? "YOUR COURT" : "KEEP YOUR PROGRESS"}</Eyebrow>
      <h3>{signedIn ? "YOUR ACCOUNT" : "SIGN IN"}</h3>
      <Ornament />

      {notice && <p className="account-notice">{notice}</p>}
      {shownError && (
        <p className="account-error" role="alert">
          {shownError}
        </p>
      )}

      {signedIn ? (
        <SignedInPanel user={user as User} profile={profile} onSignOut={onClose} />
      ) : view === "options" ? (
        <div className="account-actions">
          <p className="account-copy">
            Playing as a guest is fine — but sign in to keep your progress if you
            reinstall or switch device.
          </p>
          <button
            className="outline-button wide"
            disabled={busy}
            onClick={() =>
              void run(() => startGoogleSignIn(), { collisionProvider: "google" })
            }
          >
            CONTINUE WITH GOOGLE
          </button>
          <button
            className="outline-button wide"
            disabled={busy}
            onClick={() =>
              void run(() => startAppleSignIn(), { collisionProvider: "apple" })
            }
          >
            CONTINUE WITH APPLE
          </button>
          <button
            className="outline-button wide"
            disabled={busy}
            onClick={() =>
              void run(() => startFacebookSignIn(), { collisionProvider: "facebook" })
            }
          >
            CONTINUE WITH FACEBOOK
          </button>
          <button className="gold-button wide" disabled={busy} onClick={() => setView("email")}>
            CONTINUE WITH EMAIL
          </button>
          <button className="account-link" disabled={busy} onClick={onClose}>
            Not now — keep playing as guest
          </button>
        </div>
      ) : view === "email" ? (
        <div className="account-actions">
          <label htmlFor="acct-email">EMAIL</label>
          <input
            id="acct-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="acct-password">PASSWORD</label>
          <input
            id="acct-password"
            type="password"
            autoComplete={signedIn ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className="gold-button wide"
            disabled={busy}
            onClick={() => void submitEmail({ collisionProvider: "email" })}
          >
            {busy ? "WORKING…" : signedIn ? "SIGN IN" : "CREATE ACCOUNT"}
          </button>
          <button className="account-link" disabled={busy} onClick={() => setView("reset")}>
            Forgot your password?
          </button>
          <button className="account-link" disabled={busy} onClick={() => setView("options")}>
            Back
          </button>
        </div>
      ) : view === "collision" ? (
        <div className="account-actions">
          <p className="account-copy">
            {collision === "email"
              ? "That email already has a profile."
              : "That account already has a profile."}
          </p>
          {/* The honest consequence: signing in moves the player to the existing
              account's uid, so this device's guest data does not come along.
              Merging the two is deliberately not offered. */}
          <p className="account-warning">
            Signing in will switch you to that account. Your guest progress on
            this device won&apos;t carry over.
          </p>
          <button className="gold-button wide" disabled={busy} onClick={() => void signInToColliding()}>
            {busy ? "WORKING…" : "SIGN IN TO THAT ACCOUNT"}
          </button>
          <button className="account-link" disabled={busy} onClick={() => setView("options")}>
            Not now — keep playing as guest
          </button>
        </div>
      ) : view === "reset" ? (
        <div className="account-actions">
          <p className="account-copy">We&apos;ll email you a link to set a new password.</p>
          <label htmlFor="reset-email">EMAIL</label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button
            className="gold-button wide"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await requestPasswordReset(email.trim());
                if (result.ok) {
                  setNotice("If that address has an account, a reset link is on its way.");
                }
                return result;
              })
            }
          >
            SEND RESET LINK
          </button>
          <button className="account-link" disabled={busy} onClick={() => setView("email")}>
            Back
          </button>
        </div>
      ) : (
        <div className="account-actions">
          <p className="account-copy">
            We sent a verification link to <strong>{email}</strong>. You can play
            right away — verifying just unlocks currency later.
          </p>
          <button
            className="outline-button wide"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await resendVerificationEmail();
                if (result.ok) setNotice("Verification email sent again.");
                return result;
              })
            }
          >
            RESEND EMAIL
          </button>
          <button className="gold-button wide" disabled={busy} onClick={onClose}>
            CONTINUE PLAYING
          </button>
        </div>
      )}
    </DialogShell>
  );
}

/** Summary shown once a real account is linked. */
function SignedInPanel({
  user,
  profile,
  onSignOut,
}: {
  user: User;
  profile: UserProfile | null;
  onSignOut: () => void;
}) {
  const canHoldCurrency = mayHoldCurrency(user, profile);
  const label = user.email ?? user.displayName ?? "Signed in";

  return (
    <div className="account-actions">
      <p className="account-identity">{label}</p>
      <div className="account-rows">
        <div className="account-row">
          <span>Wallet</span>
          <strong>{canHoldCurrency ? "Ready" : "Locked until verified"}</strong>
        </div>
        <div className="account-row">
          <span>Sign-in methods</span>
          <strong>{(profile?.providers ?? []).map(providerLabel).join(", ") || "—"}</strong>
        </div>
      </div>
      <button className="gold-button wide" onClick={onSignOut}>
        DONE
      </button>
    </div>
  );
}

/** Provider ids are Firebase's; players should see words. */
function providerLabel(id: string): string {
  if (id === "password") return "Email";
  if (id === "google.com") return "Google";
  if (id === "apple.com") return "Apple";
  if (id === "facebook.com") return "Facebook";
  if (id === "anonymous") return "Guest";
  return id;
}
