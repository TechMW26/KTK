# PWA and mobile layout

The web manifest requests fullscreen with a standalone fallback. iOS uses the
Apple web-app metadata, `black-translucent` status bar, and a 180px touch icon.
The OS ultimately controls status indicators and whether fullscreen is granted.
`viewport-fit=cover` and safe-area CSS let the textured background fill the
surface while keeping interactive content clear of the notch and home indicator.

Installed mode uses an explicit `100vh` canvas rather than fixed `inset: 0` or
`100dvh` bounds. This covers the bottom strip excluded by some iOS standalone
viewport calculations ([WebKit issue 254868](https://bugs.webkit.org/show_bug.cgi?id=254868)).
The intro shares that height; its Skip button receives the bottom safe inset
plus 20px of spacing. Normal browser mode continues to track dynamic toolbar
height with `100dvh`. Card sizes and fan geometry remain unchanged.

## Icons

`pnpm pwa:icons` composites the existing golden emblem onto a matte background.
It emits 48px, 192px, 512px, Apple 180px, and a separate maskable 512px icon. The
maskable emblem fits within the central safe circle. No logo redesign is used.

## Offline and updates

`pnpm build` and `pnpm build:node` package a content-versioned worker with the
hashed client bundles and local gameplay media. Node packaging also refreshes
Nitro's worker size and ETag record after expanding the precache list, so the
served JavaScript is complete. The registration is mounted inside both client
pages and runs only in production.

The worker saves the public home shell without credentials. Navigation tries
the network first; offline home navigation restores local play, while other
routes show a connection notice. Accounts, rooms, Firebase requests, APIs,
authentication iframes, and query-bearing data requests are not cached. Updates
wait until existing app clients close; an active match is never force-reloaded.
Only older caches belonging to this app are removed.

## Board layout

The board occupies `100dvh`. The header and utility footer have their own rows.
Hide/guess controls and the next-round button occupy rows above the footer,
leaving the middle cell for the original large card fan. The cards are not
shrunk to accommodate the pointing hand. Action surfaces cover excess wrist
artwork when necessary. Results preserve the same semicircle transforms after
their reveal animation. Turn announcements wrap within the available width.

## Validation

Run `pnpm test`, `pnpm lint`, and `pnpm build:node`. `pnpm test:pwa` validates
manifest/icon dimensions, offline navigation, cache cleanup, and private-request
exclusions. Serve with `PORT=3176 pnpm preview:node` for browser activation and
offline-reload checks; development deliberately does not install the worker.

Responsive browser checks simulate iPhone and Android safe insets. Physical
iOS and Android installation should also be checked after HTTPS deployment:
icon crop, notch clearance, home-indicator clearance, portrait/landscape behavior,
and hide/guess/result buttons without scrolling. Browser emulation cannot prove
the operating system's installed-app presentation.
