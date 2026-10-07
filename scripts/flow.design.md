# KILLTHEKING flow engine (optional 5-lives + Complete-Turns) — design notes

See lib/game/flow.ts + scripts/flow.test.ts. Recorded for continuity.

## Model (final)

The ORIGINAL online match (`winMode:'classic'` + `turnOrder:'alternate'`) is the
untouched scored 3-court x10 game in services/multiplayerService.ts — never changed.
Any OTHER config runs the OPTIONAL rules, which replay the SAME three-court
structure as the local game on one global hiding-round clock:

- 3 courts, each running two blocks of `hidesPerPlayer`: 14 + 10 + 6 = `RULESET_ROUNDS` (30) hides.
- `courtForHidingRound(r)` -> court 0/1/2; `roundInCourt(r)` -> 1..14 / 1..10 / 1..6.
  The round counter RESTARTS inside every court, exactly like the local engine.
- complete : hides split into two blocks of `hidesPerPlayer` per court.
  seat0 takes the first block, seat1 the second. Because the counter resets each
  court, seat0 opens every court and each seat deals one block per court
  (15 hides total).
- alternate: dealer flips every hiding round (0,1,0,1...).
- Court/deck for a hiding round = courtForHidingRound() -> 0/1/2 (levels 0..2) so the
  existing card/timing/points visuals are reused.
- lives : each starts 5; ONLY a found hidden King (`kind:king`) costs its DEALER 1
  life (spec). wrong/bluff/timeout consume the round but cost no life.
- winner check: any life hits 0 -> that seat LOSES (other wins). If all 30 hiding
  rounds finish first, the player with MORE lives wins (else draw).

### Bug this replaced (2026-09-30)

`DEALS_PER_SEAT` was 10 and complete-turns used a block of 10, so seat0 dealt
rounds 1..10 while seat1 only began at round 11 — but courts advanced at rounds
8 and 15. Player 2 never dealt a court-opening round, both card-count changes
happened on player 1's watch, and in a short match player 2 never got a turn.
The per-court block model above fixes it: player 2 deals from round 6.

## Server integrity (Feat 5/8)

Dealer & guesser + life decrement & match-end are recomputed INSIDE the single
Firebase transaction on game/{...}; clients never write their own life count and
can't act out of turn (phase + actingSeat guard). Double-deduction is impossible
because a reveal transition applies the life change once and `advance` is guarded.

## files

- lib/game/flow.ts (pure, import-free)
- scripts/flow.test.ts (Node --experimental-strip-types harness)
- lib/multiplayer/types.ts (settings/lives fields on GameState)
- services/matchmakingService.ts etc.
