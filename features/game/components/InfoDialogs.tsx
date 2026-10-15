import { Modal as DialogShell } from "@/components/ui/Modal";
import { Eyebrow, Ornament } from "@/components/common/Brand";
import { Crown, Settings } from "lucide-react";

/**
 * The two informational dialogs — the rulebook and the experience settings.
 *
 * Both are self-contained: they receive current values and report changes upward.
 * The settings dialog previews the sound toggle itself so the player hears the
 * change they just made.
 */

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <DialogShell onClose={onClose}>
      <span className="modal-symbol">
        <Crown strokeWidth={1.75} />
      </span>
      <Eyebrow>KNOW THE COURT</Eyebrow>
      <h3>HOW TO PLAY</h3>
      <Ornament />
      <ol className="rules-list">
        <li>
          <b>Hide.</b> The Dealer taps a card and presses Lock—or uses their one Bluff. If time runs out, the game locks it for them.
        </li>
        <li>
          <b>Shuffle.</b> Five cards are dealt. Later levels fall to three, then two.
        </li>
        <li>
          <b>Guess.</b> Pick a card before the timer reaches zero.
        </li>
        <li>
          <b>Call it.</b> If you suspect no King was placed, call Bluff. Right wins; wrong loses.
        </li>
        <li>
          <b>Turns.</b> You hide the King 7 times in a row, then your opponent hides 7 times. Later levels: 5 each, then 3 each. Higher levels award more points.        </li>
      </ol>
      <button className="gold-button wide" onClick={onClose}>
        ENTER THE KINGDOM
      </button>
    </DialogShell>
  );
}

export function SettingsModal({
  sound,
  motion,
  setSound,
  setMotion,
  onClose,
  onSoundEnabled,
}: {
  sound: boolean;
  motion: boolean;
  setSound: (value: boolean) => void;
  setMotion: (value: boolean) => void;
  onClose: () => void;
  /** Called when sound is switched ON, so the player hears immediate feedback. */
  onSoundEnabled: () => void;
}) {
  return (
    <DialogShell onClose={onClose}>
      <span className="modal-symbol">
        <Settings strokeWidth={1.75} />
      </span>
      <Eyebrow>YOUR EXPERIENCE</Eyebrow>
      <h3>SETTINGS</h3>
      <Ornament />
      <div className="settings-list">
        <div className="settings-row">
          <span>
            <label htmlFor="sound-setting">Sound &amp; music</label>
            <small>Ambient theme, countdown and result cues</small>
          </span>
          <input
            id="sound-setting"
            type="checkbox"
            checked={sound}
            onChange={(event) => {
              if (event.target.checked) onSoundEnabled();
              setSound(event.target.checked);
            }}
          />
        </div>
        <div className="settings-row">
          <span>
            <label htmlFor="motion-setting">Card animations</label>
            <small>Dealer hand and transitions</small>
          </span>
          <input
            id="motion-setting"
            type="checkbox"
            checked={motion}
            onChange={(event) => setMotion(event.target.checked)}
          />
        </div>
      </div>
      <button className="gold-button wide" onClick={onClose}>
        SAVE SETTINGS
      </button>
    </DialogShell>
  );
}