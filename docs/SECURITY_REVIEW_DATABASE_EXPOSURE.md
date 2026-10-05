# Security Review — Realtime Database exposure

**Date:** 2026-10-05
**Project:** `killtheking-94396`
**Severity:** 🔴 Critical (resolved)
**Status:** Fixed and verified

---

## Summary

The production Realtime Database was running Firebase's **default wide-open
ruleset**:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

This permitted **unauthenticated** read and write of the **entire** database —
no account, no token, no anonymous session. Because the database URL is inlined
into the client bundle (`NEXT_PUBLIC_FIREBASE_DATABASE_URL`), that URL is public
to anyone who loads the app.

## What was exposed

| Path | Contents | Impact |
| --- | --- | --- |
| `rooms/{code}/secrets/{uid}` | **The dealer's hidden King** (`kingIndex`, `isBluff`) | 🔴 Game integrity destroyed — see below |
| `rooms/{code}/players/{uid}` | uids, display names, presence, seats | Player enumeration |
| `rooms/{code}` | Room codes, hostId, status, settings | Room takeover |
| `matchmaking*` | Searching players, uids, pair claims | Matchmaking manipulation |
| *(any other path)* | — | Full write access, incl. **deletion** |

### The game-integrity consequence

`lib/multiplayer/types.ts` documents the design intent:

> "so a dealer's hidden King is never visible to the guesser."

The live rules inverted that. Anyone could `GET` the room's `secrets` node and
read the King's position before guessing, making **every bluff meaningless** and
every round winnable. The `secrets` isolation — the core of the multiplayer
design — was enforced **nowhere** in production.

## Root cause chain

This was not one mistake but a chain of three, each of which concealed the next:

1. **The rules file was undeployable.** `firebase/database.rules.json` carried
   `"//"` comment keys and a top-level `.info` node. The rules compiler rejects
   both:
   - `Expected 'rules' property.` (from the comment keys)
   - `String can't contain ".", "#", "$", "/", "[", or "]"` (from `.info`)

2. **So it was never deployed.** Any `firebase deploy` attempt would have failed
   at the compiler, so the restrictive rules never reached the project.

3. **The database therefore stayed on the default ruleset.** Firebase creates
   RTDB sessions in "locked mode" *only* when a project is created as such; an
   existing database that never receives a rules deploy keeps whatever it has —
   here, fully open.

A fourth factor made it invisible: **the repo's documentation asserted the
opposite.** `docs/FIREBASE_MULTIPLAYER.md` listed what "is enforceable" and
`docs/GAME_CONCEPT.md` promised secrets stay honest. Reading the docs suggested
the database was protected. Only querying the live ruleset revealed it wasn't.

## Detection

Found incidentally while testing an unrelated feature (the `users/{uid}` node
for the account system). A probe run as an **anonymous** client:

- successfully **wrote to another uid's node**, and
- successfully **read and enumerated the entire `users` collection**.

Both should be impossible under any sane ruleset. That prompted a direct
fetch of the active rules via the emulator/admin endpoint, which returned the
wide-open default.

## Remediation

1. Repaired the undeployable constructs (removed comment keys and the `.info`
   node; the documentation they carried moved into
   `docs/FIREBASE_MULTIPLAYER.md`).
2. Added the `users/{uid}` node with an explicit field allow-list and
   `"$other": { ".validate": false }` so undeclared fields (e.g. a future
   `balance`) are rejected.
3. Published the corrected ruleset to the live project.

## Verification

`scripts/rules-users.test.ts` — **13/13 passing** against the live project:

| Check | Result |
| --- | --- |
| Signed-out client reading `users` | 🔒 denied |
| Signed-out client reading `rooms/*/secrets` | 🔒 denied |
| Reading another uid's node | 🔒 denied |
| Listing the whole `users` collection | 🔒 denied |
| Writing to another uid's node | 🔒 denied |
| Non-allow-listed field (`balance`) | 🔒 denied |
| `displayName` over 24 chars | 🔒 denied |
| Non-boolean `emailVerified` | 🔒 denied |
| Owner read/write of own node | ✅ allowed |
| Anonymous sign-in still works | ✅ allowed |

## Residual risks / follow-ups

- **Client-authoritative rules.** Even locked down, the ruleset still trusts
  clients for turn arbitration and score updates. `docs/FIREBASE_MULTIPLAYER.md`
  already recommends moving room lifecycle into Cloud Functions for any
  competitive use. That remains **not done**.
- **Currency must not be client-writable.** A `users/{uid}` balance writable by
  its owner (`auth.uid === $uid`) is trivially self-creditable. MOM item 4 must
  design server authority before any wallet ships; the current `$other: false`
  guard exists to make that mistake impossible by default.
- **Console settings are not in version control.** Rules are now in the repo,
  but **provider enablement and any future console-only rule edits are not** —
  they can drift from the repo silently, which is exactly how this incident
  happened. Consider a deploy check in CI.
- **Test accounts** created during verification remain in the Auth user list
  (`accounts-test-*@example.com`, `linktest-*@example.com`,
  `uitest-*@example.com`).

## Prevention

- **Never infer deployed state from the repo.** Query the live ruleset; a rules
  file in git proves nothing about what is running.
- **Verify a rules deploy actually parsed.** Both underlying defects produced
  compiler errors, so any "deployed successfully" claim was false.
- **Treat `{"rules": {".read": true}}` as a red alert** — it is Firebase's
  default, not a deliberate choice, and it is never correct for this app.
