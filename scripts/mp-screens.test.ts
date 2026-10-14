/**
 * Multiplayer screen-selection contract.
 *
 * Run:  node --experimental-strip-types scripts/mp-screens.test.ts
 *
 * Pins which screen the multiplayer route renders for every room/game lifecycle
 * state. Every rule here was a real bug at some point:
 *
 *  - A room the MATCHMAKER creates is `status: "waiting"` with one seat, exactly
 *    like a Play-With-Friend host lobby. Testing `status` alone showed the
 *    room-code card to a matchmade host for a moment before the guest arrived.
 *  - `inMatch` used to require `room.status === "playing"`. `markMatchFinished`
 *    retires the room to `finished` when the match is decided, so the board — and
 *    with it the result screen and the rematch button — disappeared the instant a
 *    match ended, leaving the player on a bare veil with no way forward.
 *  - Gating the room code on the entry `?mode=` breaks Create Room, because that
 *    flow is entered from `?mode=friends`.
 *
 * The predicates below mirror `inMatch` / `waiting` / `wantsJoin` in
 * `app/multiplayer/multiplayer-screen.tsx`. That file is a React component, so
 * the rules are pinned here rather than imported.
 */
import { strict as assert } from "node:assert";

/** Minimal room/game shapes — only the fields the screen logic reads. */
interface Room {
  status: "waiting" | "playing" | "finished" | "expired";
  seats: number;
}
interface Game {
  phase: string;
  status: "in-progress" | "finished";
}
interface Case {
  name: string;
  /** `?mode=` this visit was entered with. */
  mode: "" | "challenge" | "friends" | "join";
  room: Room | null;
  game: Game | null;
  seat: 0 | 1 | null;
  /** The hook's "the matchmaker put me in this room" flag. */
  searchOrigin: boolean;
  want: string;
}

const room = (status: Room["status"], seats: number): Room => ({ status, seats });
const game = (phase: string, status: Game["status"]): Game => ({ phase, status });

/** Mirror of the screen decision in multiplayer-screen.tsx. */
function decide(c: Case): string {
  const inMatch =
    !!c.room &&
    c.room.status !== "expired" &&
    c.room.seats >= 2 &&
    c.seat != null &&
    !!c.game;

  const noRoom = !c.room;

  const waiting =
    !!c.room && c.room.status === "waiting" && c.room.seats < 2 && !c.searchOrigin;

  const wantsJoin = c.mode === "join" || (c.mode === "" && noRoom);

  if (inMatch) return "GAME";
  if (waiting) return "ROOM_CODE";
  // (the search screen sits between these two and is not modelled: it is driven
  //  by component state, not by the room/game subscription)
  if (c.searchOrigin) return "VEIL";
  if (wantsJoin) return "JOIN";
  return "NOTHING";
}

const cases: Case[] = [
  {
    name: "searching: no room yet (Challenge)",
    mode: "challenge",
    room: null,
    game: null,
    seat: null,
    searchOrigin: true,
    want: "VEIL",
  },
  {
    name: "Play With Friend: lone host waiting for a friend",
    mode: "friends",
    room: room("waiting", 1),
    game: game("dealer-hide", "in-progress"),
    seat: 0,
    searchOrigin: false,
    want: "ROOM_CODE",
  },
  {
    name: "Join Room: lone host waiting",
    mode: "join",
    room: room("waiting", 1),
    game: game("dealer-hide", "in-progress"),
    seat: 0,
    searchOrigin: false,
    want: "ROOM_CODE",
  },
  {
    name: "matchmade room created, guest not in yet -> NEVER the room code",
    // This is the flash: the matchmaker's room is in the same "waiting" /
    // one-seat state as a friend lobby, but searchOrigin distinguishes them.
    mode: "challenge",
    room: room("waiting", 1),
    game: game("dealer-hide", "in-progress"),
    seat: 0,
    searchOrigin: true,
    want: "VEIL",
  },
  {
    name: "both seated, dealer hiding",
    mode: "challenge",
    room: room("playing", 2),
    game: game("dealer-hide", "in-progress"),
    seat: 0,
    searchOrigin: true,
    want: "GAME",
  },
  {
    name: "guesser guessed -> reveal",
    mode: "challenge",
    room: room("playing", 2),
    game: game("reveal", "in-progress"),
    seat: 1,
    searchOrigin: true,
    want: "GAME",
  },
  {
    name: "level-end",
    mode: "challenge",
    room: room("playing", 2),
    game: game("level-end", "in-progress"),
    seat: 1,
    searchOrigin: true,
    want: "GAME",
  },
  {
    name: "MATCH OVER: room retired to finished -> board must stay (result + rematch)",
    mode: "challenge",
    room: room("finished", 2),
    game: game("match-end", "finished"),
    seat: 1,
    searchOrigin: true,
    want: "GAME",
  },
  {
    name: "match over in a friend room",
    mode: "friends",
    room: room("finished", 2),
    game: game("match-end", "finished"),
    seat: 1,
    searchOrigin: false,
    want: "GAME",
  },
  {
    name: "rematch: room back to playing, fresh game",
    mode: "challenge",
    room: room("playing", 2),
    game: game("dealer-hide", "in-progress"),
    seat: 1,
    searchOrigin: true,
    want: "GAME",
  },
  {
    name: "expired room is not a match and leaks no room code",
    mode: "challenge",
    room: room("expired", 2),
    game: game("match-end", "finished"),
    seat: 1,
    searchOrigin: true,
    want: "VEIL",
  },
  {
    name: "direct visit to /multiplayer falls back to the join screen",
    mode: "",
    room: null,
    game: null,
    seat: null,
    searchOrigin: false,
    want: "JOIN",
  },
  {
    name: "Search Online fallback screen is reachable from home PLAY ONLINE",
    // `?mode=challenge` sets `searching` true at initialisation, so this state is
    // covered by the search branch that sits between ROOM_CODE and VEIL. It is
    // modelled here as "no screen from the room/game logic", i.e. the search
    // branch is what must handle it.
    mode: "challenge",
    room: null,
    game: null,
    seat: null,
    searchOrigin: false,
    want: "NOTHING",
  },
];

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${(err as Error).message}`);
  }
}

console.log("mp-screens.test — which screen each lifecycle state renders");

for (const c of cases) {
  check(c.name, () => {
    assert.equal(decide(c), c.want);
  });
}

// The two invariants that must hold no matter what, stated directly.
check("a matchmade room NEVER renders the room code", () => {
  const statuses: Room["status"][] = ["waiting", "playing"];
  for (const status of statuses) {
    for (const seats of [1, 2]) {
      const got = decide({
        name: "",
        mode: "challenge",
        room: room(status, seats),
        game: seats === 2 ? game("dealer-hide", "in-progress") : null,
        seat: 0,
        searchOrigin: true,
        want: "",
      });
      assert.notEqual(got, "ROOM_CODE", `leaked room code for ${status}/${seats}`);
    }
  }
});

check("a decided match always keeps a screen to act on", () => {
  // Otherwise the player is stranded on a veil with no result and no rematch.
  for (const mode of ["challenge", "friends", "join", ""] as Case["mode"][]) {
    const got = decide({
      name: "",
      mode,
      room: room("finished", 2),
      game: game("match-end", "finished"),
      seat: 1,
      searchOrigin: mode === "challenge",
      want: "",
    });
    assert.equal(got, "GAME", `match-end rendered ${got} for mode "${mode}"`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
