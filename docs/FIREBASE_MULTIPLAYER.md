# Kill the King — Online 2‑Player Multiplayer (Firebase Realtime Database)

An additive multiplayer mode for the existing game. It keeps the single‑player
experience 100% intact and only layers new screens/services/hooks on top.

> **Do not trust** the multiplayer engine for ranked/competitive integrity until
> the recommended hardening (Cloud Functions) is done — see _Security_ below.

---

## 1. Files created / modified

### New files (client)

| Path                               | Purpose                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `app/multiplayer/page.tsx`         | Entry route `/multiplayer` — menu, create, join, waiting, invalid, and in‑match host.           |
| `app/multiplayer/game.tsx`         | In‑match renderer (board, reveal, level‑end, match‑end) driven by authoritative Firebase state. |
| `app/multiplayer/ui.tsx`           | Small presentational helpers reusing `app/globals.css` design system.                           |
| `lib/firebase/config.ts`           | Env‑driven app init (`isFirebaseConfigured`).                                                   |
| `lib/firebase/auth.ts`             | Anonymous auth helpers.                                                                         |
| `lib/firebase/database.ts`         | RTDB singleton + optional emulator hook.                                                        |
| `lib/multiplayer/types.ts`         | Room / game / secret types.                                                                     |
| `lib/multiplayer/paths.ts`         | Central RTDB path helpers.                                                                      |
| `lib/multiplayer/roomCode.ts`      | Room‑code generation + normalization.                                                           |
| `lib/game/rules.ts`                | Pure shared rules (levels, roles, bluff/result resolver) matching single‑player.                |
| `services/roomService.ts`          | Create / join / watch / presence / leave.                                                       |
| `services/multiplayerService.ts`   | Authoritative game drive (dealer place, guess, reveal, advance, rematch).                       |
| `hooks/useMultiplayer.ts`          | One hook owning the whole online session + reconnection.                                        |
| `firebase/database.rules.json`     | Production‑oriented RTDB rules (see Security).                                                  |
| `firebase/database.dev.rules.json` | Relaxed rules for the local emulator/playtest.                                                  |
| `.env.local.example`               | Copy to `.env.local`.                                                                           |

### Modified files

| Path              | Change                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `package.json`    | Added `firebase` dependency.                                                                                                  |
| `app/globals.css` | Appended an additive `/* Online Multiplayer screens */` section.                                                              |
| `app/page.tsx`    | Added one `ONLINE MULTIPLAYER` button on the single‑player home (navigates to `/multiplayer`). Single‑player logic untouched. |

---

## 2. Firebase setup requirements

1. Create a Firebase project (Spark / Blaze plan). RTDB is free tier friendly.
2. **Realtime Database** (not Firestore): create in _native_ (not locked) mode,
   pick a region (e.g. `us-central1`).
3. **Authentication** → Sign‑in method → enable **Anonymous**.
4. Copy the web app config → put the `NEXT_PUBLIC_FIREBASE_*` values in `.env.local`.
5. Deploy the rules (see below) for production before going live.

Use the code as a blueprint: real credentials/config must be supplied by you —
there is no project provisioned in this workspace.

## 3. Required environment variables

See `.env.local.example`. Minimum set:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_DATABASE_URL
NEXT_PUBLIC_FIREBASE_PROJECT_ID
```

Optional for emulator testing:

```
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1
NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1
NEXT_PUBLIC_FIREBASE_EMULATOR_PORT=9000
```

> Nothing sensitive lives in the bundle. Web SDK config is inherently public;
> security comes from **Auth + Rules (+ Cloud Functions)**, not from hiding keys.

## 4. Firebase RTDB rules

- `firebase/database.rules.json` — deploy for production (deploy via `firebase deploy --only database`).
- `firebase/database.dev.rules.json` — use **only** behind the emulator when play‑testing.

Highlights that **are** enforceable pure‑client:

- Nobody can read another player's **`secrets/{uid}`** node (dealer's hidden King).
- A player can write only their **own** `players/{uid}` presence entry.
- Only room members can read/write the `game` node.
- `.info/connected` readable for presence.

## 5. Authentication setup

Anonymous sign‑in is used so players need no account, but every client still
carries a stable `uid` that rules use to scope access. The hook calls
`ensureSignedIn()` before creating/joining a room.

## 6. How the game state is shared

Authoritative state lives in RTDB under each room:

```
rooms/{CODE}/
  hostId, code, status, createdAt
  order:        [hostUid, guestUid|null]
  players/{uid} name, seat, connected, isHost, presence(heartbeat)
  game/         level, round, scores[], bluffsUsed[], phase, dealerSeat,
                actingSeat, pendingGuess, lastResult, winnerSeat, seq
  secrets/{uid}/{level.round}   <- private; dealer's King/bluff  (rules: owner only)
```

**Turn flow (rule logic reused from `lib/game/rules.ts`):**

1. Dealer writes their secret privately, then moves `game` to `guess`.
2. Guesser picks/calls bluff → a public `pendingGuess` is stored.
3. The Dealer resolves against their own private secret → `lastResult` (reveal) + points.
4. Either player presses Next on the reveal → deterministic role/level/round advance
   (guarded transaction means only the first press wins, both converge).
5. Match‑end screen offers **Play Again** (host/server‑free reset) or **Leave**.

Unless it is your turn/seat (driven by `actingSeat`/phase checks + RTDB rules),
your actions are rejected server‑side; the UI never lets you act out of turn.

## 7. Security considerations / hardening (important)

Client‑driven RTDB writes alone **cannot** be made fully adversarial‑safe for:

- authoritative **seat assignment** (`order[0]/[1]`, status `waiting→playing`)
- **score** integrity and **turn arbitration**
- round **timeouts** on an authoritative clock
- preventing a malicious dealer from resolving a round in their favor

These are exactly the cases the Firebase docs say to route through **Cloud
Functions** rather than trusting clients. Before ranked/competitive use:

1. Add a `functions/` package with `createRoom`, `joinRoom`, `performMove`,
   `advanceRound`, `resign/leave` HTTPS‑callable functions.
2. Have clients call the functions (server SDK) to author seats, scores, turns
   and clocks; keep presence/secrets as currently modelled (rules still enforce
   secret‑hiding and self‑only presence).
3. Keep `database.rules.json` restricted to member reads; allow writes only via
   server `ADMIN` context where functions mutate.

Until then the mode is ideal for private friend matches (room code = shared
lobby), which is the intended play pattern here.

## 8. Local testing (emulator)

```bash
pnpm install
# set .env.local with NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1 etc.
npx firebase login
npx firebase init hosting database      # scope to your project
npx firebase emulators:start --only database --import ./seed  # or --export-on-exit
pnpm dev
```

Any two sessions can playtest.

## 9. Two‑window / device playtest

1. `pnpm dev`, open `http://localhost:3000` in **two windows/devices**.
2. **Window A → ONLINE MULTIPLAYER → CREATE ROOM →** note the 6‑char code.
3. **Window B → JOIN →** type the code (case/‑spaces auto‑normalized).
4. A sees the code + **Copy/Share**; B joins → both auto‑enter the match.
5. Verify: both see the same level/round/scores; the Dealer hides; the Guesser
   guesses; the reveal matches on both; roles alternate each round; leave works.

Check reconnect by toggling one device offline (
`DevTools` → Network → Offline): the other shows “Opponent disconnected”; the
reconnecting client shows the **Reconnecting** veil and resumes from the latest
Firebase state without duplicating moves.

## 10. Vercel deployment

- Add the `NEXT_PUBLIC_FIREBASE_*` envs in the Vercel project settings.
- Build/deploy exactly as the existing app (vinext+Vercel preset) — multiplayer
  adds no server; `/multiplayer` is a normal client route.
- Deploy RTDB rules + enable Anonymous auth in the Firebase console.

## 11. Capacitor / Android notes

- All new screens are responsive and touch‑friendly (no hover‑only controls).
- Room code copy uses a clipboard fallback (execCommand) inside a Capacitor
  WebView; **Web Share API** (`navigator.share`) is used when present with a
  clipboard fallback otherwise.
- Anonymous auth + RTDB work over `androidScheme: https` (cleartext off).
- `android:useCleartextTraffic` stays off — Firebase runs on wss/https.
- After adding Firebase, rebuild/static‑export normally and `cap sync android`
  as documented for the APK (JAVA/Android SDK required on a build machine).

## 12. Limitations

- Requires a live Firebase project + env vars (not provisioned here).
- Authoritative clocks / anti‑cheat need Cloud Functions (see §7).
- Play‑tested model assumes friendly, code‑shared matches.

## 13. Go‑live / deploy checklist (as of current code)

The repo now ships everything needed except one-time Firebase console work and
the Firebase CLI / Vercel credentials, which only you can provide.

**Firebase console (one time, ~2 min):**

1. Open https://console.firebase.google.com/project/killtheking-94396.
2. **Authentication → Sign‑in method → enable Anonymous** (required for every room).
3. If not present, **Realtime Database** in native mode (pick the region matching
   `NEXT_PUBLIC_FIREBASE_DATABASE_URL`; current = asia-southeast1).

**Deploy rules (one command after installing CLI):**

```
npm i -g firebase-tools        # or: npx firebase-tools
firebase login                 # log in with the Firebase account
firebase deploy --only database
```

`firebase.json` (rules → `firebase/database.rules.json`) and `.firebaserc`
(project `killtheking-94396`) are already configured, so no flags are needed.
The rules now open `/matchmaking` + `/matchmakingHost` (self‑only writes) used by
the "Search Online Players" feature.

**Vercel (one time):** add these env vars (Production / Preview), same values as
`.env.local`:
`NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_DATABASE_URL`, `_PROJECT_ID`,
`_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_MEASUREMENT_ID`.
Then deploy normally (`vite build` is the build command; verified working).

> Dev note: `pnpm dev` crashes locally on this machine due to a
> `@vitejs/plugin-rsc@0.5.34` toolchain bug (NOT this app's code). Use
> `pnpm build` then `node .output/server/index.mjs` to run locally until the
> dev plugin is bumped.
