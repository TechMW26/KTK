"use client";

import { useEffect, useState } from "react";
import { LEVELS, levelConfig, RESULT_COPY, LEVEL_COUNT } from "@/lib/game/rules";
import { RULESET_ROUNDS } from "@/lib/game/flow";
import type useMultiplayer from "@/hooks/useMultiplayer";
import { MpCard, MpEyebrow, MpFrame, MpLogo, MpModal, MpOrnament } from "./ui";

type MP = ReturnType<typeof useMultiplayer>;

/**
 * In-match renderer. Everything is derived from the authoritative Firebase
 * `game` object exposed by the hook, so both clients converge to the same
 * screen and recover cleanly after a reconnect.
 */
export default function GameView({ mp, onLeave }: { mp: MP; onLeave: () => void }) {
  const g = mp.game;

  if (!g) {
    return (
      <MpFrame>
        <Center title="SYNCING" eyebrow="RESTORING THE KINGDOM" onLeave={onLeave}>
          <p className="mp-muted">Rebuilding the game state…</p>
        </Center>
      </MpFrame>
    );
  }

  // Match over.
  if (g.phase === "match-end") return <MatchEnd mp={mp} onLeave={onLeave} />;
  if (g.phase === "level-end") return <LevelEnd mp={mp} />;

  // Result of a round is available to replay.
  if (g.phase === "reveal" && g.lastResult) return <Reveal mp={mp} />;

  return <LiveRound mp={mp} />;
}

function Header({ mp, activeSeconds }: { mp: MP; activeSeconds: number | null }) {
  const g = mp.game!;
  const cfg = levelConfig(g.level);
  const me = mp.mySeat ?? 0;
  const them = me === 0 ? 1 : 0;
  const myActive = g.phase === "guess" || g.phase === "dealer-hide" ? g.actingSeat === me : false;

  return (
    <div className="mp-head">
      <header className="game-header">
        <MpLogo compact />
        <div className="round-medallion">
          <small>LEVEL {g.level + 1}</small>
          <strong>{String(g.round).padStart(2, "0")}</strong>
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
  const hearts = (n: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={`life ${i < n ? "" : "lost"}`} aria-hidden="true">
        ❤
      </span>
    ));
  return (
    <div className="mp-lives-strip">
      <span className="mp-lives-side">
        <em>{myName}</em>
        <span className="lives-row">{hearts(myLives)}</span>
      </span>
      <span className="mp-lives-vs">
        <em>LIVES</em>
      </span>
      <span className="mp-lives-side right">
        <span className="lives-row">{hearts(theirLives)}</span>
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
function LiveRound({ mp }: { mp: MP }) {
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

  return (
    <MpFrame>
      <button className="quit-button" onClick={() => void mp.leave()} aria-label="Leave match">
        ↪
      </button>
      <Header mp={mp} activeSeconds={iAct && isGuess ? actingSeconds : null} />

      {isDealerRound && iAmDealer && iAct ? <HideStage mp={mp} /> : null}
      {isDealerRound && !(iAmDealer && iAct) ? (
        <Waiting title="OPPONENT'S TURN" text={`${mp.opponent ?? "Opponent"} is hiding the King…`} />
      ) : null}
      {isGuess && iAct ? <GuessStage mp={mp} /> : null}
      {isGuess && !iAct ? (
        <Waiting title="OPPONENT'S TURN" text={`${mp.opponent ?? "Opponent"} is guessing a card…`} />
      ) : null}

      {iAct ? null : (
        <p className="mp-muted mp-waitsmall">Waiting for the other player. Do not close this tab.</p>
      )}
    </MpFrame>
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
        <MpEyebrow>YOU ARE THE DEALER · ROUND {g.round}</MpEyebrow>
        <h2 className="mp-title">HIDE THE KING</h2>
        <MpOrnament />
        <p>Choose a hiding place, then lock the cards.</p>
      </div>
      <div className="cards-row dealer-choice">
        {Array.from({ length: cfg.cards }, (_, i) => (
          <MpCard
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
          <small>{bluffUsed ? "Available next level" : "Place empty cards. Once this level."}</small>
        </button>
        <button className="gold-button" disabled={!canLock || busy} onClick={lock}>
          {busy ? "LOCKING…" : "LOCK THE CARDS"}
        </button>
      </div>
    </section>
  );
}

function GuessStage({ mp }: { mp: MP }) {
  const g = mp.game!;
  const cfg = levelConfig(g.level);
  const seconds = cfg.seconds;
  const [picked, setPicked] = useState<number | null>(null);
  const [bluffAsk, setBluffAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(seconds);
  const done = busy || picked !== null;

  useEffect(() => {
    // Reset the countdown when a new round begins (pre-existing behaviour).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeft(seconds);
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

  const pick = async (i: number) => {
    if (done) return;
    setPicked(i);
    setBusy(true);
    await mp.guess(i, false);
    setBusy(false);
  };
  const callBluff = async () => {
    setBluffAsk(false);
    if (done) return;
    setBusy(true);
    await mp.guess(null, true);
    setBusy(false);
  };

  return (
    <section className="mp-stage">
      {bluffAsk && (
        <MpModal eyebrow="TRUST YOUR INSTINCT" title="CALL THE BLUFF?" symbol="◑ ◒" onClose={() => setBluffAsk(false)} className="bluff-modal">
          <p>Do you think the Dealer hid no King this round?</p>
          <button className="gold-button wide" onClick={callBluff} disabled={busy}>
            YES — CALL BLUFF
          </button>
          <button className="outline-button wide" onClick={() => setBluffAsk(false)}>
            NO — PICK A CARD
          </button>
          <small>A wrong accusation gives the round to the Dealer.</small>
        </MpModal>
      )}
      <div className="stage-title">
        <MpEyebrow>YOUR TURN · GUESSER</MpEyebrow>
        <h2 className="mp-title">FIND THE KING</h2>
        <MpOrnament />
        <p>{done ? "Revealing the cards…" : `Pick a card before the timer ends — ${left}s.`}</p>
      </div>
      <div className="cards-row">
        {Array.from({ length: cfg.cards }, (_, i) => (
          <MpCard key={i} index={i} chosen={picked === i} disabled={done} onClick={() => pick(i)} />
        ))}
      </div>
      <button className="outline-button wide mp-wide" onClick={() => setBluffAsk(true)} disabled={done}>
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
  // Classic: play "round" lives within a court; optional engine runs continuous
  // rounds, so the final reveal is the last hide round of the match.
  const lastOfGame = mp.useOptionalFlow
    ? g.round >= RULESET_ROUNDS
    : g.round >= 10 && g.level >= LEVEL_COUNT - 1;
  const lastOfLevel = mp.useOptionalFlow ? lastOfGame : g.round >= 10;
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
              <MpCard
                key={i}
                index={i}
                faceUp
                blank={result.wasBluff}
                king={!result.wasBluff && i === result.kingIndex}
                chosen={i === result.pick}
                wrong={(result.kind === "wrong" || result.kind === "bluff-worked") && i === result.pick}
                disabled
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
          <p>Thirty rounds. Three courts. One ruler.</p>
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
