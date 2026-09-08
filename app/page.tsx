"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type Phase = "home" | "dealer" | "pass" | "shuffle" | "guess" | "result" | "level-end" | "match-end";
type Mode = "local" | "bot";
type Overlay = null | "rules" | "strategy" | "settings" | "bluff" | "quit";
type ResultKind = "king" | "wrong" | "bluff-caught" | "bluff-missed" | "bluff-worked" | "timeout";

type RoundResult = {
  kind: ResultKind;
  winner: number;
  pick: number | null;
  calledBluff: boolean;
};

type HistoryItem = {
  level: number;
  round: number;
  dealer: number;
  guesser: number;
  pick: number | null;
  calledBluff: boolean;
  wasBluff: boolean;
  won: boolean;
};

type TurnInfo = {
  kind: "player" | "opponent";
  title: string;
  subtitle: string;
};

const TURN_COPY = {
  playerGuess: { kind: "player", title: "YOUR TURN", subtitle: "Pick a card before time runs out." },
  playerDealer: { kind: "player", title: "YOUR TURN", subtitle: "Dealer — hide the King." },
  opponentGuess: { kind: "opponent", title: "OPPONENT'S TURN", subtitle: "Waiting for The Rival..." },
  opponentDealer: { kind: "opponent", title: "OPPONENT'S TURN", subtitle: "Waiting for The Rival..." },
} as const;

function getTurnInfo(phase: Phase, dealerIsBot: boolean, guesserIsBot: boolean): TurnInfo | null {
  if (phase === "guess") {
    return guesserIsBot ? { ...TURN_COPY.opponentGuess } : { ...TURN_COPY.playerGuess };
  }
  if (phase === "dealer") {
    return dealerIsBot ? { ...TURN_COPY.opponentDealer } : { ...TURN_COPY.playerDealer };
  }
  return null;
}

const LEVELS = [
  { name: "THE COURT", cards: 5, seconds: 20, points: 1 },
  { name: "HIGH STAKES", cards: 3, seconds: 15, points: 2 },
  { name: "FINAL DUEL", cards: 2, seconds: 9, points: 3 },
] as const;

// Duration of the cinematic turn-transition overlay (ms).
const TURN_TRANSITION_MS = 2800;
// How long after the transition overlay disappears before the opponent picks (ms).
const TURN_PICK_DELAY_MS = 1500;

type SoundCue = "start" | "countdown" | "king" | "wrong" | "bluff-open" | "bluff-caught" | "bluff-missed";

let backgroundAudio: HTMLAudioElement | null = null;

function getBackgroundAudio() {
  if (typeof window === "undefined") return null;
  if (!backgroundAudio) {
    backgroundAudio = new Audio("/audio/background.wav");
    backgroundAudio.loop = true;
    backgroundAudio.preload = "auto";
    backgroundAudio.volume = .32;
  }
  return backgroundAudio;
}

function preloadGameAudio() {
  if (typeof window === "undefined") return;
  getBackgroundAudio()?.load();
  (["start", "countdown", "king", "wrong", "bluff-open", "bluff-caught", "bluff-missed"] as SoundCue[]).forEach((cue) => {
    const audio = new Audio(`/audio/${cue}.wav`);
    audio.preload = "auto";
    audio.load();
  });
}

function playSoundCue(cue: SoundCue, countdown = 5) {
  if (typeof window === "undefined") return;
  const audio = new Audio(`/audio/${cue}.wav`);
  audio.preload = "auto";
  audio.volume = cue === "countdown" ? .72 : .82;
  if (cue === "countdown") audio.playbackRate = .92 + (6 - countdown) * .055;
  void audio.play().catch(() => undefined);
}

function startAmbientMusic() {
  const audio = getBackgroundAudio();
  if (!audio) return;
  void audio.play().catch(() => undefined);
}

function stopAmbientMusic() {
  if (!backgroundAudio) return;
  backgroundAudio.pause();
}

const resultCopy: Record<ResultKind, { title: string; subtitle: string; tone: string }> = {
  king: { title: "KING FOUND!", subtitle: "You found the King", tone: "victory" },
  wrong: { title: "WRONG CARD", subtitle: "Not the King", tone: "danger" },
  "bluff-caught": { title: "BLUFF GUESSED!", subtitle: "The accusation was correct", tone: "victory" },
  "bluff-missed": { title: "BLUFF MISSED", subtitle: "The accusation was wrong", tone: "danger" },
  "bluff-worked": { title: "DECEPTION!", subtitle: "There was no King this round", tone: "danger" },
  timeout: { title: "TIME EXPIRED", subtitle: "The King stayed hidden", tone: "danger" },
};

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "logo compact" : "logo"} aria-label="Kill the King">
      <span className="logo-crown">♛</span>
      <strong>KILL</strong><i>THE</i><strong>KING</strong>
    </div>
  );
}

type CardProps = {
  index: number;
  faceUp?: boolean;
  king?: boolean;
  blank?: boolean;
  chosen?: boolean;
  wrong?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onHover?: (hovered: boolean) => void;
  dealDelay?: number;
};

function Card({ index, faceUp, king, blank, chosen, wrong, disabled, onClick, onHover, dealDelay }: CardProps) {
  return (
    <button
      className={["playing-card", faceUp ? "face-up" : "", king ? "is-king" : "", chosen ? "chosen" : "", wrong ? "shattered" : ""].join(" ")}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      style={dealDelay === undefined ? undefined : { "--deal-delay": `${dealDelay}s` } as React.CSSProperties}
      disabled={disabled}
      aria-label={faceUp ? (king ? `King in card ${index + 1}` : `Card ${index + 1}`) : `Choose card ${index + 1}`}
    >
      <span className="card-inner">
        <span className="card-back">
          <small>KTK</small>
          <b>♛</b>
          <em>◆</em>
        </span>
        <span className="card-front">
          {blank ? (
            <span className="blank-card"><b>?</b><small>EMPTY</small></span>
          ) : king ? (
            <>
              <span className="corner-rank">K<small>♥</small></span>
              <span className="king-face">♚</span>
              <span className="king-label">THE KING</span>
            </>
          ) : (
            <>
              <span className="corner-rank">{index + 1}<small>♥</small></span>
              <span className="heart-pip">♥</span>
            </>
          )}
        </span>
      </span>
      {king && faceUp && <span className="card-crown" aria-hidden="true">♛</span>}
      {wrong && (
        <span className="shatter-layer" aria-hidden="true">
          <i className="fracture fracture-a" />
          <i className="fracture fracture-b" />
          <i className="fracture fracture-c" />
          <i className="shard shard-a" />
          <i className="shard shard-b" />
          <i className="shard shard-c" />
          <i className="shard shard-d" />
        </span>
      )}
      {wrong && <span className="wrong-badge" aria-hidden="true">×</span>}
    </button>
  );
}

function Ornament() {
  return <div className="ornament" aria-hidden="true"><span>◆</span></div>;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("home");
  const [mode, setMode] = useState<Mode>("bot");
  const [names, setNames] = useState<[string, string]>(["", "The Rival"]);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [level, setLevel] = useState(0);
  const [round, setRound] = useState(1);
  const [kingPosition, setKingPosition] = useState<number | null>(null);
  const [isBluff, setIsBluff] = useState(false);
  const [bluffsAvailable, setBluffsAvailable] = useState<[boolean, boolean]>([true, true]);
  // Local 2-Player optional 5-Lives rule (Feature: "5 Lives"). Only read when
  // mode === "local" && livesOn; VS Bot stays untouched.
  const [livesOn, setLivesOn] = useState(false);
  const [lives, setLives] = useState<[number, number]>([5, 5]);
  const [lifeWinner, setLifeWinner] = useState<0 | 1 | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [timeLeft, setTimeLeft] = useState(LEVELS[0].seconds);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [opponentActiveCard, setOpponentActiveCard] = useState<number | null>(null);
  const [strategyTab, setStrategyTab] = useState<0 | 1>(0);
  const [sound, setSound] = useState(true);
  const [motion, setMotion] = useState(true);
  const [turnTransition, setTurnTransition] = useState<TurnInfo | null>(null);
  const prevTurnKey = useRef<string | null>(null);
  const transitionTimer = useRef<number | undefined>(undefined);

  const config = LEVELS[level];
  const dealer = (round - 1) % 2;
  const guesser = dealer === 0 ? 1 : 0;
  const dealerIsBot = mode === "bot" && dealer === 1;
  const guesserIsBot = mode === "bot" && guesser === 1;
  const displayNames: [string, string] = [names[0].trim() || "Player 1", mode === "bot" ? "The Rival" : names[1].trim() || "Player 2"];
  const currentTurn = getTurnInfo(phase, dealerIsBot, guesserIsBot);
  const turnKey = currentTurn ? `${currentTurn.kind}:${phase}` : null;

  const resetRoundState = (nextLevel = level) => {
    setKingPosition(null);
    setIsBluff(false);
    setResult(null);
    setTimeLeft(LEVELS[nextLevel].seconds);
    setOverlay(null);
    setHoveredCard(null);
    setOpponentActiveCard(null);
  };

  const startMatch = () => {
    if (sound) {
      preloadGameAudio();
      startAmbientMusic();
      playSoundCue("start");
    }
    setNames(([first, second]) => [first.trim() || "Player 1", mode === "bot" ? "The Rival" : second.trim() || "Player 2"]);
    setScores([0, 0]);
    setLevel(0);
    setRound(1);
    setBluffsAvailable([true, true]);
    setHistory([]);
    if (mode === "local") {
      setLives([5, 5]);
      setLifeWinner(null);
    }
    resetRoundState(0);
    setPhase("dealer");
  };

  const quitMatch = () => {
    stopAmbientMusic();
    setOverlay(null);
    setScores([0, 0]);
    setLevel(0);
    setRound(1);
    setBluffsAvailable([true, true]);
    setHistory([]);
    if (mode === "local") {
      setLives([5, 5]);
      setLifeWinner(null);
    }
    resetRoundState(0);
    setPhase("home");
  };

  const finishRound = (kind: ResultKind, winner: number, pick: number | null, calledBluff: boolean) => {
    setResult({ kind, winner, pick, calledBluff });
    setScores((previous) => previous.map((score, index) => score + (index === winner ? config.points : 0)) as [number, number]);
    setHistory((previous) => [...previous, {
      level,
      round,
      dealer,
      guesser,
      pick: pick === null ? null : pick + 1,
      calledBluff,
      wasBluff: isBluff,
      won: winner === guesser,
    }]);
    if (sound) {
      if (kind === "king") playSoundCue("king");
      else if (kind === "bluff-caught") playSoundCue("bluff-caught");
      else if (kind === "bluff-missed") playSoundCue("bluff-missed");
      else playSoundCue("wrong");
    }
    setOverlay(null);
    // Local 2-Player 5-Lives: a found hidden King costs its DEALER one life.
    if (mode === "local" && livesOn && kind === "king") {
      const newLives: [number, number] =
        dealer === 0 ? [lives[0] - 1, lives[1]] : [lives[0], lives[1] - 1];
      setLives(newLives);
      if (newLives[dealer] <= 0) setLifeWinner(dealer === 0 ? 1 : 0);
    }
    setPhase("result");
  };

  const chooseCard = (index: number) => {
    if (phase !== "guess" || result) return;
    if (isBluff) finishRound("bluff-worked", dealer, index, false);
    else if (index === kingPosition) finishRound("king", guesser, index, false);
    else finishRound("wrong", dealer, index, false);
  };

  const callBluff = () => {
    if (isBluff) finishRound("bluff-caught", guesser, null, true);
    else finishRound("bluff-missed", dealer, null, true);
  };

  const confirmDealerChoice = () => {
    if (!isBluff && kingPosition === null) return;
    if (isBluff) {
      setBluffsAvailable((previous) => previous.map((available, index) => index === dealer ? false : available) as [boolean, boolean]);
    }
    setPhase(mode === "local" ? "pass" : "shuffle");
  };

  const nextRound = () => {
    if (mode === "local" && livesOn && lifeWinner !== null) {
      setPhase("match-end");
      return;
    }
    if (round === 10) {
      setPhase("level-end");
      return;
    }
    setRound((previous) => previous + 1);
    resetRoundState();
    setPhase("dealer");
  };

  const nextLevel = () => {
    if (level === LEVELS.length - 1) {
      setPhase("match-end");
      return;
    }
    const newLevel = level + 1;
    setLevel(newLevel);
    setRound(1);
    setBluffsAvailable([true, true]);
    resetRoundState(newLevel);
    setPhase("dealer");
  };

  useEffect(() => {
    if (phase !== "dealer" || !dealerIsBot) return;
    const useBluff = bluffsAvailable[dealer] && Math.random() < 0.14;
    const hiddenPosition = Math.floor(Math.random() * config.cards);
    const chooseTimer = window.setTimeout(() => {
      setIsBluff(useBluff);
      setKingPosition(useBluff ? null : hiddenPosition);
    }, motion ? 520 : 40);
    const finishTimer = window.setTimeout(() => {
      if (useBluff) setBluffsAvailable((previous) => [previous[0], false]);
      setOpponentActiveCard(null);
      setPhase("shuffle");
    }, motion ? 1750 : 120);
    return () => {
      window.clearTimeout(chooseTimer);
      window.clearTimeout(finishTimer);
    };
  }, [phase, dealerIsBot, bluffsAvailable, dealer, config.cards, motion]);

  useEffect(() => {
    if (phase !== "dealer" || dealerIsBot) return;
    const timer = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          setKingPosition(Math.floor(Math.random() * config.cards));
          setIsBluff(false);
          window.setTimeout(() => setPhase(mode === "local" ? "pass" : "shuffle"), 0);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, dealerIsBot, round, level, config.cards, mode]);

  useEffect(() => {
    if (phase !== "shuffle") return;
    const timer = window.setTimeout(() => {
      setTimeLeft(config.seconds);
      setPhase("guess");
    }, motion ? 3000 : 400);
    return () => window.clearTimeout(timer);
  }, [phase, config.seconds, motion]);

  useEffect(() => {
    if (phase !== "guess") return;
    const timer = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          window.setTimeout(() => finishRound("timeout", dealer, null, false), 0);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // Round identity intentionally restarts the countdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, level]);

  useEffect(() => {
    if (phase !== "guess" || !guesserIsBot) return;
    let resolveTimer: number | undefined;
    // Wait for the cinematic "OPPONENT'S TURN" overlay to finish, then give the
    // player a beat (TURN_PICK_DELAY_MS) before the opponent reveals its choice.
    const thinkDelay = (motion ? TURN_TRANSITION_MS : 120) + (motion ? TURN_PICK_DELAY_MS : 30);
    const thinkTimer = window.setTimeout(() => {
      const accuse = isBluff ? Math.random() < 0.55 : Math.random() < 0.08;
      if (accuse) {
        resolveTimer = window.setTimeout(() => callBluff(), motion ? 500 : 20);
      } else {
        const choice = Math.floor(Math.random() * config.cards);
        setOpponentActiveCard(choice);
        resolveTimer = window.setTimeout(() => {
          setOpponentActiveCard(null);
          chooseCard(choice);
        }, motion ? 1250 : 30);
      }
    }, thinkDelay);
    return () => {
      window.clearTimeout(thinkTimer);
      if (resolveTimer) window.clearTimeout(resolveTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, guesserIsBot, round, level]);

  const strategyEntries = useMemo(
    () => history.filter((entry) => entry.level === level && entry.guesser === strategyTab && entry.pick !== null),
    [history, level, strategyTab],
  );
  const frequency = useMemo(() => {
    const counts = Array(config.cards).fill(0) as number[];
    strategyEntries.forEach((entry) => { if (entry.pick) counts[entry.pick - 1] += 1; });
    const high = Math.max(0, ...counts);
    return { counts, high, best: high ? counts.indexOf(high) + 1 : null };
  }, [strategyEntries, config.cards]);

  const gameplay = phase !== "home";

  useEffect(() => {
    if (sound && gameplay) startAmbientMusic();
    else stopAmbientMusic();
    return () => stopAmbientMusic();
  }, [sound, gameplay]);

  useEffect(() => {
    const timedTurn = phase === "guess" || (phase === "dealer" && !dealerIsBot);
    if (sound && timedTurn && timeLeft > 0 && timeLeft <= 5) playSoundCue("countdown", timeLeft);
  }, [sound, phase, dealerIsBot, timeLeft]);

  // Direct "VS Bot" start (used by the multiplayer matchmaking fallback and by
  // ?play=bot). Runs once on mount; bot mode only, untouching normal menu flow.
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (autoStartRef.current || typeof window === "undefined") return;
    autoStartRef.current = true;
    if (new URLSearchParams(window.location.search).get("play") === "bot") {
      // Default mode is already "bot"; just launch the match directly.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time auto-start from URL
      startMatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activePlayer = mode === "local"
    ? phase === "dealer"
      ? dealer
      : phase === "pass" || phase === "shuffle" || phase === "guess"
        ? guesser
        : null
    : null;
  const activeAction = phase === "dealer"
    ? "HIDING"
    : phase === "guess"
      ? "GUESSING"
      : phase === "pass"
        ? "NEXT TURN"
        : phase === "shuffle"
          ? "GET READY"
          : null;

  // Announce a turn change with a brief cinematic transition overlay.
  useEffect(() => {
    if (!currentTurn) return; // neutral phases don't reset the tracked turn
    if (prevTurnKey.current !== null && prevTurnKey.current !== turnKey) {
      setTurnTransition(currentTurn);
      if (transitionTimer.current !== undefined) window.clearTimeout(transitionTimer.current);
      transitionTimer.current = window.setTimeout(
        () => setTurnTransition(null),
        motion ? TURN_TRANSITION_MS : 120,
      );
    }
    prevTurnKey.current = turnKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, motion]);

  // Clear any pending transition timer on unmount.
  useEffect(() => {
    return () => {
      if (transitionTimer.current !== undefined) window.clearTimeout(transitionTimer.current);
    };
  }, []);

  return (
    <main className={["game-shell", motion ? "" : "reduced-motion"].join(" ")}>
      <section className={["game-screen", phase === "result" && result ? resultCopy[result.kind].tone : ""].join(" ")}>
        <div className="corner corner-tl" /><div className="corner corner-tr" />
        <div className="corner corner-bl" /><div className="corner corner-br" />

        <TurnTransition turn={turnTransition} />

        {phase === "home" ? (
          <HomeScreen
            mode={mode}
            setMode={setMode}
            names={names}
            setNames={setNames}
            livesOn={livesOn}
            setLivesOn={setLivesOn}
            startMatch={startMatch}
            openRules={() => setOverlay("rules")}
            openSettings={() => setOverlay("settings")}
          />
        ) : (
          <>
            <GameHeader
              level={level}
              round={round}
              config={config}
              names={displayNames}
              scores={scores}
              time={phase === "guess" || (phase === "dealer" && !dealerIsBot) ? timeLeft : null}
              activePlayer={activePlayer}
              activeAction={activeAction}
              onSettings={() => setOverlay("settings")}
              hearts={mode === "local" && livesOn ? lives : null}
            />
            <button className="quit-button" onClick={() => setOverlay("quit")} aria-label="Quit match" title="Quit match">↪</button>

            {phase === "dealer" && (
              <section className={["play-stage", dealerIsBot ? "opponent-turn" : "player-turn"].join(" ")}>
                <TurnIndicator turn={currentTurn} />
                <div className="stage-title">
                  <p className="eyebrow">{displayNames[dealer]} IS THE DEALER</p>
                  <h2>{dealerIsBot ? "OPPONENT'S TURN" : "HIDE THE KING"}</h2>
                  <Ornament />
                  <p>{dealerIsBot ? "Your opponent is choosing…" : `Choose a hiding place within ${config.seconds} seconds.`}</p>
                </div>
                {dealerIsBot && (
                  <div className="cards-row dealer-choice opponent-choice">
                    {Array.from({ length: config.cards }, (_, index) => (
                      <Card key={index} index={index} disabled />
                    ))}
                    <SelectionHand
                      index={Math.floor((config.cards - 1) / 2)}
                      cardCount={config.cards}
                      faint
                      roaming
                    />
                  </div>
                )}
                {!dealerIsBot && (
                  <>
                    <div className="cards-row dealer-choice">
                      {Array.from({ length: config.cards }, (_, index) => (
                        <Card
                          key={index}
                          index={index}
                          chosen={!isBluff && kingPosition === index}
                          onClick={() => { setIsBluff(false); setKingPosition(index); }}
                          onHover={(hovered) => setHoveredCard(hovered ? index : null)}
                        />
                      ))}
                      <SelectionHand
                        index={hoveredCard ?? (!isBluff ? kingPosition : null)}
                        cardCount={config.cards}
                      />
                    </div>
                    <div className="dealer-actions">
                      <button
                        className={["bluff-choice", isBluff ? "active" : ""].join(" ")}
                        disabled={!bluffsAvailable[dealer]}
                        onClick={() => { setIsBluff(true); setKingPosition(null); }}
                      >
                        <span>☵</span>
                        <b>{bluffsAvailable[dealer] ? "USE YOUR BLUFF" : "BLUFF ALREADY USED"}</b>
                        <small>Place five empty cards. Once this level.</small>
                      </button>
                      <button className="gold-button" disabled={!isBluff && kingPosition === null} onClick={confirmDealerChoice}>
                        LOCK THE CARDS
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}

            {phase === "pass" && (
              <section className="center-stage">
                <span className="pass-icon">♜</span>
                <p className="eyebrow">KEEP THE SECRET</p>
                <h2>PASS THE DEVICE</h2>
                <Ornament />
                <p>Hand the device to <strong>{displayNames[guesser]}</strong>.</p>
                <button className="gold-button wide" onClick={() => setPhase("shuffle")}>I’M READY</button>
              </section>
            )}

            {phase === "shuffle" && (
              <section className="play-stage shuffle-stage">
                <div
                  className="dealer-hand-rig"
                  aria-hidden="true"
                  style={{
                    "--deal-start": `${-((config.cards - 1) * 38)}px`,
                    "--deal-end": `${(config.cards - 1) * 38}px`,
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
                  <p className="eyebrow">THE CARDS ARE IN MOTION</p>
                  <h2>GAME SETUP</h2>
                  <Ornament />
                  <p>Dealer is arranging the cards…</p>
                </div>
                <div className="cards-row dealing">
                  <div className="deal-flight-layer" aria-hidden="true">
                    {Array.from({ length: config.cards }, (_, index) => {
                      const flightDelay = .24 + index * (1.76 / Math.max(1, config.cards - 1));
                      const offset = index - (config.cards - 1) / 2;
                      return (
                        <span
                          key={index}
                          className="flying-deal-card"
                          style={{
                            "--slot-x": `${offset * 76}px`,
                            "--flight-delay": `${flightDelay}s`,
                          } as React.CSSProperties}
                        />
                      );
                    })}
                  </div>
                  {Array.from({ length: config.cards }, (_, index) => {
                    const flightDelay = .24 + index * (1.76 / Math.max(1, config.cards - 1));
                    return (
                      <Card
                        key={index}
                        index={index}
                        disabled
                        dealDelay={flightDelay + .64}
                      />
                    );
                  })}
                </div>
                <p className="bottom-copy">Cards are being placed.<br />Watch closely.</p>
              </section>
            )}

            {phase === "guess" && (
              <section className={["play-stage guess-stage", guesserIsBot ? "opponent-turn" : "player-turn"].join(" ")}>
                <TurnIndicator turn={currentTurn} />
                <div className="stage-title">
                  <p className="eyebrow">{displayNames[guesser]} · GUESSER</p>
                  <h2>{guesserIsBot ? "OPPONENT’S TURN" : "YOUR TURN"}</h2>
                  <Ornament />
                  <p>{guesserIsBot ? "The opponent is reading the table…" : "Pick a card before time runs out."}</p>
                </div>
                <div className="cards-row">
                  {Array.from({ length: config.cards }, (_, index) => (
                    <Card
                      key={index}
                      index={index}
                      disabled={guesserIsBot}
                      onClick={() => chooseCard(index)}
                      onHover={(hovered) => setHoveredCard(hovered ? index : null)}
                    />
                  ))}
                  {guesserIsBot ? (
                    <SelectionHand index={opponentActiveCard} cardCount={config.cards} faint />
                  ) : (
                    <SelectionHand index={hoveredCard} cardCount={config.cards} />
                  )}
                </div>
                <p className="bottom-copy">Find the King.</p>
              </section>
            )}

            {phase === "result" && result && (
              <section className="play-stage result-stage">
                <div className="impact-vignette" />
                <div className="stage-title">
                  <p className="eyebrow">ROUND {round} RESULT</p>
                  <h2>{resultCopy[result.kind].title}</h2>
                  <Ornament />
                  <p>{resultCopy[result.kind].subtitle}</p>
                </div>
                <div className="cards-row reveal-row">
                  {Array.from({ length: config.cards }, (_, index) => (
                    <Card
                      key={index}
                      index={index}
                      faceUp
                      blank={isBluff}
                      king={!isBluff && index === kingPosition}
                      chosen={index === result.pick}
                      wrong={(result.kind === "wrong" || result.kind === "bluff-worked") && index === result.pick}
                      disabled
                    />
                  ))}
                  {result.pick !== null && <SelectionHand index={result.pick} cardCount={config.cards} settled faint={guesserIsBot} />}
                </div>
                <div className="round-verdict">
                  <b>{displayNames[result.winner]} WINS THE ROUND</b>
                  {mode === "local" && livesOn && result.kind === "king" ? (
                    <span>KING FOUND — {displayNames[dealer]} LOST A LIFE</span>
                  ) : (
                    <span>+{config.points} {config.points === 1 ? "point" : "points"}</span>
                  )}
                </div>
                <button className="gold-button wide result-next" onClick={nextRound}>
                  {mode === "local" && livesOn && lifeWinner !== null
                    ? "FINAL RESULT"
                    : round === 10
                      ? "LEVEL RESULTS"
                      : "NEXT ROUND"}
                </button>
              </section>
            )}

            {phase === "level-end" && (
              <section className="center-stage level-stage">
                <span className="level-crown">♛</span>
                <p className="eyebrow">TEN ROUNDS COMPLETE</p>
                <h2>{config.name} CLEARED</h2>
                <Ornament />
                <div className="score-board large">
                  <div><span>{displayNames[0]}</span><strong>{scores[0]}</strong></div>
                  <i>—</i>
                  <div><span>{displayNames[1]}</span><strong>{scores[1]}</strong></div>
                </div>
                {level < LEVELS.length - 1 ? (
                  <>
                    <p>Next: <strong>{LEVELS[level + 1].cards} cards</strong>, {LEVELS[level + 1].seconds} seconds, {LEVELS[level + 1].points}× stakes.</p>
                    <button className="gold-button wide" onClick={nextLevel}>ENTER {LEVELS[level + 1].name}</button>
                  </>
                ) : (
                  <button className="gold-button wide" onClick={nextLevel}>FINAL RESULT</button>
                )}
              </section>
            )}

            {phase === "match-end" && (
              <section className="center-stage match-stage">
                <span className="level-crown">♛</span>
                <p className="eyebrow">THE KINGDOM HAS SPOKEN</p>
                {mode === "local" && livesOn && lifeWinner !== null ? (
                  <>
                    <h2>{`${displayNames[lifeWinner]} WINS!`}</h2>
                    <Ornament />
                    <p>{`${displayNames[lifeWinner === 0 ? 1 : 0]} lost all 5 Kings.`}</p>
                  </>
                ) : (
                  <>
                    <h2>{scores[0] === scores[1] ? "A ROYAL DRAW" : `${displayNames[scores[0] > scores[1] ? 0 : 1]} WINS!`}</h2>
                    <Ornament />
                    <p>Thirty rounds. Three courts. One ruler.</p>
                  </>
                )}
                <div className="score-board large final">
                  <div>
                    <span>{displayNames[0]}</span>
                    <strong>{mode === "local" && livesOn ? (lives[0] < 0 ? 0 : lives[0]) : scores[0]}</strong>
                  </div>
                  <i>VS</i>
                  <div>
                    <span>{displayNames[1]}</span>
                    <strong>{mode === "local" && livesOn ? (lives[1] < 0 ? 0 : lives[1]) : scores[1]}</strong>
                  </div>
                </div>
                <button className="gold-button wide" onClick={startMatch}>PLAY AGAIN</button>
                <button className="text-button" onClick={() => setPhase("home")}>BACK TO HOME</button>
              </section>
            )}

            {gameplay && phase !== "match-end" && (
              <PowerDock
                bluffActive={phase === "guess" && !guesserIsBot}
                onStrategy={() => { setStrategyTab(0); setOverlay("strategy"); }}
                onBluff={() => {
                  if (sound) playSoundCue("bluff-open");
                  setOverlay("bluff");
                }}
              />
            )}
          </>
        )}

        {overlay === "rules" && <RulesModal onClose={() => setOverlay(null)} />}
        {overlay === "settings" && (
          <SettingsModal sound={sound} motion={motion} setSound={setSound} setMotion={setMotion} onClose={() => setOverlay(null)} />
        )}
        {overlay === "quit" && (
          <Modal onClose={() => setOverlay(null)} className="quit-modal">
            <span className="modal-symbol">↪</span>
            <p className="eyebrow">LEAVE THE KINGDOM?</p>
            <h3>QUIT MATCH</h3>
            <Ornament />
            <p>Your current round, score, and strategy history will be cleared.</p>
            <button className="quit-confirm wide" onClick={quitMatch}>QUIT TO HOME</button>
            <button className="outline-button wide" onClick={() => setOverlay(null)}>KEEP PLAYING</button>
          </Modal>
        )}
        {overlay === "bluff" && (
          <Modal onClose={() => setOverlay(null)} className="bluff-modal">
            <span className="modal-symbol">◑ ◒</span>
            <p className="eyebrow">TRUST YOUR INSTINCT</p>
            <h3>CALL THE BLUFF?</h3>
            <Ornament />
            <p>Do you think the dealer hid no King this round?</p>
            <button className="gold-button wide" onClick={callBluff}>YES — CALL BLUFF</button>
            <button className="outline-button wide" onClick={() => setOverlay(null)}>NO — PICK A CARD</button>
            <small>A wrong accusation gives the round to the dealer.</small>
          </Modal>
        )}
        {overlay === "strategy" && (
          <StrategyModal
            names={displayNames}
            tab={strategyTab}
            setTab={setStrategyTab}
            entries={strategyEntries}
            frequency={frequency}
            cardCount={config.cards}
            levelName={config.name}
            onClose={() => setOverlay(null)}
          />
        )}
      </section>
    </main>
  );
}

function TurnIndicator({ turn }: { turn: TurnInfo | null }) {
  if (!turn) return null;
  const isPlayer = turn.kind === "player";
  return (
    <div className={["turn-indicator", isPlayer ? "player-turn" : "opponent-turn"].join(" ")}>
      <span className="turn-dot">●</span>
      <span className="turn-text">
        <b>{turn.title}</b>
        <small>{turn.subtitle}</small>
      </span>
    </div>
  );
}

function TurnTransition({ turn }: { turn: TurnInfo | null }) {
  if (!turn) return null;
  const isPlayer = turn.kind === "player";
  return (
    <div className={["turn-transition", isPlayer ? "player-turn" : "opponent-turn"].join(" ")} aria-hidden="true">
      <div className="turn-transition-announce">
        <span className="turn-transition-crown">♛</span>
        <b className="turn-transition-title">{turn.title}</b>
        <Ornament />
        <small className="turn-transition-subtitle">{turn.subtitle}</small>
      </div>
    </div>
  );
}

function SelectionHand({ index, cardCount, settled = false, faint = false, roaming = false }: {
  index: number | null;
  cardCount: number;
  settled?: boolean;
  faint?: boolean;
  roaming?: boolean;
}) {
  if (index === null) return null;
  const offset = index - (cardCount - 1) / 2;
  return (
    <Image
      className={[
        "selection-hand-img",
        settled ? "settled" : "",
        faint ? "faint" : "",
        roaming ? "roaming" : "",
      ].join(" ")}
      src="/guesser-hand.png"
      alt=""
      width={980}
      height={1792}
      unoptimized
      aria-hidden="true"
      style={{
        "--hand-x": `${offset * 76}px`,
        "--roam-span": `${(cardCount - 1) * 38}px`,
      } as React.CSSProperties}
    />
  );
}

function HomeScreen({
  mode, setMode, names, setNames, livesOn, setLivesOn, startMatch, openRules, openSettings,
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  names: [string, string];
  setNames: React.Dispatch<React.SetStateAction<[string, string]>>;
  livesOn: boolean;
  setLivesOn: (on: boolean) => void;
  startMatch: () => void;
  openRules: () => void;
  openSettings: () => void;
}) {
  return (
    <section className="home-screen" aria-labelledby="game-title">
      <button className="settings-button" onClick={openSettings} aria-label="Open settings">⚙</button>
      <Logo />
      <p className="tagline">Outsmart. Bluff. Win.</p>
      <div className="king-emblem">
        <Image
          className="home-app-logo"
          src="/app-logo.png"
          alt="Kill the King mask and sword emblem"
          width={1324}
          height={1296}
          priority
          unoptimized
        />
      </div>
      <div className="entry-panel">
        <p className="panel-title">ENTER THE KINGDOM</p>
        <div className="mode-switch" aria-label="Game mode">
          <button className={mode === "bot" ? "active" : ""} onClick={() => setMode("bot")}>VS BOT</button>
          <button className={mode === "local" ? "active" : ""} onClick={() => setMode("local")}>2 PLAYERS</button>
        </div>
        <label htmlFor="player-one">YOUR NAME</label>
        <input id="player-one" value={names[0]} onChange={(event) => setNames((previous) => [event.target.value, previous[1]])} placeholder="Enter your name" autoComplete="name" />
        {mode === "local" && (
          <>
            <label htmlFor="player-two">OPPONENT NAME</label>
            <input id="player-two" value={names[1]} onChange={(event) => setNames((previous) => [previous[0], event.target.value])} placeholder="Enter opponent name" />
            <label className="settings-check" htmlFor="lives5">
              <span>5 Lives</span>
              <input
                id="lives5"
                type="checkbox"
                checked={livesOn}
                onChange={(e) => setLivesOn(e.target.checked)}
              />
            </label>
            {livesOn && <p className="settings-note">Finding the King costs the hider a life. First to ❤ 0 loses.</p>}
          </>
        )}
        <button className="gold-button" onClick={startMatch}>START MATCH</button>
        <button
          className="outline-button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.assign("/multiplayer");
          }}
        >
          ONLINE MULTIPLAYER
        </button>
        <button className="outline-button" onClick={openRules}>HOW TO PLAY</button>
      </div>
      <div className="level-route"><span>5 CARDS</span><i>→</i><span>3 CARDS</span><i>→</i><span>2 CARDS</span></div>
      <p className="round-note">10 rounds per level · one bluff each</p>
    </section>
  );
}

function GameHeader({
  level, round, config, names, scores, time, activePlayer, activeAction, onSettings, hearts,
}: {
  level: number;
  round: number;
  config: typeof LEVELS[number];
  names: [string, string];
  scores: [number, number];
  time: number | null;
  activePlayer: number | null;
  activeAction: string | null;
  onSettings: () => void;
  hearts?: [number, number] | null;
}) {
  const showHearts = !!hearts;
  return (
    <header className="game-header">
      <Logo compact />
      <div className="round-medallion">
        <small>LEVEL {level + 1}</small>
        <strong>{String(round).padStart(2, "0")}</strong>
      </div>
      <div className="header-controls">
        {time === null ? (
          <button className="mini-settings" onClick={onSettings} aria-label="Settings">⚙</button>
        ) : (
          <div className="timer" style={{ "--timer": `${Math.max(0, time / config.seconds) * 360}deg` } as React.CSSProperties}>
            <strong>{time}</strong><small>SEC</small>
          </div>
        )}
      </div>
      <div className="score-strip">
        <span className={activePlayer === 0 ? "active-turn" : ""}>
          {activePlayer === 0 && activeAction && <small>{activeAction}</small>}
          <strong>{names[0]}</strong>
          <b>{showHearts ? hearts![0] : scores[0]}</b>
        </span>
        <i>{config.cards} CARDS · {config.points}×</i>
        <span className={activePlayer === 1 ? "active-turn" : ""}>
          <b>{showHearts ? hearts![1] : scores[1]}</b>
          <strong>{names[1]}</strong>
          {activePlayer === 1 && activeAction && <small>{activeAction}</small>}
        </span>
      </div>
      {showHearts && (
        <div className="single-lives-bar">
          <span className="lives-row">{heartsPips(hearts![0])}</span>
          <em>LIVES</em>
          <span className="lives-row">{heartsPips(hearts![1])}</span>
        </div>
      )}
    </header>
  );
}

/** Render 5 heart pips, n of them full. */
function heartsPips(n: number) {
  const count = Math.max(0, Math.min(5, Math.round(n)));
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={`life ${i < count ? "" : "lost"}`} aria-hidden="true">❤</span>
  ));
}

function PowerDock({ bluffActive, onStrategy, onBluff }: {
  bluffActive: boolean;
  onStrategy: () => void;
  onBluff: () => void;
}) {
  return (
    <nav className="power-dock" aria-label="Powers">
      <button onClick={onStrategy}><span>▱</span><b>STRATEGY</b></button>
      <div />
      <button onClick={onBluff} disabled={!bluffActive}><span>◑</span><b>CALL BLUFF</b></button>
    </nav>
  );
}

function Modal({ children, onClose, className = "" }: { children: React.ReactNode; onClose: () => void; className?: string }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={["modal-card", className].join(" ")} role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        {children}
      </section>
    </div>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <span className="modal-symbol">♛</span>
      <p className="eyebrow">KNOW THE COURT</p>
      <h3>HOW TO PLAY</h3>
      <Ornament />
      <ol className="rules-list">
        <li><b>Hide.</b> The Dealer secretly places the King—or uses their one Bluff.</li>
        <li><b>Shuffle.</b> Five cards are dealt. Later levels fall to three, then two.</li>
        <li><b>Guess.</b> Pick a card before the timer reaches zero.</li>
        <li><b>Call it.</b> If you suspect no King was placed, call Bluff. Right wins; wrong loses.</li>
        <li><b>Rule.</b> Play ten rounds per level. Higher levels award more points.</li>
      </ol>
      <button className="gold-button wide" onClick={onClose}>ENTER THE KINGDOM</button>
    </Modal>
  );
}

function SettingsModal({ sound, motion, setSound, setMotion, onClose }: {
  sound: boolean;
  motion: boolean;
  setSound: (value: boolean) => void;
  setMotion: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <span className="modal-symbol">⚙</span>
      <p className="eyebrow">YOUR EXPERIENCE</p>
      <h3>SETTINGS</h3>
      <Ornament />
      <div className="settings-list">
        <div className="settings-row"><span><label htmlFor="sound-setting">Sound &amp; music</label><small>Ambient theme, countdown and result cues</small></span><input id="sound-setting" type="checkbox" checked={sound} onChange={(event) => { if (event.target.checked) { preloadGameAudio(); playSoundCue("start"); } setSound(event.target.checked); }} /></div>
        <div className="settings-row"><span><label htmlFor="motion-setting">Card animations</label><small>Dealer hand and transitions</small></span><input id="motion-setting" type="checkbox" checked={motion} onChange={(event) => setMotion(event.target.checked)} /></div>
      </div>
      <button className="gold-button wide" onClick={onClose}>SAVE SETTINGS</button>
    </Modal>
  );
}

function StrategyModal({ names, tab, setTab, entries, frequency, cardCount, levelName, onClose }: {
  names: [string, string];
  tab: 0 | 1;
  setTab: (tab: 0 | 1) => void;
  entries: HistoryItem[];
  frequency: { counts: number[]; high: number; best: number | null };
  cardCount: number;
  levelName: string;
  onClose: () => void;
}) {
  const recordedTurns = entries.slice(0, 5);
  const constellationPoints = recordedTurns
    .map((entry, index) => entry.pick ? `${((entry.pick - .5) / 5) * 100},${((index + .5) / 5) * 100}` : null)
    .filter(Boolean)
    .join(" ");

  return (
    <Modal onClose={onClose} className="strategy-modal">
      <span className="modal-symbol">▱</span>
      <p className="eyebrow">{levelName}</p>
      <h3>STRATEGY</h3>
      <div className="strategy-tabs">
        <button className={tab === 0 ? "active" : ""} onClick={() => setTab(0)}>{names[0].toUpperCase()}</button>
        <button className={tab === 1 ? "active" : ""} onClick={() => setTab(1)}>{names[1].toUpperCase()}</button>
      </div>
      <p className="strategy-help">Only cards picked while guessing are recorded. Hidden King positions are never included.</p>
      <div className="strategy-map">
        <div className="strategy-round-labels">
          {Array.from({ length: 5 }, (_, index) => <b key={index}>ROUND {index + 1}</b>)}
        </div>
        <div className="strategy-card-field">
          {constellationPoints && (
            <svg className="strategy-constellation" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={constellationPoints} />
            </svg>
          )}
          <div className="strategy-card-grid">
            {Array.from({ length: 5 }, (_, row) =>
              Array.from({ length: 5 }, (_, column) => {
                const cardNumber = column + 1;
                const entry = recordedTurns[row];
                const selected = entry?.pick === cardNumber;
                return (
                  <div
                    key={`${row}-${column}`}
                    className={[
                      "strategy-mini-card",
                      selected ? "selected" : "",
                      cardNumber > cardCount ? "unavailable" : "",
                    ].join(" ")}
                    title={entry ? `Game round ${entry.round}` : `Turn ${row + 1}`}
                  >
                    {selected && <span>{cardNumber}<small>✓</small></span>}
                    {entry?.calledBluff && column === 2 && <span className="bluff-record">B<small>BLUFF</small></span>}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </div>
      <div className="pattern-result">
        <small>PATTERN DETECTED</small>
        {frequency.best ? (
          <><b>CARD {frequency.best} PICKED MOST</b><span>{frequency.high} of {recordedTurns.filter((entry) => entry.pick).length} recorded guesses · {frequency.best === Math.ceil(cardCount / 2) ? "CENTER-FOCUSED" : frequency.best <= cardCount / 2 ? "LEFT-LEANING" : "RIGHT-LEANING"}</span></>
        ) : (
          <><b>NO PATTERN YET</b><span>Make a guess to begin recording.</span></>
        )}
      </div>
      <button className="gold-button wide" onClick={onClose}>CLOSE</button>
    </Modal>
  );
}
