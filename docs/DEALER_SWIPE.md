# Dealer swipe

Local and online dealing share `DealerSwipe`. A fresh transparent rustic gold
gauntlet (`public/dealer-swipe-hand.png`, 728 × 2161) enters from above the board,
places cards in screen order, then withdraws. Card identities remain unchanged
when the online fan is mirrored.

The 1.7-second beat includes entrance, staggered placement, settling, and exit.
Cards settle by 84% of the beat; guessing starts only after its full duration.
Reduced motion displays the completed fan without a moving hand.

The overlay is hosted on the game board, beyond the scrollable table. Its long
forearm retains at least 96 pixels of offscreen buffer at card contacts. Measured
contact positions and a ResizeObserver retarget the same animation time on resize.
The image keeps its original aspect ratio and is preloaded by the app layout.

Asset generated using the built-in imagegen tool. Final prompt:
`assets/ui/dealer-swipe-hand.prompt.txt`.

Validation: `npm run test:dealer-swipe` covers release synchronization, phase
duration, mirrored order, proportional sizing, transformed card contacts, and
hidden forearm edges across 2-, 3-, and 5-card fans.

Browser checks covered 320 × 640, 390 × 844, and a 1280 × 800 desktop
viewport, including mirrored cards and reduced motion. The short-screen
confirm button clears the footer by 8 pixels. The deal and guess fans share
the same measured position, with their older stage-entry translation disabled.
The actual production-build practice round is recorded in
`artifacts/dealer-swipe/dealer-swipe-preview.mp4`.
