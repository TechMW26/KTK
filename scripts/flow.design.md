# KILLTHEKING flow engine (optional 5-lives + Complete-Turns) — design notes

See lib/game/flow.ts + scripts/flow.test.ts. Recorded for continuity.

## Model (final)

The ORIGINAL online match (`winMode:'classic'` + `turnOrder:'alternate'`) is the
untouched scored 3-court x10 game in services/multiplayerService.ts — never changed.
Any OTHER config runs the new OPTIONAL rules, modelled as a fixed sequence of
`RULESET_ROUNDS = 20` hiding rounds:

- complete : dealer fixed in blocks of 10 (seat0 rounds 1..10, seat1 11..20)
- alternate: dealer flips every hiding round (0,1,0,1...)
  Court/deck for a hiding round = courtForHidingRound() -> 0/1/2 (levels 0..2) so the
  existing card/timing/points visuals are reused.
- lives : each starts 5; ONLY a found hidden King (`kind:king`) costs its DEALER 1
  life (spec). wrong/bluff/timeout consume the round but cost no life.
- winner check: any life hits 0 -> that seat LOSES (other wins). If all 20 hiding
  rounds finish first, the player with MORE lives wins (else draw).

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
