# Kill the King

A mobile-first strategy and bluff card game built with React, TypeScript, Vinext, and Vite.

## Gameplay

- Three escalating levels: 5 cards, 3 cards, then 2 cards
- 10 rounds per level
- Complete-turn hiding: each player hides five rounds in a row, then the table turns
- Timed hiding and guessing: 20 seconds, 15 seconds, then 9 seconds
- One bluff per player in each level
- Local two-player and versus-bot modes
- Five-turn strategy constellations for both players
- Animated card dealing using the supplied illustrated hand assets
- Individual card-throw animations synchronized with the Dealer hand
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

## Validate a production build

```bash
pnpm lint
pnpm build
pnpm typecheck
```

> **`typecheck` is expected to report 5 errors today.** They are pre-existing and
> unrelated to the build, which is why it is a separate script rather than part
> of `test`: wiring it into the test pipeline now would fail every run. The
> outstanding errors are `app/multiplayer/search.tsx` (a `string | null`),
> `capacitor.config.ts` (an option that no longer exists in Capacitor 8 and is
> silently ignored), `services/roomService.ts` (a comparison that can never be
> true, making the `"FULL"` room reason unreachable) and `worker/index.ts`
> (Cloudflare types not installed, so the worker is untyped).
>
> Clear these before adding `typecheck` to CI or to `test`.

## Complete package contents

- `app/` — game interface, logic, and styling
- `public/` — logo, card artwork, hand artwork, favicon, and game audio
- `scripts/` — reproducible audio generation script
- `worker/` — production worker entry point
- `package.json` and `pnpm-lock.yaml` — exact dependencies and scripts

## GitHub or another computer

1. Extract this folder.
2. Upload every included file and folder to the root of a GitHub repository.
3. Install Node.js 22.13 or newer and pnpm.
4. Run `pnpm install` and `pnpm dev`.

For a production-ready build, run `pnpm build`.

The project does not require a database or environment variables.
