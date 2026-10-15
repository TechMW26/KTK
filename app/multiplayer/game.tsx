"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LEVELS, levelConfig, LEVEL_COUNT, roundsPerLevel, TOTAL_ROUNDS } from "@/lib/game/rules";
import { roundVerdictCopy } from "@/features/game/constants/copy";
import { RULESET_ROUNDS, roundInCourt } from "@/lib/game/flow";
import { dealTimings, PULL_MS, SHUFFLE_MS } from "@/features/game/constants/pacing";
import { PowerDock } from "@/features/game/components/PowerDock";
import { SelectionHand } from "@/features/game/components/SelectionHand";
import { DealerSwipe } from "@/features/game/components/DealerSwipe";
import { CardRow } from "@/features/game/components/CardRow";
import { visibleGuessInspection } from "@/lib/multiplayer/inspection";
import { InspectionVisual } from "@/features/game/components/InspectionVisual";
import { StrategyModal } from "@/features/game/components/StrategyModal";
import { picksThisCourt, summarisePicks } from "@/features/game/logic/strategy";
import type useMultiplayer from "@/hooks/useMultiplayer";
import { useFriends } from "@/hooks/useFriends";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { LifePips } from "@/features/game/components/GameHeader";
import { RoundMedallion } from "@/features/game/components/RoundMedallion";
import { Crown, LogOut, Menu } from "lucide-react";
import { MpEyebrow, MpFrame, MpLogo, MpModal, MpOrnament } from "./ui";
import { UNKNOWN_PLAYER } from "@/lib/multiplayer/displayName";

/** How long the "YOUR OPPONENT" intro shows before the first hide (LET'S PLAY skips it). */
const MATCH_INTRO_MS = 3500;
type MP = ReturnType<typeof useMultiplayer>;

/**
 * The perspective the deck on the table is drawn in for this round.
 *
 * The cards always belong to whoever hid the King, so the deck is shown the way
 * its OWNER holds it: upright with the curve facing the dealer, served in over
 * the dealer's own edge. A round therefore never changes the deck's shape —
 * hiding the King, serving the cards, the guess and the reveal all keep the same
 * fan — and only a new dealer turns it over. The local board uses the same rule
 * (see `tableOpposite` in app/page.tsx).
 */
function deckPerspective(g: { dealerSeat: number }, me: number) {
  const iDealt = g.dealerSeat === me;
  return {
    opposite: !iDealt,
    fromBottom: iDealt,
    /**
     * The picked card travels back toward the GUESSER, who is by definition the
     * seat that did not deal — i.e. the far side of a deck drawn for its owner.
     * `--pull-dir` is read inside the row, so one sign serves both orientations.
     */
    pullDir: -1,
  } as const;
}

/**
 * In-match renderer. Everything is derived from the authoritative Firebase
 * `game` object exposed by the hook, so both clients converge to the same
 * screen and recover cleanly after a reconnect.
 */
export default function GameView({ mp, onLeave }: { mp: MP; onLeave: () => void }) {
  const g = mp.game;
  // Strategy panel visibility + which seat is charted. Owned here (not per phase)
  // so the panel opens identically from every in-match screen, exactly like the
  // single-player board where one overlay covers the whole match.
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [strategyTab, setStrategyTab] = useState<0 | 1>(0);
  const [bluffOpen, setBluffOpen] = useState(false);
  /** Active-game exit confirmation. Leaving mid-match loses the game. */
    const [exitOpen, setExitOpen] = useState(false);
  const requestExit = () => setExitOpen(true);
  /**
   * "YOUR OPPONENT: <name>" intro before the very first hide, so a player always
   * knows who they were matched with. Only at the real start of a match (not on
   * a reconnect mid-game), once per visit, and only after the name has synced.
   */
  const [introSeen, setIntroSeen] = useState(false);
  const atMatchStart =
    !!g && g.phase === "dealer-hide" && g.level === 0 && g.round === 1 && !(g.history?.length);
  const showIntro = atMatchStart && !introSeen && !!mp.opponent;
  useEffect(() => {
    if (!showIntro) return;
    const id = window.setTimeout(() => setIntroSeen(true), MATCH_INTRO_MS);
    return () => window.clearTimeout(id);
  }, [showIntro]);

  if (!g) {
    return (
      <MpFrame>
        <HeaderActions onLeave={onLeave} label="Leave match" />
        <Center title="SYNCING" eyebrow="RESTORING THE KINGDOM" onLeave={onLeave}>
          <p className="mp-muted">Rebuilding the game state…</p>
        </Center>
      </MpFrame>
    );
  }

  const me = mp.mySeat ?? 0;
  const cfg = levelConfig(g.level);
  // The panel charts a COURT, and the engine already records each history row
  // against the court it was played in — the optional engine maps its global
  // 1..RULESET_ROUNDS counter back through `strategyEntryFor`. So the row's own
  // `level` is the court, which is what the local panel filters on too.
  const entries = picksThisCourt(g.history ?? [], g.level, strategyTab);
  const frequency = summarisePicks(entries, cfg.cards);
  const canCallBluff = g.phase === "guess" && g.actingSeat === me;

  const dock =
    g.phase === "match-end" ? null : (
      <PowerDock
        bluffActive={canCallBluff}
        onStrategy={() => {
          setStrategyTab(me as 0 | 1);
          setStrategyOpen(true);
        }}
        onBluff={() => setBluffOpen(true)}
      />
    );

  /** Unobtrusive "add the stranger you're playing" affordance, in the header. */
  const addFriend = <AddFriendButton mp={mp} />;

  const panel = (
    <>
      {strategyOpen ? (
        <StrategyModal
          names={["You", mp.opponent ?? "Opponent"]}
          tab={strategyTab}
          setTab={setStrategyTab}
          entries={entries}
          frequency={frequency}
          cardCount={cfg.cards}
          levelName={cfg.name}
          onClose={() => setStrategyOpen(false)}
        />
      ) : null}
      {bluffOpen ? (
        <MpModal
          eyebrow="TRUST YOUR INSTINCT"
          title="CALL THE BLUFF?"
          symbol="◑ ◒"
          onClose={() => setBluffOpen(false)}
          className="bluff-modal"
        >
          <p>Do you think the Dealer hid no King this round?</p>
          <button
            className="gold-button wide"
            onClick={() => {
              setBluffOpen(false);
              void mp.guess(null, true);
            }}
          >
            YES — CALL BLUFF
          </button>
          <button className="outline-button wide" onClick={() => setBluffOpen(false)}>
            NO — PICK A CARD
          </button>
          <small>A wrong accusation gives the round to the Dealer.</small>
        </MpModal>
      ) : null}
      {exitOpen ? (
        <MpModal
          eyebrow="LEAVE THE KINGDOM?"
          title="EXIT GAME"
          symbol={<LogOut strokeWidth={1.75} />}
          onClose={() => setExitOpen(false)}
          className="quit-modal"
        >
          <p>Your current game will be lost.</p>
          <button
            className="quit-confirm wide"
            onClick={() => {
              setExitOpen(false);
              onLeave();
            }}
          >
            EXIT
          </button>
          <button className="outline-button wide" onClick={() => setExitOpen(false)}>
            CANCEL
          </button>
        </MpModal>
      ) : null}
    </>
  );

   // Who you are playing — shown before anything else, so the hide clock has not started.
  if (showIntro) {
    const opponentName = mp.opponent ?? UNKNOWN_PLAYER;
    const myName = mp.myName ?? UNKNOWN_PLAYER;
    return (
      <div className="online-board">
        <MpFrame>
          <section className="mp-stage match-intro" role="status" aria-live="polite">
            <span className="level-crown">
              <Crown strokeWidth={1.75} />
            </span>
            <MpEyebrow>YOUR OPPONENT</MpEyebrow>
            <h2 className="mp-title">{opponentName.toUpperCase()}</h2>
            <MpOrnament />
            <p>
              You are playing as <strong>{myName}</strong>
            </p>
            <p className="mp-muted">
              {g.dealerSeat === me ? "You hide the King first." : `${opponentName} hides the King first.`}
            </p>
            <button className="gold-button wide" onClick={() => setIntroSeen(true)}>
              LET&apos;S PLAY
            </button>
          </section>
        </MpFrame>
      </div>
    );
  }

  // Match over.
  if (g.phase === "match-end") return <MatchEnd mp={mp} onLeave={onLeave} />;
  if (g.phase === "level-end")
    return (
      <div className="online-board">
        <LevelEnd mp={mp} onRequestExit={requestExit} friendAction={addFriend} />
        <footer className="match-tools">{dock}</footer>
        {panel}
      </div>
    );

  // Result of a round is available to replay.
  if (g.phase === "reveal" && g.lastResult)
    return (
      <div className="online-board">
        <Reveal mp={mp} onRequestExit={requestExit} friendAction={addFriend} />
        <footer className="match-tools">{dock}</footer>
        {panel}
      </div>
    );

  return (
    <div className="online-board">
      <LiveRound mp={mp} bluffOpen={bluffOpen} onRequestExit={requestExit} friendAction={addFriend} />
      <footer className="match-tools">{dock}</footer>
      {panel}
    </div>
  );
}

/** Top-right action cluster: the friend affordance sits immediately left of Leave. */
function HeaderActions({
  onLeave,
  label,
  friendAction,
}: {
  onLeave: () => void;
  label: string;
  friendAction?: ReactNode;
}) {
  return (
    <div className="mp-head-actions">
      {friendAction}
      <button className="quit-button" onClick={onLeave} aria-label={label}>
        <LogOut size={18} strokeWidth={2} />
      </button>
    </div>
  );
}

function Header({ mp, activeSeconds }: { mp: MP; activeSeconds: number | null }) {
  const g = mp.game!;
  const cfg = levelConfig(g.level);
  const me = mp.mySeat ?? 0;
  const them = me === 0 ? 1 : 0;
  const myActive = g.phase === "guess" || g.phase === "dealer-hide" ? g.actingSeat === me : false;
  // The optional engine counts rounds globally (1..30). Players think in courts,
  // so show the round WITHIN the current court, like the local game does.
  const shownRound = mp.useOptionalFlow ? roundInCourt(g.round) : g.round;

  return (
    <div className="mp-head">
      <header className="game-header">
        <MpLogo compact />
        <RoundMedallion level={g.level + 1} round={shownRound} total={cfg.rounds} />
        <div className="header-controls">
          <MpLiveTimer seconds={activeSeconds} cfgSeconds={cfg.seconds} />
        </div>
        <div className="score-strip mp-score">
          <span className={myActive ? "active-turn" : ""}>
            <strong>You</strong>
            <b>{mp.livesMode && g.lives ? g.lives[me] : g.scores[me]}</b>
          </span>
          <i>
            VS
          </i>
          <span>
            <b>{mp.livesMode && g.lives ? g.lives[them] : g.scores[them]}</b>
            <strong>{mp.opponent ?? "Opponent"}</strong>
          </span>
        </div>
      </header>
      {mp.livesMode && g.lives ? (
        <LivesHeader myLives={g.lives[me] ?? 0} theirLives={g.lives[them] ?? 0} myName="You" theirName={mp.opponent ?? "Opponent"} />
      ) : null}
    </div>
  );
}

/** Compact hearts bar shown under the score strip when 5-lives mode is on. */
function LivesHeader({
  myLives,
  theirLives,
  myName,
  theirName,
}: {
  myLives: number;
  theirLives: number;
  myName: string;
  theirName: string;
}) {
  return (
    <div className="mp-lives-strip">
      <span className="mp-lives-side">
        <em>{myName}</em>
        <span className="lives-row"><LifePips filled={myLives} /></span>
      </span>
      <span className="mp-lives-vs">
        <em>LIVES</em>
      </span>
      <span className="mp-lives-side right">
        <span className="lives-row"><LifePips filled={theirLives} /></span>
        <em>{theirName}</em>
      </span>
    </div>
  );
}

function MpLiveTimer({ seconds, cfgSeconds }: { seconds: number | null; cfgSeconds: number }) {
  const [sec, setSec] = useState(seconds ?? 0);
  useEffect(() => {
    if (seconds == null) return;
    // Sync local ticker to the authoritative seconds each round (pre-existing).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSec(seconds);
    const id = setInterval(() => setSec((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  if (seconds == null) {
    return (
      <div className="header-controls">
        <span className="mini-settings mp-headstatic">
          <Crown strokeWidth={2} />
        </span>
      </div>
    );
  }
  return (
    <div className="header-controls">
      <div className="timer" style={{ "--timer": `${Math.max(0, sec / (cfgSeconds || 1)) * 360}deg` } as React.CSSProperties}>
        <strong>{sec}</strong>
        <small>SEC</small>
      </div>
    </div>
  );
}

/** Dealer-hide + guess phases (the interactive part of a round). */
function LiveRound({
  mp,
  bluffOpen,
  onRequestExit,
  friendAction,
}: {
  mp: MP;
  bluffOpen: boolean;
  onRequestExit: () => void;
  friendAction?: ReactNode;
}) {
  const g = mp.game!;
  const me = mp.mySeat ?? 0;
  const cfg = levelConfig(g.level);
  const isDealerRound = g.phase === "dealer-hide";
  const iAmDealer = g.dealerSeat === me;
  const iAct = g.actingSeat === me;

  if (!mp.opponentConnected) {
    return (
      <MpFrame>
        <HeaderActions onLeave={onRequestExit} label="Leave" friendAction={friendAction} />
        <Center title="OPPONENT DISCONNECTED" eyebrow="CONNECTION ISSUE" onLeave={onRequestExit}>
          <MpOrnament />
          <p className="mp-muted">
            {mp.opponent ?? "Your opponent"} has dropped. The match will resume when they reconnect.
          </p>
        </Center>
      </MpFrame>
    );
  }

const isGuess = g.phase === "guess";
/**
 * The guesser's committed pick, shown to the OTHER player the moment it lands.
 * Read straight from the authoritative `pendingGuess` on the reveal beat, so
 * both clients agree and no extra state has to be synced.
 */
const opponentPick =
  g.phase === "reveal" && g.pendingGuess && g.pendingGuess.guesserSeat !== me
    ? (g.pendingGuess.calledBluff ? null : g.pendingGuess.cardIndex)
    : null;

  // The deck stays in the perspective of the seat that hid the King, so locking
  // the hiding place no longer turns it over. See `deckPerspective`.
  const { opposite } = deckPerspective(g, me);

  return (
    <MpFrame>
      <HeaderActions onLeave={onRequestExit} label="Leave match" friendAction={friendAction} />
      <Header mp={mp} activeSeconds={iAct && (isGuess || isDealerRound) ? cfg.seconds : null} />

      {g.phase === "shuffle" ? <ShuffleStage mp={mp} /> : null}
      {isDealerRound && iAmDealer && iAct ? <HideStage mp={mp} /> : null}
      {isDealerRound && !(iAmDealer && iAct) ? (
        <Waiting
          title="OPPONENT'S TURN"
          text={`${mp.opponent ?? "Opponent"} is hiding the King…`}
          row={<OpponentRow mp={mp} />}
        />
      ) : null}
      {isGuess && iAct ? (
        <GuessStage mp={mp} bluffOpen={bluffOpen} />
      ) : null}
      {isGuess && !iAct ? (
        <Waiting
          title="OPPONENT'S TURN"
          text={`${mp.opponent ?? "Opponent"} is guessing a card…`}
          row={<OpponentRow mp={mp} />}
        />
      ) : null}
      {opponentPick !== null ? (
        <CardRow opposite={opposite}>
          {Array.from({ length: cfg.cards }, (_, i) => (
            <PlayingCard key={i} index={i} fanCount={cfg.cards} fanSlot={i} chosen={i === opponentPick} disabled />
          ))}
          <SelectionHand index={opponentPick} cardCount={cfg.cards} opposite={opposite} fromOpponent faint />
        </CardRow>
      ) : null}

      {g.phase === "shuffle" || iAct ? null : (
        <p className="mp-muted mp-waitsmall">Waiting for the other player. Keep the game open.</p>
      )}
    </MpFrame>
  );
}

/** The opponent's fan is idle while they act. Only a guesser's public aim may
 * lift a card and display the opponent's pointing hand. Stale hiding-phase
 * inspection data from older clients is deliberately ignored.
 */
function OpponentRow({ mp }: { mp: MP }) {
  const g = mp.game!;
  const cfg = levelConfig(g.level);
  const inspecting = visibleGuessInspection(g, cfg.cards);
  // Their row follows the round's dealer too, so the fan keeps the same shape
  // whether the opponent is hiding their King or hunting yours.
  const { opposite } = deckPerspective(g, mp.mySeat ?? 0);

  return (
    <CardRow opposite={opposite} className="turn-idle">
      {Array.from({ length: cfg.cards }, (_, i) => (
        <PlayingCard
          key={i}
          index={i}
          fanCount={cfg.cards}
          fanSlot={i}
          disabled
          inspected={inspecting === i}
        />
      ))}
      {inspecting !== null ? (
        <InspectionVisual index={inspecting} cardCount={cfg.cards} opposite={opposite} remote />
      ) : null}
    </CardRow>
  );
}

/**
 * Shared local/online card-distribution beat. Nobody acts until the cards
 * settle and the dealer's forearm has withdrawn above the screen. The parent
 * still guards a stalled peer without changing the authoritative card order.
 */
function ShuffleStage({ mp }: { mp: MP }) {
  const g = mp.game!;
  const cfg = levelConfig(g.level);
  // The deal is watched from the dealer's side: the hand comes in over their own
  // edge and the cards land in the perspective their deck will keep for the round.
  const { opposite, fromBottom } = deckPerspective(g, mp.mySeat ?? 0);
  // The deal cadence is driven by the shared pacing constant so both clients run
  // the identical animation window and leave the beat on the same frame.
  const deal = useMemo(() => dealTimings(cfg.cards, SHUFFLE_MS), [cfg.cards]);

  // Whoever is watching runs the same clock; the first to finish advances the
  // authoritative phase, so both clients leave this beat together.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void mp.beginGuess();
    }, Math.round(deal.total * 1000));
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.level, g.round]);

  return (
    <section
      className="mp-stage play-stage shuffle-stage"
      style={{ "--shuffle-ms": `${deal.windowSec}s` } as React.CSSProperties}
    >
      <div className="stage-title">
        <MpEyebrow>DEALING</MpEyebrow>
        <h2 className="mp-title">FIND THE KING</h2>
        <p>Arranging the cards…</p>
      </div>
      <DealerSwipe cards={cfg.cards} opposite={opposite} fromBottom={fromBottom} />
    </section>
  );
}

function HideStage({ mp }: { mp: MP }) {
  const g = mp.game!;
  const cfg = levelConfig(g.level);
  const me = mp.mySeat ?? 0;
  const bluffUsed = g.bluffsUsed[me];
  const [isBluff, setIsBluff] = useState(false);
  const [kingIndex, setKingIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const canLock = isBluff || kingIndex !== null;
  /** Hide clock — same seconds as the guess clock, like the local game. */
  const [left, setLeft] = useState(cfg.seconds);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeft(cfg.seconds);
  }, [cfg.seconds, g.round]);

  useEffect(() => {
    if (busy) return;
    if (left <= 0) {
      // Time's up: lock what they chose; if nothing, a random card (never a
      // silent Bluff). Without this a dealer who walked away froze the match.
      const autoKing = isBluff ? null : (kingIndex ?? Math.floor(Math.random() * cfg.cards));
      const id = setTimeout(() => {
        setBusy(true);
        void mp.hideCard(autoKing, isBluff).finally(() => setBusy(false));
      }, 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, busy]);

  const lock = async () => {
    if (!canLock || busy) return;
    // The selected hiding place remains local until the secret is locked.
    setBusy(true);
    await mp.hideCard(kingIndex, isBluff);
    setBusy(false);
  };

  return (
    <section className="mp-stage">
      <div className="stage-title">
        <MpEyebrow>YOUR TURN</MpEyebrow>
        <h2 className="mp-title">HIDE THE KING</h2>
        <p>{left <= 5 ? `Hurry! ${left}s — tap a card, then press LOCK.` : "Tap a card, then press LOCK — or use your Bluff."}</p>
      </div>
      {/* Place the King in the deck the way you hold it: this row is the one the
          player handles directly, so it stays upright while the round's deck is
          drawn from the dealer's side — which for this round is YOU. */}
      <div className="cards-row fanned dealer-choice turn-active">
        {Array.from({ length: cfg.cards }, (_, i) => (
          <PlayingCard
            key={i}
            index={i}
            fanCount={cfg.cards}
            fanSlot={i}
            chosen={!isBluff && kingIndex === i}
            inspected={!isBluff && kingIndex === i}
            disabled={busy || isBluff}
            onClick={() => {
              setIsBluff(false);
              setKingIndex(i);
            }}
          />
        ))}
        <SelectionHand index={isBluff ? null : kingIndex} cardCount={cfg.cards} />
      </div>
      <div className="dealer-actions">
        <button
          className={["bluff-choice", isBluff ? "active" : ""].join(" ")}
          disabled={bluffUsed || busy}
          onClick={() => {
            setIsBluff(true);
            setKingIndex(null);
          }}
        >
          <span>
            <Menu strokeWidth={2} />
          </span>
          <b>{bluffUsed ? "BLUFF USED" : "BLUFF"}</b>
          <small>
            {bluffUsed
              ? "Ready next court"
              : "No King · once per court"}
          </small>
        </button>
        <button className="gold-button" disabled={!canLock || busy} onClick={lock}>
          {busy ? "LOCKING…" : isBluff ? "LOCK BLUFF" : "LOCK HIDING PLACE"}
        </button>
      </div>
    </section>
  );
}

function GuessStage({
  mp,
  bluffOpen,
}: {
  mp: MP;
  bluffOpen: boolean;
}) {
  const g = mp.game!;
  const me = mp.mySeat ?? 0;
  const cfg = levelConfig(g.level);
  const seconds = cfg.seconds;
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(seconds);
  /** Card aimed at with the first tap, awaiting the confirming second tap. */
  const [targetCard, setTargetCard] = useState<number | null>(null);
  /**
   * The card playing its "pulled toward this player" beat. Presentation only —
   * it is cleared when the animation ends and nothing reads it to decide an
   * outcome. The direction comes from the row's perspective, so seat 1 sees the
   * card pulled the opposite way to seat 0.
   */
  const [pullCard, setPullCard] = useState<number | null>(null);
  // This stage is only ever mounted for the GUESSER, so the round's dealer is
  // necessarily the other seat: the deck is theirs and the fan keeps the shape
  // their hiding stage and their serve gave it. See `deckPerspective`.
  const { opposite, pullDir } = deckPerspective(g, me);
  /**
   * Did the dealer spend their Bluff in an EARLIER round of this court? Read from
   * finished rounds only — `g.bluffsUsed` is already true during a bluff round
   * itself, so showing that would give the bluff away.
   */
  const dealerBluffSpent = (g.history ?? []).some(
    (h) => h.level === g.level && h.dealer === g.dealerSeat && h.wasBluff,
  );
  /** Pick committed: the turn is over. */
  const locked = busy || picked !== null;
  /** Cards can't be tapped while committed OR while the Bluff dialog is open. */
  const done = locked || bluffOpen;

  /**
   * The aim IS the local inspection: aiming at card #2 (without confirming)
   * both lights it up here and tells the opponent to draw the physical pick-up.
   * This is deliberately the SAME `targetCard` the existing two-tap interaction
   * already maintains, so no new gesture and no new mechanic is introduced — the
   * only addition is that the temporary state is now also mirrored to RTDB.
   */
  useEffect(() => {
    mp.setInspecting(done ? null : targetCard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCard, done]);

  // Never leave a stale hand behind when this stage unmounts (round over, turn
  // changed, tab closed mid-aim) — Part 14.
  useEffect(() => () => mp.setInspecting(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Reset the countdown when a new round begins (pre-existing behaviour).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeft(seconds);
    // Drop any unconfirmed aim so the next round starts from a clean slate.
    setTargetCard(null);
  }, [seconds, g.round]);

  useEffect(() => {
    // Only a committed pick stops the clock. Opening the Bluff dialog used to
    // freeze it, so a player could stall the match forever.
    if (locked) return;
    if (left <= 0) {
      void mp.guess(null, false);
      return;
    }
    const id = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, locked]);

  /**
   * Two-step guess: the first tap aims at a card (pointer + highlight) and the
   * second tap on that same card commits. Tapping a different card moves the
   * aim. Only the second tap writes the pick to Firebase.
   */
  const pick = async (i: number) => {
    if (done) return;
    if (targetCard !== i) {
      setTargetCard(i);
      return;
    }
    // Confirming ends the inspection: release the aim before the pull plays, so
    // the opponent's screen stops showing the hold and reads the committed pick
    // instead. The game action itself is untouched (still only `mp.guess`).
    setTargetCard(null);
    mp.setInspecting(null);
    // Play the pull before handing off to the existing guess write, so the card
    // appears to leave the table with the player. The outcome is unchanged: the
    // write below is still the only thing that affects game state.
    setPullCard(i);
    window.setTimeout(() => setPullCard(null), PULL_MS);
    setPicked(i);
    setBusy(true);
    await mp.guess(i, false);
    setBusy(false);
  };

  return (
    <section className="mp-stage">
      <div className="stage-title">
        <MpEyebrow>YOUR TURN</MpEyebrow>
        <h2 className="mp-title">FIND THE KING</h2>
        <p>{locked ? "Revealing…" : dealerBluffSpent
          ? "Tap a card, then confirm. (Their Bluff is used — the King is here.)"
          : "Tap a card, then confirm. Think there's no King? Call Bluff."}</p>
      </div>
      <CardRow opposite={opposite} className="turn-active" style={{ "--pull-dir": pullDir } as React.CSSProperties}>
        {Array.from({ length: cfg.cards }, (_, i) => (
          <PlayingCard
            key={i}
            index={i}
            fanCount={cfg.cards}
            fanSlot={i}
            chosen={picked === i || targetCard === i}
            disabled={done}
            pulling={pullCard === i}
            inspected={!done && picked === null && targetCard === i}
            onClick={() => pick(i)}
          />
        ))}
        {picked === null && (
          <SelectionHand index={targetCard} cardCount={cfg.cards} opposite={opposite} />
        )}
      </CardRow>
      <div className="guess-actions">
        <button className="gold-button" disabled={done || targetCard === null} onClick={() => { if (targetCard !== null) void pick(targetCard); }}>
          {targetCard === null ? "TAP A CARD" : `CONFIRM CARD ${opposite ? cfg.cards - targetCard : targetCard + 1}`}
        </button>
      </div>
    </section>
  );
}

function Waiting({ title, text, row }: { title: string; text: string; row?: ReactNode }) {
  return (
    <section className="mp-stage">
      <div className="turn-indicator opponent-turn mp-turnpulse">
        <span className="turn-dot">●</span>
        <span className="turn-text">
          <b>{title}</b>
          <small>Watch their hand move — your turn is next.</small>
        </span>
      </div>
      <div className="stage-title">
        <h2 className="mp-title">{text.includes("hiding") ? "HIDING THE KING" : "FINDING THE KING"}</h2>
        <p>{text}</p>
      </div>
      {/* The opponent's live row, when supplied: their cards plus the physical
          hand they are inspecting with, synced over RTDB (Parts 4, 8, 9). */}
      {row}
    </section>
  );
}

function Reveal({ mp, onRequestExit, friendAction }: { mp: MP; onRequestExit: () => void; friendAction?: ReactNode }) {
  const g = mp.game!;
  const result = g.lastResult!;
  const cfg = levelConfig(g.level);
  const meWon = result.winnerSeat === mp.mySeat;
  const opponentName = mp.opponent ?? "Opponent";
  // Told from MY side: who did what, and gold when I won / red when I lost.
  const copy = roundVerdictCopy({
    kind: result.kind,
    guesserName: result.guesserSeat === mp.mySeat ? "You" : opponentName,
    dealerName: result.dealerSeat === mp.mySeat ? "You" : opponentName,
    viewerWon: meWon,
  });
  const [busy, setBusy] = useState(false);
  // Classic: play "round" hides within a court, and each court has its own
  // length (14, 10, 6), so the boundary is read from the shared resolver rather
  // than compared against a literal. Optional engine runs continuous rounds, so
  // the final reveal is the last hide round of the match.
  const lastOfLevel = mp.useOptionalFlow ? g.round >= RULESET_ROUNDS : g.round >= roundsPerLevel(g.level);
  const lastOfGame = lastOfLevel && g.level >= LEVEL_COUNT - 1;
  // Lives: when the hidden King was found, the Dealer lost a life.
  const lifeLost = mp.livesMode && result.kind === "king";
  // The reveal keeps the perspective the round's dealer hid and served in, so the
  // deck does not turn over one last time when the cards are shown.
  const { opposite } = deckPerspective({ dealerSeat: result.dealerSeat }, mp.mySeat ?? 0);

  const next = async () => {
    if (busy) return;
    setBusy(true);
    await mp.advance();
    setBusy(false);
  };

  return (
    <MpFrame>
      <HeaderActions onLeave={onRequestExit} label="Leave match" friendAction={friendAction} />
      <Header mp={mp} activeSeconds={null} />
      <section className="mp-stage">
        <div className="stage-title">
          <MpEyebrow>ROUND {result.round} RESULT</MpEyebrow>
          <h2 className="mp-title mp-result-title">{copy.title}</h2>
          <MpOrnament />
          <p>{copy.subtitle}</p>
        </div>
        <div className="reveal-hand-wrap">
          <CardRow opposite={opposite} className="reveal-row mp-reveal">
            {Array.from({ length: cfg.cards }, (_, i) => (
              <PlayingCard
                key={i}
                index={i}
                fanCount={cfg.cards}
                fanSlot={i}
                faceUp
                blank={result.wasBluff}
                king={!result.wasBluff && i === result.kingIndex}
                chosen={i === result.pick}
                wrong={(result.kind === "wrong" || result.kind === "bluff-worked") && i === result.pick}
                disabled
                flipDelay={(i * 70) / 1000}
                number={opposite ? cfg.cards - i : i + 1}
              />
            ))}
            <MpRevealHand
              pick={result.pick}
              cards={cfg.cards}
              self={result.guesserSeat === mp.mySeat}
              opposite={opposite}
            />
          </CardRow>
        </div>
        <div className="round-verdict">
          <b>{meWon ? "YOU WIN THE ROUND" : `${mp.opponent ?? "Opponent"} WINS THE ROUND`}</b>
          {lifeLost ? (
            <span>KING FOUND — {result.dealerSeat === mp.mySeat ? "YOU" : (mp.opponent ?? "Opponent")} LOST A LIFE</span>
          ) : (
            <span>
              +{result.points} {result.points === 1 ? "point" : "points"}
            </span>
          )}
        </div>
        <button className="gold-button wide" onClick={next} disabled={busy}>
          {lastOfGame ? "FINAL RESULT" : lastOfLevel ? "CONTINUE" : "NEXT ROUND"}
        </button>
      </section>
    </MpFrame>
  );
}

/**
 * Guesser-hand shown over the picked card in the reveal — mirrors the single
 * player / 2‑player SelectionHand so reveal screens look identical everywhere.
 * `faint` is used when the pick belongs to the opponent.
 */
function MpRevealHand({
  pick,
  cards,
  self,
  opposite,
}: {
  pick: number | null;
  cards: number;
  self: boolean;
  /** The deck's perspective, so the hand points from its owner's side. */
  opposite: boolean;
}) {
  return <SelectionHand index={pick} cardCount={cards} opposite={opposite} fromOpponent={!self} settled faint={!self} />;
}

function LevelEnd({ mp, onRequestExit, friendAction }: { mp: MP; onRequestExit: () => void; friendAction?: ReactNode }) {
  const g = mp.game!;
  const me = mp.mySeat ?? 0;
  const them = me === 0 ? 1 : 0;
  const [busy, setBusy] = useState(false);

  const goNext = async () => {
    if (busy) return;
    setBusy(true);
    await mp.advance();
    setBusy(false);
  };  return (
    <MpFrame>
      <HeaderActions onLeave={onRequestExit} label="Leave match" friendAction={friendAction} />
      <Header mp={mp} activeSeconds={null} />
      <section className="mp-stage">
        <MpEyebrow>LEVEL {g.level + 1} COMPLETE</MpEyebrow>
        <h2 className="mp-title">{LEVELS[g.level].name}</h2>
        <MpOrnament />
        <div className="score-board large">
          <div>
            <span>You</span>
            <strong>{g.scores[me]}</strong>
          </div>
          <i>—</i>
          <div>
            <span>{mp.opponent ?? "Opponent"}</span>
            <strong>{g.scores[them]}</strong>
          </div>
        </div>
        {g.level + 1 < LEVELS.length ? (
          <button className="gold-button wide" onClick={goNext} disabled={busy}>
            ENTER {LEVELS[g.level + 1].name}
          </button>
        ) : (
          <p className="mp-muted">Final court complete — the kingdom is decided after the next reveal.</p>
        )}
      </section>
    </MpFrame>
  );
}

function MatchEnd({ mp, onLeave }: { mp: MP; onLeave: () => void }) {
  const g = mp.game!;
  const me = mp.mySeat ?? 0;
  const them = me === 0 ? 1 : 0;
  const meWon = g.winnerSeat === me;
  const drawn = g.winnerSeat === null;
  const [busy, setBusy] = useState(false);

  const again = async () => {
    if (busy) return;
    setBusy(true);
    await mp.rematch();
    setBusy(false);
  };

  return (
    <MpFrame>
      <HeaderActions onLeave={onLeave} label="Leave match" />
      <section className="mp-stage">
        <span className="level-crown">
          <Crown strokeWidth={1.75} />
        </span>
        <MpEyebrow>THE KINGDOM HAS SPOKEN</MpEyebrow>
        <h2 className="mp-title">{drawn ? "A ROYAL DRAW" : meWon ? "YOU WIN!" : `${mp.opponent ?? "Opponent"} WINS!`}</h2>
        <MpOrnament />
        {mp.livesMode ? (
          <>
            {drawn ? (
              <p>No one lost all their Kings. A royal standoff.</p>
            ) : (
              <p>
                {meWon
                  ? `${mp.opponent ?? "Opponent"} lost all 5 Kings — you rule the board!`
                  : `You lost all 5 Kings. ${mp.opponent ?? "Your opponent"} takes the crown.`}
              </p>
            )}
          </>
        ) : (
          <p>{`${TOTAL_ROUNDS} rounds. Three courts. One ruler.`}</p>
        )}
        <div className="score-board large final">
          <div>
            <span>You</span>
            <strong>{mp.livesMode && g.lives ? g.lives[me] : g.scores[me]}</strong>
          </div>
          <i>VS</i>
          <div>
            <span>{mp.opponent ?? "Opponent"}</span>
            <strong>{mp.livesMode && g.lives ? g.lives[them] : g.scores[them]}</strong>
          </div>
        </div>
        <button className="gold-button wide" onClick={again} disabled={busy}>
          PLAY AGAIN
        </button>
        <button className="text-button" onClick={onLeave}>
          BACK TO MENU
        </button>
      </section>
    </MpFrame>
  );
}

/* eslint-disable @typescript-eslint/no-unused-vars -- onLeave kept for uniform call sites
 (the Center screens manage leave via the quit button already) */
function Center({
  title,
  eyebrow,
  onLeave,
  children,
}: {
  title: string;
  eyebrow?: string;
  onLeave?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mp-stage">
      {eyebrow && <MpEyebrow>{eyebrow}</MpEyebrow>}
      <h2 className="mp-title">{title}</h2>
      {children}
    </section>
  );
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * "Add Friend" during an online match, as a compact + in the top-right corner.
 *
 * The screen already owns the top-right corner for the exit control, so this
 * sits just inside it rather than adding a floating row that would push the
 * board around mid-match.
 *
 * Only rendered when there IS an opponent and the two are not already friends,
 * where "already friends" is checked in EITHER direction: adding is mutual, so
 * the moment either player taps it this affordance disappears on both devices.
 */
function AddFriendButton({ mp }: { mp: MP }) {
  // `announce: false`: the friends screen (or an outer mount) owns presence, so
  // this reader must not start a second heartbeat.
  //
  // `displayName` is MY name, and it is required: the mutual write puts it on the
  // OTHER player's list, and the rules reject an edge whose `name` is not a
  // string. Without it the mirror edge is denied and adding silently stays
  // one-directional. It also feeds the presence heartbeat, which this reader
  // skips, so passing it costs nothing here.
  const friends = useFriends({
    announce: false,
    displayName: mp.myName ?? "",
    reciprocalUid: mp.opponentUid,
  });
  const opponentUid = mp.opponentUid;
  const opponentName = mp.opponent ?? "Opponent";
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  const alreadyFriend = opponentUid ? friends.isFriendWith(opponentUid) : false;
  if (!opponentUid || alreadyFriend || added) return null;

  const add = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await friends.addFriend({ uid: opponentUid, name: opponentName });
    setBusy(false);
    if (ok) setAdded(true);
  };

  return (
    <button
      className="add-friend-button"
      onClick={() => void add()}
      disabled={busy}
      aria-label={`Add ${opponentName} as a friend`}
      title={`Add ${opponentName} as a friend`}
    >
      +
    </button>
  );
}