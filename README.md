# Kill the King

A mobile-first strategy and bluff card game built with React, TypeScript, Vinext, and Vite.

## Gameplay

- Three escalating levels: 5 cards, 3 cards, then 2 cards
- 7, 5 then 3 hides per player per level: 14, 10 then 6 rounds
- Complete-turn hiding: each player hides their whole block in a row, then the table turns
- Timed hiding and guessing: 20 seconds, 15 seconds, then 9 seconds
- One bluff per player in each level
- Local two-player and versus-bot modes
- Five-turn strategy constellations for both players
- Responsive semicircle card fans with rustic gold artwork
- A dealer gauntlet swipes in from above and places each card before withdrawing
- A session-only autoplay intro fades into the app's golden logo
- Online matchmaking, private rooms, and friend challenges using Firebase
- Ambient music, countdown tension, win, loss, and Bluff sound effects
- Confirmed quit-to-home flow

## Run locally

Requirements:

- Node.js 22.13 or newer
- pnpm

Install and start:

```bash
pnpm install
pnpm dev
```

Open the local address printed in the terminal.

## Install as an app

The production build includes a fullscreen PWA with gold logo icons and an
offline game shell. On iPhone, open the HTTPS site in Safari and choose Share →
Add to Home Screen. On Android, use the browser's Install app / Add to Home
screen option. Content clears the status bar and home indicator; the textured
surface extends through those safe areas.

After one online launch, practice and pass-and-play are available offline.
Accounts and multiplayer need a connection. Service workers run only in
production builds, served through HTTPS or localhost. See [PWA notes](docs/PWA.md)
for packaging, updates, and device validation.

## Validate a production build

```bash
pnpm lint
pnpm build
pnpm typecheck
```

> **`typecheck` now runs as part of `npm test`.** It was added as a separate
> script first because it reported pre-existing errors unrelated to the tests, so
> gating the pipeline on it would have failed every run. Those are now cleared:
> the last one was `bundledWebRuntime` in `capacitor.config.ts` (removed in
> Capacitor 3 and silently ignored since), and the orphaned `worker/`
> scaffolding from the Cloudflare template was deleted, as nothing referenced it
> after the move to Nitro/Vite.

## Complete package contents

- `app/` — game interface, logic, and styling
- `public/` — logo, card artwork, hand artwork, favicon, and game audio
- `scripts/` — reproducible audio generation script
- `package.json` and `pnpm-lock.yaml` — exact dependencies and scripts

## GitHub or another computer

1. Extract this folder.
2. Upload every included file and folder to the root of a GitHub repository.
3. Install Node.js 22.13 or newer and pnpm.
4. Run `pnpm install` and `pnpm dev`.

For a production-ready build, run `pnpm build`.

Local pass-and-play and bot practice work without a database. Online play and
account features require Firebase Authentication and Realtime Database. Copy
`.env.local.example` to `.env.local` and configure the `NEXT_PUBLIC_FIREBASE_*`
values for your Firebase project. Keep `.env.local` out of Git.

Run the full validation suite with `pnpm test`, plus `pnpm test:search-map`
and `pnpm test:rooms` for the matchmaking map and room verdict checks.
For a standalone Node production server, run `pnpm build:node`, then
`pnpm preview:node` (set `PORT` to choose a listening port).

Asset sources and generation prompts are in `assets/`; visual implementation
notes are in `docs/`. Local screenshots and recordings in `artifacts/` are
excluded from the repository.
