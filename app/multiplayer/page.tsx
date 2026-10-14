/**
 * Multiplayer entry route.
 *
 * The screen is chosen from the browser's URL, and that URL does not exist on the
 * server — so the server must render NOTHING here rather than guess. The guess it
 * used to make was the room-code fallback, which was flushed as HTML and painted
 * before React took over, producing a sub-second flash of "JOIN A ROOM" between
 * the home screen and matchmaking.
 *
 * `MultiplayerScreen` mounts only once the client has read the URL (see the
 * `mounted` guard inside it). `next/dynamic` with `ssr: false` is deliberately NOT
 * used: this vinext build hydrates from the server payload without ever mounting a
 * `ssr: false` lazy subtree, which left the entire route blank.
 */
export { default } from "./multiplayer-screen";
