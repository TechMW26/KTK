# Matte rustic deck

The deck uses charcoal matte paper, aged copper borders, an engraved King,
an oxblood heart and a hollow diamond for empty bluff cards. The back composes
the golden-bloom variant of the supplied transparent KTK emblem over the
generated texture. It keeps the crown, letters, sword, masks and weathered
metal, with warm gold highlights and a restrained halo to match the shiny UI.

Production assets are in `public/cards/`. Original PNG artwork and the supplied
logo are preserved in `assets/cards/`. The final generation/edit prompts
are recorded in `assets/cards/prompts.json`; artwork was created with the
built-in imagegen tool. WebP files are delivery copies: 540px-wide card faces
and texture, plus 720px-wide transparent emblems. The original is lossless;
the golden-bloom delivery copy uses WebP quality 92 with full alpha quality.

The refined home screen uses the gold emblem as its main brand image, with
concise play actions. Redundant tagline, matchmaking
hint and repeated court/round counts were removed. Expanded local-player
setup remains scrollable on short screens.

`app/cards.css` owns the deck finish and shared back artwork. It is imported
after the original glass theme and applies to playing cards, the dealer's
grip, flying deal cards and strategy history tiles. `PlayingCard` keeps ranks
as live text so numbering always follows the seat-local card index. Card
identity, selection and game rules are unchanged. The responsive table refinement
in `app/royal.css` distributes the rotated fan across 96% of the board width;
both hand overlays use that same live card pitch.

The gauntlet is 110% of the live card width. Its index fingertip (33% across
the sprite, .7% down) contacts the card at 70% of its height, following the
card's rotation and scale. The palm and cuff extend below the card in every
view, including mirrored inspection. The row reserves that full reach before
the action buttons; small screens retain scrolling rather than covering controls.

Disabled cards stay opaque during reveals and spectator states. The existing
opponent brightness treatment still identifies the inactive seat. The five
production images are preloaded to avoid artwork appearing late during flips.

The rustic gauntlet in `public/gauntlet-hand.png` was edited from the original
pointing glove with the built-in imagegen tool. It has genuine alpha and a
complete flared cuff, and paints above selected and inspected cards. The exact
final prompt is saved in `assets/ui/gauntlet.prompt.txt`. The textured screen is
borderless, with narrower content gutters to use the space previously reserved
for the frame. Gold detailing remains on cards and controls; PNG corners are
no longer rendered. Original artwork and hand sprites remain intact.

The table and utility footer occupy separate grid rows. Hide/bluff controls and
the explicit guess confirmation stay pinned above the footer without scrolling
the playing board. Every dealer, deal, guess, spectator and
reveal row uses the same arc, including mirrored slot order.

The outer tilt is 18 degrees for five cards, 10 for three, and 6 for two.
Smaller decks also use a shallower arc; the projected edge width drives pitch
so changing the tilt keeps the fan at 96% of the board width.

Card silhouettes use elliptical percentage radii (10.4% horizontally and 5.7%
vertically), matching the approximately 56px corners in the 540 × 990 artwork.
Faces render to the edge without an extra layout border. Copper highlights and
selection rims follow that same curve on fronts, backs, deal cards and miniatures.
