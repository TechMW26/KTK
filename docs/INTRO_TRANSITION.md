# Session intro and logo handoff

`public/video/intro.mp4` contains 241 video frames at 540 × 960. Frame 240
(the last frame) was inspected; its emblem occupies approximately x=80..460,
y=210..646. Its wordmark is separate and fades with the video.

`features/game/logic/introTransition.ts` records those source coordinates and
the opaque bounds of the 720 × 720 app emblem (x=51..670, y=14..697). The runtime
matches the centred video object-fit, including portrait cover cropping and
landscape containment. It registers the app asset behind the video at those
coordinates, and remeasures when the screen or home logo changes size.

The video freezes on the final frame and fades out over 820ms. Only after the
fade animation completes is the video hidden and the logo animated for 900ms
into the actual home image's measured DOM rectangle. The background reveals
home during that second phase. The home image stays hidden until the handoff
lands, preventing duplicate emblems or a final-position jump. Resizing during
the handoff retargets the current image without restarting the sequence.

Playback starts with sound enabled and full video volume, and retries muted
automatically if the browser blocks audible autoplay. A touch/click anywhere on
the intro (or a key press) unmutes and resumes it synchronously, preserving its
position. iOS requires this user gesture for audible playback; there is no
tap-to-play gate. The recovery listeners are removed before the fade so a late
gesture cannot restart the soundtrack. Skip seeks to
the final frame and uses the same fade/handoff sequence. Errors and a 20-second
loading watchdog also leave the intro safely. Reduced motion uses minimal
transition durations while retaining fade-before-move ordering.

The `ktk:intro:played` sessionStorage flag is reserved before playback. Returning
home or reloading the same tab does not replay the video; a new tab/app session
can play it again. A document-memory guard covers denied storage.

Safari's media byte-range probe receives `206 Partial Content` both from the
Nitro server and from the PWA's cached full video. Partial downloads never
replace the complete cached media. This keeps playback and seeking available
online and in the installed app's offline shell.
