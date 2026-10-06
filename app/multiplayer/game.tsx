"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { LEVELS, levelConfig, RESULT_COPY, LEVEL_COUNT, roundsPerLevel } from "@/lib/game/rules";
import { RULESET_ROUNDS, roundInCourt, consecutiveLabel } from "@/lib/game/flow";
import { dealTimings, SHUFFLE_MS } from "@/features/game/constants/pacing";
import { PowerDock } from "@/features/game/components/PowerDock";
import { SelectionHand } from "@/features/game/components/SelectionHand";
import { StrategyModal } from "@/features/game/components/StrategyModal";
import { picksThisCourt, summarisePicks } from "@/features/game/logic/strategy";
import type useMultiplayer from "@/hooks/useMultiplayer";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { LifePips } from "@/features/game/components/GameHeader";
import { MpEyebrow, MpFrame, MpLogo, MpModal, MpOrnament } from "./ui";

type MP = ReturnType<typeof useMultiplayer>;

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

  if (!g) {
    return (
      <MpFrame>
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
    </>
  );

  // Match over.
  if (g.phase === "match-end") return <MatchEnd mp={mp} onLeave={onLeave} />;
  if (g.phase === "level-end")
    return (
      <>
        <LevelEnd mp={mp} />
        {dock}
        {panel}
      </>
    );

  // Result of a round is available to replay.
  if (g.phase === "reveal" && g.lastResult)
    return (
      <>
        <Reveal mp={mp} />
        {dock}
        {panel}
      </>
    );

  return (
    <>
      <LiveRound mp={mp} bluffOpen={bluffOpen} setBluffOpen={setBluffOpen} />
      {dock}
      {panel}
    </>
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
        <div className="round-medallion">
          <small>LEVEL {g.level + 1}</small>
          <strong>{String(shownRound).padStart(2, "0")}</strong>
        </div>
        <div className="header-controls">
          <MpLiveTimer seconds={activeSeconds} cfgSeconds={cfg.seconds} />
        </div>
        <div className="score-strip mp-score">
          <span className={myActive ? "active-turn" : ""}>
            <strong>You</strong>
            <b>{mp.livesMode && g.lives ? g.lives[me] : g.scores[me]}</b>
          </span>
          <i>
            {cfg.cards} CARDS · {cfg.points}×
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
        <span className="mini-settings mp-headstatic">♛</span>
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
  setBluffOpen,
}: {
  mp: MP;
  bluffOpen: boolean;
  setBluffOpen: (v: boolean) => void;
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
        <button className="quit-button" onClick={() => void mp.leave()} aria-label="Leave">
          ↪
        </button>
        <Center title="OPPONENT DISCONNECTED" eyebrow="CONNECTION ISSUE" onLeave={() => void mp.leave()}>
          <MpOrnament />
          <p className="mp-muted">
            {mp.opponent ?? "Your opponent"} has dropped. The match will resume when they reconnect.
          </p>
        </Center>
      </MpFrame>
    );
  }

const isGuess = g.phase === "guess";
const actingSeconds = isGuess ? cfg.seconds : null;
/**
 * The guesser's committed pick, shown to the OTHER player the moment it lands.
 * Read straight from the authoritative `pendingGuess` on the reveal beat, so
 * both clients agree and no extra state has to be synced.
 */
const opponentPick =
  g.phase === "reveal" && g.pendingGuess && g.pendingGuess.guesserSeat !== me
    ? (g.pendingGuess.calledBluff ? null : g.pendingGuess.cardIndex)
    : null;

  return (
    <MpFrame>
      <button className="quit-button" onClick={() => void mp.leave()} aria-label="Leave match">
        ↪
      </button>
      <Header mp={mp} activeSeconds={iAct && isGuess ? actingSeconds : null} />

      {g.phase === "shuffle" ? <ShuffleStage mp={mp} /> : null}
      {isDealerRound && iAmDealer && iAct ? <HideStage mp={mp} /> : null}
      {isDealerRound && !(iAmDealer && iAct) ? (
        <Waiting title="OPPONENT'S TURN" text={`${mp.opponent ?? "Opponent"} is hiding the King…`} />
      ) : null}
      {isGuess && iAct ? (
        <GuessStage mp={mp} onCallBluff={() => setBluffOpen(true)} bluffOpen={bluffOpen} />
      ) : null}
      {isGuess && !iAct ? (
        <Waiting title="OPPONENT'S TURN" text={`${mp.opponent ?? "Opponent"} is guessing a card…`} />
      ) : null}
      {opponentPick !== null ? (
        <div className="cards-row">
          {Array.from({ length: cfg.cards }, (_, i) => (
            <PlayingCard key={i} index={i} chosen={i === opponentPick} disabled />
          ))}
          <SelectionHand index={opponentPick} cardCount={cfg.cards} faint />
        </div>
      ) : null}

      {g.phase === "shuffle" || iAct ? null : (
        <p className="mp-muted mp-waitsmall">Waiting for the other player. Do not close this tab.</p>
      )}
    </MpFrame>
  );
}

/**
 * Card-distribution beat. The Dealer's illustrated hand sweeps the table and
 * throws one card into each slot — the exact `dealer-hand-rig` /
 * `flying-deal-card` choreography the single-player shuffle stage uses, so the
 * two modes look identical. Nobody acts; the animation owns the beat and hands
 * off to the guess phase when it lands (the parent guards a stalled peer).
 */
function ShuffleStage({ mp }: { mp: MP }) {
  const g = mp.game!;
  const cfg = levelConfig(g.level);
  const iAmDealer = g.dealerSeat === mp.mySeat;
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
      <div
        className="dealer-hand-rig"
        aria-hidden="true"
        style={{
          "--deal-start": `${-((cfg.cards - 1) * 38)}px`,
          "--deal-end": `${(cfg.cards - 1) * 38}px`,
        } as React.CSSProperties}
      >
        <span className="held-card-mini"><i>♛</i></span>
        <Image
          className="dealer-hand-img"
          src="/dealer-hand.png"
          alt=""
          width={392}
          height={952}
          unoptimized
        />
      </div>
      <div className="stage-title above-hand">
        <MpEyebrow>THE CARDS ARE IN MOTION</MpEyebrow>
        <h2 className="mp-title">GAME SETUP</h2>
        <MpOrnament />
        <p>
          {iAmDealer
            ? "You locked the King in. The cards are being dealt…"
            : `${mp.opponent ?? "Opponent"} is arranging the cards…`}
        </p>
      </div>
      <div className="cards-row dealing">
        <div className="deal-flight-layer" aria-hidden="true">
          {Array.from({ length: cfg.cards }, (_, index) => {
            const offset = index - (cfg.cards - 1) / 2;
            return (
              <span
                key={index}
                className="flying-deal-card"
                style={{
                  "--slot-x": `${offset * 76}px`,
                  "--flight-delay": `${deal.launch()}s`,
                  "--flight-duration": `${deal.flight}s`,
                } as React.CSSProperties}
              />
            );
          })}
        </div>
        {Array.from({ length: cfg.cards }, (_, index) => (
          <PlayingCard key={index} index={index} disabled dealDelay={deal.land()} />
        ))}
      </div>
      <p className="bottom-copy">Cards are being placed.<br />Watch closely.</p>
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

  const lock = async () => {
    if (!canLock || busy) return;
    setBusy(true);
    await mp.hideCard(kingIndex, isBluff);
    setBusy(false);
  };

  return (
    <section className="mp-stage">
      <div className="stage-title">
        <MpEyebrow>YOU ARE THE DEALER · ROUND {mp.useOptionalFlow ? roundInCourt(g.round) : g.round}</MpEyebrow>
        <h2 className="mp-title">HIDE THE KING</h2>
        <MpOrnament />
        <p>Choose a hiding place, then lock the cards.</p>
        {mp.useOptionalFlow ? (
          <p className="block-note">HIDING {consecutiveLabel(me, g.round, "complete")}</p>
        ) : null}
      </div>
      <div className="cards-row dealer-choice">
        {Array.from({ length: cfg.cards }, (_, i) => (
          <PlayingCard
            key={i}
            index={i}
            chosen={!isBluff && kingIndex === i}
            disabled={busy || isBluff}
            onClick={() => {
              setIsBluff(false);
              setKingIndex(i);
            }}
          />
        ))}
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
          <span>☵</span>
          <b>{bluffUsed ? "BLUFF ALREADY USED" : "USE YOUR BLUFF"}</b>
          <small>
            {bluffUsed
              ? "One per court. Ready in the next court."
              : "Place only empty cards. Once this court."}
          </small>
        </button>
        <button className="gold-button" disabled={!canLock || busy} onClick={lock}>
          {busy ? "LOCKING…" : "LOCK THE CARDS"}
        </button>
      </div>
    </section>
  );
}

function GuessStage({
  mp,
  bluffOpen,
  onCallBluff,
}: {
  mp: MP;
  bluffOpen: boolean;
  onCallBluff: () => void;
}) {
  const g = mp.game!;
  const cfg = levelConfig(g.level);
  const seconds = cfg.seconds;
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(seconds);
  /** Card aimed at with the first tap, awaiting the confirming second tap. */
  const [targetCard, setTargetCard] = useState<number | null>(null);
  const done = busy || picked !== null || bluffOpen;

  useEffect(() => {
    // Reset the countdown when a new round begins (pre-existing behaviour).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeft(seconds);
    // Drop any unconfirmed aim so the next round starts from a clean slate.
    setTargetCard(null);
  }, [seconds, g.round]);

  useEffect(() => {
    if (done) return;
    if (left <= 0) {
      void mp.guess(null, false);
      return;
    }
    const id = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, done]);

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
    setPicked(i);
    setBusy(true);
    await mp.guess(i, false);
    setBusy(false);
  };

  return (
    <section className="mp-stage">
      <div className="stage-title">
        <MpEyebrow>YOUR TURN · GUESSER</MpEyebrow>
        <h2 className="mp-title">FIND THE KING</h2>
        <MpOrnament />
        <p>{done ? "Revealing the cards…" : `Pick a card before the timer ends — ${left}s.`}</p>
      </div>
      <div className="cards-row">
        {Array.from({ length: cfg.cards }, (_, i) => (
          <PlayingCard
            key={i}
            index={i}
            chosen={picked === i || targetCard === i}
            disabled={done}
            onClick={() => pick(i)}
          />
        ))}
        {picked === null && <SelectionHand index={targetCard} cardCount={cfg.cards} />}
      </div>
      <button className="outline-button wide mp-wide" onClick={onCallBluff} disabled={done}>
        CALL THE BLUFF
      </button>
      <p className="bottom-copy">Find the King — or call a bluff.</p>
    </section>
  );
}

function Waiting({ title, text }: { title: string; text: string }) {
  return (
    <section className="mp-stage">
      <div className="turn-indicator opponent-turn mp-turnpulse">
        <span className="turn-dot">●</span>
        <span className="turn-text">
          <b>{title}</b>
          <small>Waiting for the other player…</small>
        </span>
      </div>
      <div className="stage-title">
        <MpEyebrow>AWAY FROM THE BOARD</MpEyebrow>
        <h2 className="mp-title">WATCH &amp; WAIT</h2>
        <MpOrnament />
        <p>{text}</p>
      </div>
    </section>
  );
}

function Reveal({ mp }: { mp: MP }) {
  const g = mp.game!;
  const result = g.lastResult!;
  const cfg = levelConfig(g.level);
  const copy = RESULT_COPY[result.kind];
  const meWon = result.winnerSeat === mp.mySeat;
  const [busy, setBusy] = useState(false);
  // Classic: play "round" hides within a court, and each court has its own
  // length (10, 6, 4), so the boundary is read from the shared resolver rather
  // than compared against a literal. Optional engine runs continuous rounds, so
  // the final reveal is the last hide round of the match.
  const lastOfLevel = mp.useOptionalFlow ? g.round >= RULESET_ROUNDS : g.round >= roundsPerLevel(g.level);
  const lastOfGame = lastOfLevel && g.level >= LEVEL_COUNT - 1;
  // Lives: when the hidden King was found, the Dealer lost a life.
  const lifeLost = mp.livesMode && result.kind === "king";

  const next = async () => {
    if (busy) return;
    setBusy(true);
    await mp.advance();
    setBusy(false);
  };

  return (
    <MpFrame>
      <button className="quit-button" onClick={() => void mp.leave()} aria-label="Leave match">
        ↪
      </button>
      <Header mp={mp} activeSeconds={null} />
      <section className="mp-stage">
        <div className="stage-title">
          <MpEyebrow>ROUND {result.round} RESULT</MpEyebrow>
          <h2 className="mp-title mp-result-title">{copy.title}</h2>
          <MpOrnament />
          <p>{copy.subtitle}</p>
        </div>
        <div className="reveal-hand-wrap">
          <div className="cards-row reveal-row mp-reveal">
            {Array.from({ length: cfg.cards }, (_, i) => (
              <PlayingCard
                key={i}
                index={i}
                faceUp
                blank={result.wasBluff}
                king={!result.wasBluff && i === result.kingIndex}
                chosen={i === result.pick}
                wrong={(result.kind === "wrong" || result.kind === "bluff-worked") && i === result.pick}
                disabled
                flipDelay={(i * 70) / 1000}
              />
            ))}
          </div>
          <MpRevealHand
            pick={result.pick}
            cards={cfg.cards}
            self={result.guesserSeat === mp.mySeat}
          />
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
}: {
  pick: number | null;
  cards: number;
  self: boolean;
}) {
  if (pick === null || cards <= 0) return null;
  const offset = pick - (cards - 1) / 2;
  const style = { "--hand-x": `${offset * 76}px` } as React.CSSProperties;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      className={["selection-hand-img", self ? "" : "faint"].filter(Boolean).join(" ")}
      style={style}
      src="/guesser-hand.png"
      alt=""
      aria-hidden="true"
    />
  );
}

function LevelEnd({ mp }: { mp: MP }) {
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
      <button className="quit-button" onClick={() => void mp.leave()} aria-label="Leave match">
        ↪
      </button>
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
      <button className="quit-button" onClick={onLeave} aria-label="Leave match">
        ↪
      </button>
      <section className="mp-stage">
        <span className="level-crown">♛</span>
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
                  : "You lost all 5 Kings. The rival takes the crown."}
              </p>
            )}
          </>
        ) : (
          <p>Twenty rounds. Three courts. One ruler.</p>
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
