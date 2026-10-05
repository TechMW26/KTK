"use client";

import { useState } from "react";
import type { User } from "firebase/auth";

import { Modal as DialogShell } from "@/components/ui/Modal";
import { Eyebrow, Ornament } from "@/components/common/Brand";
import {
  linkAdditionalProvider,
  setAccountDisplayName,
  unlinkProvider,
  type AuthFailureReason,
} from "@/lib/firebase/accounts";
import {
  mayHoldCurrency,
  softDeleteProfile,
  MAX_DISPLAY_NAME_LENGTH,
  type UserProfile,
} from "@/lib/firebase/profile";

/**
 * The signed-in player's account screen.
 *
 * Distinct from the sign-in dialog: that one exists to create a durable
 * identity, this one manages the account once it exists. It is only ever
 * rendered for a non-anonymous user.
 *
 * Destructive actions are deliberately the most explicit thing here. Unlinking
 * the last provider and deleting the account are both one-way from the client,
 * so each states its consequence before it can be triggered.
 */

export function AccountScreen({
  user,
  profile,
  onClose,
  onChanged,
  onLeaveRooms,
}: {
  user: User;
  profile: UserProfile | null;
  onClose: () => void;
  /** Re-read the profile after a change. */
  onChanged: () => Promise<void>;
  /**
   * Leave any active online room before the account is deleted, so an opponent
   * is not left waiting on a player who no longer exists. Returns when done.
   */
  onLeaveRooms: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(
    profile?.displayName ?? user.displayName ?? "",
  );
  const [editingName, setEditingName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const providers = profile?.providers ?? [];
  const canHoldCurrency = mayHoldCurrency(user, profile);
  const isLastProvider = providers.length <= 1;

  /** Run an action, always clearing busy and never leaving the screen stuck. */
  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveName = () =>
    act(async () => {
      const next = displayName.trim();
      if (!next) {
        setError("Enter a display name.");
        return;
      }
      await setAccountDisplayName(user, next);
      await onChanged();
      setEditingName(false);
      setNotice("Display name updated.");
    });

  const linkProvider = (provider: "google" | "apple") =>
    act(async () => {
      const result = await linkAdditionalProvider(provider);
      if (!result.ok) {
        setError(linkFailureCopy(result.reason));
        return;
      }
      // A redirect is in flight; the page is already navigating away.
    });

  const removeProvider = (providerId: string) =>
    act(async () => {
      const result = await unlinkProvider(providerId);
      if (!result.ok) {
        setError(
          result.reason === "last-provider"
            ? "This is your only sign-in method — add another before removing it."
            : linkFailureCopy(result.reason),
        );
        return;
      }
      await onChanged();
      setNotice("Sign-in method removed.");
    });

  const deleteAccount = () =>
    act(async () => {
      // Leave the room first: soft-deleting while mid-match would strand the
      // opponent on a player who can never return.
      await onLeaveRooms();
      await softDeleteProfile(user.uid);
      setNotice("Account scheduled for deletion.");
      setConfirmDelete(false);
      onClose();
    });

  return (
    <DialogShell onClose={onClose} className="account-modal">
      <span className="modal-symbol">♛</span>
      <Eyebrow>YOUR COURT</Eyebrow>
      <h3>YOUR ACCOUNT</h3>
      <Ornament />

      {notice && <p className="account-notice">{notice}</p>}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      <div className="account-sections">
        {/* ---- Identity ---- */}
        <section className="account-section">
          <h4>IDENTITY</h4>
          {editingName ? (
            <>
              <input
                aria-label="Display name"
                value={displayName}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <div className="account-inline-actions">
                <button className="gold-button" disabled={busy} onClick={() => void saveName()}>
                  SAVE
                </button>
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => {
                    setEditingName(false);
                    setDisplayName(profile?.displayName ?? user.displayName ?? "");
                    setError(null);
                  }}
                >
                  CANCEL
                </button>
              </div>
            </>
          ) : (
            <div className="account-row">
              <span>{profile?.displayName || "No display name"}</span>
              <button className="account-link inline" disabled={busy} onClick={() => setEditingName(true)}>
                Edit
              </button>
            </div>
          )}
          <div className="account-row">
            <span>Member since</span>
            <strong>
              {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"}
            </strong>
          </div>
        </section>

        {/* ---- Sign-in methods ---- */}
        <section className="account-section">
          <h4>SIGN-IN METHODS</h4>
          <div className="account-rows">
            {providers.map((id) => (
              <div className="account-row" key={id}>
                <span>{providerLabel(id)}</span>
                {isLastProvider ? (
                  <strong className="account-muted">Only method</strong>
                ) : (
                  <button
                    className="account-link inline"
                    disabled={busy}
                    onClick={() => void removeProvider(id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {!providers.includes("google.com") && (
            <button
              className="outline-button wide"
              disabled={busy}
              onClick={() => void linkProvider("google")}
            >
              ADD GOOGLE
            </button>
          )}
          {!providers.includes("apple.com") && (
            <button
              className="outline-button wide"
              disabled={busy}
              onClick={() => void linkProvider("apple")}
            >
              ADD APPLE
            </button>
          )}
        </section>

        {/* ---- Wallet ---- */}
        <section className="account-section">
          <h4>WALLET</h4>
          <div className="account-row">
            <span>Currency</span>
            <strong className="account-muted">
              {canHoldCurrency ? "Coming soon" : "Locked until verified"}
            </strong>
          </div>
        </section>

        {/* ---- Danger zone ---- */}
        <section className="account-section account-danger">
          <h4>DANGER ZONE</h4>
          {confirmDelete ? (
            <>
              <p className="account-warning">
                This deletes your profile and signs you out. Type <strong>DELETE</strong> to
                confirm. Your guest progress on this device is not affected.
              </p>
              <input
                aria-label="Type DELETE to confirm"
                value={deleteText}
                onChange={(event) => setDeleteText(event.target.value)}
                placeholder="DELETE"
              />
              <div className="account-inline-actions">
                <button
                  className="quit-confirm"
                  disabled={busy || deleteText !== "DELETE"}
                  onClick={() => void deleteAccount()}
                >
                  DELETE ACCOUNT
                </button>
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmDelete(false);
                    setDeleteText("");
                  }}
                >
                  CANCEL
                </button>
              </div>
            </>
          ) : (
            <button
              className="outline-button wide"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              DELETE ACCOUNT
            </button>
          )}
        </section>
      </div>

      <button className="gold-button wide" onClick={onClose}>
        DONE
      </button>
    </DialogShell>
  );
}

/** Player-facing copy for failures that can occur while managing an account. */
function linkFailureCopy(reason: AuthFailureReason): string {
  if (reason === "credential-in-use") {
    return "That account already has a profile, so it can't be added here.";
  }
  if (reason === "popup-blocked") {
    return "Your browser blocked the sign-in window. Allow pop-ups and try again.";
  }
  if (reason === "network") return "No connection — check your network.";
  if (reason === "too-many-requests") return "Too many attempts. Try again in a few minutes.";
  return "Something went wrong. Please try again.";
}

/** Provider ids are Firebase's; players should see words. */
function providerLabel(id: string): string {
  if (id === "password") return "Email";
  if (id === "google.com") return "Google";
  if (id === "apple.com") return "Apple";
  if (id === "anonymous") return "Guest";
  return id;
}
