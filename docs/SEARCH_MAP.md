# Opponent search map

The searching state in `app/multiplayer/search.tsx` uses an antique fantasy map,
a dark overlay that reaches zero opacity at 72% of the screen height, and three
mounted 3D scouts. These are decorative animations; matchmaking and the 30-second
search window still come from the existing Firebase driver.

## Assets

- Runtime map: `public/maps/kingdom-search.webp` (1024 × 1536).
- Generated original: `assets/maps/kingdom-search-source.png`.
- Horse: `public/models/scout-horse.glb` (537,428 bytes).
- Horse license: `assets/models/scout-horse-license.txt`.

The horse comes from Quaternius's [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html),
licensed CC0 1.0. Download: [original Horse.gltf](https://drive.google.com/file/d/1hbtY8kxnXiPdwYGVY7rWRgU0jl_-Q-LG/view).
Its geometry and skeletal animation are preserved. Only the Gallop and Idle
clips and their referenced buffer data are retained in the optimized GLB.
The rider, saddle, helmet, cloak, boots and reins are original Three.js meshes.

## Rendering

`search-map-data.ts` defines a registry of six named fantasy kingdoms: Crownkeep,
Ashen Spire, Elderwood, Moonwell, Dragonfall and Sunken Citadel. These are fictional
map locations, not registered-player accounts. Each has a banner, royal seal,
numbered nameplate, local patrol and onward road.

`search-map-tour.ts` controls a shared timeline: four seconds of local roaming,
then a 1.5-second ride to the next kingdom. All six receive a visit during the
existing 30-second matchmaking window. The camera stays zoomed in (2.07–2.6 times
its cover scale), drifts within each kingdom, then pulls back slightly and
swiftly follows the party along connecting roads. Camera position and scout
positions stay continuous at every phase change, including the tour loop.

`SearchMap` owns one animation clock, applies the camera transform to the map,
and sends the identical frame to the 3D renderer. Horse size, direction, dust,
markers and roads remain aligned during panning and zooming. Local patrols are
closed Catmull–Rom loops; road travel uses open splines sampled by arc length.
The saddle follows the horse's animated Torso2 bone. The Sunken Citadel patrol
stays on its shore approach.

Three.js is imported only while searching. Animation pauses in background tabs,
GPU resources are released on unmount, and pixel ratio is capped at 1.5. Reduced
motion keeps a static, cropped kingdom view and skips the 3D asset download;
without WebGL the moving map and kingdom markers still work.

Validation: `pnpm test:search-map` checks the 30-second itinerary, local roaming,
non-teleporting phase boundaries, persistent zoom, and responsive framing.

## Image generation

Generated with the built-in imagegen tool. The black tint, routes, scouts and
game text are separate UI layers, not baked into the image.

Final prompt:

> Use case: stylized-concept. Asset type: full-bleed portrait background texture for a mobile medieval strategy game's opponent-search screen. Generate a beautifully detailed DIGITAL FANTASY GAME MAP, portrait 2:3 aspect ratio, top-down antique cartography on warm ochre tan weathered parchment. Rustic ancient hand-drawn dark sepia ink linework, engraved terrain hatching, believable winding roads connecting six mythical locations, rivers with bridges, mountain ranges, forests, coastline, small islands, illustrated medieval castles and ruined towers. Locations: 'CROWNKEEP' in upper center, 'ASHEN SPIRE' in middle left, 'ELDERWOOD' middle right, 'MOONWELL' lower center, 'DRAGONFALL' lower left, 'THE SUNKEN CITADEL' lower right. Elegant tiny hand-lettered place names integrated into cartography, compass rose in lower right, sea serpent in ocean margin. Main connected traversable roads and detailed mythical landmarks across middle and bottom 70 percent. Top 25 percent simpler open terrain for game text overlay added separately. Premium fantasy board-game art, tactile paper fibers, stains, aged edges, crisp fine ink geographical lines, muted earthy colors, warm restrained antique gold. Flat edge-to-edge map surface, no surrounding desk, no perspective angle, no UI, no buttons, no title, no decorative enclosing frame, no horse or riders, no watermark. Do not bake in a black tint or gradient; the application adds this separately.
