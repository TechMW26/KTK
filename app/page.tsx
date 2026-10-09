"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ChessRook,
  CircleDot,
  Crown,
  Heart,
  LogOut,
  Menu,
  Settings,
  User,
} from "lucide-react";

import { Ornament } from "@/components/common/Brand";
import { SplashScreen } from "@/components/common/SplashScreen";
import { Modal as DialogShell } from "@/components/ui/Modal";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { GameHeader } from "@/features/game/components/GameHeader";
import { RulesModal, SettingsModal } from "@/features/game/components/InfoDialogs";
import { PowerDock } from "@/features/game/components/PowerDock";
import { SelectionHand } from "@/features/game/components/SelectionHand";
import { DealerSwipe } from "@/features/game/components/DealerSwipe";
import { PwaRegistration } from "@/components/common/PwaRegistration";
import { indexToSlot } from "@/features/game/logic/cardFan";
import { StrategyModal } from "@/features/game/components/StrategyModal";
import { AccountDialog } from "@/features/account/components/AccountDialog";
import { AccountScreen } from "@/features/account/components/AccountScreen";
import { useAccount } from "@/hooks/useAccount";
import { recordMatchResult } from "@/lib/firebase/profile";
import { TurnTransition } from "@/features/game/components/TurnIndicator";
import { COURTS, roundsInCourt, setCurrentCourtIndex, STARTING_LIVES } from "@/features/game/constants/courts";
import {
  RESULT_COPY,
  revealCopyFor,
  turnAnnouncement,
  turnKey as buildTurnKey,
} from "@/features/game/constants/copy";
import {
  BOT_ACCUSE_MS,
  BOT_GUESS_REACH_MS,
  BOT_HIDE_LOCK_MS,
  BOT_HIDE_PICK_MS,
  BOT_THINK_AFTER_VEIL_MS,
  COUNTDOWN_WARNING_SECONDS,
  dealTimings,
  KING_PLACE_MS,
  PULL_MS,
  REDUCED,
  REVEAL_LOCK_MS,
  SHUFFLE_MS,
  TURN_VEIL_MS,
} from "@/features/game/constants/pacing";
import { decideGuessTurn, decideHidingSpot } from "@/features/game/logic/bot";
import { afterCourt, afterRound } from "@/features/game/logic/progression";
import { resolveLocalRound, resolveTimedOutDealerChoice } from "@/features/game/logic/round";
import { applyLifeLoss, applyRoundWin, lifeWinner as winnerFromLives } from "@/features/game/logic/scoring";
import { dealerForRound, guesserForRound } from "@/features/game/logic/seats";
import { picksThisCourt, summarisePicks } from "@/features/game/logic/strategy";
import type {
  MatchPhase,
  OpenDialog,
  OpponentKind,
  RoundHistoryEntry,
  RoundOutcome,
  RoundOutcomeKind,
  Seat,
  TurnAnnouncement,
} from "@/features/game/types/game";
import {
  playSoundCue,
  preloadGameAudio,
  startAmbientMusic,
  stopAmbientMusic,
} from "@/services/audio/gameAudio";

export default function Home() {
  const [phase, setPhase] = useState<MatchPhase>("home");
  /** The component reserves intro playback once per tab/app session. */
  const [splashOpen, setSplashOpen] = useState(true);
  const homeLogoRef = useRef<HTMLImageElement>(null);
  const [mode, setMode] = useState<OpponentKind>("bot");
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
  const [lives, setLives] = useState<[number, number]>([STARTING_LIVES, STARTING_LIVES]);
  const [lifeWinner, setLifeWinner] = useState<0 | 1 | null>(null);
  const [result, setResult] = useState<RoundOutcome | null>(null);
  const [history, setHistory] = useState<RoundHistoryEntry[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(COURTS[0].seconds);
  const [overlay, setOverlay] = useState<OpenDialog>(null);
  const account = useAccount();
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  /**
   * Card the guesser has tapped once but not yet confirmed. The first tap aims
   * (pointer + highlight), the second tap on the same card commits the pick.
   */
  const [targetCard, setTargetCard] = useState<number | null>(null);
  /**
   * The guesser's locked card during the reveal beat, so the row can highlight
   * the pick before every card flips. Null on a bluff call (no card picked).
   */
  const [revealPick, setRevealPick] = useState<number | null>(null);
  /**
   * The card currently playing its "pulled toward the player" beat. Held only
   * for the length of the animation, then cleared — it is presentation, never
   * game state, so nothing reads it to decide an outcome.
   */
  const [pullCard, setPullCard] = useState<number | null>(null);
  /**
   * Which card is playing the hidden-King placement beat. Null unless the
   * dealer just committed a real King; a bluff has no King, so it stays null.
   */
  const [placingKing, setPlacingKing] = useState<number | null>(null);
  const [opponentActiveCard, setOpponentActiveCard] = useState<number | null>(null);
  const [strategyTab, setStrategyTab] = useState<0 | 1>(0);
  const [sound, setSound] = useState(true);
  const [motion, setMotion] = useState(true);
  const [turnTransition, setTurnTransition] = useState<TurnAnnouncement | null>(null);
  const prevTurnKey = useRef<string | null>(null);
  const transitionTimer = useRef<number | undefined>(undefined);
  /** Guards the stats write so one match is counted exactly once. */
  const recordedMatch = useRef<MatchPhase | null>(null);

  const config = COURTS[level];
  const dealer = dealerForRound(round);
  const guesser = guesserForRound(round);
  const dealerIsBot = mode === "bot" && dealer === 1;
  const guesserIsBot = mode === "bot" && guesser === 1;
  /**
   * Whether the card row is painted from the other side of the table.
   *
   * Local play is always viewed from the acting seat — the device is handed to
   * whoever must act, so that player is at the bottom of the screen and the row
   * is never mirrored. Multiplayer is where two players genuinely sit opposite,
   * so the row is mirrored whenever the PLAYER AT THE BOTTOM is dealer and the
   * opponent is across the table (seat 1 looking at a seat 0 view). Identity is
   * untouched either way; see features/game/logic/cardFan.ts.
   */
  const guesserViewMirrored = false;
  // Complete-turn blocks: which hide this is inside the current player's run.
  // Round resets to 1 each court, so the block restarts there too.
  // Even, window-fitted deal choreography for the current court's card count.
  const deal = useMemo(
    () => dealTimings(config.cards, motion ? SHUFFLE_MS : REDUCED.shuffle),
    [config.cards, motion],
  );
  const displayNames: [string, string] = [names[0].trim() || "Player 1", mode === "bot" ? "The Rival" : names[1].trim() || "Player 2"];
  /**
   * The seat this board is speaking TO, i.e. whose perspective the reveal copy
   * addresses. The human always holds seat 0 in bot mode; in Pass & Play the
   * device is handed to whoever acts, so the ACTING seat is the perspective for
   * that round — which is why this is derived per phase rather than fixed.
   */
  const perspectiveSeat: Seat = mode === "bot" ? 0 : (phase === "guess" ? guesser : dealer);
  /**
   * The seat that won the whole match, or null for a draw. Derived once here so
   * the match-end heading, the scoreboard and the recorded account statistic can
   * never disagree about who actually won.
   */
  const matchWinner: Seat | null = useMemo(() => {
    if (mode === "local" && livesOn && lifeWinner !== null) return lifeWinner;
    if (scores[0] === scores[1]) return null;
    return (scores[0] > scores[1] ? 0 : 1) as Seat;
  }, [scores, mode, livesOn, lifeWinner]);
  const currentTurn = turnAnnouncement({ phase, dealerIsBot, guesserIsBot });
  const turnKey = buildTurnKey(currentTurn, phase);

  const resetRoundState = (nextLevel = level) => {
    setKingPosition(null);
    setIsBluff(false);
    setResult(null);
    setTimeLeft(COURTS[nextLevel].seconds);
    setOverlay(null);
    setHoveredCard(null);
    setTargetCard(null);
    setRevealPick(null);
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
      setLives([STARTING_LIVES, STARTING_LIVES]);
      setLifeWinner(null);
    }
    resetRoundState(0);
    setPhase("dealer");
  };

  /**
   * Home-screen entry points.
   *
   * Each new main-menu button funnels into an EXISTING flow: `startMode` sets the
   * opponent kind and launches a local match, `go` navigates to a multiplayer
   * route with a query flag the destination reads. No gameplay is reimplemented
   * here — this only chooses which existing flow to enter.
   */
  const startMode = (next: OpponentKind) => {
    setMode(next);
    // `mode` is read inside startMatch from the closure; set it on the next tick
    // so the freshly chosen mode is the one that starts. Using a ref-free microtask
    // keeps this a single render commit for the user.
    window.setTimeout(() => startMatchForMode(next), 0);
  };

  const startMatchForMode = (next: OpponentKind) => {
    if (sound) {
      preloadGameAudio();
      startAmbientMusic();
      playSoundCue("start");
    }
    setNames(([first, second]) => [first.trim() || "Player 1", next === "bot" ? "The Rival" : second.trim() || "Player 2"]);
    setScores([0, 0]);
    setLevel(0);
    setRound(1);
    setBluffsAvailable([true, true]);
    setHistory([]);
    if (next === "local") {
      setLives([STARTING_LIVES, STARTING_LIVES]);
      setLifeWinner(null);
    }
    resetRoundState(0);
    setPhase("dealer");
  };

  /** Navigate to a multiplayer route, preserving the Firebase-configured guard. */
  const go = (path: string) => {
    if (typeof window !== "undefined") window.location.assign(path);
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
      setLives([STARTING_LIVES, STARTING_LIVES]);
      setLifeWinner(null);
    }
    resetRoundState(0);
    setPhase("home");
  };

  /**
   * Resolve the round and show its reveal.
   *
   * Scoring, the optional life loss and the history record are all derived from
   * the outcome here, so the reveal, the score strip and the strategy panel can
   * never disagree about what happened.
   */
  const finishRound = (kind: RoundOutcomeKind, winner: Seat, pick: number | null, calledBluff: boolean) => {
    const outcome: RoundOutcome = { kind, winner, pick, calledBluff };
    setResult(outcome);
    setScores((previous) => applyRoundWin(previous, winner, config.points));
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
    setTargetCard(null);
    // Local 2-Player 5-Lives: a found hidden King costs its DEALER one life.
    if (mode === "local" && livesOn) {
      const nextLives = applyLifeLoss(lives, outcome, dealer);
      setLives(nextLives);
      const winner = winnerFromLives(nextLives);
      if (winner !== null) setLifeWinner(winner);
    }
    // Show the locked pick and every card turning over BEFORE the verdict, so
    // the selected card locks and then ALL cards reveal. The verdict screen
    // (phase "result") follows after the reveal beat.
    //
    // The pull beat runs first: the picked card travels toward the player who
    // chose it, then the existing reveal takes over. `pullCard` is presentation
    // only — it never influences `revealPick` or the outcome, both of which are
    // already decided by the time we get here.
    if (pick !== null && motion) {
      setPullCard(pick);
      window.setTimeout(() => setPullCard(null), PULL_MS);
    }
    setRevealPick(pick);
    setPhase("reveal");
  };

  // Advance from the reveal beat to the verdict once the row has flipped.
  useEffect(() => {
    if (phase !== "reveal" || !result) return;
    const timer = window.setTimeout(
      () => setPhase("result"),
      motion ? REVEAL_LOCK_MS : REDUCED.revealLock,
    );
    return () => window.clearTimeout(timer);
    // Runs once per reveal beat; the result identity is the round identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const chooseCard = (index: number) => {
    if (phase !== "guess" || result) return;
    const outcome = resolveLocalRound({ isBluff, kingIndex: kingPosition, pick: index, calledBluff: false, dealer });
    finishRound(outcome.kind, outcome.winner, outcome.pick, outcome.calledBluff);
  };

  const callBluff = () => {
    const outcome = resolveLocalRound({ isBluff, kingIndex: kingPosition, pick: null, calledBluff: true, dealer });
    finishRound(outcome.kind, outcome.winner, outcome.pick, outcome.calledBluff);
  };

  /**
   * Two-step guess: the first tap on a card aims at it (pointer + highlight),
   * the second tap on that same card commits through `chooseCard`. Tapping a
   * different card simply moves the aim, so no accidental pick is possible.
   */
  const handleCardTap = (index: number) => {
    if (phase !== "guess" || result) return;
    if (targetCard !== index) {
      setTargetCard(index);
      return;
    }
    chooseCard(index);
  };

  const confirmDealerChoice = () => {
    if (!isBluff && kingPosition === null) return;
    if (isBluff) {
      setBluffsAvailable((previous) => previous.map((available, index) => index === dealer ? false : available) as [boolean, boolean]);
    }
    setPhase(mode === "local" ? "pass" : "shuffle");
  };

  const nextRound = () => {
    const step = afterRound({ round, level, livesEnabled: mode === "local" && livesOn, hasLifeWinner: lifeWinner !== null });
    if (step.action === "match-complete") {
      setPhase("match-end");
      return;
    }
    if (step.action === "court-complete") {
      setPhase("level-end");
      return;
    }
    setRound(step.round);
    resetRoundState();
    setPhase("dealer");
  };

  const nextLevel = () => {
    const step = afterCourt(level);
    if (step.action === "match-complete") {
      setPhase("match-end");
      return;
    }
    setLevel(step.level);
    setRound(step.round);
    setBluffsAvailable([true, true]);
    resetRoundState(step.level);
    setPhase("dealer");
  };

  useEffect(() => {
    if (phase !== "dealer" || !dealerIsBot) return;
    const hiding = decideHidingSpot({
      cards: config.cards,
      bluffAvailable: bluffsAvailable[dealer],
      bluffRoll: Math.random(),
      positionRoll: Math.random(),
    });
    const useBluff = hiding.isBluff;
    const chooseTimer = window.setTimeout(() => {
      setIsBluff(useBluff);
      setKingPosition(hiding.kingIndex);
    }, motion ? BOT_HIDE_PICK_MS : REDUCED.hidePick);
    const finishTimer = window.setTimeout(() => {
      if (useBluff) setBluffsAvailable((previous) => [previous[0], false]);
      setOpponentActiveCard(null);
      setPhase("shuffle");
    }, motion ? BOT_HIDE_LOCK_MS : REDUCED.hideLock);
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
          setKingPosition(resolveTimedOutDealerChoice(config.cards, Math.random()));
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
    }, motion ? SHUFFLE_MS : REDUCED.shuffle);
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
    // player a beat before the opponent reveals its choice.
    const thinkDelay = (motion ? TURN_VEIL_MS : REDUCED.veil) + (motion ? BOT_THINK_AFTER_VEIL_MS : REDUCED.afterVeil);
    const thinkTimer = window.setTimeout(() => {
      const decision = decideGuessTurn({
        cards: config.cards,
        dealerBluffed: isBluff,
        accuseRoll: Math.random(),
        pickRoll: Math.random(),
      });
      if (decision.accused) {
        resolveTimer = window.setTimeout(() => callBluff(), motion ? BOT_ACCUSE_MS : REDUCED.accuse);
      } else {
        const choice = decision.cardIndex ?? 0;
        // Land the opponent's finger on the card first. `chooseCard` flips the
        // phase to "result" and swaps this row out for the reveal, so if the
        // highlight is applied in the same tick it is never painted: the aim
        // has to hold independently of the commit.
        setOpponentActiveCard(choice);
        const aimBeat = motion ? BOT_GUESS_REACH_MS : REDUCED.guessReach;
        resolveTimer = window.setTimeout(() => {
          chooseCard(choice);
          // Cleared only once the reveal owns the board, so the beat is visible
          // without leaving a stale highlight on the next round.
          resolveTimer = window.setTimeout(() => setOpponentActiveCard(null), aimBeat);
        }, aimBeat);
      }
    }, thinkDelay);
    return () => {
      window.clearTimeout(thinkTimer);
      if (resolveTimer) window.clearTimeout(resolveTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, guesserIsBot, round, level]);

  const strategyEntries = useMemo(
    () => picksThisCourt(history, level, strategyTab),
    [history, level, strategyTab],
  );
  const frequency = useMemo(
    () => summarisePicks(strategyEntries, config.cards),
    [strategyEntries, config.cards],
  );

  const gameplay = phase !== "home";

  useEffect(() => {
    if (sound && gameplay) startAmbientMusic();
    else stopAmbientMusic();
    return () => stopAmbientMusic();
  }, [sound, gameplay]);

  useEffect(() => {
    const timedTurn = phase === "guess" || (phase === "dealer" && !dealerIsBot);
    if (sound && timedTurn && timeLeft > 0 && timeLeft <= COUNTDOWN_WARNING_SECONDS) playSoundCue("countdown", timeLeft);
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

  // Which seat the score rail highlights.
  //
  // Only meaningful for a shared device (local 2-player), where the highlight
  // tells the two humans whose turn it is. Online and vs-bot have their own
  // chrome, so this stays null there.
  //
  // `pass` and `shuffle` belong to the incoming GUESSER: they are the one who
  // receives the device and then plays the guess.
  const activePlayer = mode === "local"
    ? phase === "dealer"
      ? dealer
      : phase === "pass" || phase === "shuffle" || phase === "guess"
        ? guesser
        : null
    : null;

  // The one-word verb shown beside the highlighted seat.
  //
  // CRITICAL: this is a per-player ACTION badge, so it must only be set for
  // phases where a player is actually doing something. `pass` and `shuffle` are
  // neutral beats — the device is being handed over, then the cards are dealt —
  // so no seat gets a badge. Labelling the guesser "NEXT TURN" / "GET READY"
  // would attribute an action to a player who is not acting.
  const activeAction = phase === "dealer"
    ? "HIDING"
    : phase === "guess"
      ? "GUESSING"
      : null;

  // Announce a turn change with a brief cinematic transition overlay.
  useEffect(() => {
    if (!currentTurn) return; // neutral phases don't reset the tracked turn
    if (prevTurnKey.current !== null && prevTurnKey.current !== turnKey) {
      setTurnTransition(currentTurn);
      if (transitionTimer.current !== undefined) window.clearTimeout(transitionTimer.current);
      transitionTimer.current = window.setTimeout(
        () => setTurnTransition(null),
        motion ? TURN_VEIL_MS : REDUCED.veil,
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

  /**
   * Keep the shared court rotation pointed at the live court.
   *
   * The seat helpers are called from render without a court argument, so the
   * module needs to know which court the match is on to pick the right block
   * size (5, 3 or 2 hides). This runs before those reads in the same commit.
   */
  useEffect(() => {
    setCurrentCourtIndex(level);
  }, [level]);

  /**
   * Record the finished match against the signed-in account.
   *
   * Burns once per match: `recordedMatch.current` holds the phase transition
   * that was already counted, so re-renders, a StrictMode double-invoke or
   * "PLAY AGAIN" restarting the match cannot inflate the totals.
   *
   * The winner is the same comparison the match-end screen displays, so the
   * statistic and the result the player just saw can never disagree. In
   * 2-Player mode both humans share one account, so that account is credited
   * with the seat that won; with no account signed in the effect does nothing.
   */
  useEffect(() => {
    if (phase !== "match-end") return;
    if (recordedMatch.current === phase) return;
    recordedMatch.current = phase;

    const user = account.user;
    if (!user || user.isAnonymous) return;

    // Same source of truth as the match-end heading, so the recorded statistic
    // and the result the player just saw can never disagree.
    const won = matchWinner === 0;

    void recordMatchResult(user.uid, won).then((result) => {
      if (!result.ok && result.reason !== "no-profile") {
        console.warn("[account] match result not recorded", result.reason);
        return;
      }
      void account.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <main className={["game-shell", motion ? "" : "reduced-motion"].filter(Boolean).join(" ")}>
      <PwaRegistration />
      {splashOpen && <SplashScreen logoRef={homeLogoRef} sound={sound} onDone={() => setSplashOpen(false)} />}
      <section inert={splashOpen || undefined} className={["game-screen", phase === "result" && result ? RESULT_COPY[result.kind].tone : ""].filter(Boolean).join(" ")}>

        <TurnTransition turn={turnTransition} />

        {phase === "home" ? (
          <HomeScreen
            logoRef={homeLogoRef}
            names={names}
            setNames={setNames}
            livesOn={livesOn}
            setLivesOn={setLivesOn}
            onChallenge={() => go("/multiplayer?mode=challenge")}
            onPlayWithFriend={() => go("/multiplayer?mode=friends")}
            onPassAndPlay={() => startMode("local")}
            onPracticeBot={() => startMode("bot")}
            onJoinWithCode={() => go("/multiplayer?mode=join")}
            openRules={() => setOverlay("rules")}
            openSettings={() => setOverlay("settings")}
            openAccount={() => setOverlay("account")}
            accountLabel={account.isGuest ? "SIGN IN" : "YOUR ACCOUNT"}
          />
        ) : (
          <>
            <GameHeader
              level={level}
              round={round}
              cardCount={config.cards}
              points={config.points}
              seconds={config.seconds}
              names={displayNames}
              scores={scores}
              time={phase === "guess" || (phase === "dealer" && !dealerIsBot) ? timeLeft : null}
              activePlayer={activePlayer}
              activeAction={activeAction}
              onSettings={() => setOverlay("settings")}
              hearts={mode === "local" && livesOn ? lives : null}
            />

            {phase === "dealer" && (
              <section className={["play-stage", dealerIsBot ? "opponent-turn" : "player-turn"].join(" ")}>
                <div className="stage-title">
                  <p className="eyebrow">{dealerIsBot ? "OPPONENT’S TURN" : `${displayNames[dealer]} · YOUR TURN`}</p>
                  <h2>{dealerIsBot ? "OPPONENT'S TURN" : "HIDE THE KING"}</h2>
                  <p>{dealerIsBot ? "Hiding the King…" : "Tap a card to hide the King."}</p>
                </div>
                {dealerIsBot && (
                  <div className="cards-row fanned dealer-choice opponent-choice">
                    {Array.from({ length: config.cards }, (_, index) => (
                      <PlayingCard
                        key={index}
                        index={index}
                        fanCount={config.cards}
                        fanSlot={index}
                        disabled
                      />
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
                    <div className="cards-row fanned dealer-choice">
                      {Array.from({ length: config.cards }, (_, index) => (
                        <PlayingCard
                          key={index}
                          index={index}
                          fanCount={config.cards}
                          fanSlot={index}
                          chosen={!isBluff && kingPosition === index}
                          kingPlacing={placingKing === index}
                          onClick={() => {
                            setIsBluff(false);
                            setKingPosition(index);
                            // The existing placement action, given a visual beat:
                            // the chosen card rises from this player's side and
                            // settles into its slot. Purely presentational — the
                            // King stays hidden and no state depends on it.
                            if (motion) {
                              setPlacingKing(index);
                              window.setTimeout(() => setPlacingKing(null), KING_PLACE_MS);
                            }
                          }}
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
                        <span>
                          <Menu strokeWidth={2} />
                        </span>
                        <b>{bluffsAvailable[dealer] ? "BLUFF" : "BLUFF USED"}</b>
                        <small>No King · once per court</small>
                      </button>
                      <button className="gold-button" disabled={!isBluff && kingPosition === null} onClick={confirmDealerChoice}>
                        {isBluff ? "LOCK BLUFF" : "LOCK HIDING PLACE"}
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}

            {phase === "pass" && (
              <section className="center-stage">
                <span className="pass-icon">
                  <ChessRook strokeWidth={1.5} />
                </span>
                <p className="eyebrow">KEEP THE SECRET</p>
                <h2>PASS THE DEVICE</h2>
                <Ornament />
                <p>Hand the device to <strong>{displayNames[guesser]}</strong>.</p>
                <button className="gold-button wide" onClick={() => setPhase("shuffle")}>I’M READY</button>
              </section>
            )}

            {phase === "shuffle" && (
              <section
                className="play-stage shuffle-stage"
                style={{ "--shuffle-ms": `${deal.windowSec}s` } as React.CSSProperties}
              >
                <div className="stage-title">
                  <p className="eyebrow">DEALING</p>
                  <h2>{guesserIsBot ? "THE RIVAL IS GUESSING" : "FIND THE KING"}</h2>
                  <p>Arranging the cards…</p>
                </div>
                <DealerSwipe cards={config.cards} mirrored={guesserViewMirrored}
                  windowMs={motion ? SHUFFLE_MS : REDUCED.shuffle} reducedMotion={!motion} />
                {!guesserIsBot && <div className="guess-actions dealer-swipe-actions" aria-hidden="true">
                  <button className="gold-button" disabled tabIndex={-1}>CHOOSE A CARD</button>
                </div>}
              </section>
            )}

            {phase === "guess" && (
              <section className={["play-stage guess-stage", guesserIsBot ? "opponent-turn" : "player-turn"].join(" ")}>
                <div className="stage-title">
                  <p className="eyebrow">{guesserIsBot ? "OPPONENT’S TURN" : `${displayNames[guesser]} · YOUR TURN`}</p>
                  <h2>{guesserIsBot ? "THE RIVAL IS GUESSING" : "FIND THE KING"}</h2>
                  <p>{guesserIsBot ? "Choosing a card…" : "Tap a card, then confirm your pick."}</p>
                </div>
                <div className="cards-row fanned">
                  {Array.from({ length: config.cards }, (_, index) => (
                    <PlayingCard
                      key={index}
                      index={index}
                      fanCount={config.cards}
                      fanSlot={indexToSlot(index, config.cards, guesserViewMirrored)}
                      chosen={index === (guesserIsBot ? opponentActiveCard : targetCard)}
                      disabled={guesserIsBot}
                      pulling={pullCard === index}
                      onClick={() => handleCardTap(index)}
                      onHover={(hovered) => setHoveredCard(hovered ? index : null)}
                    />
                  ))}
                  {guesserIsBot ? (
                    <SelectionHand
                      index={opponentActiveCard}
                      cardCount={config.cards}
                      mirrored={guesserViewMirrored}
                      faint
                    />
                  ) : (
                    <SelectionHand
                      index={targetCard ?? hoveredCard}
                      cardCount={config.cards}
                      mirrored={guesserViewMirrored}
                    />
                  )}
                </div>
                {!guesserIsBot && <div className="guess-actions">
                  <button className="gold-button" disabled={targetCard === null} onClick={() => { if (targetCard !== null) handleCardTap(targetCard); }}>
                    {targetCard === null ? "CHOOSE A CARD" : `CONFIRM CARD ${targetCard + 1}`}
                  </button>
                </div>}
              </section>
            )}

            {phase === "reveal" && result && (
              <section className="play-stage reveal-stage">
                <div className="stage-title">
                  <p className="eyebrow">{displayNames[guesser]} · LOCKED IN</p>
                  <h2>REVEALING THE CARDS</h2>
                  <Ornament />
                  <p>Every card turns over…</p>
                </div>
                <div className="cards-row fanned reveal-row">
                  {Array.from({ length: config.cards }, (_, index) => (
                    <PlayingCard
                      key={index}
                      index={index}
                      faceUp
                      blank={isBluff}
                      king={!isBluff && index === kingPosition}
                      chosen={index === revealPick}
                      disabled
                      flipDelay={(index * 70) / 1000}
                      fanCount={config.cards}
                      fanSlot={indexToSlot(index, config.cards, guesserViewMirrored)}
                    />
                  ))}
                  {revealPick !== null && (
                    <SelectionHand index={revealPick} cardCount={config.cards} mirrored={guesserViewMirrored} settled faint={guesserIsBot} />
                  )}
                </div>
              </section>
            )}

            {phase === "result" && result && (
              <section className="play-stage result-stage">
                <div className="impact-vignette" />
                <div className="stage-title">
                  <p className="eyebrow">ROUND {round} RESULT</p>
                  <h2>{RESULT_COPY[result.kind].title}</h2>
                  <Ornament />
                  <p>{revealCopyFor(result.kind, perspectiveSeat, displayNames, guesser).subtitle}</p>
                </div>
                <div className="cards-row fanned reveal-row">
                  {Array.from({ length: config.cards }, (_, index) => (
                    <PlayingCard
                      key={index}
                      index={index}
                      faceUp
                      blank={isBluff}
                      king={!isBluff && index === kingPosition}
                      chosen={index === result.pick}
                      wrong={(result.kind === "wrong" || result.kind === "bluff-worked") && index === result.pick}
                      disabled
                      flipDelay={(index * 70) / 1000}
                      fanCount={config.cards}
                      fanSlot={indexToSlot(index, config.cards, guesserViewMirrored)}
                    />
                  ))}
                  {result.pick !== null && (
                    <SelectionHand index={result.pick} cardCount={config.cards} mirrored={guesserViewMirrored} settled faint={guesserIsBot} />
                  )}
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
                    : round === roundsInCourt(level)
                      ? "LEVEL RESULTS"
                      : "NEXT ROUND"}
                </button>
              </section>
            )}

            {phase === "level-end" && (
              <section className="center-stage level-stage">
                <button
                  className="back-button"
                  onClick={() => setOverlay("quit")}
                  aria-label="Leave match"
                  title="Leave match"
                >
                  <ArrowLeft size={18} strokeWidth={2.25} />
                </button>
                <span className="level-crown">
                  <Crown strokeWidth={1.75} />
                </span>
                <p className="eyebrow">TEN ROUNDS COMPLETE</p>
                <h2>{config.name} CLEARED</h2>
                <Ornament />
                <div className="score-board large">
                  <div><span>{displayNames[0]}</span><strong>{scores[0]}</strong></div>
                  <i>—</i>
                  <div><span>{displayNames[1]}</span><strong>{scores[1]}</strong></div>
                </div>
                {level < COURTS.length - 1 ? (
                  <>
                    <p>Next: <strong>{COURTS[level + 1].cards} cards</strong>, {COURTS[level + 1].seconds} seconds, {COURTS[level + 1].points}× stakes.</p>
                    <button className="gold-button wide" onClick={nextLevel}>ENTER {COURTS[level + 1].name}</button>
                  </>
                ) : (
                  <button className="gold-button wide" onClick={nextLevel}>FINAL RESULT</button>
                )}
              </section>
            )}

            {phase === "match-end" && (
              <section className="center-stage match-stage">
                <span className="level-crown">
                  <Crown strokeWidth={1.75} />
                </span>
                <p className="eyebrow">THE KINGDOM HAS SPOKEN</p>
                {mode === "local" && livesOn && lifeWinner !== null ? (
                  <>
                    <h2>{`${displayNames[lifeWinner]} WINS!`}</h2>
                    <Ornament />
                    <p>{`${displayNames[lifeWinner === 0 ? 1 : 0]} lost all 5 Kings.`}</p>
                  </>
                ) : (
                  <>
                    <h2>
                      {matchWinner === null
                        ? "A ROYAL DRAW"
                        : mode === "bot"
                          ? // Speak to the player directly. "Player 1 WINS!" reads
                            // like a personal victory even when seat 0 is the LOSS,
                            // which is exactly how a bot win was mistaken for a win.
                            (matchWinner === 0 ? "YOU WIN!" : `${displayNames[1]} WINS!`)
                          : `${displayNames[matchWinner]} WINS!`}
                    </h2>
                    <Ornament />
                    <p>{mode === "bot" && matchWinner === 1 ? `You lost all three courts to ${displayNames[1]}.` : "Twenty rounds. Three courts. One ruler."}</p>
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

            <footer className="match-tools">
              <button className="quit-button" onClick={() => setOverlay("quit")} aria-label="Quit match" title="Quit match"><LogOut size={18} strokeWidth={2} /></button>
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
            </footer>
          </>
        )}

        {overlay === "rules" && <RulesModal onClose={() => setOverlay(null)} />}
        {overlay === "account" &&
          (account.user && !account.user.isAnonymous ? (
            <AccountScreen
              user={account.user}
              profile={account.profile}
              onClose={() => setOverlay(null)}
              onChanged={account.refresh}
              onLeaveRooms={async () => {
                // Rooms are owned by the multiplayer hook, which is not mounted
                // from the home screen, so there is nothing to leave here. Kept
                // as a hook point for when that changes.
              }}
            />
          ) : (
            <AccountDialog
              user={account.user}
              profile={account.profile}
              redirectError={account.redirectError}
              onClose={() => setOverlay(null)}
              onSignedIn={() => void account.refresh()}
            />
          ))}
        {overlay === "settings" && (
          <SettingsModal
            sound={sound}
            motion={motion}
            setSound={setSound}
            setMotion={setMotion}
            onSoundEnabled={() => { preloadGameAudio(); playSoundCue("start"); }}
            onClose={() => setOverlay(null)}
          />
        )}
        {overlay === "quit" && (
          <DialogShell onClose={() => setOverlay(null)} className="quit-modal">
            <span className="modal-symbol">
              <LogOut strokeWidth={1.75} />
            </span>
            <p className="eyebrow">LEAVE THE KINGDOM?</p>
            <h3>QUIT MATCH</h3>
            <Ornament />
            <p>Your current round, score, and strategy history will be cleared.</p>
            <button className="quit-confirm wide" onClick={quitMatch}>QUIT TO HOME</button>
            <button className="outline-button wide" onClick={() => setOverlay(null)}>KEEP PLAYING</button>
          </DialogShell>
        )}
        {overlay === "bluff" && (
          <DialogShell onClose={() => setOverlay(null)} className="bluff-modal">
            <span className="modal-symbol">
              <CircleDot strokeWidth={1.75} />
            </span>
            <p className="eyebrow">TRUST YOUR INSTINCT</p>
            <h3>CALL THE BLUFF?</h3>
            <Ornament />
            <p>Do you think the dealer hid no King this round?</p>
            <button className="gold-button wide" onClick={callBluff}>YES — CALL BLUFF</button>
            <button className="outline-button wide" onClick={() => setOverlay(null)}>NO — PICK A CARD</button>
            <small>A wrong accusation gives the round to the dealer.</small>
          </DialogShell>
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


function HomeScreen({
  logoRef, names, setNames, livesOn, setLivesOn,
  onChallenge, onPlayWithFriend, onPassAndPlay, onPracticeBot, onJoinWithCode,
  openRules, openSettings, openAccount, accountLabel,
}: {
  logoRef: React.RefObject<HTMLImageElement | null>;
  names: [string, string];
  setNames: React.Dispatch<React.SetStateAction<[string, string]>>;
  livesOn: boolean;
  setLivesOn: (on: boolean) => void;
  /** Online matchmaking — searches for an active player. */
  onChallenge: () => void;
  /** Friends list -> challenge a friend, or create a room. */
  onPlayWithFriend: () => void;
  /** Two players, one device. Uses the existing local flow. */
  onPassAndPlay: () => void;
  /** The Rival. Uses the existing bot flow. */
  onPracticeBot: () => void;
  /** Join an existing room with a code the host shared. */
  onJoinWithCode: () => void;
  openRules: () => void;
  openSettings: () => void;
  openAccount: () => void;
  /** "SIGN IN" for a guest, "YOUR ACCOUNT" once an account is linked. */
  accountLabel: string;
}) {
  const [showPassSetup, setShowPassSetup] = useState(false);
  const passSetupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showPassSetup) passSetupRef.current?.scrollIntoView({ block: "center" });
  }, [showPassSetup]);

  return (
    <section className="home-screen" aria-labelledby="game-title">
      <div className="home-topbar">
        <button className="topbar-button" onClick={openAccount} aria-label={accountLabel}>
          <span aria-hidden="true">
            <User size={16} strokeWidth={2} />
          </span>
          <span className="topbar-label">{accountLabel}</span>
        </button>
        <button className="topbar-button" onClick={openSettings} aria-label="Settings">
          <span aria-hidden="true">
            <Settings size={16} strokeWidth={2} />
          </span>
          <span className="topbar-label">SETTINGS</span>
        </button>
      </div>

      <h1 id="game-title" className="sr-only">Kill the King</h1>
      <div className="home-brand">
        <div className="king-emblem">
          <Image
            ref={logoRef}
            className="home-app-logo"
            src="/cards/ktk-emblem-gold.webp"
            alt="Kill the King mask and sword emblem"
            width={1254}
            height={1254}
            priority
            unoptimized
          />
        </div>
      </div>

      <div className="entry-panel home-menu">
        <button className="gold-button home-challenge" onClick={onChallenge}>
          PLAY ONLINE
        </button>

        <div className="home-row">
          <button className="outline-button" onClick={onPlayWithFriend}>WITH FRIENDS</button>
          <button className="outline-button" onClick={() => setShowPassSetup((open) => !open)}>
            PASS &amp; PLAY
          </button>
        </div>

        <button className="outline-button" onClick={onPracticeBot} aria-label="Practice with bot">
          PRACTICE
        </button>

        {showPassSetup && (
          <div className="pass-setup" ref={passSetupRef}>
            <label htmlFor="player-one">YOUR NAME</label>
            <input
              id="player-one"
              value={names[0]}
              onChange={(event) => setNames((previous) => [event.target.value, previous[1]])}
              placeholder="Enter your name"
              autoComplete="name"
            />
            <label htmlFor="player-two">OPPONENT NAME</label>
            <input
              id="player-two"
              value={names[1]}
              onChange={(event) => setNames((previous) => [previous[0], event.target.value])}
              placeholder="Enter opponent name"
            />
            <label className="settings-check" htmlFor="lives5">
              <span>5 Lives</span>
              <input
                id="lives5"
                type="checkbox"
                checked={livesOn}
                onChange={(e) => setLivesOn(e.target.checked)}
              />
            </label>
            {livesOn && (
              <p className="settings-note">
                Finding the King costs the hider a life. First to{" "}
                <Heart fill="currentColor" strokeWidth={1.5} className="inline-icon" /> 0 loses.
              </p>
            )}
            <button className="gold-button" onClick={onPassAndPlay}>START GAME</button>
          </div>
        )}

        <div className="home-links">
          <button className="text-button" onClick={onJoinWithCode}>JOIN ROOM</button>
          <span aria-hidden="true">·</span>
          <button className="text-button" onClick={openRules}>HOW TO PLAY</button>
        </div>
      </div>

    </section>
  );
}
